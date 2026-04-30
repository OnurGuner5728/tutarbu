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
  const { home, away, shared, prediction,
    leagueFingerprint, homeScoreProfile, awayScoreProfile, matchScoreProfile } = metricsResult;

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
      const conf = prediction.confidenceScore != null ? prediction.confidenceScore / 100 : null;

      // ── Dinamik Blend Ağırlığı (MC-Poisson Agreement) ──────────────────────
      // Sabit pW=conf yerine: iki modelin anlaşma derecesi (agreement) ile ağırlıklandır.
      // TVD (Total Variation Distance) = ½ × Σ|p_poisson - p_mc|. Değer 0-1 arası.
      // Poisson ve MC arasındaki ağırlık merkezi (basePoissonW) ligin volatilitesine bağlanır:
      // vol/avg (CV) yüksekse lig kaotiktir, analitik Poisson'ın baz güveni düşer.
      const vol = baseline?.leagueGoalVolatility;
      const avg = baseline?.leagueAvgGoals;
      const basePoissonW = (vol != null && avg != null && avg > 0)
        ? 1.0 - (vol / (vol + avg))
        : null; // Veri yoksa blend ağırlığı belirlenemez

      const pH_poiss = prediction.homeWinProbability / 100;
      const pD_poiss = prediction.drawProbability / 100;
      const pA_poiss = prediction.awayWinProbability / 100;
      const pH_mc = simDist.homeWin / 100;
      const pD_mc = simDist.draw / 100;
      const pA_mc = simDist.awayWin / 100;

      const tvd = (Math.abs(pH_poiss - pH_mc) + Math.abs(pD_poiss - pD_mc) + Math.abs(pA_poiss - pA_mc)) / 2;
      let pW;
      if (basePoissonW != null && conf != null) {
        pW = basePoissonW + (1.0 - basePoissonW) * conf * (1 - tvd);
      } else if (basePoissonW != null) {
        pW = basePoissonW; // güven yoksa sadece lig CV baz ağırlığı
      } else {
        pW = 1 / 2; // hiçbir lig verisi yoksa → iki modelin aritmetik ortalaması
      }
      const sW = 1.0 - pW;

      let homeWin = (prediction.homeWinProbability * pW) + (simDist.homeWin * sW);
      let draw = (prediction.drawProbability * pW) + (simDist.draw * sW);
      let awayWin = (prediction.awayWinProbability * pW) + (simDist.awayWin * sW);

      // ── Kalibrasyon Post-Processing ──────────────────────────────────────
      // Platt scaling + lig bazlı düzeltme (backtest verisinden öğrenilmiş)
      // Sistem overconfidence sorunu: %60 dediğinde gerçekleşme ~%45
      const leagueId = metricsResult.meta?.tournamentId ?? null;
      if (_calParams) {
        const calSum = homeWin + draw + awayWin;
        const rawProbs = calSum > 0
          ? [homeWin / calSum, draw / calSum, awayWin / calSum]
          : [1 / 3, 1 / 3, 1 / 3];
        const calProbs = calibrateProbs(rawProbs, leagueId, _calParams);
        // Geri ölçekle (0-100 aralığına)
        homeWin = calProbs[0] * 100;
        draw = calProbs[1] * 100;
        awayWin = calProbs[2] * 100;
      }

      // ── Dinamik Overconfidence Ezici (Temperature Scaling) ───────────────
      // Kitapçının Brier skorunu yakalamak ve aşırı özgüveni (Overconfidence) kırmak için
      // Ligin gol volatilitesine göre dinamik olarak olasılıkları merkeze büzüştürür.
      const cvVal = (avg != null && avg > 0) ? (vol / avg) : 0;

      // Lig dinamik metrikleri — baseline'dan saf veri
      // compIndex: 1/CV formatında (yüksek = rekabetçi lig), drawTendency: saf beraberlik oranı
      const compIndex = baseline?.leagueCompetitiveness ?? metricsResult.meta?.leagueCompetitiveness ?? null;
      const drawTendency = baseline?.leagueDrawTendency ?? metricsResult.meta?.leagueDrawTendency ?? null;

      // CV ne kadar yüksekse (sürpriz ihtimali çoksa) temperature o kadar artar.
      // Rekabetçilik yüksekse (compIndex büyük = 1/cv büyük = CV küçük = lig çekişmeli) → T artar
      // Beraberlik oranı yüksekse → T artar (olasılıklar düzleşir)
      // Tüm katkılar doğrudan veriden: cvVal zaten dinamik, compIndex 1/cv, drawTendency saf oran
      let temperature = 1.0 + cvVal;
      if (compIndex != null) temperature += cvVal / compIndex; // rekabetçi ligde CV etkisi artar
      if (drawTendency != null) temperature += drawTendency;  // beraberlik oranı doğrudan katkı
      // Temperature doğal aralığında kalır — veri yoksa sadece 1+cvVal kullanılır

      let s_homeWin = homeWin / 100;
      let s_draw = draw / 100;
      let s_awayWin = awayWin / 100;
      const s_sum = s_homeWin + s_draw + s_awayWin;

      if (s_sum > 0) {
        let T_probs = [s_homeWin / s_sum, s_draw / s_sum, s_awayWin / s_sum].map(p => {
          const clampedP = Math.max(1e-9, Math.min(1 - 1e-9, p));
          return Math.exp(Math.log(clampedP) / temperature);
        });

        const tSum = T_probs.reduce((a, b) => a + b, 0);
        T_probs = T_probs.map(p => p / tSum);

        homeWin = T_probs[0] * 100;
        draw = T_probs[1] * 100;
        awayWin = T_probs[2] * 100;
      }

      const res = {
        homeWin: round2(homeWin),
        draw: round2(draw),
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

    // ── Coverage-Controlled Prediction ──────────────────────────────────────────
    // Seçici tahmin: düşük güven maçlarda tahmin kalitesini işaretle
    // HIGH (≥70%): güvenilir tahmin, bahis için uygun
    // MEDIUM: orta güven, dikkatli kullan
    // LOW: yüksek belirsizlik, tahmin verme veya düşük güven olarak işaretle
    coverageControl: (() => {
      const simDist = simulation.distribution;
      const maxProb = Math.max(
        simDist.homeWin ?? 0,
        simDist.draw ?? 0,
        simDist.awayWin ?? 0
      );
      const cv = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
        ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
      // Eşik değer: ligin en sık sonucunun gerçekleşme oranı
      // drawTendency = toplam beraberlik oranı, bu da ligin tahmin edilebilirliğini belirler
      // Beraberlik oranı yüksek → sonuçlar tahmin edilemez → eşik yükselir
      const _lgDrawRate = baseline?.leagueDrawTendency; // saf oran (0.20-0.30 arası tipik)
      const dynamicThreshold = _lgDrawRate != null
        ? (100 / 3) + (_lgDrawRate * 100) // ligin beraberlik oranı arttıkça eşik artar
        : (cv != null ? (100 / 3) + cv * (100 / 3) : 50); // cv varsa ondan, yoksa %50
      const tier = maxProb >= 70.0 ? 'HIGH' : maxProb >= dynamicThreshold ? 'MEDIUM' : 'LOW';
      return {
        maxProbability: round2(maxProb),
        confidenceTier: tier,
        dynamicThreshold: round2(dynamicThreshold),
        isHighConfidence: maxProb >= 70.0,
        shouldPredict: true,
      };
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
      // Top5 skor: Poisson (analitik) tercih edilir
      const top5Poisson = prediction.top5Scores;
      const top5Sim = simDist.scoreFrequency
        ? Object.entries(simDist.scoreFrequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([score, pct]) => ({ score, probability: pct }))
        : null;

      // ── Predicted Score Alignment ──
      // Poisson'un en olası TEK skoru (ör. 1-1) beklenen sonuçla (ör. Away Win)
      // çelişebilir. Kullanıcı için tutarlılık sağlamak adına predicted score'u
      // beklenen sonuç kategorisine uyumlu en olası skorla değiştiriyoruz.
      const hw = prediction.homeWinProbability ?? 0;
      const dw = prediction.drawProbability ?? 0;
      const aw = prediction.awayWinProbability ?? 0;
      const maxP = Math.max(hw, dw, aw);
      const dominantOutcome = maxP === hw ? 'home' : maxP === aw ? 'away' : 'draw';

      let alignedScore = poissonTopScore;
      if (poissonTopScore && top5Poisson?.length > 0) {
        const [pH, pA] = poissonTopScore.split('-').map(Number);
        const poissonOutcome = pH > pA ? 'home' : pH < pA ? 'away' : 'draw';
        
        if (poissonOutcome !== dominantOutcome) {
          // Poisson top5'ten dominant sonuçla uyumlu en olası skoru bul
          const matchingScore = top5Poisson.find(s => {
            const [h, a] = s.score.split('-').map(Number);
            if (dominantOutcome === 'home') return h > a;
            if (dominantOutcome === 'away') return a > h;
            return h === a;
          });
          if (matchingScore) {
            alignedScore = matchingScore.score;
          }
        }
      }

      return {
        predicted: alignedScore,
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
      // Mix ağırlığı: Poisson lambda kalibrasyonu sonrası ikisi daha yakın çalışır.
      // Simülasyon toplam gol ortalaması gerçeğe yakın → simülasyon ağırlığı biraz yüksek tutulur.
      // pW_goals dinamik: leagueFingerprint.reliability yüksekse Poisson kalibrasyonuna daha az
      // güven, simülasyon biraz daha ağır. reliability null/düşükse eşit ağırlık.
      const _lfRel_goals = leagueFingerprint?.reliability ?? 0;
      const pW_goals = 0.50 - (_lfRel_goals * 0.10); // [0.40, 0.50] aralığı — reliability arttıkça Poisson hafif azalır
      const sW_goals = 1.0 - pW_goals;

      const mix = (p, s) => (p != null && s != null) ? (p * pW_goals + s * sW_goals) : (p ?? s);

      const over15val = mix(prediction.over15, simDist.over15);
      const over25val = mix(prediction.over25, simDist.over25);
      const bttsVal = mix(prediction.btts, simDist.btts);
      const over35val = prediction.over35; // Poisson only, Sim doesn't calculate O3.5 explicitly

      // ── Öneri C: Over/Under 2.5 Dinamik Eşik ─────────────────────────────
      // Ligin gerçekleşen Over2.5 oranı + takım profillerinin oranından türetilir.
      // Eşiğin üzerinde kalan Over olasılığı istatistiksel olarak anlamlı bir "over" sinyali.
      // Tüm kaynaklar null ise → 50.0 (mevcut sabit davranışa düşülür).
      //
      // Formül (ağırlıklı ortalama, örneklem güveni orantılı):
      //   - leagueFingerprint.over25Rate × (reliability × 20) ağırlıkla
      //   - homeScoreProfile.over25Rate × n_home ağırlıkla
      //   - awayScoreProfile.over25Rate × n_away ağırlıkla
      //   - matchScoreProfile.over25Rate × (n_match × 2) ağırlıkla (H2H en güçlü sinyal)
      // Doğru alan adları: leagueFingerprint.leagueOver25Rate, leagueFingerprint.leagueBTTSRate
      // matchScoreProfile.bttsRate ve over25Rate alanı yoktur — jointDist'ten hesaplanır
      const _lfRel_ou = leagueFingerprint?.reliability ?? 0;

      // matchScoreProfile'dan Over25 ve BTTS oranlarını jointDist üzerinden hesapla
      const _matchOver25Rate = (() => {
        if (!matchScoreProfile?.jointDist || (matchScoreProfile.n || 0) < 2) return null;
        const total = Object.values(matchScoreProfile.jointDist).reduce((s, v) => s + v, 0);
        if (total <= 0) return null;
        const over25W = Object.entries(matchScoreProfile.jointDist)
          .filter(([score]) => { const [h, a] = score.split('-').map(Number); return h + a > 2.5; })
          .reduce((s, [, v]) => s + v, 0);
        return over25W / total;
      })();
      const _matchBTTSRate = (() => {
        if (!matchScoreProfile?.jointDist || (matchScoreProfile.n || 0) < 2) return null;
        const total = Object.values(matchScoreProfile.jointDist).reduce((s, v) => s + v, 0);
        if (total <= 0) return null;
        const bttsW = Object.entries(matchScoreProfile.jointDist)
          .filter(([score]) => { const [h, a] = score.split('-').map(Number); return h > 0 && a > 0; })
          .reduce((s, [, v]) => s + v, 0);
        return bttsW / total;
      })();

      const _ou25Sources = [];
      const _lfOver25 = leagueFingerprint?.leagueOver25Rate; // doğru alan adı
      if (_lfOver25 != null && _lfRel_ou > 0.2) {
        _ou25Sources.push({ val: _lfOver25 * 100, w: _lfRel_ou * 20 });
      }
      if (homeScoreProfile?.over25Rate != null && (homeScoreProfile.n || 0) >= 3) {
        _ou25Sources.push({ val: homeScoreProfile.over25Rate * 100, w: homeScoreProfile.n });
      }
      if (awayScoreProfile?.over25Rate != null && (awayScoreProfile.n || 0) >= 3) {
        _ou25Sources.push({ val: awayScoreProfile.over25Rate * 100, w: awayScoreProfile.n });
      }
      if (_matchOver25Rate != null && (matchScoreProfile.n || 0) >= 2) {
        // H2H Over25 oranı: bu iki takımın birlikte geçmişi — en güçlü sinyal
        _ou25Sources.push({ val: _matchOver25Rate * 100, w: matchScoreProfile.n * 2 });
      }
      let over25DynamicThreshold = 50.0; // default: mevcut davranış
      if (_ou25Sources.length > 0) {
        const _ouTotalW = _ou25Sources.reduce((s, x) => s + x.w, 0);
        const _ouBlend = _ou25Sources.reduce((s, x) => s + x.val * x.w, 0) / _ouTotalW;
        // Eşik = ligin/takımın gerçekleşen oranı. %40–%65 aralığında tutulur (güvenlik sınırı).
        over25DynamicThreshold = Math.max(40.0, Math.min(65.0, _ouBlend));
      }

      // ── Öneri D: KG (BTTS) Dinamik Eşik ──────────────────────────────────
      // Aynı mantık — ligin + takımların + H2H'nin gerçekleşen BTTS oranından türetilir.
      // Ek sinyal: her iki takımın gol atma oranlarının geometrik ortalaması
      // (sqrt(homeScoring × awayScoring)) — iki takım da gol atar mı sorusuna takım bazlı yanıt.
      const _bttsTeamSignal = (homeScoreProfile?.scoringRate != null && awayScoreProfile?.scoringRate != null)
        ? Math.sqrt(homeScoreProfile.scoringRate * awayScoreProfile.scoringRate) * 100
        : null;

      const _bttsSources = [];
      const _lfBTTS = leagueFingerprint?.leagueBTTSRate; // doğru alan adı
      if (_lfBTTS != null && _lfRel_ou > 0.2) {
        _bttsSources.push({ val: _lfBTTS * 100, w: _lfRel_ou * 20 });
      }
      if (homeScoreProfile?.bttsRate != null && (homeScoreProfile.n || 0) >= 3) {
        _bttsSources.push({ val: homeScoreProfile.bttsRate * 100, w: homeScoreProfile.n });
      }
      if (awayScoreProfile?.bttsRate != null && (awayScoreProfile.n || 0) >= 3) {
        _bttsSources.push({ val: awayScoreProfile.bttsRate * 100, w: awayScoreProfile.n });
      }
      if (_matchBTTSRate != null && (matchScoreProfile.n || 0) >= 2) {
        // H2H BTTS oranı: bu iki takımın birlikte gerçekleşen BTTS — en güçlü sinyal
        _bttsSources.push({ val: _matchBTTSRate * 100, w: matchScoreProfile.n * 2 });
      }
      if (_bttsTeamSignal != null) {
        // Takım çifti gol atma kapasitesi — scoring rate geometrik ortalaması
        const _teamN = Math.min(homeScoreProfile?.n || 0, awayScoreProfile?.n || 0);
        if (_teamN >= 3) _bttsSources.push({ val: _bttsTeamSignal, w: _teamN * 0.5 });
      }
      let bttsDynamicThreshold = 50.0; // default: mevcut davranış
      if (_bttsSources.length > 0) {
        const _bttsTotalW = _bttsSources.reduce((s, x) => s + x.w, 0);
        const _bttsBlend = _bttsSources.reduce((s, x) => s + x.val * x.w, 0) / _bttsTotalW;
        bttsDynamicThreshold = Math.max(35.0, Math.min(70.0, _bttsBlend));
      }

      return {
        over15: over15val,
        over25: over25val,
        over35: over35val,
        under15: over15val != null ? round2(100 - over15val) : null,
        under25: over25val != null ? round2(100 - over25val) : null,
        under35: over35val != null ? round2(100 - over35val) : null,
        btts: bttsVal,
        bttsNo: bttsVal != null ? round2(100 - bttsVal) : null,
        // Dinamik eşikler — UI ve backtest bu değerleri kullanarak "Over/Under" ve "KG var/yok" kararı verebilir
        over25DynamicThreshold: round2(over25DynamicThreshold),
        bttsDynamicThreshold: round2(bttsDynamicThreshold),
      };
    })(),

    // İlk yarı tahmini (lambda bazlı geliştirilmiş)
    firstHalf: generateFirstHalfPrediction(home, away, prediction, baseline),

    // Korner tahmini
    corners: generateCornerPrediction(home, away, shared, baseline),

    // Kart tahmini
    cards: generateCardPrediction(home, away, shared, baseline),

    // ── Simülasyon İlk Yarı Dağılımı ─────────────────────────────────────
    firstHalfSimulation: (() => {
      const htDist = simulation.distribution.ht;
      if (!htDist) return null;
      return {
        homeWin: htDist.homeWin,
        draw: htDist.draw,
        awayWin: htDist.awayWin,
        avgHomeGoals: htDist.avgHomeGoals,
        avgAwayGoals: htDist.avgAwayGoals,
        topScore: htDist.topScore,
        scoreFrequency: htDist.scoreFrequency,
      };
    })(),

    // ── HT/FT 9-Sınıflı Market ────────────────────────────────────────────
    // P(HT=i, FT=j) için 9 kombinasyon: 1/1, 1/X, 1/2, X/1, X/X, X/2, 2/1, 2/X, 2/2
    // Yaklaşım: P(HT=i) × P(FT=j | HT=i)
    //   P(FT=j | HT=home) ≈ daha güçlü home lehine dağılım (öne geçen takım korunma eğilimi)
    //   P(FT=j | HT=draw) ≈ normal FT dağılımı
    //   P(FT=j | HT=away) ≈ daha güçlü away lehine dağılım
    htft: (() => {
      const htDist = simulation.distribution.ht;
      const ftDist = simulation.distribution;
      if (!htDist) return null;

      const pHT1 = (htDist.homeWin || 0) / 100;
      const pHTX = (htDist.draw || 0) / 100;
      const pHT2 = (htDist.awayWin || 0) / 100;
      const pFT1 = (ftDist.homeWin || 0) / 100;
      const pFTX = (ftDist.draw || 0) / 100;
      const pFT2 = (ftDist.awayWin || 0) / 100;

      // Conditional FT probs given HT outcome (simplified state-conditioned)
      // Öndeki takım savunmaya çekilir: FT2|HT1 düşer, FT1|HT1 yükselir
      // Ayar miktarı doğrudan CV'den: volatil ligde yarı zaman sonucu daha az belirleyici
      const _dynAdj = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
        ? baseline.leagueGoalVolatility / (baseline.leagueAvgGoals + baseline.leagueGoalVolatility)
        : null;
      const condFT = (htResult) => {
        const adj = _dynAdj ?? 0; // veri yoksa ayar yok (HT→FT koşullu etki skip)
        if (adj === 0) return { ft1: pFT1, ftX: pFTX, ft2: pFT2 };
        if (htResult === 'home') return { ft1: pFT1 + adj, ftX: Math.max(0, pFTX - adj/2), ft2: Math.max(0, pFT2 - adj/2) };
        if (htResult === 'away') return { ft1: Math.max(0, pFT1 - adj/2), ftX: Math.max(0, pFTX - adj/2), ft2: pFT2 + adj };
        return { ft1: pFT1, ftX: pFTX, ft2: pFT2 };
      };
      const normalize = (o) => { const s = o.ft1+o.ftX+o.ft2; return { ft1: o.ft1/s, ftX: o.ftX/s, ft2: o.ft2/s }; };

      const c1 = normalize(condFT('home'));
      const cX = normalize(condFT('draw'));
      const c2 = normalize(condFT('away'));

      const probs = {
        '1/1': round2(pHT1 * c1.ft1 * 100),
        '1/X': round2(pHT1 * c1.ftX * 100),
        '1/2': round2(pHT1 * c1.ft2 * 100),
        'X/1': round2(pHTX * cX.ft1 * 100),
        'X/X': round2(pHTX * cX.ftX * 100),
        'X/2': round2(pHTX * cX.ft2 * 100),
        '2/1': round2(pHT2 * c2.ft1 * 100),
        '2/X': round2(pHT2 * c2.ftX * 100),
        '2/2': round2(pHT2 * c2.ft2 * 100),
      };
      const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
      return { probs, top1: sorted[0]?.[0], top3: sorted.slice(0, 3).map(([k, v]) => ({ result: k, prob: v })) };
    })(),

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
    comparison: (() => {
      // LQR: kadro kalite oranı (Workshop'ta kadro değiştiğinde 1.0'dan farklı olur)
      const hLQR = baseline?.homeLineupQualityRatio ?? 1.0;
      const aLQR = baseline?.awayLineupQualityRatio ?? 1.0;

      // Bölgesel Kadro Etkisi (ZQM): Her güç metriğini ilgili bölge oranıyla modifiye et
      const { computeBlockZoneModifier } = require('./lineup-impact');
      const hZQR = baseline?.homeZoneQualityRatios ?? { G: 1.0, D: 1.0, M: 1.0, F: 1.0 };
      const aZQR = baseline?.awayZoneQualityRatios ?? { G: 1.0, D: 1.0, M: 1.0, F: 1.0 };
      const hDynW = baseline?.homeDynamicBlockWeights ?? null;
      const aDynW = baseline?.awayDynamicBlockWeights ?? null;

      // Her güç metriği için ilgili blok üzerinden bölge modifiyesi hesapla
      const hAtkMod = computeBlockZoneModifier('BITIRICILIK', hZQR, hLQR, hDynW);    // ATK zone
      const hDefMod = computeBlockZoneModifier('SAVUNMA_DIRENCI', hZQR, hLQR, hDynW); // DEF zone
      const hGkMod  = computeBlockZoneModifier('GK_REFLEKS', hZQR, hLQR, hDynW);      // GK zone
      // Overall: tüm bölgelerin ağırlıklı bileşimi
      const hOverallMod = Math.sqrt(hAtkMod * hDefMod); // atk-def geometrik ortalama

      const aAtkMod = computeBlockZoneModifier('BITIRICILIK', aZQR, aLQR, aDynW);
      const aDefMod = computeBlockZoneModifier('SAVUNMA_DIRENCI', aZQR, aLQR, aDynW);
      const aGkMod  = computeBlockZoneModifier('GK_REFLEKS', aZQR, aLQR, aDynW);
      const aOverallMod = Math.sqrt(aAtkMod * aDefMod);

      return {
        home: {
          attackPower: round2((home.compositeScores.M156 ?? 0) * hAtkMod),
          defensePower: round2((home.compositeScores.M157 ?? 0) * hDefMod),
          form: round2(home.compositeScores.M158),  // Form kadrodan etkilenmez
          playerQuality: round2((home.compositeScores.M159 ?? 0) * hLQR), // Direkt LQR (tam etki)
          goalkeeperPower: round2((home.compositeScores.M160 ?? 0) * hGkMod),
          momentum: round2(home.compositeScores.M164),  // Momentum kadrodan etkilenmez
          overallPower: round2((home.compositeScores.M166 ?? 0) * hOverallMod),
          lineupQualityRatio: round2(hLQR * 100) / 100,
          zoneQualityRatios: hZQR,
        },
        away: {
          attackPower: round2((away.compositeScores.M156 ?? 0) * aAtkMod),
          defensePower: round2((away.compositeScores.M157 ?? 0) * aDefMod),
          form: round2(away.compositeScores.M158),
          playerQuality: round2((away.compositeScores.M159 ?? 0) * aLQR),
          goalkeeperPower: round2((away.compositeScores.M160 ?? 0) * aGkMod),
          momentum: round2(away.compositeScores.M164),
          overallPower: round2((away.compositeScores.M166 ?? 0) * aOverallMod),
          lineupQualityRatio: round2(aLQR * 100) / 100,
          zoneQualityRatios: aZQR,
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
      };
    })(),

    // UI_CFG-Specific: Detaylı Analiz & Zaman Çizelgesi
    analysis: {
      goalPeriods: {
        home: calculateGoalPeriods(home),
        away: calculateGoalPeriods(away),
      },
      hotZones: calculateHotZones(home, away),
      probabilities: {
        penaltyChance: calculatePenaltyChance(home, away, shared, baseline, data),
        redCardChance: calculateRedCardChance(home, away, shared, baseline, data),
        surpriseIndex: calculateSurpriseIndex(prediction, shared.contextual, baseline),
      },
      // ── Market Intelligence — Shin fair probs, opening/closing, ΔMarketMove ──
      marketIntelligence: (() => {
        const ctx = shared.contextual || {};
        const hasClosing = ctx.M131 != null;
        const hasOpening = ctx._meta?.openingOddsAvailable;
        return {
          // Shin-dönüşümlü kapanış fair probability (%)
          closingFairHome: hasClosing ? round2(ctx.M131) : null,
          closingFairDraw: hasClosing ? round2(ctx.M132) : null,
          closingFairAway: hasClosing ? round2(ctx.M133) : null,
          // Shin-dönüşümlü açılış fair probability (%)
          openingFairHome: hasOpening ? round2(ctx._meta.openingHome) : null,
          openingFairDraw: hasOpening ? round2(ctx._meta.openingDraw) : null,
          openingFairAway: hasOpening ? round2(ctx._meta.openingAway) : null,
          // ΔMarketMove: logit(close) - logit(open) — pozitif = o yöne hareket
          marketMoveHome: ctx.M188 != null ? round2(ctx.M188) : null,
          marketMoveAway: ctx.M189 != null ? round2(ctx.M189) : null,
          // Meta
          hasOdds: hasClosing,
          hasOpeningOdds: !!hasOpening,
          // Ham decimal kapanış oranları
          rawOddsHome: ctx._meta?.rawOdds?.home ?? null,
          rawOddsDraw: ctx._meta?.rawOdds?.draw ?? null,
          rawOddsAway: ctx._meta?.rawOdds?.away ?? null,
          // Ham decimal açılış oranları
          rawOpenOddsHome: ctx._meta?.rawOpenOdds?.home ?? null,
          rawOpenOddsDraw: ctx._meta?.rawOpenOdds?.draw ?? null,
          rawOpenOddsAway: ctx._meta?.rawOpenOdds?.away ?? null,
          // Oran değişim sinyalleri
          oddsChange: ctx._meta?.oddsChange ?? null,
          // Oran farkı (kapanış - açılış) — pozitif = oran yükseldi (daha az favori)
          oddsDrift: (() => {
            const ro = ctx._meta?.rawOdds;
            const roo = ctx._meta?.rawOpenOdds;
            if (!ro || !roo) return null;
            return {
              home: ro.home != null && roo.home != null ? +(ro.home - roo.home).toFixed(2) : null,
              draw: ro.draw != null && roo.draw != null ? +(ro.draw - roo.draw).toFixed(2) : null,
              away: ro.away != null && roo.away != null ? +(ro.away - roo.away).toFixed(2) : null,
            };
          })(),
          // Oran hareketi (para akışı sinyali)
          oddsMovement: ctx._meta?.oddsMovement ?? null,
          // Tüm marketler (genişletilmiş bahis paneli)
          allMarkets: ctx._meta?.allMarkets ?? null,
        };
      })(),
      // ── Context Intelligence — baskı, direnç, sürpriz, bölge, taktik, fikstür ──
      contextIntelligence: (() => {
        const ctx = shared.contextual || {};
        const meta = ctx._meta || {};
        return {
          // ResistanceIndex
          resistanceHome: ctx.M186 != null ? round2(ctx.M186) : null,
          resistanceAway: ctx.M187 != null ? round2(ctx.M187) : null,
          // Küme düşme baskısı
          relegationPressureHome: ctx.M180 != null ? round2(ctx.M180) : null,
          relegationPressureAway: ctx.M181 != null ? round2(ctx.M181) : null,
          // Şampiyonluk/Avrupa baskısı
          titlePressureHome: ctx.M182 != null ? round2(ctx.M182) : null,
          titlePressureAway: ctx.M183 != null ? round2(ctx.M183) : null,
          // Tablo sıkışıklığı
          tableCompressionHome: ctx.M184 != null ? round2(ctx.M184) : null,
          tableCompressionAway: ctx.M185 != null ? round2(ctx.M185) : null,
          // Güç Dengesi
          powerBalance: ctx.M174 != null ? round2(ctx.M174) : null,
          // Sezon ilerlemesi
          seasonProgress: ctx.M141 != null ? round2(ctx.M141) : null,
          // ── Bölge Detayı ──
          homeZone: meta.homeZone ?? null,
          awayZone: meta.awayZone ?? null,
          homeZoneRaw: meta.homeZoneRaw ?? null,
          awayZoneRaw: meta.awayZoneRaw ?? null,
          // ── Fikstür Yoğunluğu (maçlar arası ortalama gün) ──
          fixtureCongestHome: meta.fixtureCongest?.home ?? null,
          fixtureCongestAway: meta.fixtureCongest?.away ?? null,
          // ── Taktik & Pressing ──
          tacticalDominance: meta.tacticalDominance != null ? round2(meta.tacticalDominance) : null,
          tacticalAdaptation: meta.tacticalAdaptation != null ? round2(meta.tacticalAdaptation) : null,
          pressingHome: meta.pressing?.home?.intensity != null ? round2(meta.pressing.home.intensity) : null,
          pressingAway: meta.pressing?.away?.intensity != null ? round2(meta.pressing.away.intensity) : null,
          territoryHome: meta.pressing?.home?.territory != null ? round2(meta.pressing.home.territory) : null,
          territoryAway: meta.pressing?.away?.territory != null ? round2(meta.pressing.away.territory) : null,
          // ── Menajer ──
          managerExperience: meta.managerExperience != null ? round2(meta.managerExperience) : null,
          managerWinRate: meta.managerWinRate != null ? round2(meta.managerWinRate) : null,
          // ── Formasyon Çakışma (50=eşit, >50=ev üstün mid) ──
          formationClash: meta.formationClash != null ? round2(meta.formationClash) : null,
          // ── Sıralama & Transfer ──
          rankAdvantage: meta.rankAdvantage != null ? round2(meta.rankAdvantage) : null,
          leagueStrength: meta.leagueStrength != null ? round2(meta.leagueStrength) : null,
          transferValue: meta.transferValue != null ? round2(meta.transferValue) : null,
          pointDiff: meta.pointDiff ?? null,
          posDiff: meta.posDiff != null ? round2(meta.posDiff) : null,
          // Turnuva yoğunluğu
          tournamentIntensity: meta.tournamentIntensity != null ? round2(meta.tournamentIntensity) : null,
          // Stadyum kapasitesi etkisi
          stadiumCapacity: meta.stadiumCapacity != null ? round2(meta.stadiumCapacity) : null,
        };
      })(),
      // ── Votes — Kullanıcı Oylamaları ──
      votes: (() => {
        const meta = shared.contextual?._meta || {};
        return meta.votes ?? null;
      })(),
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

    // ── Poisson-Only Sonucu (Hibrit blend öncesi saf Poisson/Dixon-Coles) ──
    // Backtest'te Poisson vs Simülasyon vs Hibrit karşılaştırması için ayrı izlenir.
    // prediction nesnesindeki değerler Poisson'ın hesapladığı olasılıkları taşır.
    poissonResult: (() => {
      const ph = prediction.homeWinProbability ?? null;
      const pd = prediction.drawProbability ?? null;
      const pa = prediction.awayWinProbability ?? null;
      if (ph == null) return null;
      const predicted = ph >= pd && ph >= pa ? '1' : pa >= pd ? '2' : 'X';
      return {
        homeWin: round2(ph),
        draw: round2(pd),
        awayWin: round2(pa),
        predicted,
        lambdaHome: prediction.lambdaHome ?? null,
        lambdaAway: prediction.lambdaAway ?? null,
        topScore: prediction.mostLikelyScore ?? null,
        source: 'Poisson/Dixon-Coles',
      };
    })(),

    // ── Simülasyon-Only Sonucu (saf MC dağılımı, blend öncesi) ──
    simulationResult: (() => {
      const simDist = simulation.distribution;
      const ph = simDist.homeWin ?? null;
      const pd = simDist.draw ?? null;
      const pa = simDist.awayWin ?? null;
      if (ph == null) return null;
      const predicted = ph >= pd && ph >= pa ? '1' : pa >= pd ? '2' : 'X';
      return {
        homeWin: round2(ph),
        draw: round2(pd),
        awayWin: round2(pa),
        predicted,
        avgGoals: simDist.avgGoals ?? null,
        over25: simDist.over25 ?? null,
        btts: simDist.btts ?? null,
        source: 'Monte Carlo Simulation',
      };
    })(),

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
          bttsMessages.push(`BTTS Edge: ${t} (${(tData.accBTTS * 100).toFixed(0)}% historic acc). Multiplier: ${m.toFixed(2)}x.`);
        } else if (tData.accBTTS < 0.50 && tData.n >= 2 && report.goals.btts > 50) {
          const m = 0.50 + tData.accBTTS;
          bttsMultipliers.push(m);
          bttsMessages.push(`BTTS Warning: ${t} (${(tData.accBTTS * 100).toFixed(0)}% acc). Multiplier: ${m.toFixed(2)}x.`);
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
  } catch (e) {
    console.error("[PredictionGenerator] Edge DB application failed:", e.message);
  }

  // ── NaN/Infinity Sanitizer ─────────────────────────────────────────────────
  // API verisi eksik veya sıfıra bölme durumunda NaN/Infinity sızabilir.
  // Tüm sayısal çıktıları tarayıp null'a çeviriyoruz — sessiz hata yerine açık yokluk.
  const sanitize = (obj) => {
    if (obj == null || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (typeof v === 'number' && (!isFinite(v) || isNaN(v))) {
        obj[key] = null;
      } else if (typeof v === 'object' && v !== null) {
        sanitize(v);
      }
    }
    return obj;
  };
  sanitize(report);

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

function generateFirstHalfPrediction(home, away, poissonPrediction, baseline) {
  // ── İlk Yarı Tahmini (Lambda Bazlı Geliştirilmiş) ──
  // Öncelik: FT lambda × HT gol fraksiyonu (M003)
  // Fallback: M003 direkt kullanımı (maç başı HT gol ortalaması)
  //
  // KRİTİK: M003 = firstHalfGoals / totalGoals → 0-1 aralığında fraction
  // YANLIŞ: M003 / 100 (→ 0.006, neredeyse sıfır lambda)
  // DOĞRU:  M003 direkt (→ 0.6, %60 gol ilk yarıda, lambda × 0.6 = gerçekçi HT lambda)
  const homeHTFrac = home.attack.M003 ?? null;  // 0-1 fraction, /100 YAPMA
  const awayHTFrac = away.attack.M003 ?? null;
  
  const _dynHT = (baseline?.dynamicAvgs?.M005 != null && baseline?.dynamicAvgs?.M006 != null && baseline?.dynamicAvgs?.M007 != null)
    ? (baseline.dynamicAvgs.M005 + baseline.dynamicAvgs.M006 + baseline.dynamicAvgs.M007) / 100
    : null;

  const avgHTFrac = (homeHTFrac != null && awayHTFrac != null)
    ? (homeHTFrac + awayHTFrac) / 2
    : (homeHTFrac ?? awayHTFrac ?? _dynHT); // futbol geneli lig ortalaması veya %45

  // Tam maç lambda varsa HT lambda = FT lambda × HT fraksiyonu
  const lambdaH = poissonPrediction?.lambdaHome ?? null;
  const lambdaA = poissonPrediction?.lambdaAway ?? null;

  let hHT, aHT, source;
  if (lambdaH != null && lambdaA != null && lambdaH > 0 && lambdaA > 0) {
    hHT = lambdaH * avgHTFrac;
    aHT = lambdaA * avgHTFrac;
    source = 'lambda_scaled';
  } else {
    // Fallback: periyot metrikleri
    const homeHTGoal = home.attack.M003 ?? null;
    const awayHTGoal = away.attack.M003 ?? null;
    if (homeHTGoal == null && awayHTGoal == null) {
      return { expectedHomeGoals: null, expectedAwayGoals: null, over05HT: null, over15HT: null, htResult: null, source: 'no_data' };
    }
    hHT = homeHTGoal ?? ND.COUNTER_INIT;
    aHT = awayHTGoal ?? ND.COUNTER_INIT;
    source = 'period_metrics';
  }

  const totalHTGoals = hHT + aHT;
  const pOver05 = totalHTGoals > 0 ? (1 - Math.exp(-totalHTGoals)) * 100 : 0;
  const pOver15 = totalHTGoals > 0
    ? (1 - Math.exp(-totalHTGoals) * (1 + totalHTGoals)) * 100 : 0;

  // HT 1X2 via bivariate Poisson approximation
  // P(Home wins HT) = Σ_{h>a} P(h) × P(a)
  const htHomeWin = (() => {
    let p = 0;
    for (let h = 1; h <= 6; h++) {
      for (let a = 0; a < h; a++) {
        p += poissonPMF(hHT, h) * poissonPMF(aHT, a);
      }
    }
    return p;
  })();
  const htAwayWin = (() => {
    let p = 0;
    for (let a = 1; a <= 6; a++) {
      for (let h = 0; h < a; h++) {
        p += poissonPMF(hHT, h) * poissonPMF(aHT, a);
      }
    }
    return p;
  })();
  const htDraw = Math.max(0, 1 - htHomeWin - htAwayWin);

  return {
    expectedHomeGoals: round2(hHT),
    expectedAwayGoals: round2(aHT),
    over05HT: round2(Math.min(UI_CFG.MAX_UI_PROB, pOver05)),
    over15HT: round2(Math.min(UI_CFG.O15_CAP, pOver15)),
    htResult: hHT > aHT + UI_CFG.HT_RESULT_THRESHOLD ? '1' : aHT > hHT + UI_CFG.HT_RESULT_THRESHOLD ? '2' : 'X',
    htHomeWin: round2(htHomeWin * 100),
    htDraw: round2(htDraw * 100),
    htAwayWin: round2(htAwayWin * 100),
    htFraction: round2(avgHTFrac * 100),
    source,
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
    const _cv = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
      ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
    if (_cv != null) {
      const cornerStd = lgCornerTotal * _cv;
      cL = Math.round((lgCornerTotal - cornerStd) * 2) / 2;
      cM = Math.round(lgCornerTotal * 2) / 2;
      cH = Math.round((lgCornerTotal + cornerStd) * 2) / 2;
    } else {
      cM = Math.round(lgCornerTotal * 2) / 2;
      cL = cM - 1; cH = cM + 1;
    }
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
    const _cv = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
      ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
    if (_cv != null) {
      const cardStd = lgCardTotal * Math.min(0.40, _cv * 1.5);
      cardL = Math.round((lgCardTotal - cardStd) * 2) / 2;
      cardH = Math.round((lgCardTotal + cardStd) * 2) / 2;
    } else {
      const mid = Math.round(lgCardTotal * 2) / 2;
      cardL = mid - 0.5; cardH = mid + 0.5;
    }
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
      ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
    const _reqSample = _cvH2H != null ? Math.max(4, 10 * _cvH2H) : 4;
    const h2hReliability = Math.min(1.0, totalH2H / _reqSample);

    const favH2HWins = favModel === 'home' ? homeH2HWins : (favModel === 'away' ? awayH2HWins : Math.max(homeH2HWins, awayH2HWins));
    const h2hRatio = totalH2H > 0 ? favH2HWins / totalH2H : 0;

    // Nötr beraberlik oranından türeyen dominans eşiği
    const _neutralWinProb = (baseline?.dynamicAvgs?.M131 != null && baseline?.dynamicAvgs?.M133 != null)
      ? (baseline.dynamicAvgs.M131 + baseline.dynamicAvgs.M133) / 200
      : ((baseline?.medianGoalRate != null && baseline?.leagueAvgGoals > 0)
          ? (baseline.medianGoalRate / (baseline.leagueAvgGoals * 2))
          : 0.35);
    // Maksimum bonus lig gol averajından türeyen volatilite katsayısına bağlanır
    if (baseline.leagueAvgGoals == null) { /* veri yok → H2H bonusu skip */ }
    else {
    const _maxBonus = baseline.leagueAvgGoals * 10 * (1 + _cvH2H);

    const h2hBonus = (h2hRatio - _neutralWinProb) * _maxBonus * h2hReliability;
    baseConfidence += h2hBonus;
    } // end leagueAvgGoals null guard
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
    if (baseline.leagueAvgGoals != null) {
      const _injPenaltyScale = baseline.leagueAvgGoals * (1 + _injThresh);
      baseConfidence -= maxInjuryImpact * _injPenaltyScale * depthMultiplier;
    }
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
    : null;
  // Volatil ligde verinin eksikliği daha çok cezalandırılır.
  if (baseline.leagueAvgGoals != null && _cvCompleteness != null) {
    const _completenessScale = baseline.leagueAvgGoals * 10 * _cvCompleteness;
    // completeness 0.5 nötr noktası matematiksel bir simetridir (0-1 arasında)
    baseConfidence += (dataCompleteness - 0.5) * _completenessScale;
  }

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

function calculatePenaltyChance(home, away, shared, baseline, data) {
  const teamFreq = (home.attack.M019 ?? ND.COUNTER_INIT) + (away.attack.M019 ?? ND.COUNTER_INIT);
  const refFreq = shared.referee.M111 ?? null;

  // Oyuncu bazlı penaltyWon/penaltyConceded — doğrudan API'den
  const _sumPlayerPenStat = (side, statKey) => {
    const lineup = side === 'home' ? data?.lineups?.home : data?.lineups?.away;
    const starters = (lineup?.players || []).filter(p => !p.substitute).slice(0, 11);
    let total = 0, apps = 0;
    for (const p of starters) {
      const ps = p.player?.statistics || p.player?.seasonStats?.statistics || {};
      if (ps[statKey] != null) total += ps[statKey];
      if (ps.appearances != null) apps += ps.appearances;
    }
    return apps > 0 ? total / apps : 0;
  };
  const playerPenWon = _sumPlayerPenStat('home', 'penaltyWon') + _sumPlayerPenStat('away', 'penaltyWon');
  const playerPenConc = _sumPlayerPenStat('home', 'penaltyConceded') + _sumPlayerPenStat('away', 'penaltyConceded');
  const playerPenSignal = playerPenWon + playerPenConc;

  if (teamFreq === 0 && refFreq == null && playerPenSignal === 0) return null;

  const _hasRefPenData = (refFreq ?? null) != null;

  // Veri kaynakları: takimFreq + hakemFreq + oyuncuPen — mevcut veriler eşit ağırlıklı
  const sources = [];
  if (teamFreq > 0) sources.push(teamFreq);
  if (_hasRefPenData) sources.push((refFreq ?? 0) * 90);
  if (playerPenSignal > 0) sources.push(playerPenSignal);

  const chanceRaw = sources.length > 0 ? sources.reduce((a, b) => a + b, 0) / sources.length : 0;

  // Lig ortalaması penaltı/maç — tamamen dinamik
  const _penMatchAvg = (baseline?.dynamicAvgs?.M019 != null && baseline?.dynamicAvgs?.M019 > 0)
    ? baseline.dynamicAvgs.M019 * 2
    : (baseline?.penPerMatch != null && baseline?.penPerMatch > 0)
      ? baseline.penPerMatch * 2
      : null;

  if (_penMatchAvg == null) {
    // Lig ortalaması bile yoksa sadece raw döndür, tier belirleyemeyiz
    return { tier: 'Unknown', raw: round2(chanceRaw), avg: null };
  }

  // Tier eşikleri: lig ortalamasına göre z-score mantığı
  // raw > avg × 1.5 → High, raw > avg × 0.8 → Medium, diğer → Low
  // Bu eşikler veriden türetilemez çünkü sınıflandırma doğası gereği eşik gerektirir.
  // Ama eşikler lig volatilitesine bağlı olarak ayarlanır:
  const cv = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  // Tier eşikleri: lig volatilitesinden türetilir
  // Yüksek CV = daha geniş band (high için daha yüksek, med için daha düşük çarpan)
  const highMult = cv != null ? (1 + cv) : null;
  const medMult = cv != null ? (1 - cv) : null;

  let tier;
  if (highMult != null) {
    tier = chanceRaw > _penMatchAvg * highMult ? 'High' : chanceRaw > _penMatchAvg * medMult ? 'Medium' : 'Low';
  } else {
    tier = chanceRaw > _penMatchAvg ? 'High' : chanceRaw > _penMatchAvg / 2 ? 'Medium' : 'Low';
  }
  return { tier, raw: round2(chanceRaw), avg: round2(_penMatchAvg) };
}

function calculateRedCardChance(home, away, shared, baseline, data) {
  const teamAgg = (home.defense.M040 ?? ND.COUNTER_INIT) + (away.defense.M040 ?? ND.COUNTER_INIT);
  const refAgg = shared.referee.M110 ?? null;

  // Oyuncu bazlı kart riski — yellowCards + fouls (ham API)
  const _sumPlayerCardRisk = (side) => {
    const lineup = side === 'home' ? data?.lineups?.home : data?.lineups?.away;
    const starters = (lineup?.players || []).filter(p => !p.substitute).slice(0, 11);
    let cards = 0, fouls = 0, apps = 0, totalFoulsForRatio = 0, totalCardsForRatio = 0;
    for (const p of starters) {
      const ps = p.player?.statistics || p.player?.seasonStats?.statistics || {};
      if (ps.yellowCards != null) { cards += ps.yellowCards; totalCardsForRatio += ps.yellowCards; }
      if (ps.redCards != null) cards += ps.redCards * 3; // Kırmızı 3 kart eşdeğeri (oyundan atılma)
      if (ps.fouls != null) { fouls += ps.fouls; totalFoulsForRatio += ps.fouls; }
      if (ps.appearances != null) apps += ps.appearances;
    }
    // Faul→kart dönüşüm oranı: oyuncuların kendi verilerinden
    const foulToCardRatio = totalFoulsForRatio > 0 ? totalCardsForRatio / totalFoulsForRatio : 0;
    return apps > 0 ? (cards + fouls * foulToCardRatio) / apps : 0;
  };
  const playerCardRisk = _sumPlayerCardRisk('home') + _sumPlayerCardRisk('away');

  if (teamAgg === 0 && refAgg == null && playerCardRisk === 0) return null;

  const _hasRefRedData = (refAgg ?? null) != null;

  // Veri kaynakları: takımAgg + hakemAgg + oyuncuKartRisk — mevcut veriler eşit ağırlıklı
  const sources = [];
  if (teamAgg > 0) sources.push(teamAgg);
  if (_hasRefRedData) sources.push((refAgg ?? 0) * 90);
  if (playerCardRisk > 0) sources.push(playerCardRisk);

  const chanceRaw = sources.length > 0 ? sources.reduce((a, b) => a + b, 0) / sources.length : 0;

  // Lig ortalaması kırmızı kart/maç — tamamen dinamik
  const _redMatchAvg = (baseline?.dynamicAvgs?.M040 != null && baseline?.dynamicAvgs?.M040 > 0)
    ? baseline.dynamicAvgs.M040 * 2
    : (baseline?.redPerMin != null && baseline?.redPerMin > 0)
      ? baseline.redPerMin * 90 * 2
      : null;

  if (_redMatchAvg == null) {
    return { tier: 'Unknown', raw: round2(chanceRaw), avg: null };
  }

  // Tier eşikleri: lig volatilitesine bağlı
  const cv = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  const highMult = cv != null ? (1 + cv) : null;
  const medMult = cv != null ? (1 - cv) : null;

  let tier;
  if (highMult != null) {
    tier = chanceRaw > _redMatchAvg * highMult ? 'High' : chanceRaw > _redMatchAvg * medMult ? 'Medium' : 'Low';
  } else {
    tier = chanceRaw > _redMatchAvg ? 'High' : chanceRaw > _redMatchAvg / 2 ? 'Medium' : 'Low';
  }
  return { tier, raw: round2(chanceRaw), avg: round2(_redMatchAvg) };
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
