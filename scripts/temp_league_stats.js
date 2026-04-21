const fs = require('fs');
const data = require('./backtest_comprehensive.json'); 
const leagues = {};

data.matches.forEach(m => {
  const l = m.league || '?';
  if (!leagues[l]) leagues[l] = { count: 0, w1X2: 0, wOU: 0, totalBrier: 0, brierCount: 0 };
  leagues[l].count++;
  
  if (m.actual.result === m.model.predictedResult) leagues[l].w1X2++;
  if (m.actual.ou25 === m.model.predictedOU25) leagues[l].wOU++;
  
  // calculate brier for 1X2
  const outcomeArr = m.actual.result === '1' ? [1,0,0] : m.actual.result === 'X' ? [0,1,0] : [0,0,1];
  let brier = 0;
  for(let i=0; i<3; i++) {
    brier += Math.pow(m.model.probs[i] - outcomeArr[i], 2);
  }
  brier = brier / 3;
  leagues[l].totalBrier += brier;
  leagues[l].brierCount++;
});

const sorted = Object.entries(leagues).sort((a, b) => b[1].count - a[1].count);
console.log('── LİG BAZLI BREAKDOWN (TÜM LİGLER) ────────────────────────────────────');
sorted.forEach(([name, stats]) => {
  const acc1x2 = ((stats.w1X2 / stats.count) * 100).toFixed(0);
  const accOU = ((stats.wOU / stats.count) * 100).toFixed(0);
  const avgBrier = stats.brierCount > 0 ? (stats.totalBrier / stats.brierCount).toFixed(4) : 'N/A';
  const paddedName = name.substring(0, 26).padEnd(28, ' ');
  console.log(`${paddedName} n=${stats.count.toString().padStart(3, ' ')} 1X2=${acc1x2.padStart(2, ' ')}% OU=${accOU.padStart(2, ' ')}% Brier=${avgBrier}`);
});
console.log('══════════════════════════════════════════════════════════════════════');
