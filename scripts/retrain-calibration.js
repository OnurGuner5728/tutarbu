#!/usr/bin/env node
/**
 * Retrain Calibration — 301 maçlık backtest verisinden Platt + Competition kalibrasyon
 * parametrelerini yeniden eğitir ve calibration-params.json'a kaydeder.
 *
 * Ayrıca kalibrasyon öncesi/sonrası Brier Score karşılaştırması yapar.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { trainCalibration, calibrateProbs, saveCalibration, PARAMS_FILE } = require('../src/engine/calibration');

// ─── Backtest JSON'dan maç verilerini yükle ───────────────────────
const BACKTEST_FILE = path.join(__dirname, '..', 'backtest_comprehensive.json');

if (!fs.existsSync(BACKTEST_FILE)) {
  console.error('❌ backtest_comprehensive.json bulunamadı!');
  process.exit(1);
}

const backtest = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf8'));
const rawMatches = backtest.matches || [];

console.log(`\n📊 Backtest verisinden kalibrasyon eğitimi başlıyor...`);
console.log(`   Toplam maç: ${rawMatches.length}`);

// ─── Maç verilerini calibration formatına dönüştür ────────────────
const calMatches = rawMatches
  .filter(m => m.model && m.actual && m.actual.result)
  .map(m => ({
    probHome: m.model.probs[0],   // 0-1 aralığında
    probDraw: m.model.probs[1],
    probAway: m.model.probs[2],
    actualResult: m.actual.result, // '1', 'X', '2'
    leagueId: m.leagueId ?? null,
    league: m.league,
  }));

console.log(`   Geçerli maç: ${calMatches.length}`);

// ─── Kalibrasyon öncesi performans ────────────────────────────────
function brierScore(probs, actual) {
  const indicators = [
    actual === '1' ? 1 : 0,
    actual === 'X' ? 1 : 0,
    actual === '2' ? 1 : 0,
  ];
  return indicators.reduce((sum, ind, i) => sum + Math.pow(probs[i] - ind, 2), 0);
}

let preBrierSum = 0;
for (const m of calMatches) {
  preBrierSum += brierScore([m.probHome, m.probDraw, m.probAway], m.actualResult);
}
const preBrier = preBrierSum / calMatches.length;

// ─── Eğitim ──────────────────────────────────────────────────────
console.log(`\n🔧 Platt Scaling + Competition Calibration eğitiliyor...`);
const params = trainCalibration(calMatches, { shrinkage: 25 });

console.log(`\n✅ Eğitim tamamlandı!`);
console.log(`   Platt Home: A=${params.platt.home.A.toFixed(4)}, B=${params.platt.home.B.toFixed(4)} (n=${params.platt.home.n})`);
console.log(`   Platt Draw: A=${params.platt.draw.A.toFixed(4)}, B=${params.platt.draw.B.toFixed(4)} (n=${params.platt.draw.n})`);
console.log(`   Platt Away: A=${params.platt.away.A.toFixed(4)}, B=${params.platt.away.B.toFixed(4)} (n=${params.platt.away.n})`);

// Competition multipliers
console.log(`\n📐 Lig bazlı çarpanlar:`);
const compKeys = Object.keys(params.competition);
for (const lid of compKeys) {
  const c = params.competition[lid];
  const leagueName = lid === 'global' ? 'GLOBAL' : (calMatches.find(m => String(m.leagueId) === lid)?.league || lid);
  const n = calMatches.filter(m => String(m.leagueId) === lid).length;
  console.log(`   ${leagueName.padEnd(45)} H=${c.home.toFixed(3)} D=${c.draw.toFixed(3)} A=${c.away.toFixed(3)} (n=${lid === 'global' ? calMatches.length : n})`);
}

// ─── Kalibrasyon sonrası performans ──────────────────────────────
let postBrierSum = 0;
let postAccCorrect = 0;

// Kalibrasyon eğrisi: bin'ler
const bins = {};
const BIN_SIZE = 0.1;

for (const m of calMatches) {
  const calProbs = calibrateProbs(
    [m.probHome, m.probDraw, m.probAway],
    m.leagueId,
    params
  );

  postBrierSum += brierScore(calProbs, m.actualResult);

  // Accuracy
  const maxIdx = calProbs.indexOf(Math.max(...calProbs));
  const predicted = ['1', 'X', '2'][maxIdx];
  if (predicted === m.actualResult) postAccCorrect++;

  // Kalibrasyon bins (homeWin)
  const binKey = Math.floor(calProbs[0] / BIN_SIZE) * BIN_SIZE;
  if (!bins[binKey]) bins[binKey] = { sumPred: 0, sumAct: 0, n: 0 };
  bins[binKey].sumPred += calProbs[0];
  bins[binKey].sumAct += (m.actualResult === '1' ? 1 : 0);
  bins[binKey].n += 1;
}

const postBrier = postBrierSum / calMatches.length;
const postAcc = postAccCorrect / calMatches.length;

// Pre accuracy
let preAccCorrect = 0;
for (const m of calMatches) {
  const probs = [m.probHome, m.probDraw, m.probAway];
  const maxIdx = probs.indexOf(Math.max(...probs));
  const predicted = ['1', 'X', '2'][maxIdx];
  if (predicted === m.actualResult) preAccCorrect++;
}
const preAcc = preAccCorrect / calMatches.length;

// ─── Sonuçlar ────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`         KALİBRASYON SONUÇLARI (n=${calMatches.length})`);
console.log(`══════════════════════════════════════════════════════════════`);
console.log(`                    ÖNCE         SONRA        FARK`);
console.log(`   Brier Score : ${preBrier.toFixed(4)}       ${postBrier.toFixed(4)}       ${(postBrier - preBrier).toFixed(4)} ${postBrier < preBrier ? '✅' : '⚠️'}`);
console.log(`   1X2 Accuracy: ${(preAcc * 100).toFixed(1)}%        ${(postAcc * 100).toFixed(1)}%        ${((postAcc - preAcc) * 100).toFixed(1)}pp ${postAcc >= preAcc ? '✅' : '⚠️'}`);

// Bookmaker karşılaştırması
const bkMatches = rawMatches.filter(m => m.bookmaker && m.bookmaker.probs);
if (bkMatches.length > 0) {
  let bkBrierSum = 0;
  for (const m of bkMatches) {
    bkBrierSum += brierScore(m.bookmaker.probs, m.actual.result);
  }
  const bkBrier = bkBrierSum / bkMatches.length;
  console.log(`   Bookmaker   : ${bkBrier.toFixed(4)}       —            (referans)`);
  console.log(`   vs Bookmaker: ${postBrier < bkBrier ? '✅ Model daha iyi' : '⚠️ Bookmaker daha iyi'} (fark: ${(postBrier - bkBrier).toFixed(4)})`);
}

// Kalibrasyon eğrisi
console.log(`\n── Kalibrasyon Eğrisi (Ev Sahibi Galibiyeti) ──────────────`);
console.log(`   Bin       Pred     Actual   n     Fark`);
const sortedBins = Object.keys(bins).map(Number).sort((a, b) => a - b);
for (const bk of sortedBins) {
  const b = bins[bk];
  const meanPred = b.sumPred / b.n;
  const meanAct = b.sumAct / b.n;
  const bar = Math.abs(meanPred - meanAct) < 0.05 ? '✅' : (meanPred > meanAct ? '↑ over' : '↓ under');
  console.log(`   ${bk.toFixed(1)}-${(bk + BIN_SIZE).toFixed(1)}   ${meanPred.toFixed(3)}    ${meanAct.toFixed(3)}    ${String(b.n).padStart(3)}   ${bar}`);
}

// ─── Beraberlik analizi ──────────────────────────────────────────
console.log(`\n── Beraberlik Kalibrasyon Analizi ──────────────────────────`);
const drawBins = {};
for (const m of calMatches) {
  const calProbs = calibrateProbs(
    [m.probHome, m.probDraw, m.probAway],
    m.leagueId,
    params
  );
  const drawProb = calProbs[1];
  const binKey = Math.floor(drawProb / BIN_SIZE) * BIN_SIZE;
  if (!drawBins[binKey]) drawBins[binKey] = { sumPred: 0, sumAct: 0, n: 0 };
  drawBins[binKey].sumPred += drawProb;
  drawBins[binKey].sumAct += (m.actualResult === 'X' ? 1 : 0);
  drawBins[binKey].n += 1;
}
console.log(`   Bin       Pred     Actual   n     Fark`);
const drawSortedBins = Object.keys(drawBins).map(Number).sort((a, b) => a - b);
for (const bk of drawSortedBins) {
  const b = drawBins[bk];
  const meanPred = b.sumPred / b.n;
  const meanAct = b.sumAct / b.n;
  const bar = Math.abs(meanPred - meanAct) < 0.05 ? '✅' : (meanPred > meanAct ? '↑ over' : '↓ under');
  console.log(`   ${bk.toFixed(1)}-${(bk + BIN_SIZE).toFixed(1)}   ${meanPred.toFixed(3)}    ${meanAct.toFixed(3)}    ${String(b.n).padStart(3)}   ${bar}`);
}

// ─── Kaydet ──────────────────────────────────────────────────────
saveCalibration(params);
console.log(`\n💾 Kalibrasyon parametreleri kaydedildi: ${PARAMS_FILE}`);
console.log(`   trainedAt: ${params.trainedAt}`);
console.log(`\n✅ Tamamlandı!`);
