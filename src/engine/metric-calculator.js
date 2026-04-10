/**
 * Metric Calculator — Orchestrator
 * Tüm 168 metriği tek bir çağrıda hesaplar.
 */

const { calculateTeamAttackMetrics } = require('../metrics/team-attack');
const { calculateTeamDefenseMetrics } = require('../metrics/team-defense');
const { calculateTeamFormMetrics } = require('../metrics/team-form');
const { calculatePlayerMetrics } = require('../metrics/player-performance');
const { calculateGoalkeeperMetrics } = require('../metrics/goalkeeper');
const { calculateRefereeMetrics } = require('../metrics/referee-impact');
const { calculateH2HMetrics } = require('../metrics/h2h-analysis');
const { calculateContextualMetrics } = require('../metrics/contextual');
const { calculateMomentumMetrics } = require('../metrics/momentum');
const { calculateAdvancedMetrics } = require('../metrics/advanced-derived');

/**
 * Tüm 168 metriği hesaplar.
 * @param {object} data - fetchAllMatchData çıktısı
 * @returns {object} Tüm metrikler + tahmin çıktısı
 */
function calculateAllMetrics(data) {
  console.log('[MetricCalculator] Calculating 168 metrics...');
  const startTime = Date.now();

  // Bölüm A: Hücum (M001-M025) — Her iki takım
  const homeAttack = calculateTeamAttackMetrics(data, 'home');
  const awayAttack = calculateTeamAttackMetrics(data, 'away');

  // Bölüm B: Defans (M026-M045) — Her iki takım
  const homeDefense = calculateTeamDefenseMetrics(data, 'home');
  const awayDefense = calculateTeamDefenseMetrics(data, 'away');

  // Bölüm C: Form (M046-M065) — Her iki takım
  const homeForm = calculateTeamFormMetrics(data, 'home');
  const awayForm = calculateTeamFormMetrics(data, 'away');

  // Bölüm D: Oyuncu (M066-M095) — Her iki takım
  const homePlayer = calculatePlayerMetrics(data, 'home');
  const awayPlayer = calculatePlayerMetrics(data, 'away');

  // Bölüm E: Kaleci (M096-M108) — Her iki takım
  const homeGK = calculateGoalkeeperMetrics(data, 'home');
  const awayGK = calculateGoalkeeperMetrics(data, 'away');

  // Bölüm F: Hakem (M109-M118) — Paylaşılan
  const referee = calculateRefereeMetrics(data);

  // Bölüm G: H2H (M119-M130) — Paylaşılan
  const h2h = calculateH2HMetrics(data);

  // Bölüm H: Bağlamsal (M131-M145) — Paylaşılan
  const contextual = calculateContextualMetrics(data);

  // Bölüm I: Momentum (M146-M155) — Her iki takım
  const homeMomentum = calculateMomentumMetrics(data, 'home');
  const awayMomentum = calculateMomentumMetrics(data, 'away');

  // Bölüm J: Tüm metrikleri düzleştir (Dinamik Üniteler İçin)
  const homeFlat = { ...homeAttack, ...homeDefense, ...homeForm, ...homePlayer, ...homeGK, ...homeMomentum };
  const awayFlat = { ...awayAttack, ...awayDefense, ...awayForm, ...awayPlayer, ...awayGK, ...awayMomentum };
  const sharedFlat = { ...referee, ...h2h, ...contextual };
  
  const allMetricIds = new Set([
    ...Object.keys(homeFlat), ...Object.keys(awayFlat), ...Object.keys(sharedFlat)
  ].filter(k => /^M[0-9]{3}[a-z]?$/i.test(k)));

  // Dinamik lig ortalaması — standings verisinden hesaplanır
  const leagueAvgGoals = computeLeagueAvgGoals(data.standingsTotal);
  const homeFormation = data.lineups?.home?.formation || null;
  const awayFormation = data.lineups?.away?.formation || null;

  const advanced = calculateAdvancedMetrics({
    homeAttack, awayAttack, homeDefense, awayDefense,
    homeForm, awayForm, homePlayer, awayPlayer,
    homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum,
    leagueAvgGoals,
    homeFormation, awayFormation,
    homeMatchCount: data.homeLastEvents?.length || 0,
    awayMatchCount: data.awayLastEvents?.length || 0,
    // Add flattened data for unit calculations
    homeFlat, awayFlat, sharedFlat, allMetricIds
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[MetricCalculator] All metrics calculated in ${elapsed}s`);

  // Metrik sayısını doğrula
  const metricCount = countMetrics({
    homeAttack, awayAttack, homeDefense, awayDefense,
    homeForm, awayForm, homePlayer, awayPlayer,
    homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum, advanced,
  });

  const result = {
    home: {
      attack: homeAttack,
      defense: homeDefense,
      form: homeForm,
      player: homePlayer,
      goalkeeper: homeGK,
      momentum: homeMomentum,
      compositeScores: advanced.home,
    },
    away: {
      attack: awayAttack,
      defense: awayDefense,
      form: awayForm,
      player: awayPlayer,
      goalkeeper: awayGK,
      momentum: awayMomentum,
      compositeScores: advanced.away,
    },
    shared: {
      referee,
      h2h,
      contextual,
      sharedComposite: advanced.shared,
    },
    prediction: advanced.prediction,
    meta: {
      calculationTimeMs: Date.now() - startTime,
      totalMetricsCalculated: metricCount,
      eventId: data.eventId,
      homeTeam: data.event?.event?.homeTeam?.name,
      awayTeam: data.event?.event?.awayTeam?.name,
      timestamp: new Date().toISOString(),
    }
  };

  // Phase 1 Observation: Metric Audit
  const { getMetricAuditSummary } = require('./audit-helper');
  result.metricAudit = getMetricAuditSummary(data, result);

  return result;
}

function countMetrics(groups) {
  let count = 0;
  const metricRegex = /^M[0-9]{3}[a-z]?$/i;
  for (const [key, group] of Object.entries(groups)) {
    if (typeof group !== 'object' || !group) continue;
    for (const [k, v] of Object.entries(group)) {
      if (metricRegex.test(k)) count++;
      if (k === 'home' || k === 'away') {
        for (const [kk] of Object.entries(v || {})) {
          if (metricRegex.test(kk)) count++;
        }
      }
    }
  }
  return count;
}

function computeLeagueAvgGoals(standingsTotal) {
  const rows = standingsTotal?.standings?.[0]?.rows || [];
  if (rows.length < 4) return null; // Yeterli veri yok, fallback kullanılmaz
  const totalGoals = rows.reduce((s, r) => s + (r.scoresFor || r.goalsFor || 0), 0);
  const totalGames = rows.reduce((s, r) => s + (r.played || 0), 0);
  return totalGames > 0 ? totalGoals / totalGames : null;
}

module.exports = { calculateAllMetrics };
