/**
 * simulation.test.js — Simülasyon determinizm ve temel doğruluk testleri
 * Çalıştırma: node tests/simulation.test.js
 */

'use strict';

const { simulateSingleRun, simulateMultipleRuns, calculateUnitImpact, SIM_BLOCKS } = require('../src/engine/match-simulator');

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

function approxEqual(a, b, tolerance = 1e-6) {
  return Math.abs(a - b) < tolerance;
}

console.log('=== simulation.test.js ===\n');

// ─── Seeded RNG helper ──────────────────────────────────────────────────────
// Basit mulberry32 PRNG — aynı seed → aynı dizi
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minimum geçerli baseline objesi
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

// Minimum metrikler seti — hücum ve savunma temeli
const minMetrics = {
  M001: 1.5, M002: 1.2, M011: 12, M012: 8, M013: 12, M014: 4.5,
  M015: 5, M016: 0.5, M017: 2, M018: 3, M019: 0.1, M020: 75,
  M021: 3, M022: 5, M023: 5, M024: 3,
  M026: 1.0, M028: 60, M033: 12, M034: 4, M035: 18, M036: 50, M037: 15,
  M039: 1.8, M040: 0.05, M044: 10,
  M050: 55, M051: 50, M052: 48, M053: 1.8, M054: 53, M055: 1.5,
  M070: 1.8, M072: 2, M076: 35, M085: 60,
  M096: 70, M150: 52, M157: 3,
};

const selectedMetrics = new Set(Object.keys(minMetrics));

// ─── Determinizm Testi ──────────────────────────────────────────────────────
console.log('Determinism (same seed → same result):');

const params1 = {
  homeMetrics: minMetrics,
  awayMetrics: minMetrics,
  selectedMetrics,
  lineups: null,
  weatherMetrics: null,
  baseline: minBaseline,
  rng: mulberry32(42),
  audit: null,
  homeSubQuality: null,
  awaySubQuality: null,
  dynamicAvgs: null,
  homeAdvantage: 1.0,
  dynamicTimeWindows: null,
};

const params2 = {
  ...params1,
  rng: mulberry32(42), // aynı seed
};

const run1 = simulateSingleRun(params1);
const run2 = simulateSingleRun(params2);

assert(run1.result.homeGoals === run2.result.homeGoals,
  `Determinism: homeGoals match (${run1.result.homeGoals} vs ${run2.result.homeGoals})`);
assert(run1.result.awayGoals === run2.result.awayGoals,
  `Determinism: awayGoals match (${run1.result.awayGoals} vs ${run2.result.awayGoals})`);
assert(run1.events.length === run2.events.length,
  `Determinism: event count match (${run1.events.length} vs ${run2.events.length})`);

// Farklı seed → büyük olasılıkla farklı sonuç (1000 denemede aynı olma ihtimali çok düşük)
const run3 = simulateSingleRun({ ...params1, rng: mulberry32(999) });
// Not: aynı olabilir ama unlikely. Sadece fonksiyonun çalıştığını doğruluyoruz.
assert(typeof run3.result.homeGoals === 'number', 'Different seed produces valid result');

// ─── simulateSingleRun Çıktı Yapısı ────────────────────────────────────────
console.log('simulateSingleRun output structure:');

assert(run1.result != null, 'result exists');
assert(typeof run1.result.homeGoals === 'number', 'result.homeGoals is number');
assert(typeof run1.result.awayGoals === 'number', 'result.awayGoals is number');
assert(run1.result.homeGoals >= 0, 'homeGoals >= 0');
assert(run1.result.awayGoals >= 0, 'awayGoals >= 0');
assert(Array.isArray(run1.events), 'events is array');
assert(run1.events.length > 0, 'events is non-empty (at minimum halftime + fulltime)');

// Her event minute ve type alanına sahip olmalı
const validEvents = run1.events.filter(e => typeof e.minute === 'number' && typeof e.type === 'string');
assert(validEvents.length === run1.events.length, 'All events have minute and type');

// Halftime event var mı?
const htEvent = run1.events.find(e => e.type === 'halftime');
assert(htEvent != null, 'Halftime event exists');

// ─── simulateMultipleRuns Çıktı Yapısı ─────────────────────────────────────
console.log('simulateMultipleRuns output structure:');

const multiResult = simulateMultipleRuns({
  ...params1,
  rng: mulberry32(12345),
  runs: 100, // az sayıda ama yeterli
});

assert(multiResult.runs === 100, 'runs count preserved');
assert(multiResult.distribution != null, 'distribution exists');

const d = multiResult.distribution;
assert(typeof d.homeWin === 'number', 'homeWin is number');
assert(typeof d.draw === 'number', 'draw is number');
assert(typeof d.awayWin === 'number', 'awayWin is number');

// 1X2 toplamı ~100 olmalı (yuvarlama farkı ±0.5)
const total1X2 = d.homeWin + d.draw + d.awayWin;
assert(Math.abs(total1X2 - 100) < 1.0, `1X2 sum ≈ 100 (got ${total1X2})`);

