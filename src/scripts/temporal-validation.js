/**
 * temporal-validation.js — Temporal Split Out-of-Sample Validation
 *
 * Backtest verisini zamana gore boler: ilk %70 train, son %30 test.
 * Train set'ten kalibrasyon parametreleri ogrenir, test set'te degerlendirir.
 *
 * Kullanim: node src/scripts/temporal-validation.js <backtest-results.json>
 *
 * Her iki backtest formati da desteklenir:
 *   Format A (eski): [{ predictions:{homeWin,draw,awayWin}, actual, timestamp }]
 *   Format B (backtest-runner): { results:[{ probHome,probDraw,probAway, actualResult, matchDate }] }
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Format normalization — backtest-runner ciktisini script formatina cevirir
// ---------------------------------------------------------------------------
function normalizeData(raw) {
  // Unwrap {results:[...]} wrapper
  let arr = Array.isArray(raw) ? raw : (Array.isArray(raw.results) ? raw.results : []);

  return arr.map(d => {
    // Already in expected format?
    if (d.homeWin != null && d.actual != null) return d;

    // Backtest-runner format: probHome/probDraw/probAway + actualResult + matchDate
    return {
      homeWin: d.probHome ?? d.predictions?.homeWin ?? 33.3,
      draw:    d.probDraw ?? d.predictions?.draw ?? 33.3,
      awayWin: d.probAway ?? d.predictions?.awayWin ?? 33.3,
      actual:  d.actualResult ?? d.actual ?? 'X',
      timestamp: d.matchDate ?? d.timestamp ?? d.date ?? null,
      // Preserve extra fields
      tournamentId: d.tournamentId ?? null,
      confidence: d.confidence ?? null,
      confidenceTier: d.confidenceTier ?? null,
    };
  }).filter(d => d.actual === '1' || d.actual === 'X' || d.actual === '2');
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

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

function logLoss(predictions) {
  if (predictions.length === 0) return NaN;
  const EPS = 1e-15;
  let total = 0;
  for (const p of predictions) {
    const probs = [
      Math.max(EPS, Math.min(1 - EPS, p.homeWin / 100)),
      Math.max(EPS, Math.min(1 - EPS, p.draw / 100)),
      Math.max(EPS, Math.min(1 - EPS, p.awayWin / 100)),
    ];
    const actual = p.actual === '1' ? 0 : p.actual === 'X' ? 1 : 2;
    total -= Math.log(probs[actual]);
  }
  return total / predictions.length;
}

function calibrationBins(predictions, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ predicted: 0, actual: 0, count: 0 }));

  for (const p of predictions) {
    const outcomes = [
      { prob: p.homeWin / 100, hit: p.actual === '1' },
      { prob: p.draw / 100, hit: p.actual === 'X' },
      { prob: p.awayWin / 100, hit: p.actual === '2' },
    ];
    for (const o of outcomes) {
      const binIdx = Math.min(nBins - 1, Math.floor(o.prob * nBins));
      bins[binIdx].predicted += o.prob;
      bins[binIdx].actual += o.hit ? 1 : 0;
      bins[binIdx].count++;
    }
  }

  return bins.map((b, i) => ({
    range: `${(i / nBins * 100).toFixed(0)}-${((i + 1) / nBins * 100).toFixed(0)}%`,
    avgPredicted: b.count > 0 ? +(b.predicted / b.count).toFixed(4) : null,
    avgActual: b.count > 0 ? +(b.actual / b.count).toFixed(4) : null,
    count: b.count,
    gap: b.count > 0 ? +((b.predicted / b.count) - (b.actual / b.count)).toFixed(4) : null,
  }));
}

function ece(calibBins) {
  let totalWeightedGap = 0;
  let totalCount = 0;
  for (const bin of calibBins) {
    if (bin.count > 0 && bin.gap != null) {
      totalWeightedGap += Math.abs(bin.gap) * bin.count;
      totalCount += bin.count;
    }
  }
  return totalCount > 0 ? totalWeightedGap / totalCount : NaN;
}

// ---------------------------------------------------------------------------
// Platt scaling (grid search)
// ---------------------------------------------------------------------------

function fitPlattParams(trainData) {
  const EPS = 1e-7;
  const logit = p => Math.log(Math.max(EPS, p) / Math.max(EPS, 1 - p));

  let bestA = 1, bestB = 0, bestLoss = Infinity;

  // Coarse grid search
  for (let a = 0.5; a <= 2.0; a += 0.1) {
    for (let b = -1.0; b <= 1.0; b += 0.1) {
      let loss = 0;
      let n = 0;
      for (const p of trainData) {
        const outcomes = [
          { prob: p.homeWin / 100, hit: p.actual === '1' ? 1 : 0 },
          { prob: p.draw / 100, hit: p.actual === 'X' ? 1 : 0 },
          { prob: p.awayWin / 100, hit: p.actual === '2' ? 1 : 0 },
        ];
        for (const o of outcomes) {
          const calibrated = 1 / (1 + Math.exp(-(a * logit(o.prob) + b)));
          const clipped = Math.max(EPS, Math.min(1 - EPS, calibrated));
          loss -= o.hit * Math.log(clipped) + (1 - o.hit) * Math.log(1 - clipped);
          n++;
        }
      }
      loss /= n;
      if (loss < bestLoss) {
        bestLoss = loss;
        bestA = a;
        bestB = b;
      }
    }
  }

  return { a: bestA, b: bestB };
}

function applyPlatt(predictions, a, b) {
  const EPS = 1e-7;
  const logit = p => Math.log(Math.max(EPS, p) / Math.max(EPS, 1 - p));
  const sigmoid = x => 1 / (1 + Math.exp(-x));

  return predictions.map(p => {
    const rawH = sigmoid(a * logit(p.homeWin / 100) + b);
    const rawD = sigmoid(a * logit(p.draw / 100) + b);
    const rawA = sigmoid(a * logit(p.awayWin / 100) + b);
    const total = rawH + rawD + rawA;
    return {
      homeWin: (rawH / total) * 100,
      draw: (rawD / total) * 100,
      awayWin: (rawA / total) * 100,
      actual: p.actual,
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runValidation(backtestPath) {
  if (!fs.existsSync(backtestPath)) {
    console.error(`Backtest file not found: ${backtestPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
  const data = normalizeData(raw);
  console.log(`Loaded ${data.length} backtest results`);

  if (data.length < 20) {
    console.error('Not enough data for temporal validation (need >= 20).');
    process.exit(1);
  }

  // Zamana gore sirala
  const sorted = [...data].sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tA - tB;
  });

  // %70 / %30 split
  const splitIdx = Math.floor(sorted.length * 0.7);
  const train = sorted.slice(0, splitIdx);
  const test = sorted.slice(splitIdx);

  console.log(`Train: ${train.length} matches, Test: ${test.length} matches`);

  if (test.length < 10) {
    console.error('Test set too small (< 10). Need more data.');
    process.exit(1);
  }

  // -- Uncalibrated test performance --
  const testBrier = brierScore(test);
  const testLogLoss = logLoss(test);
  const testCalibBins = calibrationBins(test);
  const testECE = ece(testCalibBins);

  console.log('\n-- Uncalibrated Test Set --');
  console.log(`Brier Score:  ${testBrier.toFixed(4)}`);
  console.log(`Log Loss:     ${testLogLoss.toFixed(4)}`);
  console.log(`ECE:          ${testECE.toFixed(4)}`);

  // -- Train set'ten Platt parametreleri ogren --
  const platt = fitPlattParams(train);
  console.log(`\nPlatt params (from train): a=${platt.a.toFixed(2)}, b=${platt.b.toFixed(2)}`);

  // -- Calibrated test performance --
  const calibratedTest = applyPlatt(test, platt.a, platt.b);
  const calBrier = brierScore(calibratedTest);
  const calLogLoss = logLoss(calibratedTest);
  const calCalibBins = calibrationBins(calibratedTest);
  const calECE = ece(calCalibBins);

  console.log('\n-- Calibrated Test Set --');
  console.log(`Brier Score:  ${calBrier.toFixed(4)}`);
  console.log(`Log Loss:     ${calLogLoss.toFixed(4)}`);
  console.log(`ECE:          ${calECE.toFixed(4)}`);

  console.log(`\nCalibration D Brier: ${(calBrier - testBrier).toFixed(4)} (negative = improvement)`);
  console.log(`Calibration D ECE:   ${(calECE - testECE).toFixed(4)} (negative = improvement)`);

  // -- Train set metrics for comparison --
  const trainBrier = brierScore(train);
  const trainLogLoss = logLoss(train);

  console.log('\n-- Train Set (for reference) --');
  console.log(`Brier Score:  ${trainBrier.toFixed(4)}`);
  console.log(`Log Loss:     ${trainLogLoss.toFixed(4)}`);

  const overfit = testBrier - trainBrier;
  console.log(`\nOverfit gap: ${overfit.toFixed(4)} (large positive = overfitting)`);

  // -- Per-confidence-tier breakdown --
  const tiers = {};
  for (const d of test) {
    const tier = d.confidenceTier || 'UNKNOWN';
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(d);
  }
  if (Object.keys(tiers).length > 1) {
    console.log('\n-- Per-Tier Test Brier --');
    for (const [tier, items] of Object.entries(tiers)) {
      if (items.length >= 5) {
        console.log(`  ${tier}: ${brierScore(items).toFixed(4)} (n=${items.length})`);
      }
    }
  }

  // -- Sonuclari kaydet --
  const results = {
    timestamp: new Date().toISOString(),
    totalSamples: data.length,
    trainSize: train.length,
    testSize: test.length,
    splitRatio: 0.7,

    train: {
      brier: +trainBrier.toFixed(4),
      logLoss: +trainLogLoss.toFixed(4),
    },

    testUncalibrated: {
      brier: +testBrier.toFixed(4),
      logLoss: +testLogLoss.toFixed(4),
      ece: +testECE.toFixed(4),
      calibrationBins: testCalibBins,
    },

    testCalibrated: {
      brier: +calBrier.toFixed(4),
      logLoss: +calLogLoss.toFixed(4),
      ece: +calECE.toFixed(4),
      calibrationBins: calCalibBins,
      plattParams: platt,
    },

    overfitGap: +overfit.toFixed(4),
    calibrationImprovement: {
      brier: +(calBrier - testBrier).toFixed(4),
      ece: +(calECE - testECE).toFixed(4),
    },
  };

  const outputPath = path.join(path.dirname(backtestPath), 'validation-report.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nResults saved to: ${outputPath}`);
}

const backtestFile = process.argv[2];
if (!backtestFile) {
  console.log('Kullanim: node src/scripts/temporal-validation.js <backtest-results.json>');
  process.exit(0);
}

runValidation(backtestFile);
