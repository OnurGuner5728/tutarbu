const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

const MATCHES = [
  { id: 14024024, label: 'Liverpool×Chelsea' },
  { id: 14317643, label: 'Frosinone×Mantova' },
];

(async () => {
  await api.initBrowser();
  for (const m of MATCHES) {
    const d = await fetchAllMatchData(m.id);
    const ts = d?.event?.event?.startTimestamp;
    if (ts) applyAsOfFilter(d, { cutoffTs: ts - 1 });
    const r = calculateAllMetrics(d);
    const p = r.prediction;
    console.log(`\n=== ${m.label} ===`);
    console.log(`  λ_home: ${p.lambdaHome}  λ_away: ${p.lambdaAway}  λsum: ${(p.lambdaHome + p.lambdaAway).toFixed(2)}`);
    console.log(`  mostLikelyScore: ${p.mostLikelyScore}  prob: ${p.mostLikelyScoreProbability}%`);
    console.log(`  top5:`, p.top5Scores?.map(s => `${s.score} (${s.probability}%)`).join(', '));
    console.log(`  homeWin/draw/away: ${p.homeWinProbability}/${p.drawProbability}/${p.awayWinProbability}`);
  }
  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
