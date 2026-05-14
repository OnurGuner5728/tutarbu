const fs = require('fs');
const path = require('path');
const api = require('../src/services/playwright-client');

const backtestPath = path.join(__dirname, '..', 'backtest_2026-05-11.json');
const backtest = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));

const outcome = (h, a) => h > a ? '1' : h < a ? '2' : 'X';

(async () => {
  await api.initBrowser();
  const rows = [];
  for (let i = 0; i < backtest.results.length; i++) {
    const r = backtest.results[i];
    try {
      const ev = await api.getEvent(r.matchId);
      const event = ev?.event || ev;
      const ftH = event?.homeScore?.current;
      const ftA = event?.awayScore?.current;
      const realFT = (ftH != null && ftA != null) ? `${ftH}-${ftA}` : null;
      const real1X2 = realFT ? outcome(ftH, ftA) : null;
      const hit1X2 = realFT ? r.predictedResult === real1X2 : null;
      const hitScore = realFT ? r.predicted === realFT : null;
      rows.push({
        idx: i+1, matchId: r.matchId,
        match: `${r.homeTeam} vs ${r.awayTeam}`,
        tournament: r.tournament,
        predFT: r.predicted, pred1X2: r.predictedResult, tier: r.confidenceTier,
        realFT, real1X2, hit1X2, hitScore,
      });
      const v = hit1X2 ? '✓' : (hit1X2 === false ? '✗' : '?');
      console.log(`[${i+1}/18] ${r.homeTeam} vs ${r.awayTeam}: ${r.predicted} (${r.predictedResult}) | real ${realFT || 'N/A'} (${real1X2 || '?'}) ${v}`);
    } catch (e) {
      console.error(`[${i+1}] ERR ${r.matchId}: ${e.message}`);
      rows.push({ idx: i+1, matchId: r.matchId, match: `${r.homeTeam} vs ${r.awayTeam}`, error: e.message });
    }
  }
  const evaluated = rows.filter(x => x.realFT);
  const hit1X2 = evaluated.filter(x => x.hit1X2).length;
  const hitScore = evaluated.filter(x => x.hitScore).length;
  const summary = {
    date: '2026-05-11', fetchedAt: new Date().toISOString(),
    total: rows.length, evaluated: evaluated.length,
    accuracy1X2: evaluated.length > 0 ? hit1X2 / evaluated.length : null,
    accuracyScore: evaluated.length > 0 ? hitScore / evaluated.length : null,
    hit1X2, hitScore, rows,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'backtest_2026-05-11_REAL.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(`1X2: ${hit1X2}/${evaluated.length} = ${(100*hit1X2/evaluated.length).toFixed(1)}%`);
  console.log(`Score: ${hitScore}/${evaluated.length} = ${(100*hitScore/evaluated.length).toFixed(1)}%`);
  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
