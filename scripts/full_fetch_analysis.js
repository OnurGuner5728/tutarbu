/**
 * Detaylı fetch analizi + Player stats etki ölçümü.
 * 1) Her endpoint kategorisinin gerçek wall-clock süresi
 * 2) Player stats ile vs olmadan tahmin karşılaştırması
 */
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { prepareMatchContext } = require('../src/engine/match-context');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

const MATCH_ID = parseInt(process.argv[2] || '14109920', 10);

// Hook tüm api method'ları
const callLog = [];
const origMethods = {};
const apiMethodNames = Object.keys(api).filter(k => typeof api[k] === 'function' && k.startsWith('get'));
apiMethodNames.forEach(name => {
  origMethods[name] = api[name].bind(api);
  api[name] = async (...args) => {
    const t0 = Date.now();
    const result = await origMethods[name](...args);
    callLog.push({
      method: name, args: args.map(String).join('|'),
      elapsedMs: Date.now() - t0, ts: t0, success: result != null,
    });
    return result;
  };
});

const CATEGORY_MAP = {
  getEvent: 'EVENT', getEventStats: 'RECENT_DETAIL', getEventIncidents: 'RECENT_DETAIL',
  getEventLineups: 'EVENT', getEventShotmap: 'RECENT_DETAIL', getEventGraph: 'RECENT_DETAIL',
  getEventH2H: 'EVENT', getEventH2HEvents: 'EVENT', getEventOdds: 'EVENT',
  getEventOddsChanges: 'EVENT', getEventMissingPlayers: 'EVENT', getEventStreaks: 'EVENT',
  getEventForm: 'EVENT', getEventManagers: 'EVENT', getEventVotes: 'EVENT',
  getTeam: 'TEAM', getTeamPlayers: 'TEAM', getTeamLastEvents: 'TEAM',
  getTeamSeasonStats: 'LEAGUE', getTeamTopPlayers: 'LEAGUE',
  getStandings: 'LEAGUE',
  getPlayerSeasonStats: 'PLAYER', getPlayerAttributes: 'PLAYER', getPlayerCharacteristics: 'PLAYER',
  getRefereeStats: 'REF_MGR', getRefereeLastEvents: 'REF_MGR',
  getManagerLastEvents: 'REF_MGR',
};

