/**
 * ablation.js — Metrik Ablasyon Testi
 *
 * Her metriği tek tek çıkarıp Brier score değişimini ölçer.
 * Brier artışı büyük olan metrikler önemli, küçük olanlar gürültü.
 *
 * Kullanım: node src/scripts/ablation.js <backtest-results.json>
 *
 * backtest-results.json formatı:
 *   [{ eventId, predictions: { homeWin, draw, awayWin }, actual: '1'|'X'|'2' }, ...]
 */

'use strict';

const fs = require('fs');
const path = require('path');

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

async function runAblation(backtestPath) {
  if (!fs.existsSync(backtestPath)) {
    console.error(`Backtest file not found: ${backtestPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
  console.log(`Loaded ${data.length} backtest results`);

  // Baseline Brier score (tüm metriklerle)
  const baselineBrier = brierScore(data);
  console.log(`Baseline Brier Score: ${baselineBrier.toFixed(4)}`);

  // Her metrik için ablasyon (backtest verisinde metrik bilgisi varsa)
  // Bu çerçeve, gerçek ablasyon için prediction pipeline'a entegre edilmeli.
  // Şimdilik sadece çerçeve ve Brier hesaplama doğrulaması sağlanır.

  const results = {
    baselineBrier: baselineBrier,
    sampleSize: data.length,
    timestamp: new Date().toISOString(),
    note: 'Full ablation requires re-running prediction pipeline per metric. This script provides the scoring framework.',
  };

  const outputPath = path.join(path.dirname(backtestPath), 'feature-importance.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Results saved to: ${outputPath}`);
}

const backtestFile = process.argv[2];
if (!backtestFile) {
  console.log('Kullanım: node src/scripts/ablation.js <backtest-results.json>');
  process.exit(0);
}

runAblation(backtestFile);
