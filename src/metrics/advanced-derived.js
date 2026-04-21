/**
 * Advanced Derived Metrics (M156–M168)
 * Bileşik skorlar, Poisson dağılımı, skor tahmini, kazanma olasılığı.
 */

const { poissonPMF, weightedAvg, clamp, round2 } = require('../engine/math-utils');
const { calculateUnitImpact, SIM_BLOCKS } = require('../engine/match-simulator');
const { SIM_CONFIG } = require('../engine/sim-config');
const { BLOCK_QF_MAP, computeAlpha, computeQualityFactors } = require('../engine/quality-factors');
const { blendScoreDistribution, loadScoreCalibration, applyScoreCalibration } = require('../engine/score-profile');

// Skor kalibrasyon parametrelerini başlangıçta yükle
let _scoreCalParams = null;
try { _scoreCalParams = loadScoreCalibration(); } catch (_) { _scoreCalParams = null; }

function calculateAdvancedMetrics(allMetrics) {
  const { homeAttack, awayAttack, homeDefense, awayDefense, homeForm, awayForm,
    homePlayer, awayPlayer, homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum, leagueAvgGoals: _leagueAvgGoals,
    homeFormation, awayFormation, homeMatchCount, awayMatchCount,
    homeFlat, awayFlat, sharedFlat, allMetricIds,
    dynamicAvgs, dynamicHomeAdvantage,
    homeXGScored, homeXGConceded, awayXGScored, awayXGConceded,
    homeStGF, homeStGA, awayStGF, awayStGA, homeStMatches, awayStMatches,
    homeMVBreakdown, awayMVBreakdown,
    homeScoreProfile, awayScoreProfile, matchScoreProfile,
    leagueFingerprint } = allMetrics;

  // leagueAvgGoals çözüm hiyerarşisi (statik sabit yasak — yalnızca API verisinden türetme):
  //   1. standings'ten doğrudan hesaplanan değer (_leagueAvgGoals)
  //   2. league-averages.js'ten hesaplanan M001 (dynamicAvgs.M001)
  //   3. İki takımın maç başı gol ortalamalarının ortalaması (team proxy)
  // Tüm kaynaklar null ise Poisson çalışmaz, score circle "-" gösterir.
  const teamGoalsProxy = (() => {
    const h = homeAttack?.M001 ?? homeAttack?.M002;
    const a = awayAttack?.M001 ?? awayAttack?.M002;
    if (h != null && a != null) return (h + a) / 2;
    return h ?? a ?? null;
  })();
  const leagueAvgGoals = _leagueAvgGoals ?? dynamicAvgs?.M001 ?? teamGoalsProxy ?? null;

  // 1. Calculate the 26 Behavioral Units for both teams
  // Peer-enhanced averages: dynamicAvgs'da bulunmayan metrikler için
  // iki takımın değerlerinin ortalaması baseline olarak kullanılır.
  // Bu, ligin yeterli veri dönmediği metrikler için takımları yine de
  // birbirinden ayırt etmeyi sağlar — sabit 1.0 hardcode değil, gerçek veriden türetme.
  const peerEnhancedAvgs = { ...(dynamicAvgs || {}) };
  for (const id of allMetricIds) {
    if (peerEnhancedAvgs[id] != null) continue;
    const hv = homeFlat[id] ?? sharedFlat[id];
    const av = awayFlat[id] ?? sharedFlat[id];
    const hvOk = hv != null && isFinite(hv);
    const avOk = av != null && isFinite(av);
    const avg = hvOk && avOk ? (hv + av) / 2 : hvOk ? hv : avOk ? av : null;
    if (avg != null && avg > 0) peerEnhancedAvgs[id] = avg;
  }

  const homeUnits = {};
  const awayUnits = {};
  // Baseline: normLimits için gerekli (normMinRatio/normMaxRatio). Yoksa unit 1.0 identity olur.
  const _unitBaseline = {
    normMinRatio: allMetrics.normMinRatio ?? null,
    normMaxRatio: allMetrics.normMaxRatio ?? null,
  };
  for (const blockId in SIM_BLOCKS) {
    homeUnits[blockId] = calculateUnitImpact(blockId, { ...homeFlat, ...sharedFlat }, allMetricIds, null, peerEnhancedAvgs, _unitBaseline);
    awayUnits[blockId] = calculateUnitImpact(blockId, { ...awayFlat, ...sharedFlat }, allMetricIds, null, peerEnhancedAvgs, _unitBaseline);
  }

  // vol ve den: getPower içinde TURNUVA_KUPLA için gerekli — erken tanımlanmalı
  const vol = allMetrics.leagueGoalVolatility ?? null;
  const den = allMetrics.leaguePointDensity ?? null;

  // ── Mevki Bazlı Piyasa Değeri Kalite Düzeltmesi (PVKD) ──────────────────────
  // Farklı güçteki liglerdeki takımları karşılaştırırken istatistik kalibrasyonu.
  // Sporting Primeira Liga'da 2.5 gol atar; Arsenal EPL'de 1.8. Ham karşılaştırma yanıltıcı.
  // Mevkiye göre: hücum (ATK/ATK_MID), savunma (DEF_GK), orta (MID), kale (GK)
  // Formül: qf = (ownShare × 2)^alpha — share bazlı, nötr nokta 1.0
  // alpha = vol / (avg + vol): volatil ligde kalite farkı daha belirleyici
  // KRİTİK: getPower çağrısından ÖNCE çalışmalı — birimler zaten QF ile ölçeklenmiş halde
  const _pvkdAlpha = computeAlpha(allMetrics.leagueGoalVolatility, leagueAvgGoals);
  const _homeMVBD = homeMVBreakdown ?? { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 };
  const _awayMVBD = awayMVBreakdown ?? { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 };
  const qf = computeQualityFactors(_homeMVBD, _awayMVBD, _pvkdAlpha);

  // Birimsel PVKD: her bloğun ünitesi BLOCK_QF_MAP'teki kalite grubuyla çarpılır.
  // null eşlemeli birimler (H2H, hakem, bağlamsal) kalite düzeltmesi almaz.
  for (const blockId in BLOCK_QF_MAP) {
    const qfType = BLOCK_QF_MAP[blockId];
    if (!qfType) continue;
    if (homeUnits[blockId] != null) homeUnits[blockId] *= qf.home[qfType];
    if (awayUnits[blockId] != null) awayUnits[blockId] *= qf.away[qfType];
  }

  // 2. Derive Lambda (Attack/Defense Power)
  // Eşit ağırlıklı geometrik ortalama yardımcıları — keyfi ağırlık katsayısı yok
  const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));
  const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));

  const getPower = (side, units) => {

    const atk = Math.pow(
      Math.max(units.BITIRICILIK, 0.01) * Math.max(units.YARATICILIK, 0.01) * Math.max(units.SUT_URETIMI, 0.01) *
      Math.max(units.FORM_KISA, 0.01) * Math.max(units.FORM_UZUN, 0.01) *
      Math.max(units.TOPLA_OYNAMA, 0.01) * Math.max(units.BAGLANTI_OYUNU, 0.01),
      1 / 7
    );

    const baseDef = Math.pow(
      Math.max(units.SAVUNMA_DIRENCI, 0.01) * Math.max(units.SAVUNMA_AKSIYONU, 0.01) * Math.max(units.GK_REFLEKS, 0.01) *
      Math.max(units.DISIPLIN, 0.01) * Math.max(units.GK_ALAN_HAKIMIYETI, 0.01),
      1 / 5
    );
    // Yüksek baskı savunmayı düşürür — kuplaj lig volatilitesine orantılı
    // Formül: vol / leagueAvgGoals → volatil lig, baskı altında savunma daha çok çöker
    // Kaynak: leagueGoalVolatility (standings std dev) + leagueAvgGoals (standings ortalama)
    // Clamp sınırları vol ve avg'den türetilir — sabit [0.06, 0.28] kaldırıldı
    // TURNUVA_KUPLA: vol/avg (CV). Clamp sınırları CV'nin kare/iki katı (doğal saturasyon).
    // Sabit 0.02/0.12/0.15/0.45/0.04/0.30 kaldırıldı — tamamen veriden.
    const _cvTK = (vol != null && leagueAvgGoals > 0) ? vol / leagueAvgGoals : null;
    const _tkLow = _cvTK != null ? _cvTK * _cvTK : null;
    const _tkHigh = _cvTK != null ? 2 * _cvTK : null;
    const TURNUVA_KUPLA = (_cvTK != null && _tkLow != null && _tkHigh != null)
      ? clamp(_cvTK, _tkLow, _tkHigh) : null;
    const turnuvaMod = TURNUVA_KUPLA != null
      ? Math.max(1 + (units.TURNUVA_BASKISI - 1.0) * TURNUVA_KUPLA, (allMetrics.normMinRatio ?? 0.5))
      : 1.0;
    const def = baseDef / turnuvaMod;

    // atk/def clamp: lig takımlarının gerçek gol oranı dağılımından (normMin/Max).
    // Kare alındı: güç = atak × savunma ürün skalasında, normalizasyon aralığının karesine izin ver.
    const _pwrMin = (allMetrics.normMinRatio != null && allMetrics.normMinRatio > 0)
      ? allMetrics.normMinRatio * allMetrics.normMinRatio : 0.4;
    const _pwrMax = (allMetrics.normMaxRatio != null && allMetrics.normMaxRatio > 0)
      ? allMetrics.normMaxRatio * allMetrics.normMaxRatio : 2.5;
    return { atk: clamp(atk, _pwrMin, _pwrMax), def: clamp(def, _pwrMin, _pwrMax) };
  };

  const hP = getPower('home', homeUnits);
  const aP = getPower('away', awayUnits);

  // Home Advantage (Dynamic — standings'ten hesaplanan ev/dep gol oranı farkı)
  const baseHomeAdv = dynamicHomeAdvantage;
  // Ev avantajı hassasiyeti: ligin takım sayısı, gol ortalaması, volatilite ve puan yoğunluğundan
  // doğal matematiksel türetim (keyfi katsayı yok).
  // _hwDenom: ligOrtGoals * takimSayisi * (1 + (den / (vol + den)))
  const _hwDenom = (leagueAvgGoals != null && vol != null && den != null)
    ? leagueAvgGoals * (allMetrics.leagueTeamCount ?? 20) * (1.0 + (den / (vol + den)))
    : (leagueAvgGoals != null ? leagueAvgGoals * (allMetrics.leagueTeamCount ?? 20) : null);
  const _hw = _hwDenom != null && _hwDenom > 0 ? 1.0 / _hwDenom : 0;
  const homeAdv = baseHomeAdv != null
    ? baseHomeAdv + (homeUnits.BAGLANTI_OYUNU * _hw) + (homeUnits.MAC_BASLANGICI * _hw)
    : null;

  // ── Dixon-Coles Lambda Kalibrasyonu ──────────────────────────────────────
  // Standart futbol analitik formülü:
  //   λ_home = (attackRate_home × defenseRate_away) × leagueAvg × homeAdv
  //   attackRate  = takımın gol ortalaması / lig ortalaması
  //   defenseRate = rakibin yediği gol ortalaması / lig ortalaması
  //
  // Veri kalitesi hiyerarşisi (hepsi API'den dinamik):
  //   1. xG ortalaması (son 5 maç istatistiklerinden — shot quality adjusted)
  //   2. Gerçek gol ortalaması M001 / M026
  //   Kaynak null ise: lambda = null → Poisson çalışmaz, skor "-" gösterir

  // Dixon-Coles kaynakları: çok kaynaklı Bayesian blend.
  // Hiyerarşi (örneklem ağırlıklı):
  //   1. xG (shot quality) — son 5 maç, home/away role-aware
  //   2. Standings home/away specific (homeStGF/homeStGA/awayStGF/awayStGA) — sezon boyu
  //   3. M002 (son 20 maçtan konum-aware) — takım last events
  //   4. M001 (genel ortalama) — fallback
  //
  // Bayesian blend formülü: her kaynağın API'den gelen gerçek maç sayısına orantılı ağırlık.
  // matchCount: takımın lastEvents listesinin uzunluğu (genelde 15-20 arası)
  // nSt: standings maç sayısı (sezon boyunca)
  const _blendRate = (xg, stSpec, m002, m001, nSt, matchCount) => {
    const sources = [];
    // xG varsa güvenilirdir ama genelde son 5 maçtır, eldeki maç sayısının 5 ile sınırlandırılmış hali:
    const xgW = Math.min(5, matchCount || 5);
    if (xg != null && xgW > 0) sources.push({ val: xg, w: xgW }); 
    // Standings verisi (ev/dep özel)
    if (stSpec != null && nSt > 0) sources.push({ val: stSpec, w: nSt });
    // M002 ev/dep özeldir, lastEvents'in yaklaşık yarısıdır
    const specW = Math.max(1, Math.floor((matchCount || 20) / 2));
    if (m002 != null) sources.push({ val: m002, w: specW });
    // M001 genel ortalamadır, M002 ile aynı ağırlığı vererek dengeli harman
    if (m001 != null) sources.push({ val: m001, w: specW }); 
    
    if (sources.length === 0) return null;
    const totalW = sources.reduce((s, x) => s + x.w, 0);
    return sources.reduce((s, x) => s + x.val * x.w, 0) / totalW;
  };

  const homeAtkRaw = _blendRate(homeXGScored, homeStGF, homeAttack.M002, homeAttack.M001, homeStMatches, homeMatchCount);
  const awayDefRaw = _blendRate(awayXGConceded, awayStGA, awayDefense.M027, awayDefense.M026, awayStMatches, awayMatchCount);
  const awayAtkRaw = _blendRate(awayXGScored, awayStGF, awayAttack.M002, awayAttack.M001, awayStMatches, awayMatchCount);
  const homeDefRaw = _blendRate(homeXGConceded, homeStGA, homeDefense.M027, homeDefense.M026, homeStMatches, homeMatchCount);

  // QF (Kalite Faktörleri) lambda rate'lerine UYGULANMAZ.
  // Neden: QF zaten unit'lere uygulanıyor (satır 81-86), oradan getPower → behavDiff →
  // behavMod yoluyla lambda'yı etkiliyor. Doğrudan rate'lere de uygulamak ÇİFT SAYIM olur
  // ve Leverkusen gibi güçlü takımlara absurd lambda'lar verir (3.47 gibi).
  const homeAttackRate_source = homeAtkRaw;
  const awayDefenseRate_source = awayDefRaw;
  const awayAttackRate_source = awayAtkRaw;
  const homeDefenseRate_source = homeDefRaw;

  // Dixon-Coles baz lambda (home advantage dahil değil)
  const dcBase_home = (homeAttackRate_source != null && awayDefenseRate_source != null && leagueAvgGoals != null && leagueAvgGoals > 0)
    ? (homeAttackRate_source / leagueAvgGoals) * (awayDefenseRate_source / leagueAvgGoals) * leagueAvgGoals
    : null;
  const dcBase_away = (awayAttackRate_source != null && homeDefenseRate_source != null && leagueAvgGoals != null && leagueAvgGoals > 0)
    ? (awayAttackRate_source / leagueAvgGoals) * (homeDefenseRate_source / leagueAvgGoals) * leagueAvgGoals
    : null;

  // ── Dinamik Hassasiyet Kalibrasyonu (Physics-based Scaling) ────────────────
  // vol ve den yukarıda tanımlandı (getPower'dan önce gerekli)

  // Davranışsal Hassasiyet (BEHAV_SENS): veri yoksa sıfır → davranış farkı lambda'ya yansımaz
  // 8 sabit → leagueAvgGoals * 3 (EPL: 2.6×3≈7.8, düşük golcü lig: 1.8×3=5.4 → daha hassas)
  // Clamp sınırları da vol'dan türetilir: [vol*0.08, vol*0.45] — lig dinamiğine adaptif
  // Kaynak: leagueGoalVolatility + leagueAvgGoals (her ikisi de standings'ten)
  // BEHAV_SENS: CV × ölçek. Ölçek: teamCount varsa 1/teamCount (lig büyüklüğüne orantılı), yoksa CV²/CV.
  // Sabit 3/0.08/0.45 kaldırıldı.
  const _teamN = allMetrics.leagueTeamCount ?? null;
  const _cv = (vol != null && leagueAvgGoals > 0) ? vol / leagueAvgGoals : null;
  const BEHAV_SENS = (_cv != null && _teamN != null && _teamN > 0)
    ? clamp(vol / (leagueAvgGoals * _teamN / 2), vol * _cv * _cv, vol * _cv) // lower=CV² scaled, upper=CV scaled
    : (_cv != null ? clamp(_cv / 2, _cv * _cv, _cv) : null);

  // behavDiff clamp: ±normRange (lig takım gol dağılımı) — sabit ±1.0 kaldırıldı.
  const _bcRange = (allMetrics.normMaxRatio != null && allMetrics.normMinRatio != null)
    ? (allMetrics.normMaxRatio - allMetrics.normMinRatio) : 1.0;
  const behavDiff_home = hP != null && aP != null ? clamp(hP.atk - aP.def, -_bcRange, _bcRange) : 0;
  const behavDiff_away = hP != null && aP != null ? clamp(aP.atk - hP.def, -_bcRange, _bcRange) : 0;
  const behavMod_home = BEHAV_SENS != null ? 1.0 + behavDiff_home * BEHAV_SENS : 1.0;
  const behavMod_away = BEHAV_SENS != null ? 1.0 + behavDiff_away * BEHAV_SENS : 1.0;

  // Lambda tavanı: μ + 3σ (istatistiki üst sınır — ortalama + 3 standart sapma)
  // vol = leagueGoalVolatility (standings std dev), null ise takım M001 spreadinden CV tahmini
  // 0.3 sabit CV yerine: homeAttack.M001 vs awayAttack.M001 farkından anlık CV hesabı
  // Kaynak hiyerarşisi: leagueGoalVolatility → M001 spread → dynamicAvgs.M001 → null
  const _volForMax = (() => {
    if (allMetrics.leagueGoalVolatility != null) return allMetrics.leagueGoalVolatility;
    if (leagueAvgGoals == null) return null;
    // Takım gol ortalamalarının sapmasından CV tahmini
    const hGoal = homeAttack?.M001 ?? homeAttack?.M002;
    const aGoal = awayAttack?.M001 ?? awayAttack?.M002;
    if (hGoal != null && aGoal != null && leagueAvgGoals > 0) {
      const spread = Math.abs(hGoal - aGoal);
      const cvEstimate = clamp(spread / (leagueAvgGoals * 2), 0.15, 0.55);
      return leagueAvgGoals * cvEstimate;
    }
    // Son çare: dynamicAvgs.M001 ile oranlama
    const dynM001 = allMetrics.dynamicAvgs?.M001;
    if (dynM001 != null && dynM001 > 0) {
      return leagueAvgGoals * clamp(Math.abs(leagueAvgGoals - dynM001) / leagueAvgGoals, 0.18, 0.50);
    }
    return null; // Gerçekten veri yoksa null — sabit yok
  })();
  // Lambda tavanı: μ + 2σ (daha sıkı istatistiki üst sınır)
  // Önceki μ + 3σ çok gevşek kalarak Leverkusen gibi maçlarda λ=3.47 gibi absurd değerlere
  // izin veriyordu. 2σ hala %95 güven aralığını kapsar.
  const dynamicLambdaMax = (leagueAvgGoals != null && _volForMax != null)
    ? leagueAvgGoals + _volForMax * 2
    : SIM_CONFIG.LIMITS.LAMBDA.MAX;

  // Hırs Hassasiyeti (URGENCY_SENS): veri yoksa sıfır → urgency etkisi lambda'ya yansımaz
  // 0.5 ölçeği → volatiliteye bağlı: volatil lig, aciliyet etkisi daha belirgin
  // Sıkışık ligde (yüksek den) her maç kritik → aciliyet tek başına daha az anlam taşır
  // Kaynak: leaguePointDensity (den) + leagueGoalVolatility/leagueAvgGoals (vol/avg oranı)
  // Clamp sınırları + çarpan dinamik — 0.45 sabit fallback ve 1.8 çarpan kaldırıldı
  // Urgency parametreleri tamamen veriden (sabit 0.5/1.2/2.5/1.8/0.15/0.03/0.08/0.4/0.85/0.65 kaldırıldı).
  const _lgPtsCV = allMetrics.ptsCV ?? null;
  const _urgMult = (den > 0 && _lgPtsCV != null && _lgPtsCV > 0) ? 1 / (den * _lgPtsCV) : null;
  const _urgLow = (_cv != null) ? _cv * _cv : null;
  const _urgHigh = (_cv != null && _lgPtsCV != null) ? _cv + _lgPtsCV : null;
  // _urgRaw: CV × urgMult / (den + ptsCV). Sabit 0.12 kaldırıldı.
  const _urgRaw = (_cv != null && den != null && _urgMult != null && _lgPtsCV != null)
    ? _cv * _urgMult / (den + _lgPtsCV)
    : null;
  const URGENCY_SENS = (_urgRaw != null && _urgLow != null && _urgHigh != null)
    ? clamp(_urgRaw, _urgLow, _urgHigh) : null;

  const urgencyFactorHome = homeUnits.GOL_IHTIYACI;
  const urgencyFactorAway = awayUnits.GOL_IHTIYACI;
  const lambdaMod_home = URGENCY_SENS != null ? 1.0 + (urgencyFactorHome - 1.0) * URGENCY_SENS : 1.0;
  const lambdaMod_away = URGENCY_SENS != null ? 1.0 + (urgencyFactorAway - 1.0) * URGENCY_SENS : 1.0;

  // --- Aşama 5: Ev Avantajı Damperi (FIX_PLAN formülü) ---
  // dampFactor = exp(-|ln(PPG_home/PPG_away)| × leagueCV)
  // Eşit takım → |ln(1)| = 0 → dampFactor = 1.0 (tam ev avantajı)
  // Büyük fark → büyük |ln| → dampFactor küçülür (ev avantajı damper)
  // Volatil lig (yüksek CV) → daha güçlü dampening
  const _homePPG = allMetrics.homeStGF != null && allMetrics.homeStMatches > 0
    ? (homeScoreProfile?.avgScored ?? (allMetrics.homeStGF / allMetrics.homeStMatches))
    : null;
  const _awayPPG = allMetrics.awayStGF != null && allMetrics.awayStMatches > 0
    ? (awayScoreProfile?.avgScored ?? (allMetrics.awayStGF / allMetrics.awayStMatches))
    : null;

  let dampFactor = 1.0;
  if (_homePPG != null && _awayPPG != null && _homePPG > 0 && _awayPPG > 0 && _cv != null) {
    const ppgRatio = _homePPG / _awayPPG;
    dampFactor = Math.exp(-Math.abs(Math.log(ppgRatio)) * _cv);
    dampFactor = Math.max(0.75, Math.min(1.0, dampFactor)); // min %75 koruma
  }

  // Ortalama lambda'yı bulup ona doğru yaklaştırma/uzaklaştırma (regression to mean)
  const avgLambda = ((dcBase_home ?? 1.0) + (dcBase_away ?? 1.0)) / 2;

  // Final lambda: Dixon-Coles × behavioral modifier × urgency calibration
  // homeAdv KALDIRILDI: _blendRate() zaten ev/deplasman spesifik veriler kullanıyor
  // (homeStGF, M002, awayStGA, M027). Ev avantajı veride zaten gömülü.
  // Üstüne homeAdv çarpmak ÇİFT SAYIM yapıyordu (λ_home ×1.2, λ_away ÷1.2 = 1.44x fark).
  let lambda_home = (dcBase_home != null)
    ? clamp(dcBase_home * behavMod_home * lambdaMod_home, SIM_CONFIG.LIMITS.LAMBDA.MIN, dynamicLambdaMax)
    : null;
  let lambda_away = (dcBase_away != null)
    ? clamp(dcBase_away * behavMod_away * lambdaMod_away, SIM_CONFIG.LIMITS.LAMBDA.MIN, dynamicLambdaMax)
    : null;

  // Dampening Uygulaması
  if (lambda_home != null && lambda_away != null) {
      lambda_home = avgLambda + (lambda_home - avgLambda) * dampFactor;
      lambda_away = avgLambda + (lambda_away - avgLambda) * dampFactor;
      
      // Tekrar clamp (güvenlik için)
      lambda_home = clamp(lambda_home, SIM_CONFIG.LIMITS.LAMBDA.MIN, dynamicLambdaMax);
      lambda_away = clamp(lambda_away, SIM_CONFIG.LIMITS.LAMBDA.MIN, dynamicLambdaMax);
  }

  // M167: lambda zaten dynamicLambdaMax ile clamp'lendi — ikinci clamp çift sınırlama olur.
  const M167_home = lambda_home != null ? round2(lambda_home) : null;
  const M167_away = lambda_away != null ? round2(lambda_away) : null;

  // Legacy M156-M160 scores (UI uyumluluğu için korunur — birimler 0-1 aralığında olduğundan
  // *50 ile 0-50 skala aralığına taşınır; bu ölçekleme keyfidir, yalnızca UI gösterimi içindir)

  // M156: Biteş Gücü — M011 + M018 lig ortalamasına göre normalize, *50 UI skalası
  // BITIRICILIK bloğundan ayrıldı (circular dependency kırıldı — bkz. match-simulator.js)
  // Keyfi katsayı yok: her metrik kendi lig ortalamasına bölünür → 1.0 nötr nokta
  // Diğer M15x metriklerle tutarlı: normalizedRatio × 50
  const leagueM011 = dynamicAvgs?.M011 ?? null;
  const leagueM018 = dynamicAvgs?.M018 ?? null;

  const calcM156 = (m011, m018) => {
    const c1 = (m011 != null && leagueM011 != null && leagueM011 > 0) ? m011 / leagueM011 : null;
    const c2 = (m018 != null && leagueM018 != null && leagueM018 > 0) ? m018 / leagueM018 : null;
    const vals = [c1, c2].filter(v => v != null);
    if (vals.length === 0) return null;
    // Eşit ağırlıklı ortalama → [0.5, 2.0] aralığına clamp → ×50 UI skalası
    const normAvg = clamp(vals.reduce((a, b) => a + b, 0) / vals.length, 0.5, 2.0);
    return normAvg * 50;
  };

  const M156_home = calcM156(homeFlat.M011, homeFlat.M018);
  const M156_away = calcM156(awayFlat.M011, awayFlat.M018);
  const M157_home = homeUnits.SAVUNMA_DIRENCI * 50;
  const M157_away = awayUnits.SAVUNMA_DIRENCI * 50;
  const M158_home = homeUnits.FORM_KISA * 50;
  const M158_away = awayUnits.FORM_KISA * 50;
  const M159_home = homeUnits.KADRO_DERINLIGI * 50;
  const M159_away = awayUnits.KADRO_DERINLIGI * 50;
  const M160_home = homeUnits.GK_REFLEKS * 50;
  const M160_away = awayUnits.GK_REFLEKS * 50;

  // ── M161: Hakem Etkisi Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M161 = homeUnits.HAKEM_DINAMIKLERI * 50;

  // ── M162: H2H Avantajı Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M162 = homeUnits.H2H_DOMINASYON * 50;

  // ── M163: Bağlamsal Avantaj Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M163 = homeUnits.TURNUVA_BASKISI * 50;

  // ── M164: Momentum Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M164_home = homeUnits.MOMENTUM_AKIŞI * 50;
  const M164_away = awayUnits.MOMENTUM_AKIŞI * 50;

  // ── M165: Mutlaka Gol Atma İndeksi ── (*50: 0-1 birim → 0-50 UI skalası)
  const M165_home = homeUnits.GOL_IHTIYACI * 50;
  const M165_away = awayUnits.GOL_IHTIYACI * 50;

  // ── M166: Toplam Takım Güç Skoru ──
  // 7 birim eşit ağırlıklı geometrik ortalama — keyfi ağırlık katsayısı yok
  const geo7 = (...vals) => Math.pow(
    vals.reduce((prod, v) => prod * Math.max(v, 0.01), 1),
    1 / vals.length
  );
  const M166_home = geo7(
    homeUnits.BITIRICILIK,
    homeUnits.SAVUNMA_DIRENCI,
    homeUnits.FORM_KISA,
    homeUnits.GK_REFLEKS,
    homeUnits.MOMENTUM_AKIŞI,
    homeUnits.YARATICILIK,
    homeUnits.TAKTIKSEL_UYUM
  ) * 50;
  const M166_away = geo7(
    awayUnits.BITIRICILIK,
    awayUnits.SAVUNMA_DIRENCI,
    awayUnits.FORM_KISA,
    awayUnits.GK_REFLEKS,
    awayUnits.MOMENTUM_AKIŞI,
    awayUnits.YARATICILIK,
    awayUnits.TAKTIKSEL_UYUM
  ) * 50;

  // ── M168: Kazanma Olasılığı (Blended Score Distribution) ──
  const maxGoals = 15;
  let homeWinProb = null, drawProb = null, awayWinProb = null;
  let scoreProbs = [];
  let over15 = null, over25 = null, over35 = null, bttsProb = null;
  let mostLikelyScore = null;
  let totalProb = 0;

  if (M167_home != null && M167_away != null) {
    // Dixon-Coles ρ (rho) korreksiyonu
    const _rhoPts = allMetrics.ptsCV ?? null;
    const rho = (leagueAvgGoals != null && leagueAvgGoals > 0 && _rhoPts != null)
      ? _rhoPts / leagueAvgGoals : 0;

    // ── Dinamik Blend Ağırlıkları (lig volatilitesinden türetilmiş) ──
    // Sabit 0.25/0.25 yerine lig CV'sinden türeyen dinamik ağırlıklar.
    // Yüksek CV (volatil lig) → overdispersion ve empirik dağılımlar daha değerli.
    // Düşük CV (istikrarlı lig) → Poisson yeterli.
    const _lgVol = allMetrics.leagueGoalVolatility;
    const _cv = (_lgVol != null && leagueAvgGoals > 0) ? _lgVol / leagueAvgGoals : null;

    // Overdispersion: per-team gol dağılımından gerçek Var/Mean oranı (dinamik, lig bazlı).
    // leagueFingerprint.leagueOverdispersion: her maçtan 2 bağımsız team-goals sample'ından hesaplanır.
    // Değer ≤ 1.0 → NegBinom ≈ Poisson → negBinomWeight = 0 (saf Poisson devreye girer).
    const overdispersion = (() => {
      if (leagueFingerprint?.reliability > 0.3
          && leagueFingerprint.leagueOverdispersion != null) {
        return leagueFingerprint.leagueOverdispersion;
      }
      if (_cv != null && leagueAvgGoals > 0) {
        return 1.0 + _cv * _cv * leagueAvgGoals;
      }
      return null;
    })();

    // negBinomWeight: overdispersion'ın Poisson'dan ne kadar saptığı × fingerprint güvenilirliği.
    // Büyük sapma + güvenilir veri → yüksek NegBinom ağırlığı. Veri yoksa → 0 (saf Poisson).
    const _lfRel = leagueFingerprint?.reliability ?? 0;
    const negBinomWeight = (() => {
      if (overdispersion == null || overdispersion <= 1.0) return 0;
      const dispSignal = Math.min(0.50, (overdispersion - 1.0) / overdispersion);
      const relFactor = _lfRel > 0 ? _lfRel : (_cv != null ? Math.min(0.50, _cv) : 0);
      return Math.max(0.05, Math.min(0.35, dispSignal * relFactor * 2));
    })();

    // profileWeight: iki bileşenden türetilir
    //   (a) Lig CV'si — volatil ligde empirik sinyal daha değerli
    //   (b) Toplam profil örneklemi — çok H2H/maç varsa profili daha ağır tart
    const _totalProfileN =
      (homeScoreProfile?.n || 0) +
      (awayScoreProfile?.n || 0) +
      (matchScoreProfile?.n || 0) * 2; // H2H karşılaşma direkt sinyal → 2× ağırlık
    const _nWeight = _totalProfileN > 0
      ? _totalProfileN / (_totalProfileN + 15) // Bayesian shrinkage: n=15 → 0.5, n=30 → 0.67
      : 0;
    const _cvBoost = _cv != null ? Math.min(0.40, _cv * 1.0) : 0.25;
    // Nihai: CV boost × örneklem güveni, [0.10, 0.40] clamp
    const profileWeight = Math.max(0.10, Math.min(0.40, _cvBoost * (0.5 + 0.5 * _nWeight)));

    // ── Aşama 4: λ Simetrik Shrinkage ──────────────────────────────────
    // Yalnızca ÇOK aşırı sapmalarda devreye girer (z > 2.5).
    // Soft düzeltme: %70 orijinal + %30 profil (geometric mean yerine)
    let lambda_final_home = M167_home;
    let lambda_final_away = M167_away;
    let shrinkageApplied = { home: false, away: false };

    if (homeScoreProfile && homeScoreProfile.stdScored > 0.01 && homeScoreProfile.n >= 5) {
      const deviation = Math.abs(M167_home - homeScoreProfile.avgScored) / homeScoreProfile.stdScored;
      if (deviation > 2.5) {
        lambda_final_home = 0.7 * M167_home + 0.3 * homeScoreProfile.avgScored;
        shrinkageApplied.home = true;
      }
    }
    if (awayScoreProfile && awayScoreProfile.stdScored > 0.01 && awayScoreProfile.n >= 5) {
      const deviation = Math.abs(M167_away - awayScoreProfile.avgScored) / awayScoreProfile.stdScored;
      if (deviation > 2.5) {
        lambda_final_away = 0.7 * M167_away + 0.3 * awayScoreProfile.avgScored;
        shrinkageApplied.away = true;
      }
    }

    // Blend ile skor dağılımı hesapla — takım + H2H + lig profilleri birlikte
    const blendResult = blendScoreDistribution({
      lambdaHome: lambda_final_home,
      lambdaAway: lambda_final_away,
      rho,
      homeProfile: homeScoreProfile,
      awayProfile: awayScoreProfile,
      matchProfile: matchScoreProfile,
      leagueProfile: leagueFingerprint,
      maxGoals: maxGoals,
      profileWeight,
      negBinomWeight,
      overdispersion,
    });

    if (blendResult) {
      scoreProbs = blendResult.scores;

      // Skor kalibrasyon çarpanları uygula (varsa)
      if (_scoreCalParams) {
        applyScoreCalibration(scoreProbs, _scoreCalParams);
      }

      let _homeWin = 0, _draw = 0, _awayWin = 0;
      let _over15 = 0, _over25 = 0, _over35 = 0, _btts = 0;

      for (const sp of scoreProbs) {
        const total = sp.home + sp.away;
        if (sp.home > sp.away) _homeWin += sp.prob;
        else if (sp.home === sp.away) _draw += sp.prob;
        else _awayWin += sp.prob;
        if (total > 1.5) _over15 += sp.prob;
        if (total > 2.5) _over25 += sp.prob;
        if (total > 3.5) _over35 += sp.prob;
        if (sp.home > 0 && sp.away > 0) _btts += sp.prob;
      }

      totalProb = _homeWin + _draw + _awayWin;
      if (totalProb > 0) {
        homeWinProb = (_homeWin / totalProb) * 100;
        drawProb = (_draw / totalProb) * 100;
        awayWinProb = (_awayWin / totalProb) * 100;
      }

      over15 = _over15;
      over25 = _over25;
      over35 = _over35;
      bttsProb = _btts;

      // ── Aşama 3: Dinamik BTTS & O/U Kalibrasyonu ──────────────────────
      // BTTS ve OU değerlerini empirik profillerle BLEND eder.
      // SKOR MATRİSİNE DOKUNMAZ — 1X2 olasılıkları korunur.
      // E[X] = Σ(rel_i × rate_i) / Σ(rel_i)  (reliability-ağırlıklı ortalama)
      // Final = lerp(Poisson_P, E[X], blendStrength)
      // blendStrength = avgProfileReliability × (1 - |P - E| / max(P, E, 0.01))
      //   → P ve E yakınsa güçlü blend, çok uzaksa Poisson'a güven

      if (totalProb > 0) {
        // BTTS kalibrasyon
        const P_btts_raw = _btts / totalProb;
        const bttsRateSources = [];
        if (homeScoreProfile?.bttsRate != null) {
          const r = homeScoreProfile.n / (homeScoreProfile.n + Math.sqrt(homeScoreProfile.n));
          bttsRateSources.push({ rate: homeScoreProfile.bttsRate, rel: r });
        }
        if (awayScoreProfile?.bttsRate != null) {
          const r = awayScoreProfile.n / (awayScoreProfile.n + Math.sqrt(awayScoreProfile.n));
          bttsRateSources.push({ rate: awayScoreProfile.bttsRate, rel: r });
        }
        if (leagueFingerprint?.leagueBTTSRate != null && leagueFingerprint.reliability > 0) {
          bttsRateSources.push({ rate: leagueFingerprint.leagueBTTSRate, rel: leagueFingerprint.reliability });
        }
        if (bttsRateSources.length > 0) {
          const tRel = bttsRateSources.reduce((s, x) => s + x.rel, 0);
          const E_btts = bttsRateSources.reduce((s, x) => s + x.rate * x.rel, 0) / tRel;
          const avgRel = tRel / bttsRateSources.length;
          const divergence = Math.abs(P_btts_raw - E_btts) / Math.max(P_btts_raw, E_btts, 0.01);
          const blendStr = avgRel * (1 - divergence);
          bttsProb = P_btts_raw + blendStr * (E_btts - P_btts_raw);
        }

        // OU2.5 kalibrasyon
        const P_over25_raw = _over25 / totalProb;
        const ou25Sources = [];
        if (homeScoreProfile?.over25Rate != null) {
          const r = homeScoreProfile.n / (homeScoreProfile.n + Math.sqrt(homeScoreProfile.n));
          ou25Sources.push({ rate: homeScoreProfile.over25Rate, rel: r });
        }
        if (awayScoreProfile?.over25Rate != null) {
          const r = awayScoreProfile.n / (awayScoreProfile.n + Math.sqrt(awayScoreProfile.n));
          ou25Sources.push({ rate: awayScoreProfile.over25Rate, rel: r });
        }
        if (leagueFingerprint?.leagueOver25Rate != null && leagueFingerprint.reliability > 0) {
          ou25Sources.push({ rate: leagueFingerprint.leagueOver25Rate, rel: leagueFingerprint.reliability });
        }
        if (ou25Sources.length > 0) {
          const tRel = ou25Sources.reduce((s, x) => s + x.rel, 0);
          const E_ou25 = ou25Sources.reduce((s, x) => s + x.rate * x.rel, 0) / tRel;
          const avgRel = tRel / ou25Sources.length;
          const divergence = Math.abs(P_over25_raw - E_ou25) / Math.max(P_over25_raw, E_ou25, 0.01);
          const blendStr = avgRel * (1 - divergence);
          over25 = P_over25_raw + blendStr * (E_ou25 - P_over25_raw);
        }
      }

      scoreProbs.sort((a, b) => b.prob - a.prob);
      mostLikelyScore = scoreProbs[0]; // Zaten prob'a göre sorted
    }
  }

  // ── Confidence Score & Data Integrity ── (Multiplikatif Model)
  // Veri bolluğu ve metrik doluluğuna dayalı dinamik güven endeksi.
  const matchSampleRatio = Math.min(1.0, Math.min(homeMatchCount, awayMatchCount) / 10);
  const metricFillingRatio = (allMetricIds?.size || allMetricIds?.length || 0) / 168;

  // 60 base (veri varsa) + 40 (metrik tamlığına bağlı)
  const confidenceScore = clamp(
    (40 * matchSampleRatio) + (60 * metricFillingRatio),
    10,
    100
  );

  const lowDataWarning = Math.min(homeMatchCount, awayMatchCount) < 5;
  const dataFreshnessNote = `${Math.min(homeMatchCount, awayMatchCount)} maç verisi kullanıldı`;

  // ── M169: Formasyon Uyumsuzluğu Avantajı ──
  // Pozitif değer ev sahibi lehine taktik avantaj gösterir.
  function parseForm(f) {
    if (!f) return null;
    let normalized = String(f).trim();
    // Dash-less: "442" → "4-4-2", "4321" → "4-3-2-1"
    if (!normalized.includes('-') && !normalized.includes(' ') && /^\d+$/.test(normalized)) {
      normalized = normalized.split('').join('-');
    }
    // Space-separated: "4 4 2" → "4-4-2"
    if (normalized.includes(' ') && !normalized.includes('-')) {
      normalized = normalized.replace(/\s+/g, '-');
    }
    // Dot-separated: "4.4.2" → "4-4-2"
    if (normalized.includes('.') && !normalized.includes('-')) {
      normalized = normalized.replace(/\./g, '-');
    }
    const parts = normalized.split('-').map(Number).filter(n => !isNaN(n) && n >= 0);
    if (parts.length < 3) return null;
    return { def: parts[0], mid: parts.slice(1, -1).reduce((a, b) => a + b, 0), fwd: parts[parts.length - 1] };
  }
  const homeF = parseForm(homeFormation);
  const awayF = parseForm(awayFormation);
  let M169 = null;

  if (homeF && awayF) {
    const awayUses3Back = awayF.def === 3 || awayF.def === 5;
    const midDiff = homeF.mid - awayF.mid;
    const attackPresence = homeF.fwd - awayF.def;
    // Ağırlıklar CV bazlı (sabit 2/1.5 kaldırıldı). Volatil lig → hücum farkı daha etkili.
    const _mwCV = (allMetrics.leagueGoalVolatility != null && leagueAvgGoals > 0)
      ? allMetrics.leagueGoalVolatility / leagueAvgGoals : null;
    const _midW = _mwCV != null ? 1 + _mwCV : 2;
    const _apW = _mwCV != null ? 1 + 2 * _mwCV : 1.5;
    M169 = 50
      + (awayUses3Back ? 3 : 0)
      + midDiff * _midW
      + attackPresence * _apW;
    M169 = Math.max(20, Math.min(80, M169));
  }

  return {
    home: {
      M156: M156_home, M157: M157_home, M158: M158_home, M159: M159_home,
      M160: M160_home, M164: M164_home, M165: M165_home, M166: M166_home,
      M167: M167_home,
    },
    away: {
      M156: M156_away, M157: M157_away, M158: M158_away, M159: M159_away,
      M160: M160_away, M164: M164_away, M165: M165_away, M166: M166_away,
      M167: M167_away,
    },
    shared: { M161, M162, M163, M169 },
    prediction: {
      homeWinProbability: homeWinProb != null ? round2(homeWinProb) : null,
      drawProbability: drawProb != null ? round2(drawProb) : null,
      awayWinProbability: awayWinProb != null ? round2(awayWinProb) : null,
      mostLikelyScore: mostLikelyScore != null ? `${mostLikelyScore.home}-${mostLikelyScore.away}` : null,
      mostLikelyScoreProbability: mostLikelyScore != null ? round2(mostLikelyScore.prob * 100) : null,
      over15: over15 != null && totalProb > 0 ? round2((over15 / totalProb) * 100) : null,
      over25: over25 != null && totalProb > 0 ? round2((over25 / totalProb) * 100) : null,
      over35: over35 != null && totalProb > 0 ? round2((over35 / totalProb) * 100) : null,
      btts: bttsProb != null && totalProb > 0 ? round2((bttsProb / totalProb) * 100) : null,
      lambdaHome: M167_home != null ? round2(M167_home) : null,
      lambdaAway: M167_away != null ? round2(M167_away) : null,
      top5Scores: scoreProbs.length > 0 && totalProb > 0 ? scoreProbs.slice(0, 5).map(s => ({
        score: `${s.home}-${s.away}`,
        probability: round2(s.prob / totalProb * 100),
      })) : null,
      confidenceScore: Math.round(confidenceScore),
      lowDataWarning,
      dataFreshnessNote,
    }
  };
}

// poissonPMF, weightedAvg, clamp, round2 artık math-utils.js'den import ediliyor

module.exports = { calculateAdvancedMetrics };
