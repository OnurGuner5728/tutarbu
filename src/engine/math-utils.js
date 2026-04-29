/**
 * Shared math utilities for the prediction engine.
 * Single source of truth for Poisson PMF, factorial, and related functions.
 */

'use strict';

/**
 * Poisson PMF — log-space hesaplama ile büyük k değerlerinde overflow önlenir.
 * @param {number} k - Gözlenen değer (0, 1, 2, ...)
 * @param {number} lambda - Poisson parametresi (ortalama)
 * @returns {number} P(X = k)
 */
function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * P(X > threshold) for Poisson(lambda) — CDF üzerinden hesaplanır.
 * @param {number} lambda - Poisson parametresi
 * @param {number} threshold - Eşik değeri (ör: 2.5, 8.5)
 * @returns {number} probability (0-1)
 */
function poissonExceed(lambda, threshold) {
  if (lambda <= 0) return 0;
  const kMax = Math.floor(threshold);
  let cdf = 0;
  for (let k = 0; k <= kMax; k++) {
    cdf += poissonPMF(k, lambda);
  }
  return Math.max(0, 1 - cdf);
}

/**
 * Poisson'dan rastgele örnekleme (simülasyon için).
 * @param {number} lambda - Poisson parametresi
 * @returns {number} sampled integer
 */
function samplePoisson(lambda) {
  if (lambda == null || lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L && k < 20);
  return k - 1;
}

/**
 * Null-safe ağırlıklı ortalama.
 * @param {Array<[number|null, number]>} pairs - [value, weight] çiftleri
 * @returns {number|null}
 */
