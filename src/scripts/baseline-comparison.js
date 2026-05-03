/**
 * baseline-comparison.js — Basit Poisson Baseline vs Tam Model Karşılaştırması
 *
 * Basit Poisson modeli (sadece standings'ten λ_home + λ_away) ile
 * tam modelin Brier score karşılaştırmasını yapar.
 *
 * Kullanım: node src/scripts/baseline-comparison.js <backtest-results.json>
 *
 * backtest-results.json formatı:
 *   [{
 *     eventId,
 *     predictions: { homeWin, draw, awayWin },          // tam model (%)
 *     simpleLambda: { home: λH, away: λA },              // basit model lambdaları (opsiyonel)
 *     actual: '1'|'X'|'2'
 *   }, ...]
 *
 * simpleLambda yoksa sadece tam model Brier score hesaplanır.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { poissonPMF } = require('../engine/math-utils');

/**
 * Brier score: düşük = daha iyi
 * BS = (1/N) * Σ Σ (p_ij - o_ij)²
 */
function brierScore(predictions) {
  if (predictions.length === 0) return NaN;
  let total = 0;
  for (const p of predictions) {
    const probs = [p.homeWin / 100, p.draw / 100, p.awayWin / 100];
    const actual = p.actual === '1' ? [1, 0, 0]
      : p.actual === 'X' ? [0, 1, 0]
      : [0, 0, 1];
    for (let i = 0; i < 3; i++) {
      total += Math.pow(probs[i] - actual[i], 2);
    }
  }
  return total / predictions.length;
}

/**
 * Basit Poisson modelinden 1X2 olasılıkları üret.
 * Dixon-Coles düzeltmesi (düşük skorlar için) opsiyonel.
 */
function simplePoissonProbs(lambdaHome, lambdaAway, maxGoals = 10) {
  let homeWin = 0, draw = 0, awayWin = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const prob = poissonPMF(h, lambdaHome) * poissonPMF(a, lambdaAway);
      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;
    }
  }
  // Normalize
  const total = homeWin + draw + awayWin;
  if (total <= 0) return { homeWin: 33.3, draw: 33.3, awayWin: 33.3 };
  return {
    homeWin: (homeWin / total) * 100,
    draw: (draw / total) * 100,
    awayWin: (awayWin / total) * 100,
  };
}

/**
 * Paired difference test: tam model - basit model farkının anlamlılığı
 * Bootstrap CI ile.
 */
function bootstrapDifference(fullBriers, simpleBriers, nBoot = 5000) {
  const n = fullBriers.length;
  if (n === 0) return { mean: 0, ci95: [0, 0] };

  const diffs = fullBriers.map((f, i) => f - simpleBriers[i]);
  const meanDiff = diffs.reduce((s, d) => s + d, 0) / n;

  const bootMeans = [];
  for (let b = 0; b < nBoot; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      sum += diffs[idx];
    }
    bootMeans.push(sum / n);
  }
  bootMeans.sort((a, b) => a - b);

  const lo = bootMeans[Math.floor(nBoot * 0.025)];
  const hi = bootMeans[Math.floor(nBoot * 0.975)];

  return {
    mean: meanDiff,
    ci95: [lo, hi],
    significant: (lo > 0 || hi < 0), // CI sıfırı içermiyorsa anlamlı
  };
}

async function runComparison(backtestPath) {
  if (!fs.existsSync(backtestPath)) {
    console.error(`Backtest file not found: ${backtestPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
  console.log(`Loaded ${data.length} backtest results`);

  // Tam model Brier score
  const fullBrier = brierScore(data);
  console.log(`Full Model Brier Score: ${fullBrier.toFixed(4)}`);

  // Basit Poisson model Brier score (simpleLambda varsa)
  const withLambda = data.filter(d => d.simpleLambda?.home != null && d.simpleLambda?.away != null);

  const results = {
    fullModelBrier: fullBrier,
    sampleSize: data.length,
    timestamp: new Date().toISOString(),
  };

  if (withLambda.length > 0) {
    const simplePredictions = withLambda.map(d => {
      const probs = simplePoissonProbs(d.simpleLambda.home, d.simpleLambda.away);
      return { ...probs, actual: d.actual };
    });

    const simpleBrier = brierScore(simplePredictions);
    console.log(`Simple Poisson Brier Score: ${simpleBrier.toFixed(4)}`);
    console.log(`Improvement: ${((simpleBrier - fullBrier) * 100).toFixed(2)}% (negative = full model worse)`);

    // Per-match Brier scores for bootstrap
    const fullPerMatch = withLambda.map(d => {
      const probs = [d.predictions.homeWin / 100, d.predictions.draw / 100, d.predictions.awayWin / 100];
      const actual = d.actual === '1' ? [1, 0, 0] : d.actual === 'X' ? [0, 1, 0] : [0, 0, 1];
      return probs.reduce((s, p, i) => s + Math.pow(p - actual[i], 2), 0);
    });
    const simplePerMatch = simplePredictions.map(d => {
      const probs = [d.homeWin / 100, d.draw / 100, d.awayWin / 100];
      const actual = d.actual === '1' ? [1, 0, 0] : d.actual === 'X' ? [0, 1, 0] : [0, 0, 1];
      return probs.reduce((s, p, i) => s + Math.pow(p - actual[i], 2), 0);
    });

    const boot = bootstrapDifference(fullPerMatch, simplePerMatch);
    console.log(`Bootstrap Δ mean: ${boot.mean.toFixed(4)}`);
    console.log(`Bootstrap 95% CI: [${boot.ci95[0].toFixed(4)}, ${boot.ci95[1].toFixed(4)}]`);
    console.log(`Statistically significant: ${boot.significant}`);

    results.simpleModelBrier = simpleBrier;
    results.improvement = simpleBrier - fullBrier;
    results.bootstrap = boot;
    results.simpleModelSampleSize = withLambda.length;
  } else {
    console.log('No simpleLambda data found — only full model Brier reported.');
    results.note = 'No simpleLambda data in backtest file. Add simpleLambda: { home, away } to each entry for comparison.';
  }

  const outputPath = path.join(path.dirname(backtestPath), 'baseline-comparison.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results saved to: ${outputPath}`);
}

const backtestFile = process.argv[2];
if (!backtestFile) {
  console.log('Kullanım: node src/scripts/baseline-comparison.js <backtest-results.json>');
  process.exit(0);
}

runComparison(backtestFile);
