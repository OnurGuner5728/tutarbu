#!/usr/bin/env node
/**
 * Skor Kalibrasyon Eğitimi + Doğrulama Testi
 * 
 * 301 maçlık backtest verisinden:
 * 1. Skor-spesifik çarpanlar öğrenir
 * 2. Eski vs yeni skor dağılımını karşılaştırır
 * 3. 1X2/OU metriklerinin bozulmadığını doğrular
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { blendScoreDistribution, trainScoreCalibration, applyScoreCalibration, saveScoreCalibration, SCORE_CAL_FILE } = require('../src/engine/score-profile');
const { poissonPMF } = require('../src/engine/math-utils');

const BACKTEST_FILE = path.join(__dirname, '..', 'backtest_comprehensive.json');
const backtest = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf8'));
const rawMatches = backtest.matches || [];

console.log(`\n🔬 Skor Kalibrasyon & Doğrulama Testi`);
console.log(`   Maç sayısı: ${rawMatches.length}\n`);

// ─── Eski Poisson (pure) vs Yeni Blend karşılaştırması ───────────

let oldCorrect = 0, newCorrect = 0;
let oldTop5 = 0, newTop5 = 0;
const oldPredScores = {};
const newPredScores = {};
const calTrainData = []; // Skor kalibrasyon eğitim verisi

// 1X2 ve OU doğruluk kontrolleri
let old1X2 = 0, new1X2 = 0;
let oldOU = 0, newOU = 0;
let oldBTTS = 0, newBTTS = 0;
let oldBrier = 0, newBrier = 0;

function brierScore(probs, actual) {
  const ind = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0];
  return ind.reduce((sum, i, idx) => sum + Math.pow(probs[idx] - i, 2), 0);
}

for (const m of rawMatches) {
  const lh = m.model.lambdaHome;
  const la = m.model.lambdaAway;
  const actual = m.actual.score;
  const actualResult = m.actual.result;
  if (lh == null || la == null) continue;

  // ── Eski: Pure Poisson ──
  const oldScores = [];
  for (let hg = 0; hg <= 8; hg++) {
    for (let ag = 0; ag <= 8; ag++) {
      oldScores.push({ home: hg, away: ag, prob: poissonPMF(hg, lh) * poissonPMF(ag, la) });
    }
  }
  const oldTotal = oldScores.reduce((s, x) => s + x.prob, 0);
  oldScores.forEach(s => s.prob /= oldTotal);
  oldScores.sort((a, b) => b.prob - a.prob);
  
  const oldBest = `${oldScores[0].home}-${oldScores[0].away}`;
  if (oldBest === actual) oldCorrect++;
  if (oldScores.slice(0, 5).some(s => `${s.home}-${s.away}` === actual)) oldTop5++;
  oldPredScores[oldBest] = (oldPredScores[oldBest] || 0) + 1;

  // 1X2
  let oldHW = 0, oldDR = 0, oldAW = 0;
  for (const s of oldScores) {
    if (s.home > s.away) oldHW += s.prob;
    else if (s.home === s.away) oldDR += s.prob;
    else oldAW += s.prob;
  }
  const oldPred1X2 = oldHW >= oldDR && oldHW >= oldAW ? '1' : (oldDR >= oldAW ? 'X' : '2');
  if (oldPred1X2 === actualResult) old1X2++;
  oldBrier += brierScore([oldHW, oldDR, oldAW], actualResult);

  // OU
  let oldOU25 = 0;
  for (const s of oldScores) { if (s.home + s.away > 2.5) oldOU25 += s.prob; }
  if ((oldOU25 > 0.5) === m.actual.ou25) oldOU++;
  // BTTS
  let oldBTTSp = 0;
  for (const s of oldScores) { if (s.home > 0 && s.away > 0) oldBTTSp += s.prob; }
  if ((oldBTTSp > 0.5) === m.actual.btts) oldBTTS++;

  // ── Yeni: Blend (profil olmadan, sadece NegBinom + Poisson) ──
  const blendResult = blendScoreDistribution({
    lambdaHome: lh, lambdaAway: la, rho: 0.1,
    homeProfile: null, awayProfile: null,
    maxGoals: 8, profileWeight: 0.25, negBinomWeight: 0.15, overdispersion: 1.15,
  });
  
  const newScores = blendResult.scores;
  const newBest = `${newScores[0].home}-${newScores[0].away}`;
  if (newBest === actual) newCorrect++;
  if (newScores.slice(0, 5).some(s => `${s.home}-${s.away}` === actual)) newTop5++;
  newPredScores[newBest] = (newPredScores[newBest] || 0) + 1;

  // Kalibrasyon eğitim verisi topla
  const scoreDist = {};
  for (const s of newScores) { scoreDist[`${s.home}-${s.away}`] = s.prob; }
  calTrainData.push({ predictedScoreDist: scoreDist, actualScore: actual });

  // 1X2
  let newHW = 0, newDR = 0, newAW = 0;
  for (const s of newScores) {
    if (s.home > s.away) newHW += s.prob;
    else if (s.home === s.away) newDR += s.prob;
    else newAW += s.prob;
  }
  const newPred1X2 = newHW >= newDR && newHW >= newAW ? '1' : (newDR >= newAW ? 'X' : '2');
  if (newPred1X2 === actualResult) new1X2++;
  newBrier += brierScore([newHW, newDR, newAW], actualResult);

  // OU
  let newOU25 = 0;
  for (const s of newScores) { if (s.home + s.away > 2.5) newOU25 += s.prob; }
  if ((newOU25 > 0.5) === m.actual.ou25) newOU++;
  // BTTS
  let newBTTSp = 0;
  for (const s of newScores) { if (s.home > 0 && s.away > 0) newBTTSp += s.prob; }
  if ((newBTTSp > 0.5) === m.actual.btts) newBTTS++;
}

const n = rawMatches.length;

// ─── Skor Kalibrasyonu Eğit ──────────────────────────────────────
console.log(`🔧 Skor kalibrasyon çarpanları eğitiliyor (n=${calTrainData.length})...\n`);
const scoreCal = trainScoreCalibration(calTrainData, 50);

// Kalibre edilmiş sonuçlar
let calCorrect = 0, calTop5 = 0;
const calPredScores = {};

for (let i = 0; i < rawMatches.length; i++) {
  const m = rawMatches[i];
  const lh = m.model.lambdaHome;
  const la = m.model.lambdaAway;
  const actual = m.actual.score;
  if (lh == null || la == null) continue;

  const blendResult = blendScoreDistribution({
    lambdaHome: lh, lambdaAway: la, rho: 0.1,
    homeProfile: null, awayProfile: null,
    maxGoals: 8, profileWeight: 0.25, negBinomWeight: 0.15, overdispersion: 1.15,
  });
  
  applyScoreCalibration(blendResult.scores, scoreCal);
  const best = `${blendResult.scores[0].home}-${blendResult.scores[0].away}`;
  if (best === actual) calCorrect++;
  if (blendResult.scores.slice(0, 5).some(s => `${s.home}-${s.away}` === actual)) calTop5++;
  calPredScores[best] = (calPredScores[best] || 0) + 1;
}

// ─── Sonuçlar ────────────────────────────────────────────────────
console.log(`══════════════════════════════════════════════════════════════`);
console.log(`          SKOR TAHMİN KARŞILAŞTIRMASI (n=${n})`);
console.log(`══════════════════════════════════════════════════════════════`);
console.log(`                       ESKİ(Poisson)  YENİ(Blend)   +Kalibrasyon`);
console.log(`  #1 Skor Doğru      : ${String(oldCorrect).padStart(3)}/${n} (${((oldCorrect/n)*100).toFixed(1)}%)   ${String(newCorrect).padStart(3)}/${n} (${((newCorrect/n)*100).toFixed(1)}%)   ${String(calCorrect).padStart(3)}/${n} (${((calCorrect/n)*100).toFixed(1)}%)`);
console.log(`  Top5'te Doğru      : ${String(oldTop5).padStart(3)}/${n} (${((oldTop5/n)*100).toFixed(1)}%)   ${String(newTop5).padStart(3)}/${n} (${((newTop5/n)*100).toFixed(1)}%)   ${String(calTop5).padStart(3)}/${n} (${((calTop5/n)*100).toFixed(1)}%)`);
console.log(`  Skor Çeşitliliği   : ${Object.keys(oldPredScores).length} farklı       ${Object.keys(newPredScores).length} farklı       ${Object.keys(calPredScores).length} farklı`);

console.log(`\n── 1X2 / OU / BTTS Doğruluk (Bozulmadığını Kontrol) ────────`);
console.log(`                       ESKİ(Poisson)  YENİ(Blend)`);
console.log(`  1X2 Accuracy       : ${((old1X2/n)*100).toFixed(1)}%          ${((new1X2/n)*100).toFixed(1)}%`);
console.log(`  Brier Score        : ${(oldBrier/n).toFixed(4)}        ${(newBrier/n).toFixed(4)} ${newBrier <= oldBrier ? '✅' : '⚠️'}`);
console.log(`  OU2.5 Accuracy     : ${((oldOU/n)*100).toFixed(1)}%          ${((newOU/n)*100).toFixed(1)}%`);
console.log(`  BTTS Accuracy      : ${((oldBTTS/n)*100).toFixed(1)}%          ${((newBTTS/n)*100).toFixed(1)}%`);

console.log(`\n── Skor Tahmin Dağılımı Karşılaştırması ─────────────────────`);
console.log(`  Skor   Gerçek    Eski      Yeni     +Kal`);
const allActual = {};
rawMatches.forEach(m => { allActual[m.actual.score] = (allActual[m.actual.score] || 0) + 1; });
const topScores = Object.entries(allActual).sort((a,b) => b[1]-a[1]).slice(0, 15);
for (const [score, count] of topScores) {
  const actualPct = ((count/n)*100).toFixed(1);
  const oldPct = (((oldPredScores[score]||0)/n)*100).toFixed(1);
  const newPct = (((newPredScores[score]||0)/n)*100).toFixed(1);
  const calPct = (((calPredScores[score]||0)/n)*100).toFixed(1);
  console.log(`  ${score.padEnd(6)} ${actualPct.padStart(5)}%   ${oldPct.padStart(5)}%   ${newPct.padStart(5)}%   ${calPct.padStart(5)}%`);
}

// Kalibrasyon çarpanları göster
console.log(`\n── Skor Kalibrasyon Çarpanları (top 15) ─────────────────────`);
const sortedCal = Object.entries(scoreCal).sort((a,b) => b[1] - a[1]).slice(0, 15);
for (const [score, mult] of sortedCal) {
  const dir = mult > 1.1 ? '↑ underestimated' : (mult < 0.9 ? '↓ overestimated' : '✅ OK');
  console.log(`  ${score.padEnd(6)} ×${mult.toFixed(3)}  ${dir}`);
}

// ─── Kaydet ──────────────────────────────────────────────────────
saveScoreCalibration(scoreCal);
console.log(`\n💾 Skor kalibrasyon parametreleri kaydedildi: ${SCORE_CAL_FILE}`);
console.log(`✅ Tamamlandı!\n`);
