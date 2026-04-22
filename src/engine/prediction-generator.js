/**
 * Prediction Generator
 * Tüm metrikleri kullanarak nihai tahmin çıktısını oluşturur.
 * Poisson dağılımı + bileşik skorlar + ek özel tahminler.
 */

const { poissonPMF, poissonExceed, round2, clamp } = require('./math-utils');
const { simulateMatch } = require('./match-simulator');
const simConfigModule = require('./sim-config');
const SIM_CONFIG = simConfigModule.SIM_CONFIG;
const { loadCalibration, calibrateProbs } = require('./calibration');

if (!SIM_CONFIG) {
  console.error('[PredictionGenerator] CRITICAL: SIM_CONFIG is undefined. Check sim-config.js exports.');
}

// Merkezi nötr sabitler referansı
const ND = SIM_CONFIG?.NEUTRAL_DEFAULTS || {};
const UI_CFG = SIM_CONFIG?.UI_THRESHOLDS || {};
const PT = SIM_CONFIG?.POISSON_THRESHOLDS || {};

// Kalibrasyon parametreleri — başlangıçta yükle (null ise kalibrasyon devre dışı)
let _calParams = null;
try { _calParams = loadCalibration(); } catch (_) { _calParams = null; }

// Edge DB Modül Seviyesi Önbellek (Memory Cache)
const fs = require('fs');
const path = require('path');
let _cachedEdgeDb = null;
let _lastEdgeDbRead = 0;
const EDGE_DB_TTL = 5 * 60 * 1000; // 5 dakika

function getEdgeDb() {
  const edgeDbPath = path.join(__dirname, 'historical-edge-db.json');
  const now = Date.now();
  if (!_cachedEdgeDb || now - _lastEdgeDbRead > EDGE_DB_TTL) {
    try {
      if (fs.existsSync(edgeDbPath)) {
        _cachedEdgeDb = JSON.parse(fs.readFileSync(edgeDbPath, 'utf8'));
        _lastEdgeDbRead = now;
      } else {
        _cachedEdgeDb = { leagues: {}, teams: {} };
      }
    } catch (e) {
      console.error("[PredictionGenerator] Edge DB okuma hatası:", e.message);
      if (!_cachedEdgeDb) _cachedEdgeDb = { leagues: {}, teams: {} };
    }
  }
  return _cachedEdgeDb;
}

/**
 * @param {object} metricsResult - calculateAllMetrics() çıktısı
 * @param {object} data - fetchAllMatchData() çıktısı
 * @returns {object} Detaylı tahmin raporu
 */
