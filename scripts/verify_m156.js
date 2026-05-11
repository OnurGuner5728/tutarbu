const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

(async () => {
  await api.initBrowser();
  const fullData = await fetchAllMatchData(14024024);
  const kickoffTs = fullData?.event?.event?.startTimestamp;
  if (kickoffTs) applyAsOfFilter(fullData, { cutoffTs: kickoffTs - 1 });
  const m = calculateAllMetrics(fullData);
  const cs = m.home.compositeScores;
  const csa = m.away.compositeScores;
  const sh = m.shared.sharedComposite;
  const fields = [
    ['M156_home', cs.M156], ['M156_away', csa.M156],
    ['M157_home', cs.M157], ['M157_away', csa.M157],
    ['M158_home', cs.M158], ['M159_home', cs.M159],
    ['M160_home', cs.M160], ['M161', sh?.M161],
    ['M162', sh?.M162], ['M163', sh?.M163],
    ['M164_home', cs.M164], ['M165_home', cs.M165],
    ['M166_home', cs.M166], ['M167_home', cs.M167],
  ];
  let nanCount = 0;
  fields.forEach(([k,v]) => {
    const ok = v == null || Number.isFinite(v);
    if (!ok) nanCount++;
    console.log(`  ${k.padEnd(12)} = ${v}  ${ok ? '✓' : '❌ NaN'}`);
  });
  console.log(`\nNaN count: ${nanCount}/${fields.length}`);
  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
