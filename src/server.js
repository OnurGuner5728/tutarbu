const express = require('express');
const cors = require('cors');
const { fetchAllMatchData } = require('./services/data-fetcher');
const { calculateAllMetrics } = require('./engine/metric-calculator');
const { generatePrediction } = require('./engine/prediction-generator');
const { getDynamicBaseline } = require('./engine/dynamic-baseline');
const { METRIC_METADATA } = require('./engine/metric-metadata');
const { computePositionMVBreakdown } = require('./engine/quality-factors');

function createRNG(seed) {
  if (seed == null) return Math.random;
  let s = Number(seed);
  if (isNaN(s)) {
    // String seed to numeric
    s = seed.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
  }
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const app = express();
const PORT = process.env.PORT || 3001;

// Production'da CORS_ORIGIN env variable ile kısıtlanmalı.
// Örnek: CORS_ORIGIN=https://tutarbu.com node server.js
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// 🛡️ Custom Rate Limiting Middleware
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 dakika
const MAX_REQUESTS = 100; // 15 dakikada 100 istek

function rateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const record = rateLimitStore.get(ip);
  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW;
    return next();
  }

  record.count++;
  if (record.count > MAX_REQUESTS) {
    console.warn(`[Security] Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((record.resetAt - now) / 1000)
    });
  }
  
  next();
}

app.use(rateLimitMiddleware);

// Match data cache (5 dakika TTL, max 100 girdi)
const matchDataCache = new Map();
const MATCH_CACHE_TTL = 0; // Disabled to prevent stale workshop data
const MAX_CACHE_SIZE = 100;

function getCachedMatchData(eventId) {
  const entry = matchDataCache.get(eventId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    matchDataCache.delete(eventId);
    return null;
  }
  return entry.data;
}

function setCachedMatchData(eventId, data) {
  // Cache boyutu aşılırsa en eski (ilk) girdiyi sil
  if (matchDataCache.size >= MAX_CACHE_SIZE && !matchDataCache.has(eventId)) {
    const oldestKey = matchDataCache.keys().next().value;
    matchDataCache.delete(oldestKey);
  }

  matchDataCache.set(eventId, {
    data,
    expiresAt: Date.now() + MATCH_CACHE_TTL,
  });
}

// Get Matches by Date
app.get('/api/matches', async (req, res) => {
  const targetDate = req.query.date || new Date().toISOString().split('T')[0];
  try {
    console.log(`[API] Fetching real match list for ${targetDate} via Playwright...`);
    const playwrightClient = require('./services/playwright-client');
    const data = await playwrightClient.getScheduledEvents(targetDate);
    
    if (!data || !Array.isArray(data.events) || data.events.length === 0) {
      console.warn('[API] No events found or API blocked even with Playwright.');
      return res.json([]);
    }

    const matches = data.events.map(ev => {
      const isLive = ev.status.type === 'inprogress';
      const isFinished = ev.status.type === 'finished';
      return {
        id: ev.id,
        homeTeam: ev.homeTeam.shortName || ev.homeTeam.name,
        awayTeam: ev.awayTeam.shortName || ev.awayTeam.name,
        tournament: ev.tournament.name,
        status: ev.status.type,
        time: new Date(ev.startTimestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isLive,
        isFinished,
        homeScore: (isLive || isFinished) ? (ev.homeScore?.current ?? ev.homeScore?.display ?? null) : null,
        awayScore: (isLive || isFinished) ? (ev.awayScore?.current ?? ev.awayScore?.display ?? null) : null,
      };
    });

    res.json(matches);
  } catch (err) {
    console.error(`[API ERROR] Match list fetch failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Main Prediction Endpoint
app.post('/api/predict/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const { modifiedLineup } = req.body || {};

  // Input validation: eventId yalnızca rakamlardan oluşmalı ("123abc" reddedilmeli)
  if (!/^\d+$/.test(eventId)) {
    return res.status(400).json({ error: 'Invalid eventId: must be a positive integer.' });
  }
  const numericEventId = parseInt(eventId, 10);

  // Input validation: modifiedLineup varsa home/away diziler olmalı
  if (modifiedLineup !== undefined && modifiedLineup !== null) {
    if (typeof modifiedLineup !== 'object' || Array.isArray(modifiedLineup)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup: must be an object.' });
    }
    if (modifiedLineup.home !== undefined && modifiedLineup.home !== null && !Array.isArray(modifiedLineup.home)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup.home: must be an array.' });
    }
    if (modifiedLineup.away !== undefined && modifiedLineup.away !== null && !Array.isArray(modifiedLineup.away)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup.away: must be an array.' });
    }
  }

  console.log(`[API] Fetching prediction for ${numericEventId} ${modifiedLineup ? '(Modified)' : ''}...`);

  try {
    // 1. Fetch (cache'den dene, yoksa çek ve kaydet)
    let cachedData = getCachedMatchData(eventId);
    if (!cachedData) {
      cachedData = await fetchAllMatchData(numericEventId);
      setCachedMatchData(eventId, cachedData);
    }

    // 2. Apply Lineup Changes if any.
    // CRITICAL: Cache nesnesini doğrudan mutate etme — deep copy al.
    // Aksi hâlde modifiedLineup cache'i bozar; sonraki isteğe kirlenmiş lineup gider.
    const data = modifiedLineup ? structuredClone(cachedData) : cachedData;
    if (modifiedLineup) {
      if (modifiedLineup.home && data.lineups?.home) data.lineups.home.players = modifiedLineup.home;
      if (modifiedLineup.away && data.lineups?.away) data.lineups.away.players = modifiedLineup.away;
    }

    // 3. Initial Metrics
    const metrics = calculateAllMetrics(data);

    // 4. Baseline & RNG
    const baseline = getDynamicBaseline(data);
    // Lig fizik parametrelerini baseline'a enjekte et — match-simulator ve simulatorEngine tarafından kullanılır
    baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
    baseline.leaguePointDensity   = metrics.meta?.leaguePointDensity   ?? null;
    baseline.medianGoalRate       = metrics.meta?.medianGoalRate       ?? null;
    baseline.leagueTeamCount      = metrics.meta?.leagueTeamCount      ?? null;
    baseline.ptsCV                = metrics.meta?.ptsCV                ?? null;
    baseline.normMinRatio         = metrics.meta?.normMinRatio         ?? null;
    baseline.normMaxRatio         = metrics.meta?.normMaxRatio         ?? null;

    // Mevki Bazlı Piyasa Değeri Kalite Düzeltmesi (PVKD) — MC simülasyonu için
    // match-simulator.js ve advanced-derived.js aynı quality-factors.js modülünü kullanır.
    // Breakdown baseline'a eklenir; alpha + QF hesabı match-simulator'da tekrar yapılır
    // (simulation her çalışmada güncel baseline parametrelerine ihtiyaç duyar).
    baseline.homeMVBreakdown = computePositionMVBreakdown(data.homePlayers);
    baseline.awayMVBreakdown = computePositionMVBreakdown(data.awayPlayers);
    const rng = createRNG(req.query.seed);

    // 5. Generate Report
    const prediction = generatePrediction(metrics, data, baseline, metrics.metricAudit, rng);

    // Phase 1 Observation: Debug Payload
    if (req.query.debug === '1') {
      prediction._debug = {
        providerAudit: {
          total: (data._apiLog || []).length,
          failed: (data._apiLog || []).filter(l => !l.success).length,
          providers: (data._apiLog || []).map(l => ({
            provider: l.endpoint,
            status: l.status || (l.success ? 'fulfilled' : 'rejected'),
            elapsedMs: l.elapsedMs || 0,
            isCritical: l.isCritical || false
          }))
        },
        metricAudit: metrics.metricAudit
      };
    }

    prediction.leagueBaseline = baseline;
    
    // Enrich traces with human readable metadata
    const enrichedTraces = {};
    if (metrics.leagueAvgTraces) {
      Object.entries(metrics.leagueAvgTraces).forEach(([id, trace]) => {
        const meta = METRIC_METADATA[id];
        enrichedTraces[id] = {
          name: meta?.name || id,
          description: meta?.description || 'Dinamik hesaplanmış lig ortalaması.',
          role: meta?.simulationRole?.[0] || 'Genel simülasyon dengesi',
          trace: trace
        };
      });
    }

    prediction.metadata = {
      ...(prediction.metadata || {}),
      dynamicLeagueAvgs: metrics.dynamicLeagueAvgs,
      leagueAvgTraces: enrichedTraces,
      dynamicHomeAdvantage: metrics.dynamicHomeAdvantage
    };
    res.json(prediction);
  } catch (err) {
    console.error(`[API ERROR] predict/${eventId}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error. Check server logs for details.' });
  }
});

// Workshop Update Endpoint (Modified Lineup)
app.post('/api/workshop/:eventId', async (req, res) => {
  const { eventId } = req.params;
  const { modifiedLineup } = req.body || {};

  // Input validation: eventId yalnızca rakamlardan oluşmalı ("123abc" reddedilmeli)
  if (!/^\d+$/.test(eventId)) {
    return res.status(400).json({ error: 'Invalid eventId: must be a positive integer.' });
  }
  const numericEventId = parseInt(eventId, 10);

  // Input validation: modifiedLineup varsa home/away null veya array olmalı
  if (modifiedLineup != null) {
    if (typeof modifiedLineup !== 'object' || Array.isArray(modifiedLineup)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup: must be an object.' });
    }
    if (modifiedLineup.home != null && !Array.isArray(modifiedLineup.home)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup.home: must be an array.' });
    }
    if (modifiedLineup.away != null && !Array.isArray(modifiedLineup.away)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup.away: must be an array.' });
    }
  }

  try {
    let cachedData = getCachedMatchData(eventId);
    if (!cachedData) {
      cachedData = await fetchAllMatchData(numericEventId);
      setCachedMatchData(eventId, cachedData);
    }

    // CRITICAL: Cache nesnesini doğrudan mutate etme — deep copy al.
    // Workshop her çağrıda farklı bir lineup denemesi yapar; cache temiz kalmalı.
    const data = structuredClone(cachedData);

    if (modifiedLineup) {
      const { fetchPlayerStatsForPlayers } = require('./services/data-fetcher');

      for (const side of ['home', 'away']) {
        if (!modifiedLineup[side]) continue;

        const newPlayers = modifiedLineup[side];
        const statsKey = side === 'home' ? 'homePlayerStats' : 'awayPlayerStats';

        // 1. Lineup'ı güncelle
        if (data.lineups?.[side]) {
          data.lineups[side].players = newPlayers;
        }

        // 2. Yeni lineup'daki her oyuncunun substitute/isReserve bayrağını playerStats'a yansıt
        //    Bu olmadan calculatePlayerMetrics orijinal bayraklarla çalışır → yanlış gruplar
        const flagMap = new Map(newPlayers.map(p => [
          p.player?.id,
          { substitute: p.substitute || false, isReserve: p.isReserve || false },
        ]));

        data[statsKey] = (data[statsKey] || []).map(ps => {
          const flags = flagMap.get(ps.playerId);
          if (!flags) return ps;
          return { ...ps, substitute: flags.substitute, isReserve: flags.isReserve };
        });

        // 3. Yeni lineup'da istatistiği olmayan oyuncuları bul (rezerv kadrodan eklenenler)
        const existingIds = new Set((data[statsKey] || []).map(ps => ps.playerId));
        const missingPlayers = newPlayers.filter(
          p => p.player?.id && !existingIds.has(p.player.id)
        );

        if (missingPlayers.length > 0) {
          console.log(`[Workshop] ${side}: ${missingPlayers.length} yeni oyuncu için istatistik fetch ediliyor...`);
          const newStats = await fetchPlayerStatsForPlayers(
            missingPlayers,
            data.tournamentId,
            data.seasonId
          );
          // Yeni oyuncuları mevcut stats listesine ekle
          data[statsKey] = [...(data[statsKey] || []), ...newStats];
        }
      }
    }

    const metrics = calculateAllMetrics(data);
    const baseline = getDynamicBaseline(data);
    const rng = createRNG(req.query.seed);
    const prediction = generatePrediction(metrics, data, baseline, metrics.metricAudit, rng);

    // Phase 1 Observation: Debug Payload
    if (req.query.debug === '1') {
      prediction._debug = {
        providerAudit: {
          total: (data._apiLog || []).length,
          failed: (data._apiLog || []).filter(l => !l.success).length,
          providers: (data._apiLog || []).map(l => ({
            provider: l.endpoint,
            status: l.status || (l.success ? 'fulfilled' : 'rejected'),
            elapsedMs: l.elapsedMs || 0,
            isCritical: l.isCritical || false
          }))
        },
        metricAudit: metrics.metricAudit
      };
    }

    prediction.leagueBaseline = baseline;

    // Enrich traces with human readable metadata
    const enrichedTraces = {};
    if (metrics.leagueAvgTraces) {
      Object.entries(metrics.leagueAvgTraces).forEach(([id, trace]) => {
        const meta = METRIC_METADATA[id];
        enrichedTraces[id] = {
          name: meta?.name || id,
          description: meta?.description || 'Dinamik hesaplanmış lig ortalaması.',
          role: meta?.simulationRole?.[0] || 'Genel simülasyon dengesi',
          trace: trace
        };
      });
    }

    prediction.metadata = {
      ...(prediction.metadata || {}),
      dynamicLeagueAvgs: metrics.dynamicLeagueAvgs,
      leagueAvgTraces: enrichedTraces,
      dynamicHomeAdvantage: metrics.dynamicHomeAdvantage
    };
    res.json(prediction);
  } catch (err) {
    console.error(`[API ERROR] workshop/${eventId}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error. Check server logs for details.' });
  }
});

// GET /api/metrics/:eventId — Returns flat metric values + metadata for MetricsSelector UI
app.get('/api/metrics/:eventId', async (req, res) => {
  const { eventId } = req.params;
  if (!/^\d+$/.test(eventId)) {
    return res.status(400).json({ error: 'Invalid eventId: must be a positive integer.' });
  }
  const numericEventId = parseInt(eventId, 10);
  try {
    const { METRIC_METADATA } = require('./engine/metric-metadata');

    let cachedData = getCachedMatchData(eventId);
    if (!cachedData) {
      cachedData = await fetchAllMatchData(numericEventId);
      setCachedMatchData(eventId, cachedData);
    }

    const metrics = calculateAllMetrics(cachedData);

    // Flatten each side's nested metric groups into a single { M001: value, ... } map
    // Regex M\d{3}[a-z]? ile M118b, M025b, M025c, M134b, M134c gibi alt-metrikler de dahil edilir.
    function flattenSide(side) {
      const result = {};
      const groups = Object.values(side);
      for (const group of groups) {
        if (group && typeof group === 'object') {
          for (const [key, val] of Object.entries(group)) {
            if (/^M\d{3}[a-z]?$/i.test(key)) result[key] = val;
          }
        }
      }
      return result;
    }

    const flatHome = flattenSide(metrics.home);
    const flatAway = flattenSide(metrics.away);

    // Also merge shared metrics into both sides
    const sharedFlat = {};
    const sharedGroups = Object.values(metrics.shared || {});
    for (const group of sharedGroups) {
      if (group && typeof group === 'object') {
        for (const [key, val] of Object.entries(group)) {
          if (/^M\d{3}$/.test(key)) sharedFlat[key] = val;
        }
      }
    }
    Object.assign(flatHome, sharedFlat);
    Object.assign(flatAway, sharedFlat);

    // Enrich with metadata
    function enrichWithMeta(flatMetrics) {
      const enriched = {};
      for (const [id, value] of Object.entries(flatMetrics)) {
        const meta = METRIC_METADATA[id];
        if (!meta) continue;
        enriched[id] = {
          value,
          name: meta.name,
          category: meta.category,
          unit: meta.unit,
          description: meta.description,
          leagueAvg: meta.leagueAvg,
          simulationRole: meta.simulationRole,
          weight: meta.weight,
        };
      }
      return enriched;
    }

    res.json({ home: enrichWithMeta(flatHome), away: enrichWithMeta(flatAway) });
  } catch (err) {
    console.error(`[API ERROR] metrics/${eventId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/simulate/:eventId
app.post('/api/simulate/:eventId', async (req, res) => {
  const { eventId } = req.params;
  if (!/^\d+$/.test(eventId)) {
    return res.status(400).json({ error: 'Invalid eventId: must be a positive integer.' });
  }
  const numericEventId = parseInt(eventId, 10);
  try {
    const { selectedMetrics = [], runs = 1 } = req.body;
    const { simulateMatch } = require('./engine/match-simulator');

    let cachedData = getCachedMatchData(eventId);
    if (!cachedData) {
      cachedData = await fetchAllMatchData(numericEventId);
      setCachedMatchData(eventId, cachedData);
    }

    const metrics = calculateAllMetrics(cachedData);

    function flattenSide(side) {
      const result = {};
      const groups = Object.values(side);
      for (const group of groups) {
        if (group && typeof group === 'object') {
          for (const [key, val] of Object.entries(group)) {
            if (/^M\d{3}[a-z]?$/i.test(key)) result[key] = val;
          }
        }
      }
      return result;
    }

    const sharedFlat = {};
    const sharedGroups = Object.values(metrics.shared || {});
    for (const group of sharedGroups) {
      if (group && typeof group === 'object') {
        for (const [key, val] of Object.entries(group)) {
          if (/^M\d{3}[a-z]?$/i.test(key)) sharedFlat[key] = val;
        }
      }
    }

    const homeMetrics = Object.assign(flattenSide(metrics.home), sharedFlat);
    const awayMetrics = Object.assign(flattenSide(metrics.away), sharedFlat);

    const baseline = getDynamicBaseline(cachedData);
    const rng = createRNG(req.body.seed || req.query.seed);

    // Peer-enhanced averages: dynamicAvgs'da bulunmayan metrikler için
    // iki takımın değer ortalaması kullanılır — sabit 1.0 yerine gerçek veri.
    const allSimIds = new Set(
      [...Object.keys(homeMetrics), ...Object.keys(awayMetrics)]
        .filter(k => /^M\d{3}[a-z]?$/i.test(k))
    );
    const peerAvgs = { ...(metrics.dynamicLeagueAvgs || {}) };
    for (const id of allSimIds) {
      if (peerAvgs[id] != null) continue;
      const hv = homeMetrics[id];
      const av = awayMetrics[id];
      const hvOk = hv != null && isFinite(hv);
      const avOk = av != null && isFinite(av);
      const avg = hvOk && avOk ? (hv + av) / 2 : hvOk ? hv : avOk ? av : null;
      if (avg != null && avg > 0) peerAvgs[id] = avg;
    }

    const result = simulateMatch({
      homeMetrics,
      awayMetrics,
      selectedMetrics: new Set(selectedMetrics),
      runs,
      lineups: cachedData.lineups,
      weatherMetrics: cachedData.weatherMetrics,
      baseline,
      audit: metrics.metricAudit,
      rng,
      dynamicAvgs: peerAvgs,
      homeAdvantage: metrics.dynamicHomeAdvantage,
      dynamicTimeWindows: metrics.dynamicTimeWindows,
    });

    // Attach engine data for client-side real-time simulation (single run only)
    if (runs === 1) {
      const { computeWeatherMultipliers } = require('./services/weather-service');
      const { computeProbBases } = require('./engine/match-simulator');
      const { computeAlpha, computeQualityFactors } = require('./engine/quality-factors');
      result.lineups = cachedData.lineups;
      result.weatherMult = computeWeatherMultipliers(cachedData.weatherMetrics || {});
      const sel = new Set(selectedMetrics);
      // Mevki bazlı kalite faktörlerini hesapla — probBases için
      const _pbAlpha = computeAlpha(baseline.leagueGoalVolatility, baseline.leagueAvgGoals);
      const _pbQF = computeQualityFactors(
        baseline.homeMVBreakdown ?? { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 },
        baseline.awayMVBreakdown ?? { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 },
        _pbAlpha
      );
      result.probBases = {
        home: computeProbBases(homeMetrics, sel, result.units?.home || {}, baseline, metrics.metricAudit, _pbQF.home),
        away: computeProbBases(awayMetrics, sel, result.units?.away || {}, baseline, metrics.metricAudit, _pbQF.away),
      };
      result.dynamicTimeWindows = metrics.dynamicTimeWindows || null;
    }

    // Phase 1 Observation: Debug Payload
    if (req.query.debug === '1') {
      result._debug = {
        providerAudit: {
          total: (cachedData._apiLog || []).length,
          failed: (cachedData._apiLog || []).filter(l => !l.success).length,
          providers: (cachedData._apiLog || []).map(l => ({
            provider: l.endpoint,
            status: l.status || (l.success ? 'fulfilled' : 'rejected'),
            elapsedMs: l.elapsedMs || 0,
            isCritical: l.isCritical || false
          }))
        },
        metricAudit: metrics.metricAudit
      };
    }

    result.leagueBaseline = baseline;
    
    // Enrich traces for UI transparency (same as predict endpoint)
    const enrichedTraces = {};
    if (metrics.leagueAvgTraces) {
      Object.entries(metrics.leagueAvgTraces).forEach(([id, trace]) => {
        const meta = METRIC_METADATA[id];
        enrichedTraces[id] = {
          name: meta?.name || id,
          description: meta?.description || 'Dinamik hesaplanmış lig ortalaması.',
          role: meta?.simulationRole?.[0] || 'Genel simülasyon dengesi',
          trace: trace
        };
      });
    }

    result.metadata = {
      ...(metrics.meta || {}),
      dynamicLeagueAvgs: metrics.dynamicLeagueAvgs,
      leagueAvgTraces: enrichedTraces,
      dynamicHomeAdvantage: metrics.dynamicHomeAdvantage
    };

    res.json(result);
  } catch (err) {
    console.error(`[API ERROR] simulate/${eventId}: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Team Events — "Load more" pagination for Form & H2H sections
app.get('/api/team-events/:teamId/:page', async (req, res) => {
  const { teamId, page } = req.params;
  if (!/^\d+$/.test(teamId) || !/^\d+$/.test(page)) {
    return res.status(400).json({ error: 'Invalid teamId or page.' });
  }
  try {
    const api = require('./services/playwright-client');
    const result = await api.getTeamLastEvents(parseInt(teamId, 10), parseInt(page, 10));
    const events = (result?.events || [])
      .filter(e => e.status?.type === 'finished')
      .map(e => ({
        ...e,
        startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
      }));
    res.json({ events, page: parseInt(page, 10), teamId: parseInt(teamId, 10) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Match Events — incidents + stats for a past match (on-demand, click to expand)
app.get('/api/match-events/:eventId', async (req, res) => {
  const { eventId } = req.params;
  if (!/^\d+$/.test(eventId)) {
    return res.status(400).json({ error: 'Invalid eventId' });
  }
  try {
    const api = require('./services/playwright-client');
    const id = parseInt(eventId, 10);
    const [incidentsData, statsData] = await Promise.all([
      api.getEventIncidents(id),
      api.getEventStats(id),
    ]);

    // Flatten nested stats: statistics[].groups[].statisticsItems[]
    // Only use "ALL" period (full match) if available, else first period
    const statsArray = statsData?.statistics || [];
    const allPeriod = statsArray.find(p => p.period === 'ALL') || statsArray[0] || null;
    const flatStats = [];
    if (allPeriod?.groups) {
      for (const group of allPeriod.groups) {
        for (const item of (group.statisticsItems || [])) {
          flatStats.push({
            name: item.name,
            homeValue: item.homeValue ?? item.home ?? null,
            awayValue: item.awayValue ?? item.away ?? null,
          });
        }
      }
    }

    res.json({ incidents: incidentsData?.incidents || [], stats: flatStats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Match Debug Endpoint
app.get('/api/match-debug/:eventId', async (req, res) => {
  const { eventId } = req.params;
  if (!/^\d+$/.test(eventId)) {
    return res.status(400).json({ error: 'Invalid eventId: must be a positive integer.' });
  }
  try {
    const data = await fetchAllMatchData(parseInt(eventId, 10));
    res.json({
      eventId,
      homeTeam: data.event?.event?.homeTeam?.name,
      awayTeam: data.event?.event?.awayTeam?.name,
      apiLog: data._apiLog || [],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cacheSize: matchDataCache.size,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Football Prediction Engine API running on port ${PORT} (Network Accessible)`);
  if (corsOrigin === '*') {
    console.warn('[SERVER] WARNING: CORS is open to all origins. Set CORS_ORIGIN env variable in production.');
  }
});
