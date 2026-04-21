'use strict';

/**
 * PVKD Kanıt Backtesti — Mevki Bazlı (v2)
 * Piyasa Değeri Kalite Düzeltmesi'nin mevki gruplarına göre etkisini ölçer.
 * GK/DEF/MID/ATK bazlı QF, 26 birim ölçekleme, Dixon-Coles kalibrasyon.
 */

const api  = require('./src/services/playwright-client');
const { fetchAllMatchData }   = require('./src/services/data-fetcher');
const { calculateAllMetrics } = require('./src/engine/metric-calculator');
const { getDynamicBaseline }  = require('./src/engine/dynamic-baseline');
const { generatePrediction }  = require('./src/engine/prediction-generator');
const { computeProbBases, calculateUnitImpact, SIM_BLOCKS } = require('./src/engine/match-simulator');
const {
  BLOCK_QF_MAP,
  computePositionMVBreakdown,
  computeAlpha,
  computeQualityFactors,
} = require('./src/engine/quality-factors');
const fs = require('fs');

// ── Para birimi formatlayıcı ───────────────────────────────────────────────────
function fmtMV(v) {
  if (!v || v === 0) return '€0';
  if (v >= 1e9)  return `€${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `€${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3)  return `€${(v / 1e3).toFixed(0)}K`;
  return `€${v}`;
}

// ── Baseline'ı server.js mantığıyla zenginleştir ──────────────────────────────
function enrichBaseline(baseline, metrics, data) {
  baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
  baseline.leaguePointDensity   = metrics.meta?.leaguePointDensity   ?? null;
  baseline.homeMVBreakdown = computePositionMVBreakdown(data.homePlayers);
  baseline.awayMVBreakdown = computePositionMVBreakdown(data.awayPlayers);
  return baseline;
}

// ── Ham prob bases (PVKD öncesi) ───────────────────────────────────────────────
function getRawProbBases(metrics, baseline) {
  const homeFlat = Object.assign({},
    metrics.home.attack, metrics.home.defense, metrics.home.form,
    metrics.home.player, metrics.home.goalkeeper, metrics.home.momentum,
    metrics.home.compositeScores,
    metrics.shared.referee, metrics.shared.h2h,
    metrics.shared.contextual, metrics.shared.sharedComposite);
  const awayFlat = Object.assign({},
    metrics.away.attack, metrics.away.defense, metrics.away.form,
    metrics.away.player, metrics.away.goalkeeper, metrics.away.momentum,
    metrics.away.compositeScores,
    metrics.shared.referee, metrics.shared.h2h,
    metrics.shared.contextual, metrics.shared.sharedComposite);

  const allIds  = new Set([...Object.keys(homeFlat), ...Object.keys(awayFlat)]
    .filter(k => /^M\d{3}[a-z]?$/i.test(k)));
  const dynAvgs = metrics.dynamicLeagueAvgs || {};

  const homeUnits = {};
  const awayUnits = {};
  for (const blk in SIM_BLOCKS) {
    homeUnits[blk] = calculateUnitImpact(blk, homeFlat, allIds, null, dynAvgs);
    awayUnits[blk] = calculateUnitImpact(blk, awayFlat, allIds, null, dynAvgs);
  }

  // posQF=null → düzeltmesiz ham probBases
  const hRaw = computeProbBases(homeFlat, allIds, homeUnits, baseline, [], null);
  const aRaw = computeProbBases(awayFlat, allIds, awayUnits, baseline, [], null);
  return { hRaw, aRaw, homeUnits, awayUnits, homeFlat, awayFlat, allIds };
}

// ── Starting XI market değerleri — squad listesinden ID join ile ──────────────
function extractStartingXI(lineupPlayers, squadData) {
  const starters = (lineupPlayers || []).filter(p => !p.substitute).slice(0, 11);
  const squadMap = new Map();
  for (const sp of (squadData?.players || [])) {
    const id = sp.player?.id;
    if (id != null) squadMap.set(id, sp.player?.proposedMarketValue ?? null);
  }
  return starters.map(p => {
    const pid = p.player?.id;
    const mvFromSquad = pid != null ? squadMap.get(pid) : null;
    const mv = mvFromSquad ?? p.player?.proposedMarketValue ?? null;
    return {
      name: p.player?.name || p.name || '?',
      position: p.player?.position || p.position || '?',
      shirtNumber: p.shirtNumber || p.player?.shirtNumber || '',
      marketValue: mv,
      marketValueFmt: fmtMV(mv ?? 0),
    };
  });
}