function generatePrediction(metricsResult, data, baseline, audit, rng) {
  const { home, away, shared, prediction } = metricsResult;
  
  // Guard: Ensure simulation uses only up to 11 starters from each lineup
  if (data.lineups) {
    if (data.lineups.home?.players) {
      let sc = 0;
      data.lineups.home.players = data.lineups.home.players.map(p => {
        if (!p.substitute) { if (sc >= 11) return { ...p, substitute: true }; sc++; }
        return p;
      });
    }
    if (data.lineups.away?.players) {
      let sc = 0;
      data.lineups.away.players = data.lineups.away.players.map(p => {
        if (!p.substitute) { if (sc >= 11) return { ...p, substitute: true }; sc++; }
        return p;
      });
    }
  }

  const event = data.event?.event;

  // --- Behavioral Simulation (Monte Carlo) Integration ---
  // Rapor üretilirken arka planda 1000 koşuluk bir temel simülasyon koşturulur.
  // Bu, 26 ünite bazlı davranışsal dağılımları rapora eklememizi sağlar.
  const homeMetricsFlat = Object.assign({}, home.attack, home.defense, home.form, home.player, home.goalkeeper, home.momentum, home.compositeScores, shared.referee, shared.h2h, shared.contextual, shared.sharedComposite);
  const awayMetricsFlat = Object.assign({}, away.attack, away.defense, away.form, away.player, away.goalkeeper, away.momentum, away.compositeScores, shared.referee, shared.h2h, shared.contextual, shared.sharedComposite);
  const allSimMetricIds = new Set(
    [...Object.keys(homeMetricsFlat), ...Object.keys(awayMetricsFlat)]
      .filter(k => /^M\d{3}[a-z]?$/i.test(k))
  );
  
  // Yedek kalitesi: M067 (yedek rating) → lig M067 ortalamasına göre normalize.
  // Hardcoded fallback'lar (1.3 CV varsayımı, 6.5 genel orta) kaldırıldı — veri yoksa null.
  // Scale: leagueAvgGoals + leagueGoalVolatility (ikisi de gerekli), aksi halde null.
  const _lgM067 = metricsResult.dynamicLeagueAvgs?.M067 ?? null;
  const _lgM067Scale = (baseline.leagueAvgGoals != null
      && baseline.leagueAvgGoals > 0
      && baseline.leagueGoalVolatility != null)
    ? (baseline.leagueAvgGoals + baseline.leagueGoalVolatility)
    : null;
  const _sqMid = _lgM067; // lig ortalaması M067, yoksa null (fallback yok)
  const homeSubQuality = (homeMetricsFlat.M067 != null && _sqMid != null && _lgM067Scale != null && _lgM067Scale > 0)
    ? (homeMetricsFlat.M067 - _sqMid) / _lgM067Scale : null;
  const awaySubQuality = (awayMetricsFlat.M067 != null && _sqMid != null && _lgM067Scale != null && _lgM067Scale > 0)
    ? (awayMetricsFlat.M067 - _sqMid) / _lgM067Scale : null;

  // Peer-enhanced averages: dynamicAvgs'da eksik her metrik için iki takım
  // değerlerinin ortalaması baseline alınır. Sabit 1.0 fallback yerine gerçek veriden türetme.
  const peerEnhancedAvgs = { ...(metricsResult.dynamicLeagueAvgs || {}) };
  for (const id of allSimMetricIds) {
    if (peerEnhancedAvgs[id] != null) continue;
    const hv = homeMetricsFlat[id];
    const av = awayMetricsFlat[id];
    const hvOk = hv != null && isFinite(hv);
    const avOk = av != null && isFinite(av);
    const avg = hvOk && avOk ? (hv + av) / 2 : hvOk ? hv : avOk ? av : null;
    if (avg != null && avg > 0) peerEnhancedAvgs[id] = avg;
  }

  // Poisson lambda'larını MC simülasyonuna geçir — MC beklenen golü lambda'ya kilitle.
  // Bu olmadan MC (shots×onTarget×conv) ve Poisson (xG+rakip kalite) farklı beklenen gol
  // üretir; top5 skor listesi 9-1, 8-0 gibi absürd sonuçlar gösterir.
  const simulation = simulateMatch({
    homeMetrics: homeMetricsFlat,
    awayMetrics: awayMetricsFlat,
    selectedMetrics: allSimMetricIds,
    lineups: data.lineups,
    weatherMetrics: data.weatherMetrics,
    baseline,
    audit,
    rng,
    runs: baseline._ablationRuns || 1000,
    homeSubQuality,
    awaySubQuality,
    dynamicAvgs: peerEnhancedAvgs,
    homeAdvantage: metricsResult.dynamicHomeAdvantage,
    dynamicTimeWindows: metricsResult.dynamicTimeWindows
  });

  // ── Detaylı tahmin raporu ──
  const report = {
    match: {
      homeTeam: event?.homeTeam?.name || 'Home',
      awayTeam: event?.awayTeam?.name || 'Away',
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      tournament: event?.tournament?.name || '',
      round: event?.roundInfo?.round || '',
      stadium: event?.venue?.stadium?.name || '',
      referee: event?.referee?.name || '',
      startTime: event?.startTimestamp
        ? new Date(event.startTimestamp * 1000).toISOString() : '',
      isLive: event?.status?.type === 'inprogress' || (event?.status?.code >= 6 && event?.status?.code <= 40),
    },
    missingPlayers: data.missingPlayers?.players || [],

    // Dynamic self-calibration metadata for UI_CFG transparency
    metadata: metricsResult.meta || {},

    // Ana tahmin (Poisson + Simülasyon Dinamik Harmanlama)
    // Sabit ağırlıklar (0.6/0.4 vb.) kaldırıldı.
    // Harmonik Harmanlama: Veri güveni yüksekse Poisson (Analitik) baskın çıkar, 
    // veri azsa Simülasyon (Davranışsal) ağırlığı artar.
    result: (() => {
      const simDist = simulation.distribution;
      const conf = (prediction.confidenceScore || 50) / 100;

      // ── Dinamik Blend Ağırlığı (MC-Poisson Agreement) ──────────────────────
      // Sabit pW=conf yerine: iki modelin anlaşma derecesi (agreement) ile ağırlıklandır.
      // TVD (Total Variation Distance) = ½ × Σ|p_poisson - p_mc|. Değer 0-1 arası.
      // Poisson ve MC arasındaki ağırlık merkezi (basePoissonW) ligin volatilitesine bağlanır:
      // vol/avg (CV) yüksekse lig kaotiktir, analitik Poisson'ın baz güveni düşer.
      const vol = baseline?.leagueGoalVolatility;
      const avg = baseline?.leagueAvgGoals;
      const basePoissonW = (vol != null && avg != null && avg > 0)
        ? 1.0 - (vol / (vol + avg))
        : 0.5; // Veri yoksa tam ortadan başla

      const pH_poiss = prediction.homeWinProbability / 100;
      const pD_poiss = prediction.drawProbability    / 100;
      const pA_poiss = prediction.awayWinProbability / 100;
      const pH_mc = simDist.homeWin / 100;
      const pD_mc = simDist.draw    / 100;
      const pA_mc = simDist.awayWin / 100;
      
      const tvd = (Math.abs(pH_poiss - pH_mc) + Math.abs(pD_poiss - pD_mc) + Math.abs(pA_poiss - pA_mc)) / 2;
      const pW = basePoissonW + (1.0 - basePoissonW) * conf * (1 - tvd);
      const sW = 1.0 - pW;

      let homeWin = (prediction.homeWinProbability * pW) + (simDist.homeWin * sW);
      let draw    = (prediction.drawProbability    * pW) + (simDist.draw    * sW);
      let awayWin = (prediction.awayWinProbability * pW) + (simDist.awayWin * sW);

      // ── Kalibrasyon Post-Processing ──────────────────────────────────────
      // Platt scaling + lig bazlı düzeltme (backtest verisinden öğrenilmiş)
      // Sistem overconfidence sorunu: %60 dediğinde gerçekleşme ~%45
      const leagueId = metricsResult.meta?.tournamentId ?? null;
      if (_calParams) {
        const calSum = homeWin + draw + awayWin;
        const rawProbs = calSum > 0
          ? [homeWin / calSum, draw / calSum, awayWin / calSum]
          : [1/3, 1/3, 1/3];
        const calProbs = calibrateProbs(rawProbs, leagueId, _calParams);
        // Geri ölçekle (0-100 aralığına)
        homeWin = calProbs[0] * 100;
        draw    = calProbs[1] * 100;
        awayWin = calProbs[2] * 100;
      }

      // ── Dinamik Overconfidence Ezici (Temperature Scaling) ───────────────
      // Kitapçının Brier skorunu yakalamak ve aşırı özgüveni (Overconfidence) kırmak için
      // Ligin gol volatilitesine göre dinamik olarak olasılıkları merkeze büzüştürür.
      const cvVal = (avg != null && avg > 0) ? (vol / avg) : 0.5;

      // Lig dinamik metrikleri (varsayılan 1.0 nötr etki)
      const compIndex = metricsResult.meta?.leagueCompetitiveness ?? 1.0;
      const drawTendency = metricsResult.meta?.leagueDrawTendency ?? 1.0;

      // CV ne kadar yüksekse (sürpriz ihtimali çoksa) temperature o kadar artar.
      // Rekabetçilik ve Beraberlik eğilimi de T'yi artırır (olasılıkları düzleştirir)
      // T > 1.0 oldukça olasılıklar üniforma (1/3) doğru yaklaşır.
      // compIndex > 1.0 (çekişmeli) ise T artar.
      const temperature = 1.0 + (cvVal * 0.6) + ((compIndex - 1.0) * 0.3) + ((drawTendency - 1.0) * 0.2);
      // Temperature için güvenlik sınırları (örn: minimum 1.0, maksimum 2.0)
      const safeTemp = Math.max(1.0, Math.min(2.0, temperature));

      let s_homeWin = homeWin / 100;
      let s_draw    = draw / 100;
      let s_awayWin = awayWin / 100;
      const s_sum   = s_homeWin + s_draw + s_awayWin;
      
      if (s_sum > 0) {
        let T_probs = [s_homeWin / s_sum, s_draw / s_sum, s_awayWin / s_sum].map(p => {
          const clampedP = Math.max(1e-9, Math.min(1 - 1e-9, p));
          return Math.exp(Math.log(clampedP) / safeTemp);
        });

        const tSum = T_probs.reduce((a, b) => a + b, 0);
        T_probs = T_probs.map(p => p / tSum);

        homeWin = T_probs[0] * 100;
        draw    = T_probs[1] * 100;
        awayWin = T_probs[2] * 100;
      }

      const res = {
        homeWin: round2(homeWin),
        draw:    round2(draw),
        awayWin: round2(awayWin),
        confidence: Math.round(prediction.confidenceScore),
        source: pW > 0.7 ? 'Analytic (Poisson dominant)' : (sW > 0.7 ? 'Behavioral (Sim dominant)' : 'Hybrid Balanced'),
      };

      // Organik Simülasyon Verisi: UI'ın (SimulationViewer) kendi başına simülasyon koşturmak yerine
      // bu olayları (minuteLog) oynatması sağlanır.
      res.simulation = {
        distribution: simulation.distribution,
        minuteLog: simulation.sampleRun?.minuteLog || [],
        events: simulation.sampleRun?.events || [],
        stats: simulation.sampleRun?.stats || null
      };

      res.calibrated = _calParams != null;
      res.mostLikelyResult = getMostLikelyResult(res);
      return res;
    })(),

    // Skor tahmini
    // Mimari: Poisson (Dixon-Coles lambda) → deterministik mod → birincil skor tahmini
    //         Monte Carlo simulation → stokastik frekans → destekleyici top5 ve doğrulama
    // Poisson'ın avantajı: Dixon-Coles ile kalibre edilmiş lambda doğrudan
    //   gerçek xG/gol oranlarına dayalı → stokastik gürültü yok, analitik kesinlik.
    // Monte Carlo: 1X2/O/U/BTTS için kullanılır (behavioral dynamics).
    score: (() => {
      const simDist = simulation.distribution;
      // Poisson'dan en olası skor (Dixon-Coles lambda ile kalibre edilmiş)
      const poissonTopScore = prediction.mostLikelyScore ?? null;
      // Top5 skor: Poisson (analitik) tercih edilir, çünkü MC scoreFrequency lambda anchor
      // ile kilitli olsa bile homeAdvantage + dampedFlow zinciri gerçek gol sayısını
      // lambda'dan saptırabilir → MC frekans tablosu yanıltıcı top5 üretir.
      const top5Poisson = prediction.top5Scores;
      const top5Sim = simDist.scoreFrequency
        ? Object.entries(simDist.scoreFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([score, pct]) => ({ score, probability: pct }))
        : null;
      return {
        predicted: poissonTopScore,
        probability: prediction.mostLikelyScoreProbability,
        top5: top5Poisson ?? top5Sim,          // Analitik Poisson öncelikli
        top5Simulation: top5Sim,               // Davranışsal MC — debug/karşılaştırma
        lambdaHome: prediction.lambdaHome ?? simDist.avgHomeGoals,
        lambdaAway: prediction.lambdaAway ?? simDist.avgAwayGoals,
        mcAvgHome: simDist.avgHomeGoals,       // MC'nin simüle ettiği ortalama (karşılaştırma için)
        mcAvgAway: simDist.avgAwayGoals,
      };
    })(),

    // Gol piyasaları — Poisson null ise simulation distribution fallback; under = null-safe aritmetik
    goals: (() => {
      const simDist = simulation.distribution;
      const conf = (prediction.confidenceScore || 50) / 100;
      const pW = conf;
      const sW = 1.0 - conf;

      const mix = (p, s) => (p != null && s != null) ? (p * pW + s * sW) : (p ?? s);

      const over15val = mix(prediction.over15, simDist.over15);
      const over25val = mix(prediction.over25, simDist.over25);
      const bttsVal   = mix(prediction.btts,   simDist.btts);
      const over35val = prediction.over35; // Poisson only, Sim doesn't calculate O3.5 explicitly
      return {
        over15:  over15val,
        over25:  over25val,
        over35:  over35val,
        under15: over15val != null ? round2(100 - over15val) : null,
        under25: over25val != null ? round2(100 - over25val) : null,
        under35: over35val != null ? round2(100 - over35val) : null,
        btts:    bttsVal,
        bttsNo:  bttsVal != null ? round2(100 - bttsVal) : null,
      };
    })(),

    // İlk yarı tahmini
    firstHalf: generateFirstHalfPrediction(home, away),

    // Korner tahmini
    corners: generateCornerPrediction(home, away, shared, baseline),

    // Kart tahmini
    cards: generateCardPrediction(home, away, shared, baseline),

    // İlk gol tahmini — normalize so home+away sum to 100
    firstGoal: (() => {
      const m062h = home.form.M062;
      const m062a = away.form.M062;
      if (m062h == null && m062a == null && prediction.homeWinProbability == null) {
        return { homeScoresFirst: null, awayScoresFirst: null };
      }
      // Geometrik ortalama: formdan gelen M062 ve simülasyondan gelen kazanma olasılığı eşit ağırlıklı
      const hWinProb = prediction.homeWinProbability ?? ND.WIN_PROBABILITY_SYMMETRY;
      const aWinProb = prediction.awayWinProbability ?? ND.WIN_PROBABILITY_SYMMETRY;
      const rawHome = m062h != null ? Math.sqrt((m062h) * (hWinProb)) : hWinProb;
      const rawAway = m062a != null ? Math.sqrt((m062a) * (aWinProb)) : aWinProb;
      const total = rawHome + rawAway;
      if (total <= 0) return { homeScoresFirst: 50, awayScoresFirst: 50 };
      return {
        homeScoresFirst: round2((rawHome / total) * 100),
        awayScoresFirst: round2((rawAway / total) * 100),
      };
    })(),

    // Takım güç karşılaştırması
    comparison: {
      home: {
        attackPower: round2(home.compositeScores.M156),
        defensePower: round2(home.compositeScores.M157),
        form: round2(home.compositeScores.M158),
        playerQuality: round2(home.compositeScores.M159),
        goalkeeperPower: round2(home.compositeScores.M160),
        momentum: round2(home.compositeScores.M164),
        overallPower: round2(home.compositeScores.M166),
      },
      away: {
        attackPower: round2(away.compositeScores.M156),
        defensePower: round2(away.compositeScores.M157),
        form: round2(away.compositeScores.M158),
        playerQuality: round2(away.compositeScores.M159),
        goalkeeperPower: round2(away.compositeScores.M160),
        momentum: round2(away.compositeScores.M164),
        overallPower: round2(away.compositeScores.M166),
      },
      shared: {
        refereeImpact: round2(shared.sharedComposite.M161),
        h2hAdvantage: round2(shared.sharedComposite.M162),
        contextualAdvantage: round2(shared.sharedComposite.M163),
        // Hakem son maç istatistikleri (refereeLastEvents'ten)
        refGoalsPerMatch: shared.referee.refGoalsPerMatch != null ? round2(shared.referee.refGoalsPerMatch) : null,
        refOver25Rate: shared.referee.refOver25Rate != null ? round2(shared.referee.refOver25Rate) : null,
        refBTTSRate: shared.referee.refBTTSRate != null ? round2(shared.referee.refBTTSRate) : null,
        refHomeWinRate: shared.referee.refHomeWinRate != null ? round2(shared.referee.refHomeWinRate) : null,
        refAwayWinRate: shared.referee.refAwayWinRate != null ? round2(shared.referee.refAwayWinRate) : null,
        refLastEventsAnalyzed: shared.referee._meta?.lastEventsAnalyzed || ND.COUNTER_INIT,
      },
    },

    // UI_CFG-Specific: Detaylı Analiz & Zaman Çizelgesi
    analysis: {
      goalPeriods: {
        home: calculateGoalPeriods(home),
        away: calculateGoalPeriods(away),
      },
      hotZones: calculateHotZones(home, away),
      probabilities: {
        penaltyChance: calculatePenaltyChance(home, away, shared, baseline),
        redCardChance: calculateRedCardChance(home, away, shared, baseline),
        surpriseIndex: calculateSurpriseIndex(prediction, shared.contextual, baseline),
      },
    },

    // Behavioral Simulation Insights (Monte Carlo)
    simulationInsights: {
      distribution: simulation.distribution,
      sampleRun: simulation.sampleRun,
      summary: {
        runs: simulation.runs,
        expectedGoals: simulation.distribution.avgGoals,
        homeWinProb: simulation.distribution.homeWin,
        drawProb: simulation.distribution.draw,
        awayWinProb: simulation.distribution.awayWin,
      }
    },

    // Override main probabilities with simulation distribution for 100% consistency
    prediction: Object.assign({}, prediction, {
      homeWinProbability: simulation.distribution.homeWin,
      drawProbability: simulation.distribution.draw,
      awayWinProbability: simulation.distribution.awayWin,
      over25: simulation.distribution.over25,
      btts: simulation.distribution.btts,
      lambdaHome: simulation.distribution.avgHomeGoals ?? prediction.lambdaHome,
      lambdaAway: simulation.distribution.avgAwayGoals ?? prediction.lambdaAway,
    }),

    // 26 Davranış Ünitesi Analizi (Sıfır-Fallback Garantili)
    behavioralAnalysis: {
      home: simulation.sampleRun.units.home,
      away: simulation.sampleRun.units.away,
    },

    // Öne çıkan istatistikler
    highlights: generateHighlights(home, away, shared, prediction, baseline),

    // Lineup Workshop Data
    lineups: {
      home: Object.assign({}, metricsResult.home.lineup || data.lineups?.home, {
        players: injectReserves(
          (metricsResult.home.lineup || data.lineups?.home)?.players, 
          data.homePlayers,
          !!metricsResult.home.lineup 
        )
      }),
      away: Object.assign({}, metricsResult.away.lineup || data.lineups?.away, {
        players: injectReserves(
          (metricsResult.away.lineup || data.lineups?.away)?.players, 
          data.awayPlayers,
          !!metricsResult.away.lineup
        )
      }),
      isFallback: data.lineups?.isFallback || false,
    },

    // Form & H2H History
    h2hMatches: (() => {
      const _evs = data.h2hEvents?.events || [];
      return _evs
        .filter(e => e.status?.type === 'finished' || e.homeScore?.current != null)
        .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
        .map(e => ({
          ...e,
          startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
        }));
    })(),
    h2hSummary: (() => {
      const teamDuel = data.h2h?.teamDuel ?? null;
      if (teamDuel && (teamDuel.homeWins != null || teamDuel.team1Wins != null)) {
        return {
          team1Wins: teamDuel.homeWins ?? teamDuel.team1Wins ?? ND.COUNTER_INIT,
          draws: teamDuel.draws ?? ND.COUNTER_INIT,
          team2Wins: teamDuel.awayWins ?? teamDuel.team2Wins ?? ND.COUNTER_INIT,
        };
      }
      return null;
    })(),
    recentForm: {
      home: (data.homeLastEvents || [])
        .filter(e => e.status?.type === 'finished')
        .map(e => ({
          ...e,
          startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
        })),
      away: (data.awayLastEvents || [])
        .filter(e => e.status?.type === 'finished')
        .map(e => ({
          ...e,
          startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
        })),
    },

    // Meta
    meta: metricsResult.meta,
  };

  // --- Historical Edge / Model Stacking Boosts ---
  try {
    const edgeDb = getEdgeDb();
    if (edgeDb) {
      const leagueId = metricsResult.meta?.tournamentId?.toString();
      const homeTeam = data.homeTeam?.name || (data.match ? data.match.split(' vs ')[0] : null);
      const awayTeam = data.awayTeam?.name || (data.match ? data.match.split(' vs ')[1] : null);
      
      let edgeMeta = { leaguePenalty: false, premiumBTTS: false, messages: [] };

      // 1. League Penalty/Boost check
      if (leagueId && edgeDb.leagues && edgeDb.leagues[leagueId]) {
         const lgData = edgeDb.leagues[leagueId];
         // Negative edge means model is BETTER than bookmaker. Positive means bookmaker is better.
         if (lgData.edge > 0.02 && lgData.n >= 5) {
            // Dinamik Ceza Skalası: Brier farkını 500 çarpanıyla Confidence eksenine map'le
            const penalty = Math.min(50, Math.round(lgData.edge * 500));
            report.result.confidence = Math.max(10, report.result.confidence - penalty);
            edgeMeta.leaguePenalty = true;
            edgeMeta.messages.push(`Toxic League: Model Brier is behind bookmaker by +${lgData.edge.toFixed(3)}. Confidence penalized by -${penalty}.`);
            report.meta.recommendation = "NO BET (Toxic League)";
         } else if (lgData.edge < -0.015 && lgData.n >= 5) {
            // Dinamik Ödül Skalası
            const boost = Math.min(25, Math.round(Math.abs(lgData.edge) * 300));
            edgeMeta.messages.push(`Strong League: Model historically beats bookmaker by ${Math.abs(lgData.edge).toFixed(3)}. Confidence boosted by +${boost}.`);
            report.result.confidence = Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB || 95, report.result.confidence + boost);
         }
      }

      // 2. Team Boost check (BTTS / OU) - Compound Explosion'ı Önlemek İçin Average Multiplier
      let bttsMultipliers = [];
      let ouMultipliers = [];
      let bttsMessages = [];
      let ouMessages = [];

      [homeTeam, awayTeam].forEach(t => {
         if (!t || !edgeDb.teams || !edgeDb.teams[t]) return;
         const tData = edgeDb.teams[t];
         
         // BTTS Dynamic Accuracy Multiplier
         if (tData.accBTTS > 0.50 && tData.n >= 2 && report.goals.btts > 50) {
            const m = 1.0 + (tData.accBTTS - 0.50);
            bttsMultipliers.push(m);
            if (tData.accBTTS >= 0.80) edgeMeta.premiumBTTS = true;
            bttsMessages.push(`BTTS Edge: ${t} (${(tData.accBTTS*100).toFixed(0)}% historic acc). Multiplier: ${m.toFixed(2)}x.`);
         } else if (tData.accBTTS < 0.50 && tData.n >= 2 && report.goals.btts > 50) {
            const m = 0.50 + tData.accBTTS;
            bttsMultipliers.push(m);
            bttsMessages.push(`BTTS Warning: ${t} (${(tData.accBTTS*100).toFixed(0)}% acc). Multiplier: ${m.toFixed(2)}x.`);
         }

         // OU xG Ratio Drift Adjustment (Gerçekleşen / Beklenen)
         if (tData.xgRatio && Math.abs(tData.xgRatio - 1.0) > 0.1 && tData.n >= 2) {
            const safeXgRatio = Math.max(0.6, Math.min(1.4, tData.xgRatio));
            ouMultipliers.push(safeXgRatio);
            ouMessages.push(`xG Drift: ${t} scores ${(safeXgRatio).toFixed(2)}x of expected goals.`);
         }
      });

      // Çarpanları uygula (Bileşik patlamayı önlemek için ortalama alınır)
      if (bttsMultipliers.length > 0) {
          const avgBttsM = bttsMultipliers.reduce((a, b) => a + b, 0) / bttsMultipliers.length;
          report.goals.btts = Math.max(20, Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB || 95, report.goals.btts * avgBttsM));
          if (report.goals.bttsNo != null) report.goals.bttsNo = 100 - report.goals.btts;
          edgeMeta.messages.push(...bttsMessages);
          edgeMeta.messages.push(`Applied blended BTTS multiplier: ${avgBttsM.toFixed(2)}x`);
      }

      if (ouMultipliers.length > 0 && report.goals.over25 != null) {
          const avgOuM = ouMultipliers.reduce((a, b) => a + b, 0) / ouMultipliers.length;
          report.goals.over25 = Math.max(20, Math.min(SIM_CONFIG?.UI_THRESHOLDS?.MAX_UI_PROB || 95, report.goals.over25 * avgOuM));
          if (report.goals.under25 != null) report.goals.under25 = 100 - report.goals.over25;
          edgeMeta.messages.push(...ouMessages);
          edgeMeta.messages.push(`Applied blended Over2.5 multiplier: ${avgOuM.toFixed(2)}x`);
      }

      if (edgeMeta.messages.length > 0) {
          report.meta.edgeInsights = edgeMeta;
      }
    }
  } catch(e) {
    console.error("[PredictionGenerator] Edge DB application failed:", e.message);
  }

  return report;
}