function weightedAvg(pairs) {
  let totalWeight = 0, totalValue = 0;
  for (const [value, weight] of pairs) {
    if (value == null || !isFinite(value)) continue;
    totalValue += clamp(value, 0, 100) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? clamp(totalValue / totalWeight, 0, 100) : null;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function round2(val) {
  return Math.round((val ?? 0) * 100) / 100;
}

function parseStatValue(item, isHome) {
  const value = isHome ? item.homeValue : item.awayValue;
  const raw = isHome ? item.home : item.away;

  // Simple numeric case
  if (value != null && !isNaN(value)) return { current: Number(value), total: null };
  if (raw != null && !isNaN(raw)) return { current: Number(raw), total: null };

  // Fractional case: "10/20 (50%)" or "10/20"
  const str = value || raw || "";
  const match = str.match(/^(\d+)[\/:](\d+)/);
  if (match) {
    return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
  }

  // Percentage only case: "55%"
  const percMatch = str.match(/^(\d+)%/);
  if (percMatch) {
    return { current: parseInt(percMatch[1], 10), total: 100 };
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? { current: null, total: null } : { current: parsed, total: null };
}

/**
 * Match statistics objesinden takım verilerini çıkarır.
 */
function extractTeamStats(statsResponse, isHome) {
  if (!statsResponse?.statistics) return null;

  const result = {
    totalShots: null, shotsOnTarget: null, cornerKicks: null, bigChances: null,
    bigChancesScored: null, bigChancesMissed: null, fouls: null, possession: null,
    expectedGoals: null, blockedShots: null, shotsOffTarget: null, hitWoodwork: null,
    shotsInsideBox: null, shotsOutsideBox: null, accuratePasses: null, totalPasses: null,
    accurateLongBalls: null, totalLongBalls: null, accurateCrosses: null, totalCrosses: null,
    duelsWon: null, totalDuels: null, aerialDuelsWon: null, totalAerialDuels: null,
    interceptions: null, tackles: null, clearances: null, saves: null,
    accuratePassesFinalThird: null, totalPassesFinalThird: null,
    yellowCards: null, redCards: null, offsides: null
  };

  // Key-based lookup map (locale-independent — SofaScore sabit İngilizce key döner).
  // item.key mevcutsa önce buradan resolve edilir; bulunamazsa aşağıdaki switch fallback devreye girer.
  // Fraction/total gerektiren case'ler üçüncü parametre (st = stats objesi) ile birlikte handle edilir.
  const KEY_MAP = {
    'totalShots': (r, v) => { r.totalShots = v; },
    'onTargetScoringAttempts': (r, v) => { r.shotsOnTarget = v; },
    'cornerKicks': (r, v) => { r.cornerKicks = v; },
    'bigChances': (r, v) => { r.bigChances = v; },
    'bigChancesScored': (r, v) => { r.bigChancesScored = v; },
    'bigChancesMissed': (r, v) => { r.bigChancesMissed = v; },
    'fouls': (r, v) => { r.fouls = v; },
    'ballPossession': (r, v) => { r.possession = v; },
    'expectedGoals': (r, v) => { r.expectedGoals = v; },
    'blockedShots': (r, v) => { r.blockedShots = v; },
    'shotsOffTarget': (r, v) => { r.shotsOffTarget = v; },
    'hitWoodwork': (r, v) => { r.hitWoodwork = v; },
    'shotsInsideBox': (r, v) => { r.shotsInsideBox = v; },
    'shotsOutsideBox': (r, v) => { r.shotsOutsideBox = v; },
    'totalPasses': (r, v) => { r.totalPasses = v; },
    'totalLongBalls': (r, v) => { r.totalLongBalls = v; },
    'totalCrosses': (r, v) => { r.totalCrosses = v; },
    'totalDuels': (r, v) => { r.totalDuels = v; },
    'totalAerialDuels': (r, v) => { r.totalAerialDuels = v; },
    'interceptions': (r, v) => { r.interceptions = v; },
    'tackles': (r, v) => { r.tackles = v; },
    'clearances': (r, v) => { r.clearances = v; },
    'saves': (r, v) => { r.saves = v; },
    'goalKeeperSaves': (r, v) => { r.saves = v; },
    'yellowCards': (r, v) => { r.yellowCards = v; },
    'redCards': (r, v) => { r.redCards = v; },
    'offsides': (r, v) => { r.offsides = v; },
    'blockedScoringAttempt': (r, v) => { r.blockedShots = v; },
    'blockedScoringAttemptAgainst': (r, v) => { r.blockedScoringAttemptAgainst = v; },
    // Fraction case'ler: current + total birlikte yazılır
    'accuratePasses': (r, v, st) => { r.accuratePasses = v; if (st.total) r.totalPasses = st.total; },
    'accurateLongBalls': (r, v, st) => { r.accurateLongBalls = v; if (st.total) r.totalLongBalls = st.total; },
    'accurateCrosses': (r, v, st) => { r.accurateCrosses = v; if (st.total) r.totalCrosses = st.total; },
    'accuratePassesFinalThird': (r, v, st) => { r.accuratePassesFinalThird = v; if (st.total) r.totalPassesFinalThird = st.total; },
    'duelsWon': (r, v, st) => { r.duelsWon = v; if (st.total) r.totalDuels = st.total; },
    'aerialDuelsWon': (r, v, st) => { r.aerialDuelsWon = v; if (st.total) r.totalAerialDuels = st.total; },
  };

  for (const period of statsResponse.statistics) {
    if (period.period !== 'ALL') continue;
    for (const group of (period.groups || [])) {
      for (const item of (group.statisticsItems || [])) {
        const stats = parseStatValue(item, isHome);
        const val = stats.current;

        // Key-based lookup önce dene (locale-independent)
        if (item.key && KEY_MAP[item.key]) {
          KEY_MAP[item.key](result, val, stats);
          continue;
        }

        // Fallback: name-based switch (İngilizce lokalizasyon veya key yoksa çalışır)
        switch (item.name) {
          case 'Total shots': result.totalShots = val; break;
          case 'Shots on target': result.shotsOnTarget = val; break;
          case 'Corner kicks': result.cornerKicks = val; break;
          case 'Big chances': result.bigChances = val; break;
          case 'Big chances scored': result.bigChancesScored = val; break;
          case 'Big chances missed': result.bigChancesMissed = val; break;
          case 'Fouls': result.fouls = val; break;
          case 'Ball possession': result.possession = val; break;
          case 'Expected goals': result.expectedGoals = val; break;
          case 'Blocked shots': result.blockedShots = val; break;
          case 'Shots off target': result.shotsOffTarget = val; break;
          case 'Hit woodwork': result.hitWoodwork = val; break;
          case 'Shots inside box': result.shotsInsideBox = val; break;
          case 'Shots outside box': result.shotsOutsideBox = val; break;
          case 'Passes':
          case 'Accurate passes':
            result.accuratePasses = stats.current;
            if (stats.total) result.totalPasses = stats.total;
            break;
          case 'Total passes': result.totalPasses = stats.current; break;
          case 'Long balls':
          case 'Accurate long balls':
            result.accurateLongBalls = stats.current;
            if (stats.total) result.totalLongBalls = stats.total;
            break;
          case 'Crosses':
          case 'Accurate crosses':
            result.accurateCrosses = stats.current;
            if (stats.total) result.totalCrosses = stats.total;
            break;
          case 'Final third entries':
          case 'Passes in final third':
          case 'Accurate passes in final third':
            result.accuratePassesFinalThird = stats.current;
            if (stats.total) result.totalPassesFinalThird = stats.total;
            break;
          case 'Duels':
          case 'Duels won':
            result.duelsWon = stats.current;
            if (stats.total) result.totalDuels = stats.total;
            break;
          case 'Aerial duels':
          case 'Aerial duels won':
            result.aerialDuelsWon = stats.current;
            if (stats.total) result.totalAerialDuels = stats.total;
            break;
          case 'Total long balls': result.totalLongBalls = val; break;
          case 'Total crosses': result.totalCrosses = val; break;
          case 'Total duels': result.totalDuels = val; break;
          case 'Total aerial duels': result.totalAerialDuels = val; break;
          case 'Interceptions': result.interceptions = val; break;
          case 'Tackles': result.tackles = val; break;
          case 'Clearances': result.clearances = val; break;
          case 'Goalkeeper saves':
          case 'Saves': result.saves = val; break;
          case 'Passes final third':
          case 'Accurate passes final third':
            result.accuratePassesFinalThird = val;
            if (stats.total) result.totalPassesFinalThird = stats.total;
            break;
          case 'Yellow cards': result.yellowCards = val; break;
          case 'Red cards': result.redCards = val; break;
          case 'Offsides': result.offsides = val; break;
          case 'Blocked scoring attempt': result.blockedShots = val; break;
          case 'Blocked scoring attempt against': result.blockedScoringAttemptAgainst = val; break;
        }
      }
    }
  }
  return result;
}

/**
 * Calculates dynamic efficiency penalty for out-of-position players.
 * Positions: 'G' (0), 'D' (1), 'M' (2), 'F' (3).
 * Native vs Assigned position distance determines penalty.
 */
function getPositionalEfficiency(nativePos, assignedPos) {
  if (!nativePos || !assignedPos) return 1.0;

  const map = { 'G': 0, 'D': 1, 'M': 2, 'F': 3 };
  const nativeIdx = map[nativePos[0]?.toUpperCase()];
  const assignedIdx = map[assignedPos[0]?.toUpperCase()];

  if (nativeIdx === undefined || assignedIdx === undefined) return 1.0;

  const distance = Math.abs(nativeIdx - assignedIdx);
  if (distance === 0) return 1.0;
  if (distance === 1) return 0.85; // 15% penalty
  if (distance === 2) return 0.60; // 40% penalty
  if (distance === 3) return 0.10; // 90% penalty

  return 1.0;
}

module.exports = { poissonPMF, poissonExceed, samplePoisson, weightedAvg, clamp, round2, extractTeamStats, parseStatValue, getPositionalEfficiency };
