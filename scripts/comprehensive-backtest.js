'use strict';
/**
 * Comprehensive Backtest & Statistical Calibration Analysis
 * ──────────────────────────────────────────────────────────
 * Metrikler:
 *   • Accuracy:  1X2, OU2.5, BTTS, exact score
 *   • Scoring:   Brier score, log loss, calibration curve
 *   • Benchmark: Bookmaker closing odds (de-vigged) karşılaştırma
 *   • Ablation:  Her bloğun tahmin doğruluğuna katkısı (correlation + directional)
 *   • Breakdown: Liga bazlı, pazar bazlı, olasılık dilimi bazlı
 *
 * Notlar:
 *   - Son N güne ait tamamlanmış maçlar kullanılır (out-of-sample approximation)
 *   - True out-of-sample için anlık veri snapshot gerekir; burada sezon toplaması kullanılır
 *   - Concurrency 3 ile çalışır (~200 maç ≈ 10-12 dk)
 */

const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { computePositionMVBreakdown } = require('../src/engine/quality-factors');
const fs = require('fs');
const path = require('path');

// ─── Konfigürasyon ────────────────────────────────────────────────────────────
const CONFIG = {
  DAYS_BACK: 10,           // Kaç gün geriye git
  MAX_MATCHES: 1000,          // Maksimum maç sayısı
  CONCURRENCY: 3,            // Paralel fetch sayısı
  TOP_LEAGUE_IDS: new Set([
    17,   // Premier League
    8,    // La Liga
    23,   // Serie A
    35,   // Bundesliga
    34,   // Ligue 1
    7,    // Champions League
    24,   // Championship
    11,   // Süper Lig
    238,  // Primeira Liga
    37,   // Eredivisie
    679,  // Europa League
    547,  // Conference League
    329,  // Russian Premier
  ]),
  CALIBRATION_BINS: 10,          // Kalibrasyon için kaç bin
  OUTPUT_FILE: path.join(__dirname, '..', 'backtest_comprehensive.json'),
};

// ─── Matematiksel yardımcılar ──────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round4 = v => Math.round(v * 10000) / 10000;
const round2 = v => Math.round(v * 100) / 100;

/** Brier skoru: (p_k - y_k)² ortalaması */
function brierScore(probs, actual) {
  // probs: [p_home, p_draw, p_away], actual: '1'|'X'|'2'
  const y = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0];
  return (Math.pow(probs[0] - y[0], 2) + Math.pow(probs[1] - y[1], 2) + Math.pow(probs[2] - y[2], 2)) / 3;
}

/** Binary Brier (OU, BTTS için) */
function brierBinary(p, actual) {
  return Math.pow(p - (actual ? 1 : 0), 2);
}

/** Log loss: -log(p_correct) — epsilon ile sıfır bölmeyi önle */
function logLoss(probs, actual, eps = 1e-7) {
  const pMap = { '1': probs[0], 'X': probs[1], '2': probs[2] };
  return -Math.log(Math.max(pMap[actual], eps));
}

/** Kitapçı oranlarını de-vig'le (additive normalization) */
function deVig(rawProbs) {
  const total = rawProbs.reduce((s, p) => s + p, 0);
  if (total <= 0) return null;
  return rawProbs.map(p => p / total);
}

/** RPS (Ranked Probability Score) — sıralı tahminin doğruluğu */
function rpsScore(probs, actual) {
  const o = actual === '1' ? 0 : actual === 'X' ? 1 : 2;
  let rps = 0;
  let cumPred = 0, cumActual = 0;
  for (let i = 0; i < 3; i++) {
    cumPred += probs[i];
    cumActual += (i === o ? 1 : 0);
    rps += Math.pow(cumPred - cumActual, 2);
  }
  return rps / 2;
}

/** Point-biserial korelasyon (sürekli × binary) */
function pointBiserialCorr(continuous, binary) {
  const n = continuous.length;
  if (n < 3) return null;
  const n1 = binary.filter(b => b === 1).length;
  const n0 = n - n1;
  if (n1 === 0 || n0 === 0) return null;

  const mean1 = continuous.reduce((s, v, i) => s + (binary[i] === 1 ? v : 0), 0) / n1;
  const mean0 = continuous.reduce((s, v, i) => s + (binary[i] === 0 ? v : 0), 0) / n0;
  const std = Math.sqrt(continuous.reduce((s, v) => {
    const m = continuous.reduce((a, b) => a + b, 0) / n;
    return s + Math.pow(v - m, 2);
  }, 0) / n);

  if (std === 0) return null;
  return ((mean1 - mean0) / std) * Math.sqrt((n1 * n0) / (n * n));
}