function injectReserves(lineupPlayers, squadPlayers, suppressInjection = false) {
  if (!lineupPlayers) lineupPlayers = [];
  
  // Custom lineup (Workshop) var ise ve doluysa, otomatik enjeksiyonu engelle
  if (suppressInjection && lineupPlayers.length > 0) return lineupPlayers;
  
  if (!squadPlayers || !squadPlayers.players) return lineupPlayers;

  const lineupIds = new Set(lineupPlayers.map(p => p.player?.id).filter(Boolean));
  const reserves = [];

  squadPlayers.players.forEach(p => {
    if (!lineupIds.has(p.player?.id)) {
      reserves.push({
        player: p.player,
        position: p.player?.position || 'M',
        shirtNumber: p.player?.shirtNumber || '',
        substitute: true,
        isReserve: true
      });
    }
  });

  return [...lineupPlayers, ...reserves];
}

function generateFirstHalfPrediction(home, away) {
  const homeHT = home.attack.M003 ?? null;
  const awayHT = away.attack.M003 ?? null;

  // Veri yoksa null döndür — 0 göstermek yanıltıcı olur
  if (homeHT == null && awayHT == null) {
    return { expectedHomeGoals: null, expectedAwayGoals: null, over05HT: null, over15HT: null, htResult: null };
  }

  const hHT = homeHT ?? ND.COUNTER_INIT;
  const aHT = awayHT ?? ND.COUNTER_INIT;
  const totalHTGoals = hHT + aHT;

  // Use Poisson CDF instead of linear scaling for consistent over/under probabilities.
  // P(X >= 1) = 1 - e^(-λ), P(X >= 2) = 1 - e^(-λ)(1 + λ)
  const pOver05 = totalHTGoals > 0 ? (1 - Math.exp(-totalHTGoals)) * 100 : 0;
  const pOver15 = totalHTGoals > 0
    ? (1 - Math.exp(-totalHTGoals) * (1 + totalHTGoals)) * 100 : 0;

  return {
    expectedHomeGoals: round2(hHT),
    expectedAwayGoals: round2(aHT),
    over05HT: round2(Math.min(UI_CFG.MAX_UI_PROB, pOver05)),
    over15HT: round2(Math.min(UI_CFG.O15_CAP, pOver15)),
    htResult: hHT > aHT + UI_CFG.HT_RESULT_THRESHOLD ? '1' : aHT > hHT + UI_CFG.HT_RESULT_THRESHOLD ? '2' : 'X',
  };
}

