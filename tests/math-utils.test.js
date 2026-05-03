/**
 * math-utils.test.js — Temel matematiksel fonksiyon testleri
 * Çalıştırma: node tests/math-utils.test.js
 */

'use strict';

const { poissonPMF, poissonExceed, binomPMF, weightedAvg, clamp, round2 } = require('../src/engine/math-utils');

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

console.log('=== math-utils.test.js ===\n');

// ─── poissonPMF ─────────────────────────────────────────────────────────────
console.log('poissonPMF:');
assert(poissonPMF(0, 0) === 1, 'P(0|0) = 1');
assert(approxEqual(poissonPMF(0, 2.5), Math.exp(-2.5)), 'P(0|2.5) = e^-2.5');
assert(approxEqual(poissonPMF(1, 1), Math.exp(-1)), 'P(1|1) = e^-1');
assert(approxEqual(poissonPMF(2, 2), 2 * Math.exp(-2)), 'P(2|2) = 2*e^-2');
assert(poissonPMF(5, 0) === 0, 'P(5|0) = 0 (lambda=0, k>0)');
assert(poissonPMF(0, -1) === 1, 'P(0|-1) = 1 (negative lambda edge case)');

// Normalizasyon kontrolü: PMF toplamı ~1 olmalı
let pSum = 0;
for (let k = 0; k <= 20; k++) pSum += poissonPMF(k, 2.5);
assert(approxEqual(pSum, 1.0, 1e-4), `PMF sum(k=0..20, lambda=2.5) ≈ 1.0 (got ${pSum})`);

// ─── poissonExceed ──────────────────────────────────────────────────────────
console.log('poissonExceed:');
const pExceed25 = poissonExceed(2.5, 2.5);
let cdf25 = 0;
for (let k = 0; k <= 2; k++) cdf25 += poissonPMF(k, 2.5);
assert(approxEqual(pExceed25, 1 - cdf25), 'P(X>2.5|2.5) = 1 - CDF(2|2.5)');
assert(poissonExceed(0, 2.5) === 0, 'P(X>2.5|0) = 0');
assert(poissonExceed(-1, 2.5) === 0, 'P(X>2.5|-1) = 0');
assert(approxEqual(poissonExceed(2.5, 0.5), 1 - poissonPMF(0, 2.5), 1e-4), 'Over 0.5 threshold');

// ─── binomPMF ───────────────────────────────────────────────────────────────
console.log('binomPMF:');
assert(binomPMF(0, 0, 0.5) === 1, 'Binom(0,0,0.5) = 1');
assert(approxEqual(binomPMF(5, 2, 0.5), 10 * Math.pow(0.5, 5)), 'Binom(5,2,0.5) = 10/32');
assert(binomPMF(3, 0, 0) === 1, 'Binom(3,0,0) = 1 (p=0)');
assert(binomPMF(3, 3, 1) === 1, 'Binom(3,3,1) = 1 (p=1)');
assert(binomPMF(3, -1, 0.5) === 0, 'Binom(3,-1,0.5) = 0 (k<0)');
assert(binomPMF(3, 4, 0.5) === 0, 'Binom(3,4,0.5) = 0 (k>n)');

// Normalizasyon kontrolü: Binom PMF toplamı = 1
let bSum = 0;
for (let k = 0; k <= 10; k++) bSum += binomPMF(10, k, 0.3);
assert(approxEqual(bSum, 1.0, 1e-6), `Binom sum(k=0..10, n=10, p=0.3) ≈ 1.0 (got ${bSum})`);

// ─── weightedAvg ────────────────────────────────────────────────────────────
console.log('weightedAvg:');
assert(weightedAvg([[50, 1], [50, 1]]) === 50, 'Equal weights → mean');
assert(weightedAvg([[100, 3], [0, 1]]) === 75, 'Weighted 3:1 → 75');
assert(weightedAvg([[null, 1], [50, 1]]) === 50, 'Null value skipped');
assert(weightedAvg([[null, 1], [null, 1]]) === null, 'All null → null');
assert(weightedAvg([]) === null, 'Empty → null');
assert(weightedAvg([[Infinity, 1], [50, 1]]) === 50, 'Infinity skipped');

// ─── clamp ──────────────────────────────────────────────────────────────────
console.log('clamp:');
assert(clamp(5, 0, 10) === 5, 'Within range');
assert(clamp(-5, 0, 10) === 0, 'Below min');
assert(clamp(15, 0, 10) === 10, 'Above max');
assert(clamp(0, 0, 0) === 0, 'All equal');

// ─── round2 ─────────────────────────────────────────────────────────────────
console.log('round2:');
assert(round2(1.234) === 1.23, 'Round to 2 decimals');
assert(round2(1.235) === 1.24, 'Round up');
assert(round2(null) === 0, 'Null → 0');
assert(round2(undefined) === 0, 'Undefined → 0');

// ─── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(40)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
process.exit(failed > 0 ? 1 : 0);
