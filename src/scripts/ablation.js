/**
 * ablation.js — Motor ve Sinyal Ablasyon Analizi
 *
 * Backtest verisinden:
 *   1. Motor ablasyonu: Poisson-only vs Simulation-only vs Final blend
 *   2. Confidence tier analizi: Her tier'in ayrı performans profili
 *   3. Turnuva bazlı analiz: Hangi liglerde model iyi/kotu
 *   4. Draw detection: Beraberlik tahmin kapasitesi
 *   5. Calibration gap: Tahmin yonu bazinda sistematik sapma
 *
 * Kullanim: node src/scripts/ablation.js <backtest-results.json>
 *
 * Her iki backtest formati da desteklenir.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Format normalization
// ---------------------------------------------------------------------------
function normalizeData(raw) {
  let arr = Array.isArray(raw) ? raw : (Array.isArray(raw.results) ? raw.results : []);

  return arr.map(d => {
    const probHome = d.probHome ?? d.predictions?.homeWin ?? null;
    const probDraw = d.probDraw ?? d.predictions?.draw ?? null;
    const probAway = d.probAway ?? d.predictions?.awayWin ?? null;
    const actual   = d.actualResult ?? d.actual ?? null;

    if (probHome == null || actual == null) return null;
    if (actual !== '1' && actual !== 'X' && actual !== '2') return null;

    return {
      probHome, probDraw, probAway, actual,
      poisson: d.poisson ?? null,
      simulation: d.simulation ?? null,
      confidenceTier: d.confidenceTier ?? 'UNKNOWN',
      isHighConfidence: d.isHighConfidence ?? false,
      tournamentId: d.tournamentId ?? null,
      tournament: d.tournament ?? null,
      brierScore: d.brierScore ?? null,
      confidence: d.confidence ?? null,
      maxProbability: d.maxProbability ?? null,
    };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function brierScore(preds) {
  if (preds.length === 0) return NaN;
  let total = 0;
  for (const p of preds) {
    const probs = [p.pH / 100, p.pD / 100, p.pA / 100];
    const actual = p.actual === '1' ? [1, 0, 0] : p.actual === 'X' ? [0, 1, 0] : [0, 0, 1];
    for (let i = 0; i < 3; i++) total += (probs[i] - actual[i]) ** 2;
  }
  return total / preds.length;
}

function accuracy(preds) {
  if (preds.length === 0) return NaN;
  let hits = 0;
  for (const p of preds) {
    const predicted = p.pH >= p.pD && p.pH >= p.pA ? '1' : (p.pA >= p.pH && p.pA >= p.pD ? '2' : 'X');
    if (predicted === p.actual) hits++;
  }
  return (hits / preds.length) * 100;
}

function toPred(d, source) {
  if (source === 'final') return { pH: d.probHome, pD: d.probDraw, pA: d.probAway, actual: d.actual };
  if (source === 'poisson' && d.poisson) return { pH: d.poisson.homeWin, pD: d.poisson.draw, pA: d.poisson.awayWin, actual: d.actual };
  if (source === 'simulation' && d.simulation) return { pH: d.simulation.homeWin, pD: d.simulation.draw, pA: d.simulation.awayWin, actual: d.actual };
  return null;
}

// Naive "always pick favorite" baseline
function naiveFavoriteBrier(data) {
  // Assume favorites win with 100% confidence
  const preds = data.map(d => {
    const maxP = Math.max(d.probHome, d.probDraw, d.probAway);
    return {
      pH: d.probHome === maxP ? 100 : 0,
      pD: d.probDraw === maxP ? 100 : 0,
      pA: d.probAway === maxP ? 100 : 0,
      actual: d.actual,
    };
  });
  return brierScore(preds);
}

// Uniform 33/33/33 baseline
function uniformBrier(data) {
  const preds = data.map(d => ({ pH: 33.33, pD: 33.33, pA: 33.33, actual: d.actual }));
  return brierScore(preds);
}

// ---------------------------------------------------------------------------
// Analysis modules
// ---------------------------------------------------------------------------

function engineAblation(data) {
  const finalPreds = data.map(d => toPred(d, 'final')).filter(Boolean);
  const poissonPreds = data.map(d => toPred(d, 'poisson')).filter(Boolean);
  const simPreds = data.map(d => toPred(d, 'simulation')).filter(Boolean);

  return {
    final: {
      brier: +brierScore(finalPreds).toFixed(4),
      accuracy: +accuracy(finalPreds).toFixed(1),
      n: finalPreds.length,
    },
    poisson: poissonPreds.length > 0 ? {
      brier: +brierScore(poissonPreds).toFixed(4),
      accuracy: +accuracy(poissonPreds).toFixed(1),
      n: poissonPreds.length,
    } : null,
    simulation: simPreds.length > 0 ? {
      brier: +brierScore(simPreds).toFixed(4),
      accuracy: +accuracy(simPreds).toFixed(1),
      n: simPreds.length,
    } : null,
    uniform: +uniformBrier(data).toFixed(4),
    naiveFavorite: +naiveFavoriteBrier(data).toFixed(4),
  };
}

function confidenceTierAnalysis(data) {
  const tiers = {};
  for (const d of data) {
    const tier = d.confidenceTier || 'UNKNOWN';
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(d);
  }

  const result = {};
  for (const [tier, items] of Object.entries(tiers)) {
    const preds = items.map(d => toPred(d, 'final')).filter(Boolean);
    if (preds.length < 3) continue;
    result[tier] = {
      brier: +brierScore(preds).toFixed(4),
      accuracy: +accuracy(preds).toFixed(1),
      n: preds.length,
      avgMaxProb: +(items.reduce((s, d) => s + (d.maxProbability || 0), 0) / items.length).toFixed(1),
    };
  }
  return result;
}

function tournamentAnalysis(data) {
  const tournaments = {};
  for (const d of data) {
    const tid = d.tournamentId || 'unknown';
    const tname = d.tournament || `ID:${tid}`;
    if (!tournaments[tid]) tournaments[tid] = { name: tname, items: [] };
    tournaments[tid].items.push(d);
  }

  const result = {};
  for (const [tid, t] of Object.entries(tournaments)) {
    const preds = t.items.map(d => toPred(d, 'final')).filter(Boolean);
    if (preds.length < 5) continue;
    result[tid] = {
      name: t.name,
      brier: +brierScore(preds).toFixed(4),
      accuracy: +accuracy(preds).toFixed(1),
      n: preds.length,
    };
  }

  // Sort by brier (best first)
  const sorted = Object.entries(result).sort((a, b) => a[1].brier - b[1].brier);
  return Object.fromEntries(sorted);
}

function drawDetectionAnalysis(data) {
  const preds = data.map(d => toPred(d, 'final')).filter(Boolean);
  const actualDraws = preds.filter(p => p.actual === 'X');
  const predictedDraws = preds.filter(p => p.pD >= p.pH && p.pD >= p.pA);

  // Draw olduğunda model ne tahmin etti?
  const drawWhenActual = actualDraws.length > 0
    ? {
      correctlyPredicted: actualDraws.filter(p => p.pD >= p.pH && p.pD >= p.pA).length,
      total: actualDraws.length,
      rate: +(actualDraws.filter(p => p.pD >= p.pH && p.pD >= p.pA).length / actualDraws.length * 100).toFixed(1),
      avgDrawProb: +(actualDraws.reduce((s, p) => s + p.pD, 0) / actualDraws.length).toFixed(1),
    }
    : null;

  // Model draw tahmin ettiğinde ne oldu?
  const drawWhenPredicted = predictedDraws.length > 0
    ? {
      actuallyDraw: predictedDraws.filter(p => p.actual === 'X').length,
      total: predictedDraws.length,
      precision: +(predictedDraws.filter(p => p.actual === 'X').length / predictedDraws.length * 100).toFixed(1),
    }
    : null;

  // Draw probability distribution
  const drawProbs = preds.map(p => p.pD);
  const avgDrawProb = drawProbs.reduce((s, v) => s + v, 0) / drawProbs.length;
  const actualDrawRate = actualDraws.length / preds.length * 100;

  return {
    actualDrawRate: +actualDrawRate.toFixed(1),
    avgPredictedDrawProb: +avgDrawProb.toFixed(1),
    gap: +(actualDrawRate - avgDrawProb).toFixed(1),
    drawRecall: drawWhenActual,
    drawPrecision: drawWhenPredicted,
  };
}

function calibrationGapAnalysis(data) {
  const preds = data.map(d => toPred(d, 'final')).filter(Boolean);

  // Bin predictions into 5 probability ranges for each outcome
  const bins = [
    { range: '0-20%', min: 0, max: 20 },
    { range: '20-40%', min: 20, max: 40 },
    { range: '40-60%', min: 40, max: 60 },
    { range: '60-80%', min: 60, max: 80 },
    { range: '80-100%', min: 80, max: 100 },
  ];

  const outcomes = ['home', 'draw', 'away'];
  const result = {};

  for (const outcome of outcomes) {
    result[outcome] = bins.map(bin => {
      const items = preds.filter(p => {
        const prob = outcome === 'home' ? p.pH : outcome === 'draw' ? p.pD : p.pA;
        return prob >= bin.min && prob < bin.max;
      });

      if (items.length < 3) return { ...bin, count: items.length, avgPred: null, actualRate: null, gap: null };

      const actualKey = outcome === 'home' ? '1' : outcome === 'draw' ? 'X' : '2';
      const avgPred = items.reduce((s, p) => {
        return s + (outcome === 'home' ? p.pH : outcome === 'draw' ? p.pD : p.pA);
      }, 0) / items.length;
      const actualRate = items.filter(p => p.actual === actualKey).length / items.length * 100;

      return {
        ...bin,
        count: items.length,
        avgPred: +avgPred.toFixed(1),
        actualRate: +actualRate.toFixed(1),
        gap: +(avgPred - actualRate).toFixed(1),
      };
    });
  }

  return result;
}

function surpriseAnalysis(data) {
  // En buyuk surpizler: yuksek olasılık ama yanlis
  const preds = data.map(d => ({
    ...toPred(d, 'final'),
    tournament: d.tournament,
    confidence: d.confidence,
    brierScore: d.brierScore,
  })).filter(Boolean);

  const sorted = [...preds].sort((a, b) => {
    const bsA = a.brierScore ?? ((a.pH / 100 - (a.actual === '1' ? 1 : 0)) ** 2 + (a.pD / 100 - (a.actual === 'X' ? 1 : 0)) ** 2 + (a.pA / 100 - (a.actual === '2' ? 1 : 0)) ** 2);
    const bsB = b.brierScore ?? ((b.pH / 100 - (b.actual === '1' ? 1 : 0)) ** 2 + (b.pD / 100 - (b.actual === 'X' ? 1 : 0)) ** 2 + (b.pA / 100 - (b.actual === '2' ? 1 : 0)) ** 2);
    return bsB - bsA;
  });

  return {
    worst10: sorted.slice(0, 10).map(p => ({
      predicted: `${p.pH.toFixed(0)}/${p.pD.toFixed(0)}/${p.pA.toFixed(0)}`,
      actual: p.actual,
      brier: p.brierScore ?? +((p.pH / 100 - (p.actual === '1' ? 1 : 0)) ** 2 + (p.pD / 100 - (p.actual === 'X' ? 1 : 0)) ** 2 + (p.pA / 100 - (p.actual === '2' ? 1 : 0)) ** 2).toFixed(4),
    })),
    best10: sorted.slice(-10).reverse().map(p => ({
      predicted: `${p.pH.toFixed(0)}/${p.pD.toFixed(0)}/${p.pA.toFixed(0)}`,
      actual: p.actual,
      brier: p.brierScore ?? +((p.pH / 100 - (p.actual === '1' ? 1 : 0)) ** 2 + (p.pD / 100 - (p.actual === 'X' ? 1 : 0)) ** 2 + (p.pA / 100 - (p.actual === '2' ? 1 : 0)) ** 2).toFixed(4),
    })),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runAblation(backtestPath) {
  if (!fs.existsSync(backtestPath)) {
    console.error(`Backtest file not found: ${backtestPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
  const data = normalizeData(raw);
  console.log(`Loaded ${data.length} backtest results`);

  if (data.length < 10) {
    console.error('Not enough data for ablation analysis (need >= 10).');
    process.exit(1);
  }

  // 1. Engine ablation
  console.log('\n== ENGINE ABLATION ==');
  const engines = engineAblation(data);
  console.log(`  Final Blend:    Brier=${engines.final.brier}, Acc=${engines.final.accuracy}% (n=${engines.final.n})`);
  if (engines.poisson) console.log(`  Poisson-Only:   Brier=${engines.poisson.brier}, Acc=${engines.poisson.accuracy}% (n=${engines.poisson.n})`);
  if (engines.simulation) console.log(`  Simulation-Only:Brier=${engines.simulation.brier}, Acc=${engines.simulation.accuracy}% (n=${engines.simulation.n})`);
  console.log(`  Uniform 33/33:  Brier=${engines.uniform}`);
  console.log(`  Naive Favorite: Brier=${engines.naiveFavorite}`);

  // Blend contribution
  if (engines.poisson && engines.simulation) {
    const blendBetter = engines.final.brier < engines.poisson.brier && engines.final.brier < engines.simulation.brier;
    console.log(`  Blend helps? ${blendBetter ? 'YES - blend beats both engines' : 'NO - at least one engine alone is better'}`);
  }

  // 2. Confidence tier
  console.log('\n== CONFIDENCE TIER ANALYSIS ==');
  const tiers = confidenceTierAnalysis(data);
  for (const [tier, stats] of Object.entries(tiers)) {
    console.log(`  ${tier}: Brier=${stats.brier}, Acc=${stats.accuracy}%, AvgMaxProb=${stats.avgMaxProb}% (n=${stats.n})`);
  }

  // 3. Tournament analysis
  console.log('\n== TOURNAMENT ANALYSIS (sorted by Brier, best first) ==');
  const tournaments = tournamentAnalysis(data);
  for (const [tid, stats] of Object.entries(tournaments)) {
    console.log(`  ${stats.name}: Brier=${stats.brier}, Acc=${stats.accuracy}% (n=${stats.n})`);
  }

  // 4. Draw detection
  console.log('\n== DRAW DETECTION ==');
  const draws = drawDetectionAnalysis(data);
  console.log(`  Actual draw rate: ${draws.actualDrawRate}%`);
  console.log(`  Avg predicted draw prob: ${draws.avgPredictedDrawProb}%`);
  console.log(`  Gap: ${draws.gap > 0 ? '+' : ''}${draws.gap} pp (positive = model underestimates draws)`);
  if (draws.drawRecall) {
    console.log(`  Draw recall: ${draws.drawRecall.correctlyPredicted}/${draws.drawRecall.total} (${draws.drawRecall.rate}%)`);
  }
  if (draws.drawPrecision) {
    console.log(`  Draw precision: ${draws.drawPrecision.actuallyDraw}/${draws.drawPrecision.total} (${draws.drawPrecision.precision}%)`);
  }

  // 5. Calibration gap
  console.log('\n== CALIBRATION GAP ANALYSIS ==');
  const calGaps = calibrationGapAnalysis(data);
  for (const [outcome, bins] of Object.entries(calGaps)) {
    console.log(`  ${outcome}:`);
    for (const bin of bins) {
      if (bin.count < 3) continue;
      const gapStr = bin.gap > 0 ? `+${bin.gap}` : `${bin.gap}`;
      console.log(`    ${bin.range}: pred=${bin.avgPred}%, actual=${bin.actualRate}%, gap=${gapStr}pp (n=${bin.count})`);
    }
  }

  // 6. Surprise analysis
  console.log('\n== BIGGEST SURPRISES (worst predictions) ==');
  const surprises = surpriseAnalysis(data);
  for (const s of surprises.worst10) {
    console.log(`  ${s.predicted} -> actual=${s.actual}, brier=${s.brier}`);
  }

  // Save full report
  const report = {
    timestamp: new Date().toISOString(),
    sampleSize: data.length,
    engines,
    confidenceTiers: tiers,
    tournaments,
    drawDetection: draws,
    calibrationGaps: calGaps,
    surprises,
  };

  const outputPath = path.join(path.dirname(backtestPath), 'feature-importance.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nFull report saved to: ${outputPath}`);
}

const backtestFile = process.argv[2];
if (!backtestFile) {
  console.log('Kullanim: node src/scripts/ablation.js <backtest-results.json>');
  process.exit(0);
}

runAblation(backtestFile);