function generateCornerPrediction(home, away, shared, baseline) {
  const homeCorners = home.attack.M022 ?? null;
  const awayCorners = away.attack.M022 ?? null;
  if (homeCorners == null && awayCorners == null) {
    return { expectedHome: null, expectedAway: null, expectedTotal: null, over85: null, over95: null, over105: null };
  }
  // Eğer bir tarafın verisi varsa diğer tarafı simetrik fallback yap (aynı değer)
  const hc = homeCorners ?? awayCorners;
  const ac = awayCorners ?? homeCorners;
  const totalCorners = hc + ac;

  // Aşama 7: Dinamik korner threshold'ları
  // leagueCornerAvg = M022 lig ortalaması × 2 (iki takım)
  // threshold = avg ± std (std yoksa avg × 0.15 yaklaşımı)
  const lgCornerPerTeam = baseline?.dynamicAvgs?.M022 ?? null;
  let cL = PT.CORNER_L, cM = PT.CORNER_M, cH = PT.CORNER_H;
  if (lgCornerPerTeam != null && lgCornerPerTeam > 0) {
    const lgCornerTotal = lgCornerPerTeam * 2;
    const cornerStd = lgCornerTotal * 0.15; // ~%15 CV yaklaşımı
    cL = Math.round((lgCornerTotal - cornerStd) * 2) / 2; // 0.5'e yuvarla
    cM = Math.round(lgCornerTotal * 2) / 2;
    cH = Math.round((lgCornerTotal + cornerStd) * 2) / 2;
  }

  // Poisson-based over/under: P(X > k) = 1 - CDF(k, lambda)
  return {
    expectedHome: round2(hc),
    expectedAway: round2(ac),
    expectedTotal: round2(totalCorners),
    over85: round2(Math.min(UI_CFG.MAX_UI_PROB, poissonExceed(totalCorners, cL) * 100)),
    over95: round2(Math.min(UI_CFG.MAX_UI_PROB, poissonExceed(totalCorners, cM) * 100)),
    over105: round2(Math.min(UI_CFG.MAX_UI_PROB, poissonExceed(totalCorners, cH) * 100)),
  };
}

