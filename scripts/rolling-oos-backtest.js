'use strict';
/**
 * Rolling Out-of-Sample Backtest
 * ────────────────────────────────
 * Doğru OOS testi: her pencerede yalnızca o tarihe kadar bilinen verilerle kalibrasyon.
 * Değerleme.md §4: "gün 1-60 kalibrasyon, gün 61-75 tahmin, sonra pencere kayar"
 *
 * Kullanım:
 *   node scripts/rolling-oos-backtest.js           # Son 28 gün
 *   node scripts/rolling-oos-backtest.js --days 21 # Son 21 gün
 *   node scripts/rolling-oos-backtest.js --resume  # Varsa mevcut checkpoint'ten devam
 *
 * Çıktı: backtest_rolling_oos.json
 *
 * Metrikler: Brier, LogLoss, RPS, calibration curve, edge decile analizi
 */

const api  = require('../src/services/playwright-client');
const { fetchAllMatchData }   = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { getDynamicBaseline }  = require('../src/engine/dynamic-baseline');
const { generatePrediction }  = require('../src/engine/prediction-generator');
const { computePositionMVBreakdown } = require('../src/engine/quality-factors');
const { trainCalibration, calibrateProbs } = require('../src/engine/calibration');
const fs   = require('fs');
const path = require('path');

// ─── Konfigürasyon ────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const getArg = (key, def) => {
  const i = ARGS.indexOf(key);
  return (i >= 0 && ARGS[i + 1]) ? ARGS[i + 1] : def;
};
const RESUME = ARGS.includes('--resume');

const CONFIG = {
  DAYS_BACK:      parseInt(getArg('--days', '28')),   // Kaç gün geriye
  CALIB_WINDOW:   parseInt(getArg('--calib', '14')),  // Kalibrasyon pencere boyutu (gün)
  TEST_WINDOW:    parseInt(getArg('--test', '7')),    // Test pencere boyutu (gün)
  CONCURRENCY:    3,
  TOP_LEAGUE_IDS: new Set([17, 8, 23, 24, 35, 7, 34, 11, 238, 37, 679, 547]),
  OUTPUT_FILE:    path.join(__dirname, '..', 'backtest_rolling_oos.json'),
  CHECKPOINT_FILE: path.join(__dirname, '..', 'backtest_rolling_checkpoint.json'),
};

// ─── Matematiksel yardımcılar ──────────────────────────────────────────────────
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round4 = v => Math.round(v * 10000) / 10000;
const sigmoid = x => 1 / (1 + Math.exp(-x));
const logit   = p => Math.log(Math.max(p, 1e-9) / Math.max(1 - p, 1e-9));

function brierScore(probs, actual) {
  const y = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0];
  return (Math.pow(probs[0]-y[0],2) + Math.pow(probs[1]-y[1],2) + Math.pow(probs[2]-y[2],2)) / 3;
}
function logLoss(probs, actual, eps=1e-7) {
  const pMap = { '1': probs[0], 'X': probs[1], '2': probs[2] };
  return -Math.log(Math.max(pMap[actual], eps));
}
function rpsScore(probs, actual) {
  const o = actual === '1' ? 0 : actual === 'X' ? 1 : 2;
  let rps = 0, cumP = 0, cumA = 0;
  for (let i = 0; i < 3; i++) {
    cumP += probs[i]; cumA += (i === o ? 1 : 0);
    rps  += Math.pow(cumP - cumA, 2);
  }
  return rps / 2;
}
function brierBinary(p, actual) { return Math.pow(p - (actual ? 1 : 0), 2); }

function deVig(rawProbs) {
  const total = rawProbs.reduce((s, p) => s + p, 0);
  return total > 0 ? rawProbs.map(p => p / total) : null;
}

