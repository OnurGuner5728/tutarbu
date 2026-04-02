/**
 * Playwright API Client
 * Bypasses Cloudflare/Fastly 403 blocks by executing fetches
 * directly inside a real Chromium browser context.
 */

const { chromium } = require('playwright');

let browser = null;
let page = null;
let isReady = false;
// initBrowser() eş zamanlı çağrılırsa tek bir Promise beklensin — double-launch önlenir
let initPromise = null;

// ─── CACHE ────────────────────────────────────────────────────
const cache = new Map();

const CACHE_TTL = {
  standings: 3600,
  teamPlayers: 3600,
  playerStats: 1800,
  teamLastEvents: 600,
  eventDetail: 300,
  liveEvents: 30,
  refereeStats: 86400,
  managerStats: 86400,
  h2h: 1800,
  odds: 600,
  default: 900,
};

function getCacheKey(path) {
  return `sofascore:${path}`;
}

function getFromCache(path) {
  const key = getCacheKey(path);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(path, data, ttlCategory = 'default') {
  const key = getCacheKey(path);
  const ttl = CACHE_TTL[ttlCategory] || CACHE_TTL.default;
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl * 1000,
    cachedAt: Date.now(),
  });
}

function clearCache() {
  cache.clear();
}

// Periyodik expired cache temizleme — uzun TTL'li girişler (hakem/menajer: 24h)
// her erişimde temizlenmez, bu yüzden 30 dakikada bir taranıp silinir.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
}, 30 * 60 * 1000).unref();

// ─── PLAYWRIGHT CORE ──────────────────────────────────────────
async function initBrowser() {
  // Zaten hazırsa hemen dön
  if (isReady) return;

  // Eş zamanlı çağrılarda hepsi aynı Promise'i beklesin — race condition önlenir
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('[Playwright] Starting Chromium browser...');
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
      });
      page = await context.newPage();

      // Navigate to an empty page on the sofascore domain to bypass origin blocks
      console.log('[Playwright] Navigating to sofascore.com to establish trust...');
      await page.goto('https://www.sofascore.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Wait a bit to ensure cookies/cloudflare challenge is cleared if any
      await page.waitForTimeout(3000);
      isReady = true;
      console.log('[Playwright] Browser ready.');
    } catch (err) {
      // Hata durumunda state'i sıfırla, bir sonraki çağrıda tekrar denensin
      browser = null;
      page = null;
      isReady = false;
      throw err;
    } finally {
      // Promise tamamlandı (başarılı ya da hatalı), bir sonraki çağrı yeniden girebilsin
      initPromise = null;
    }
  })();

  return initPromise;
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    isReady = false;
    initPromise = null;
    console.log('[Playwright] Browser closed.');
  }
}

// ─── PROCESS EXIT HANDLERS ────────────────────────────────────
// Browser'ı process kapanmadan önce düzgün kapat
async function _gracefulShutdown(signal) {
  console.log(`[Playwright] Received ${signal}, closing browser...`);
  await closeBrowser();
  process.exit(0);
}

process.on('SIGTERM', () => _gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => _gracefulShutdown('SIGINT'));
// 'exit' event'i sync çalışır, async kapatma mümkün değildir — SIGTERM/SIGINT yeterli.
// Ancak beklenmedik crash durumunda en azından senkron bir log bırakalım:
process.on('exit', () => {
  if (browser) {
    // Async browser.close() burada çalışmaz ama state temizlenir
    console.warn('[Playwright] Process exiting with browser still open.');
  }
});

// ─── RATE LIMITER ─────────────────────────────────────────────
let lastRequestTime = 0;
const RATE_LIMIT_MS = 200; // Browsers are more trusted, 200ms interval is ok

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

// ─── FETCH METHOD ─────────────────────────────────────────────
const BASE_URL = 'https://api.sofascore.com/api/v1';

// page.evaluate() için maksimum bekleme süresi (ms)
const EVALUATE_TIMEOUT_MS = 30000;