function generateCardPrediction(home, away, shared, baseline) {
  const homeYellows = home.defense.M039 ?? null;
  const awayYellows = away.defense.M039 ?? null;
  const refYellows = shared.referee.M109 ?? null;

  // En az bir kart verisi yoksa null dön
  const hasTeamData = homeYellows != null || awayYellows != null;
  const hasRefData = refYellows != null;
  if (!hasTeamData && !hasRefData) {
    return { expectedYellowCards: null, expectedRedCards: null, over35Cards: null, over45Cards: null, refereeSeverity: shared.referee.M117 ?? null };
  }

  // Mevcut verilerden ağırlıklı hesap.
  // teamAvg = iki takımın kart ortalaması; hakem sertliği veya lig stabilitesi ile ölçeklenir.
  // KRITIK: refM117 0-100 skalasında, normalize edilmeli → refM117/50 (nötr=1.0).
  // lgStability zaten 0-1 aralığında (1 - CV), 1.0 nötr.
  const teamAvg = hasTeamData ? (homeYellows ?? awayYellows) + (awayYellows ?? homeYellows) : null;
  const refM117raw = shared.referee.M117 ?? null;
  const refSeverity = refM117raw != null ? refM117raw / 50 : null; // 50 nötr → 1.0
  const lgStability = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? Math.max(0, 1 - baseline.leagueGoalVolatility / baseline.leagueAvgGoals)
    : null;
  // Çarpan: iki sinyal varsa geometrik ortalaması, yalnız biri varsa direkt onu kullan.
  const cardMultiplier = (refSeverity != null && lgStability != null)
    ? Math.sqrt(refSeverity * Math.max(lgStability, 0.01))
    : (refSeverity ?? lgStability);
  const expectedYellows = (teamAvg != null)
    ? (cardMultiplier != null ? teamAvg * cardMultiplier : teamAvg)
    : (refYellows ?? null);

  const expectedReds = (home.defense.M040 ?? ND.COUNTER_INIT) + (away.defense.M040 ?? ND.COUNTER_INIT);

  // Aşama 7: Dinamik kart threshold'ları
  const lgYellowPerTeam = baseline?.dynamicAvgs?.M039 ?? null;
  let cardL = PT.CARD_L, cardH = PT.CARD_H;
  if (lgYellowPerTeam != null && lgYellowPerTeam > 0) {
    const lgCardTotal = lgYellowPerTeam * 2;
    const cardStd = lgCardTotal * 0.20; // ~%20 CV yaklaşımı
    cardL = Math.round((lgCardTotal - cardStd) * 2) / 2;
    cardH = Math.round((lgCardTotal + cardStd) * 2) / 2;
  }

  // Poisson-based over/under
  return {
    expectedYellowCards: expectedYellows != null ? round2(expectedYellows) : null,
    expectedRedCards: round2(expectedReds),
    over35Cards: expectedYellows != null ? round2(Math.min(UI_CFG.MAX_UI_PROB, poissonExceed(expectedYellows, cardL) * 100)) : null,
    over45Cards: expectedYellows != null ? round2(Math.min(UI_CFG.MAX_UI_PROB, poissonExceed(expectedYellows, cardH) * 100)) : null,
    refereeSeverity: shared.referee.M117 ?? null,
  };
}


