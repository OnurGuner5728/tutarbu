/**
 * metric-value.test.js — MetricValue wrapper testleri
 * Çalıştırma: node tests/metric-value.test.js
 */

'use strict';

const { mv, unwrap, getConfidence, getSource, computeRequiredSample } = require('../src/engine/metric-value');

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

console.log('=== metric-value.test.js ===\n');

// ─── mv() ───────────────────────────────────────────────────────────────────
console.log('mv():');

const m1 = mv(42, { sampleSize: 15, source: 'incidents', requiredSample: 15 });
assert(m1.value === 42, 'mv value preserved');
assert(approxEqual(m1.confidence, 0.5), 'confidence = 15/(15+15) = 0.5');
assert(m1.sampleSize === 15, 'sampleSize preserved');
assert(m1.source === 'incidents', 'source preserved');

const m2 = mv(null, { sampleSize: 10, source: 'seasonStats' });
assert(m2.value === null, 'null value preserved');
assert(m2.confidence === 0, 'null value → confidence 0');

const m3 = mv(NaN, { sampleSize: 5 });
assert(m3.value === null, 'NaN → null');
assert(m3.confidence === 0, 'NaN → confidence 0');

const m4 = mv(100, { sampleSize: 0 });
assert(m4.value === 100, 'zero sample size preserves value');
assert(m4.confidence === 0, 'zero sample → confidence 0');

const m5 = mv(50, { sampleSize: 45, requiredSample: 15 });
assert(approxEqual(m5.confidence, 0.75), 'confidence = 45/(45+15) = 0.75');

// ─── unwrap() ───────────────────────────────────────────────────────────────
console.log('unwrap():');

assert(unwrap(42) === 42, 'unwrap plain number');
assert(unwrap(null) === null, 'unwrap null');
assert(unwrap(undefined) === null, 'unwrap undefined');
assert(unwrap(NaN) === null, 'unwrap NaN');
assert(unwrap(Infinity) === null, 'unwrap Infinity');
assert(unwrap({ value: 42, confidence: 0.8 }) === 42, 'unwrap MetricValue');
assert(unwrap({ value: null, confidence: 0 }) === null, 'unwrap MetricValue with null');
assert(unwrap({ value: NaN }) === null, 'unwrap MetricValue with NaN');

// ─── getConfidence() ────────────────────────────────────────────────────────
console.log('getConfidence():');

assert(getConfidence(42) === 1.0, 'plain number → 1.0');
assert(getConfidence(null) === 0, 'null → 0');
assert(getConfidence({ value: 50, confidence: 0.8 }) === 0.8, 'MetricValue confidence');
assert(getConfidence({ value: 50 }) === 1.0, 'MetricValue without confidence → 1.0 (legacy compat)');

// ─── getSource() ────────────────────────────────────────────────────────────
console.log('getSource():');

assert(getSource(42) === 'legacy', 'plain number → legacy');
assert(getSource(null) === 'none', 'null → none');
assert(getSource({ value: 50, source: 'incidents' }) === 'incidents', 'MetricValue source');

// ─── computeRequiredSample() ────────────────────────────────────────────────
console.log('computeRequiredSample():');

assert(computeRequiredSample(null) === 15, 'null → 15');
assert(computeRequiredSample({ leagueTeamCount: 20 }) === 19, '20 teams → 19');
assert(computeRequiredSample({ leagueTeamCount: 4 }) === 5, '4 teams → min 5');

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