async function executeBrowserFetch(path) {
  await initBrowser();

  // initBrowser başarılı olsa bile page hâlâ null olabilir (crash, context kapanması)
  if (!page) {
    throw new Error('Playwright page is not available after initBrowser');
  }

  const fullUrl = `${BASE_URL}${path}`;

  // page.evaluate() kendi başına timeout'a sahip değil; Promise.race ile sarıyoruz
  const evaluatePromise = page.evaluate(async (url) => {
    try {
      const response = await window.fetch(url, {
        headers: {
          'Accept': '*/*'
        }
      });
      if (response.status === 404) return { status: 404, data: null };
      if (!response.ok) return { status: response.status, error: `HTTP ${response.status}` };
      const json = await response.json();
      return { status: 200, data: json };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }, fullUrl);

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`page.evaluate() timed out after ${EVALUATE_TIMEOUT_MS}ms for ${path}`)), EVALUATE_TIMEOUT_MS)
  );

  const data = await Promise.race([evaluatePromise, timeoutPromise]);

  if (data.status === 200) return data.data;
  if (data.status === 404) return null; // No data exists for this endpoint
  // status 500 (browser-side catch) veya diğer HTTP hataları buraya düşer
  throw new Error(`Browser fetch failed: ${data.error}`);
}

/**
 * Cached and Rate-Limited public fetch function
 */
