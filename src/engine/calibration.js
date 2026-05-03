'use strict';
/**
 * Kalibrasyon Modülü — Platt Scaling + Lig Bazlı Düzeltme
 *
 * Backtest verisinden öğrenir, çıktıyı post-hoc kalibre eder:
 *   1. Platt Scaling: p_cal = sigmoid(A * logit(p_raw) + B) per outcome
 *   2. Competition layer: lig bazlı shrinkage adjustment
 *   3. Renormalize → sum=1
 */

const fs = require('fs');
const path = require('path');

const PARAMS_FILE = path.join(__dirname, 'calibration-params.json');

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function logit(p) {
  const clamped = Math.max(1e-9, Math.min(1 - 1e-9, p));
  return Math.log(clamped / (1 - clamped));
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ---------------------------------------------------------------------------
// Platt Scaling — gradient descent, Platt 1999 label smoothing
// ---------------------------------------------------------------------------

/**
 * Fit Platt scaling parameters for a single outcome.
 *
 * @param {number[]} probs  - Raw predicted probabilities (0-1)
 * @param {number[]} labels - Binary ground-truth labels (0 or 1)
 * @param {{ lr?: number, epochs?: number }} [opts]
 * @returns {{ A: number, B: number, n: number }}
 */
function fitPlatt(probs, labels, opts = {}) {
  const lr = opts.lr ?? 0.01;
  const epochs = opts.epochs ?? 1000;
  const n = probs.length;

  if (n === 0) return { A: 1, B: 0, n: 0 };

  // Platt 1999 label smoothing
  const nPos = labels.reduce((s, l) => s + l, 0);
  const nNeg = n - nPos;
  const tp = (nPos + 1) / (nPos + 2);
  const tn = 1 / (nNeg + 2);

  // Smoothed targets
  const t = labels.map(l => (l === 1 ? tp : tn));

  let A = 1;
  let B = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0;
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      const f = logit(probs[i]);
      const p = sigmoid(A * f + B);
      const diff = p - t[i];
      gradA += diff * f;
      gradB += diff;
    }

    A -= (lr / n) * gradA;
    B -= (lr / n) * gradB;
  }

  return { A, B, n };
}

// ---------------------------------------------------------------------------
// Competition (league) calibration — shrinkage-based multipliers
// ---------------------------------------------------------------------------

/**
 * Fit per-league multipliers per outcome.
 *
 * @param {object[]} matches   - Each match must have:
 *   { probHome, probDraw, probAway, actualResult, leagueId }
 *   probHome/Draw/Away are 0-100 percentages.
 *   actualResult: '1' | 'X' | '2'
 * @param {number} [shrinkage=25]
 * @returns {object} { [leagueId]: { home, draw, away }, global: { home, draw, away } }
 */