function generateHighlights(home, away, shared, prediction, baseline) {
  const highlights = [];

  // Form vurgusu
  if (home.form.M046 > UI_CFG.FORM_HIGH) highlights.push(`�� Ev sahibi son 5 maçta muhteşem formda (%${round2(home.form.M046)})`);
  if (away.form.M046 > UI_CFG.FORM_HIGH) highlights.push(`�� Deplasman son 5 maçta muhteşem formda (%${round2(away.form.M046)})`);
  if (home.form.M046 < UI_CFG.FORM_LOW) highlights.push(`⚠️ Ev sahibi son 5 maçta kötü formda (%${round2(home.form.M046)})`);
  if (away.form.M046 < UI_CFG.FORM_LOW) highlights.push(`⚠️ Deplasman son 5 maçta kötü formda (%${round2(away.form.M046)})`);

  // Gol serisi
  if (home.form.M051 > 5) highlights.push(`⚽ Ev sahibi ${home.form.M051} maçtır gol atıyor`);
  if (away.form.M051 > 5) highlights.push(`⚽ Deplasman ${away.form.M051} maçtır gol atıyor`);

  // Clean sheet
  if (home.form.M052 > 3) highlights.push(`�� Ev sahibi ${home.form.M052} maçtır gol yemiyor`);
  if (away.form.M052 > 3) highlights.push(`�� Deplasman ${away.form.M052} maçtır gol yemiyor`);

  // Sakatlık etkisi
  if (home.player.M077 > 1) highlights.push(`�� Ev sahibinde kritik sakatlıklar var (etki: ${round2(home.player.M077)})`);
  if (away.player.M077 > 1) highlights.push(`�� Deplasmanında kritik sakatlıklar var (etki: ${round2(away.player.M077)})`);

  // H2H
  const totalH2H = (shared.h2h.M119 || ND.COUNTER_INIT) + (shared.h2h.M120 || ND.COUNTER_INIT) + (shared.h2h.M121 || ND.COUNTER_INIT);
  // H2H dominans eşiği: beraberliklerin toplam H2H'ye oranıyla belirlenir — sıfır sabit.
  const _h2hDraws = shared.h2h.M120 || 0;
  const _h2hDomThreshold = totalH2H > 0 ? 1 + (_h2hDraws + 1) / totalH2H : null;
  if (totalH2H > 0 && _h2hDomThreshold != null && shared.h2h.M119 > shared.h2h.M121 * _h2hDomThreshold) {
    highlights.push(`�� H2H'de ev sahibi baskın (${shared.h2h.M119}G-${shared.h2h.M120}B-${shared.h2h.M121}M)`);
  }

  // Geriden gelme
  if (home.form.M064 > 50) highlights.push(`�� Ev sahibi geriden gelme konusunda güçlü (%${round2(home.form.M064)})`);
  if (away.form.M064 > 50) highlights.push(`�� Deplasman geriden gelme konusunda güçlü (%${round2(away.form.M064)})`);

  // Güven skoru
  const confidence = calculateConfidence(prediction, shared, home, away, baseline);
  if (confidence > UI_CFG.CONFIDENCE_HIGH) highlights.push(`✅ Yüksek güvenilirlik skoru: %${round2(confidence)}`);
  if (confidence < UI_CFG.CONFIDENCE_LOW) highlights.push(`⚠️ Düşük güvenilirlik skoru: %${round2(confidence)} — çok riskli maç`);

  // Sürpriz Endeksi
  const surpriseIndex = calculateSurpriseIndex(prediction, shared.contextual, baseline);
  if (surpriseIndex > UI_CFG.SURPRISE_HIGH) highlights.push(`��️ Sürpriz Endeksi Çok Yüksek (%${surpriseIndex}) — Ters köşe riski barındıran maç`);

  // Güç Dengesi: eşik tamamen lig verilerinden — sıfır sabit.
  const _cv = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  const _ptsCv = baseline?.ptsCV ?? null;
  const _powerGapThreshold = (_cv != null && _ptsCv != null) ? (1 + _ptsCv) + _cv * _ptsCv : null;
  if (_powerGapThreshold != null && home.compositeScores.M156 > away.compositeScores.M157 * _powerGapThreshold) {
    highlights.push(`⚔️ Ev sahibi hücumu, deplasman defansını rahatlıkla aşacak potansiyelde`);
  }
  if (_powerGapThreshold != null && away.compositeScores.M156 > home.compositeScores.M157 * _powerGapThreshold) {
    highlights.push(`⚔️ Deplasman hücumu, ev sahibi defansına ciddi bir tehdit oluşturuyor`);
  }

  // Korner Dinamiği
  const hCor = home.attack.M022 ?? null;
  const aCor = away.attack.M022 ?? null;
  const totalCorners = (hCor != null || aCor != null) ? (hCor ?? aCor) + (aCor ?? hCor) : null;
  if (totalCorners != null) {
    const pOver105 = Math.min(UI_CFG.MAX_UI_PROB, poissonExceed(totalCorners, PT.CORNER_H) * 100);
    if (pOver105 > UI_CFG.SURPRISE_HIGH) {
      highlights.push(`🚩 Maçta her iki takımın temposuyla yoğun korner trafiği bekleniyor`);
    }
  }

  return highlights;
}

