/**
 * Manual fetch of real scores for 2026-05-08 backtest matches.
 * Uses existing playwright-client to bypass Cloudflare.
 */

const fs = require('fs');
const path = require('path');
const api = require('../src/services/playwright-client');

const backtestPath = path.join(__dirname, '..', 'backtest_2026-05-08.json');
const backtest = JSON.parse(fs.readFileSync(backtestPath, 'utf8'));

function fmt(score) {
  if (!score) return '-';
  return `${score.home}-${score.away}`;
}

function outcome(h, a) {
  if (h > a) return '1';
  if (h < a) return '2';
  return 'X';
}

(async () => {
  const rows = [];
  for (const r of backtest.results) {
    try {
      const ev = await api.getEvent(r.matchId);
      const event = ev?.event || ev;
      if (!event) {
        rows.push({ ...baseRow(r), realFT: null, status: 'no-data' });
        continue;
      }
      const statusType = event.status?.type;
      const ftHome = event.homeScore?.current;
      const ftAway = event.awayScore?.current;
      const htHome = event.homeScore?.period1;
      const htAway = event.awayScore?.period1;
      rows.push({
        idx: rows.length + 1,
        matchId: r.matchId,
        match: `${r.homeTeam} vs ${r.awayTeam}`,
        tournament: r.tournament,
        statusType,
        predFT: r.predicted,
        pred1X2: r.predictedResult,
        predHT: r.predictedHT,
        realFT: (ftHome != null && ftAway != null) ? `${ftHome}-${ftAway}` : null,
        real1X2: (ftHome != null && ftAway != null) ? outcome(ftHome, ftAway) : null,
        realHT: (htHome != null && htAway != null) ? `${htHome}-${htAway}` : null,
        hit1X2: null,
        hitScore: null,
        hitHT: null,
      });
      const last = rows[rows.length - 1];
      if (last.real1X2) {
        last.hit1X2 = last.pred1X2 === last.real1X2;
        last.hitScore = last.predFT === last.realFT;
        last.hitHT = last.predHT === last.realHT;
      }
      console.log(`[${rows.length}/${backtest.results.length}] ${last.match}: pred ${last.predFT} (${last.pred1X2}) | real ${last.realFT || 'N/A'} (${last.real1X2 || '?'}) ${last.hit1X2 ? '✓' : last.hit1X2 === false ? '✗' : ''}`);
    } catch (e) {
      console.error(`[${rows.length + 1}] ERROR ${r.matchId}: ${e.message}`);
      rows.push({ ...baseRow(r), realFT: null, status: `error: ${e.message}` });
    }
  }

  function baseRow(r) {
    return {
      matchId: r.matchId,
      match: `${r.homeTeam} vs ${r.awayTeam}`,
      tournament: r.tournament,
      predFT: r.predicted,
      pred1X2: r.predictedResult,
      predHT: r.predictedHT,
    };
  }

  const hit1X2 = rows.filter(r => r.hit1X2 === true).length;
  const totalEval = rows.filter(r => r.hit1X2 !== null).length;
  const hitScore = rows.filter(r => r.hitScore === true).length;
  const hitHT = rows.filter(r => r.hitHT === true).length;

  const summary = {
    date: '2026-05-08',
    fetchedAt: new Date().toISOString(),
    totalMatches: rows.length,
    evaluatedMatches: totalEval,
    accuracy1X2: totalEval > 0 ? hit1X2 / totalEval : null,
    accuracyScore: totalEval > 0 ? hitScore / totalEval : null,
    accuracyHT: totalEval > 0 ? hitHT / totalEval : null,
    hit1X2,
    hitScore,
    hitHT,
    rows,
  };

  const outPath = path.join(__dirname, '..', 'backtest_2026-05-08_REAL.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${rows.length}, Evaluated: ${totalEval}`);
  console.log(`1X2: ${hit1X2}/${totalEval} = ${(summary.accuracy1X2 * 100).toFixed(1)}%`);
  console.log(`Score: ${hitScore}/${totalEval} = ${(summary.accuracyScore * 100).toFixed(1)}%`);
  console.log(`HT: ${hitHT}/${totalEval} = ${(summary.accuracyHT * 100).toFixed(1)}%`);
  console.log(`Saved: ${outPath}`);

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