(async () => {
  console.log(`\n══════ DETAYLI FETCH ANALİZİ — Match ${MATCH_ID} ══════\n`);

  await api.initBrowser();
  const tFetch0 = Date.now();
  const fullData = await fetchAllMatchData(MATCH_ID);
  const tFetch = Date.now() - tFetch0;

  // Kategori bazında özet
  const byCategory = {};
  callLog.forEach(c => {
    const cat = CATEGORY_MAP[c.method] || 'OTHER';
    if (!byCategory[cat]) byCategory[cat] = { count: 0, totalMs: 0, methods: new Set(), fails: 0 };
    byCategory[cat].count++;
    byCategory[cat].totalMs += c.elapsedMs;
    byCategory[cat].methods.add(c.method);
    if (!c.success) byCategory[cat].fails++;
  });

  console.log(`Toplam fetch: ${(tFetch/1000).toFixed(1)}s  |  ${callLog.length} çağrı  |  ${callLog.filter(c => !c.success).length} fail`);
  console.log('\n=== KATEGORİ BAZINDA (toplam süreye göre) ===');
  console.log('Kategori        Çağrı  Toplam(s)  Ortalama(ms)  Yüzde  Methods');
  console.log('-'.repeat(80));
  const sorted = Object.entries(byCategory).sort((a, b) => b[1].totalMs - a[1].totalMs);
  sorted.forEach(([cat, s]) => {
    const pct = (100 * s.totalMs / tFetch).toFixed(1);
    console.log(
      `${cat.padEnd(14)} ${s.count.toString().padStart(5)} ${(s.totalMs/1000).toFixed(2).padStart(9)} ` +
      `${(s.totalMs/s.count).toFixed(0).padStart(13)} ${pct.padStart(6)}%  ${[...s.methods].length}`
    );
  });

  // Method bazında detay
  const byMethod = {};
  callLog.forEach(c => {
    if (!byMethod[c.method]) byMethod[c.method] = { count: 0, totalMs: 0 };
    byMethod[c.method].count++;
    byMethod[c.method].totalMs += c.elapsedMs;
  });

  console.log('\n=== METHOD BAZINDA (top 15) ===');
  const mSort = Object.entries(byMethod).sort((a, b) => b[1].totalMs - a[1].totalMs).slice(0, 15);
  mSort.forEach(([m, s]) => {
    console.log(`  ${m.padEnd(36)} ${s.count.toString().padStart(4)}× ${(s.totalMs/1000).toFixed(2).padStart(7)}s`);
  });

  // ── ÖNEMLİ: As-of filter uygula ve A/B TEST ──
  const ts = fullData?.event?.event?.startTimestamp;
  if (ts) applyAsOfFilter(fullData, { cutoffTs: ts - 1 });

  // [1] PLAYER STATS DAHİL prediction
  const fullClone = structuredClone(fullData);
  const ctxWith = prepareMatchContext({ cachedData: fullClone, forBacktest: true, logPrefix: 'WITH_PLAYER' });
  const reportWith = generatePrediction(ctxWith.metrics, ctxWith.data, ctxWith.baseline, ctxWith.metrics.metricAudit, Math.random);

  // [2] PLAYER STATS NULLANARAK prediction (basic tier simulation)
  const noPlayerClone = structuredClone(fullData);
  noPlayerClone.homePlayerStats = [];
  noPlayerClone.awayPlayerStats = [];
  if (noPlayerClone.homePlayers?.players) {
    noPlayerClone.homePlayers.players = noPlayerClone.homePlayers.players.map(p => ({
      ...p, player: { ...p.player, seasonStats: null, statistics: null, attributes: null, characteristics: null }
    }));
  }
  if (noPlayerClone.awayPlayers?.players) {
    noPlayerClone.awayPlayers.players = noPlayerClone.awayPlayers.players.map(p => ({
      ...p, player: { ...p.player, seasonStats: null, statistics: null, attributes: null, characteristics: null }
    }));
  }
  if (noPlayerClone.lineups?.home?.players) {
    noPlayerClone.lineups.home.players = noPlayerClone.lineups.home.players.map(p => ({
      ...p, player: { ...p.player, seasonStats: null, statistics: null, attributes: null, characteristics: null }
    }));
  }
  if (noPlayerClone.lineups?.away?.players) {
    noPlayerClone.lineups.away.players = noPlayerClone.lineups.away.players.map(p => ({
      ...p, player: { ...p.player, seasonStats: null, statistics: null, attributes: null, characteristics: null }
    }));
  }
  const ctxWithout = prepareMatchContext({ cachedData: noPlayerClone, forBacktest: true, logPrefix: 'NO_PLAYER' });
  const reportWithout = generatePrediction(ctxWithout.metrics, ctxWithout.data, ctxWithout.baseline, ctxWithout.metrics.metricAudit, Math.random);

  console.log('\n══════ A/B TEST — PLAYER STATS ETKİSİ ══════\n');
  console.log('Metrik                       Player ile        Player olmadan    Fark');
  console.log('-'.repeat(80));
  const cmp = (label, w, wo, fmt = v => v?.toFixed?.(2) ?? String(v)) => {
    const diff = (w != null && wo != null) ? (w - wo).toFixed(2) : '?';
    console.log(`${label.padEnd(28)} ${fmt(w).padStart(16)} ${fmt(wo).padStart(16)} ${(diff > 0 ? '+' : '') + diff}`);
  };
  cmp('λ_home',        ctxWith.metrics.prediction?.lambdaHome,        ctxWithout.metrics.prediction?.lambdaHome);
  cmp('λ_away',        ctxWith.metrics.prediction?.lambdaAway,        ctxWithout.metrics.prediction?.lambdaAway);
  cmp('Home win %',    reportWith.result?.homeWin,                    reportWithout.result?.homeWin);
  cmp('Draw %',        reportWith.result?.draw,                       reportWithout.result?.draw);
  cmp('Away win %',    reportWith.result?.awayWin,                    reportWithout.result?.awayWin);
  cmp('Confidence',    reportWith.result?.confidence,                 reportWithout.result?.confidence);
  cmp('Most likely',   ctxWith.metrics.prediction?.mostLikelyScore,   ctxWithout.metrics.prediction?.mostLikelyScore, v => v ?? '?');
  cmp('attackPower H', reportWith.comparison?.home?.attackPower,      reportWithout.comparison?.home?.attackPower);
  cmp('attackPower A', reportWith.comparison?.away?.attackPower,      reportWithout.comparison?.away?.attackPower);
  cmp('playerQual H',  reportWith.comparison?.home?.playerQuality,    reportWithout.comparison?.home?.playerQuality);
  cmp('overallPow H',  reportWith.comparison?.home?.overallPower,     reportWithout.comparison?.home?.overallPower);

  // Top 5 score karşılaştırması
  console.log('\nTop 5 skorlar:');
  console.log('  Player ile:    ', JSON.stringify(ctxWith.metrics.prediction?.top5Scores?.map(s => `${s.score}=${s.probability}%`)));
  console.log('  Player olmadan:', JSON.stringify(ctxWithout.metrics.prediction?.top5Scores?.map(s => `${s.score}=${s.probability}%`)));

  // 1X2 tahmin aynı mı?
  const winnerWith = ['1', 'X', '2'][[reportWith.result?.homeWin, reportWith.result?.draw, reportWith.result?.awayWin].indexOf(Math.max(reportWith.result?.homeWin, reportWith.result?.draw, reportWith.result?.awayWin))];
  const winnerWithout = ['1', 'X', '2'][[reportWithout.result?.homeWin, reportWithout.result?.draw, reportWithout.result?.awayWin].indexOf(Math.max(reportWithout.result?.homeWin, reportWithout.result?.draw, reportWithout.result?.awayWin))];
  console.log(`\n1X2 winner: Player ile=${winnerWith}, Player olmadan=${winnerWithout}, ${winnerWith === winnerWithout ? 'AYNI' : 'FARKLI'}`);

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