/** getPower yeniden implementasyonu (match-simulator.js ile tutarlı) */
function computePowerFromUnits(u, vol, leagueAvgGoals) {
  const geo = (arr) => Math.pow(
    arr.reduce((p, v) => p * Math.max(v, 0.01), 1), 1 / arr.length
  );

  const atk = geo([u.BITIRICILIK, u.YARATICILIK, u.SUT_URETIMI,
  u.FORM_KISA, u.FORM_UZUN, u.TOPLA_OYNAMA, u.BAGLANTI_OYUNU]);

  const TURNUVA_KUPLA = (vol != null && leagueAvgGoals != null && leagueAvgGoals > 0)
    ? clamp(vol / leagueAvgGoals, 0.06, 0.28) : null;
  const turnuvaMod = TURNUVA_KUPLA != null
    ? Math.max(1 + (u.TURNUVA_BASKISI - 1.0) * TURNUVA_KUPLA, 0.5) : 1.0;

  const baseDef = geo([u.SAVUNMA_DIRENCI, u.SAVUNMA_AKSIYONU, u.GK_REFLEKS,
  u.DISIPLIN, u.GK_ALAN_HAKIMIYETI]);
  const def = baseDef / turnuvaMod;

  return { atk: clamp(atk, 0.4, 2.5), def: clamp(def, 0.4, 2.5) };
}

/** Poisson 1X2 hesapla (max 10 gol) */
function poissonProbs(lH, lA) {
  if (lH == null || lA == null || !isFinite(lH) || !isFinite(lA)) return null;
  let home = 0, draw = 0, away = 0;
  const pois = (k, l) => {
    let p = Math.exp(-l), f = 1;
    for (let i = 1; i <= k; i++) { p *= l; f *= i; }
    return p / f;
  };
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = pois(h, lH) * pois(a, lA);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away;
  if (total <= 0) return null;
  return [home / total, draw / total, away / total];
}

