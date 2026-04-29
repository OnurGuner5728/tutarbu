/**
 * SofaScore API Client
 * Rate-limited, cached HTTP client for SofaScore REST API.
 * Hiçbir statik/fallback değer içermez — tüm veri API'den gelir.
 */

const https = require('https');

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

/**
 * Cache'i tamamen temizler.
 * @internal — Şu an dışarıdan çağrılmıyor; debug/test senaryolarında kullanım için export edilmiştir.
 */
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

/**
 * Cache istatistiklerini döner: toplam, aktif ve süresi dolmuş girdi sayıları.
 * @internal — Şu an dışarıdan çağrılmıyor; monitoring/debug amacıyla export edilmiştir.
 * @returns {{ total: number, active: number, expired: number }}
 */
function getCacheStats() {
  let active = 0;
  let expired = 0;
  const now = Date.now();
  for (const [, entry] of cache) {
    if (now > entry.expiresAt) expired++;
    else active++;
  }
  return { total: cache.size, active, expired };
}

// ─── RATE LIMITER ─────────────────────────────────────────────
let lastRequestTime = 0;
const RATE_LIMIT_MS = 5000; // 5s aralık (IP ban kaçınma için artırıldı)
let requestCount = 0;

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    const waitTime = RATE_LIMIT_MS - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
  requestCount++;
}

// ─── HTTP CLIENT ──────────────────────────────────────────────
const BASE_URL = 'https://api.sofascore.com/api/v1';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Origin': 'https://www.sofascore.com',
  'Referer': 'https://www.sofascore.com/',
};

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: DEFAULT_HEADERS,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error for ${path}: ${e.message}`));
          }
        } else if (res.statusCode === 404) {
          resolve(null); // Veri yok — fallback yok, null döner
        } else {
          reject(new Error(`HTTP ${res.statusCode} for ${path}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout for ${path}`));
    });
    req.end();
  });
}

// ─── PUBLIC API ───────────────────────────────────────────────
/**
 * Rate-limited ve cached API çağrısı.
 * @param {string} path - API path (ör: /event/12345)
 * @param {string} ttlCategory - Cache TTL kategorisi
 * @param {boolean} skipCache - Cache'i atla
 * @returns {Promise<object|null>}
 */
async function fetchAPI(path, ttlCategory = 'default', skipCache = false) {
  // 1. Cache kontrol
  if (!skipCache) {
    const cached = getFromCache(path);
    if (cached !== null) {
      return cached;
    }
  }

  // 2. Rate limit bekle
  await waitForRateLimit();

  // 3. HTTP isteği
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [15000, 30000, 60000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const data = await httpGet(path);
      if (data !== null) {
        setCache(path, data, ttlCategory);
      }
      return data;
    } catch (error) {
      // 403/503 → rate limit aşıldı
      if ((error.message.includes('403') || error.message.includes('503')) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] || 60000;
        console.warn(`[SofaScore] Rate limited on ${path} (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastRequestTime = Date.now();
        continue;
      }
      // Son deneme veya farklı hata
      if (attempt === MAX_RETRIES) {
        console.error(`[SofaScore] All retries failed for ${path}: ${error.message}`);
        return null;
      }
      console.error(`[SofaScore] Error fetching ${path}: ${error.message}`);
      return null;
    }
  }
}

/**
 * Birden fazla API çağrısını sıralı (rate-limited) şekilde yapar.
 * @param {Array<{path: string, ttl: string}>} requests
 * @returns {Promise<Map<string, object>>}
 * @internal — Şu an data-fetcher veya server tarafından çağrılmıyor; toplu veri çekme senaryoları için export edilmiştir.
 */
async function fetchBatch(requests) {
  const results = new Map();
  for (const { path, ttl } of requests) {
    const data = await fetchAPI(path, ttl || 'default');
    results.set(path, data);
  }
  return results;
}

// ─── CONVENIENCE METHODS ──────────────────────────────────────
const api = {
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
  getEventOddsChanges: (eventId) => fetchAPI(`/event/${eventId}/odds/1/changes`, 'odds'),
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
  getCacheStats,
  fetchBatch,
};

module.exports = api;