function aggregateMetrics(records) {
  if (records.length === 0) return null;
  const n = records.length;
  const briers = records.map(r => brierScore(r.calProbs, r.actual.result));
  const lls    = records.map(r => logLoss(r.calProbs, r.actual.result));
  const rpss   = records.map(r => rpsScore(r.calProbs, r.actual.result));
  const brierRaw = records.map(r => brierScore(r.rawProbs, r.actual.result));
  const llRaw    = records.map(r => logLoss(r.rawProbs, r.actual.result));

  const correct1X2 = records.filter(r => r.predResult === r.actual.result).length;
  const correctOU  = records.filter(r => r.actual.ou25 != null && r.predOU === r.actual.ou25).length;
  const ouN        = records.filter(r => r.actual.ou25 != null).length;

  // Bookmaker metrics (where available)
  const bmRecs = records.filter(r => r.bmProbs != null);
  const bmBrier = bmRecs.length > 0
    ? bmRecs.map(r => brierScore(r.bmProbs, r.actual.result)).reduce((s,v)=>s+v,0) / bmRecs.length
    : null;

  return {
    n,
    acc1X2: round4(correct1X2 / n),
    accOU25: ouN > 0 ? round4(correctOU / ouN) : null,
    brierCal:  round4(briers.reduce((s,v)=>s+v,0) / n),
    brierRaw:  round4(brierRaw.reduce((s,v)=>s+v,0) / n),
    brierNaive: round4(2/3),
    brierSkillCal: round4(1 - (briers.reduce((s,v)=>s+v,0)/n) / (2/3)),
    llCal:    round4(lls.reduce((s,v)=>s+v,0) / n),
    llRaw:    round4(llRaw.reduce((s,v)=>s+v,0) / n),
    llNaive:  round4(Math.log(3)),
    rpsCal:   round4(rpss.reduce((s,v)=>s+v,0) / n),
    rpsNaive: round4(2/3),
    bookmakerBrier: bmBrier != null ? round4(bmBrier) : null,
    bookmakerN: bmRecs.length,
    calImprovement: round4(
      (brierRaw.reduce((s,v)=>s+v,0) - briers.reduce((s,v)=>s+v,0)) / n
    ),
  };
}

function calibrationBins(records, nBins = 10) {
  const bins = Array.from({ length: nBins }, () => ({ sumP: 0, sumA: 0, count: 0 }));
  for (const r of records) {
    const p = r.calProbs[0]; // home win
    const a = r.actual.result === '1' ? 1 : 0;
    const b = Math.min(Math.floor(p * nBins), nBins - 1);
    bins[b].sumP += p; bins[b].sumA += a; bins[b].count++;
  }
  return bins.filter(b => b.count > 0).map((b, i) => ({
    meanPred: round4(b.sumP / b.count), meanAct: round4(b.sumA / b.count), count: b.count,
  }));
}

function edgeDecileAnalysis(records) {
  // Model confidence = max(probs) - second_max(probs)
  const withEdge = records.map(r => {
    const sorted = [...r.calProbs].sort((a,b) => b-a);
    const edge = sorted[0] - sorted[1];
    const correct = r.predResult === r.actual.result ? 1 : 0;
    return { edge, correct, brier: brierScore(r.calProbs, r.actual.result) };
  }).sort((a, b) => a.edge - b.edge);

  const nDeciles = 10;
  const size = Math.ceil(withEdge.length / nDeciles);
  return Array.from({ length: nDeciles }, (_, i) => {
    const chunk = withEdge.slice(i * size, (i + 1) * size);
    if (chunk.length === 0) return null;
    return {
      decile: i + 1,
      n: chunk.length,
      edgeLow:  round4(chunk[0].edge),
      edgeHigh: round4(chunk[chunk.length-1].edge),
      acc1X2:   round4(chunk.filter(c => c.correct).length / chunk.length),
      brierMean: round4(chunk.reduce((s,c)=>s+c.brier,0) / chunk.length),
    };
  }).filter(Boolean);
}

