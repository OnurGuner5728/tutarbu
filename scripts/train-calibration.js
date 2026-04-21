#!/usr/bin/env node
'use strict';
/**
 * Kalibrasyon Eğitimi
 * backtest_comprehensive.json'dan Platt scaling + competition params öğrenir.
 * Çıktı: src/engine/calibration-params.json
 *
 * Kullanım: node scripts/train-calibration.js [--backtest-file backtest_comprehensive.json]
 */

const fs   = require('fs');
const path = require('path');

const { trainCalibration, saveCalibration } = require('../src/engine/calibration');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let backtestFileName = 'backtest_comprehensive.json';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--backtest-file' && args[i + 1]) {
    backtestFileName = args[i + 1];
    i++;
  }
}

const PROJECT_ROOT   = path.join(__dirname, '..');
const backtestPath   = path.join(PROJECT_ROOT, backtestFileName);
const outputPath     = path.join(PROJECT_ROOT, 'src', 'engine', 'calibration-params.json');

// ---------------------------------------------------------------------------
// Load backtest data
// ---------------------------------------------------------------------------

if (!fs.existsSync(backtestPath)) {
  console.error(`[train-calibration] ERROR: Backtest file not found: ${backtestPath}`);
  console.error('  Bir backtest dosyası oluşturmak için önce comprehensive-backtest.js çalıştırın.');
  process.exit(1);
}

let backtestData;
try {
  backtestData = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));
} catch (err) {
  console.error(`[train-calibration] ERROR: JSON parse hatası — ${backtestPath}`);
  console.error(' ', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Extract per-match data
// The comprehensive backtest stores per-date results inside r.matches;
// the per-date backtest files store them inside r.results.
// We support both layouts.
// ---------------------------------------------------------------------------

let matches = [];

if (Array.isArray(backtestData.matches)) {
  // Layout A: { matches: [...] }
  matches = backtestData.matches;
} else if (Array.isArray(backtestData.results)) {
  // Layout B: { results: [...] } — single-date backtest
  matches = backtestData.results;
} else if (Array.isArray(backtestData.days)) {
  // Layout C: { days: [{ results: [...] }, ...] }
  for (const day of backtestData.days) {
    if (Array.isArray(day.results)) matches.push(...day.results);
    else if (Array.isArray(day.matches)) matches.push(...day.matches);
  }
} else {
  // Fallback: scan all top-level array values
  for (const val of Object.values(backtestData)) {
    if (Array.isArray(val) && val.length > 0 && val[0].probHome != null) {
      matches = val;
      break;
    }
  }
}

// Normalize: backtest_comprehensive.json uses { model: { probs: [h,d,a] }, actual: { result } }
// Older format may use { probHome, probDraw, probAway, actualResult }
const normalizedMatches = matches.map(m => {
  if (m.probHome != null) return m;  // already in flat format
  // Comprehensive backtest format → normalize
  const probs = m.model?.probs;
  const result = m.actual?.result;
  if (!Array.isArray(probs) || probs.length < 3 || result == null) return null;
  return {
    probHome: probs[0], probDraw: probs[1], probAway: probs[2],
    actualResult: result,
    leagueId: m.leagueId ?? m.tournament ?? null,
    league: m.league ?? null,
    pOU25: m.model?.pOU25 ?? null, actualOU25: m.actual?.ou25 ?? null,
    pBTTS: m.model?.pBTTS ?? null, actualBTTS: m.actual?.btts ?? null,
  };
}).filter(Boolean);

// Validate that we have usable per-match data
const validMatches = normalizedMatches.filter(
  m => m.probHome != null && m.probDraw != null && m.probAway != null && m.actualResult != null && m.actualResult !== '?'
);

if (validMatches.length === 0) {
  console.error('[train-calibration] ERROR: Kullanılabilir per-match veri bulunamadı.');
  console.error(`  Backtest dosyasındaki top-level keys: ${Object.keys(backtestData).join(', ')}`);
  console.error(`  matches dizisi uzunluğu: ${matches.length}`);
  console.error('  İlk eleman örneği:', JSON.stringify(matches[0]).substring(0, 200));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Train
// ---------------------------------------------------------------------------

console.log(`[train-calibration] ${validMatches.length} maç ile kalibrasyon eğitimi başlıyor…`);

const params = trainCalibration(validMatches);

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

saveCalibration(params, outputPath);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const p = params.platt ?? {};
const c = params.competition ?? {};

console.log('\n=== Kalibrasyon Eğitim Özeti ===');
console.log(`Eğitilen maç sayısı : ${validMatches.length}`);
console.log(`Çıktı dosyası       : ${outputPath}`);
console.log(`Eğitim zamanı       : ${params.trainedAt}`);

console.log('\nPlatt Parametreleri:');
for (const outcome of ['home', 'draw', 'away']) {
  const pp = p[outcome];
  if (pp) {
    console.log(`  ${outcome.padEnd(5)}: A=${pp.A.toFixed(4)}  B=${pp.B.toFixed(4)}  n=${pp.n}`);
  }
}

console.log('\nLig Bazlı Ayarlama Çarpanları:');
for (const [lid, mults] of Object.entries(c)) {
  console.log(
    `  ${lid.slice(0, 40).padEnd(40)}: home=${mults.home.toFixed(3)}  draw=${mults.draw.toFixed(3)}  away=${mults.away.toFixed(3)}`
  );
}

console.log('\n[train-calibration] Tamamlandı.\n');