function getMostLikelyResult(prediction) {
  const hw = prediction.homeWin !== undefined ? prediction.homeWin : prediction.homeWinProbability;
  const dw = prediction.draw !== undefined ? prediction.draw : prediction.drawProbability;
  const aw = prediction.awayWin !== undefined ? prediction.awayWin : prediction.awayWinProbability;
  
  const max = Math.max(hw, dw, aw);
  if (max === hw) return '1 (Ev Sahibi Kazanır)';
  if (max === aw) return '2 (Deplasman Kazanır)';
  return 'X (Beraberlik)';
}

function calculateConfidence(prediction, shared, home, away, baseline) {
  // 1. Olasılık Farkı (Base Confidence)
  // Üç olasılık arasındaki dağılım netliğine göre base confidence hesaplanır.
  const maxProb = Math.max(prediction.homeWinProbability, prediction.drawProbability, prediction.awayWinProbability);
  const minProb = Math.min(prediction.homeWinProbability, prediction.drawProbability, prediction.awayWinProbability);
  const midProb = 100 - maxProb - minProb;

  const gap = maxProb - midProb;
  // Gap ağırlığı lig rekabetine bağlı: sıkışık lig (yüksek den) → gap anlamsız → düşük ağırlık
  // Volatil ligde (yüksek vol/avg) → gap daha güvenilir → yüksek ağırlık
  // Kaynak: leaguePointDensity + leagueGoalVolatility + leagueAvgGoals (hepsi standings'ten)
  // Fallback: 1.4 (sabit 1.5'ten conservative — belirsizlik tercih edilir)
  // Sabit 1.8/0.4/0.8/2.2/1.4 fallback'ları kaldırıldı. Ağırlık density ve CV saturasyonundan türetilir.
  const _gapWeight = (() => {
    const den_ = baseline?.leaguePointDensity;
    const vol_ = baseline?.leagueGoalVolatility;
    const avg_ = baseline?.leagueAvgGoals;
    if (den_ != null && vol_ != null && avg_ != null && avg_ > 0) {
      return (1 - den_ / (den_ + 1)) * (1 + vol_ / avg_);
    }
    if (den_ != null) return 1 - den_ / (den_ + 1);
    if (vol_ != null && avg_ != null && avg_ > 0) return 1 + vol_ / avg_;
    return null; // veri yok → gap katkısı devreye girmez
  })();
  // maxProb dampening: volatil ligde maxProb daha az güvenilir. Clamp 0.15/0.40 + 0.25 fallback kaldırıldı.
  const _maxProbDamp = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals != null && baseline.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / (baseline.leagueAvgGoals * 2)
    : null;
  let baseConfidence = (_gapWeight != null && _maxProbDamp != null)
    ? gap * _gapWeight + maxProb * (1.0 - _gapWeight * _maxProbDamp)
    : maxProb;

  const favModel = maxProb === prediction.homeWinProbability ? 'home' : (maxProb === prediction.awayWinProbability ? 'away' : 'draw');

  // 2. Geçmiş Dominansı (H2H Edge)
  // Sabit oranlar yerine ligin özelliklerinden türetilmiş güvenilirlik ve sınır değerleri.
  const homeH2HWins = shared?.h2h?.M119 || ND.COUNTER_INIT;
  const awayH2HWins = shared?.h2h?.M121 || ND.COUNTER_INIT;
  const h2hDraws = shared?.h2h?.M120 || ND.COUNTER_INIT;
  const totalH2H = homeH2HWins + awayH2HWins + h2hDraws;
  
  if (totalH2H >= 3) {
    // H2H güvenilirlik çarpanı: ligin takımların birbirleriyle oynama sayısından veya volatiflikten
    // Daha güvenilir (stabil) liglerde daha az H2H örneği yeterli olabilir
    const _cvH2H = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
      ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : 0.5;
    const _reqSample = Math.max(4, 10 * _cvH2H);
    const h2hReliability = Math.min(1.0, totalH2H / _reqSample);
    
    const favH2HWins = favModel === 'home' ? homeH2HWins : (favModel === 'away' ? awayH2HWins : Math.max(homeH2HWins, awayH2HWins));
    const h2hRatio = totalH2H > 0 ? favH2HWins / totalH2H : 0;
    
    // Nötr beraberlik oranından türeyen dominans eşiği
    const _neutralWinProb = (baseline.medianGoalRate != null && baseline.leagueAvgGoals > 0)
      ? Math.min(0.45, baseline.medianGoalRate / (baseline.leagueAvgGoals * 2))
      : 0.33;
    // Maksimum bonus 30 yerine lig gol averajından türeyen volatilite katsayısına bağlanır
    const _maxBonus = (baseline.leagueAvgGoals || 2.5) * 10 * (1 + _cvH2H);
    
    const h2hBonus = (h2hRatio - _neutralWinProb) * _maxBonus * h2hReliability;
    baseConfidence += h2hBonus;
  }

  // 3. Sakatlık Volatilitesi
  const homeInjuries = home?.player?.M077 || ND.COUNTER_INIT;
  const awayInjuries = away?.player?.M077 || ND.COUNTER_INIT;
  const maxInjuryImpact = Math.max(homeInjuries, awayInjuries);
  // Kadro derinliği (M079): 0-100 skalası, derin kadro = yüksek
  const favSqDepth = favModel === 'home' ? (home?.player?.M079 ?? ND.SQUAD_DEPTH_MEDIAN) : (away?.player?.M079 ?? ND.SQUAD_DEPTH_MEDIAN);
  const _lgAvgDepth = ((home?.player?.M079 ?? ND.SQUAD_DEPTH_MEDIAN) + (away?.player?.M079 ?? ND.SQUAD_DEPTH_MEDIAN)) / 2;
  const _depthCenter = _lgAvgDepth / ND.PERCENT_BASE;
  const depthMultiplier = Math.max(0, (1.0 + _depthCenter) - (favSqDepth / ND.PERCENT_BASE));
  
  const _injThresh = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? (baseline.leagueGoalVolatility / baseline.leagueAvgGoals)
    : 0.5; // Volatil liglerde sakatlık eşiği yüksek (az etkiler)
    
  if (maxInjuryImpact > _injThresh) {
    // Her 1.0 birim sakatlık etkisi → (leagueAvgGoals * volatilite) × derinlik çarpanı
    const _injPenaltyScale = (baseline.leagueAvgGoals || 2.5) * (1 + _injThresh);
    baseConfidence -= maxInjuryImpact * _injPenaltyScale * depthMultiplier;
  }

  // 4. Pazar Mutabakatı
  // Sabit +5 yerine: model-pazar uyumu yüzdesi × 0.15
  // Bahis oranları ile model tahmini aynı yöndeyse güven artar
  const marketHomeImplied = shared?.contextual?.M131 ?? null;
  const marketAwayImplied = shared?.contextual?.M133 ?? null;
  if (marketHomeImplied != null && marketAwayImplied != null) {
    const modelFavProb = maxProb;
    const marketFavProb = favModel === 'home' ? marketHomeImplied : (favModel === 'away' ? marketAwayImplied : null);
    if (marketFavProb != null) {
      // Her iki kaynağın da favoriye verdiği olasılık yakınsa → güven artar
      const consensus = 100 - Math.abs(modelFavProb - marketFavProb);
      // Market consensus katkısı: density saturasyonundan türetilir.
      // Clamp bantları (0.08/0.25) ve sabit 0.15 fallback kaldırıldı.
      // density=0 → 0 katkı; density → ∞ → 1 katkı (saturasyon formu).
      const _marketDepth = (baseline.leaguePointDensity != null && baseline.leaguePointDensity >= 0)
        ? baseline.leaguePointDensity / (baseline.leaguePointDensity + 1)
        : null;
      if (_marketDepth != null) baseConfidence += consensus * _marketDepth;
    }
  }

  // 5. Veri Kapsamı Bonusu/Cezası
  // H2H, hakem ve bahis verisi mevcut mu? Her biri modele katkı sağlar.
  const dataSignals = [
    totalH2H > 0,
    (shared?.referee?.M109 ?? null) != null,
    (shared?.contextual?.M131 ?? null) != null,
    (home?.form?.M046 ?? null) != null,
    (home?.player?.M066 ?? null) != null,
  ];
  const dataCompleteness = dataSignals.filter(Boolean).length / dataSignals.length;
  // Tam veri bonusu ve sıfır veri cezası, ligin volatilite bandından (CV) türetilir.
  const _cvCompleteness = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals
    : 0.5;
  // Volatil ligde verinin eksikliği daha çok cezalandırılır.
  const _completenessScale = (baseline.leagueAvgGoals || 2.5) * 10 * _cvCompleteness;
  // completeness 0.5 nötr noktası matematiksel bir simetridir (0-1 arasında)
  baseConfidence += (dataCompleteness - 0.5) * _completenessScale;

  return Math.min(UI_CFG.MAX_UI_PROB, Math.max(15, baseConfidence));
}

