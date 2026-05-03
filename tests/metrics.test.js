/**
 * metrics.test.js — Metrik sınır ve NaN propagation testleri
 * Çalıştırma: node tests/metrics.test.js
 */

'use strict';

const { calculateUnitImpact, SIM_BLOCKS } = require('../src/engine/match-simulator');
const { mv, unwrap, getConfidence } = require('../src/engine/metric-value');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log('=== metrics.test.js ===\n');

const minBaseline = {
  shotsPerMin: 0.15,
  onTargetRate: 0.35,
  goalConvRate: 0.10,
  blockRate: 0.04,
  cornerPerMin: 0.12,
  yellowPerMin: 0.03,
  redPerMin: 0.002,
  penConvRate: 0.75,
  gkSaveRate: 0.70,
  possessionBase: 0.50,
  leagueAvgGoals: 2.5,
  leagueGoalVolatility: 0.55,
  normMinRatio: 0.4,
  normMaxRatio: 2.5,
  leagueTeamCount: 20,
};

// ─── MetricValue wrapper ile calculateUnitImpact ────────────────────────────
console.log('MetricValue wrapper integration:');

// MetricValue wrapper formatında metrikler
const wrappedMetrics = {
  M011: mv(12, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
  M012: mv(8, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
  M016: mv(0.5, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
  M018: mv(3, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
  M020: mv(75, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
};
const wrappedAvgs = { M011: 12, M012: 8, M016: 0.5, M018: 3, M020: 75 };
const wrappedSel = new Set(Object.keys(wrappedMetrics));

const wUnit = calculateUnitImpact('BITIRICILIK', wrappedMetrics, wrappedSel, null, wrappedAvgs, minBaseline, null);
assert(typeof wUnit === 'number' && isFinite(wUnit), `MetricValue wrapper → finite unit (got ${wUnit})`);
assert(Math.abs(wUnit - 1.0) < 0.01, `Wrapped metrics at avg → ≈1.0 (got ${wUnit.toFixed(4)})`);

// ─── Null MetricValue → atlanır, NaN üretmez ───────────────────────────────
console.log('Null MetricValue handling:');

const nullMetrics = {
  M011: mv(null, { sampleSize: 0, source: 'incidents' }),
  M012: mv(8, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
  M016: mv(NaN, { sampleSize: 5 }), // NaN → null
  M018: mv(3, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
  M020: mv(75, { sampleSize: 20, source: 'incidents', requiredSample: 15 }),
};

const nUnit = calculateUnitImpact('BITIRICILIK', nullMetrics, wrappedSel, null, wrappedAvgs, minBaseline, null);
assert(typeof nUnit === 'number' && isFinite(nUnit), `Null MetricValues → finite unit (got ${nUnit})`);
assert(!isNaN(nUnit), 'Null MetricValues → no NaN');

// ─── NaN propagation: null * number → NaN olmamalı ─────────────────────────
console.log('NaN propagation safety:');

const nanDangerMetrics = {
  M011: null,
  M012: undefined,
  M016: NaN,
  M018: Infinity,
  M020: -Infinity,
};
const nanSel = new Set(Object.keys(nanDangerMetrics));

const nanUnit = calculateUnitImpact('BITIRICILIK', nanDangerMetrics, nanSel, null, wrappedAvgs, minBaseline, null);
assert(!isNaN(nanUnit), `NaN-dangerous metrics → no NaN (got ${nanUnit})`);
assert(isFinite(nanUnit), `NaN-dangerous metrics → finite (got ${nanUnit})`);

// ─── Sıfır lig ortalaması → 0/0 koruması ───────────────────────────────────
console.log('Zero league average protection:');

const zeroAvgs = { M011: 0, M012: 0, M016: 0, M018: 0, M020: 0 };
const safeMetrics = { M011: 12, M012: 8, M016: 0.5, M018: 3, M020: 75 };
const safeSel = new Set(Object.keys(safeMetrics));

const zUnit = calculateUnitImpact('BITIRICILIK', safeMetrics, safeSel, null, zeroAvgs, minBaseline, null);
assert(!isNaN(zUnit), `Zero league avg → no NaN (got ${zUnit})`);
assert(isFinite(zUnit), `Zero league avg → finite (got ${zUnit})`);

// ─── Confidence weighting ───────────────────────────────────────────────────
console.log('Confidence weighting:');

// Yüksek confidence metrikler → normal etki
const highConfMetrics = {
  M011: mv(18, { sampleSize: 30, source: 'incidents', requiredSample: 15 }), // conf = 30/(30+15) = 0.67
  M012: mv(12, { sampleSize: 30, source: 'incidents', requiredSample: 15 }),
  M016: mv(1.0, { sampleSize: 30, source: 'incidents', requiredSample: 15 }),
  M018: mv(5, { sampleSize: 30, source: 'incidents', requiredSample: 15 }),
  M020: mv(85, { sampleSize: 30, source: 'incidents', requiredSample: 15 }),
};

// Düşük confidence → etkisi azaltılmış olmalı
const lowConfMetrics = {
  M011: mv(18, { sampleSize: 2, source: 'incidents', requiredSample: 15 }), // conf = 2/(2+15) = 0.12
  M012: mv(12, { sampleSize: 2, source: 'incidents', requiredSample: 15 }),
  M016: mv(1.0, { sampleSize: 2, source: 'incidents', requiredSample: 15 }),
  M018: mv(5, { sampleSize: 2, source: 'incidents', requiredSample: 15 }),
  M020: mv(85, { sampleSize: 2, source: 'incidents', requiredSample: 15 }),
};

const hcAvgs = { M011: 12, M012: 8, M016: 0.5, M018: 3, M020: 75 };
const hcSel = new Set(Object.keys(highConfMetrics));

const highConfUnit = calculateUnitImpact('BITIRICILIK', highConfMetrics, hcSel, null, hcAvgs, minBaseline, null);
const lowConfUnit = calculateUnitImpact('BITIRICILIK', lowConfMetrics, hcSel, null, hcAvgs, minBaseline, null);

// Her iki sonuç da geçerli olmalı
assert(isFinite(highConfUnit) && !isNaN(highConfUnit), `High confidence → finite (${highConfUnit.toFixed(4)})`);
assert(isFinite(lowConfUnit) && !isNaN(lowConfUnit), `Low confidence → finite (${lowConfUnit.toFixed(4)})`);

// Düşük confidence → 1.0'a daha yakın (etkisi azaltılmış)
const highDist = Math.abs(highConfUnit - 1.0);
const lowDist = Math.abs(lowConfUnit - 1.0);
assert(lowDist <= highDist + 0.001,
  `Low confidence closer to 1.0: |${lowConfUnit.toFixed(4)} - 1.0| = ${lowDist.toFixed(4)} ≤ |${highConfUnit.toFixed(4)} - 1.0| = ${highDist.toFixed(4)}`);

// ─── Tüm SIM_BLOCKS blokları için NaN güvenliği ────────────────────────────
console.log('All SIM_BLOCKS NaN safety:');

const blockNames = Object.keys(SIM_BLOCKS);
// Geniş metrik seti — tüm blokları kapsasın
const allIds = new Set();
for (const name of blockNames) {
  for (const m of SIM_BLOCKS[name]) allIds.add(m.id);
}

// Tüm metriklere makul değer ver
const fullMetrics = {};
const fullAvgs = {};
for (const id of allIds) {
  fullMetrics[id] = 50; // genel bir değer
  fullAvgs[id] = 50;
}

for (const name of blockNames) {
  const u = calculateUnitImpact(name, fullMetrics, allIds, null, fullAvgs, minBaseline, null);
  assert(!isNaN(u), `Block ${name}: no NaN (got ${u})`);
  assert(isFinite(u), `Block ${name}: finite (got ${u})`);
}

// Tüm metrikler null — NaN üretmemeli
for (const name of blockNames) {
  const u = calculateUnitImpact(name, {}, allIds, null, fullAvgs, minBaseline, null);
  assert(!isNaN(u), `Block ${name} (empty): no NaN (got ${u})`);
  assert(u === 1.0, `Block ${name} (empty): neutral 1.0 (got ${u})`);
}

// ─── Metrik aralık kontrolleri ──────────────────────────────────────────────
console.log('MetricValue range enforcement:');

// mv() ile oluşturulan wrapper'lar doğru aralıkta olmalı
const pctMetric = mv(50, { sampleSize: 10, requiredSample: 15 });
assert(pctMetric.confidence >= 0 && pctMetric.confidence <= 1, `confidence 0-1: got ${pctMetric.confidence}`);
assert(pctMetric.value === 50, 'value preserved');

const highSample = mv(80, { sampleSize: 1000, requiredSample: 15 });
assert(highSample.confidence > 0.95, `High sample → high confidence: got ${highSample.confidence.toFixed(4)}`);

const lowSample = mv(80, { sampleSize: 1, requiredSample: 15 });
assert(lowSample.confidence < 0.10, `Low sample → low confidence: got ${lowSample.confidence.toFixed(4)}`);

// unwrap → düz sayıya dönüş
assert(unwrap(pctMetric) === 50, 'unwrap wrapped metric → value');
assert(unwrap(null) === null, 'unwrap null → null');
assert(unwrap(42) === 42, 'unwrap plain number → number');

// getConfidence → doğru değer
assert(getConfidence(pctMetric) === pctMetric.confidence, 'getConfidence wrapped');
assert(getConfidence(42) === 1.0, 'getConfidence plain number');
assert(getConfidence(null) === 0, 'getConfidence null');

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