assert(typeof d.over15 === 'number', 'over15 is number');
assert(typeof d.over25 === 'number', 'over25 is number');
assert(typeof d.btts === 'number', 'btts is number');
assert(typeof d.avgGoals === 'number', 'avgGoals is number');
assert(d.avgGoals >= 0, 'avgGoals >= 0');

// Uncertainty/CI95
assert(d.uncertainty != null, 'uncertainty exists');
assert(Array.isArray(d.uncertainty.ci95HomeWin), 'ci95HomeWin is array');
assert(d.uncertainty.ci95HomeWin.length === 2, 'ci95HomeWin has [low, high]');
assert(d.uncertainty.ci95HomeWin[0] <= d.uncertainty.ci95HomeWin[1], 'ci95HomeWin lower <= upper');
assert(typeof d.uncertainty.stdHomeGoals === 'number', 'stdHomeGoals is number');
assert(typeof d.uncertainty.stdAwayGoals === 'number', 'stdAwayGoals is number');

// HT dağılımı
assert(d.ht != null, 'ht distribution exists');
assert(typeof d.ht.homeWin === 'number', 'ht.homeWin is number');

// HT/FT
assert(d.htft != null, 'htft distribution exists');
assert(d.htft.probs != null, 'htft.probs exists');

// topScore
assert(d.topScore == null || typeof d.topScore === 'string', 'topScore is string or null');

// sampleRun
assert(multiResult.sampleRun != null, 'sampleRun exists');
assert(typeof multiResult.sampleRun.result.homeGoals === 'number', 'sampleRun has homeGoals');

// ─── calculateUnitImpact ────────────────────────────────────────────────────
console.log('calculateUnitImpact:');

// Tüm metrikler lig ortalamasındaysa → birim 1.0'a yakın olmalı
const avgMetrics = {};
for (const id of Object.keys(minMetrics)) avgMetrics[id] = minMetrics[id];
const dynAvgs = { ...minMetrics }; // lig ort = takım değerleri
const allSel = new Set(Object.keys(minMetrics));

const unitBit = calculateUnitImpact('BITIRICILIK', avgMetrics, allSel, null, dynAvgs, minBaseline, null);
assert(typeof unitBit === 'number', 'calculateUnitImpact returns number');
assert(isFinite(unitBit), 'calculateUnitImpact returns finite');
// Tüm metrikler lig ort = kendi değeriyse, normalized=1.0, unit=1.0
assert(Math.abs(unitBit - 1.0) < 0.01, `Unit at league average ≈ 1.0 (got ${unitBit.toFixed(4)})`);

// Veri olmayan blok → 1.0 (nötr)
const emptyUnit = calculateUnitImpact('BITIRICILIK', {}, allSel, null, dynAvgs, minBaseline, null);
assert(emptyUnit === 1.0, `Empty metrics → 1.0 (got ${emptyUnit})`);

// Olmayan blok → 1.0
const nonExistent = calculateUnitImpact('NONEXISTENT_BLOCK', avgMetrics, allSel, null, dynAvgs, minBaseline, null);
assert(nonExistent === 1.0, `Non-existent block → 1.0 (got ${nonExistent})`);

// ─── SIM_BLOCKS Yapısal Bütünlük ──────────────────────────────────────────
console.log('SIM_BLOCKS structural integrity:');

assert(typeof SIM_BLOCKS === 'object', 'SIM_BLOCKS is object');
const blockNames = Object.keys(SIM_BLOCKS);
assert(blockNames.length > 0, 'SIM_BLOCKS has blocks');

// Her bloktaki metrikler benzersiz olmalı (blok içi duplicate yok)
for (const name of blockNames) {
  const ids = SIM_BLOCKS[name].map(m => m.id);
  const unique = new Set(ids);
  assert(ids.length === unique.size, `Block ${name}: no duplicate metric IDs`);
}

// Cross-block duplicate kontrolü: bir metrik ID birden fazla blokta olmamalı
const allMetricIds = [];
const blockOfMetric = {};
let crossDupe = false;
for (const name of blockNames) {
  for (const m of SIM_BLOCKS[name]) {
    if (blockOfMetric[m.id]) {
      crossDupe = true;
      console.error(`    Duplicate: ${m.id} in ${blockOfMetric[m.id]} and ${name}`);
    }
    blockOfMetric[m.id] = name;
    allMetricIds.push(m.id);
  }
}
assert(!crossDupe, 'No cross-block duplicate metric IDs');

// Her metrik geçerli yapıya sahip
for (const name of blockNames) {
  for (const m of SIM_BLOCKS[name]) {
    assert(typeof m.id === 'string' && m.id.startsWith('M'), `${name}: ${m.id} is valid metric ID`);
    assert(typeof m.weight === 'number' && m.weight > 0, `${name}: ${m.id} has positive weight`);
    assert(m.sign === 1 || m.sign === -1, `${name}: ${m.id} has valid sign`);
  }
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