// round2 ve poissonPMF artık math-utils.js'den import ediliyor

function calculateGoalPeriods(team) {
  return {
    '0-15': team.attack.M005 || ND.COUNTER_INIT,
    '16-30': team.attack.M006 || ND.COUNTER_INIT,
    '31-45': team.attack.M007 || ND.COUNTER_INIT,
    '46-60': team.attack.M008 || ND.COUNTER_INIT,
    '61-75': team.attack.M009 || ND.COUNTER_INIT,
    '76-90': team.attack.M010 || ND.COUNTER_INIT,
  };
}

function calculateHotZones(home, away) {
  const zones = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const results = zones.map(z => ({
    period: z,
    intensity: round2((home.attack[`M${getMetricForPeriod(z)}`] || ND.COUNTER_INIT) + (away.attack[`M${getMetricForPeriod(z)}`] || ND.COUNTER_INIT))
  }));
  return results.sort((a, b) => b.intensity - a.intensity).slice(0, 2).map(r => r.period);
}

function getMetricForPeriod(p) {
  const map = { '0-15': '005', '16-30': '006', '31-45': '007', '46-60': '008', '61-75': '009', '76-90': '010' };
  return map[p];
}

function calculatePenaltyChance(home, away, shared, baseline) {
  const teamFreq = (home.attack.M019 ?? ND.COUNTER_INIT) + (away.attack.M019 ?? ND.COUNTER_INIT);
  const refFreq = shared.referee.M111 ?? null;
  if (teamFreq === 0 && refFreq == null) return null;
  
  const _hasRefPenData = (refFreq ?? null) != null;
  
  // Lig gol ortalamasından ve takım penaltı sayısından güvenilirlik ağırlığı oluşturuyoruz
  // Lig çok gollüyse veya CV yüksekse hakemin etkisi azalabilir
  const _cvPen = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : 0.5;
  
  const _teamPenW = _hasRefPenData ? Math.min(0.5, 0.35 + _cvPen * 0.1) : 1.0;
  const _refPenW  = _hasRefPenData ? (1.0 - _teamPenW) : 0.0;
  
  // refFreq dakika başına olduğundan 90 ile çarpılır, takım frekansına (maç başı) eşitlenir
  const chanceRaw = (teamFreq * _teamPenW) + ((refFreq ?? ND.COUNTER_INIT) * 90 * _refPenW);
  
  // High/Medium kararı için ligin ortalama penaltı sınırlarına oranlama
  const _penMatchAvg = (baseline?.penPerMatch != null && baseline?.penPerMatch > 0) ? baseline.penPerMatch * 2 : 0.25;
  
  if (chanceRaw > _penMatchAvg * 1.5) return 'High';
  if (chanceRaw > _penMatchAvg * 0.8) return 'Medium';
  return 'Low';
}

function calculateRedCardChance(home, away, shared, baseline) {
  const teamAgg = (home.defense.M040 ?? ND.COUNTER_INIT) + (away.defense.M040 ?? ND.COUNTER_INIT);
  const refAgg = shared.referee.M110 ?? null;
  if (teamAgg === 0 && refAgg == null) return null;
  
  // refAgg dakika başına olduğundan 90 ile çarpılarak maç başı eşdeğere getirilir
  const chanceRaw = (teamAgg * 0.5) + ((refAgg ?? ND.COUNTER_INIT) * 90 * 0.5);
  
  const _redMatchAvg = (baseline?.redPerMin != null && baseline?.redPerMin > 0) ? baseline.redPerMin * 90 * 2 : 0.10;
  
  if (chanceRaw > _redMatchAvg * 1.8) return 'High';
  if (chanceRaw > _redMatchAvg * 0.9) return 'Medium';
  return 'Low';
}

function calculateSurpriseIndex(prediction, contextual, baseline) {
  // Bahis oranları ile Poisson arasındaki sapma
  const homeProb = prediction.homeWinProbability;
  const marketProb = contextual.M131 ?? null;
  if (homeProb == null || marketProb == null) return null;
  const delta = Math.abs(homeProb - marketProb);
  // Scale factor: 100 / (avg × teamCount) — sıfır sabit.
  // Büyük ligde (36 takım) düşük, küçük kupada yüksek — leagueTeamCount veriden.
  const _penScaleFactor = (baseline?.leagueAvgGoals != null && baseline.leagueAvgGoals > 0
      && baseline?.leagueTeamCount != null && baseline.leagueTeamCount > 0)
    ? 100 / (baseline.leagueAvgGoals * baseline.leagueTeamCount)
    : null;
  return _penScaleFactor != null ? round2(Math.min(100, delta * _penScaleFactor)) : null;
}

module.exports = { generatePrediction };
