/**
 * Advanced Derived Metrics (M156–M168)
 * Bileşik skorlar, Poisson dağılımı, skor tahmini, kazanma olasılığı.
 */

const { poissonPMF, weightedAvg, clamp, round2 } = require('../engine/math-utils');
const { calculateUnitImpact, SIM_BLOCKS } = require('../engine/match-simulator');
const { SIM_CONFIG } = require('../engine/sim-config');
const { BLOCK_QF_MAP, computeAlpha, computeQualityFactors } = require('../engine/quality-factors');
const { blendScoreDistribution } = require('../engine/score-profile');
const { applyZoneModifiers } = require('../engine/lineup-impact');
const { unwrap, getConfidence } = require('../engine/metric-value');

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
    // MetricValue wrapper desteği: unwrap ile düz sayıya çevir, confidence ile ağırlıkla
    const hRaw = homeFlat[id] ?? sharedFlat[id];
    const aRaw = awayFlat[id] ?? sharedFlat[id];
    const hVal = unwrap(hRaw);
    const aVal = unwrap(aRaw);
    const hvOk = hVal != null && isFinite(hVal);
    const avOk = aVal != null && isFinite(aVal);
    let avg;
    if (hvOk && avOk) {
      // Confidence-weighted average: yüksek güvenilirlikli metrik daha fazla ağırlık alır
      const hConf = Math.max(0.01, getConfidence(hRaw));
      const aConf = Math.max(0.01, getConfidence(aRaw));
      avg = (hVal * hConf + aVal * aConf) / (hConf + aConf);
    } else {
      avg = hvOk ? hVal : avOk ? aVal : null;
    }
    if (avg != null && avg > 0) peerEnhancedAvgs[id] = avg;
  }

  const homeUnits = {};
  const awayUnits = {};
  // Baseline: normLimits + amplify için gerekli. Yoksa amplify=1.0 (düşük duyarlılık).
  // HATA DÜZELTMESİ: Önceki _unitBaseline'da leagueGoalVolatility/leagueAvgGoals yoktu
  // → calculateUnitImpact'te _globalCV=null → amplify=1.0 → behavioral unit farklılıkları baskılanıyordu.
  // leagueAvgGoals: satır 37'de çözülen yerel değişken (standings → M001 → proxy fallback zinciri)
  const _unitBaseline = {
    normMinRatio: allMetrics.normMinRatio ?? null,
    normMaxRatio: allMetrics.normMaxRatio ?? null,
    leagueGoalVolatility: allMetrics.leagueGoalVolatility ?? null,
    leagueAvgGoals: leagueAvgGoals ?? null,
    // baselineReliability: sezon başında amplify dampening — prediction-generator'dan geçirilir
    baselineReliability: allMetrics.baselineReliability ?? null,
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

  // ── Bölgesel Kadro Etkisi (ZQM) ──────────────────────────────────────────
  // PVKD'den SONRA: Workshop'ta kadro değiştiğinde her mevki bölgesinin
  // (G/D/M/F) kalite oranını behavioral unit'lere yansıtır.
  // allMetrics.homeZoneQualityRatios server.js'ten gelir; yoksa identity.
  const _hZQR_adv = allMetrics.homeZoneQualityRatios ?? { G: 1.0, D: 1.0, M: 1.0, F: 1.0 };
  const _aZQR_adv = allMetrics.awayZoneQualityRatios ?? { G: 1.0, D: 1.0, M: 1.0, F: 1.0 };
  const _hLQR_adv = allMetrics.homeLineupQualityRatio ?? 1.0;
  const _aLQR_adv = allMetrics.awayLineupQualityRatio ?? 1.0;
  const _hDynW_adv = allMetrics.homeDynamicBlockWeights ?? null;
  const _aDynW_adv = allMetrics.awayDynamicBlockWeights ?? null;
  applyZoneModifiers(homeUnits, _hZQR_adv, _hLQR_adv, _hDynW_adv);
  applyZoneModifiers(awayUnits, _aZQR_adv, _aLQR_adv, _aDynW_adv);

  // EPS: Dinamik taban sınırı
  const EPS = (leagueAvgGoals > 0) ? leagueAvgGoals / 1000 : 0.001;

  // Eşit ağırlıklı geometrik ortalama yardımcıları — keyfi ağırlık katsayısı yok
  const geo2 = (a, b) => Math.sqrt(Math.max(a, EPS) * Math.max(b, EPS));
  const geo3 = (a, b, c) => Math.cbrt(Math.max(a, EPS) * Math.max(b, EPS) * Math.max(c, EPS));

  const getPower = (side, units) => {

    // ═══════════════════════════════════════════════════════════════════════════
    // ATK POWER — 13 blok: Tüm hücum, yaratıcılık, duran top, hava hakimiyeti,
    // taktik, menajer, kadro, H2H, hakem, form, topla oynama, bağlantı dahil.
    // ═══════════════════════════════════════════════════════════════════════════
    const atkComponents = [
      units.BITIRICILIK,          // Gol yolları
      units.YARATICILIK,          // Fırsat yaratma
      units.SUT_URETIMI,          // Şut hacmi
      units.FORM_KISA,            // Kısa vadeli form
      units.FORM_UZUN,            // Uzun vadeli form
      units.TOPLA_OYNAMA,         // Top kontrolü
      units.BAGLANTI_OYUNU,       // Geçiş oyunu
      units.DURAN_TOP,            // Penaltı, korner, frikik golleri
      units.HAVA_HAKIMIYETI,      // Kafa gücü, hava topları
      units.TAKTIKSEL_UYUM,       // Pressing, blok yüksekliği
      units.FİŞİ_ÇEKME,          // Comeback, maç kapatma
      units.KADRO_DERINLIGI,      // Yedek gücü, yorgunluk
      units.MENAJER_STRATEJISI,   // Menajer deneyimi/taktik
    ].filter(v => v != null && v > 0);

    const atk = atkComponents.length > 0
      ? Math.pow(
          atkComponents.reduce((prod, v) => prod * Math.max(v, EPS), 1),
          1 / atkComponents.length  // Dinamik dereceden geometrik ortalama
        )
      : 1.0;

    // ═══════════════════════════════════════════════════════════════════════════
    // DEF POWER — 11 blok: Savunma, kaleci, disiplin, zihinsel dayanıklılık,
    // psikolojik kırılganlık, hakem, H2H, momentum dahil.
    // ═══════════════════════════════════════════════════════════════════════════
    const defComponents = [
      units.SAVUNMA_DIRENCI,      // Gol yememe gücü
      units.SAVUNMA_AKSIYONU,     // Tackle, intercept, blok
      units.GK_REFLEKS,           // Kaleci kurtarışları
      units.GK_ALAN_HAKIMIYETI,   // Kaleci çıkışları, alan kontrolü
      units.ZİHİNSEL_DAYANIKLILIK, // Baskı altında dayanıklılık
      units.DISIPLIN,             // Kart/faul kontrolü (düşük = savunma zayıflar)
      units.HAKEM_DINAMIKLERI,    // Hakem eğilimi (kart/penaltı sertliği)
      units.H2H_DOMINASYON,       // Tarihsel üstünlük
      units.MOMENTUM_AKIŞI,       // Anlık ivme
    ].filter(v => v != null && v > 0);

    // PSİKOLOJİK_KIRILGANLIK savunmayı zayıflatır (tersi: yüksek = kırılgan = savunma düşer)
    const psiFrag = units.PSIKOLOJIK_KIRILGANLIK ?? 1.0;
    const psiFactor = psiFrag > 0 ? 1.0 / Math.max(psiFrag, 0.2) : 1.0; // invert: 0.4 kırılganlık → 2.5x savunma boost

    const baseDef = defComponents.length > 0
      ? Math.pow(
          defComponents.reduce((prod, v) => prod * Math.max(v, EPS), 1),
          1 / defComponents.length
        ) * Math.sqrt(psiFactor) // sqrt damping — aşırı dalgalanmayı engeller
      : 1.0;

    // TURNUVA BASKISI: yüksek baskı savunmayı düşürür
    const _cvTK = (vol != null && leagueAvgGoals > 0) ? vol / leagueAvgGoals : null;
    const _tkLow = _cvTK != null ? _cvTK * _cvTK : null;
    const _tkHigh = _cvTK != null ? 2 * _cvTK : null;
    const TURNUVA_KUPLA = (_cvTK != null && _tkLow != null && _tkHigh != null)
      ? clamp(_cvTK, _tkLow, _tkHigh) : null;
    const turnuvaMod = TURNUVA_KUPLA != null
      ? Math.max(1 + (units.TURNUVA_BASKISI - 1.0) * TURNUVA_KUPLA, (allMetrics.normMinRatio ?? 0.5))
      : 1.0;
    const def = baseDef / turnuvaMod;

    // Kare alındı: güç = atak × savunma ürün skalasında
    const cvBand = (vol != null && leagueAvgGoals > 0) ? (vol / leagueAvgGoals) : 0;
    const _pwrMin = (allMetrics.normMinRatio != null && allMetrics.normMinRatio > 0)
      ? allMetrics.normMinRatio * allMetrics.normMinRatio : (1 - cvBand);
    const _pwrMax = (allMetrics.normMaxRatio != null && allMetrics.normMaxRatio > 0)
      ? allMetrics.normMaxRatio * allMetrics.normMaxRatio : (1 + cvBand);
    
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
  // ── Öneri A: xG Birim Kalibrasyonu ─────────────────────────────────────────
  // leagueAvgGoals standings'ten gerçek (actual) gollere dayanır.
  // xG verileri ise shot quality modeli çıktısıdır — yapısal olarak actual'ın altında kalır.
  // Bu oran, o ligin o sezonundaki xG→actual dönüşüm oranını dinamik olarak ölçer.
  // Makul aralık: CV'ye bağlı dinamik sınırlar — volatil ligde fark daha geniş olabilir.
  const _leagueXGAvg = dynamicAvgs?.M015; // league-averages.js'ten: standings + shotmap + seasonStats
  const _xGToActualRatio = (
    leagueAvgGoals != null && leagueAvgGoals > 0 &&
    _leagueXGAvg != null && _leagueXGAvg > 0
  ) ? leagueAvgGoals / _leagueXGAvg : null;
  // Dinamik sınırlar: CV yüksekse (volatil lig) xG→actual fark daha geniş olabilir
  const _cvEarly = (vol != null && leagueAvgGoals > 0) ? vol / leagueAvgGoals : null;
  const _xgLowerBound = Math.max(0.70, 1.0 - (_cvEarly ?? 0.5) * 0.60);
  const _xgUpperBound = Math.min(1.70, 1.0 + (_cvEarly ?? 0.5) * 0.80);
  let xGCorrectionFactor = null;
  let _xgCorrectionSkipReason = null;
  if (_xGToActualRatio == null) {
    _xgCorrectionSkipReason = 'no xG or league avg data';
  } else if (_xGToActualRatio < _xgLowerBound || _xGToActualRatio > _xgUpperBound) {
    _xgCorrectionSkipReason = `ratio ${_xGToActualRatio.toFixed(3)} out of bounds [${_xgLowerBound.toFixed(2)}, ${_xgUpperBound.toFixed(2)}]`;
    console.warn(`[AdvancedDerived] xGCorrectionFactor skipped: ${_xgCorrectionSkipReason}`);
  } else {
    xGCorrectionFactor = _xGToActualRatio;
  }

  // _blendRate: 5. parametre olarak scoreProfile.avgConceded eklendi.
  // homeAtkRaw → rakibin (away) yediği gol ortalaması (awayScoreProfile.avgConceded) kullanılır.
  // awayAtkRaw → rakibin (home) yediği gol ortalaması (homeScoreProfile.avgConceded) kullanılır.
  // Ağırlık = profil örneklemi (n) * 0.5: standings/xG kadar güvenmiyor ama yok saymıyoruz.
  const _blendRate = (xg, stSpec, m002, m001, nSt, matchCount, profileConceded, profileN) => {
    const sources = [];
    const xgW = Math.min(5, matchCount || 5);
    if (xg != null && xgW > 0) {
      const xgCorrected = xGCorrectionFactor != null ? xg * xGCorrectionFactor : xg;
      if (isFinite(xgCorrected)) sources.push({ val: xgCorrected, w: xgW });
    }
    if (stSpec != null && nSt > 0) sources.push({ val: stSpec, w: nSt });
    const specW = Math.max(1, Math.floor((matchCount || 20) / 2));
    if (m002 != null) sources.push({ val: m002, w: specW });
    if (m001 != null) sources.push({ val: m001, w: specW });
    // scoreProfile.avgConceded: rakibin temporal-decay'li gerçek yenilen gol ortalaması.
    // Ağırlık = örneklem × 0.5 (n=10 maç → 5 puan ağırlık — veri miktarına doğrusal).
    if (profileConceded != null && profileN > 0) {
      sources.push({ val: profileConceded, w: profileN * 0.5 });
    }
    if (sources.length === 0) return null;
    const totalW = sources.reduce((s, x) => s + x.w, 0);
    return sources.reduce((s, x) => s + x.val * x.w, 0) / totalW;
  };

  // homeAtkRaw: ev sahibi gol atar mı? → rakibin (away) savunma yumuşaklığı eklendi [CROSS-REF ✅]
  const homeAtkRaw = _blendRate(homeXGScored, homeStGF, homeAttack.M002, homeAttack.M001, homeStMatches, homeMatchCount,
    awayScoreProfile?.avgConceded, awayScoreProfile?.n);
  // awayDefRaw: away savunma zafiyeti → away'in kendi yenilen gol profili [SAME-TEAM ✅]
  const awayDefRaw = _blendRate(awayXGConceded, awayStGA, awayDefense.M027, awayDefense.M026, awayStMatches, awayMatchCount,
    awayScoreProfile?.avgConceded, awayScoreProfile?.n);
  // awayAtkRaw: deplasman gol atar mı? → rakibin (home) savunma yumuşaklığı eklendi [CROSS-REF ✅]
  const awayAtkRaw = _blendRate(awayXGScored, awayStGF, awayAttack.M002, awayAttack.M001, awayStMatches, awayMatchCount,
    homeScoreProfile?.avgConceded, homeScoreProfile?.n);
  // homeDefRaw: home savunma zafiyeti → home'un kendi yenilen gol profili [SAME-TEAM ✅]
  const homeDefRaw = _blendRate(homeXGConceded, homeStGA, homeDefense.M027, homeDefense.M026, homeStMatches, homeMatchCount,
    homeScoreProfile?.avgConceded, homeScoreProfile?.n);


  // ── TopPlayers × MissingPlayers: Beklenen Gol Düşüşü ──────────────────────
  // Eğer takımın en çok gol atan oyuncuları sakatsa/askıdaysa,
  // beklenen gol atma oranı doğrudan düşürülür.
  // Kaynak: data._homeTopPlayerGoalDrop / data._awayTopPlayerGoalDrop
  // (data-fetcher.js'te topPlayers × missingPlayers çapraz hesabı ile üretilir)
  // Saf veri: goals/appearances — sıfır statik katsayı, sıfır clamp.
  const _homeGoalDrop = allMetrics.homeTopPlayerGoalDrop ?? 0;
  const _awayGoalDrop = allMetrics.awayTopPlayerGoalDrop ?? 0;

  // QF (Kalite Faktörleri) lambda rate'lerine UYGULANMAZ.
  // Neden: QF zaten unit'lere uygulanıyor (satır 81-86), oradan getPower → behavDiff →
  // behavMod yoluyla lambda'yı etkiliyor. Doğrudan rate'lere de uygulamak ÇİFT SAYIM olur
  // ve Leverkusen gibi güçlü takımlara absurd lambda'lar verir (3.47 gibi).
  const homeAttackRate_source = homeAtkRaw != null ? Math.max(0, homeAtkRaw - _homeGoalDrop) : null;
  const awayDefenseRate_source = awayDefRaw;
  const awayAttackRate_source = awayAtkRaw != null ? Math.max(0, awayAtkRaw - _awayGoalDrop) : null;
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
  // BEHAV_SENS reformu: CV × pointDensity_weight
  // Mantık: Yüksek CV (kaotik lig) → takım farkı daha önemli
  //         Yüksek den (her puan kritik) → gerçek güç farkı daha belirleyici
  // EPL: CV=0.35, den=1.8, lgAvg=1.30 → densW=0.58 → BEHAV_SENS=0.20 (eski: 0.05)
  // Tüm parametreler standings'ten — sıfır statik katsayı.
  const _densW = (den != null && den > 0 && leagueAvgGoals != null && leagueAvgGoals > 0)
    ? den / (den + leagueAvgGoals)
    : (_cv != null ? 0.5 : null); // standings yoksa nötr
  const BEHAV_SENS = (_cv != null && _densW != null)
    ? clamp(_cv * _densW, _cv * _cv * 0.5, _cv * 0.85) // alt: CV²/2, üst: 0.85×CV
    : null;

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
  // Lambda tavanı: max(μ + 3σ, μ × 1.5) — backtest kanıtı: μ+2σ çok sıkıydı
  // (Poisson ort. 1.41, gerçek 2.65). %99.7 güven aralığı + minimum 1.5× lig ortalaması.
  const _lambdaCeilMult = allMetrics.normMaxRatio ?? 1.5;
  const dynamicLambdaMax = (leagueAvgGoals != null && _volForMax != null)
    ? Math.max(leagueAvgGoals + _volForMax * 3, leagueAvgGoals * _lambdaCeilMult)
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
  // dampFactor KALDIRILDI: Veriye güveniyoruz.
  // _blendRate zaten standings+xG+scoreProfile blend'iyle doğru gol ortalamasını hesaplıyor.
  // dampFactor güçlü favori maçlarında (City vs Burnley) avantajın %23'ünü siliyordu.
  // Bayesian regresyon zaten profileN küçükse düşük ağırlık vererek yapılıyor.

  const _lambdaFloorMult = allMetrics.normMinRatio ?? 0.35;
  const dynamicLambdaMin = (leagueAvgGoals != null && leagueAvgGoals > 0)
    ? Math.max(SIM_CONFIG.LIMITS.LAMBDA.MIN, leagueAvgGoals * _lambdaFloorMult)
    : SIM_CONFIG.LIMITS.LAMBDA.MIN;
  let lambda_home = (dcBase_home != null)
    ? clamp(dcBase_home * behavMod_home * lambdaMod_home, dynamicLambdaMin, dynamicLambdaMax)
    : null;
  let lambda_away = (dcBase_away != null)
    ? clamp(dcBase_away * behavMod_away * lambdaMod_away, dynamicLambdaMin, dynamicLambdaMax)
    : null;

  // ── Lineup Quality Ratio (LQR) — Kadro kalitesi lambda düzeltmesi ──
  // Workshop'ta kadro değiştiğinde baseline.homeLineupQualityRatio != 1.0 olur.
  // Lambda'ya sqrt damping ile uygulanır:
  //   Örnek: 11'in ortalaması 85 → 65'e düştüyse ratio=0.765 → sqrt=0.875 → lambda %12.5 düşer
  //   Bu, tüm Poisson çıktılarını (1X2, O/U, BTTS, skor) direkt etkiler.
  const _hLQR = allMetrics.homeLineupQualityRatio ?? 1.0;
  const _aLQR = allMetrics.awayLineupQualityRatio ?? 1.0;
  if (_hLQR !== 1.0 && lambda_home != null) {
    lambda_home = clamp(lambda_home * Math.sqrt(_hLQR), dynamicLambdaMin, dynamicLambdaMax);
  }
  if (_aLQR !== 1.0 && lambda_away != null) {
    lambda_away = clamp(lambda_away * Math.sqrt(_aLQR), dynamicLambdaMin, dynamicLambdaMax);
  }

  // ── Değişiklik 4: xGOverPerformance → lambda modifiyesi ──────────────────
  // xGOverPerf = gerçek gol ort. / xG ort. → >1 beklentiden fazla gol atıyor (clinical)
  // Kaynak: homeXGScored (xG), homeAttack.M001 veya homeScoreProfile.avgScored (gerçek)
  // Hassasiyet = _cv × (1 - normMinRatio) — standings'ten, sıfır statik
  const _xgSens = (_cv != null && allMetrics.normMinRatio != null)
    ? _cv * (1.0 - allMetrics.normMinRatio)
    : (_cv != null ? _cv * 0.35 : null);

  const _homeActualGoals = homeAttack?.M001 ?? homeScoreProfile?.avgScored ?? null;
  const _awayActualGoals = awayAttack?.M001 ?? awayScoreProfile?.avgScored ?? null;
  const _homeXGOverPerf = (homeXGScored != null && homeXGScored > 0 && _homeActualGoals != null)
    ? _homeActualGoals / homeXGScored : null;
  const _awayXGOverPerf = (awayXGScored != null && awayXGScored > 0 && _awayActualGoals != null)
    ? _awayActualGoals / awayXGScored : null;

  if (lambda_home != null && _homeXGOverPerf != null && _xgSens != null) {
    const xgMod_h = clamp(1.0 + (_homeXGOverPerf - 1.0) * _xgSens, 1.0 - _xgSens, 1.0 + _xgSens);
    lambda_home = clamp(lambda_home * xgMod_h, dynamicLambdaMin, dynamicLambdaMax);
  }
  if (lambda_away != null && _awayXGOverPerf != null && _xgSens != null) {
    const xgMod_a = clamp(1.0 + (_awayXGOverPerf - 1.0) * _xgSens, 1.0 - _xgSens, 1.0 + _xgSens);
    lambda_away = clamp(lambda_away * xgMod_a, dynamicLambdaMin, dynamicLambdaMax);
  }

  // ── Değişiklik 5: Hakem refGoalsPerMatch → lambda ────────────────────────
  // Bu hakemin maçlarında lig ortalamasından gol sapması → simetrik lambda etkisi
  // Hassasiyet = fingerprint.reliability × _cv — her ikisi de veriden
  const _refGPM = allMetrics.referee?.refGoalsPerMatch ?? null;
  const _refRel  = leagueFingerprint?.reliability ?? 0;
  const _refSens = (_refRel > 0 && _cv != null) ? _refRel * _cv : null;

  if (_refGPM != null && leagueAvgGoals != null && leagueAvgGoals > 0 && _refSens != null) {
    const refRatio = _refGPM / (leagueAvgGoals * 2); // maç başı toplam gol normalize
    const refMod = clamp(1.0 + (refRatio - 1.0) * _refSens, 1.0 - _refSens * 0.5, 1.0 + _refSens * 0.5);
    if (lambda_home != null) lambda_home = clamp(lambda_home * refMod, dynamicLambdaMin, dynamicLambdaMax);
    if (lambda_away != null) lambda_away = clamp(lambda_away * refMod, dynamicLambdaMin, dynamicLambdaMax);
  }

  // ── Değişiklik 6: cleanSheetRate + scoringRate → lambda baskısı ──────────
  // Ev takımı cleanSheet yüksekse + dep atma oranı düşükse → lambda_away aşağı
  // Simetrik: dep cleanSheet yüksekse + ev atma oranı düşükse → lambda_home aşağı
  // Referans: leagueFingerprint'ten lig geneli cleanSheet oranı
  const _lgCSR = leagueFingerprint?.leagueCleanSheetRate ?? leagueFingerprint?.cleanSheetRate ?? null;

  if (_lgCSR != null && _cv != null) {
    // Ev savunması: homeCSR / lgCSR → >1 güçlü savunma
    const _hCSR = homeScoreProfile?.cleanSheetRate ?? null;
    const _aSR  = awayScoreProfile?.scoringRate ?? null; // dep gol atma oranı (0-1)
    if (_hCSR != null && _aSR != null && lambda_away != null) {
      const defRatio = _hCSR / Math.max(_lgCSR, 0.01); // normalize
      const defAtkMod_away = clamp(1.0 - (1.0 - _aSR) * _cv * Math.max(0, defRatio - 1.0) * 0.5,
        1.0 - _cv * 0.3, 1.0);
      lambda_away = clamp(lambda_away * defAtkMod_away, dynamicLambdaMin, dynamicLambdaMax);
    }
    // Deplasman savunması: awayCSR → ev gol üretimini baskıla
    const _aCSR = awayScoreProfile?.cleanSheetRate ?? null;
    const _hSR  = homeScoreProfile?.scoringRate ?? null;
    if (_aCSR != null && _hSR != null && lambda_home != null) {
      const defRatio = _aCSR / Math.max(_lgCSR, 0.01);
      const defAtkMod_home = clamp(1.0 - (1.0 - _hSR) * _cv * Math.max(0, defRatio - 1.0) * 0.5,
        1.0 - _cv * 0.3, 1.0);
      lambda_home = clamp(lambda_home * defAtkMod_home, dynamicLambdaMin, dynamicLambdaMax);
    }
  }

  // ── Öneri B: Lambda Referans Kalibrasyonu ───────────────────────────────────
  // xG birim düzeltmesi (A) sistematik deflasyonun büyük bölümünü giderir,
  // ancak lig/takım profillerinde kayıt edilen gerçek gol ortalamasıyla karşılaştırarak
  // kalan deflasyonu da kapatan ikinci bir kalibrasyondur.
  //
  // Referans toplam gol kaynağı (öncelik sırasıyla):
  //   1. leagueFingerprint.avgGoals — aynı turnuvanın gerçek maçlarından, zamansal ağırlıklı
  //   2. homeScoreProfile + awayScoreProfile — iki takımın kendi gerçek ortalamaları
  //   3. matchScoreProfile — bu iki takımın H2H ortalaması
  //   4. leagueAvgGoals × 2 — standings gol/takım × 2 (toplam maç başı gol)
  //
  // scalingFactor = pow(ratio, reliability × 0.5):
  //   reliability → 0 ise factor = 1.0 (düzeltme yok)
  //   reliability → 1 ise max düzeltme uygulanır
  //   Üst limit: 1.40× (max %40 yukarı ölçekleme — aşırı düzeltmeyi önler)
  if (lambda_home != null && lambda_away != null) {
    const lambdaSum = lambda_home + lambda_away;

    // 1. Referans toplam gol hesapla
    const _lfRel_B = leagueFingerprint?.reliability ?? 0;
    let referenceTotalGoals = null;
    let referenceReliability = 0;

    if (_lfRel_B > 0.3 && leagueFingerprint.leagueAvgGoals != null && leagueFingerprint.leagueAvgGoals > 0) {
      // leagueAvgGoals leagueFingerprint'te maç başı toplam gol (home + away, zamansal ağırlıklı)
      referenceTotalGoals = leagueFingerprint.leagueAvgGoals;
      referenceReliability = _lfRel_B;
    } else if (homeScoreProfile?.avgScored != null && awayScoreProfile?.avgScored != null) {
      // Her iki takımın kendi gerçek ortalama golleri (kendi perspektifinden)
      referenceTotalGoals = homeScoreProfile.avgScored + awayScoreProfile.avgScored;
      const minN = Math.min(homeScoreProfile.n || 0, awayScoreProfile.n || 0);
      referenceReliability = minN / (minN + Math.sqrt(minN + 1)); // Bayesian shrinkage
    } else if (matchScoreProfile?.avgHomeGoals != null && matchScoreProfile?.avgAwayGoals != null) {
      referenceTotalGoals = matchScoreProfile.avgHomeGoals + matchScoreProfile.avgAwayGoals;
      referenceReliability = (matchScoreProfile.n || 0) / ((matchScoreProfile.n || 0) + 3);
    } else if (leagueAvgGoals != null && leagueAvgGoals > 0) {
      // Standings: her takım için goals/match → × 2 = maç başı toplam
      referenceTotalGoals = leagueAvgGoals * 2;
      referenceReliability = 0.35; // standings veri her zaman mevcut ama tek referans olarak zayıf
    }

    // 2. Kalibrasyon oranı ve ölçekleme faktörü
    if (referenceTotalGoals != null && referenceTotalGoals > 0 && referenceReliability > 0) {
      const calibrationRatio = referenceTotalGoals / lambdaSum;

      // Yalnızca Poisson eksik kaldığında düzelt (ratio > 1.10 = gerçek goller Poisson'dan %10+ fazla)
      // ratio < 1.0 = Poisson zaten yüksek tahmin yapıyor → müdahale etme
      if (calibrationRatio > 1.10) {
        // scalingFactor: reliability ne kadar yüksekse referansa o kadar yaklaş
        // exponent = reliability × 0.5 → [0, 0.5] aralığı → factor [1, ratio^0.5]
        const exponent = referenceReliability * 0.5;
        let scalingFactor = Math.pow(calibrationRatio, exponent);

        // Güvenlik tavan: normMaxRatio'ya bağlı dinamik üst sınır (ligin en güçlü takımına göre)
        const _bCap = Math.min((allMetrics.normMaxRatio ?? 2.0) * 0.70, 1.50);
        scalingFactor = Math.min(scalingFactor, _bCap);

        // Ev/deplasman oranı korunarak orantısal ölçekleme
        const ratio_ha = lambdaSum > 0 ? lambda_home / lambdaSum : 0.5;
        lambda_home = clamp(lambdaSum * scalingFactor * ratio_ha,      dynamicLambdaMin, dynamicLambdaMax);
        lambda_away = clamp(lambdaSum * scalingFactor * (1 - ratio_ha), dynamicLambdaMin, dynamicLambdaMax);
      }
    }
  }

  // M167: lambda dinamik sınırlar içinde kalibre edildi.
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
    // ── Dixon-Coles ρ (rho) — Veriden Türetilmiş Düzeltme ─────────────────
    // HATA DÜZELTMESİ: Eski formül (ptsCV/leagueAvgGoals) POZİTİF değer veriyordu.
    // Pozitif rho → τ(1,1)=1-ρ < 1 → beraberlik olasılığını AZALTIYOR (yanlış).
    // Doğru: ρ < 0 → τ(0,0) ve τ(1,1) > 1 → beraberlik olasılığını ARTIRIYOR.
    //
    // Formül: ρ ≈ -(D_obs - D_poisson) / (P(0,0)×λH×λA + P(1,1))
    //   D_obs:     ligden gözlemlenen gerçek beraberlik oranı (fingerprint)
    //   D_poisson: lig lambda'larında saf Poisson'ın tahmin ettiği beraberlik oranı
    //   Paydaki: hangi skorların τ tarafından düzeltildiği (0-0, 1-0, 0-1, 1-1)
    const rho = (() => {
      // Veri yoksa: ρ ≈ -0.10 (futbolda evrensel gözlem: düşük skorlar bağımsız Poisson'dan fazla).
      // Bu değer sabit bir fallback — dinamik hesaplama için yeterli veri olmadığında kullanılır.
      if (leagueAvgGoals == null || leagueAvgGoals <= 0) return -0.10;
      const lambdaLg = leagueAvgGoals / 2;
      // Gözlemlenen beraberlik oranı (öncelik sırası):
      //   1. leagueFingerprint.leagueDrawRate — lastEvents temporal ağırlıklı (en güncel)
      //   2. leagueFingerprint.leagueDrawRate_std — standings'ten hesaplanan (sezon bütünü)
      //   3. leagueDrawTendency × 0.25 — league-averages.js'ten normalize oran
      const D_obs = leagueFingerprint?.leagueDrawRate
        ?? leagueFingerprint?.leagueDrawRate_std
        ?? ((allMetrics.leagueDrawTendency ?? 1.0) * 0.25);
      // Poisson tahmin: lig lambda'sında simetrik her k için P(k,k)
      let D_poiss = 0;
      for (let k = 0; k <= 7; k++) {
        D_poiss += poissonPMF(k, lambdaLg) * poissonPMF(k, lambdaLg);
      }
      // Paydaki ıslaklık katsayısı: 0-0 ve 1-1 üzerindeki etki
      const P00 = Math.pow(poissonPMF(0, lambdaLg), 2);
      const P11 = Math.pow(poissonPMF(1, lambdaLg), 2);
      const denom = P00 * lambdaLg * lambdaLg + P11;
      const raw = denom > 0.001 ? -(D_obs - D_poiss) / denom : -0.10; // denom ≈ 0 → hesaplama anlamsız, evrensel fallback
      // Gerçekçi aralık: [-0.20, 0.00]
      return Math.max(-0.20, Math.min(0.00, raw));
    })();

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
      return Math.max(0.10, Math.min(0.45, dispSignal * relFactor * 2.5)); // Backtest: daha geniş skor yelpazesi için artırıldı
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
    const _cvBoost = _cv != null ? Math.min(0.50, _cv * 1.2) : 0.30;
    // Nihai: CV boost × örneklem güveni, sınırlar veri miktarına bağlı dinamik
    const _pwLower = Math.max(0.05, _nWeight * 0.15);
    const _pwUpper = Math.min(0.60, 0.30 + _nWeight * 0.30);
    const profileWeight = Math.max(_pwLower, Math.min(_pwUpper, _cvBoost * (0.5 + 0.5 * _nWeight)));

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
        // M134d: Bookmaker BTTS Yes implied probability (Shin-transformed %)
        // Güvenilirlik: Poisson ile arası ne kadar yakınsa o kadar yüksek
        // (piyasanın bağımsız bir prior olduğunu varsayıyoruz — veri kaynağı farklı)
        const _bttsOddsRaw = contextual?.M134d ?? null;
        if (_bttsOddsRaw != null) {
          const bttsOddsProb = _bttsOddsRaw / 100; // 0-1'e normalize
          // Piyasa ve Poisson arasındaki mesafeye ters orantılı güven
          // Yakınsa piyasaya güven yüksek, uzaksa düşük (piyasa hata yapmış olabilir)
          const _bttsDiv = Math.abs(P_btts_raw - bttsOddsProb) / Math.max(P_btts_raw, bttsOddsProb, 0.01);
          const _bttsOddsRel = Math.max(0.1, 1 - _bttsDiv); // min 0.1 güven korunur
          bttsRateSources.push({ rate: bttsOddsProb, rel: _bttsOddsRel });
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
