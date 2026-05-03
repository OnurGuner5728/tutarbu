/**
 * auto-calibrate.js — Backtest Verisinden Otomatik Kalibrasyon
 *
 * Backtest JSON dosyasindan Platt + Competition kalibrasyon parametrelerini
 * ogrenir ve calibration-params.json'a yazar.
 *
 * Kullanim: node src/scripts/auto-calibrate.js <backtest-results.json> [--dry-run]
 *
 * --dry-run: Parametreleri hesaplar ama dosyaya yazmaz.
 *
 * Her iki backtest formati da desteklenir:
 *   Format A: [{ probHome,probDraw,probAway, actualResult, tournamentId }]
 *   Format B: { results:[{ probHome,probDraw,probAway, actualResult, tournamentId }] }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { trainCalibration, calibrateProbs, saveCalibration, PARAMS_FILE } = require('../engine/calibration');

// ---------------------------------------------------------------------------
// Format normalization
// ---------------------------------------------------------------------------
function normalizeData(raw) {
  let arr = Array.isArray(raw) ? raw : (Array.isArray(raw.results) ? raw.results : []);

  return arr.map(d => {
    const probHome = d.probHome ?? d.predictions?.homeWin ?? null;
    const probDraw = d.probDraw ?? d.predictions?.draw ?? null;
    const probAway = d.probAway ?? d.predictions?.awayWin ?? null;
    const actualResult = d.actualResult ?? d.actual ?? null;
    const leagueId = d.tournamentId ?? d.leagueId ?? null;

    if (probHome == null || actualResult == null) return null;
    if (actualResult !== '1' && actualResult !== 'X' && actualResult !== '2') return null;

    return { probHome, probDraw, probAway, actualResult, leagueId };
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Brier score helper
// ---------------------------------------------------------------------------
function brierScore(matches) {
  if (matches.length === 0) return NaN;
  let total = 0;
  for (const m of matches) {
    const scale = (m.probHome > 1 || m.probDraw > 1 || m.probAway > 1) ? 100 : 1;
    const pH = m.probHome / scale;
    const pD = m.probDraw / scale;
    const pA = m.probAway / scale;
    const oH = m.actualResult === '1' ? 1 : 0;
    const oD = m.actualResult === 'X' ? 1 : 0;
    const oA = m.actualResult === '2' ? 1 : 0;
    total += (pH - oH) ** 2 + (pD - oD) ** 2 + (pA - oA) ** 2;
  }
  return total / matches.length;
}

function brierScoreCalibrated(matches, params) {
  if (matches.length === 0) return NaN;
  let total = 0;
  for (const m of matches) {
    const scale = (m.probHome > 1 || m.probDraw > 1 || m.probAway > 1) ? 100 : 1;
    const raw = [m.probHome / scale, m.probDraw / scale, m.probAway / scale];
    const cal = calibrateProbs(raw, m.leagueId, params);
    const oH = m.actualResult === '1' ? 1 : 0;
    const oD = m.actualResult === 'X' ? 1 : 0;
    const oA = m.actualResult === '2' ? 1 : 0;
    total += (cal[0] - oH) ** 2 + (cal[1] - oD) ** 2 + (cal[2] - oA) ** 2;
  }
  return total / matches.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function runAutoCalibrate(backtestPath, dryRun) {
  if (!fs.existsSync(backtestPath)) {
    console.error(`Backtest file not found: ${backtestPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
  const data = normalizeData(raw);
  console.log(`Loaded ${data.length} matches for calibration`);

  if (data.length < 30) {
    console.error('Not enough data for calibration (need >= 30 matches).');
    process.exit(1);
  }

  // Pre-calibration Brier
  const preBrier = brierScore(data);
  console.log(`\nPre-calibration Brier Score: ${preBrier.toFixed(4)}`);

  // Outcome distribution check
  const counts = { '1': 0, 'X': 0, '2': 0 };
  for (const d of data) counts[d.actualResult]++;
  console.log(`Outcome distribution: 1=${counts['1']} (${(counts['1']/data.length*100).toFixed(1)}%), X=${counts['X']} (${(counts['X']/data.length*100).toFixed(1)}%), 2=${counts['2']} (${(counts['2']/data.length*100).toFixed(1)}%)`);

  // Train calibration
  const params = trainCalibration(data, { shrinkage: 25 });

  // Post-calibration Brier
  const postBrier = brierScoreCalibrated(data, params);
  console.log(`Post-calibration Brier Score: ${postBrier.toFixed(4)}`);
  console.log(`Improvement: ${((preBrier - postBrier) / preBrier * 100).toFixed(2)}%`);

  // Safety checks
  const globalDraw = params.competition?.global?.draw ?? 1.0;
  const DRAW_THRESHOLD = 1.20;
  let safe = true;

  if (globalDraw > DRAW_THRESHOLD) {
    console.warn(`\n[WARNING] Global draw multiplier ${globalDraw.toFixed(3)} exceeds safety threshold ${DRAW_THRESHOLD}.`);
    console.warn('This suggests the model systematically underestimates draws.');
    console.warn('Calibration will be saved but prediction-generator may disable it.');

    // Diagnose: what's the actual draw rate vs predicted draw rate?
    const actualDrawRate = counts['X'] / data.length;
    const predictedDrawRate = data.reduce((s, d) => {
      const scale = (d.probDraw > 1) ? 100 : 1;
      return s + d.probDraw / scale;
    }, 0) / data.length;
    console.log(`  Actual draw rate:    ${(actualDrawRate * 100).toFixed(1)}%`);
    console.log(`  Predicted draw rate: ${(predictedDrawRate * 100).toFixed(1)}%`);
    console.log(`  Gap: ${((actualDrawRate - predictedDrawRate) * 100).toFixed(1)} pp`);
  }

  // Platt diagnostics
  console.log('\n-- Platt Parameters --');
  for (const [outcome, p] of Object.entries(params.platt || {})) {
    console.log(`  ${outcome}: A=${p.A.toFixed(4)}, B=${p.B.toFixed(4)} (n=${p.n})`);
  }

  // Competition diagnostics
  console.log('\n-- Competition Multipliers --');
  for (const [lid, m] of Object.entries(params.competition || {})) {
    console.log(`  League ${lid}: H=${m.home.toFixed(3)}, D=${m.draw.toFixed(3)}, A=${m.away.toFixed(3)}`);
  }

  // Cross-validation: 5-fold to check stability
  console.log('\n-- 5-Fold Cross-Validation --');
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const foldSize = Math.floor(shuffled.length / 5);
  const foldBriers = [];
  for (let f = 0; f < 5; f++) {
    const testStart = f * foldSize;
    const testEnd = f === 4 ? shuffled.length : (f + 1) * foldSize;
    const testFold = shuffled.slice(testStart, testEnd);
    const trainFold = [...shuffled.slice(0, testStart), ...shuffled.slice(testEnd)];

    const foldParams = trainCalibration(trainFold, { shrinkage: 25 });
    const foldBrier = brierScoreCalibrated(testFold, foldParams);
    foldBriers.push(foldBrier);
    console.log(`  Fold ${f + 1}: Brier=${foldBrier.toFixed(4)} (test n=${testFold.length})`);
  }
  const cvMean = foldBriers.reduce((s, v) => s + v, 0) / foldBriers.length;
  const cvStd = Math.sqrt(foldBriers.reduce((s, v) => s + (v - cvMean) ** 2, 0) / foldBriers.length);
  console.log(`  CV Mean: ${cvMean.toFixed(4)} +/- ${cvStd.toFixed(4)}`);

  if (cvMean > preBrier) {
    console.warn('\n[WARNING] Cross-validated Brier is worse than uncalibrated. Calibration may be overfitting.');
    safe = false;
  }

  // Save
  if (dryRun) {
    console.log('\n[DRY RUN] Parameters not saved.');
  } else {
    saveCalibration(params, PARAMS_FILE);
    console.log(`\nCalibration parameters saved to: ${PARAMS_FILE}`);
  }

  // Summary report
  const report = {
    timestamp: new Date().toISOString(),
    sampleSize: data.length,
    outcomeDistribution: counts,
    preBrier: +preBrier.toFixed(4),
    postBrier: +postBrier.toFixed(4),
    improvement: +((preBrier - postBrier) / preBrier * 100).toFixed(2),
    cvMean: +cvMean.toFixed(4),
    cvStd: +cvStd.toFixed(4),
    safe,
    drawMultiplierWarning: globalDraw > DRAW_THRESHOLD,
    params,
  };

  const reportPath = path.join(path.dirname(backtestPath), 'calibration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Calibration report saved to: ${reportPath}`);
}

const backtestFile = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!backtestFile) {
  console.log('Kullanim: node src/scripts/auto-calibrate.js <backtest-results.json> [--dry-run]');
  process.exit(0);
}

runAutoCalibrate(backtestFile, dryRun);