// ─── Ana fonksiyon ─────────────────────────────────────────────────────────────
async function runComprehensiveBacktest() {
  console.log('🔬 Kapsamlı Backtest & Kalibrasyon Analizi başlatılıyor...');
  console.log(`   Hedef: Son ${CONFIG.DAYS_BACK} gün, en fazla ${CONFIG.MAX_MATCHES} maç`);
  await api.initBrowser();

  // ── Phase 1: Maç Listesi Toplama ────────────────────────────────────────────
  const today = new Date();
  const dates = [];
  for (let i = 1; i <= CONFIG.DAYS_BACK; i++) {
    const d = new Date(today - i * 86400000);
    dates.push(d.toISOString().split('T')[0]);
  }

  let candidateEventsMap = new Map();
  console.log(`\n📅 Tarihler taranıyor: ${dates[dates.length - 1]} → ${dates[0]}`);
  for (const date of dates) {
    try {
      const data = await api.getScheduledEvents(date);
      const finished = (data?.events || []).filter(e =>
        e.status?.type === 'finished' &&
        e.homeScore?.current != null && e.awayScore?.current != null
      );
      for (const e of finished) {
        if (!candidateEventsMap.has(e.id)) {
          candidateEventsMap.set(e.id, { ...e, _date: date });
        }
      }
      process.stdout.write(`  ${date}: ${finished.length} maç (Benzersiz toplam: ${candidateEventsMap.size})\n`);
    } catch (err) {
      console.error(`  ${date}: HATA ${err.message}`);
    }
  }

  const candidateEvents = Array.from(candidateEventsMap.values());

  // Liglere göre dengeli seçim — her ligden çok fazla değil
  const byLeague = {};
  for (const ev of candidateEvents) {
    const lid = ev.tournament?.uniqueTournament?.id;
    if (!byLeague[lid]) byLeague[lid] = [];
    byLeague[lid].push(ev);
  }
  // Her ligden max 30, toplam max MAX_MATCHES
  const selected = [];
  for (const [lid, evs] of Object.entries(byLeague)) {
    const sample = evs.slice(0, 30);
    selected.push(...sample);
    if (selected.length >= CONFIG.MAX_MATCHES) break;
  }
  const eventsToTest = selected.slice(0, CONFIG.MAX_MATCHES);
  console.log(`\n✅ Toplam seçilen: ${eventsToTest.length} maç (${Object.keys(byLeague).length} lig)`);

  // ── Phase 2: Tahmin Üretimi (Batch Concurrent) ──────────────────────────────
  const results = [];
  const errors = [];
  let done = 0;

  const processMatch = async (ev) => {
    const hScore = ev.homeScore?.current ?? ev.homeScore?.display ?? '?';
    const aScore = ev.awayScore?.current ?? ev.awayScore?.display ?? '?';
    const hS = parseInt(hScore), aS = parseInt(aScore);

    try {
      const matchData = await fetchAllMatchData(ev.id);
      const metrics = calculateAllMetrics(matchData);
      const baseline = getDynamicBaseline(matchData);
      baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
      baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
      baseline.homeMVBreakdown = computePositionMVBreakdown(matchData.homePlayers);
      baseline.awayMVBreakdown = computePositionMVBreakdown(matchData.awayPlayers);

      const report = generatePrediction(metrics, matchData, baseline, [], Math.random);
      done++;
      if (done % 10 === 0) process.stdout.write(`  [${done}/${eventsToTest.length}] işlendi...\n`);

      // ── Gerçek sonuç ──────────────────────────────────────────────────────
      const actualResult = isNaN(hS) || isNaN(aS) ? '?'
        : hS > aS ? '1' : hS < aS ? '2' : 'X';
      const actualOU25 = (!isNaN(hS) && !isNaN(aS)) ? (hS + aS) > 2.5 : null;
      const actualBTTS = (!isNaN(hS) && !isNaN(aS)) ? (hS > 0 && aS > 0) : null;
      const actualScore = `${hS}-${aS}`;

      // ── Model tahminleri ──────────────────────────────────────────────────
      const pred = report.result || {};
      const pHome = (pred.homeWin ?? 0) / 100;
      const pDraw = (pred.draw ?? 0) / 100;
      const pAway = (pred.awayWin ?? 0) / 100;
      const sum12x = pHome + pDraw + pAway;
      // Renormalize (floating point hatalarını temizle)
      const probs = sum12x > 0 ? [pHome / sum12x, pDraw / sum12x, pAway / sum12x] : [1 / 3, 1 / 3, 1 / 3];
      const pOU25 = (report.goals?.over25 ?? 50) / 100;
      const pBTTS = (report.goals?.btts ?? 50) / 100;
      const predScore = report.score?.predicted ?? null;

      // Lambda değerleri (ablation için)
      const lambdaHome = report.simulationInsights?.sampleRun?.lambdaHome
        ?? report.score?.lambdaHome ?? null;
      const lambdaAway = report.simulationInsights?.sampleRun?.lambdaAway
        ?? report.score?.lambdaAway ?? null;

      // ── Bookmaker olasılıkları (M131-M133, de-vigged) ────────────────────
      const bm131 = metrics.shared?.contextual?.M131; // 1 ihtimali
      const bm132 = metrics.shared?.contextual?.M132; // X ihtimali
      const bm133 = metrics.shared?.contextual?.M133; // 2 ihtimali
      let bmProbs = null;
      if (bm131 != null && bm132 != null && bm133 != null) {
        const rawBM = [bm131 / 100, bm132 / 100, bm133 / 100];
        bmProbs = deVig(rawBM);
      }

      // ── Unit skorları (ablation için) ─────────────────────────────────────
      const homeUnits = report.behavioralAnalysis?.home ?? {};
      const awayUnits = report.behavioralAnalysis?.away ?? {};

      // Behavioral modifier hesapla (ablation için geri-türet)
      const vol = baseline.leagueGoalVolatility;
      const leagueAvgGoals = baseline.leagueAvgGoals;
      let behavSens = null, behavModHome = 1.0, behavModAway = 1.0;
      let lambdaModHome = 1.0, lambdaModAway = 1.0;

      if (vol != null && leagueAvgGoals != null && leagueAvgGoals > 0) {
        behavSens = clamp(vol / (leagueAvgGoals * 3), vol * 0.08, vol * 0.45);
        const hP = computePowerFromUnits(homeUnits, vol, leagueAvgGoals);
        const aP = computePowerFromUnits(awayUnits, vol, leagueAvgGoals);
        behavModHome = 1.0 + clamp(hP.atk - aP.def, -1.0, 1.0) * behavSens;
        behavModAway = 1.0 + clamp(aP.atk - hP.def, -1.0, 1.0) * behavSens;
      }
      // urgency lambda modifier — proxy: GOL_IHTIYACI dan
      const urgencyH = homeUnits['GOL_IHTIYACI'] ?? 1.0;
      const urgencyA = awayUnits['GOL_IHTIYACI'] ?? 1.0;
      const URGENCY_SENS = (baseline.leaguePointDensity != null)
        ? clamp((vol != null && leagueAvgGoals != null && leagueAvgGoals > 0
          ? (vol / leagueAvgGoals) * 1.8 : 0.45) / (baseline.leaguePointDensity + 0.12), 0.08, 0.65)
        : null;
      lambdaModHome = URGENCY_SENS != null ? 1.0 + (urgencyH - 1.0) * URGENCY_SENS : 1.0;
      lambdaModAway = URGENCY_SENS != null ? 1.0 + (urgencyA - 1.0) * URGENCY_SENS : 1.0;

      results.push({
        id: ev.id,
        match: `${ev.homeTeam.name} vs ${ev.awayTeam.name}`,
        date: ev._date,
        league: ev.tournament?.name ?? '?',
        leagueId: ev.tournament?.uniqueTournament?.id,
        actual: { score: actualScore, result: actualResult, ou25: actualOU25, btts: actualBTTS },
        model: {
          probs,
          pOU25: round4(pOU25),
          pBTTS: round4(pBTTS),
          predScore,
          top5Scores: report.score?.top5 ?? null,
          lambdaHome, lambdaAway,
          predictedResult: probs[0] > probs[1] && probs[0] > probs[2] ? '1'
            : probs[2] > probs[1] && probs[2] > probs[0] ? '2' : 'X',
          predictedOU25: pOU25 >= 0.5,
          predictedBTTS: pBTTS >= 0.5,
        },
        bookmaker: { probs: bmProbs },
        units: { home: homeUnits, away: awayUnits },
        // MC Ablation için gerekli ham veriler:
        rawMatchData: matchData,
        rawMetrics: metrics,
        rawBaseline: baseline,
        leaguePhysics: { vol, leagueAvgGoals, leaguePointDensity: baseline.leaguePointDensity },
        ablationSupport: {
          behavSens, behavModHome, behavModAway,
          lambdaModHome, lambdaModAway,
          lambdaHome, lambdaAway,
          homeUnits, awayUnits, vol, leagueAvgGoals,
        },
      });
    } catch (err) {
      done++;
      errors.push({ id: ev.id, match: `${ev.homeTeam?.name} vs ${ev.awayTeam?.name}`, error: err.message });
    }
  };

  console.log(`\n⚽ Tahminler üretiliyor (${CONFIG.CONCURRENCY} eşzamanlı)...`);
  const startTime = Date.now();

  // Batch processing
  for (let i = 0; i < eventsToTest.length; i += CONFIG.CONCURRENCY) {
    const batch = eventsToTest.slice(i, i + CONFIG.CONCURRENCY);
    await Promise.all(batch.map(ev => processMatch(ev)));
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ ${results.length} tahmin tamamlandı (${errors.length} hata, ${elapsedSec}s)`);

  // ── Phase 3: İstatistiksel Analiz ──────────────────────────────────────────
  console.log('\n📊 İstatistikler hesaplanıyor...');

  const valid = results.filter(r =>
    r.actual.result !== '?' && r.model.probs[0] > 0
  );

  // 3a. Genel doğruluk
  const n = valid.length;
  const correct1X2 = valid.filter(r => r.model.predictedResult === r.actual.result).length;
  const correctOU25 = valid.filter(r => r.actual.ou25 != null && r.model.predictedOU25 === r.actual.ou25).length;
  const correctBTTS = valid.filter(r => r.actual.btts != null && r.model.predictedBTTS === r.actual.btts).length;
  const correctScore = valid.filter(r => r.model.predScore === r.actual.score).length;
  const ou25Valid = valid.filter(r => r.actual.ou25 != null).length;
  const bttsValid = valid.filter(r => r.actual.btts != null).length;

  // 3b. Brier scores
  const brierAll = valid.map(r => brierScore(r.model.probs, r.actual.result));
  const brierMean = brierAll.reduce((s, v) => s + v, 0) / n;
  const brierRef = 2 / 3;  // Naive (1/3, 1/3, 1/3) reference

  const brierOU25All = valid.filter(r => r.actual.ou25 != null)
    .map(r => brierBinary(r.model.pOU25, r.actual.ou25));
  const brierOU25Mean = brierOU25All.length > 0
    ? brierOU25All.reduce((s, v) => s + v, 0) / brierOU25All.length : null;

  const brierBTTSAll = valid.filter(r => r.actual.btts != null)
    .map(r => brierBinary(r.model.pBTTS, r.actual.btts));
  const brierBTTSMean = brierBTTSAll.length > 0
    ? brierBTTSAll.reduce((s, v) => s + v, 0) / brierBTTSAll.length : null;

  // 3c. Log loss
  const llAll = valid.map(r => logLoss(r.model.probs, r.actual.result));
  const llMean = llAll.reduce((s, v) => s + v, 0) / n;
  const llRef = Math.log(3);  // Naive reference

  // 3d. RPS
  const rpsAll = valid.map(r => rpsScore(r.model.probs, r.actual.result));
  const rpsMean = rpsAll.reduce((s, v) => s + v, 0) / n;
  const rpsRef = 2 / 3;  // Naive reference

  // 3e. Bookmaker karşılaştırma
  const bmValid = valid.filter(r => r.bookmaker.probs != null);
  const bmN = bmValid.length;
  let bmBrierMean = null, bmLLMean = null, bmRPSMean = null;
  if (bmN > 0) {
    const bmBriers = bmValid.map(r => brierScore(r.bookmaker.probs, r.actual.result));
    const bmLLs = bmValid.map(r => logLoss(r.bookmaker.probs, r.actual.result));
    const bmRPSs = bmValid.map(r => rpsScore(r.bookmaker.probs, r.actual.result));
    bmBrierMean = bmBriers.reduce((s, v) => s + v, 0) / bmN;
    bmLLMean = bmLLs.reduce((s, v) => s + v, 0) / bmN;
    bmRPSMean = bmRPSs.reduce((s, v) => s + v, 0) / bmN;
    // Aynı maçlarda model metrikleri
    const mBriersForBM = bmValid.map(r => brierScore(r.model.probs, r.actual.result));
    const mBrierForBM = mBriersForBM.reduce((s, v) => s + v, 0) / bmN;
    const mLLForBM = bmValid.map(r => logLoss(r.model.probs, r.actual.result)).reduce((s, v) => s + v, 0) / bmN;
  }

  // 3f. Kalibrasyon eğrisi (1X2 — her sonuç için)
  function calibrationCurve(predictedProbs, actuals, nBins = 10) {
    const bins = Array.from({ length: nBins }, () => ({ sumPred: 0, sumAct: 0, count: 0 }));
    for (let i = 0; i < predictedProbs.length; i++) {
      const p = predictedProbs[i];
      const y = actuals[i];
      const bin = Math.min(Math.floor(p * nBins), nBins - 1);
      bins[bin].sumPred += p;
      bins[bin].sumAct += y;
      bins[bin].count++;
    }
    return bins.map((b, i) => ({
      binLow: round4(i / nBins),
      binHigh: round4((i + 1) / nBins),
      meanPred: b.count > 0 ? round4(b.sumPred / b.count) : null,
      meanAct: b.count > 0 ? round4(b.sumAct / b.count) : null,
      count: b.count,
    })).filter(b => b.count > 0);
  }

  const homeProbs = valid.map(r => r.model.probs[0]);
  const homeActuals = valid.map(r => r.actual.result === '1' ? 1 : 0);
  const drawProbs = valid.map(r => r.model.probs[1]);
  const drawActuals = valid.map(r => r.actual.result === 'X' ? 1 : 0);
  const awayProbs = valid.map(r => r.model.probs[2]);
  const awayActuals = valid.map(r => r.actual.result === '2' ? 1 : 0);

  const calibHome = calibrationCurve(homeProbs, homeActuals, CONFIG.CALIBRATION_BINS);
  const calibDraw = calibrationCurve(drawProbs, drawActuals, CONFIG.CALIBRATION_BINS);
  const calibAway = calibrationCurve(awayProbs, awayActuals, CONFIG.CALIBRATION_BINS);
  const calibOU25 = calibrationCurve(
    valid.filter(r => r.actual.ou25 != null).map(r => r.model.pOU25),
    valid.filter(r => r.actual.ou25 != null).map(r => r.actual.ou25 ? 1 : 0),
    CONFIG.CALIBRATION_BINS
  );
  const calibBTTS = calibrationCurve(
    valid.filter(r => r.actual.btts != null).map(r => r.model.pBTTS),
    valid.filter(r => r.actual.btts != null).map(r => r.actual.btts ? 1 : 0),
    CONFIG.CALIBRATION_BINS
  );

  // ── Phase 4: Liga Bazlı Breakdown ─────────────────────────────────────────
  const leagueStats = {};
  for (const r of valid) {
    const league = r.league;
    if (!leagueStats[league]) {
      leagueStats[league] = {
        n: 0, correct1X2: 0, correctOU25: 0, correctBTTS: 0,
        brierSum: 0, llSum: 0, rpsSum: 0
      };
    }
    const ls = leagueStats[league];
    ls.n++;
    if (r.model.predictedResult === r.actual.result) ls.correct1X2++;
    if (r.actual.ou25 != null && r.model.predictedOU25 === r.actual.ou25) ls.correctOU25++;
    if (r.actual.btts != null && r.model.predictedBTTS === r.actual.btts) ls.correctBTTS++;
    ls.brierSum += brierScore(r.model.probs, r.actual.result);
    ls.llSum += logLoss(r.model.probs, r.actual.result);
    ls.rpsSum += rpsScore(r.model.probs, r.actual.result);
  }
  const leagueBreakdown = Object.entries(leagueStats)
    .filter(([, ls]) => ls.n >= 3)
    .map(([league, ls]) => ({
      league,
      n: ls.n,
      acc1X2: round4(ls.correct1X2 / ls.n),
      accOU25: round4(ls.correctOU25 / ls.n),
      accBTTS: round4(ls.correctBTTS / ls.n),
      brierMean: round4(ls.brierSum / ls.n),
      llMean: round4(ls.llSum / ls.n),
      rpsMean: round4(ls.rpsSum / ls.n),
    }))
    .sort((a, b) => b.n - a.n);

  // ── Phase 5: Feature Ablation ──────────────────────────────────────────────
  console.log('\n🔬 Feature ablation hesaplanıyor...');

  const BLOCK_NAMES = [
    'BITIRICILIK', 'YARATICILIK', 'SUT_URETIMI', 'HAVA_HAKIMIYETI', 'DURAN_TOP',
    'SAVUNMA_DIRENCI', 'SAVUNMA_AKSIYONU', 'GK_REFLEKS', 'GK_ALAN_HAKIMIYETI',
    'ZİHİNSEL_DAYANIKLILIK', 'FİŞİ_ÇEKME', 'PSIKOLOJIK_KIRILGANLIK', 'DISIPLIN',
    'MOMENTUM_AKIŞI', 'FORM_KISA', 'FORM_UZUN', 'MAC_BASLANGICI', 'MAC_SONU',
    'MENAJER_STRATEJISI', 'TURNUVA_BASKISI', 'GOL_IHTIYACI',
    'TOPLA_OYNAMA', 'BAGLANTI_OYUNU', 'KADRO_DERINLIGI',
    'H2H_DOMINASYON', 'HAKEM_DINAMIKLERI', 'TAKTIKSEL_UYUM',
  ];

  // 5a. Correlation-based ablation: her bloğun avantaj skoru ile tahmin doğruluğunun korelasyonu
  const ablationCorr = {};
  for (const block of BLOCK_NAMES) {
    const edges = [], corrects = [];
    for (const r of valid) {
      const hU = r.units?.home?.[block];
      const aU = r.units?.away?.[block];
      if (hU == null || aU == null) continue;
      const edge = hU - aU; // ev sahibi üstünlüğü
      const correct = r.model.predictedResult === r.actual.result ? 1 : 0;
      // Block pred direction ile actual alignment
      const blockPrediction = edge > 0 ? '1' : edge < 0 ? '2' : 'X';
      edges.push(edge);
      corrects.push(correct);
    }
    const corr = pointBiserialCorr(edges, corrects);

    // Directional accuracy: blok ev>dep dediğinde ev mi kazandı?
    let dirCorrect = 0, dirTotal = 0;
    for (const r of valid) {
      const hU = r.units?.home?.[block];
      const aU = r.units?.away?.[block];
      if (hU == null || aU == null || Math.abs(hU - aU) < 0.02) continue;
      dirTotal++;
      const blockSaysHome = hU > aU;
      const homeWon = r.actual.result === '1';
      const awayWon = r.actual.result === '2';
      if ((blockSaysHome && homeWon) || (!blockSaysHome && awayWon)) dirCorrect++;
    }
    const dirAcc = dirTotal > 5 ? round4(dirCorrect / dirTotal) : null;

    // True Monte Carlo Ablation
    let ablCorrCount = 0, ablTotal = 0;
    let sumOrigBrier = 0, sumAblBrier = 0;

    for (const r of valid) {
      if (!r.rawBaseline || !r.rawMatchData || !r.rawMetrics) continue;

      // Derin kopya (deep clone) baseline
      const copiedBaseline = JSON.parse(JSON.stringify(r.rawBaseline));
      copiedBaseline._ablationRuns = 50; // Hızlı resimülasyon
      if (copiedBaseline.homeUnits) copiedBaseline.homeUnits[block] = 1.0;
      if (copiedBaseline.awayUnits) copiedBaseline.awayUnits[block] = 1.0;

      // Gerçek Monte Carlo resimülasyonu
      const newPredData = generatePrediction(r.rawMetrics, r.rawMatchData, copiedBaseline, false, null);
      const newProbs = newPredData.poissonPMF || newPredData.probs;
      if (!newProbs || newProbs.length < 3) continue;

      ablTotal++;

      const origBrier = brierScore(r.model.probs, r.actual.result);
      const ablBrier = brierScore(newProbs, r.actual.result);

      sumOrigBrier += origBrier;
      sumAblBrier += ablBrier;

      const newPred = newProbs[0] > newProbs[1] && newProbs[0] > newProbs[2] ? '1'
        : newProbs[2] > newProbs[1] && newProbs[2] > newProbs[0] ? '2' : 'X';
      if (newPred === r.actual.result) ablCorrCount++;
    }

    const ablAcc = ablTotal > 5 ? round4(ablCorrCount / ablTotal) : null;
    const origAcc = ablTotal > 5 ? round4(
      valid.filter(r => r.rawBaseline && r.model.predictedResult === r.actual.result).length / ablTotal
    ) : null;

    // Brier Delta: Negatif Brier daha iyidir.
    // Eğer blok çıkarıldığında Brier ARTIYORSA (kötüleşiyorsa), blok asıl modelde faydalıdır.
    // Delta = Ablated_Brier - Original_Brier (Pozitif -> Blok faydalı demektir)
    const ablBrierDelta = ablTotal > 5 ? round4((sumAblBrier / ablTotal) - (sumOrigBrier / ablTotal)) : null;

    ablationCorr[block] = {
      pbCorr: corr != null ? round4(corr) : null,  // Point-biserial correlation
      dirAcc,          // Directional accuracy
      counterfactualAcc: ablAcc,     // Accuracy when this block = neutral
      originalAcc: origAcc,          // Original accuracy for same subset
      ablationBrierDelta: ablBrierDelta, // Yeni MC Ablation Brier Delta
      sampleSize: dirTotal,
    };
  }

  // Ablation'ı delta'ya göre sırala (Büyük Brier Delta = Daha önemli blok)
  const ablationRanked = Object.entries(ablationCorr)
    .map(([block, stats]) => ({ block, ...stats }))
    .sort((a, b) => (b.ablationBrierDelta ?? -99) - (a.ablationBrierDelta ?? -99));

  // ── Phase 6: Rapor Oluştur ─────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const bookmarkerComparison = bmN > 0 ? {
    matchesWithOdds: bmN,
    // Bu maçlarda model metrikleri
    modelBrierOnOddsMatches: round4(bmValid.map(r => brierScore(r.model.probs, r.actual.result)).reduce((s, v) => s + v, 0) / bmN),
    modelLLOnOddsMatches: round4(bmValid.map(r => logLoss(r.model.probs, r.actual.result)).reduce((s, v) => s + v, 0) / bmN),
    modelRPSOnOddsMatches: round4(bmValid.map(r => rpsScore(r.model.probs, r.actual.result)).reduce((s, v) => s + v, 0) / bmN),
    bookmakerBrier: round4(bmBrierMean),
    bookmakerLL: round4(bmLLMean),
    bookmakerRPS: round4(bmRPSMean),
    modelVsBookmakerBrier: round4(
      bmValid.map(r => brierScore(r.model.probs, r.actual.result)).reduce((s, v) => s + v, 0) / bmN - bmBrierMean
    ),
    note: 'SofaScore odds genellikle açılış oranları — gerçek kapanış oranları için ayrı bir kaynak gerekir',
  } : { note: 'Yeterli odds verisi bulunamadı' };

  const report = {
    generatedAt: new Date().toISOString(),
    description: 'Kapsamlı Backtest & Kalibrasyon Analizi — Out-of-Sample Approximation',
    methodology: {
      datesAnalyzed: dates,
      totalFetched: eventsToTest.length,
      totalValid: valid.length,
      totalErrors: errors.length,
      elapsedSec: parseFloat(elapsed),
      note: 'DİKKAT (APPROXIMATE OOS): Gerçek "Point-in-Time" (maç anındaki lig durumu) yerine sezonun o anki kümülatif snapshot\'ı kullanılmıştır. Bu durum kısmi veri sızıntısı (data leakage) barındırabilir.',
    },

    // ── Genel Metrikler ──────────────────────────────────────────────────────
    summary: {
      n,
      accuracy: {
        '1X2': { correct: correct1X2, total: n, pct: round4(correct1X2 / n) },
        'OU2.5': { correct: correctOU25, total: ou25Valid, pct: round4(correctOU25 / ou25Valid) },
        'BTTS': { correct: correctBTTS, total: bttsValid, pct: round4(correctBTTS / bttsValid) },
        'Score': { correct: correctScore, total: n, pct: round4(correctScore / n) },
      },
    },

    // ── Olasılık Metrikleri ──────────────────────────────────────────────────
    probabilityMetrics: {
      '1X2': {
        brierScore: round4(brierMean),
        brierRef: round4(brierRef),
        brierSkill: round4(1 - brierMean / brierRef),
        logLoss: round4(llMean),
        logLossRef: round4(llRef),
        llSkill: round4(1 - llMean / llRef),
        rpsScore: round4(rpsMean),
        rpsRef: round4(rpsRef),
        rpsSkill: round4(1 - rpsMean / rpsRef),
        interpretation: {
          brierSkill: brierMean < brierRef
            ? `Model naive'den ${((1 - brierMean / brierRef) * 100).toFixed(1)}% daha iyi`
            : 'Model naive referanstan kötü',
        },
      },
      'OU2.5': {
        brierScore: brierOU25Mean != null ? round4(brierOU25Mean) : null,
        brierRef: 0.25,  // Binary: (0.5-0)² = 0.25
        brierSkill: brierOU25Mean != null ? round4(1 - brierOU25Mean / 0.25) : null,
      },
      'BTTS': {
        brierScore: brierBTTSMean != null ? round4(brierBTTSMean) : null,
        brierRef: 0.25,
        brierSkill: brierBTTSMean != null ? round4(1 - brierBTTSMean / 0.25) : null,
      },
    },

    // ── Kitapçı Karşılaştırma ────────────────────────────────────────────────
    bookmakerBenchmark: bookmarkerComparison,

    // ── Kalibrasyon Eğrileri ─────────────────────────────────────────────────
    calibrationCurves: {
      homeWin: calibHome,
      draw: calibDraw,
      awayWin: calibAway,
      over25: calibOU25,
      btts: calibBTTS,
    },

    // ── Liga Bazlı Breakdown ─────────────────────────────────────────────────
    leagueBreakdown,

    // ── Feature Ablation ─────────────────────────────────────────────────────
    featureAblation: {
      description: [
        'ablationDelta > 0: Blok kaldırıldığında doğruluk düşüyor → KATKı SAĞLIYOR',
        'ablationDelta ≈ 0: Blok nötr → GÜRÜLTÜ veya ZAYIF KATKI',
        'ablationDelta < 0: Blok kaldırıldığında doğruluk artıyor → NEGATIF KATKI',
        'dirAcc ≈ 0.5: Blok ev/dep yönünü tahmin etmede rastgele',
        'pbCorr: Point-biserial korrelasyon (edge vs correct prediction)',
      ],
      ranked: ablationRanked,
    },

    // ── Per-Match Data (kalibrasyon eğitimi için) ─────────────────────────────
    matches: results.map(r => ({
      id: r.id, match: r.match, date: r.date, league: r.league, leagueId: r.leagueId,
      actual: r.actual,
      model: {
        probs: r.model.probs.map(p => Math.round(p * 10000) / 10000),
        pOU25: r.model.pOU25, pBTTS: r.model.pBTTS,
        predScore: r.model.predScore ?? null,
        top5Scores: r.model.top5Scores ?? null,
        predictedResult: r.model.predictedResult,
        predictedOU25: r.model.predictedOU25,
        predictedBTTS: r.model.predictedBTTS,
        lambdaHome: r.model.lambdaHome, lambdaAway: r.model.lambdaAway,
      },
      bookmaker: r.bookmaker,
    })),

    // ── Hata Listesi ─────────────────────────────────────────────────────────
    errors: errors.slice(0, 20),
  };

  // ── Konsol Özeti ─────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('KAPSAMLI BACKTEST SONUÇLARI');
  console.log('═'.repeat(70));
  console.log(`Maç sayısı : ${n} (${errors.length} hata, ${elapsedSec}s)`);
  console.log(`Tarih      : ${dates[dates.length - 1]} → ${dates[0]}`);
  console.log('');
  console.log('── DOĞRULUK ─────────────────────────────────────────────────────');
  console.log(`1X2   : ${correct1X2}/${n} = ${(correct1X2 / n * 100).toFixed(1)}%   (Naive %33.3)`);
  console.log(`OU2.5 : ${correctOU25}/${ou25Valid} = ${(correctOU25 / ou25Valid * 100).toFixed(1)}%   (Naive %50.0)`);
  console.log(`BTTS  : ${correctBTTS}/${bttsValid} = ${(correctBTTS / bttsValid * 100).toFixed(1)}%   (Naive %50.0)`);
  console.log(`Score : ${correctScore}/${n} = ${(correctScore / n * 100).toFixed(1)}%   (Naive ~%5)`);
  console.log('');
  console.log('── OLASILIK METRİKLERİ (1X2) ────────────────────────────────────');
  console.log(`Brier Score: ${round4(brierMean)}  (Referans naive: ${round4(brierRef)})`);
  console.log(`             Skill: ${(report.probabilityMetrics['1X2'].brierSkill * 100).toFixed(1)}% naive'den iyi`);
  console.log(`Log Loss   : ${round4(llMean)}  (Referans naive: ${round4(llRef)})`);
  console.log(`             Skill: ${(report.probabilityMetrics['1X2'].llSkill * 100).toFixed(1)}% naive'den iyi`);
  console.log(`RPS        : ${round4(rpsMean)}  (Referans naive: ${round4(rpsRef)})`);
  console.log(`             Skill: ${(report.probabilityMetrics['1X2'].rpsSkill * 100).toFixed(1)}% naive'den iyi`);
  console.log('');
  if (bmN > 0) {
    console.log('── KİTAPÇI KARŞILAŞTIRMA ────────────────────────────────────────');
    console.log(`Maç sayısı (oddslu): ${bmN}`);
    console.log(`Model Brier   : ${report.bookmakerBenchmark.modelBrierOnOddsMatches}`);
    console.log(`Kitapçı Brier : ${report.bookmakerBenchmark.bookmakerBrier}`);
    console.log(`Fark          : ${report.bookmakerBenchmark.modelVsBookmakerBrier} (negatif = model daha iyi)`);
    console.log('');
  }
  console.log('── FEATURE ABLATION (İlk 10) ────────────────────────────────────');
  console.log('Sıra  Blok                      Delta    DirAcc  Corr');
  ablationRanked.slice(0, 10).forEach((b, i) => {
    const delta = b.ablationDelta != null ? b.ablationDelta.toFixed(4) : '  N/A ';
    const dir = b.dirAcc != null ? (b.dirAcc * 100).toFixed(1) + '%' : '  N/A';
    const corr = b.pbCorr != null ? b.pbCorr.toFixed(4) : '  N/A ';
    console.log(`${String(i + 1).padStart(2)}    ${b.block.padEnd(26)} ${delta}  ${dir.padStart(6)}  ${corr}`);
  });
  console.log('');
  console.log('── LİG BAZLI BREAKDOWN (n≥5) ────────────────────────────────────');
  leagueBreakdown.filter(l => l.n >= 5).slice(0, 10).forEach(l => {
    console.log(`${l.league.substring(0, 28).padEnd(28)} n=${String(l.n).padStart(3)} 1X2=${(l.acc1X2 * 100).toFixed(0)}% OU=${(l.accOU25 * 100).toFixed(0)}% Brier=${l.brierMean.toFixed(4)}`);
  });
  console.log('═'.repeat(70));

  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n✅ Rapor kaydedildi: backtest_comprehensive.json`);

  try { await api.closeBrowser(); } catch (_) { }
  process.exit(0);
}

runComprehensiveBacktest().catch(err => {
  console.error('Kritik hata:', err.message, err.stack);
  process.exit(1);
});
