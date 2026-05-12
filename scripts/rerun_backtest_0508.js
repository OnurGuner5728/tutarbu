/**
 * 2026-05-08 18-maç backtest — güncel kodla tekrar.
 * Tahmin pipeline'ı: fetch → asOf → metrics → generatePrediction → score-driven outcome
 */
const fs = require('fs');
const path = require('path');
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'backtest_2026-05-08_REAL.json'), 'utf8'));

const outcome = (h, a) => h > a ? '1' : h < a ? '2' : 'X';

(async () => {
  await api.initBrowser();
  const rows = [];
  for (let i = 0; i < real.rows.length; i++) {
    const r = real.rows[i];
    if (!r.realFT) continue;
    try {
      const d = await fetchAllMatchData(r.matchId);
      const ts = d?.event?.event?.startTimestamp;
      if (ts) applyAsOfFilter(d, { cutoffTs: ts - 1 });
      const metrics = calculateAllMetrics(d);
      const baseline = getDynamicBaseline(d);
      baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
      baseline.leaguePointDensity   = metrics.meta?.leaguePointDensity   ?? null;
      baseline.medianGoalRate       = metrics.meta?.medianGoalRate       ?? null;
      baseline.leagueTeamCount      = metrics.meta?.leagueTeamCount      ?? null;
      baseline.ptsCV                = metrics.meta?.ptsCV                ?? null;
      baseline.normMinRatio         = metrics.meta?.normMinRatio         ?? null;
      baseline.normMaxRatio         = metrics.meta?.normMaxRatio         ?? null;
      const report = generatePrediction(metrics, d, baseline, metrics.metricAudit, Math.random);
      const predFT = report.score?.predicted || metrics.prediction?.mostLikelyScore || '?';
      const m = predFT.match(/^(\d+)-(\d+)$/);
      const pred1X2 = m ? outcome(+m[1], +m[2]) : '?';
      const [rh, ra] = r.realFT.split('-').map(Number);
      const real1X2 = outcome(rh, ra);
      const hit1X2 = pred1X2 === real1X2;
      const hitScore = predFT === r.realFT;
      rows.push({
        match: r.match, predFT, pred1X2, realFT: r.realFT, real1X2, hit1X2, hitScore,
        oldPredFT: r.predFT, oldHit1X2: r.hit1X2, oldHitScore: r.hitScore,
      });
      const verdict = hit1X2 ? '✓' : '✗';
      console.log(`[${rows.length}/${real.rows.length}] ${r.match}: pred ${predFT} (${pred1X2}) | real ${r.realFT} (${real1X2}) ${verdict} | eski ${r.predFT} (${r.oldPred1X2 || ''})`);
    } catch (e) {
      console.error(`[${i+1}] ${r.match} ERR:`, e.message);
    }
  }
  const hit1X2 = rows.filter(x => x.hit1X2).length;
  const hitScore = rows.filter(x => x.hitScore).length;
  const oldHit1X2 = rows.filter(x => x.oldHit1X2).length;
  const oldHitScore = rows.filter(x => x.oldHitScore).length;
  const predTotal = rows.reduce((s, r) => {
    const [h,a] = r.predFT.split('-').map(Number); return s + (h+a);
  }, 0);
  const realTotal = rows.reduce((s, r) => {
    const [h,a] = r.realFT.split('-').map(Number); return s + (h+a);
  }, 0);
  // Dist
  const dist = (arr, key) => {
    const m = {};
    arr.forEach(r => { m[r[key]] = (m[r[key]] || 0) + 1; });
    return m;
  };
  const summary = {
    n: rows.length,
    new: { hit1X2, hitScore, acc1X2: hit1X2/rows.length, accScore: hitScore/rows.length, totalGoalAvg: predTotal/rows.length },
    old: { hit1X2: oldHit1X2, hitScore: oldHitScore, acc1X2: oldHit1X2/rows.length, accScore: oldHitScore/rows.length },
    realGoalAvg: realTotal/rows.length,
    distNew: dist(rows, 'pred1X2'),
    distOld: dist(rows.map(r => ({ pred1X2: r.oldPred1X2 || (r.oldPredFT && r.oldPredFT.match(/^(\d+)-(\d+)$/) ? outcome(+RegExp.$1, +RegExp.$2) : '?') })), 'pred1X2'),
    distReal: dist(rows, 'real1X2'),
    rows,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'backtest_2026-05-08_RERUN.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== KARŞILAŞTIRMA ===');
  console.log(`Eski model:    1X2 ${oldHit1X2}/${rows.length} = ${(100*oldHit1X2/rows.length).toFixed(1)}%   Skor ${oldHitScore}/${rows.length} = ${(100*oldHitScore/rows.length).toFixed(1)}%`);
  console.log(`Yeni model:    1X2 ${hit1X2}/${rows.length} = ${(100*hit1X2/rows.length).toFixed(1)}%   Skor ${hitScore}/${rows.length} = ${(100*hitScore/rows.length).toFixed(1)}%`);
  console.log(`Maç başı gol — yeni: ${(predTotal/rows.length).toFixed(2)}, gerçek: ${(realTotal/rows.length).toFixed(2)}`);
  console.log('Yeni 1X2 dağılım:', summary.distNew);
  console.log('Gerçek 1X2 dağılım:', summary.distReal);
  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
