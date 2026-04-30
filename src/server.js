const express = require('express');
const cors = require('cors');
const { fetchAllMatchData, fetchPlayerStatsForPlayers } = require('./services/data-fetcher');
const { calculateAllMetrics } = require('./engine/metric-calculator');
const { generatePrediction } = require('./engine/prediction-generator');
const { getDynamicBaseline } = require('./engine/dynamic-baseline');
const { METRIC_METADATA } = require('./engine/metric-metadata');
const { computePositionMVBreakdown } = require('./engine/quality-factors');
const playwrightClient = require('./services/playwright-client');

function createRNG(seed) {
  if (seed == null) return Math.random;
  let s = Number(seed);
  if (isNaN(s)) {
    // String seed to numeric
    s = seed.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
  }
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const app = express();
const PORT = process.env.PORT || 3001;

// Helper Function for Shared API Logic
function enrichMatchResponse(prediction, metrics, baseline, data, reqQuery) {
  if (reqQuery.debug === '1') {
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

  // ── Lineup Player Stats Enrichment ──
  // Frontend VisualPitch, calculateDynamicRating(p.player) çağırır.
  // Lineup player objeleri iki eksik veri içerir:
  //   1. statistics/seasonStats → playerStats'tan gelir
  //   2. proposedMarketValue → squad (homePlayers/awayPlayers) datasından gelir
  // İkisini de enjekte ediyoruz — böylece rating doğru hesaplanır.
  const _enrichLineupFull = (playersArr, statsArr, squadData) => {
    if (!playersArr) return playersArr;
    // Squad'dan hızlı lookup map: playerId → player obje
    const squadMap = new Map();
    if (squadData?.players) {
      for (const sp of squadData.players) {
        if (sp.player?.id) squadMap.set(sp.player.id, sp.player);
      }
    }
    return playersArr.map(p => {
      if (!p.player) return p;
      const pid = p.player.id;
      let enriched = { ...p.player };
      let changed = false;

      // 1. İstatistikler (playerStats'tan)
      if (!enriched.statistics && statsArr) {
        const st = statsArr.find(s => s.playerId === pid);
        if (st?.seasonStats?.statistics) {
          enriched.statistics = st.seasonStats.statistics;
          enriched.seasonStats = st.seasonStats;
          changed = true;
        }
      }

      // 2. Piyasa değeri (squad'dan)
      if (!enriched.proposedMarketValue && squadMap.has(pid)) {
        const sq = squadMap.get(pid);
        if (sq.proposedMarketValue) {
          enriched.proposedMarketValue = sq.proposedMarketValue;
          changed = true;
        }
      }

      return changed ? { ...p, player: enriched } : p;
    });
  };

  if (prediction.lineups?.home?.players) {
    prediction.lineups.home.players = _enrichLineupFull(
      prediction.lineups.home.players,
      data.homePlayerStats || [],
      data.homePlayers
    );
  }
  if (prediction.lineups?.away?.players) {
    prediction.lineups.away.players = _enrichLineupFull(
      prediction.lineups.away.players,
      data.awayPlayerStats || [],
      data.awayPlayers
    );
  }

  return prediction;
}

// Production'da CORS_ORIGIN env variable ile kısıtlanmalı.
// Örnek: CORS_ORIGIN=https://tutarbu.com node server.js
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10mb' }));

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

// 🛡️ Rate Limit Temizlik Interval'i (Memory Leak Fix)
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of rateLimitStore) {
    if (now > rec.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, 15 * 60 * 1000);

app.use(rateLimitMiddleware);

// Match data cache (5 dakika TTL, max 100 girdi)
const matchDataCache = new Map();
const MATCH_CACHE_TTL = 5 * 60 * 1000; // 5 dakika
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

    // ── Lineup Quality Ratio (LQR) — Poisson + Sim kadro etkisi ──
    // Tüm endpoint'lerde tutarlı: calculateAllMetrics'ten ÖNCE data'ya,
    // getDynamicBaseline'dan SONRA baseline'a enjekte edilir.
    const { calculateDynamicRating: _cdr } = require('./engine/player-rating-utils');
    const _avgR = (players) => {
      if (!players?.length) return null;
      const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
      if (!starters.length) return null;
      return starters.reduce((s, p) => s + _cdr(p.player || p, p.assignedPosition || null), 0) / starters.length;
    };
    if (modifiedLineup) {
      const origH = _avgR(cachedData.lineups?.home?.players || []);
      const origA = _avgR(cachedData.lineups?.away?.players || []);
      const modH = _avgR(data.lineups?.home?.players || []);
      const modA = _avgR(data.lineups?.away?.players || []);
      data._homeLineupQualityRatio = (origH && modH) ? modH / origH : 1.0;
      data._awayLineupQualityRatio = (origA && modA) ? modA / origA : 1.0;
      console.log(`[API PREDICT] LQR pre-metrics: home=${data._homeLineupQualityRatio.toFixed(3)}, away=${data._awayLineupQualityRatio.toFixed(3)}`);

      // ZQM pre-metrics: bölge oranlarını da data'ya enjekte et → calculateAllMetrics → allMetrics
      const { computeZoneQualityRatios: _preZqm } = require('./engine/lineup-impact');
      const { calculateDynamicRating: _preCdr } = require('./engine/player-rating-utils');
      data._homeZoneQualityRatios = _preZqm(
        cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], _preCdr
      );
      data._awayZoneQualityRatios = _preZqm(
        cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], _preCdr
      );
    }

    // Dinamik blok ağırlıkları: ORİJİNAL kadrodan hesaplanır — modifiedLineup olsun olmasın
    // advanced-derived.js bu veriyi allMetrics üzerinden okur
    const { computeDynamicBlockWeights: _preDbw } = require('./engine/lineup-impact');
    data._homeDynamicBlockWeights = _preDbw(cachedData.lineups?.home?.players || []);
    data._awayDynamicBlockWeights = _preDbw(cachedData.lineups?.away?.players || []);

    // 3. Initial Metrics
    const metrics = calculateAllMetrics(data);

    // 4. Baseline & RNG
    const baseline = getDynamicBaseline(data);
    // Lig fizik parametrelerini baseline'a enjekte et — match-simulator ve simulatorEngine tarafından kullanılır
    baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
    baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
    baseline.medianGoalRate = metrics.meta?.medianGoalRate ?? null;
    baseline.leagueTeamCount = metrics.meta?.leagueTeamCount ?? null;
    baseline.ptsCV = metrics.meta?.ptsCV ?? null;
    baseline.normMinRatio = metrics.meta?.normMinRatio ?? null;
    baseline.normMaxRatio = metrics.meta?.normMaxRatio ?? null;

    // Mevki Bazlı Piyasa Değeri Kalite Düzeltmesi (PVKD) — MC simülasyonu için
    // Workshop lineup varsa, assignedPosition'ları içeren lineup oyuncuları kullanılır.
    // Böylece kullanıcının mevki değişiklikleri PVKD'ye de yansır.
    const pvkdHomeSrc = (modifiedLineup?.home && data.lineups?.home)
      ? { players: data.lineups.home.players } : data.homePlayers;
    const pvkdAwaySrc = (modifiedLineup?.away && data.lineups?.away)
      ? { players: data.lineups.away.players } : data.awayPlayers;
    baseline.homeMVBreakdown = computePositionMVBreakdown(pvkdHomeSrc);
    baseline.awayMVBreakdown = computePositionMVBreakdown(pvkdAwaySrc);

    // LQR: baseline'a da enjekte et (prediction-generator comparison hesabında kullanılır)
    baseline.homeLineupQualityRatio = data._homeLineupQualityRatio ?? 1.0;
    baseline.awayLineupQualityRatio = data._awayLineupQualityRatio ?? 1.0;

    // GK Pozisyonel Bütünlük Kontrolü (predict endpoint)
    if (modifiedLineup) {
      const _checkGKIntegrity = (players) => {
        if (!players?.length) return true;
        const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
        const gkSlotPlayer = starters.find(p => {
          const assigned = (p.assignedPosition || '').toUpperCase()[0];
          const native = (p.player?.position || '').toUpperCase()[0];
          return assigned === 'G' || (!assigned && native === 'G');
        });
        if (!gkSlotPlayer) return false;
        const nativePos = (gkSlotPlayer.player?.position || '').toUpperCase()[0];
        return nativePos === 'G';
      };
      if (modifiedLineup.home && !_checkGKIntegrity(data.lineups?.home?.players)) {
        baseline.homeLineupQualityRatio *= 0.70;
      }
      if (modifiedLineup.away && !_checkGKIntegrity(data.lineups?.away?.players)) {
        baseline.awayLineupQualityRatio *= 0.70;
      }
    }

    // ── Bölgesel Kadro Etkisi (ZQM) ──────────────────────────────────────
    // Her mevki bölgesinin (G/D/M/F) kalite oranını hesapla ve baseline'a enjekte et.
    // Behavioral unit'ler bu oranlarla modifiye edilecek (advanced-derived + match-simulator).
    const { computeZoneQualityRatios, computeDynamicBlockWeights } = require('./engine/lineup-impact');
    const { calculateDynamicRating: _zqmCdr } = require('./engine/player-rating-utils');
    // Dinamik blok ağırlıkları: ORİJİNAL kadrodan hesaplanır (oyuncu profil bazlı)
    baseline.homeDynamicBlockWeights = computeDynamicBlockWeights(cachedData.lineups?.home?.players || []);
    baseline.awayDynamicBlockWeights = computeDynamicBlockWeights(cachedData.lineups?.away?.players || []);
    if (modifiedLineup) {
      baseline.homeZoneQualityRatios = computeZoneQualityRatios(
        cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], _zqmCdr
      );
      baseline.awayZoneQualityRatios = computeZoneQualityRatios(
        cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], _zqmCdr
      );
      console.log(`[API PREDICT] ZQM home: G=${baseline.homeZoneQualityRatios.G.toFixed(3)} D=${baseline.homeZoneQualityRatios.D.toFixed(3)} M=${baseline.homeZoneQualityRatios.M.toFixed(3)} F=${baseline.homeZoneQualityRatios.F.toFixed(3)}`);
      console.log(`[API PREDICT] ZQM away: G=${baseline.awayZoneQualityRatios.G.toFixed(3)} D=${baseline.awayZoneQualityRatios.D.toFixed(3)} M=${baseline.awayZoneQualityRatios.M.toFixed(3)} F=${baseline.awayZoneQualityRatios.F.toFixed(3)}`);
    }

    const rng = createRNG(req.query.seed);

    // 5. Generate Report
    let prediction = generatePrediction(metrics, data, baseline, metrics.metricAudit, rng);

    // Common response enrichment (DRY Refactor)
    prediction = enrichMatchResponse(prediction, metrics, baseline, data, req.query);

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

    // Ensure lineups are fully enriched before calculating metrics
    const enrichPlayers = (playersArr, statsArr) => {
      if (!playersArr || !statsArr) return playersArr;
      return playersArr.map(p => {
        if (!p.player) return p;
        const st = statsArr.find(s => s.playerId === p.player.id || s.playerId === p.player.playerId);
        if (st) {
          return {
            ...p,
            player: {
              ...p.player,
              seasonStats: st.seasonStats || null,
              statistics: st.seasonStats?.statistics || null,
              // Dinamik bölge ağırlıkları (HBKE) için attribute + characteristics enjeksiyonu
              attributes: st.attributes || null,
              characteristics: st.characteristics || null,
            }
          };
        }
        return p;
      });
    };

    if (data.lineups?.home?.players) data.lineups.home.players = enrichPlayers(data.lineups.home.players, data.homePlayerStats);
    if (data.lineups?.away?.players) data.lineups.away.players = enrichPlayers(data.lineups.away.players, data.awayPlayerStats);

    // ── Lineup Quality Ratio (LQR) — Poisson lambda'ya kadro etkisi ──
    // calculateAllMetrics'ten ÖNCE hesaplanmalı — advanced-derived.js lambda'yı düzeltecek.
    if (modifiedLineup) {
      const { calculateDynamicRating: _cdr } = require('./engine/player-rating-utils');
      const _avgR = (players) => {
        if (!players?.length) return null;
        const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
        if (!starters.length) return null;
        return starters.reduce((s, p) => s + _cdr(p.player || p, p.assignedPosition || null), 0) / starters.length;
      };
      const origH = _avgR(cachedData.lineups?.home?.players || []);
      const origA = _avgR(cachedData.lineups?.away?.players || []);
      const modH = _avgR(data.lineups?.home?.players || []);
      const modA = _avgR(data.lineups?.away?.players || []);
      data._homeLineupQualityRatio = (origH && modH) ? modH / origH : 1.0;
      data._awayLineupQualityRatio = (origA && modA) ? modA / origA : 1.0;
      console.log(`[API WORKSHOP] LQR pre-metrics: home=${data._homeLineupQualityRatio.toFixed(3)}, away=${data._awayLineupQualityRatio.toFixed(3)}`);

      // ZQM pre-metrics: bölge oranlarını data'ya enjekte et → calculateAllMetrics → allMetrics
      const { computeZoneQualityRatios: _wsPreZqm } = require('./engine/lineup-impact');
      data._homeZoneQualityRatios = _wsPreZqm(
        cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], _cdr
      );
      data._awayZoneQualityRatios = _wsPreZqm(
        cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], _cdr
      );
    }

    // Dinamik blok ağırlıkları: ORİJİNAL kadrodan
    const { computeDynamicBlockWeights: _wsPreDbw } = require('./engine/lineup-impact');
    data._homeDynamicBlockWeights = _wsPreDbw(cachedData.lineups?.home?.players || []);
    data._awayDynamicBlockWeights = _wsPreDbw(cachedData.lineups?.away?.players || []);

    const metrics = calculateAllMetrics(data);
    const baseline = getDynamicBaseline(data);

    // Inject league physical parameters into baseline
    baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
    baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
    baseline.medianGoalRate = metrics.meta?.medianGoalRate ?? null;
    baseline.leagueTeamCount = metrics.meta?.leagueTeamCount ?? null;
    baseline.ptsCV = metrics.meta?.ptsCV ?? null;
    baseline.normMinRatio = metrics.meta?.normMinRatio ?? null;
    baseline.normMaxRatio = metrics.meta?.normMaxRatio ?? null;

    // Inject Position-based Market Value Breakdown (PVKD)
    // Workshop lineup'ında assignedPosition değiştirilmiş olabilir — lineup oyuncuları kullan
    const { computePositionMVBreakdown } = require('./engine/quality-factors');
    const pvkdHomeSrc = (modifiedLineup?.home && data.lineups?.home)
      ? { players: data.lineups.home.players } : (data.homePlayers || []);
    const pvkdAwaySrc = (modifiedLineup?.away && data.lineups?.away)
      ? { players: data.lineups.away.players } : (data.awayPlayers || []);
    baseline.homeMVBreakdown = computePositionMVBreakdown(pvkdHomeSrc);
    baseline.awayMVBreakdown = computePositionMVBreakdown(pvkdAwaySrc);

    console.log(`[API WORKSHOP] PVKD Enjeksiyonu başarılı. home: ${baseline.homeMVBreakdown?.total}, away: ${baseline.awayMVBreakdown?.total}`);

    // ── Lineup Quality Ratio (LQR) — Poisson lambda düzeltmesi ──
    const { calculateDynamicRating } = require('./engine/player-rating-utils');
    const _computeAvgRating = (players) => {
      if (!players || !players.length) return null;
      const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
      if (starters.length === 0) return null;
      const ratings = starters.map(p => calculateDynamicRating(p.player || p, p.assignedPosition || null));
      return ratings.reduce((a, b) => a + b, 0) / ratings.length;
    };
    const origHomeAvg = _computeAvgRating(cachedData.lineups?.home?.players || []);
    const origAwayAvg = _computeAvgRating(cachedData.lineups?.away?.players || []);
    const modHomeAvg = modifiedLineup ? _computeAvgRating(data.lineups?.home?.players || []) : origHomeAvg;
    const modAwayAvg = modifiedLineup ? _computeAvgRating(data.lineups?.away?.players || []) : origAwayAvg;
    baseline.homeLineupQualityRatio = (origHomeAvg && modHomeAvg) ? modHomeAvg / origHomeAvg : 1.0;
    baseline.awayLineupQualityRatio = (origAwayAvg && modAwayAvg) ? modAwayAvg / origAwayAvg : 1.0;

    // ── GK Pozisyonel Bütünlük Kontrolü ──
    // Kaleci pozisyonunda gerçek kaleci olmayan bir oyuncu varsa, takım istatistiklerinden
    // gelen GK metrikleri (kurtarış oranı, alan hakimiyeti) geçersiz olur.
    // Bu durumda LQR'e ağır bir çarpan uygulanır — sadece rating ortalaması değil,
    // tüm savunma/kaleci birimleri de çöker.
    if (modifiedLineup) {
      const _checkGKIntegrity = (players) => {
        if (!players?.length) return true; // veri yoksa kontrol etme
        const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
        // Kaleci slotundaki oyuncuyu bul (assignedPosition === 'G' veya doğal pozisyonu G ve assign yok)
        const gkSlotPlayer = starters.find(p => {
          const assigned = (p.assignedPosition || '').toUpperCase()[0];
          const native = (p.player?.position || '').toUpperCase()[0];
          return assigned === 'G' || (!assigned && native === 'G');
        });
        if (!gkSlotPlayer) return false; // Kaleci yok! (hiç G slotu yok)
        // Kaleci slotundaki oyuncunun doğal mevkisi G mi?
        const nativePos = (gkSlotPlayer.player?.position || '').toUpperCase()[0];
        return nativePos === 'G';
      };

      if (modifiedLineup.home && !_checkGKIntegrity(data.lineups?.home?.players)) {
        baseline.homeLineupQualityRatio *= 0.70; // %30 ek düşüş — kalecisiz takım
        console.log(`[API WORKSHOP] ⚠️ Ev sahibi kaleci yok/yanlış mevki! LQR ek ceza: ${baseline.homeLineupQualityRatio.toFixed(3)}`);
      }
      if (modifiedLineup.away && !_checkGKIntegrity(data.lineups?.away?.players)) {
        baseline.awayLineupQualityRatio *= 0.70; // %30 ek düşüş — kalecisiz takım
        console.log(`[API WORKSHOP] ⚠️ Deplasman kaleci yok/yanlış mevki! LQR ek ceza: ${baseline.awayLineupQualityRatio.toFixed(3)}`);
      }

      console.log(`[API WORKSHOP] LQR: home=${baseline.homeLineupQualityRatio.toFixed(3)}, away=${baseline.awayLineupQualityRatio.toFixed(3)}`);
    }

    // ── Bölgesel Kadro Etkisi (ZQM) ──────────────────────────────────────
    const { computeZoneQualityRatios: _wsZqm, computeDynamicBlockWeights: _wsDyn } = require('./engine/lineup-impact');
    const { calculateDynamicRating: _wsCdr } = require('./engine/player-rating-utils');
    // Dinamik blok ağırlıkları: ORİJİNAL kadrodan (oyuncu profil bazlı)
    baseline.homeDynamicBlockWeights = _wsDyn(cachedData.lineups?.home?.players || []);
    baseline.awayDynamicBlockWeights = _wsDyn(cachedData.lineups?.away?.players || []);
    if (modifiedLineup) {
      baseline.homeZoneQualityRatios = _wsZqm(
        cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], _wsCdr
      );
      baseline.awayZoneQualityRatios = _wsZqm(
        cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], _wsCdr
      );
      console.log(`[API WORKSHOP] ZQM home: G=${baseline.homeZoneQualityRatios.G.toFixed(3)} D=${baseline.homeZoneQualityRatios.D.toFixed(3)} M=${baseline.homeZoneQualityRatios.M.toFixed(3)} F=${baseline.homeZoneQualityRatios.F.toFixed(3)}`);
      console.log(`[API WORKSHOP] ZQM away: G=${baseline.awayZoneQualityRatios.G.toFixed(3)} D=${baseline.awayZoneQualityRatios.D.toFixed(3)} M=${baseline.awayZoneQualityRatios.M.toFixed(3)} F=${baseline.awayZoneQualityRatios.F.toFixed(3)}`);
    }

    const rng = createRNG(req.query.seed);
    let prediction = generatePrediction(metrics, data, baseline, metrics.metricAudit, rng);

    // Common response enrichment (DRY Refactor)
    prediction = enrichMatchResponse(prediction, metrics, baseline, data, req.query);

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
    const { selectedMetrics = [], runs = 1, modifiedLineup } = req.body;
    const { simulateMatch } = require('./engine/match-simulator');

    let cachedData = getCachedMatchData(eventId);
    if (!cachedData) {
      cachedData = await fetchAllMatchData(numericEventId);
      setCachedMatchData(eventId, cachedData);
    }

    // Modified lineup varsa cache'i korumak için deep clone al
    const data = modifiedLineup ? structuredClone(cachedData) : cachedData;
    if (modifiedLineup) {
      if (modifiedLineup.home && data.lineups?.home) data.lineups.home.players = modifiedLineup.home;
      if (modifiedLineup.away && data.lineups?.away) data.lineups.away.players = modifiedLineup.away;
      console.log(`[API SIMULATE] Workshop lineup uygulandı.`);

      // LQR: calculateAllMetrics'ten ÖNCE — advanced-derived.js lambda'yı düzeltecek
      const { calculateDynamicRating: _cdr } = require('./engine/player-rating-utils');
      const _avgR = (players) => {
        if (!players?.length) return null;
        const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
        if (!starters.length) return null;
        return starters.reduce((s, p) => s + _cdr(p.player || p, p.assignedPosition || null), 0) / starters.length;
      };
      const origH = _avgR(cachedData.lineups?.home?.players || []);
      const origA = _avgR(cachedData.lineups?.away?.players || []);
      const modH = _avgR(data.lineups?.home?.players || []);
      const modA = _avgR(data.lineups?.away?.players || []);
      data._homeLineupQualityRatio = (origH && modH) ? modH / origH : 1.0;
      data._awayLineupQualityRatio = (origA && modA) ? modA / origA : 1.0;
      console.log(`[API SIMULATE] LQR pre-metrics: home=${data._homeLineupQualityRatio.toFixed(3)}, away=${data._awayLineupQualityRatio.toFixed(3)}`);

      // ZQM pre-metrics
      const { computeZoneQualityRatios: _simPreZqm } = require('./engine/lineup-impact');
      data._homeZoneQualityRatios = _simPreZqm(
        cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], _cdr
      );
      data._awayZoneQualityRatios = _simPreZqm(
        cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], _cdr
      );
    }

    // Dinamik blok ağırlıkları: ORİJİNAL kadrodan
    const { computeDynamicBlockWeights: _simPreDbw } = require('./engine/lineup-impact');
    data._homeDynamicBlockWeights = _simPreDbw(cachedData.lineups?.home?.players || []);
    data._awayDynamicBlockWeights = _simPreDbw(cachedData.lineups?.away?.players || []);

    const metrics = calculateAllMetrics(data);

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

    const baseline = getDynamicBaseline(data);

    // Inject league physical parameters into baseline for match-simulator
    baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
    baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
    baseline.medianGoalRate = metrics.meta?.medianGoalRate ?? null;
    baseline.leagueTeamCount = metrics.meta?.leagueTeamCount ?? null;
    baseline.ptsCV = metrics.meta?.ptsCV ?? null;
    baseline.normMinRatio = metrics.meta?.normMinRatio ?? null;
    baseline.normMaxRatio = metrics.meta?.normMaxRatio ?? null;

    // Inject Position-based Market Value Breakdown (PVKD) for Monte Carlo simulation
    // Workshop lineup varsa, assignedPosition'ları içeren lineup oyuncuları kullanılır.
    const { computePositionMVBreakdown } = require('./engine/quality-factors');
    const pvkdHomeSrc = (modifiedLineup?.home && data.lineups?.home)
      ? { players: data.lineups.home.players } : data.homePlayers;
    const pvkdAwaySrc = (modifiedLineup?.away && data.lineups?.away)
      ? { players: data.lineups.away.players } : data.awayPlayers;
    baseline.homeMVBreakdown = computePositionMVBreakdown(pvkdHomeSrc);
    baseline.awayMVBreakdown = computePositionMVBreakdown(pvkdAwaySrc);

    console.log(`[API SIMULATE] PVKD Enjeksiyonu başarılı. home: ${baseline.homeMVBreakdown?.total}, away: ${baseline.awayMVBreakdown?.total}`);

    // ── Lineup Quality Ratio (LQR) ──────────────────────────────────────────
    // Workshop'ta kadro değiştiğinde, davranış üniteleri takım tarihçesinden
    // hesaplanır ve değişmez. LQR, kadro kalitesindeki değişimi simülasyona
    // yansıtmak için kullanılır:
    //   ratio = modifiedAvgRating / originalAvgRating
    //   ratio < 1.0 → kadro zayıfladı → metrikler düşürülür
    //   ratio > 1.0 → kadro güçlendi → metrikler artırılır
    const { calculateDynamicRating } = require('./engine/player-rating-utils');

    const _computeAvgRating = (players) => {
      if (!players || !players.length) return null;
      const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
      if (starters.length === 0) return null;
      const ratings = starters.map(p => {
        const pd = p.player || p;
        return calculateDynamicRating(pd, p.assignedPosition || null);
      });
      return ratings.reduce((a, b) => a + b, 0) / ratings.length;
    };

    // Orijinal lineup ratingi (cache'ten)
    const origHomePlayers = cachedData.lineups?.home?.players || [];
    const origAwayPlayers = cachedData.lineups?.away?.players || [];
    const origHomeAvg = _computeAvgRating(origHomePlayers);
    const origAwayAvg = _computeAvgRating(origAwayPlayers);

    // Modifiye lineup ratingi
    const modHomeAvg = modifiedLineup ? _computeAvgRating(data.lineups?.home?.players || []) : origHomeAvg;
    const modAwayAvg = modifiedLineup ? _computeAvgRating(data.lineups?.away?.players || []) : origAwayAvg;

    // Lineup Quality Ratio
    baseline.homeLineupQualityRatio = (origHomeAvg && modHomeAvg) ? modHomeAvg / origHomeAvg : 1.0;
    baseline.awayLineupQualityRatio = (origAwayAvg && modAwayAvg) ? modAwayAvg / origAwayAvg : 1.0;

    if (modifiedLineup) {
      // GK Pozisyonel Bütünlük Kontrolü (simulate endpoint)
      const _checkGKIntegrity = (players) => {
        if (!players?.length) return true;
        const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
        const gkSlotPlayer = starters.find(p => {
          const assigned = (p.assignedPosition || '').toUpperCase()[0];
          const native = (p.player?.position || '').toUpperCase()[0];
          return assigned === 'G' || (!assigned && native === 'G');
        });
        if (!gkSlotPlayer) return false;
        const nativePos = (gkSlotPlayer.player?.position || '').toUpperCase()[0];
        return nativePos === 'G';
      };
      if (modifiedLineup.home && !_checkGKIntegrity(data.lineups?.home?.players)) {
        baseline.homeLineupQualityRatio *= 0.70;
        console.log(`[API SIMULATE] ⚠️ Ev sahibi kaleci yok/yanlış mevki! LQR ek ceza: ${baseline.homeLineupQualityRatio.toFixed(3)}`);
      }
      if (modifiedLineup.away && !_checkGKIntegrity(data.lineups?.away?.players)) {
        baseline.awayLineupQualityRatio *= 0.70;
        console.log(`[API SIMULATE] ⚠️ Deplasman kaleci yok/yanlış mevki! LQR ek ceza: ${baseline.awayLineupQualityRatio.toFixed(3)}`);
      }

      console.log(`[API SIMULATE] LQR: home=${baseline.homeLineupQualityRatio.toFixed(3)} (${origHomeAvg?.toFixed(1)}→${modHomeAvg?.toFixed(1)}), away=${baseline.awayLineupQualityRatio.toFixed(3)} (${origAwayAvg?.toFixed(1)}→${modAwayAvg?.toFixed(1)})`);
    }

    // ── Bölgesel Kadro Etkisi (ZQM) ──────────────────────────────────────
    const { computeZoneQualityRatios: _simZqm, computeDynamicBlockWeights: _simDyn } = require('./engine/lineup-impact');
    const { calculateDynamicRating: _simZqmCdr } = require('./engine/player-rating-utils');
    // Dinamik blok ağırlıkları: ORİJİNAL kadrodan (oyuncu profil bazlı)
    baseline.homeDynamicBlockWeights = _simDyn(cachedData.lineups?.home?.players || []);
    baseline.awayDynamicBlockWeights = _simDyn(cachedData.lineups?.away?.players || []);
    if (modifiedLineup) {
      baseline.homeZoneQualityRatios = _simZqm(
        cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], _simZqmCdr
      );
      baseline.awayZoneQualityRatios = _simZqm(
        cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], _simZqmCdr
      );
      console.log(`[API SIMULATE] ZQM home: G=${baseline.homeZoneQualityRatios.G.toFixed(3)} D=${baseline.homeZoneQualityRatios.D.toFixed(3)} M=${baseline.homeZoneQualityRatios.M.toFixed(3)} F=${baseline.homeZoneQualityRatios.F.toFixed(3)}`);
      console.log(`[API SIMULATE] ZQM away: G=${baseline.awayZoneQualityRatios.G.toFixed(3)} D=${baseline.awayZoneQualityRatios.D.toFixed(3)} M=${baseline.awayZoneQualityRatios.M.toFixed(3)} F=${baseline.awayZoneQualityRatios.F.toFixed(3)}`);
    }

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
      lineups: data.lineups,
      weatherMetrics: data.weatherMetrics,
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
      const baselineParams = result.baselineParams || {};
      result.weatherMult = computeWeatherMultipliers(cachedData.weatherMetrics || {}, baselineParams.leagueGoalVolatility);
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