// ─── Ana fonksiyon ─────────────────────────────────────────────────────────────
async function runRollingOOS() {
  console.log('🔄 Rolling OOS Backtest başlatılıyor...');
  console.log(`   DAYS_BACK=${CONFIG.DAYS_BACK}, CALIB_WINDOW=${CONFIG.CALIB_WINDOW}g, TEST_WINDOW=${CONFIG.TEST_WINDOW}g`);

  await api.initBrowser();

  // ── Phase 1: Tarih günlüğü oluştur ──────────────────────────────────────────
  const today = new Date();
  const dateMap = {};  // date → [events]

  // Checkpoint kontrolü
  let checkpoint = null;
  if (RESUME && fs.existsSync(CONFIG.CHECKPOINT_FILE)) {
    try {
      checkpoint = JSON.parse(fs.readFileSync(CONFIG.CHECKPOINT_FILE, 'utf8'));
      console.log(`  Checkpoint bulundu: ${checkpoint.processedIds?.length ?? 0} maç işlenmiş`);
    } catch (_) { checkpoint = null; }
  }

  const dates = [];
  for (let i = 1; i <= CONFIG.DAYS_BACK; i++) {
    const d = new Date(today - i * 86400000);
    dates.push(d.toISOString().split('T')[0]);
  }
  dates.reverse(); // oldest first

  console.log(`\n📅 ${dates[0]} → ${dates[dates.length-1]} tarih aralığı taranıyor...`);
  for (const date of dates) {
    try {
      const data = await api.getScheduledEvents(date);
      const finished = (data?.events || []).filter(e =>
        e.status?.type === 'finished' &&
        CONFIG.TOP_LEAGUE_IDS.has(e.tournament?.uniqueTournament?.id) &&
        e.homeScore?.current != null
      );
      dateMap[date] = finished.map(e => ({ ...e, _date: date }));
      process.stdout.write(`  ${date}: ${finished.length} maç\n`);
    } catch (err) {
      console.error(`  ${date}: HATA — ${err.message}`);
      dateMap[date] = [];
    }
  }

  // ── Phase 2: Per-match tahmin üretimi ─────────────────────────────────────
  console.log('\n⚽ Tahminler üretiliyor...');
  const allMatchRecords = [];
  const processedIds = new Set(checkpoint?.processedIds ?? []);

  const allEvents = dates.flatMap(d => dateMap[d] || []);
  console.log(`Toplam: ${allEvents.length} maç`);

  const processMatch = async (ev) => {
    if (processedIds.has(ev.id)) return null;

    const hS = ev.homeScore?.current ?? NaN;
    const aS = ev.awayScore?.current ?? NaN;
    const result = isNaN(hS) || isNaN(aS) ? '?' : hS > aS ? '1' : hS < aS ? '2' : 'X';
    if (result === '?') return null;

    try {
      const matchData = await fetchAllMatchData(ev.id);
      const metrics   = calculateAllMetrics(matchData);
      const baseline  = getDynamicBaseline(matchData);
      baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
      baseline.leaguePointDensity   = metrics.meta?.leaguePointDensity   ?? null;
      baseline.medianGoalRate       = metrics.meta?.medianGoalRate       ?? null;
      baseline.leagueTeamCount      = metrics.meta?.leagueTeamCount      ?? null;
      baseline.ptsCV                = metrics.meta?.ptsCV                ?? null;
      baseline.normMinRatio         = metrics.meta?.normMinRatio         ?? null;
      baseline.normMaxRatio         = metrics.meta?.normMaxRatio         ?? null;
      baseline.homeMVBreakdown = computePositionMVBreakdown(matchData.homePlayers);
      baseline.awayMVBreakdown = computePositionMVBreakdown(matchData.awayPlayers);

      const report = generatePrediction(metrics, matchData, baseline, [], Math.random);
      processedIds.add(ev.id);

      const pH = (report.result?.homeWin ?? 0) / 100;
      const pD = (report.result?.draw    ?? 0) / 100;
      const pA = (report.result?.awayWin ?? 0) / 100;
      const sum = pH + pD + pA;

      const rawProbs = sum > 0 ? [pH/sum, pD/sum, pA/sum] : [1/3, 1/3, 1/3];

      // Bookmaker implied (de-vigged)
      const bm1 = metrics.shared?.contextual?.M131;
      const bmX = metrics.shared?.contextual?.M132;
      const bm2 = metrics.shared?.contextual?.M133;
      const bmProbs = (bm1 && bmX && bm2)
        ? deVig([bm1/100, bmX/100, bm2/100]) : null;

      return {
        id: ev.id,
        match: `${ev.homeTeam.name} vs ${ev.awayTeam.name}`,
        date: ev._date,
        league: ev.tournament?.name ?? '?',
        leagueId: ev.tournament?.uniqueTournament?.id,
        actual: {
          score: `${hS}-${aS}`,
          result,
          ou25: (hS + aS) > 2.5,
          btts: hS > 0 && aS > 0,
        },
        rawProbs,
        pOU25: (report.goals?.over25 ?? 50) / 100,
        pBTTS: (report.goals?.btts ?? 50) / 100,
        bmProbs,
      };
    } catch (err) {
      return null;
    }
  };

  let done = 0;
  for (let i = 0; i < allEvents.length; i += CONFIG.CONCURRENCY) {
    const batch = allEvents.slice(i, i + CONFIG.CONCURRENCY);
    const results = await Promise.all(batch.map(ev => processMatch(ev)));
    for (const r of results) if (r) allMatchRecords.push(r);
    done += batch.length;
    if (done % 30 === 0) {
      process.stdout.write(`  [${done}/${allEvents.length}] işlendi, ${allMatchRecords.length} geçerli\n`);
      // Save checkpoint
      fs.writeFileSync(CONFIG.CHECKPOINT_FILE, JSON.stringify({
        processedIds: [...processedIds],
        recordCount: allMatchRecords.length,
        savedAt: new Date().toISOString(),
      }));
    }
  }

  console.log(`\n✅ ${allMatchRecords.length} geçerli maç işlendi`);

  // ── Phase 3: Rolling window analizi ─────────────────────────────────────────
  console.log('\n📊 Rolling window kalibrasyon analizi...');

  // Kronolojik sıralama
  allMatchRecords.sort((a, b) => a.date.localeCompare(b.date));

  const CALIB_DAYS = CONFIG.CALIB_WINDOW;
  const TEST_DAYS  = CONFIG.TEST_WINDOW;

  const windows = [];
  const windowSize = CALIB_DAYS + TEST_DAYS;
  const allDates   = [...new Set(allMatchRecords.map(r => r.date))].sort();

  for (let i = CALIB_DAYS; i < allDates.length; i++) {
    const testStart = allDates[i];
    const testEnd   = allDates[Math.min(i + TEST_DAYS - 1, allDates.length - 1)];
    const calibStart = allDates[Math.max(0, i - CALIB_DAYS)];

    const calibRecords = allMatchRecords.filter(r => r.date >= calibStart && r.date < testStart);
    const testRecords  = allMatchRecords.filter(r => r.date >= testStart && r.date <= testEnd);

    if (calibRecords.length < 10 || testRecords.length < 3) continue;

    // Fit calibration on calib window
    const calibMatches = calibRecords.map(r => ({
      probHome: r.rawProbs[0], probDraw: r.rawProbs[1], probAway: r.rawProbs[2],
      actualResult: r.actual.result, leagueId: r.leagueId,
    }));
    const calParams = trainCalibration(calibMatches);

    // Apply to test window
    const testWithCal = testRecords.map(r => ({
      ...r,
      calProbs: calibrateProbs(r.rawProbs, r.leagueId, calParams),
      predResult: (() => {
        const p = calibrateProbs(r.rawProbs, r.leagueId, calParams);
        return p[0] > p[1] && p[0] > p[2] ? '1' : p[2] > p[1] ? '2' : 'X';
      })(),
      predOU: r.pOU25 >= 0.5,
    }));

    windows.push({
      calibStart, testStart, testEnd,
      calibN: calibRecords.length,
      testN:  testRecords.length,
      metrics: aggregateMetrics(testWithCal),
      calibrationBins: calibrationBins(testWithCal),
    });
  }

  // ── Phase 4: Global analiz (tüm maçlar, global kalibrasyon) ─────────────────
  console.log('\n📊 Global analiz...');

  // Fit global calibration on ALL records except last TEST_WINDOW days
  const lastDate = allMatchRecords[allMatchRecords.length - 1]?.date ?? '';
  const globalCalibCutoff = allDates.length > TEST_DAYS
    ? allDates[allDates.length - TEST_DAYS]
    : allDates[0];

  const globalCalibMatches = allMatchRecords
    .filter(r => r.date < globalCalibCutoff)
    .map(r => ({
      probHome: r.rawProbs[0], probDraw: r.rawProbs[1], probAway: r.rawProbs[2],
      actualResult: r.actual.result, leagueId: r.leagueId,
    }));

  const globalCalParams = globalCalibMatches.length >= 20
    ? trainCalibration(globalCalibMatches) : null;

  const allWithCal = allMatchRecords.map(r => ({
    ...r,
    calProbs: globalCalParams
      ? calibrateProbs(r.rawProbs, r.leagueId, globalCalParams)
      : r.rawProbs,
    predResult: (() => {
      const p = globalCalParams
        ? calibrateProbs(r.rawProbs, r.leagueId, globalCalParams)
        : r.rawProbs;
      return p[0] > p[1] && p[0] > p[2] ? '1' : p[2] > p[1] ? '2' : 'X';
    })(),
    predOU: r.pOU25 >= 0.5,
  }));

  const globalMetrics = aggregateMetrics(allWithCal);

  // Raw (no calibration) metrics for comparison
  const allWithRaw = allMatchRecords.map(r => ({
    ...r, calProbs: r.rawProbs,
    predResult: r.rawProbs[0] > r.rawProbs[1] && r.rawProbs[0] > r.rawProbs[2] ? '1'
      : r.rawProbs[2] > r.rawProbs[1] ? '2' : 'X',
    predOU: r.pOU25 >= 0.5,
  }));
  const rawMetrics = aggregateMetrics(allWithRaw);

  // Edge decile analysis
  const edgeDeciles = edgeDecileAnalysis(allWithCal);

  // League breakdown (global calibration)
  const leagueMap = {};
  for (const r of allWithCal) {
    if (!leagueMap[r.league]) leagueMap[r.league] = [];
    leagueMap[r.league].push(r);
  }
  const leagueBreakdown = Object.entries(leagueMap)
    .filter(([, recs]) => recs.length >= 5)
    .map(([league, recs]) => ({ league, ...aggregateMetrics(recs) }))
    .sort((a, b) => b.n - a.n);

  // ── Phase 5: Rapor ─────────────────────────────────────────────────────────
  const report = {
    generatedAt: new Date().toISOString(),
    description: 'Rolling Out-of-Sample Backtest',
    config: { DAYS_BACK: CONFIG.DAYS_BACK, CALIB_WINDOW: CONFIG.CALIB_WINDOW, TEST_WINDOW: CONFIG.TEST_WINDOW },
    totalMatches: allMatchRecords.length,

    globalMetrics: {
      withCalibration: globalMetrics,
      withoutCalibration: rawMetrics,
      calibrationGain: globalMetrics ? {
        brierDelta: round4(rawMetrics.brierCal - globalMetrics.brierCal),
        llDelta:    round4(rawMetrics.llCal    - globalMetrics.llCal),
        accDelta:   round4(globalMetrics.acc1X2 - rawMetrics.acc1X2),
      } : null,
    },

    rollingWindows: {
      windowCount: windows.length,
      windows: windows.map(w => ({
        period: `${w.testStart} → ${w.testEnd}`,
        calibN: w.calibN, testN: w.testN,
        ...w.metrics,
      })),
      // Rolling trend
      brierTrend: windows.map(w => ({ period: w.testStart, brier: w.metrics?.brierCal })),
    },

    edgeDecileAnalysis: {
      description: 'Model en güçlü edge dediği maçlar gerçekten daha mı iyi? Top decile > bottom decile olmalı',
      deciles: edgeDeciles,
      topVsBottomAcc: edgeDeciles.length >= 10
        ? `Top decile=${(edgeDeciles[9].acc1X2*100).toFixed(1)}% vs Bottom=${(edgeDeciles[0].acc1X2*100).toFixed(1)}%`
        : 'Yetersiz veri',
    },

    calibrationCurves: {
      allMatches: calibrationBins(allWithCal),
    },

    leagueBreakdown,
    errors: [],
  };

  // ── Konsol özeti ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('ROLLING OOS BACKTEST SONUÇLARI');
  console.log('═'.repeat(70));
  console.log(`Toplam maç     : ${allMatchRecords.length}`);
  console.log(`Rolling pencere: ${windows.length} (${CONFIG.CALIB_WINDOW}g calib + ${CONFIG.TEST_WINDOW}g test)`);
  console.log('');
  console.log('── GLOBAL METRİKLER ──────────────────────────────────────────────');
  if (globalMetrics) {
    console.log(`                  RAW      CAL      NAIVE    KITAPÇI`);
    console.log(`1X2 Accuracy  : ${(rawMetrics.acc1X2*100).toFixed(1)}%    ${(globalMetrics.acc1X2*100).toFixed(1)}%    33.3%`);
    console.log(`Brier Score   : ${rawMetrics.brierCal.toFixed(4)}  ${globalMetrics.brierCal.toFixed(4)}  ${globalMetrics.brierNaive.toFixed(4)}  ${globalMetrics.bookmakerBrier?.toFixed(4) ?? 'N/A'}`);
    console.log(`Log Loss      : ${rawMetrics.llCal.toFixed(4)}  ${globalMetrics.llCal.toFixed(4)}  ${globalMetrics.llNaive.toFixed(4)}`);
    console.log(`RPS           : ${rawMetrics.rpsCal.toFixed(4)}  ${globalMetrics.rpsCal.toFixed(4)}  ${globalMetrics.rpsNaive.toFixed(4)}`);
    console.log(`Brier Skill   :          ${(globalMetrics.brierSkillCal*100).toFixed(1)}%   baseline`);
    console.log(`Calib Gain    :          +${(report.globalMetrics.calibrationGain?.brierDelta*1000).toFixed(2)}mB (milli-Brier)`);
  }
  console.log('');
  console.log('── EDGE DECİLE ANALİZİ ──────────────────────────────────────────');
  console.log(report.edgeDecileAnalysis.topVsBottomAcc);
  if (edgeDeciles.length >= 5) {
    console.log('Decile  Edge      1X2%   Brier');
    edgeDeciles.forEach(d => {
      console.log(`  ${String(d.decile).padStart(2)}   ${d.edgeLow.toFixed(2)}-${d.edgeHigh.toFixed(2)}  ${(d.acc1X2*100).toFixed(1)}%  ${d.brierMean.toFixed(4)}`);
    });
  }
  console.log('');
  console.log('── LİG BAZLI (n≥5) ──────────────────────────────────────────────');
  leagueBreakdown.filter(l => l.n >= 5).slice(0, 8).forEach(l => {
    console.log(`${l.league.substring(0,28).padEnd(28)} n=${String(l.n).padStart(3)} 1X2=${(l.acc1X2*100).toFixed(0)}% Brier=${l.brierCal.toFixed(4)} Skill=${(l.brierSkillCal*100).toFixed(0)}%`);
  });
  console.log('═'.repeat(70));

  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n✅ Rapor kaydedildi: backtest_rolling_oos.json`);

  try { await api.closeBrowser(); } catch (_) {}
  // Clean up checkpoint on success
  if (fs.existsSync(CONFIG.CHECKPOINT_FILE)) fs.unlinkSync(CONFIG.CHECKPOINT_FILE);
  process.exit(0);
}

runRollingOOS().catch(err => {
  console.error('Kritik hata:', err.message, '\n', err.stack);
  process.exit(1);
});