// ── Ana backtest fonksiyonu ───────────────────────────────────────────────────
async function runPVKDBacktest() {
  console.log('🔍 Mevki Bazlı PVKD Kanıt Backtesti başlatılıyor...');
  await api.initBrowser();

  // Son 2 günün tamamlanmış maçlarını topla
  const today = new Date();
  const dates = [
    new Date(today - 1 * 86400000).toISOString().split('T')[0],
    new Date(today - 2 * 86400000).toISOString().split('T')[0],
  ];
  const topTournaments = [17, 8, 23, 24, 35, 7, 34, 11, 238, 37, 679, 547];
  let candidateEvents = [];

  for (const date of dates) {
    try {
      console.log(`📅 ${date} maçları çekiliyor...`);
      const data = await api.getScheduledEvents(date);
      if (data?.events) {
        const finished = data.events.filter(e => e.status?.type === 'finished');
        candidateEvents.push(...finished.map(e => ({ ...e, _date: date })));
      }
    } catch (err) {
      console.error(`  [HATA] ${date}:`, err.message);
    }
  }

  candidateEvents.sort((a, b) => {
    const aTop = topTournaments.includes(a.tournament?.uniqueTournament?.id) ? 1 : 0;
    const bTop = topTournaments.includes(b.tournament?.uniqueTournament?.id) ? 1 : 0;
    return bTop - aTop;
  });

  const eventsToTest = candidateEvents.slice(0, 10);
  if (eventsToTest.length === 0) {
    console.error('Hiç tamamlanmış maç bulunamadı. Çıkılıyor.');
    process.exit(1);
  }

  const matchResults = [];
  let hits1X2 = 0, hitsOU25 = 0, hitsBTTS = 0, hitsScore = 0;

  for (const ev of eventsToTest) {
    const homeScore = ev.homeScore?.current ?? ev.homeScore?.display ?? '?';
    const awayScore = ev.awayScore?.current ?? ev.awayScore?.display ?? '?';
    const actualStr = `${homeScore}-${awayScore}`;

    console.log(`\n⚽ ${ev.homeTeam.name} vs ${ev.awayTeam.name} [${ev._date}] — Gerçek: ${actualStr}`);

    try {
      const matchData = await fetchAllMatchData(ev.id);
      const metrics   = calculateAllMetrics(matchData);
      const baseline  = getDynamicBaseline(matchData);
      enrichBaseline(baseline, metrics, matchData);

      // ── Mevki bazlı QF hesapla ────────────────────────────────────────────
      const alpha = computeAlpha(baseline.leagueGoalVolatility, baseline.leagueAvgGoals);
      const hBD   = baseline.homeMVBreakdown;
      const aBD   = baseline.awayMVBreakdown;
      const qf    = computeQualityFactors(hBD, aBD, alpha);

      // ── Ham prob bases (posQF=null) ───────────────────────────────────────
      const { hRaw, aRaw, homeUnits: rawHomeUnits, awayUnits: rawAwayUnits, homeFlat, awayFlat, allIds } =
        getRawProbBases(metrics, baseline);

      // ── Ayarlı prob bases (posQF uygulanmış) ─────────────────────────────
      const dynAvgs = metrics.dynamicLeagueAvgs || {};
      const adjHomeUnits = { ...rawHomeUnits };
      const adjAwayUnits = { ...rawAwayUnits };
      for (const blk in BLOCK_QF_MAP) {
        const qt = BLOCK_QF_MAP[blk];
        if (!qt) continue;
        if (adjHomeUnits[blk] != null) adjHomeUnits[blk] *= qf.home[qt];
        if (adjAwayUnits[blk] != null) adjAwayUnits[blk] *= qf.away[qt];
      }
      const hAdj = computeProbBases(homeFlat, allIds, adjHomeUnits, baseline, [], qf.home);
      const aAdj = computeProbBases(awayFlat, allIds, adjAwayUnits, baseline, [], qf.away);

      // ── Tahmin ────────────────────────────────────────────────────────────
      const report = generatePrediction(metrics, matchData, baseline, metrics.metricAudit ?? [], Math.random);

      const hS = typeof homeScore === 'number' ? homeScore : parseInt(homeScore);
      const aS = typeof awayScore === 'number' ? awayScore : parseInt(awayScore);
      const actualResult = isNaN(hS) || isNaN(aS) ? '?' : hS > aS ? '1' : hS < aS ? '2' : 'X';
      const actualOU25   = (!isNaN(hS) && !isNaN(aS)) ? ((hS + aS) > 2 ? 'Over' : 'Under') : '?';
      const actualBTTS   = (!isNaN(hS) && !isNaN(aS)) ? (hS > 0 && aS > 0 ? 'Yes' : 'No') : '?';

      const pred       = report.result || {};
      const maxP       = Math.max(pred.homeWin || 0, pred.draw || 0, pred.awayWin || 0);
      const predResult = maxP === pred.homeWin ? '1' : maxP === pred.awayWin ? '2' : 'X';
      const predOU25   = (report.goals?.over25 || 0) >= 50 ? 'Over' : 'Under';
      const predBTTS   = (report.goals?.btts   || 0) >= 50 ? 'Yes' : 'No';
      const predScore  = report.score?.predicted ?? 'N/A';

      const hit1X2  = actualResult !== '?' && predResult === actualResult;
      const hitOU25 = actualOU25  !== '?' && predOU25  === actualOU25;
      const hitBTTS = actualBTTS  !== '?' && predBTTS  === actualBTTS;
      const hitScore = actualStr  === predScore;
      if (hit1X2)  hits1X2++;
      if (hitOU25) hitsOU25++;
      if (hitBTTS) hitsBTTS++;
      if (hitScore) hitsScore++;

      // ── Starting XI ───────────────────────────────────────────────────────
      const homeXI = extractStartingXI(matchData.lineups?.home?.players, matchData.homePlayers);
      const awayXI = extractStartingXI(matchData.lineups?.away?.players, matchData.awayPlayers);

      // ── Top 10 kadro değerleri ────────────────────────────────────────────
      const topSquad = (players, side) =>
        (players?.players || [])
          .filter(p => p.player?.proposedMarketValue > 0)
          .map(p => ({
            name: p.player?.name || '?',
            position: p.player?.position || '?',
            marketValue: p.player?.proposedMarketValue ?? null,
            marketValueFmt: fmtMV(p.player?.proposedMarketValue ?? 0),
          }))
          .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
          .slice(0, 10);

      // ── Birim delta: ham vs ayarlı ─────────────────────────────────────────
      const unitDeltas = {};
      for (const blk in BLOCK_QF_MAP) {
        const qt = BLOCK_QF_MAP[blk];
        const raw_h = rawHomeUnits[blk] ?? null;
        const adj_h = adjHomeUnits[blk] ?? null;
        const raw_a = rawAwayUnits[blk] ?? null;
        const adj_a = adjAwayUnits[blk] ?? null;
        unitDeltas[blk] = {
          qfType: qt,
          home: {
            raw:  raw_h != null ? +raw_h.toFixed(4) : null,
            adj:  adj_h != null ? +adj_h.toFixed(4) : null,
            delta: (raw_h != null && adj_h != null) ? `${((adj_h / raw_h - 1) * 100).toFixed(1)}%` : null,
          },
          away: {
            raw:  raw_a != null ? +raw_a.toFixed(4) : null,
            adj:  adj_a != null ? +adj_a.toFixed(4) : null,
            delta: (raw_a != null && adj_a != null) ? `${((adj_a / raw_a - 1) * 100).toFixed(1)}%` : null,
          },
        };
      }

      const fmt4 = v => v != null ? +v.toFixed(5) : null;
      const fmtPct = (a, b) => (a != null && b != null && a !== 0)
        ? `${((b / a - 1) * 100).toFixed(1)}%` : null;

      const entry = {
        match: `${ev.homeTeam.name} vs ${ev.awayTeam.name}`,
        date: ev._date,
        tournament: `${ev.tournament?.name || '?'}, ${ev.roundInfo?.name || ev.roundInfo?.round || '?'}`,
        actual: actualStr,
        actualResult, actualOU25, actualBTTS,
        predicted: predScore, predictedResult: predResult,
        predictedOU25: predOU25, predictedBTTS: predBTTS,
        probHome: +(pred.homeWin || 0).toFixed(1),
        probDraw: +(pred.draw    || 0).toFixed(1),
        probAway: +(pred.awayWin || 0).toFixed(1),
        probOU25: +((report.goals?.over25 ?? 0)).toFixed(1),
        probBTTS: +((report.goals?.btts   ?? 0)).toFixed(1),
        hit1X2, hitOU25, hitBTTS, hitScore,
        confidence: report.result?.confidence ?? null,

        // ── Lig Fiziği ──────────────────────────────────────────────────────
        leaguePhysics: {
          leagueAvgGoals:       baseline.leagueAvgGoals    != null ? +baseline.leagueAvgGoals.toFixed(3) : null,
          leagueGoalVolatility: baseline.leagueGoalVolatility != null ? +baseline.leagueGoalVolatility.toFixed(4) : null,
          leaguePointDensity:   baseline.leaguePointDensity  != null ? +baseline.leaguePointDensity.toFixed(4) : null,
          pvkdAlpha:            alpha != null ? +alpha.toFixed(4) : null,
          lambdaCap:            (baseline.leagueAvgGoals != null && baseline.leagueGoalVolatility != null)
            ? +(baseline.leagueAvgGoals + baseline.leagueGoalVolatility * 3).toFixed(3) : null,
          pvkdActive:           alpha != null && (hBD.total + aBD.total) > 0,
        },

        // ── Mevki Bazlı Piyasa Değeri Dağılımı ─────────────────────────────
        positionMVBreakdown: {
          home: {
            GK:  fmtMV(hBD.GK),  GK_raw: hBD.GK,
            DEF: fmtMV(hBD.DEF), DEF_raw: hBD.DEF,
            MID: fmtMV(hBD.MID), MID_raw: hBD.MID,
            ATK: fmtMV(hBD.ATK), ATK_raw: hBD.ATK,
            total: fmtMV(hBD.total), total_raw: hBD.total,
          },
          away: {
            GK:  fmtMV(aBD.GK),  GK_raw: aBD.GK,
            DEF: fmtMV(aBD.DEF), DEF_raw: aBD.DEF,
            MID: fmtMV(aBD.MID), MID_raw: aBD.MID,
            ATK: fmtMV(aBD.ATK), ATK_raw: aBD.ATK,
            total: fmtMV(aBD.total), total_raw: aBD.total,
          },
        },

        // ── Mevki Kalite Faktörleri ─────────────────────────────────────────
        positionQF: {
          alpha: alpha != null ? +alpha.toFixed(4) : null,
          home: Object.fromEntries(Object.entries(qf.home).map(([k, v]) => [k, +v.toFixed(4)])),
          away: Object.fromEntries(Object.entries(qf.away).map(([k, v]) => [k, +v.toFixed(4)])),
          interpretation: {
            home_ATK_MID: `Ev hücum boost: ${((qf.home.ATK_MID - 1) * 100).toFixed(1)}%`,
            away_ATK_MID: `Dep hücum boost: ${((qf.away.ATK_MID - 1) * 100).toFixed(1)}%`,
            home_DEF_GK:  `Ev savunma: ${((1 / qf.home.DEF_GK - 1) * 100).toFixed(1)}% daha az gol yer`,
            away_DEF_GK:  `Dep savunma: ${((1 / qf.away.DEF_GK - 1) * 100).toFixed(1)}% daha az gol yer`,
          },
        },

        // ── Ham vs Ayarlı ProbBases (6 metrik) ─────────────────────────────
        rawVsAdjusted: {
          home: {
            shotsPerMin:    { raw: fmt4(hRaw?.shotsPerMin),  adj: fmt4(hAdj?.shotsPerMin),  delta: fmtPct(hRaw?.shotsPerMin, hAdj?.shotsPerMin) },
            onTargetRate:   { raw: fmt4(hRaw?.onTargetRate), adj: fmt4(hAdj?.onTargetRate), delta: fmtPct(hRaw?.onTargetRate, hAdj?.onTargetRate) },
            goalConvRate:   { raw: fmt4(hRaw?.goalConvRate), adj: fmt4(hAdj?.goalConvRate), delta: fmtPct(hRaw?.goalConvRate, hAdj?.goalConvRate) },
            blockRate:      { raw: fmt4(hRaw?.blockRate),    adj: fmt4(hAdj?.blockRate),    delta: fmtPct(hRaw?.blockRate, hAdj?.blockRate) },
            gkSaveRate:     { raw: fmt4(hRaw?.gkSaveRate),   adj: fmt4(hAdj?.gkSaveRate),   delta: fmtPct(hRaw?.gkSaveRate, hAdj?.gkSaveRate) },
            possessionBase: { raw: fmt4(hRaw?.possessionBase), adj: fmt4(hAdj?.possessionBase), delta: fmtPct(hRaw?.possessionBase, hAdj?.possessionBase) },
          },
          away: {
            shotsPerMin:    { raw: fmt4(aRaw?.shotsPerMin),  adj: fmt4(aAdj?.shotsPerMin),  delta: fmtPct(aRaw?.shotsPerMin, aAdj?.shotsPerMin) },
            onTargetRate:   { raw: fmt4(aRaw?.onTargetRate), adj: fmt4(aAdj?.onTargetRate), delta: fmtPct(aRaw?.onTargetRate, aAdj?.onTargetRate) },
            goalConvRate:   { raw: fmt4(aRaw?.goalConvRate), adj: fmt4(aAdj?.goalConvRate), delta: fmtPct(aRaw?.goalConvRate, aAdj?.goalConvRate) },
            blockRate:      { raw: fmt4(aRaw?.blockRate),    adj: fmt4(aAdj?.blockRate),    delta: fmtPct(aRaw?.blockRate, aAdj?.blockRate) },
            gkSaveRate:     { raw: fmt4(aRaw?.gkSaveRate),   adj: fmt4(aAdj?.gkSaveRate),   delta: fmtPct(aRaw?.gkSaveRate, aAdj?.gkSaveRate) },
            possessionBase: { raw: fmt4(aRaw?.possessionBase), adj: fmt4(aAdj?.possessionBase), delta: fmtPct(aRaw?.possessionBase, aAdj?.possessionBase) },
          },
          lambdaHome: report.prediction?.lambdaHome ?? report.score?.lambdaHome ?? null,
          lambdaAway: report.prediction?.lambdaAway ?? report.score?.lambdaAway ?? null,
        },

        // ── 26 Birim Deltas ─────────────────────────────────────────────────
        unitDeltas,

        // ── Starting XI ──────────────────────────────────────────────────────
        startingXI: { home: homeXI, away: awayXI },

        // ── Top 10 Kadro Değerleri ────────────────────────────────────────────
        topSquadValues: {
          home: topSquad(matchData.homePlayers),
          away: topSquad(matchData.awayPlayers),
        },
      };

      matchResults.push(entry);

      console.log(`  ✅ 1X2: ${predResult} (Gerçek: ${actualResult}) ${hit1X2 ? '✓' : '✗'}  |  OU25: ${predOU25} ${hitOU25 ? '✓' : '✗'}  |  BTTS: ${predBTTS} ${hitBTTS ? '✓' : '✗'}`);
      console.log(`  🏟️  Ev: GK=${fmtMV(hBD.GK)} DEF=${fmtMV(hBD.DEF)} MID=${fmtMV(hBD.MID)} ATK=${fmtMV(hBD.ATK)} | Toplam=${fmtMV(hBD.total)}`);
      console.log(`  ✈️  Dep: GK=${fmtMV(aBD.GK)} DEF=${fmtMV(aBD.DEF)} MID=${fmtMV(aBD.MID)} ATK=${fmtMV(aBD.ATK)} | Toplam=${fmtMV(aBD.total)}`);
      if (alpha != null) {
        console.log(`  🎯 alpha=${alpha.toFixed(3)} | hQF: GK=${qf.home.GK.toFixed(3)} DEF=${qf.home.DEF.toFixed(3)} MID=${qf.home.MID.toFixed(3)} ATK=${qf.home.ATK.toFixed(3)} ATK_MID=${qf.home.ATK_MID.toFixed(3)} DEF_GK=${qf.home.DEF_GK.toFixed(3)}`);
        console.log(`  🎯 alpha=${alpha.toFixed(3)} | aQF: GK=${qf.away.GK.toFixed(3)} DEF=${qf.away.DEF.toFixed(3)} MID=${qf.away.MID.toFixed(3)} ATK=${qf.away.ATK.toFixed(3)} ATK_MID=${qf.away.ATK_MID.toFixed(3)} DEF_GK=${qf.away.DEF_GK.toFixed(3)}`);
      }
      console.log(`  📊 shotsPerMin: h=${hRaw?.shotsPerMin?.toFixed(5)}→${hAdj?.shotsPerMin?.toFixed(5)} | a=${aRaw?.shotsPerMin?.toFixed(5)}→${aAdj?.shotsPerMin?.toFixed(5)}`);
      console.log(`  📊 goalConv:    h=${hRaw?.goalConvRate?.toFixed(4)}→${hAdj?.goalConvRate?.toFixed(4)} | a=${aRaw?.goalConvRate?.toFixed(4)}→${aAdj?.goalConvRate?.toFixed(4)}`);
      console.log(`  📊 blockRate:   h=${hRaw?.blockRate?.toFixed(4)}→${hAdj?.blockRate?.toFixed(4)} | a=${aRaw?.blockRate?.toFixed(4)}→${aAdj?.blockRate?.toFixed(4)}`);
      console.log(`  📊 gkSaveRate:  h=${hRaw?.gkSaveRate?.toFixed(4)}→${hAdj?.gkSaveRate?.toFixed(4)} | a=${aRaw?.gkSaveRate?.toFixed(4)}→${aAdj?.gkSaveRate?.toFixed(4)}`);

    } catch (err) {
      console.error(`  [HATA] ${ev.homeTeam.name} vs ${ev.awayTeam.name}:`, err.message, err.stack?.split('\n')[1]);
    }
  }

  // ── Özet Rapor ──────────────────────────────────────────────────────────────
  const total = matchResults.length;
  const pvkdActive = matchResults.filter(r => r.leaguePhysics?.pvkdActive).length;

  const report = {
    generatedAt: new Date().toISOString(),
    description: 'Mevki Bazlı PVKD (Piyasa Değeri Kalite Düzeltmesi) Kanıt Backtesti v2',
    summary: {
      total,
      hits1X2,
      hitsOU25,
      hitsBTTS,
      hitsScore,
      acc1X2:   total > 0 ? `${(hits1X2  / total * 100).toFixed(1)}%` : 'N/A',
      accOU25:  total > 0 ? `${(hitsOU25 / total * 100).toFixed(1)}%` : 'N/A',
      accBTTS:  total > 0 ? `${(hitsBTTS / total * 100).toFixed(1)}%` : 'N/A',
      accScore: total > 0 ? `${(hitsScore / total * 100).toFixed(1)}%` : 'N/A',
    },
    pvkdSummary: {
      description: 'GK/DEF/MID/ATK mevki gruplarına göre bağımsız kalite faktörleri',
      formula: {
        alpha: 'vol / (avg + vol)  →  volatil ligde kalite daha belirleyici',
        qf: '(ownMV_positional / (homeMV_positional + awayMV_positional) × 2) ^ alpha',
        composites: 'ATK_MID = geo(ATK_qf, MID_qf) | DEF_GK = geo(DEF_qf, GK_qf)',
        attackBoost: 'shotsPerMin × ATK_MID_qf',
        defenseNorm: 'defenseRate_source / DEF_GK_qf  (daha iyi savunma → daha az gol yenir)',
        lambdaCap: 'leagueAvgGoals + leagueGoalVolatility × 3  (μ + 3σ)',
        unitScaling: 'Her birim kendi mevki QF grubu ile çarpılır (BLOCK_QF_MAP)',
      },
      activeMatchCount: pvkdActive,
      noDataCount: total - pvkdActive,
    },
    matches: matchResults,
  };

  const outPath = 'backtest_report_latest.json';
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Rapor yazıldı: ${outPath}`);
  console.log(`📊 Özet: 1X2=${hits1X2}/${total} (${total > 0 ? (hits1X2/total*100).toFixed(0) : 0}%) | OU25=${hitsOU25}/${total} | BTTS=${hitsBTTS}/${total} | Skor=${hitsScore}/${total}`);
  console.log(`🎯 PVKD aktif: ${pvkdActive}/${total} maç`);

  try { await api.closeBrowser(); } catch (_) {}
  process.exit(0);
}

runPVKDBacktest().catch(err => {
  console.error('Kritik hata:', err);
  process.exit(1);
});