function fitCompetitionCalibration(matches, shrinkage = 25) {
  const SHRINKAGE = shrinkage;

  // Accumulate per-league sums
  const leagues = {};

  for (const m of matches) {
    const lid = m.leagueId ?? 'global';
    if (!leagues[lid]) {
      leagues[lid] = {
        sumPredHome: 0, sumActHome: 0,
        sumPredDraw: 0, sumActDraw: 0,
        sumPredAway: 0, sumActAway: 0,
        n: 0,
      };
    }
    const bucket = leagues[lid];

    // Auto-detect scale: 0-1 vs 0-100
    const _scale = (m.probHome > 1 || m.probDraw > 1 || m.probAway > 1) ? 100 : 1;
    const pH = m.probHome / _scale;
    const pD = m.probDraw / _scale;
    const pA = m.probAway / _scale;

    const isHome = m.actualResult === '1' ? 1 : 0;
    const isDraw = m.actualResult === 'X' ? 1 : 0;
    const isAway = m.actualResult === '2' ? 1 : 0;

    bucket.sumPredHome += pH;
    bucket.sumActHome += isHome;
    bucket.sumPredDraw += pD;
    bucket.sumActDraw += isDraw;
    bucket.sumPredAway += pA;
    bucket.sumActAway += isAway;
    bucket.n += 1;
  }

  // Global accumulators (all matches)
  const globalBucket = {
    sumPredHome: 0, sumActHome: 0,
    sumPredDraw: 0, sumActDraw: 0,
    sumPredAway: 0, sumActAway: 0,
    n: 0,
  };
  for (const b of Object.values(leagues)) {
    globalBucket.sumPredHome += b.sumPredHome;
    globalBucket.sumActHome += b.sumActHome;
    globalBucket.sumPredDraw += b.sumPredDraw;
    globalBucket.sumActDraw += b.sumActDraw;
    globalBucket.sumPredAway += b.sumPredAway;
    globalBucket.sumActAway += b.sumActAway;
    globalBucket.n += b.n;
  }

  function computeMult(predMean, actMean, n) {
    if (predMean <= 0) return 1.0;
    const rawMult = actMean / predMean;
    const w = n / (n + SHRINKAGE);
    const adj = 1.0 * (1 - w) + rawMult * w;
    // Clamp örneklem büyüklüğüne oranlı: n büyükse daha geniş sapma izni (sabit 0.3/3.0 kaldırıldı).
    const _calMin = 1 / (1 + n);
    const _calMax = 1 + n;
    return clamp(adj, _calMin, _calMax);
  }

  function bucketToMults(b) {
    const n = b.n;
    return {
      home: computeMult(b.sumPredHome / n, b.sumActHome / n, n),
      draw: computeMult(b.sumPredDraw / n, b.sumActDraw / n, n),
      away: computeMult(b.sumPredAway / n, b.sumActAway / n, n),
    };
  }

  const result = {};

  // Global always computed
  if (globalBucket.n > 0) {
    result['global'] = bucketToMults(globalBucket);
  } else {
    result['global'] = { home: 1.0, draw: 1.0, away: 1.0 };
  }

  // Per-league: only leagues with n >= 3
  for (const [lid, b] of Object.entries(leagues)) {
    if (b.n < 3) continue;
    result[lid] = bucketToMults(b);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Apply helpers
// ---------------------------------------------------------------------------

/**
 * Apply Platt scaling to a single probability.
 *
 * @param {number} p      - Raw probability (0-1)
 * @param {{ A: number, B: number }} params
 * @returns {number}
 */
function applyPlatt(p, params) {
  if (!params) return p;
  return sigmoid(params.A * logit(p) + params.B);
}

/**
 * Full calibration pipeline: Platt → competition mult → renormalize.
 *
 * @param {{ home: number, draw: number, away: number }} probs - Raw probs (0-1)
 * @param {string|null} leagueId
 * @param {object|null} params - Output of trainCalibration()
 * @returns {{ home: number, draw: number, away: number }}
 */
/**
 * calibrateProbs — Platt + competition + renormalize
 * @param {number[]} probs  - [pHome, pDraw, pAway] (0-1 each, must sum ~1)
 * @param {string|number|null} leagueId
 * @param {object|null} params
 * @returns {number[]} calibrated [pHome, pDraw, pAway]
 */
function calibrateProbs(probs, leagueId, params) {
  // If no params available, return original probs unchanged
  if (!params) return probs;

  // Accept both array [pH, pD, pA] and object { home, draw, away }
  let pH = Array.isArray(probs) ? probs[0] : probs.home;
  let pD = Array.isArray(probs) ? probs[1] : probs.draw;
  let pA = Array.isArray(probs) ? probs[2] : probs.away;

  // 1. Platt per-outcome
  const platt = params.platt ?? {};
  pH = applyPlatt(pH, platt.home);
  pD = applyPlatt(pD, platt.draw);
  pA = applyPlatt(pA, platt.away);

  // 2. Competition mult — try leagueId first, fall back to 'global'
  const lid = leagueId != null ? String(leagueId) : null;
  const comp = params.competition ?? {};
  const leagueMults = (lid && comp[lid]) ? comp[lid] : (comp['global'] ?? null);

  if (leagueMults) {
    pH *= leagueMults.home ?? 1.0;
    pD *= leagueMults.draw ?? 1.0;
    pA *= leagueMults.away ?? 1.0;
  }

  // 3. Renormalize → sum=1
  const total = pH + pD + pA;
  if (total <= 0) return probs;

  return [pH / total, pD / total, pA / total];
}

// ---------------------------------------------------------------------------
// Training entry point
// ---------------------------------------------------------------------------

/**
 * Train all calibration parameters from a list of match results.
 *
 * Expected match shape:
 *   { probHome, probDraw, probAway, actualResult, leagueId? }
 *   probHome/Draw/Away: 0-100 percentages
 *   actualResult: '1' | 'X' | '2'
 *
 * @param {object[]} matches
 * @param {object} [opts] - Training options (e.g., shrinkage)
 * @returns {object} Calibration params object
 */
function trainCalibration(matches, opts = {}) {
  if (!matches || matches.length === 0) {
    return { platt: {}, competition: {}, trainedAt: new Date().toISOString() };
  }

  // Build arrays for Platt fitting
  const homeProbs = [];
  const homeLabels = [];
  const drawProbs = [];
  const drawLabels = [];
  const awayProbs = [];
  const awayLabels = [];

  for (const m of matches) {
    // Auto-detect scale: 0-1 vs 0-100
    const _scale = (m.probHome > 1 || m.probDraw > 1 || m.probAway > 1) ? 100 : 1;
    const pH = m.probHome / _scale;
    const pD = m.probDraw / _scale;
    const pA = m.probAway / _scale;

    homeProbs.push(pH);
    drawProbs.push(pD);
    awayProbs.push(pA);

    homeLabels.push(m.actualResult === '1' ? 1 : 0);
    drawLabels.push(m.actualResult === 'X' ? 1 : 0);
    awayLabels.push(m.actualResult === '2' ? 1 : 0);
  }

  const platt = {
    home: fitPlatt(homeProbs, homeLabels),
    draw: fitPlatt(drawProbs, drawLabels),
    away: fitPlatt(awayProbs, awayLabels),
  };

  const competition = fitCompetitionCalibration(matches, opts.shrinkage);

  return {
    platt,
    competition,
    trainedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * Load calibration params from a JSON file.
 *
 * @param {string} [paramsPath]
 * @returns {object|null}
 */
function loadCalibration(paramsPath) {
  const filePath = paramsPath ?? PARAMS_FILE;
  if (!fs.existsSync(filePath)) return null;
  try {
    const params = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // Kalibrasyon yaşı kontrolü: 30 günden eskiyse devre dışı bırak
    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
    if (params?.lastUpdated) {
      const age = Date.now() - new Date(params.lastUpdated).getTime();
      if (age > MAX_AGE_MS) {
        console.warn(`[calibration] Params are ${Math.round(age / (24*60*60*1000))} days old (>30d) — disabled`);
        params._stale = true;
        return params;
      }
    } else {
      // lastUpdated yoksa file mtime'dan kontrol et
      const stat = fs.statSync(filePath);
      const age = Date.now() - stat.mtimeMs;
      if (age > MAX_AGE_MS) {
        console.warn(`[calibration] Params file is ${Math.round(age / (24*60*60*1000))} days old (>30d) — disabled`);
        params._stale = true;
        return params;
      }
    }
    return params;
  } catch (err) {
    console.error('[calibration] loadCalibration failed:', err.message);
    return null;
  }
}

/**
 * Save calibration params to a JSON file.
 *
 * @param {object} params
 * @param {string} [paramsPath]
 */
function saveCalibration(params, paramsPath) {
  const filePath = paramsPath ?? PARAMS_FILE;
  fs.writeFileSync(filePath, JSON.stringify(params, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  fitPlatt,
  fitCompetitionCalibration,
  applyPlatt,
  calibrateProbs,
  trainCalibration,
  loadCalibration,
  saveCalibration,
  PARAMS_FILE,
};
