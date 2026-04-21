#!/usr/bin/env node
'use strict';
/**
 * Skor Tahmin Denetim Raporu
 * Backtest sonuclarindaki her maci detayli analiz eder.
 * Dosyaya yazar: score_audit_report.md
 */
const fs = require('fs');
const path = require('path');

const btFile = path.join(__dirname, '..', 'backtest_comprehensive.json');
const outFile = path.join(__dirname, '..', 'score_audit_report.md');

const bt = JSON.parse(fs.readFileSync(btFile, 'utf8'));
const matches = bt.matches;

const lines = [];
const w = (s) => lines.push(s);

w('# Skor Tahmin Denetim Raporu');
w(`Tarih: ${new Date().toISOString().slice(0,16)}`);
w(`Mac sayisi: ${matches.length}`);
w('');

// Ozet tablo
w('## Ozet');
w('| # | Mac | Lig | Gercek | Tahmin | Top5\'te? | Lambda H/A | 1X2 | OU2.5 |');
w('|---|-----|-----|--------|--------|----------|------------|-----|-------|');

let scoreCorrect = 0;
let scoreInTop5 = 0;
let x1x2Correct = 0;
let ouCorrect = 0;
let bttsCorrect = 0;

matches.forEach((m, i) => {
  const actual = m.actual.score;
  const pred = m.model.predScore || '-';
  const top5 = m.model.top5Scores || [];
  const top5Scores = top5.map(s => s.score);
  const inTop5 = top5Scores.includes(actual);
  const exactHit = pred === actual;
  const lH = m.model.lambdaHome;
  const lA = m.model.lambdaAway;
  const x1x2ok = m.model.predictedResult === m.actual.result;
  const ouok = m.model.predictedOU25 === m.actual.ou25;

  if (exactHit) scoreCorrect++;
  if (inTop5) scoreInTop5++;
  if (x1x2ok) x1x2Correct++;
  if (ouok) ouCorrect++;
  if (m.model.predictedBTTS === m.actual.btts) bttsCorrect++;

  const scoreEmoji = exactHit ? ' EXACT' : inTop5 ? ' TOP5' : '';
  w(`| ${i+1} | ${m.match} | ${m.league} | **${actual}** | ${pred} | ${inTop5 ? 'Evet'+scoreEmoji : 'Hayir'} | ${lH}/${lA} | ${x1x2ok?'OK':'X'} | ${ouok?'OK':'X'} |`);
});

w('');
w(`**Skor Exact:** ${scoreCorrect}/${matches.length} (${(scoreCorrect/matches.length*100).toFixed(1)}%)`);
w(`**Skor Top5:** ${scoreInTop5}/${matches.length} (${(scoreInTop5/matches.length*100).toFixed(1)}%)`);
w(`**1X2:** ${x1x2Correct}/${matches.length} (${(x1x2Correct/matches.length*100).toFixed(1)}%)`);
w(`**OU2.5:** ${ouCorrect}/${matches.length} (${(ouCorrect/matches.length*100).toFixed(1)}%)`);
w(`**BTTS:** ${bttsCorrect}/${matches.length} (${(bttsCorrect/matches.length*100).toFixed(1)}%)`);
w('');

// Detayli mac bazli analiz
w('---');
w('## Detayli Mac Analizi');
w('');

