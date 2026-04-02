const express = require('express');
const cors = require('cors');
const { fetchAllMatchData } = require('./services/data-fetcher');
const { calculateAllMetrics } = require('./engine/metric-calculator');
const { generatePrediction } = require('./engine/prediction-generator');

const app = express();
const PORT = process.env.PORT || 3001;

// Production'da CORS_ORIGIN env variable ile kısıtlanmalı.
// Örnek: CORS_ORIGIN=https://tutarbu.com node server.js
const corsOrigin = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Match data cache (5 dakika TTL)
const matchDataCache = new Map();
const MATCH_CACHE_TTL = 5 * 60 * 1000;

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

    res.json(matches.slice(0, 80));
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

    // 4. Generate Report
    const prediction = generatePrediction(metrics, data);

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

  // Input validation: modifiedLineup varsa home/away diziler olmalı
  if (modifiedLineup !== undefined && modifiedLineup !== null) {
    if (typeof modifiedLineup !== 'object' || Array.isArray(modifiedLineup)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup: must be an object.' });
    }
    if (modifiedLineup.home !== undefined && !Array.isArray(modifiedLineup.home)) {
      return res.status(400).json({ error: 'Invalid modifiedLineup.home: must be an array.' });
    }
    if (modifiedLineup.away !== undefined && !Array.isArray(modifiedLineup.away)) {
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
      if (modifiedLineup.home && data.lineups?.home) {
        data.lineups.home.players = modifiedLineup.home;
      }
      if (modifiedLineup.away && data.lineups?.away) {
        data.lineups.away.players = modifiedLineup.away;
      }
    }

    const metrics = calculateAllMetrics(data);
    const prediction = generatePrediction(metrics, data);
    res.json(prediction);
  } catch (err) {
    console.error(`[API ERROR] workshop/${eventId}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error. Check server logs for details.' });
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

app.listen(PORT, () => {
  console.log(`[SERVER] Football Prediction Engine API running on http://localhost:${PORT}`);
  if (corsOrigin === '*') {
    console.warn('[SERVER] WARNING: CORS is open to all origins. Set CORS_ORIGIN env variable in production.');
  }
});