// ── Backtest Endpoint (SSE streaming) ─────────────────────────────────────
// GET /api/backtest?date=YYYY-MM-DD&endDate=YYYY-MM-DD&limit=1-9999&tournament=all|top|custom
// Gerçek server pipeline: fetchAllMatchData → metrics → baseline → generatePrediction
// SSE stream: her maç anlık gönderilir
const TOP_TOURNAMENT_IDS_BT = new Set([17, 8, 23, 35, 34, 7, 679, 52, 325, 37, 132, 23651]);
const MAX_BACKTEST_DAYS_RANGE = 60;
const BACKTEST_INTER_DELAY_MS = 4000;

function buildTournamentFilter(tournamentParam) {
  if (tournamentParam === 'top') return (id) => TOP_TOURNAMENT_IDS_BT.has(id);
  if (tournamentParam === 'all') return () => true;
  // Custom: comma-separated tournament IDs
  const ids = new Set(tournamentParam.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n)));
  return ids.size > 0 ? (id) => ids.has(id) : () => true;
}

app.get('/api/backtest', async (req, res) => {
  const date = req.query.date || new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const endDate = req.query.endDate || date;
  const rawLimit = parseInt(req.query.limit, 10);
  const matchLimit = (!isNaN(rawLimit) && rawLimit >= 1) ? Math.min(rawLimit, 9999) : 10;
  const tournamentFilter = req.query.tournament || 'top';
  const includeUnplayed = req.query.includeUnplayed === 'true';
  const minConfidence = parseFloat(req.query.minConfidence) || 0;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Client bağlantı kopmasını izle — EventSource auto-reconnect yeni backtest başlatır
  // aborted flag ile pipeline loop'u durduruyoruz
  let aborted = false;
  req.on('close', () => { aborted = true; });

  const send = (evt, data) => {
    if (aborted) return; // Client ayrıldıysa yazmaya çalışma
    try { res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  };
  const progress = (msg) => send('progress', { message: msg });

  try {
    progress(`Backtest: ${date}${endDate !== date ? ' → ' + endDate : ''} | limit: ${matchLimit} | turnuva: ${tournamentFilter}${includeUnplayed ? ' | +oynanmamış' : ''}`);


    // ── 1. Maç toplama (date range + dedup + unplayed support) ────────────
    const filterFn = buildTournamentFilter(tournamentFilter);
    let collected = [];
    const processedIds = new Set();     // eventId bazlı dedup
    const compositeKeys = new Set();    // homeTeamId-awayTeamId-date bazlı güçlendirilmiş dedup

    // Tarih aralığı: date → endDate (ileriye doğru)
    const startMs = new Date(date).getTime();
    const endMs = new Date(endDate).getTime();
    const totalDaySpan = Math.ceil(Math.abs(endMs - startMs) / 86400000) + 1;
    const maxDays = Math.min(MAX_BACKTEST_DAYS_RANGE, totalDaySpan);

    for (let dayIdx = 0; dayIdx < maxDays && collected.length < matchLimit; dayIdx++) {
      const cursorMs = startMs + dayIdx * 86400000;
      if (cursorMs > endMs) break;
      const cursor = new Date(cursorMs).toISOString().split('T')[0];

      let evResp;
      try { evResp = await playwrightClient.getScheduledEvents(cursor); } catch (_) { continue; }
      if (!evResp?.events?.length) continue;

      // Kabul edilen maç durumları
      // includeUnplayed=true → SADECE oynanmamış maçlar (finished atlanır)
      // includeUnplayed=false → SADECE oynanmış maçlar (default backtest davranışı)
      const acceptedStatuses = includeUnplayed
        ? new Set(['notstarted', 'inprogress'])
        : new Set(['finished']);

      let dayMatches = evResp.events.filter(e => {
        if (!acceptedStatuses.has(e.status?.type)) return false;
        if (!e.tournament?.uniqueTournament?.id) return false;
        // Oynanmış maçlar için skor kontrolü
        if (e.status?.type === 'finished' && (e.homeScore?.current == null || e.awayScore?.current == null)) return false;
        return true;
      });

      // Turnuva filtresi
      dayMatches = dayMatches.filter(e => filterFn(e.tournament.uniqueTournament.id));

      // Çift dedup: eventId + composite key (homeTeamId-awayTeamId-date)
      dayMatches = dayMatches.filter(e => {
        const eid = String(e.id);
        const ck = `${e.homeTeam?.id}-${e.awayTeam?.id}-${cursor}`;
        if (processedIds.has(eid) || compositeKeys.has(ck)) return false;
        processedIds.add(eid);
        compositeKeys.add(ck);
        return true;
      });

      if (dayMatches.length > 0) {
        collected.push(...dayMatches);
        const finCount = dayMatches.filter(e => e.status?.type === 'finished').length;
        const upCount = dayMatches.length - finCount;
        progress(`${cursor}: ${finCount} oynanmış${upCount > 0 ? ` + ${upCount} oynanmamış` : ''} (+${collected.length})`);
      }
    }

    const allMatches = collected.slice(0, matchLimit);
    const finishedCount = allMatches.filter(e => e.status?.type === 'finished').length;
    const upcomingCount = allMatches.length - finishedCount;
    progress(`${allMatches.length} unique maç işlenecek (${finishedCount} oynanmış${upcomingCount > 0 ? `, ${upcomingCount} oynanmamış` : ''}).`);

    // ── 2. Pipeline ───────────────────────────────────────────────────────
    const results = [];
    let hits1X2 = 0, hitsOU25 = 0, hitsBTTS = 0, hitsScore = 0;
    let hitsHT1X2 = 0, hitsHTScore = 0, htTotal = 0;
    let totalBrier = 0, totalLogLoss = 0;
    let poissonHits = 0, simHits = 0, poissonTotal = 0, simTotal = 0;
    const tournamentStats = {}; // { [tournamentId]: { name, total, hits1X2, hitsOU25, hitsBTTS } }
    let totalDrawActual = 0, totalDrawPredicted = 0;

    for (let mi = 0; mi < allMatches.length; mi++) {
      if (aborted) break; // Client bağlantısı koptu, devam etme
      const match = allMatches[mi];
      if (mi > 0) await new Promise(r => setTimeout(r, BACKTEST_INTER_DELAY_MS));
      if (aborted) break; // Bekleme süresinde de kopmuş olabilir


      const isFinished = match.status?.type === 'finished';
      const matchLabel = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
      const statusIcon = isFinished ? '🏁' : '⏳';
      progress(`${statusIcon} (${mi + 1}/${allMatches.length}) ${matchLabel}`);

      try {
        const data = await fetchAllMatchData(match.id);

        // ── Pipeline eşitleme: /api/predict ile aynı sırada ──────────
        // Dynamic Block Weights: ORİJİNAL kadrodan hesaplanır
        const { computeDynamicBlockWeights: _btDbw } = require('./engine/lineup-impact');
        data._homeDynamicBlockWeights = _btDbw(data.lineups?.home?.players || []);
        data._awayDynamicBlockWeights = _btDbw(data.lineups?.away?.players || []);

        const metrics = calculateAllMetrics(data);
        const baseline = getDynamicBaseline(data);
        baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
        baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
        baseline.medianGoalRate = metrics.meta?.medianGoalRate ?? null;
        baseline.leagueTeamCount = metrics.meta?.leagueTeamCount ?? null;
        baseline.ptsCV = metrics.meta?.ptsCV ?? null;
        baseline.normMinRatio = metrics.meta?.normMinRatio ?? null;
        baseline.normMaxRatio = metrics.meta?.normMaxRatio ?? null;
        baseline.homeMVBreakdown = computePositionMVBreakdown(data.homePlayers || []);
        baseline.awayMVBreakdown = computePositionMVBreakdown(data.awayPlayers || []);

        // LQR ve ZQM: backtest'te modified lineup yok → identity
        baseline.homeLineupQualityRatio = 1.0;
        baseline.awayLineupQualityRatio = 1.0;
        baseline.homeDynamicBlockWeights = _btDbw(data.lineups?.home?.players || []);
        baseline.awayDynamicBlockWeights = _btDbw(data.lineups?.away?.players || []);

        const rng = createRNG(match.id); // Deterministik RNG: aynı maç = aynı simülasyon
        const report = generatePrediction(metrics, data, baseline, metrics.metricAudit, rng);

        // ── Gerçek FT skoru (oynanmış maçlarda) ──
        const realHS = isFinished ? match.homeScore.current : null;
        const realAS = isFinished ? match.awayScore.current : null;
        const realTotal = (realHS != null && realAS != null) ? realHS + realAS : null;
        const realResult = (realHS != null && realAS != null) ? (realHS > realAS ? '1' : realHS < realAS ? '2' : 'X') : null;
        const realOU25 = realTotal != null ? (realTotal > 2.5 ? 'Over' : 'Under') : null;
        const realBTTS = (realHS != null && realAS != null) ? ((realHS > 0 && realAS > 0) ? 'Yes' : 'No') : null;
        if (realResult === 'X') totalDrawActual++;

        // ── Gerçek HT skoru (period1 varsa) ──
        const realHTHS = match.homeScore?.period1 ?? null;
        const realHTAS = match.awayScore?.period1 ?? null;
        const realHTScore = (realHTHS != null && realHTAS != null) ? `${realHTHS}-${realHTAS}` : null;
        const realHTResult = realHTScore
          ? (realHTHS > realHTAS ? '1' : realHTHS < realHTAS ? '2' : 'X')
          : null;

        // ── Hibrit tahmin ──
        const pHome = report.result.homeWin || 0;
        const pDraw = report.result.draw || 0;
        const pAway = report.result.awayWin || 0;
        const probBasedResult = pHome >= pDraw && pHome >= pAway ? '1' : pAway >= pHome && pAway >= pDraw ? '2' : 'X';
        if (probBasedResult === 'X') totalDrawPredicted++;

        const simDist = report.simulationInsights?.distribution || {};
        const pOU25 = simDist.over25 || report.goals?.over25 || 0;
        const predictedOU25 = pOU25 > (report.goals?.over25DynamicThreshold ?? 50.0) ? 'Over' : 'Under';
        const pBTTS = simDist.btts || report.goals?.btts || 0;
        const predictedBTTS = pBTTS > (report.goals?.bttsDynamicThreshold ?? 50.0) ? 'Yes' : 'No';

        const predictedScore = report.score?.predicted || 'N/A';
        const simTopScore = simDist.topScore || report.firstHalfSimulation?.topScore || null;

        // Skor tahmininden 1X2 türet — tabloda skor ile uyumlu olsun
        const predicted = (() => {
          if (predictedScore && predictedScore !== 'N/A') {
            const parts = predictedScore.split('-').map(Number);
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              return parts[0] > parts[1] ? '1' : parts[0] < parts[1] ? '2' : 'X';
            }
          }
          return probBasedResult; // fallback: olasılık bazlı
        })();

        // ── HT tahmin ──
        const htReport = report.firstHalf;
        const simHTDist = report.firstHalfSimulation;
        const htPredResult = htReport?.htResult ?? null;
        const htPredScore = (() => {
          if (htReport?.htLambdaHome != null && htReport?.htLambdaAway != null) {
            return `${Math.round(htReport.htLambdaHome)}-${Math.round(htReport.htLambdaAway)}`;
          }
          if (htReport?.expectedHomeGoals != null) {
            return `${Math.round(htReport.expectedHomeGoals)}-${Math.round(htReport.expectedAwayGoals)}`;
          }
          return null;
        })();
        const simHTTopScore = simHTDist?.topScore ?? null;

        // ── Hit hesapları (sadece oynanmış maçlar) ──
        const hit1X2 = isFinished ? (predicted === realResult) : null;
        const hitOU25 = isFinished ? (predictedOU25 === realOU25) : null;
        const hitBTTS = isFinished ? (predictedBTTS === realBTTS) : null;
        const hitScore = isFinished ? (predictedScore === `${realHS}-${realAS}`) : null;
        const hitHTResult = (isFinished && htPredResult && realHTResult) ? htPredResult === realHTResult : null;
        const hitHTScore = (isFinished && htPredScore && realHTScore) ? htPredScore === realHTScore : null;

        if (hit1X2 === true) hits1X2++;
        if (hitOU25 === true) hitsOU25++;
        if (hitBTTS === true) hitsBTTS++;
        if (hitScore === true) hitsScore++;
        if (hitHTResult !== null) { htTotal++; if (hitHTResult) hitsHT1X2++; }
        if (hitHTScore === true) hitsHTScore++;

        // ── Brier + LogLoss (sadece oynanmış maçlar) ──
        let brierScore = null, logLoss = null;
        if (isFinished) {
          const eps = 1e-10;
          const pH_n = pHome / 100, pD_n = pDraw / 100, pA_n = pAway / 100;
          const oH = realResult === '1' ? 1 : 0, oD = realResult === 'X' ? 1 : 0, oA = realResult === '2' ? 1 : 0;
          brierScore = (pH_n - oH) ** 2 + (pD_n - oD) ** 2 + (pA_n - oA) ** 2;
          logLoss = -(oH * Math.log(pH_n + eps) + oD * Math.log(pD_n + eps) + oA * Math.log(pA_n + eps));
          totalBrier += brierScore;
          totalLogLoss += logLoss;
        }

        // ── Motor karşılaştırması ──
        const poissonRes = report.poissonResult;
        const simRes = report.simulationResult;
        if (poissonRes?.predicted) { poissonTotal++; if (poissonRes.predicted === realResult) poissonHits++; }
        if (simRes?.predicted) { simTotal++; if (simRes.predicted === realResult) simHits++; }

        // ── Value bet göstergesi (model vs market) ──
        const marketHome = metrics.shared?.contextual?.M131 ?? null;
        const marketAway = metrics.shared?.contextual?.M133 ?? null;
        const modelEdge = (() => {
          if (marketHome == null || marketAway == null) return null;
          // Favori yönde model olasılığı - piyasa olasılığı
          if (predicted === '1') return +(pHome - marketHome).toFixed(1);
          if (predicted === '2') return +(pAway - marketAway).toFixed(1);
          return null;
        })();
        const isValueBet = modelEdge != null && modelEdge > 5;

        // ── Confidence filtresi (minConfidence) ──
        const maxProb = Math.max(pHome, pDraw, pAway);
        if (minConfidence > 0 && maxProb < minConfidence) {
          progress(`⏭ ${matchLabel} → confidence ${maxProb.toFixed(0)}% < ${minConfidence}% (atlandı)`);
          continue;
        }

        // ── Turnuva istatistikleri ──
        const tid = match.tournament?.uniqueTournament?.id;
        const tname = match.tournament?.name || 'Unknown';
        if (tid) {
          if (!tournamentStats[tid]) tournamentStats[tid] = { name: tname, total: 0, hits1X2: 0, hitsOU25: 0, hitsBTTS: 0, hitsScore: 0, totalBrier: 0 };
          const ts = tournamentStats[tid];
          ts.total++; if (hit1X2) ts.hits1X2++; if (hitOU25) ts.hitsOU25++;
          if (hitBTTS) ts.hitsBTTS++; if (hitScore) ts.hitsScore++;
          ts.totalBrier += brierScore;
        }

        const coverageCtrl = report.coverageControl || {};
        const entry = {
          matchId: match.id,
          matchStatus: isFinished ? 'finished' : (match.status?.type || 'unknown'),
          match: matchLabel,
          homeTeam: match.homeTeam?.name,
          awayTeam: match.awayTeam?.name,
          tournament: tname, tournamentId: tid || null,
          matchDate: match.startTimestamp ? new Date(match.startTimestamp * 1000).toISOString().split('T')[0] : date,
          matchTime: match.startTimestamp ? new Date(match.startTimestamp * 1000).toISOString().split('T')[1]?.slice(0,5) : null,
          // FT gerçek (null for unplayed)
          actual: isFinished ? `${realHS}-${realAS}` : null,
          actualResult: realResult, actualOU25: realOU25, actualBTTS: realBTTS,
          // FT tahmin
          predicted: predictedScore, predictedResult: predicted, predictedOU25, predictedBTTS,
          simTopScore,
          probHome: pHome, probDraw: pDraw, probAway: pAway,
          probOU25: +pOU25.toFixed(1), probBTTS: +pBTTS.toFixed(1),
          // HT gerçek
          actualHT: realHTScore, actualHTResult: realHTResult,
          // HT tahmin
          predictedHT: htPredScore, predictedHTResult: htPredResult,
          simHTTopScore,
          htHomeWinProb: htReport?.htHomeWin ?? null,
          htDrawProb: htReport?.htDraw ?? null,
          htAwayWinProb: htReport?.htAwayWin ?? null,
          simHTHomeWin: simHTDist?.homeWin ?? null,
          simHTDraw: simHTDist?.draw ?? null,
          simHTAwayWin: simHTDist?.awayWin ?? null,
          // HT/FT 9-class
          htft: report.htft ? { top1: report.htft.top1, top3: report.htft.top3 } : null,
          // Hit'ler
          hit1X2, hitOU25, hitBTTS, hitScore, hitHTResult, hitHTScore,
          // Kalibrasyon
          brierScore: brierScore != null ? +brierScore.toFixed(4) : null,
          logLoss: logLoss != null ? +logLoss.toFixed(4) : null,
          // Güven
          confidenceTier: coverageCtrl.confidenceTier || 'UNKNOWN',
          maxProbability: coverageCtrl.maxProbability || 0,
          isHighConfidence: coverageCtrl.isHighConfidence || false,
          // Motor karşılaştırması
          poisson: poissonRes ? { predicted: poissonRes.predicted, homeWin: poissonRes.homeWin, draw: poissonRes.draw, awayWin: poissonRes.awayWin, topScore: poissonRes.topScore, hit: poissonRes.predicted === realResult, lambdaHome: poissonRes.lambdaHome, lambdaAway: poissonRes.lambdaAway } : null,
          simulation: simRes ? { predicted: simRes.predicted, homeWin: simRes.homeWin, draw: simRes.draw, awayWin: simRes.awayWin, hit: simRes.predicted === realResult } : null,
          // Ek metrikler
          restDays: { home: baseline.homeRestDays ?? null, away: baseline.awayRestDays ?? null },
          isValueBet, modelEdge,
          marketHome, marketAway,
        };
        results.push(entry);
        send('match', entry);

        // Log'da tahmin özeti göster
        const _confTier = coverageCtrl.confidenceTier || '?';
        const _maxP = Math.max(pHome, pDraw, pAway).toFixed(0);
        if (isFinished) {
          const hitIcon = hit1X2 ? '✅' : '❌';
          progress(`  → ${hitIcon} Tahmin: ${predictedScore} (${predicted}) | Gerçek: ${realHS}-${realAS} (${realResult}) | ${_confTier} ${_maxP}%`);
        } else {
          progress(`  → 🔮 Tahmin: ${predictedScore} (${predicted}) | Sim: ${simTopScore || '—'} | İY: ${htPredScore || '—'} | ${_confTier} ${_maxP}%`);
        }

      } catch (err) {
        send('error', { matchId: match.id, match: matchLabel, error: err.message });
      }
    }

    // ── 3. Özet ──────────────────────────────────────────────────────────
    const total = results.length;
    const finishedTotal = results.filter(r => r.matchStatus === 'finished').length;
    const upcomingTotal = results.filter(r => r.matchStatus !== 'finished').length;
    if (total === 0) { send('summary', { error: 'Hiç maç işlenemedi.' }); res.end(); return; }

    const tierStats = (tier) => {
      const t = results.filter(r => r.confidenceTier === tier);
      if (!t.length) return null;
      return {
        count: t.length,
        accuracy1X2: +((t.filter(r => r.hit1X2).length / t.length) * 100).toFixed(1),
        accuracyOU25: +((t.filter(r => r.hitOU25).length / t.length) * 100).toFixed(1),
        accuracyBTTS: +((t.filter(r => r.hitBTTS).length / t.length) * 100).toFixed(1),
        accuracyScore: +((t.filter(r => r.hitScore).length / t.length) * 100).toFixed(1),
        avgBrier: +(t.reduce((s, r) => s + r.brierScore, 0) / t.length).toFixed(4),
      };
    };

    // Turnuva özeti
    const tournamentSummary = Object.entries(tournamentStats).map(([tid, ts]) => ({
      tournamentId: +tid, name: ts.name, total: ts.total,
      accuracy1X2: +((ts.hits1X2 / ts.total) * 100).toFixed(1),
      accuracyOU25: +((ts.hitsOU25 / ts.total) * 100).toFixed(1),
      accuracyBTTS: +((ts.hitsBTTS / ts.total) * 100).toFixed(1),
      accuracyScore: +((ts.hitsScore / ts.total) * 100).toFixed(1),
      avgBrier: +(ts.totalBrier / ts.total).toFixed(4),
    })).sort((a, b) => b.total - a.total);

    const valueBets = results.filter(r => r.isValueBet);
    const valueBetHits = valueBets.filter(r => r.hit1X2).length;

    const summary = {
      date, endDate, total, finishedTotal, upcomingTotal, tournamentFilter,
      // Genel doğruluk (sadece oynanmış maçlardan)
      accuracy1X2: finishedTotal > 0 ? +((hits1X2 / finishedTotal) * 100).toFixed(1) : null,
      accuracyOU25: finishedTotal > 0 ? +((hitsOU25 / finishedTotal) * 100).toFixed(1) : null,
      accuracyBTTS: finishedTotal > 0 ? +((hitsBTTS / finishedTotal) * 100).toFixed(1) : null,
      accuracyScore: finishedTotal > 0 ? +((hitsScore / finishedTotal) * 100).toFixed(1) : null,
      // Kalibrasyon
      avgBrierScore: finishedTotal > 0 ? +(totalBrier / finishedTotal).toFixed(4) : null,
      avgLogLoss: finishedTotal > 0 ? +(totalLogLoss / finishedTotal).toFixed(4) : null,
      // HT
      htAccuracy1X2: htTotal > 0 ? +((hitsHT1X2 / htTotal) * 100).toFixed(1) : null,
      htAccuracyScore: htTotal > 0 ? +((hitsHTScore / htTotal) * 100).toFixed(1) : null,
      htTotal,
      // Tier breakdown
      high: tierStats('HIGH'), medium: tierStats('MEDIUM'), low: tierStats('LOW'),
      // Motor karşılaştırması
      poissonAccuracy1X2: poissonTotal > 0 ? +((poissonHits / poissonTotal) * 100).toFixed(1) : null,
      simulationAccuracy1X2: simTotal > 0 ? +((simHits / simTotal) * 100).toFixed(1) : null,
      // Beraberlik tespiti
      drawDetection: {
        actual: totalDrawActual, predicted: totalDrawPredicted,
        recallRate: totalDrawActual > 0 ? +((results.filter(r => r.actualResult === 'X' && r.predictedResult === 'X').length / totalDrawActual) * 100).toFixed(1) : null,
        precisionRate: totalDrawPredicted > 0 ? +((results.filter(r => r.actualResult === 'X' && r.predictedResult === 'X').length / totalDrawPredicted) * 100).toFixed(1) : null,
      },
      // Value bet
      valueBets: { count: valueBets.length, accuracy1X2: valueBets.length > 0 ? +((valueBetHits / valueBets.length) * 100).toFixed(1) : null },
      // Turnuva bazlı
      byTournament: tournamentSummary,
      results,
    };

    const fs = require('fs'), path = require('path');
    const fname = endDate !== date ? `backtest_${date}_to_${endDate}.json` : `backtest_${date}.json`;
    fs.writeFileSync(path.join(__dirname, '..', fname), JSON.stringify(summary, null, 2), 'utf-8');
    send('summary', summary);

  } catch (err) {
    send('error', { error: err.message });
  } finally {
    res.end();
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
