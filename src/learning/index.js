'use strict';
/**
 * learning/index.js — Tek giriş noktası.
 *
 * generatePrediction içinden tek fonksiyonla çağrılabilir:
 *   const learned = learning.computeLearnedAdjustment({...});
 *
 * Tahmin akışını bozmaz; her zaman objeyi (boş bile olsa) döndürür.
 */

const store = require('./store');
const { buildFingerprint } = require('./fingerprint');
const { computeAdjustment } = require('./similarity');
const { applyAdjustment, blendWithBase } = require('./blender');
const { recordMatchSnapshot, recordMatchOutcome, reconcileResiduals } = require('./recorder');

// Modül sürümü — fingerprint/blender mantığı değişirse ↑.
// Aynı maç farklı modelVersion altında ayrı snapshot tutar.
const MODEL_VERSION = 'v1.0.0';

let _initialized = false;
function ensureInit() {
  if (_initialized) return;
  store.initDB();
  _initialized = true;
}

/**
 * Tahmin akışında: fingerprint çıkar + tarihsel komşuları getir + adjustment hesapla.
 *
 * @param {object} args
 * @param {object} args.metricsResult
 * @param {object} args.baseline
 * @param {object} args.poissonResult     {lambdaHome, lambdaAway, ...}
 * @param {number} args.kickoffTs         saniye cinsinden (Unix), null ise şimdiki zaman
 * @param {number} args.matchId
 * @param {number} [args.tournamentId]
 * @param {boolean} [args.tournamentRestrict] true ise yalnızca aynı lig case'leri
 * @returns {object} {fingerprint, adjustment, applied, blendInputs}
 */
function computeLearnedAdjustment(args) {
  ensureInit();

  const fp = buildFingerprint({
    metricsResult: args.metricsResult,
    baseline: args.baseline,
    poissonResult: args.poissonResult,
  });

  if (fp.dimsAvailable === 0) {
    return { fingerprint: fp, adjustment: null, applied: null, reason: 'no_dims' };
  }

  // Tarihsel havuz: kickoff_ts < kickoffTs olanlar (as-of disiplini)
  const beforeTs = args.kickoffTs != null
    ? args.kickoffTs
    : Math.floor(Date.now() / 1000);

  const cases = store.getHistoricalCases({
    modelVersion: MODEL_VERSION,
    beforeKickoffTs: beforeTs,
    excludeMatchId: args.matchId,
    tournamentId: args.tournamentRestrict ? args.tournamentId : null,
  });

  const adjustment = computeAdjustment({
    queryVector: fp.vector,
    cases,
    queryTournamentId: args.tournamentId,
    queryKickoffTs: args.kickoffTs,
  });

  let applied = null;
  if (adjustment.enabled && adjustment.confidence > 0
      && Number.isFinite(args.poissonResult?.lambdaHome)
      && Number.isFinite(args.poissonResult?.lambdaAway)) {
    applied = applyAdjustment({
      lambdaHome: args.poissonResult.lambdaHome,
      lambdaAway: args.poissonResult.lambdaAway,
      adjustment: adjustment.adjustment,
      confidence: adjustment.confidence,
    });
  }

  return {
    modelVersion: MODEL_VERSION,
    fingerprint: fp,
    poolSize: adjustment.poolSize,
    confidence: adjustment.confidence,
    bandwidth: adjustment.bandwidth,
    leagueBonus: adjustment.leagueBonus,
    halfLifeDays: adjustment.halfLifeDays,
    effectiveN: adjustment.effectiveN,
    adjustment: adjustment.adjustment,
    applied,
    reason: adjustment.reason,
    debugTopCases: adjustment.debugTopCases,
  };
}

/**
 * Tahmin yapıldığında snapshot kaydet.
 * Tüm alanlar opsiyonel; eksik veri null kalır.
 */
function persistPrediction({
  matchId, kickoffTs, asOfTs, tournamentId, seasonId,
  homeTeamId, awayTeamId, managerHomeId, managerAwayId, refereeId,
  lambdaHome, lambdaAway, rho,
  probHome, probDraw, probAway, probO25, probBTTS, predictedScore,
  metricMatrix, baseline, contextual, learnedAdj,
  fingerprint,
}) {
  ensureInit();
  if (matchId == null) return false;
  const _asOf = asOfTs != null ? asOfTs
              : Math.floor(Date.now() / 1000);

  const predictionRec = {
    matchId, modelVersion: MODEL_VERSION, asOfTs: _asOf, kickoffTs,
    tournamentId, seasonId, homeTeamId, awayTeamId,
    managerHomeId, managerAwayId, refereeId,
    lambdaHome, lambdaAway, rho,
    probHome, probDraw, probAway, probO25, probBTTS, predictedScore,
    metricMatrix, baseline, contextual, learnedAdj,
  };

  if (fingerprint && fingerprint.vector) {
    return recordMatchSnapshot({
      predictionRec,
      fingerprint,
    });
  } else {
    return store.recordPrediction(predictionRec);
  }
}

function persistOutcome(rec) {
  ensureInit();
  return recordMatchOutcome(rec);
}

function getStats() {
  ensureInit();
  return store.getStats();
}

module.exports = {
  MODEL_VERSION,
  computeLearnedAdjustment,
  persistPrediction,
  persistOutcome,
  getStats,
  reconcileResiduals,
  blendWithBase,
  // alt seviye
  store,
};
