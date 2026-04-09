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

module.exports = { poissonPMF, poissonExceed, samplePoisson, weightedAvg, clamp, round2 };
