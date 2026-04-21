#!/usr/bin/env node
'use strict';
const d = require('../backtest_comprehensive.json');
const m = d.matches;

// === GERÇEK SKOR DAĞILIMI ===
const scoreCounts = {};
const predScoreCounts = {};
const lambdaHomes = [];
const lambdaAways = [];

m.forEach(x => {
  const as = x.actual.score;
  scoreCounts[as] = (scoreCounts[as] || 0) + 1;
  
  // Predicted score: Poisson mode from lambda
  const lh = x.model.lambdaHome;
  const la = x.model.lambdaAway;
  if (lh != null) lambdaHomes.push(lh);
  if (la != null) lambdaAways.push(la);
  
  // En olası skor: Poisson mode = floor(lambda) veya lambda yakınındaki tam sayı
  const predH = Math.round(lh) >= 0 ? Math.round(lh) : Math.floor(lh);
  const predA = Math.round(la) >= 0 ? Math.round(la) : Math.floor(la);
  
  // But actually model uses Poisson PMF max, let's simulate that
  function poissonMode(lambda) {
    if (lambda <= 0) return 0;
    let maxP = 0, bestK = 0;
    for (let k = 0; k <= 10; k++) {
      let p = Math.exp(-lambda) * Math.pow(lambda, k);
      let f = 1; for (let i = 2; i <= k; i++) f *= i;
      p /= f;
      if (p > maxP) { maxP = p; bestK = k; }
    }
    return bestK;
  }
  
  // Joint max from Poisson
  let bestScore = '0-0', bestProb = 0;
  for (let hg = 0; hg <= 6; hg++) {
    for (let ag = 0; ag <= 6; ag++) {
      const ph = Math.exp(-lh) * Math.pow(lh, hg);
      let fh = 1; for (let i = 2; i <= hg; i++) fh *= i;
      const pa = Math.exp(-la) * Math.pow(la, ag);
      let fa = 1; for (let i = 2; i <= ag; i++) fa *= i;
      const p = (ph / fh) * (pa / fa);
      if (p > bestProb) { bestProb = p; bestScore = `${hg}-${ag}`; }
    }
  }
  predScoreCounts[bestScore] = (predScoreCounts[bestScore] || 0) + 1;
});

console.log('=== GERÇEK SKOR DAĞILIMI (top 20) ===');
Object.entries(scoreCounts).sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([s, c]) => {
  console.log(`  ${s.padEnd(6)} ${String(c).padStart(3)} (${((c/m.length)*100).toFixed(1)}%)`);
});

console.log('\n=== MODEL SKOR TAHMİNİ DAĞILIMI (Poisson mode) ===');
Object.entries(predScoreCounts).sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([s, c]) => {
  console.log(`  ${s.padEnd(6)} ${String(c).padStart(3)} (${((c/m.length)*100).toFixed(1)}%)`);
});

// Lambda istatistikleri
const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const std = arr => { const m = avg(arr); return Math.sqrt(arr.reduce((s, v) => s + (v-m)**2, 0) / arr.length); };

console.log('\n=== LAMBDA İSTATİSTİKLERİ ===');
console.log(`  λHome: min=${Math.min(...lambdaHomes).toFixed(2)} max=${Math.max(...lambdaHomes).toFixed(2)} avg=${avg(lambdaHomes).toFixed(2)} std=${std(lambdaHomes).toFixed(2)}`);
console.log(`  λAway: min=${Math.min(...lambdaAways).toFixed(2)} max=${Math.max(...lambdaAways).toFixed(2)} avg=${avg(lambdaAways).toFixed(2)} std=${std(lambdaAways).toFixed(2)}`);

// Lambda bantları
console.log('\n=== LAMBDA BANTLARI (Home) ===');
[0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0].forEach(t => {
  const n = lambdaHomes.filter(l => l <= t).length;
  console.log(`  λ≤${t.toFixed(1)}: ${String(n).padStart(3)}/${lambdaHomes.length} (${((n/lambdaHomes.length)*100).toFixed(1)}%)`);
});

// GERÇEK vs TAHMİN karşılaştırması
console.log('\n=== DOĞRU SKOR TAHMİN ANALİZİ ===');
let correct = 0;
let correctInTop5 = 0;
m.forEach(x => {
  const lh = x.model.lambdaHome;
  const la = x.model.lambdaAway;
  const actual = x.actual.score;
  
  // Top 5 Poisson skorları
  const scores = [];
  for (let hg = 0; hg <= 6; hg++) {
    for (let ag = 0; ag <= 6; ag++) {
      const ph = Math.exp(-lh) * Math.pow(lh, hg);
      let fh = 1; for (let i = 2; i <= hg; i++) fh *= i;
      const pa = Math.exp(-la) * Math.pow(la, ag);
      let fa = 1; for (let i = 2; i <= ag; i++) fa *= i;
      scores.push({ s: `${hg}-${ag}`, p: (ph / fh) * (pa / fa) });
    }
  }
  scores.sort((a, b) => b.p - a.p);
  if (scores[0].s === actual) correct++;
  if (scores.slice(0, 5).some(s => s.s === actual)) correctInTop5++;
});
console.log(`  #1 skor doğru: ${correct}/${m.length} (${((correct/m.length)*100).toFixed(1)}%)`);
console.log(`  Top5'te doğru: ${correctInTop5}/${m.length} (${((correctInTop5/m.length)*100).toFixed(1)}%)`);

// PROBLEM: λ yakınlığı → skor çeşitliliği
console.log('\n=== λ YAKINLIĞI ANALİZİ ===');
const lambdaDiffs = lambdaHomes.map((lh, i) => Math.abs(lh - lambdaAways[i]));
console.log(`  |λH - λA| avg: ${avg(lambdaDiffs).toFixed(2)}`);
console.log(`  |λH - λA| < 0.3: ${lambdaDiffs.filter(d => d < 0.3).length}/${lambdaDiffs.length} (${((lambdaDiffs.filter(d => d < 0.3).length/lambdaDiffs.length)*100).toFixed(1)}%) → hep 1-1 veya 0-0`);
console.log(`  |λH - λA| < 0.5: ${lambdaDiffs.filter(d => d < 0.5).length}/${lambdaDiffs.length} (${((lambdaDiffs.filter(d => d < 0.5).length/lambdaDiffs.length)*100).toFixed(1)}%) → hep X-X veya X±1`);

// Takım başına gol dağılımı
console.log('\n=== GERÇEK GOL DAĞILIMI (tek takım) ===');
const goalCounts = {};
m.forEach(x => {
  const [h, a] = x.actual.score.split('-').map(Number);
  goalCounts[h] = (goalCounts[h] || 0) + 1;
  goalCounts[a] = (goalCounts[a] || 0) + 1;
});
Object.keys(goalCounts).sort((a,b) => Number(a)-Number(b)).forEach(g => {
  const c = goalCounts[g];
  const total = m.length * 2;
  console.log(`  ${g} gol: ${String(c).padStart(3)} (${((c/total)*100).toFixed(1)}%)`);
});
