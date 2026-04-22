const fs = require('fs');

const raw = fs.readFileSync('backtest_comprehensive.json', 'utf8');
const data = JSON.parse(raw);

const leagues = {};
const teams = {};

data.matches.forEach(m => {
  const l = m.league || '?';
  const h = m.actual.score?.split('-')[0] != null ? m.match.split(' vs ')[0] : 'Unknown';
  const a = m.actual.score?.split('-')[0] != null ? m.match.split(' vs ')[1] : 'Unknown';

  if (!leagues[l]) leagues[l] = { count: 0, w1X2: 0, wOU: 0, wBTTS: 0, wScore: 0, brierCount: 0, brierSum: 0, bmBrierSum: 0 };
  
  [h, a].forEach(t => {
    if (t === 'Unknown') return;
    if (!teams[t]) teams[t] = { count: 0, w1X2: 0, wOU: 0, wBTTS: 0, wScore: 0 };
    teams[t].count++;
    if (m.actual.result === m.model.predictedResult) teams[t].w1X2++;
    if (m.actual.ou25 === m.model.predictedOU25) teams[t].wOU++;
    if (m.actual.btts === m.model.predictedBTTS) teams[t].wBTTS++;
    if (m.actual.score === m.model.predScore) teams[t].wScore++;
  });

  leagues[l].count++;
  if (m.actual.result === m.model.predictedResult) leagues[l].w1X2++;
  if (m.actual.ou25 === m.model.predictedOU25) leagues[l].wOU++;
  if (m.actual.btts === m.model.predictedBTTS) leagues[l].wBTTS++;
  if (m.actual.score === m.model.predScore) leagues[l].wScore++;

  if (m.model.probs && m.actual.result !== '?') {
     const outcomeArr = m.actual.result === '1' ? [1,0,0] : m.actual.result === 'X' ? [0,1,0] : [0,0,1];
     let brier = 0;
     for(let i=0; i<3; i++) brier += Math.pow(m.model.probs[i] - outcomeArr[i], 2);
     leagues[l].brierSum += (brier/3);
     
     if (m.bookmaker && m.bookmaker.probs) {
         let bmBrier = 0;
         for(let i=0; i<3; i++) bmBrier += Math.pow(m.bookmaker.probs[i] - outcomeArr[i], 2);
         leagues[l].bmBrierSum += (bmBrier/3);
     }
     leagues[l].brierCount++;
  }
});

// Calculate stats and filter noise
const lStats = Object.entries(leagues).filter(x => x[1].count >= 10).map(([k, v]) => ({
  name: k,
  n: v.count,
  p1X2: v.w1X2 / v.count,
  pOU: v.wOU / v.count,
  pBTTS: v.wBTTS / v.count,
  pScore: v.wScore / v.count,
  brierDiff: v.brierCount > 0 ? (v.brierSum / v.brierCount) - (v.bmBrierSum / v.brierCount) : 0
}));

const tStats = Object.entries(teams).filter(x => x[1].count >= 4).map(([k, v]) => ({
  name: k,
  n: v.count,
  p1X2: v.w1X2 / v.count,
  pOU: v.wOU / v.count,
  pBTTS: v.wBTTS / v.count,
  pScore: v.wScore / v.count
}));

console.log("=== TOP 5 LEAGUES (1X2 EDGE) ===");
lStats.sort((a,b) => a.brierDiff - b.brierDiff).slice(0,5).forEach(x => console.log(`${x.name} (n=${x.n}): diff=${x.brierDiff.toFixed(4)}`));

console.log("\n=== WORST 5 LEAGUES (1X2 EDGE) ===");
lStats.sort((a,b) => b.brierDiff - a.brierDiff).slice(0,5).forEach(x => console.log(`${x.name} (n=${x.n}): diff=${x.brierDiff.toFixed(4)}`));

console.log("\n=== TOP 5 TEAMS (BTTS PREDICTABILITY >= 4 matches) ===");
tStats.sort((a,b) => b.pBTTS - a.pBTTS).slice(0,5).forEach(x => console.log(`${x.name} (n=${x.n}): BTTS Acc=${(x.pBTTS*100).toFixed(1)}%`));

console.log("\n=== WORST 5 TEAMS (BTTS PREDICTABILITY >= 4 matches) ===");
tStats.sort((a,b) => a.pBTTS - b.pBTTS).slice(0,5).forEach(x => console.log(`${x.name} (n=${x.n}): BTTS Acc=${(x.pBTTS*100).toFixed(1)}%`));