async function fetchAPI(path, ttlCategory = 'default', skipCache = false) {
  if (!skipCache) {
    const cached = getFromCache(path);
    if (cached !== null) return cached;
  }

  await waitForRateLimit();

  const MAX_RETRIES = 2;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await executeBrowserFetch(path);
      if (data !== null) {
        setCache(path, data, ttlCategory);
      }
      return data;
    } catch (error) {
      if (error.message.includes('403') || error.message.includes('503') || error.message.includes('Failed to fetch')) {
        console.warn(`[Playwright] Rate limited / Blocked on ${path} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), waiting 5s...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      console.error(`[Playwright] Error fetching ${path}: ${error.message}`);
      return null;
    }
  }
  // Tüm retry'lar bitti, hâlâ başarısız — undefined yerine null dön
  console.error(`[Playwright] All retries exhausted for ${path}`);
  return null;
}

async function fetchBatch(requests) {
  const results = new Map();
  // Safe sequential fetch
  for (const { path, ttl } of requests) {
    const data = await fetchAPI(path, ttl || 'default');
    results.set(path, data);
  }
  return results;
}

// ─── EXPORT IDENTICAL API AS SOFASCORE-CLIENT ─────────────────
const api = {
  // Config
  initBrowser,
  closeBrowser,

  // Event (Maç) endpoints
  getEvent: (eventId) => fetchAPI(`/event/${eventId}`, 'eventDetail'),
  getEventStats: (eventId) => fetchAPI(`/event/${eventId}/statistics`, 'eventDetail'),
  getEventIncidents: (eventId) => fetchAPI(`/event/${eventId}/incidents`, 'eventDetail'),
  getEventLineups: (eventId) => fetchAPI(`/event/${eventId}/lineups`, 'eventDetail'),
  getEventShotmap: (eventId) => fetchAPI(`/event/${eventId}/shotmap`, 'eventDetail'),
  getEventGraph: (eventId) => fetchAPI(`/event/${eventId}/graph`, 'eventDetail'),
  getEventH2H: (eventId) => fetchAPI(`/event/${eventId}/h2h`, 'h2h'),
  getEventH2HEvents: (eventId) => fetchAPI(`/event/${eventId}/h2h/events`, 'h2h'),
  getEventOdds: (eventId) => fetchAPI(`/event/${eventId}/odds/1/all`, 'odds'),
  getEventMissingPlayers: (eventId) => fetchAPI(`/event/${eventId}/missing-players`, 'eventDetail'),
  getEventStreaks: (eventId) => fetchAPI(`/event/${eventId}/team-streaks`, 'eventDetail'),
  getEventForm: (eventId) => fetchAPI(`/event/${eventId}/pregame-form`, 'eventDetail'),
  getEventManagers: (eventId) => fetchAPI(`/event/${eventId}/managers`, 'eventDetail'),
  getEventVotes: (eventId) => fetchAPI(`/event/${eventId}/votes`, 'eventDetail'),
  getEventBestPlayers: (eventId) => fetchAPI(`/event/${eventId}/best-players`, 'eventDetail'),
  getEventAvgPositions: (eventId) => fetchAPI(`/event/${eventId}/average-positions`, 'eventDetail'),
  getEventCommentary: (eventId) => fetchAPI(`/event/${eventId}/commentary`, 'eventDetail'),

  // Team endpoints
  getTeam: (teamId) => fetchAPI(`/team/${teamId}`, 'teamPlayers'),
  getTeamPlayers: (teamId) => fetchAPI(`/team/${teamId}/players`, 'teamPlayers'),
  getTeamH2H: (homeTeamId, awayTeamId) => fetchAPI(`/team/${homeTeamId}/head2head/${awayTeamId}`, 'h2h'),
  getTeamLastEvents: (teamId, page = 0) => fetchAPI(`/team/${teamId}/events/last/${page}`, 'teamLastEvents'),
  getTeamNextEvents: (teamId, page = 0) => fetchAPI(`/team/${teamId}/events/next/${page}`, 'teamLastEvents'),
  getTeamSeasonStats: (teamId, tId, sId) => fetchAPI(`/team/${teamId}/unique-tournament/${tId}/season/${sId}/statistics/overall`, 'standings'),
  getTeamTopPlayers: (teamId, tId, sId) => fetchAPI(`/team/${teamId}/unique-tournament/${tId}/season/${sId}/top-players/overall`, 'standings'),

  // Tournament endpoints
  getStandings: (tId, sId, type = 'total') => fetchAPI(`/unique-tournament/${tId}/season/${sId}/standings/${type}`, 'standings'),
  getSeasons: (tId) => fetchAPI(`/unique-tournament/${tId}/seasons`, 'standings'),
  getTournamentTopPlayers: (tId, sId) => fetchAPI(`/unique-tournament/${tId}/season/${sId}/top-players/overall`, 'standings'),

  // Player endpoints
  getPlayer: (playerId) => fetchAPI(`/player/${playerId}`, 'playerStats'),
  getPlayerSeasonStats: (playerId, tId, sId) => fetchAPI(`/player/${playerId}/unique-tournament/${tId}/season/${sId}/statistics/overall`, 'playerStats'),
  getPlayerCharacteristics: (playerId) => fetchAPI(`/player/${playerId}/characteristics`, 'playerStats'),
  getPlayerAttributes: (playerId) => fetchAPI(`/player/${playerId}/attribute-overviews`, 'playerStats'),
  getPlayerLastEvents: (playerId, page = 0) => fetchAPI(`/player/${playerId}/events/last/${page}`, 'playerStats'),

  // Referee & Manager endpoints
  getReferee: (refereeId) => fetchAPI(`/referee/${refereeId}`, 'refereeStats'),
  getRefereeStats: (refereeId) => fetchAPI(`/referee/${refereeId}/statistics/seasons`, 'refereeStats'),
  getManager: (managerId) => fetchAPI(`/manager/${managerId}`, 'managerStats'),
  getManagerCareer: (managerId) => fetchAPI(`/manager/${managerId}/career`, 'managerStats'),

  // Live & Scheduled
  getLiveEvents: () => fetchAPI('/sport/football/events/live', 'liveEvents'),
  getScheduledEvents: (date) => fetchAPI(`/sport/football/scheduled-events/${date}`, 'teamLastEvents'),

  // Utility
  clearCache,
  fetchBatch,
};

module.exports = api;