matches.forEach((m, i) => {
  const actual = m.actual.score;
  const pred = m.model.predScore || 'YOK (null)';
  const top5 = m.model.top5Scores || [];
  const top5Scores = top5.map(s => s.score);
  const inTop5 = top5Scores.includes(actual);
  const exactHit = pred === actual;
  const [aH, aA] = actual.split('-').map(Number);

  w(`### ${i+1}. ${m.match}`);
  w(`- **Lig:** ${m.league} | **Tarih:** ${m.date}`);
  w(`- **Gercek Skor:** ${actual} (${m.actual.result}) | **Tahmin Skor:** ${pred}`);
  w(`- **Lambda:** Home=${m.model.lambdaHome}, Away=${m.model.lambdaAway}`);
  w('');

  // Top 5 skorlar
  if (top5.length > 0) {
    w('| Sira | Skor | Olasilik | Durum |');
    w('|------|------|----------|-------|');
    top5.forEach((s, j) => {
      const isActual = s.score === actual;
      w(`| ${j+1} | ${s.score} | ${s.probability}% | ${isActual ? '**GERCEK SONUC**' : ''} |`);
    });
  } else {
    w('> Top5 skor verisi YOK (predicted null)');
  }
  w('');

  // Yakinlik analizi
  if (top5.length > 0) {
    // Gercek skorun top5'teki en yakin skora mesafesi
    const distances = top5.map(s => {
      const [pH, pA] = s.score.split('-').map(Number);
      return {
        score: s.score,
        prob: s.probability,
        distHome: Math.abs(pH - aH),
        distAway: Math.abs(pA - aA),
        totalDist: Math.abs(pH - aH) + Math.abs(pA - aA),
        goalDiff: Math.abs((pH - pA) - (aH - aA)),
      };
    });
    const closest = distances.sort((a, b) => a.totalDist - b.totalDist)[0];
    
    if (exactHit) {
      w(`> **EXACT HIT!** Tam skor tuttu.`);
    } else if (inTop5) {
      w(`> **TOP5 HIT!** Gercek skor top5 icinde.`);
    } else {
      w(`> **MISS.** En yakin tahmin: ${closest.score} (mesafe: ${closest.totalDist} gol, fark sapma: ${closest.goalDiff})`);
    }
  }

  // 1X2, OU, BTTS detay
  const probs = m.model.probs;
  w('');
  w(`- **1X2:** Tahmin=${m.model.predictedResult} (${(probs[0]*100).toFixed(1)}/${(probs[1]*100).toFixed(1)}/${(probs[2]*100).toFixed(1)}) | Gercek=${m.actual.result} ${m.model.predictedResult===m.actual.result?'OK':'YANLIS'}`);
  w(`- **OU2.5:** p(Over)=${(m.model.pOU25*100).toFixed(1)}% → ${m.model.predictedOU25?'Over':'Under'} | Gercek=${m.actual.ou25?'Over':'Under'} ${m.model.predictedOU25===m.actual.ou25?'OK':'YANLIS'}`);
  w(`- **BTTS:** p=${(m.model.pBTTS*100).toFixed(1)}% → ${m.model.predictedBTTS?'Evet':'Hayir'} | Gercek=${m.actual.btts?'Evet':'Hayir'} ${m.model.predictedBTTS===m.actual.btts?'OK':'YANLIS'}`);
  
  // Lambda vs gercek gol karsilastirmasi
  w(`- **Gol Karsilastirma:** Beklenen=${(m.model.lambdaHome+m.model.lambdaAway).toFixed(2)} | Gercek=${aH+aA} | Fark=${((aH+aA)-(m.model.lambdaHome+m.model.lambdaAway)).toFixed(2)}`);
  w('');
});

// Gercek skor null ise uyari
const nullScores = matches.filter(m => !m.model.predScore);
if (nullScores.length > 0) {
  w('---');
  w('## UYARI: predScore null olan maclar');
  w(`${nullScores.length}/${matches.length} macta predicted score NULL dondu.`);
  w('Bu, advanced-derived.js\'deki scoreProbs hesaplamasinda sorun oldugunu gosterir.');
  w('Lambda degerleri mevcut ama Poisson/Blend dağılım skora donusturulemiyor.');
  w('');
  w('Olasi sebepler:');
  w('1. totalProb sifira dusmus (tum olasılıklar NaN veya 0)');
  w('2. scoreProbs dizisi bos (blend fonksiyonu null donmus)');
  w('3. overdispersion parametresi gecersiz (leagueGoalVolatility null)');
}

fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`Rapor yazildi: ${outFile}`);
console.log(`Toplam: ${matches.length} mac, Exact=${scoreCorrect}, Top5=${scoreInTop5}, 1X2=${x1x2Correct}, OU=${ouCorrect}`);
