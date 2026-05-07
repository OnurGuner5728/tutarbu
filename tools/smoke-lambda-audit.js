#!/usr/bin/env node
/**
 * Smoke Test: Faz 0 lambda audit tracer
 * advanced-derived.js'i minimal sentetik girdiyle çağırır,
 * prediction.lambdaAudit alanının dolu döndüğünü doğrular.
 */

'use strict';

const { calculateAdvancedMetrics } = require('../src/metrics/advanced-derived');

const flatHome = {
  M001: 1.8, M002: 1.9, M011: 0.18, M018: 0.22,
  M026: 1.0, M027: 0.95,
};
const flatAway = {
  M001: 1.4, M002: 1.3, M011: 0.13, M018: 0.18,
  M026: 1.3, M027: 1.25,
};

const allMetrics = {
  homeAttack: { M001: 1.8, M002: 1.9 },
  awayAttack: { M001: 1.4, M002: 1.3 },
  homeDefense: { M026: 1.0, M027: 0.95 },
  awayDefense: { M026: 1.3, M027: 1.25 },
  homeForm: {}, awayForm: {},
  homePlayer: {}, awayPlayer: {},
  homeGK: {}, awayGK: {},
  referee: { refGoalsPerMatch: 2.7 },
  h2h: {}, contextual: {},
  homeMomentum: {}, awayMomentum: {},
  leagueAvgGoals: 1.4,
  homeFormation: '4-3-3', awayFormation: '4-2-3-1',
  homeMatchCount: 18, awayMatchCount: 18,
  homeFlat: flatHome, awayFlat: flatAway, sharedFlat: {},
  allMetricIds: new Set(['M001','M002','M011','M018','M026','M027']),
  dynamicAvgs: { M001: 1.4, M015: 1.35, M011: 0.15, M018: 0.20 },
  dynamicHomeAdvantage: 0.18,
  homeXGScored: 1.85, homeXGConceded: 1.05,
  awayXGScored: 1.30, awayXGConceded: 1.40,
  homeStGF: 1.9, homeStGA: 0.9, awayStGF: 1.2, awayStGA: 1.4,
  homeStMatches: 16, awayStMatches: 16,
  homeMVBreakdown: { GK: 5, DEF: 30, MID: 40, ATK: 35, total: 110 },
  awayMVBreakdown: { GK: 4, DEF: 22, MID: 28, ATK: 25, total: 79 },
  homeScoreProfile: {
    avgScored: 1.85, stdScored: 0.95, avgConceded: 0.95, stdConceded: 0.7,
    n: 14, scoringRate: 0.86, cleanSheetRate: 0.32, bttsRate: 0.55, over25Rate: 0.50,
    scoredDist:   [0.10, 0.20, 0.30, 0.20, 0.12, 0.05, 0.03],
    concededDist: [0.32, 0.30, 0.20, 0.10, 0.05, 0.02, 0.01],
  },
  awayScoreProfile: {
    avgScored: 1.30, stdScored: 0.85, avgConceded: 1.40, stdConceded: 0.9,
    n: 14, scoringRate: 0.79, cleanSheetRate: 0.21, bttsRate: 0.62, over25Rate: 0.50,
    scoredDist:   [0.21, 0.30, 0.25, 0.13, 0.07, 0.03, 0.01],
    concededDist: [0.13, 0.22, 0.30, 0.20, 0.10, 0.04, 0.01],
  },
  matchScoreProfile: null,
  leagueFingerprint: {
    reliability: 0.7,
    leagueAvgGoals: 2.7, leagueDrawRate: 0.26, leagueBTTSRate: 0.50,
    leagueOver25Rate: 0.51, leagueOverdispersion: 1.15,
    leagueCleanSheetRate: 0.28,
  },
  leaguePointDensity: 1.65, leagueGoalVolatility: 0.50,
  medianGoalRate: 1.4, leagueTeamCount: 18, ptsCV: 0.45,
  normMinRatio: 0.55, normMaxRatio: 1.55,
  leagueCompetitiveness: 0.60, leagueHomeBias: 0.20, leagueDrawTendency: 1.0,
  homeTopPlayerGoalDrop: 0, awayTopPlayerGoalDrop: 0,
  baselineReliability: 1.0,
};

const result = calculateAdvancedMetrics(allMetrics);
const audit = result.prediction.lambdaAudit;

if (!audit || !audit.diag || !audit.trace) {
  console.error('FAIL: lambdaAudit eksik');
  process.exit(1);
}

console.log('=== SMOKE TEST: lambdaAudit ===');
console.log('λH final =', result.prediction.lambdaHome);
console.log('λA final =', result.prediction.lambdaAway);
console.log('');
console.log('Diag (özet):');
console.log('  kMatchHome    =', audit.diag.kMatchHome?.toFixed(4));
console.log('  kMatchAway    =', audit.diag.kMatchAway?.toFixed(4));
console.log('  agreementHome =', audit.diag.agreementHome?.toFixed(4));
console.log('  agreementAway =', audit.diag.agreementAway?.toFixed(4));
console.log('  cvLocal       =', audit.diag.cvLocal?.toFixed(4));
console.log('  λ_min, λ_max  =', audit.diag.dynamicLambdaMin?.toFixed(3), audit.diag.dynamicLambdaMax?.toFixed(3));
console.log('  clamp hits    = home[min/max]=', audit.diag.clampHomeMinHit, '/', audit.diag.clampHomeMaxHit,
            'away[min/max]=', audit.diag.clampAwayMinHit, '/', audit.diag.clampAwayMaxHit);
console.log('  source counts =', JSON.stringify(audit.diag.sources));
console.log('');
console.log('Trace stages:');
for (const t of audit.trace) {
  const dH = t.dLogH != null ? t.dLogH.toFixed(4) : '—';
  const dA = t.dLogA != null ? t.dLogA.toFixed(4) : '—';
  console.log(`  [${t.stage.padEnd(20)}] hAfter=${String(t.hAfter ?? '—').padStart(8)} aAfter=${String(t.aAfter ?? '—').padStart(8)} dLogH=${dH} dLogA=${dA}`);
}
console.log('');
console.log('OK ✅ — lambdaAudit dolu, trace üretiliyor.');
