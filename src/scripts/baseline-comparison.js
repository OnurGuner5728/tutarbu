/**
 * baseline-comparison.js — Basit Poisson Baseline vs Tam Model Karsilastirmasi
 *
 * Basit Poisson modeli (sadece standings'ten lambda_home + lambda_away) ile
 * tam modelin Brier score karsilastirmasini yapar.
 *
 * Kullanim: node src/scripts/baseline-comparison.js <backtest-results.json>
 *
 * Her iki backtest formati da desteklenir:
 *   Format A: [{ predictions:{homeWin,draw,awayWin}, simpleLambda:{home,away}, actual }]
 *   Format B: { results:[{ probHome,probDraw,probAway, poisson:{lambdaHome,lambdaAway}, actualResult }] }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { poissonPMF } = require('../engine/math-utils');

// ---------------------------------------------------------------------------
// Format normalization
// ---------------------------------------------------------------------------
function normalizeData(raw) {
  let arr = Array.isArray(raw) ? raw : (Array.isArray(raw.results) ? raw.results : []);

  return arr.map(d => {
    const homeWin = d.homeWin ?? d.probHome ?? d.predictions?.homeWin ?? null;
    const draw    = d.draw ?? d.probDraw ?? d.predictions?.draw ?? null;
    const awayWin = d.awayWin ?? d.probAway ?? d.predictions?.awayWin ?? null;
    const actual  = d.actual ?? d.actualResult ?? null;

    // Lambda: try simpleLambda first, then poisson object
    const lambdaHome = d.simpleLambda?.home ?? d.poisson?.lambdaHome ?? null;
    const lambdaAway = d.simpleLambda?.away ?? d.poisson?.lambdaAway ?? null;

    if (homeWin == null || actual == null) return null;

    return {
      homeWin, draw, awayWin, actual,
      simpleLambda: (lambdaHome != null && lambdaAway != null)
        ? { home: lambdaHome, away: lambdaAway }
        : null,
      tournamentId: d.tournamentId ?? null,
      confidenceTier: d.confidenceTier ?? null,
    };
  }).filter(d => d != null && (d.actual === '1' || d.actual === 'X' || d.actual === '2'));
}

// ---------------------------------------------------------------------------
// Scoring
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
  const total = homeWin + draw + awayWin;
  if (total <= 0) return { homeWin: 33.3, draw: 33.3, awayWin: 33.3 };
  return {
    homeWin: (homeWin / total) * 100,
    draw: (draw / total) * 100,
    awayWin: (awayWin / total) * 100,
  };
}

function bootstrapDifference(fullBriers, simpleBriers, nBoot = 5000) {
  const n = fullBriers.length;
  if (n === 0) return { mean: 0, ci95: [0, 0], significant: false };

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
    significant: (lo > 0 || hi < 0),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runComparison(backtestPath) {
  if (!fs.existsSync(backtestPath)) {
    console.error(`Backtest file not found: ${backtestPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
  const data = normalizeData(raw);
  console.log(`Loaded ${data.length} backtest results`);

  // Full model Brier score
  const fullBrier = brierScore(data);
  console.log(`Full Model Brier Score: ${fullBrier.toFixed(4)}`);

  // Random baseline
  const randomBrier = 2/3; // 0.6667
  console.log(`Random Baseline Brier:  ${randomBrier.toFixed(4)}`);
  console.log(`Skill vs Random:        ${((1 - fullBrier / randomBrier) * 100).toFixed(1)}%`);

  // Simple Poisson model (where lambda data available)
  const withLambda = data.filter(d => d.simpleLambda != null);

  const results = {
    fullModelBrier: +fullBrier.toFixed(4),
    randomBrier: +randomBrier.toFixed(4),
    skillVsRandom: +((1 - fullBrier / randomBrier) * 100).toFixed(1),
    sampleSize: data.length,
    timestamp: new Date().toISOString(),
  };

  if (withLambda.length > 0) {
    console.log(`\nSimple Poisson comparison: ${withLambda.length} matches with lambda data`);

    const simplePredictions = withLambda.map(d => {
      const probs = simplePoissonProbs(d.simpleLambda.home, d.simpleLambda.away);
      return { ...probs, actual: d.actual };
    });

    const simpleBrier = brierScore(simplePredictions);
    const fullSubset = brierScore(withLambda);
    console.log(`Simple Poisson Brier Score: ${simpleBrier.toFixed(4)}`);
    console.log(`Full Model (subset) Brier:  ${fullSubset.toFixed(4)}`);
    console.log(`Improvement: ${((simpleBrier - fullSubset) / simpleBrier * 100).toFixed(2)}% (positive = full model better)`);

    // Per-match Brier scores for bootstrap
    const fullPerMatch = withLambda.map(d => {
      const probs = [d.homeWin / 100, d.draw / 100, d.awayWin / 100];
      const actual = d.actual === '1' ? [1, 0, 0] : d.actual === 'X' ? [0, 1, 0] : [0, 0, 1];
      return probs.reduce((s, p, i) => s + Math.pow(p - actual[i], 2), 0);
    });
    const simplePerMatch = simplePredictions.map(d => {
      const probs = [d.homeWin / 100, d.draw / 100, d.awayWin / 100];
      const actual = d.actual === '1' ? [1, 0, 0] : d.actual === 'X' ? [0, 1, 0] : [0, 0, 1];
      return probs.reduce((s, p, i) => s + Math.pow(p - actual[i], 2), 0);
    });

    const boot = bootstrapDifference(fullPerMatch, simplePerMatch);
    console.log(`Bootstrap D mean: ${boot.mean.toFixed(4)} (negative = full model better)`);
    console.log(`Bootstrap 95% CI: [${boot.ci95[0].toFixed(4)}, ${boot.ci95[1].toFixed(4)}]`);
    console.log(`Statistically significant: ${boot.significant}`);

    results.simpleModelBrier = +simpleBrier.toFixed(4);
    results.fullModelSubsetBrier = +fullSubset.toFixed(4);
    results.improvement = +((simpleBrier - fullSubset) / simpleBrier * 100).toFixed(2);
    results.bootstrap = {
      mean: +boot.mean.toFixed(4),
      ci95: [+boot.ci95[0].toFixed(4), +boot.ci95[1].toFixed(4)],
      significant: boot.significant,
    };
    results.simpleModelSampleSize = withLambda.length;

    // Per-tier comparison
    const tiers = {};
    for (let i = 0; i < withLambda.length; i++) {
      const tier = withLambda[i].confidenceTier || 'ALL';
      if (!tiers[tier]) tiers[tier] = { full: [], simple: [] };
      tiers[tier].full.push(fullPerMatch[i]);
      tiers[tier].simple.push(simplePerMatch[i]);
    }
    if (Object.keys(tiers).length > 1) {
      console.log('\n-- Per-Tier Comparison --');
      results.perTier = {};
      for (const [tier, d] of Object.entries(tiers)) {
        if (d.full.length >= 5) {
          const avgFull = d.full.reduce((s, v) => s + v, 0) / d.full.length;
          const avgSimple = d.simple.reduce((s, v) => s + v, 0) / d.simple.length;
          console.log(`  ${tier}: Full=${avgFull.toFixed(4)}, Simple=${avgSimple.toFixed(4)}, D=${(avgFull - avgSimple).toFixed(4)} (n=${d.full.length})`);
          results.perTier[tier] = {
            fullBrier: +avgFull.toFixed(4),
            simpleBrier: +avgSimple.toFixed(4),
            delta: +(avgFull - avgSimple).toFixed(4),
            n: d.full.length,
          };
        }
      }
    }
  } else {
    console.log('\nNo lambda data found. Add poisson:{lambdaHome,lambdaAway} to backtest results for comparison.');
    results.note = 'No lambda data in backtest file.';
  }

  const outputPath = path.join(path.dirname(backtestPath), 'baseline-comparison.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nResults saved to: ${outputPath}`);
}

const backtestFile = process.argv[2];
if (!backtestFile) {
  console.log('Kullanim: node src/scripts/baseline-comparison.js <backtest-results.json>');
  process.exit(0);
}

runComparison(backtestFile);
