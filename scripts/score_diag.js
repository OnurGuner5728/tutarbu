/**
 * Skor seçim diagnostic — hangi skoru neden seçtiğini gösterir.
 */
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { prepareMatchContext } = require('../src/engine/match-context');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

const MATCH_ID = parseInt(process.argv[2] || '14109920', 10);

(async () => {
  await api.initBrowser();
  const d = await fetchAllMatchData(MATCH_ID);
  const ts = d?.event?.event?.startTimestamp;
  if (ts) applyAsOfFilter(d, { cutoffTs: ts - 1 });
  const { metrics } = prepareMatchContext({ cachedData: d, forBacktest: true, logPrefix: 'SCORE' });

  const diag = metrics.prediction?.lambdaAudit?.diag?.scoreSelection;
  console.log('\n=== SKOR SEÇİM DETAY ===');
  console.log('λ_home:', metrics.prediction?.lambdaHome, '| λ_away:', metrics.prediction?.lambdaAway);
  console.log('Chosen score:', diag?.chosen);
  console.log('Team weight sum:', diag?.teamWeightSum);
  console.log('\nTop 5 candidates (combined score sırası):');
  (diag?.topCandidates || []).forEach((c, i) => {
    console.log(`  ${i+1}. ${c.key.padEnd(5)} | prob=${(c.prob*100).toFixed(2)}% | empFreq=${(c.empFreq*100).toFixed(2)}% | combined=${(c.combined*100).toFixed(3)}`);
    c.sources?.forEach(s => {
      console.log(`        ${s.src.padEnd(8)} freq=${(s.f*100).toFixed(1)}% w=${s.w.toFixed(1)}`);
    });
  });

  // Source profiles
  console.log('\n=== KAYNAK DAĞILIMLARI ===');
  const hsp = d.homePlayers && metrics.prediction;
  if (metrics) {
    // homeScoreProfile, awayScoreProfile, matchScoreProfile, leagueFingerprint
    const ad = metrics.prediction?.lambdaAudit?.diag;
    // can't easily access these from metrics — instead show jointDists
  }

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
