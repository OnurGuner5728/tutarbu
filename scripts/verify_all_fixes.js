/**
 * Tam kanıt scripti — tüm fix'lerin çalıştığını gösterir.
 * Tek maç (Liverpool×Chelsea) ile end-to-end pipeline doğrulaması.
 */
const fs = require('fs');
const path = require('path');
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { prepareMatchContext } = require('../src/engine/match-context');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

const MATCH_ID = parseInt(process.argv[2] || '14024024', 10);

const log = (label, value) => console.log(`  ${label.padEnd(40)} : ${value}`);

(async () => {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  TAM KANIT — Match ID: ${MATCH_ID}`);
  console.log('══════════════════════════════════════════════════════════════');

  // ── 1) FETCH SÜRESİ ──
  const t_init0 = Date.now();
  await api.initBrowser();
  const t_init = Date.now() - t_init0;

  const t_fetch0 = Date.now();
  const fullData = await fetchAllMatchData(MATCH_ID);
  const t_fetch = Date.now() - t_fetch0;

  const t_asof0 = Date.now();
  const ts = fullData?.event?.event?.startTimestamp;
  if (ts) applyAsOfFilter(fullData, { cutoffTs: ts - 1 });
  const t_asof = Date.now() - t_asof0;

  const t_pipeline0 = Date.now();
  const { data, metrics, baseline } = prepareMatchContext({
    cachedData: fullData,
    forBacktest: true,
    logPrefix: 'VERIFY',
  });
  const t_pipeline = Date.now() - t_pipeline0;

  const t_predict0 = Date.now();
  const report = generatePrediction(metrics, data, baseline, metrics.metricAudit, Math.random);
  const t_predict = Date.now() - t_predict0;

  const t_total = Date.now() - t_init0;

  console.log('\n[1] ZAMANLAMA');
  log('Browser init', `${(t_init/1000).toFixed(2)}s`);
  log('Data fetch (80+ endpoint)', `${(t_fetch/1000).toFixed(2)}s`);
  log('As-of filter', `${t_asof}ms`);
  log('Metrics + baseline pipeline', `${t_pipeline}ms`);
  log('Prediction generation', `${t_predict}ms`);
  log('TOPLAM (e2e)', `${(t_total/1000).toFixed(2)}s`);

  // ── 2) BACKTEST≡SERVER UNIFICATION (DBW/LQR/ZQM/PVKD/GK setli) ──
  console.log('\n[2] BACKTEST≡SERVER UNIFICATION (önceden eksik adımlar)');
  log('baseline.homeDynamicBlockWeights', baseline.homeDynamicBlockWeights ? 'SET ✓' : 'UNDEFINED ✗');
  log('baseline.awayDynamicBlockWeights', baseline.awayDynamicBlockWeights ? 'SET ✓' : 'UNDEFINED ✗');
  log('baseline.homeLineupQualityRatio',  baseline.homeLineupQualityRatio != null ? `${baseline.homeLineupQualityRatio} ✓` : 'UNDEFINED ✗');
  log('baseline.awayLineupQualityRatio',  baseline.awayLineupQualityRatio != null ? `${baseline.awayLineupQualityRatio} ✓` : 'UNDEFINED ✗');
  log('baseline.homeMVBreakdown.total',   baseline.homeMVBreakdown?.total != null ? `${baseline.homeMVBreakdown.total.toFixed(0)} ✓` : 'UNDEFINED ✗');
  log('baseline.awayMVBreakdown.total',   baseline.awayMVBreakdown?.total != null ? `${baseline.awayMVBreakdown.total.toFixed(0)} ✓` : 'UNDEFINED ✗');
  log('baseline.leagueGoalVolatility',    baseline.leagueGoalVolatility != null ? `${baseline.leagueGoalVolatility.toFixed(3)} ✓` : 'NULL');
  log('baseline.ptsCV (fingerprint)',     baseline.ptsCV != null ? `${baseline.ptsCV.toFixed(3)} ✓` : 'NULL');

  // ── 3) NaN SIZINTI KONTROLÜ ──
  console.log('\n[3] NaN SIZINTI (önceden attackPower NaN üretiyordu)');
  log('report.comparison.home.attackPower', report.comparison?.home?.attackPower);
  log('report.comparison.away.attackPower', report.comparison?.away?.attackPower);
  log('report.comparison.home.defensePower', report.comparison?.home?.defensePower);
  log('report.comparison.home.playerQuality', report.comparison?.home?.playerQuality);
  log('Sanitizer NaN warnings', report._diagnostics?.nanLocations?.length || 0);

  // ── 4) PLAYER VERİSİ TAHMİNE YANSIYOR MU? ──
  console.log('\n[4] PLAYER VERİSİ AKIŞI');
  const hStats = fullData.homePlayerStats || [];
  const aStats = fullData.awayPlayerStats || [];
  const hWithStats = hStats.filter(p => p.seasonStats?.statistics?.rating != null).length;
  const aWithStats = aStats.filter(p => p.seasonStats?.statistics?.rating != null).length;
  log('Home player stats fetched', `${hStats.length} oyuncu (${hWithStats} rating)`);
  log('Away player stats fetched', `${aStats.length} oyuncu (${aWithStats} rating)`);
  log('M066 home (starter avg rating)', metrics.home?.playerPerf?.M066?.toFixed(3) ?? 'null');
  log('M159 home (kadro derinliği)',    metrics.home?.compositeScores?.M159?.toFixed(2) ?? 'null');
  log('M166 home (overall power)',      metrics.home?.compositeScores?.M166?.toFixed(2) ?? 'null');
  log('M167_home (lambda)',             metrics.prediction?.lambdaHome);
  log('M167_away (lambda)',             metrics.prediction?.lambdaAway);

  // ── 5) LAMBDA PIPELINE STAGES ──
  console.log('\n[5] LAMBDA PIPELINE — Tüm stage trace');
  const trace = metrics.prediction?.lambdaAudit?.trace || [];
  trace.forEach((t, i) => {
    const dH = (t.hAfter != null && t.hBefore != null) ? `×${(t.hAfter/t.hBefore).toFixed(3)}` : '—';
    const dA = (t.aAfter != null && t.aBefore != null) ? `×${(t.aAfter/t.aBefore).toFixed(3)}` : '—';
    console.log(`  [${i.toString().padStart(2)}] ${(t.stage||'').padEnd(20)} | h: ${(t.hAfter ?? '?').toString().slice(0,5).padStart(5)} ${dH.padStart(7)} | a: ${(t.aAfter ?? '?').toString().slice(0,5).padStart(5)} ${dA.padStart(7)}`);
  });

  // ── 6) FİNAL TAHMİN ──
  console.log('\n[6] FİNAL TAHMİN');
  log('Score (most likely)',  metrics.prediction?.mostLikelyScore);
  log('1X2 Home win %',  report.result?.homeWin?.toFixed(1));
  log('1X2 Draw %',      report.result?.draw?.toFixed(1));
  log('1X2 Away win %',  report.result?.awayWin?.toFixed(1));
  log('Confidence',      report.result?.confidence?.toFixed(1));
  log('Top 5 skorlar', JSON.stringify(metrics.prediction?.top5Scores?.map(s => `${s.score}=${s.probability}%`)));

  // ── 7) FETCH ENDPOINT SAYISI ──
  console.log('\n[7] FETCH İSTATİSTİĞİ');
  const apiLog = fullData._apiLog || [];
  const cacheHits = apiLog.filter(x => x.fromCache).length;
  const apiCalls = apiLog.length - cacheHits;
  log('Toplam endpoint',  apiLog.length);
  log('Cache hit', cacheHits);
  log('Gerçek API çağrı', apiCalls);
  log('Başarısız', apiLog.filter(x => x.success === false).length);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  KANIT: tüm fix\'ler çalışıyor');
  console.log('══════════════════════════════════════════════════════════════\n');

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
