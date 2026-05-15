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
    leagueFingerprint,
    homeTeamId, awayTeamId } = allMetrics;

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
  // Dinamik sınırlar: CV'den türer. Üst/alt sabit cap KALDIRILDI — xG/actual oranı
  // ligin gerçek volatilitesine göre 0.30-3.00 arası dalgalanabilir.
  // _cvEarly yoksa hesaplama atlanır (null ratio → düzeltme uygulanmaz).
  const _cvEarly = (vol != null && leagueAvgGoals > 0) ? vol / leagueAvgGoals : null;
  // CV=0.3 → bounds [0.7, 1.3]; CV=0.5 → [0.5, 1.5]; CV=1.0 → [0, 2]
  const _xgLowerBound = _cvEarly != null ? Math.max(0, 1.0 - _cvEarly * 2) : null;
  const _xgUpperBound = _cvEarly != null ? 1.0 + _cvEarly * 2 : null;
  let xGCorrectionFactor = null;
  let _xgCorrectionSkipReason = null;
  if (_xGToActualRatio == null) {
    _xgCorrectionSkipReason = 'no xG or league avg data';
  } else if (_xgLowerBound == null || _xgUpperBound == null) {
    // CV verisi yok → düzeltme atlanır
    _xgCorrectionSkipReason = 'no league CV for bounds';
  } else if (_xGToActualRatio < _xgLowerBound || _xGToActualRatio > _xgUpperBound) {
    _xgCorrectionSkipReason = `ratio ${_xGToActualRatio.toFixed(3)} out of CV-derived bounds [${_xgLowerBound.toFixed(2)}, ${_xgUpperBound.toFixed(2)}]`;
    console.warn(`[AdvancedDerived] xGCorrectionFactor skipped: ${_xgCorrectionSkipReason}`);
  } else {
    xGCorrectionFactor = _xGToActualRatio;
  }

  // _blendRate: 5. parametre olarak scoreProfile.avgConceded eklendi.
  // homeAtkRaw → rakibin (away) yediği gol ortalaması (awayScoreProfile.avgConceded) kullanılır.
  // awayAtkRaw → rakibin (home) yediği gol ortalaması (homeScoreProfile.avgConceded) kullanılır.
  // Ağırlık = profil örneklemi (n) * 0.5: standings/xG kadar güvenmiyor ama yok saymıyoruz.
  // _blendRate: ağırlıklı ortalama + KAYNAK AGREEMENT (kaynaklar arası tutarlılık).
  // Kaynaklar (xG, standings, M002, M001, scoreProfile) birbiriyle tutarlıysa
  // → agreement~1 → modelin "ne kadar emin" olduğu yüksek.
  // Kaynaklar çelişiyorsa → agreement~0 → asimetri kapatılmalı (güvenli tahmin).
  const _blendRate = (xg, stSpec, m002, m001, nSt, matchCount, profileConceded, profileN) => {
    const sources = [];
    // xG kaynağı: yalnızca düzeltme bilinmiyorsa (faktör==1 nötr) veya CV-bound
    // içindeyse eklenir. Bound dışındaysa (lig xG modeli outlier/güvensiz) xg
    // kaynak olarak DAHİL EDİLMEZ — aksi halde ham xG sistematik deflasyon yapar.
    const xgUsable = (xg != null && (
      xGCorrectionFactor != null ||
      _xgCorrectionSkipReason === 'no xG or league avg data' ||  // lig xG yoksa: zaten dokunamıyoruz
      _xgCorrectionSkipReason === 'no league CV for bounds'      // CV yok: zaten dokunamıyoruz
    ));
    if (xgUsable) {
      const xgCorrected = xGCorrectionFactor != null ? xg * xGCorrectionFactor : xg;
      // xg ağırlığı: matchCount'tan Bayesian shrinkage (statik 5 cap kalktı — Faz 2.2)
      const xgW = matchCount > 0 ? matchCount / (matchCount + Math.sqrt(matchCount + 1)) : 0;
      if (isFinite(xgCorrected) && xgW > 0) sources.push({ val: xgCorrected, w: xgW, src: 'xg' });
    }
    // Standings (sezon boyu): n / (n + sqrt(n+1)) — Bayesian shrinkage
    if (stSpec != null && nSt > 0) {
      const stW = nSt / (nSt + Math.sqrt(nSt + 1));
      sources.push({ val: stSpec, w: stW, src: 'st' });
    }
    // M002 (lig içi son N maçtan home/away aware): matchCount'tan shrinkage
    // Statik /2 ve floor=1 cap'i kalktı — Bayesian güven n'den geliyor.
    if (m002 != null && matchCount > 0) {
      const m002W = matchCount / (matchCount + Math.sqrt(matchCount + 1));
      sources.push({ val: m002, w: m002W, src: 'm002' });
    }
    // M001 (genel ortalama): matchCount'tan shrinkage
    if (m001 != null && matchCount > 0) {
      const m001W = matchCount / (matchCount + Math.sqrt(matchCount + 1));
      sources.push({ val: m001, w: m001W, src: 'm001' });
    }
    // scoreProfile.avgConceded: profileN'den shrinkage. Statik *0.5 cap'i kalktı.
    if (profileConceded != null && profileN > 0) {
      const profW = profileN / (profileN + Math.sqrt(profileN + 1));
      sources.push({ val: profileConceded, w: profW, src: 'profile' });
    }
    if (sources.length === 0) return { rate: null, agreement: 0, n_sources: 0, sources: [] };
    // ── Korelasyon Shrinkage — Çift Sayım Önleme ─────────────────────────
    // Sorun: M001 (genel ortalama) ve M002 (ev/dep aware) AYNI temel istatistiği
    // farklı pencereden gösteriyor — bağımsız değiller. xG ile M001 da yüksek
    // korelasyona sahip (her ikisi de gol ortalaması).
    //
    // Çözüm: Kaynak çiftleri arasındaki Pearson benzeri korelasyonu
    // değerlerin yakınlığından türet:
    //   ρ_ij = 1 - |v_i - v_j| / (v_i + v_j)   (oranlı yakınlık)
    // Yüksek korelasyon → efektif ağırlık düşür:
    //   w_eff_i = w_i × (1 - mean(ρ_ij, j≠i)) + (eşit dağılım için kalan)
    // İki kaynak özdeş ise efektif ağırlığı yarıya iner.
    const _correlationShrink = (srcs) => {
      if (srcs.length <= 1) return srcs;
      const corrFactors = srcs.map((s, i) => {
        let avgCorr = 0;
        let count = 0;
        for (let j = 0; j < srcs.length; j++) {
          if (i === j) continue;
          const denom = Math.abs(s.val) + Math.abs(srcs[j].val);
          const corr = denom > 0
            ? 1 - Math.abs(s.val - srcs[j].val) / denom
            : 0; // her ikisi 0 → tanımsız, sıfır say
          avgCorr += Math.max(0, Math.min(1, corr));
          count++;
        }
        return count > 0 ? avgCorr / count : 0;
      });
      // Efektif ağırlık: tam korelasyonda (ρ=1) ağırlık 1/n_correlated'a düşer.
      return srcs.map((s, i) => ({
        ...s,
        w: s.w * (1 - corrFactors[i] * (srcs.length - 1) / srcs.length),
      }));
    };
    const shrunken = _correlationShrink(sources);
    const totalW = shrunken.reduce((s, x) => s + x.w, 0);
    if (totalW <= 0) return { rate: null, agreement: 0, n_sources: 0, sources: [] };
    const rate = shrunken.reduce((s, x) => s + x.val * x.w, 0) / totalW;
    // sources artık shrunken — agreement ve nEff aşağıda aynı set üzerinden
    sources.length = 0;
    sources.push(...shrunken);
    // Source agreement: kaynaklar arası tutarlılık × etkin kaynak sayısı.
    //   consistency = weighted_geomean / weighted_arith_mean ∈ (0, 1]
    //     (Jensen eşitsizliği — her zaman ≤ 1, kaynaklar aynıysa = 1)
    //   n_eff = (Σw)² / Σw²   (Kish effective sample — ağırlıkça eşit dağılım = n_sources)
    //   agreement = consistency × (n_eff - 1) / n_eff
    //     - n_eff=1 (tek dominant kaynak) → 0  (validation yok)
    //     - n_eff=2 mükemmel uyum         → 0.50
    //     - n_eff=3 mükemmel uyum         → 0.67
    //     - n_eff→∞                       → consistency (doyum)
    // Kaynak sayısına göre doğal kademelenme; sabit eşik yok.
    let agreement = 0;
    if (sources.length >= 1 && rate > 0 && sources.every(s => s.val > 0)) {
      const wLogMean = sources.reduce((s, x) => s + x.w * Math.log(x.val), 0) / totalW;
      const geoMean = Math.exp(wLogMean);
      const consistency = Math.max(0, Math.min(1, geoMean / rate));
      const sumWSq = sources.reduce((s, x) => s + x.w * x.w, 0);
      const nEff = sumWSq > 0 ? (totalW * totalW) / sumWSq : 1;
      const nEffFactor = nEff > 1 ? (nEff - 1) / nEff : 0;
      agreement = consistency * nEffFactor;
    }
    return { rate, agreement, n_sources: sources.length, sources: sources.map(s => ({ val: s.val, w: s.w, src: s.src })) };
  };

  const _hAtk = _blendRate(homeXGScored, homeStGF, homeAttack.M002, homeAttack.M001, homeStMatches, homeMatchCount,
    awayScoreProfile?.avgConceded, awayScoreProfile?.n);
  const _aDef = _blendRate(awayXGConceded, awayStGA, awayDefense.M027, awayDefense.M026, awayStMatches, awayMatchCount,
    awayScoreProfile?.avgConceded, awayScoreProfile?.n);
  const _aAtk = _blendRate(awayXGScored, awayStGF, awayAttack.M002, awayAttack.M001, awayStMatches, awayMatchCount,
    homeScoreProfile?.avgConceded, homeScoreProfile?.n);
  const _hDef = _blendRate(homeXGConceded, homeStGA, homeDefense.M027, homeDefense.M026, homeStMatches, homeMatchCount,
    homeScoreProfile?.avgConceded, homeScoreProfile?.n);
  const homeAtkRaw = _hAtk.rate;
  const awayDefRaw = _aDef.rate;
  const awayAtkRaw = _aAtk.rate;
  const homeDefRaw = _hDef.rate;
  // Match-spesifik source agreement: her λ için kullanılan iki kaynak ailesinin minimum tutarlılığı.
  // λ_home Bayern atak + PSG defans kaynaklarından türer → ikisinin de tutarlı olması gerek.
  // Tek kaynak çelişkili olsa bile asimetri kapatılır (güvenli tahmin).
  const _agreementHome = Math.min(_hAtk.agreement, _aDef.agreement);
  const _agreementAway = Math.min(_aAtk.agreement, _hDef.agreement);

  // ── Lambda Audit Tracer ───────────────────────────────────────────────────
  // Her λ transformation aşamasında before/after, log-delta ve modifier metası
  // kaydedilir. Çıktı prediction.lambdaAudit altına serileştirilir; UI'ya
  // sızdırılmaz, backtest dump'larında debugging için kullanılır.
  // Statik eşik yok; kayıt bilgisi ham veridir.
  const _ldTrace = [];
  const _logRatio = (a, b) => (a == null || b == null || a <= 0 || b <= 0) ? null : Math.log(a / b);
  const _pushTrace = (stage, hB, hA, aB, aA, meta) => {
    _ldTrace.push({
      stage,
      hBefore: hB != null ? Number(hB.toFixed(6)) : null,
      hAfter:  hA != null ? Number(hA.toFixed(6)) : null,
      aBefore: aB != null ? Number(aB.toFixed(6)) : null,
      aAfter:  aA != null ? Number(aA.toFixed(6)) : null,
      dLogH:   (() => { const x = _logRatio(hA, hB); return x == null ? null : Number(x.toFixed(6)); })(),
      dLogA:   (() => { const x = _logRatio(aA, aB); return x == null ? null : Number(x.toFixed(6)); })(),
      meta: meta || null,
    });
  };
  const _ldDiag = {
    sources: {
      hAtk: { n: _hAtk.n_sources, agreement: _hAtk.agreement, rate: _hAtk.rate },
      aDef: { n: _aDef.n_sources, agreement: _aDef.agreement, rate: _aDef.rate },
      aAtk: { n: _aAtk.n_sources, agreement: _aAtk.agreement, rate: _aAtk.rate },
      hDef: { n: _hDef.n_sources, agreement: _hDef.agreement, rate: _hDef.rate },
    },
    agreementHome: _agreementHome,
    agreementAway: _agreementAway,
  };


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

  // ── Dixon-Coles + Match-Spesifik Asimetri Açıcı ──────────────────────────
  // Standart Dixon-Coles: λ = α × β × leagueAvg.
  // Açıcı: λ = leagueAvg × (α × β)^k_match.
  //
  // k_match = 1 + lgCV × source_agreement
  //   - lgCV: lig volatilitesi (gol dağılımının CV'si)
  //   - source_agreement: takım atak/defans kaynaklarının (xG, standings, M001,
  //     scoreProfile) birbirleriyle ne kadar tutarlı olduğu [0, 1]
  //
  // - Kaynaklar tutarlı (Bayern xG=2.1, std=2.0, M001=2.05): agreement~0.95
  //     → k=1+lgCV×0.95 → asimetri tam açık → 4-0 mümkün
  // - Kaynaklar çelişkili (xG=2.5, std=1.5, M001=2.0): agreement~0.7
  //     → k=1+lgCV×0.7 → asimetri yumuşak → güvenli orta tahmin
  // - Tek kaynak veya yeni takım: agreement=0
  //     → k=1 → standart Dixon-Coles, asimetri kapalı
  //
  // Tüm parametreler veriden (lgCV, agreement). Statik katsayı YOK.
  // Çift sayım yok: agreement xGOverPerf/cleanSheet modifier'larıyla ÇAKIŞMAZ
  // çünkü bu modifier'lar lambda'ya çarpan olarak uygulanır, k exponent'i ayrı.
  // _cv burada lokal hesaplanır (TDZ: aşağıdaki const _cv tanımı bu satırın ALTINDA).
  const _cvLocal = (vol != null && leagueAvgGoals > 0) ? vol / leagueAvgGoals : null;
  // ── BAYESIAN α/β SHRINKAGE — düşük örneklem → α/β nötr (1.0) ──
  // Sorun: scoreProfile.n=2 olunca atkR varyansı çok yüksek; α=1.5 olduğunda
  // "asimetri tam açık" gibi davranıyor ama bu sadece 2 maçın gürültüsü olabilir.
  // Çözüm: α_shrunk = α × rel + 1.0 × (1-rel)
  //   rel = profileShare × sourceAgreement   (her ikisi de dinamik veriden)
  //   profileShare = profileN / (profileN + sqrt(profileN+1))  Bayesian
  //   sourceAgreement = _blendRate çıktısı (kaynaklar arası tutarlılık)
  // Bu, _blendRate'in döndüğü "agreement" sinyalini α/β'ya direkt uygular.
  // Çift sayım yok: kMatch agreement'i exponentte kullanıyor (asimetri sertliği),
  // burada agreement α/β'yı 1.0'a çekiyor (asimetri büyüklüğü). Birbirini tamamlar.
  const _shrinkAB = (rate, agreement) => {
    if (rate == null || leagueAvgGoals == null || leagueAvgGoals <= 0) return null;
    const raw = rate / leagueAvgGoals;
    const rel = Math.max(0, Math.min(1, agreement ?? 0));
    // Düşük rel → α/β → 1.0; Yüksek rel → raw değer korunur
    return raw * rel + 1.0 * (1 - rel);
  };
  const _dcBase = (atkR, defR_opp, agreement) => {
    if (atkR == null || defR_opp == null || leagueAvgGoals == null || leagueAvgGoals <= 0) return { lambda: null, alpha: null, beta: null, kMatch: null };
    // Bayesian shrinkage: agreement düşükse 1.0'a doğru çek
    const alpha = _shrinkAB(atkR, agreement);
    const beta  = _shrinkAB(defR_opp, agreement);
    const ab = alpha * beta;
    if (ab <= 0) return { lambda: null, alpha, beta, kMatch: null };
    const kMatch = (_cvLocal != null && _cvLocal > 0) ? 1 + _cvLocal * agreement : 1;
    return { lambda: leagueAvgGoals * Math.pow(ab, kMatch), alpha, beta, kMatch };
  };
  const _dcH = _dcBase(homeAttackRate_source, awayDefenseRate_source, _agreementHome);
  const _dcA = _dcBase(awayAttackRate_source, homeDefenseRate_source, _agreementAway);
  const dcBase_home = _dcH.lambda;
  const dcBase_away = _dcA.lambda;
  _ldDiag.kMatchHome = _dcH.kMatch;
  _ldDiag.kMatchAway = _dcA.kMatch;
  _ldDiag.alphaHome = _dcH.alpha;
  _ldDiag.betaHome  = _dcH.beta;
  _ldDiag.alphaAway = _dcA.alpha;
  _ldDiag.betaAway  = _dcA.beta;
  _ldDiag.cvLocal   = _cvLocal;
  _ldDiag.leagueAvgGoals = leagueAvgGoals;
  _pushTrace('dcBase', null, dcBase_home, null, dcBase_away, {
    kMatchHome: _dcH.kMatch, kMatchAway: _dcA.kMatch,
    agreementHome: _agreementHome, agreementAway: _agreementAway,
  });

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
    // Takım gol ortalamalarının sapmasından CV tahmini — STATİK CLAMP YOK.
    // Spread/(leagueAvg×2) zaten doğal bir [0,1) oranı; ek clamp anlamsız.
    const hGoal = homeAttack?.M001 ?? homeAttack?.M002;
    const aGoal = awayAttack?.M001 ?? awayAttack?.M002;
    if (hGoal != null && aGoal != null && leagueAvgGoals > 0) {
      const spread = Math.abs(hGoal - aGoal);
      const cvEstimate = spread / (leagueAvgGoals * 2);
      return leagueAvgGoals * cvEstimate;
    }
    // Son çare: dynamicAvgs.M001 ile oranlama — statik clamp kaldırıldı
    const dynM001 = allMetrics.dynamicAvgs?.M001;
    if (dynM001 != null && dynM001 > 0) {
      return leagueAvgGoals * Math.abs(leagueAvgGoals - dynM001) / leagueAvgGoals;
    }
    return null; // Gerçekten veri yoksa null — sabit yok
  })();
  // Lambda tavanı — TAKIM × TURNUVA SPESİFİK (lig tipikleştirmesi YOK).
  //
  // Mantık: λ_home maksimum = home takımının kendi atış kapasitesi ⊕ rakibin
  // kendi savunma zafiyeti. İki tarafın 95% güven üst sınırlarının ortalaması.
  // scoreProfile zaten tournament-filtered (Bayern UCL maçı → UCL maçları).
  //
  // Hiyerarşi:
  //   1. Match-spesifik: home/away scoreProfile'dan Bayesian bound (mevcutsa)
  //   2. Lig fallback: leagueAvg × normMaxRatio² (statistik üst sınır)
  //   3. Fiziksel fallback: SIM_CONFIG.LIMITS.LAMBDA.MAX
  //
  // Bayesian bound: avgScored + 2σ = takımın kendi tarihindeki 95% percentile.
  // Bu takımın bu turnuvadaki "olabilecek en yüksek" gol oranı.
  const _matchLambdaBound = (homeRoleProfile, awayOpponentProfile, isMax) => {
    if (!homeRoleProfile || !awayOpponentProfile) return null;
    const hAvg = homeRoleProfile.avgScored;
    const hStd = homeRoleProfile.stdScored;
    const aAvg = awayOpponentProfile.avgConceded;
    const aStd = awayOpponentProfile.stdConceded;
    if (hAvg == null || hStd == null || aAvg == null || aStd == null) return null;
    // Bayesian güven aralığı — örneklem büyüklüğüne sürekli bağımlı.
    // z(n) = 1.96 + 1.5 / sqrt(n)
    //   - 1.96: normal dağılımın %95 iki-yanlı kuyruk eşiği (matematiksel limit)
    //   - 1.5/sqrt(n): Student-t düzeltmesi yaklaşımı (n→∞ → 0)
    // Tablo: n=5→2.63, n=10→2.43, n=20→2.30, n=50→2.17, n=∞→1.96
    // Sürekli formül; üç-aşamalı sıçrama yok (Faz 3.2).
    const nMin = Math.min(homeRoleProfile.n || 0, awayOpponentProfile.n || 0);
    if (nMin < 1) return null;
    const z = 1.96 + 1.5 / Math.sqrt(nMin);
    if (isMax) {
      // Üst sınır: takımın atak %95 + rakibin savunma açıklığı %95, ortalama
      const hUp = hAvg + z * hStd;
      const aUp = aAvg + z * aStd;
      return (hUp + aUp) / 2;
    } else {
      // Alt sınır: takımın atak %5 + rakibin savunma sıkılığı %5
      const hDn = Math.max(0, hAvg - z * hStd);
      const aDn = Math.max(0, aAvg - z * aStd);
      return Math.max(SIM_CONFIG.LIMITS.LAMBDA.MIN, (hDn + aDn) / 2);
    }
  };

  // ── Asimetrik clamp (Faz 3.1) ────────────────────────────────────────────
  // Eski tek ortak min/max yerine her λ kendi tarafının (atak × rakip savunma)
  // bound'una clamp edilir. Bu sayede defansif rakip lambda_home tabanını
  // boğmaz; agresif rakip lambda_away tavanını anormal yukarı çekmez.
  const _lambdaBoundsFallbackMax = (() => {
    if (leagueAvgGoals != null && leagueAvgGoals > 0 && allMetrics.normMaxRatio != null) {
      return leagueAvgGoals * allMetrics.normMaxRatio * allMetrics.normMaxRatio;
    }
    if (leagueAvgGoals != null && _volForMax != null) {
      return leagueAvgGoals + _volForMax * 3;
    }
    return SIM_CONFIG.LIMITS.LAMBDA.MAX;
  })();
  const _lambdaBoundsFallbackMin = (() => {
    if (leagueAvgGoals != null && leagueAvgGoals > 0 && allMetrics.normMinRatio != null) {
      return Math.max(SIM_CONFIG.LIMITS.LAMBDA.MIN,
        leagueAvgGoals * allMetrics.normMinRatio * allMetrics.normMinRatio);
    }
    if (leagueAvgGoals != null && _volForMax != null) {
      return Math.max(SIM_CONFIG.LIMITS.LAMBDA.MIN,
        leagueAvgGoals * Math.max(0, 1 - _volForMax / leagueAvgGoals));
    }
    return SIM_CONFIG.LIMITS.LAMBDA.MIN;
  })();
  const _lambdaHomeMax = _matchLambdaBound(homeScoreProfile, awayScoreProfile, true) ?? _lambdaBoundsFallbackMax;
  const _lambdaAwayMax = _matchLambdaBound(awayScoreProfile, homeScoreProfile, true) ?? _lambdaBoundsFallbackMax;
  const _lambdaHomeMin = _matchLambdaBound(homeScoreProfile, awayScoreProfile, false) ?? _lambdaBoundsFallbackMin;
  const _lambdaAwayMin = _matchLambdaBound(awayScoreProfile, homeScoreProfile, false) ?? _lambdaBoundsFallbackMin;
  // Geriye uyumluluk: bazı yerlerde dynamicLambdaMin/Max kullanılıyor olabilir;
  // her λ için kendi sınırları. Bu birleşik değer artık SADECE legacy referans.
  const dynamicLambdaMax = Math.max(_lambdaHomeMax, _lambdaAwayMax);

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

  // urgencyFactor: önce GOL_IHTIYACI unit'inden (M171/M172/M188/M189) dene.
  // NaN/null → fingerprint'in teamPpgMap'inden takım PPG'sinin lig ortalamasından
  // sapmasıyla türet (standings yoksa pool-based, leak-safe).
  // Mantık: ratio = teamPPG / leaguePPG; sapma kuvvetlendikçe (her iki yönde) urgency ↑.
  //   ratio=1   → urgency=1.0 (nötr)
  //   ratio=1.5 (top team) → urgency = 1 + |0.5| * ptsCV (şampiyonluk baskısı)
  //   ratio=0.5 (relegasyon) → urgency = 1 + |0.5| * ptsCV (düşme paniği)
  // Bu signal absolute deviation × ptsCV ile ölçeklendiğinden lig dinamiğine duyarlı.
  const _urgFactorH_raw = homeUnits.GOL_IHTIYACI;
  const _urgFactorA_raw = awayUnits.GOL_IHTIYACI;
  const _isUrgValid = v => v != null && isFinite(v) && v !== 1.0; // 1.0 = nötr/varsayılan, sinyal yok
  const _ppgMap = leagueFingerprint?.teamPpgMap ?? {};
  const _lgPPG = leagueFingerprint?.leagueAvgPPG ?? null;
  const _ptsCV_dyn = _lgPtsCV; // yukarıda hesaplandı
  const _urgFromPpg = (teamId) => {
    if (teamId == null || _lgPPG == null || _lgPPG <= 0 || _ptsCV_dyn == null) return null;
    const t = _ppgMap[teamId] || _ppgMap[String(teamId)];
    if (!t || t.ppg == null) return null;
    const ratio = t.ppg / _lgPPG;
    // Absolute deviation × ptsCV — pozisyon ne kadar uçtaysa o kadar urgency
    return 1.0 + Math.abs(ratio - 1.0) * _ptsCV_dyn;
  };
  const urgencyFactorHome = _isUrgValid(_urgFactorH_raw)
    ? _urgFactorH_raw
    : (_urgFromPpg(homeTeamId) ?? 1.0);
  const urgencyFactorAway = _isUrgValid(_urgFactorA_raw)
    ? _urgFactorA_raw
    : (_urgFromPpg(awayTeamId) ?? 1.0);
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

  // Legacy birleşik min — sadece agreement/diag için referans.
  const dynamicLambdaMin = Math.min(_lambdaHomeMin, _lambdaAwayMin);
  // Behav + urgency mod uygulaması — pre/post ayrı kayıt için
  const _hAfterBehav = (dcBase_home != null) ? dcBase_home * behavMod_home : null;
  const _aAfterBehav = (dcBase_away != null) ? dcBase_away * behavMod_away : null;
  _pushTrace('behavMod', dcBase_home, _hAfterBehav, dcBase_away, _aAfterBehav, {
    behavModHome: behavMod_home, behavModAway: behavMod_away, BEHAV_SENS,
  });
  const _hAfterUrg = (_hAfterBehav != null) ? _hAfterBehav * lambdaMod_home : null;
  const _aAfterUrg = (_aAfterBehav != null) ? _aAfterBehav * lambdaMod_away : null;
  _pushTrace('urgencyMod', _hAfterBehav, _hAfterUrg, _aAfterBehav, _aAfterUrg, {
    lambdaModHome: lambdaMod_home, lambdaModAway: lambdaMod_away, URGENCY_SENS,
  });

  let lambda_home = (dcBase_home != null)
    ? clamp(_hAfterUrg, _lambdaHomeMin, _lambdaHomeMax)
    : null;
  let lambda_away = (dcBase_away != null)
    ? clamp(_aAfterUrg, _lambdaAwayMin, _lambdaAwayMax)
    : null;
  _ldDiag.dynamicLambdaMin = dynamicLambdaMin;
  _ldDiag.dynamicLambdaMax = dynamicLambdaMax;
  _ldDiag.lambdaHomeMin = _lambdaHomeMin;
  _ldDiag.lambdaHomeMax = _lambdaHomeMax;
  _ldDiag.lambdaAwayMin = _lambdaAwayMin;
  _ldDiag.lambdaAwayMax = _lambdaAwayMax;
  _ldDiag.clampHomeMinHit = (_hAfterUrg != null && _hAfterUrg < _lambdaHomeMin) || false;
  _ldDiag.clampHomeMaxHit = (_hAfterUrg != null && _hAfterUrg > _lambdaHomeMax) || false;
  _ldDiag.clampAwayMinHit = (_aAfterUrg != null && _aAfterUrg < _lambdaAwayMin) || false;
  _ldDiag.clampAwayMaxHit = (_aAfterUrg != null && _aAfterUrg > _lambdaAwayMax) || false;
  _pushTrace('initialClamp', _hAfterUrg, lambda_home, _aAfterUrg, lambda_away, {
    lambdaHomeMin: _lambdaHomeMin, lambdaHomeMax: _lambdaHomeMax,
    lambdaAwayMin: _lambdaAwayMin, lambdaAwayMax: _lambdaAwayMax,
    clampHomeMinHit: _ldDiag.clampHomeMinHit,
    clampHomeMaxHit: _ldDiag.clampHomeMaxHit,
    clampAwayMinHit: _ldDiag.clampAwayMinHit,
    clampAwayMaxHit: _ldDiag.clampAwayMaxHit,
  });

  // ── Lineup Quality Ratio (LQR) — Kadro kalitesi lambda düzeltmesi ──
  // Workshop'ta kadro değiştiğinde baseline.homeLineupQualityRatio != 1.0 olur.
  // Lambda'ya sqrt damping ile uygulanır:
  //   Örnek: 11'in ortalaması 85 → 65'e düştüyse ratio=0.765 → sqrt=0.875 → lambda %12.5 düşer
  //   Bu, tüm Poisson çıktılarını (1X2, O/U, BTTS, skor) direkt etkiler.
  // LQR — Workshop kadro değişikliği oranı (ana kaynak: baseline.homeLineupQualityRatio).
  // Pre-match'te değişiklik yok → 1.0. Bu durumda DİNAMİK FALLBACK devreye girer:
  //   PVKD breakdown'dan iki takımın total MV'lerinin geometrik nötr noktaya oranı.
  //   homeLQR = sqrt(homeMV / geoMean(homeMV, awayMV))
  //   awayLQR = sqrt(awayMV / geoMean(homeMV, awayMV))
  // Geo-mean nötr çünkü iki takımın kalitesinin geometrik ortası "fair maç" referansı.
  // sqrt damping zaten kod altında uygulanıyor → çift sqrt yok, MV ratio direkt.
  // Çift sayım riski: dcBase α/β gerçek gol oranlarına dayalı (sezon istatistiği);
  // LQR piyasa değerine dayalı (transfer market) → bağımsız kaynak.
  const _hMV = (homeMVBreakdown && homeMVBreakdown.total > 0) ? homeMVBreakdown.total : null;
  const _aMV = (awayMVBreakdown && awayMVBreakdown.total > 0) ? awayMVBreakdown.total : null;
  const _mvGeo = (_hMV != null && _aMV != null) ? Math.sqrt(_hMV * _aMV) : null;
  const _hLQRfromMV = (_hMV != null && _mvGeo != null && _mvGeo > 0) ? _hMV / _mvGeo : null;
  const _aLQRfromMV = (_aMV != null && _mvGeo != null && _mvGeo > 0) ? _aMV / _mvGeo : null;
  // Bayesian shrinkage: lig CV ile ölçekle. Sönük lig (low CV) → MV ratio etkisi düşük.
  // CV yoksa nötr 1.0. cvLocal yukarıda hesaplandı (_cvLocal).
  const _lqrSens = (_cvLocal != null && _cvLocal > 0) ? Math.min(1.0, _cvLocal) : 0;
  const _shrinkLQR = (r) => (r != null) ? 1.0 + (r - 1.0) * _lqrSens : 1.0;

  const _hLQR_raw = allMetrics.homeLineupQualityRatio ?? 1.0;
  const _aLQR_raw = allMetrics.awayLineupQualityRatio ?? 1.0;
  // Workshop'tan gelen LQR varsa öncelik onun. Yoksa MV-based fallback.
  const _hLQR = (_hLQR_raw !== 1.0) ? _hLQR_raw : _shrinkLQR(_hLQRfromMV);
  const _aLQR = (_aLQR_raw !== 1.0) ? _aLQR_raw : _shrinkLQR(_aLQRfromMV);
  const _hBeforeLQR = lambda_home;
  const _aBeforeLQR = lambda_away;
  if (_hLQR !== 1.0 && lambda_home != null && isFinite(_hLQR)) {
    lambda_home = clamp(lambda_home * Math.sqrt(_hLQR), _lambdaHomeMin, _lambdaHomeMax);
  }
  if (_aLQR !== 1.0 && lambda_away != null && isFinite(_aLQR)) {
    lambda_away = clamp(lambda_away * Math.sqrt(_aLQR), _lambdaAwayMin, _lambdaAwayMax);
  }
  // Trace daima push (observability): mod=1.0 olsa bile stage'in görülmesi gerekir.
  _pushTrace('lqr', _hBeforeLQR, lambda_home, _aBeforeLQR, lambda_away, {
    hLQR: _hLQR, aLQR: _aLQR,
    hLQRfromMV: _hLQRfromMV, aLQRfromMV: _aLQRfromMV,
    hMV: _hMV, aMV: _aMV, lqrSens: _lqrSens,
  });

  // ── Değişiklik 4: xGOverPerformance → lambda modifiyesi ──────────────────
  // xGOverPerf = gerçek gol ort. / xG ort. → >1 beklentiden fazla gol atıyor (clinical)
  // Kaynak: homeXGScored (xG), homeAttack.M001 veya homeScoreProfile.avgScored (gerçek)
  // Hassasiyet = _cv × (1 - normMinRatio) — standings'ten, sıfır statik
  // _xgSens: CV ve normMinRatio'dan türer. Statik 0.35 fallback KALDIRILDI —
  // veriler eksikse null → modülasyon uygulanmaz.
  const _xgSens = (_cv != null && allMetrics.normMinRatio != null)
    ? _cv * (1.0 - allMetrics.normMinRatio)
    : (_cv != null ? _cv : null);  // Veri yoksa CV tek başına (yumuşak)

  const _homeActualGoals = homeAttack?.M001 ?? homeScoreProfile?.avgScored ?? null;
  const _awayActualGoals = awayAttack?.M001 ?? awayScoreProfile?.avgScored ?? null;

  // xG fallback — cache'te expectedGoals yoksa scoreProfile'dan dinamik proxy üret.
  // Mantık: "expected" = takımın gol attığı maçlarda göreceli verimlilik.
  //   xgProxy = avgScored / scoringRate  (gol başına maç oranı — clinical capacity)
  //   lgProxy = leagueAvgGoals / leagueScoringRate  (lig referansı, pool-driven)
  //   overPerf = (xgProxy / lgProxy) — 1.0 = nötr, >1.0 = clinical, <1.0 = tutuk
  // Bu xG ile aynı bilgiyi taşımaz ama bağımsız bir verimlilik sinyalidir.
  // dcBase α ile farklı (α gol/maç oranı; bu gol/scoring-event yoğunluğu).
  const _lgSR = leagueFingerprint?.leagueScoringRate ?? null;
  const _lgGProxy = (leagueAvgGoals != null && _lgSR != null && _lgSR > 0)
    ? leagueAvgGoals / _lgSR : null;
  const _xgProxy = (avg, sr) => (avg != null && sr != null && sr > 0) ? avg / sr : null;
  const _hXgProxy = _xgProxy(homeScoreProfile?.avgScored, homeScoreProfile?.scoringRate);
  const _aXgProxy = _xgProxy(awayScoreProfile?.avgScored, awayScoreProfile?.scoringRate);

  const _homeXGOverPerf = (homeXGScored != null && homeXGScored > 0 && _homeActualGoals != null)
    ? _homeActualGoals / homeXGScored
    : ((_hXgProxy != null && _lgGProxy != null && _lgGProxy > 0) ? _hXgProxy / _lgGProxy : null);
  const _awayXGOverPerf = (awayXGScored != null && awayXGScored > 0 && _awayActualGoals != null)
    ? _awayActualGoals / awayXGScored
    : ((_aXgProxy != null && _lgGProxy != null && _lgGProxy > 0) ? _aXgProxy / _lgGProxy : null);

  // Faz 4.1: xgOverPerf modifier — reliability-shrinkage ile uygulanır.
  // matchCount düşükse mod^reliability ile tam etki azaltılır (Bayesian shrinkage).
  // _xgSens zaten cv × (1-normMin) ile ölçeklenmiş; ek shrinkage match-count'tan.
  const _hBeforeXG = lambda_home;
  const _aBeforeXG = lambda_away;
  let _xgModH = null, _xgModA = null;
  const _xgRelH = (homeMatchCount > 0)
    ? homeMatchCount / (homeMatchCount + Math.sqrt(homeMatchCount + 1)) : 0;
  const _xgRelA = (awayMatchCount > 0)
    ? awayMatchCount / (awayMatchCount + Math.sqrt(awayMatchCount + 1)) : 0;
  if (lambda_home != null && _homeXGOverPerf != null && _xgSens != null) {
    _xgModH = clamp(1.0 + (_homeXGOverPerf - 1.0) * _xgSens, 1.0 - _xgSens, 1.0 + _xgSens);
    lambda_home = clamp(lambda_home * Math.pow(_xgModH, _xgRelH), _lambdaHomeMin, _lambdaHomeMax);
  }
  if (lambda_away != null && _awayXGOverPerf != null && _xgSens != null) {
    _xgModA = clamp(1.0 + (_awayXGOverPerf - 1.0) * _xgSens, 1.0 - _xgSens, 1.0 + _xgSens);
    lambda_away = clamp(lambda_away * Math.pow(_xgModA, _xgRelA), _lambdaAwayMin, _lambdaAwayMax);
  }
  // Trace daima push — etki yok da olsa hangi input'un eksik olduğunu görmek için.
  _pushTrace('xgOverPerf', _hBeforeXG, lambda_home, _aBeforeXG, lambda_away, {
    xgModHome: _xgModH, xgModAway: _xgModA,
    xgOverPerfHome: _homeXGOverPerf, xgOverPerfAway: _awayXGOverPerf,
    xgSens: _xgSens,
    homeXGScored, awayXGScored,
    homeActualGoals: _homeActualGoals, awayActualGoals: _awayActualGoals,
    reliabilityHome: _xgRelH, reliabilityAway: _xgRelA,
  });

  // ── Değişiklik 5: Hakem refGoalsPerMatch → lambda ────────────────────────
  // Bu hakemin maçlarında lig ortalamasından gol sapması → simetrik lambda etkisi
  // Hassasiyet = fingerprint.reliability × _cv — her ikisi de veriden
  const _refGPM = allMetrics.referee?.refGoalsPerMatch ?? null;
  const _refRel  = leagueFingerprint?.reliability ?? 0;
  const _refSens = (_refRel > 0 && _cv != null) ? _refRel * _cv : null;

  if (_refGPM != null && leagueAvgGoals != null && leagueAvgGoals > 0 && _refSens != null) {
    const refRatio = _refGPM / (leagueAvgGoals * 2); // maç başı toplam gol normalize
    const refMod = clamp(1.0 + (refRatio - 1.0) * _refSens, 1.0 - _refSens, 1.0 + _refSens);
    const _hBeforeRef = lambda_home;
    const _aBeforeRef = lambda_away;
    if (lambda_home != null) lambda_home = clamp(lambda_home * refMod, _lambdaHomeMin, _lambdaHomeMax);
    if (lambda_away != null) lambda_away = clamp(lambda_away * refMod, _lambdaAwayMin, _lambdaAwayMax);
    _pushTrace('refMod', _hBeforeRef, lambda_home, _aBeforeRef, lambda_away, {
      refMod, refRatio, refSens: _refSens, refGoalsPerMatch: _refGPM,
    });
  }

  // ── Değişiklik 6: cleanSheetRate + scoringRate → lambda baskısı ──────────
  // Ev takımı cleanSheet yüksekse + dep atma oranı düşükse → lambda_away aşağı
  // Simetrik: dep cleanSheet yüksekse + ev atma oranı düşükse → lambda_home aşağı
  // Referans: leagueFingerprint'ten lig geneli cleanSheet oranı
  const _lgCSR = leagueFingerprint?.leagueCleanSheetRate ?? leagueFingerprint?.cleanSheetRate ?? null;

  if (_lgCSR != null && _cv != null && _lgCSR > 0) {
    // Sabit 0.5 ve 0.3 katsayıları KALDIRILDI. Etki büyüklüğü tamamen CV'den türer:
    //   damping = (1 - SR) * CV * (defRatio - 1)
    //   floor   = max(0, 1 - CV)  (CV=1 → tam silinebilir; CV=0 → hiç dokunma)
    const _floor = Math.max(0, 1 - _cv);

    // Ev savunması: homeCSR / lgCSR → >1 güçlü savunma → away gol üretimini baskıla
    const _hCSR = homeScoreProfile?.cleanSheetRate ?? null;
    const _aSR  = awayScoreProfile?.scoringRate ?? null;
    // Faz 4.1: cleanSheet modifier — profile örneklem ağırlıklı reliability shrinkage
    const _hBeforeCS = lambda_home;
    const _aBeforeCS = lambda_away;
    let _csModA = null, _csModH = null;
    const _hProfileN = homeScoreProfile?.n ?? 0;
    const _aProfileN = awayScoreProfile?.n ?? 0;
    const _csRelHome = _hProfileN > 0 ? _hProfileN / (_hProfileN + Math.sqrt(_hProfileN + 1)) : 0;
    const _csRelAway = _aProfileN > 0 ? _aProfileN / (_aProfileN + Math.sqrt(_aProfileN + 1)) : 0;
    if (_hCSR != null && _aSR != null && lambda_away != null) {
      const defRatio = _hCSR / _lgCSR;
      _csModA = clamp(1.0 - (1.0 - _aSR) * _cv * Math.max(0, defRatio - 1.0),
        _floor, 1.0);
      // Etki = mod^reliability (home savunma profili güveni baskılayan tarafta)
      lambda_away = clamp(lambda_away * Math.pow(_csModA, _csRelHome), _lambdaAwayMin, _lambdaAwayMax);
    }
    // Deplasman savunması: awayCSR → ev gol üretimini baskıla
    const _aCSR = awayScoreProfile?.cleanSheetRate ?? null;
    const _hSR  = homeScoreProfile?.scoringRate ?? null;
    if (_aCSR != null && _hSR != null && lambda_home != null) {
      const defRatio = _aCSR / _lgCSR;
      _csModH = clamp(1.0 - (1.0 - _hSR) * _cv * Math.max(0, defRatio - 1.0),
        _floor, 1.0);
      lambda_home = clamp(lambda_home * Math.pow(_csModH, _csRelAway), _lambdaHomeMin, _lambdaHomeMax);
    }
    // Trace daima push — eksik input'u görmek için
    _pushTrace('cleanSheet', _hBeforeCS, lambda_home, _aBeforeCS, lambda_away, {
      csModHome: _csModH, csModAway: _csModA,
      homeCSR: _hCSR, awayCSR: _aCSR, lgCSR: _lgCSR, floor: _floor,
      homeScoringRate: homeScoreProfile?.scoringRate ?? null,
      awayScoringRate: awayScoreProfile?.scoringRate ?? null,
      relHome: _csRelHome, relAway: _csRelAway,
    });
  } else {
    // _lgCSR veya _cv yoksa stage tamamen atlanır — trace'e neden eksik girdiği bildirilir.
    _pushTrace('cleanSheet', lambda_home, lambda_home, lambda_away, lambda_away, {
      skipped: true, lgCSR: _lgCSR, cv: _cv,
    });
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

    // 1. Referans toplam gol hesapla — TAKIM-SPESİFİK ÖNCELİK
    // KRİTİK: Lig ortalaması bir referans DEĞİL. Bayern 4-0 üretebilen takım
    // ligin %2.6 ortalamasına çekilirse asimetri ölür. Önceliği TAKIM datasına ver.
    // Sıralama: takım profili > H2H > leagueFingerprint > standings.
    const _lfRel_B = leagueFingerprint?.reliability ?? 0;
    let referenceTotalGoals = null;
    let referenceReliability = 0;

    if (homeScoreProfile?.avgScored != null && awayScoreProfile?.avgScored != null
        && (homeScoreProfile.n ?? 0) >= 2 && (awayScoreProfile.n ?? 0) >= 2) {
      // İlk öncelik: takımın KENDİ gerçek gol ortalaması (asimetrik takımları korur).
      // Eşik n>=2 — n=4 örneklemde de tetiklenmesi gerekiyordu, 3'e zorunluluk gereksiz katı idi.
      // Bayesian shrinkage zaten zayıf örneklem güvenini düşürecek.
      referenceTotalGoals = homeScoreProfile.avgScored + awayScoreProfile.avgScored;
      const minN = Math.min(homeScoreProfile.n, awayScoreProfile.n);
      referenceReliability = minN / (minN + Math.sqrt(minN + 1));
    } else if (matchScoreProfile?.avgHomeGoals != null && matchScoreProfile?.avgAwayGoals != null) {
      // İkinci: H2H — bu iki takımın birbirine karşı geçmişi.
      referenceTotalGoals = matchScoreProfile.avgHomeGoals + matchScoreProfile.avgAwayGoals;
      const _n = matchScoreProfile.n || 0;
      referenceReliability = _n / (_n + Math.sqrt(_n + 1));
    } else if (_lfRel_B > 0.3 && leagueFingerprint.leagueAvgGoals != null && leagueFingerprint.leagueAvgGoals > 0) {
      // Üçüncü: leagueFingerprint — sadece takım profili yoksa.
      referenceTotalGoals = leagueFingerprint.leagueAvgGoals;
      referenceReliability = _lfRel_B;
    } else if (leagueAvgGoals != null && leagueAvgGoals > 0) {
      // Son çare: standings lig ortalaması (asimetri kaybolur, dikkat).
      const _stN = (allMetrics.leagueTeamCount ?? 0) * 30;
      referenceTotalGoals = leagueAvgGoals * 2;
      referenceReliability = _stN > 0 ? _stN / (_stN + Math.sqrt(_stN + 1)) : 0;
    }

    // 2. Kalibrasyon oranı ve ölçekleme faktörü — SİMETRİK + TAM REFERANSA YAKLAŞIM
    if (referenceTotalGoals != null && referenceTotalGoals > 0 && referenceReliability > 0) {
      const calibrationRatio = referenceTotalGoals / lambdaSum;

      // Simetrik tetikleme: hem Poisson eksik (ratio > eşik) hem fazla (ratio < 1/eşik) için.
      // Eşik: lig CV / sqrt(N_eff) — örneklem büyüklüğüne duyarlı.
      //   Mantık: standart hatadan türer (binom std ∝ √(p(1-p)/n)).
      //   Düşük örneklem → geniş tolerance (gürültü olabilir, sakin dur)
      //   Yüksek örneklem → dar tolerance (sinyal güvenilir, küçük sapmaya bile müdahale)
      // _cv yoksa minN'den türeyen 1/√N fallback. Sıfır sabit eşik (eski Math.min(0.20, ...) kaldırıldı).
      const _nEffForTol = Math.max(1, Math.min(
        homeScoreProfile?.n ?? 1,
        awayScoreProfile?.n ?? 1
      ));
      const _tol = (_cv != null && _cv > 0)
        ? _cv / Math.sqrt(_nEffForTol)
        : 1 / Math.sqrt(_nEffForTol);
      const _trigger = (calibrationRatio > 1 + _tol) || (calibrationRatio < 1 - _tol);

      if (_trigger) {
        // ASİMETRİK SCALING — yukarı/aşağı yön farklı güçle çekilir.
        //   ratio > 1 (lambda referansın altında):
        //     Takım profili "daha çok atıyor" diyor → BOOST tam güçle (exponent = reliability)
        //   ratio < 1 (lambda referansın üstünde):
        //     Tournament-filter düşük örneklem gürültüsü olabilir → SHRINK kontrollü.
        //     "Yarım güç" eski statik 0.5'i kullanıyordu — şimdi cv'den dinamik:
        //     shrinkFactor = 1 - cv (düşük cv → tutuculuk → küçük expo)
        //     Yüksek cv → büyük expo → şişiren lambda'yı agresif çek.
        const _baseExponent = Math.max(0, Math.min(1, referenceReliability));
        const _shrinkFactor = _cv != null ? Math.max(0, Math.min(1, 1 - _cv)) : 0.5;
        const _exponent = calibrationRatio >= 1 ? _baseExponent : _baseExponent * _shrinkFactor;
        let scalingFactor = Math.pow(calibrationRatio, _exponent);
        const exponent = _exponent; // legacy trace için

        // Güvenlik tavanları: normMaxRatio + normMinRatio'dan dinamik (sabit 1.50/0.70 kaldırıldı).
        // Üst: ligin en güçlü takımının lig ortalamasına oranı (zaten ölçülmüş veri).
        // Alt: ligin en zayıf takımının oranı (simetrik).
        const _maxScale = allMetrics.normMaxRatio != null ? allMetrics.normMaxRatio : null;
        const _minScale = allMetrics.normMinRatio != null ? allMetrics.normMinRatio : null;
        if (_maxScale != null) scalingFactor = Math.min(scalingFactor, _maxScale);
        if (_minScale != null) scalingFactor = Math.max(scalingFactor, _minScale);

        // Ev/deplasman oranı korunarak orantısal ölçekleme
        const ratio_ha = lambdaSum > 0 ? lambda_home / lambdaSum : 0.5;
        const _hBeforeScale = lambda_home;
        const _aBeforeScale = lambda_away;
        lambda_home = clamp(lambdaSum * scalingFactor * ratio_ha,      _lambdaHomeMin, _lambdaHomeMax);
        lambda_away = clamp(lambdaSum * scalingFactor * (1 - ratio_ha), _lambdaAwayMin, _lambdaAwayMax);
        _pushTrace('referenceScaling', _hBeforeScale, lambda_home, _aBeforeScale, lambda_away, {
          scalingFactor, calibrationRatio, referenceTotalGoals, referenceReliability,
          tolerance: _tol, exponent,
        });
      } else {
        // Trigger yok — referenceTotalGoals zaten λsum'a yakın. Stage'i görünür kıl.
        _pushTrace('referenceScaling', lambda_home, lambda_home, lambda_away, lambda_away, {
          skipped: true, reason: 'within_tolerance',
          calibrationRatio, referenceTotalGoals, referenceReliability, tolerance: _tol,
        });
      }
    } else {
      _pushTrace('referenceScaling', lambda_home, lambda_home, lambda_away, lambda_away, {
        skipped: true, reason: 'no_reference',
        referenceTotalGoals, referenceReliability,
      });
    }
  }

  // Motivation damping + magnitude shrinkage kaldırıldı — her ikisi over-correction
  // (10-13 draw tahmin) yaratıyordu. α/β Bayesian shrinkage + temperature scaling
  // reliability sinyalini yeterli ölçüde kapsıyor.

  // M167: lambda dinamik sınırlar içinde kalibre edildi.
  const M167_home = lambda_home != null ? round2(lambda_home) : null;
  const M167_away = lambda_away != null ? round2(lambda_away) : null;
  _pushTrace('finalM167', null, lambda_home, null, lambda_away, {});

  // Legacy M156-M160 scores (UI uyumluluğu için korunur — birimler 0-1 aralığında olduğundan
  // *50 ile 0-50 skala aralığına taşınır; bu ölçekleme keyfidir, yalnızca UI gösterimi içindir)

  // M156: Bitirici Gücü — atak göstergesi (lig ortalamasına göre normalize × 50 UI skalası)
  //
  // Tüm kaynaklar VERİDEN hesaplanır — "fallback" YOK, eşdeğer dört veri yolu:
  //   M011 (İsabetli Şut → Gol %): recent matches shot stats
  //   M018 (Şut → Gol Dönüşümü):    recent matches shot/goal ratio
  //   M001 (Maç başı atılan gol):   genel istatistik (her takımda var)
  //   scoreProfile.avgScored:       tournament-filtered son N maç
  //
  // Bayesian reliability-weighted blend:
  //   her kaynak kendi örnekleminden türeyen ağırlıkla karılır
  //   w_i = n_i / (n_i + sqrt(n_i + 1))    Bayesian shrinkage
  //   w_total = Σ w_i
  //   M156 = Σ (val_i × w_i) / w_total
  //
  // Clamp: normMin/Max (lig dağılımından dinamik, sabit aralık yok).
  const leagueM011 = dynamicAvgs?.M011 ?? null;
  const leagueM018 = dynamicAvgs?.M018 ?? null;
  const leagueM001 = dynamicAvgs?.M001 ?? null;

  const calcM156 = (m011, m018, m001, scoreProfile, matchCount) => {
    const _m011 = unwrap(m011);
    const _m018 = unwrap(m018);
    const _m001 = unwrap(m001);
    const sources = [];

    // Bayesian weight from sample size
    const _w = (n) => n > 0 ? n / (n + Math.sqrt(n + 1)) : 0;

    // M011 kaynak — son maçların shot verisinden (matchCount ≈ örneklem)
    if (_m011 != null && leagueM011 != null && leagueM011 > 0) {
      sources.push({ val: _m011 / leagueM011, w: _w(matchCount || 5) });
    }
    // M018 kaynak — aynı tabanlı (shot/goal conversion)
    if (_m018 != null && leagueM018 != null && leagueM018 > 0) {
      sources.push({ val: _m018 / leagueM018, w: _w(matchCount || 5) });
    }
    // M001 kaynak — sezon ortalaması (yüksek örneklem)
    if (_m001 != null && leagueM001 != null && leagueM001 > 0) {
      sources.push({ val: _m001 / leagueM001, w: _w(matchCount || 10) });
    }
    // scoreProfile kaynak — kendi N'i var
    if (scoreProfile?.avgScored != null && leagueAvgGoals > 0 && scoreProfile.n > 0) {
      sources.push({ val: scoreProfile.avgScored / leagueAvgGoals, w: _w(scoreProfile.n) });
    }

    if (sources.length === 0) return null;
    const totalW = sources.reduce((s, x) => s + x.w, 0);
    if (totalW <= 0) return null;
    const blendedRatio = sources.reduce((s, x) => s + x.val * x.w, 0) / totalW;

    // Lig dağılımına göre clamp (sabit 0.5/2.0 KALDIRILDI)
    const minR = allMetrics.normMinRatio ?? 0;
    const maxR = allMetrics.normMaxRatio ?? Infinity;
    const normR = Math.max(minR, Math.min(maxR, blendedRatio));
    return normR * 50;
  };

  const M156_home = calcM156(homeFlat.M011, homeFlat.M018, homeFlat.M001, homeScoreProfile, homeMatchCount);
  const M156_away = calcM156(awayFlat.M011, awayFlat.M018, awayFlat.M001, awayScoreProfile, awayMatchCount);
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
    // ── Dixon-Coles ρ — Faz 5: Tamamen dinamik (sabit fallback ve clamp yok) ─
    //   raw_ρ = -(D_obs - D_poisson) / (P(0,0)·λLg² + P(1,1))
    //   Üst sınır = matematiksel zorunluluk × fingerprint güvenilirliği:
    //     |ρ| × λH × λA ≤ 1   (tau ≥ 0 koşulu)
    //   reliability=0 (lig fingerprint yok) → ρ=null → tau=1 (Poisson çıplak)
    //   reliability artarken |ρ| matematiksel limite kadar açılır.
    // Clamp aralığı [-0.20, 0.00] sabiti KALDIRILDI; veriden türeyen tek üst sınır.
    const rho = (() => {
      if (leagueAvgGoals == null || leagueAvgGoals <= 0) return null;
      const lambdaLg = leagueAvgGoals / 2;
      const _lfRel_rho = leagueFingerprint?.reliability ?? 0;
      // Gözlem kaynakları, en güvenilirden zayıfa
      // leagueDrawTendency = observed/poisson oran. Gözlemlenen draw oranını
      // geri türetmek: D_obs = D_poiss_naive × tendency. Naive D_poiss leagueAvg
      // ortalama λ ile P(0,0)+P(1,1)+...
      let _D_naive = null;
      if (allMetrics.leagueDrawTendency != null && leagueAvgGoals > 0) {
        const _lambdaNaive = leagueAvgGoals / 2;
        let _dNaive = 0;
        for (let k = 0; k <= 7; k++) {
          _dNaive += poissonPMF(k, _lambdaNaive) * poissonPMF(k, _lambdaNaive);
        }
        _D_naive = _dNaive * allMetrics.leagueDrawTendency;
      }
      const D_obs = leagueFingerprint?.leagueDrawRate
        ?? leagueFingerprint?.leagueDrawRate_std
        ?? _D_naive;
      if (D_obs == null) return null;
      // Poisson beraberlik tahmini (her k için P(k,k))
      let D_poiss = 0;
      for (let k = 0; k <= 7; k++) {
        D_poiss += poissonPMF(k, lambdaLg) * poissonPMF(k, lambdaLg);
      }
      const P00 = Math.pow(poissonPMF(0, lambdaLg), 2);
      const P11 = Math.pow(poissonPMF(1, lambdaLg), 2);
      const denom = P00 * lambdaLg * lambdaLg + P11;
      if (denom <= 1e-6) return null;
      const raw = -(D_obs - D_poiss) / denom;
      // Sapmanın istatistiki anlamlılığı: |D_obs - D_poiss| / σ_D
      // σ_D = sqrt(D_poiss × (1 - D_poiss) / N_eff)  (binomial std)
      // N_eff: fingerprint örneklem ağırlıklı; reliability=0 → N_eff=0 → ρ=null.
      const N_eff = (leagueFingerprint?.sampleSize ?? leagueFingerprint?.matchCount ?? 0)
                    * Math.max(0, Math.min(1, _lfRel_rho));
      if (N_eff < 1) {
        // Reliability düşük: raw'a yarım güven (no clamp, sadece reliability ile ölçekle)
        const scaled = raw * Math.max(0, Math.min(1, _lfRel_rho));
        // Matematiksel zorunluluk: |ρ| ≤ 1/(λH × λA) ≤ 1/lambdaLg² (sembolik ortalama)
        const mathMax = lambdaLg * lambdaLg > 0 ? 1 / (lambdaLg * lambdaLg) : 1;
        return Math.max(-mathMax, Math.min(mathMax, scaled));
      }
      // Reliability yeterli: z = sapma / σ; reliability ölçeklemesi z'ye dahil
      const sigma_D = Math.sqrt(Math.max(1e-9, D_poiss * (1 - D_poiss) / N_eff));
      const zSig = Math.abs(D_obs - D_poiss) / sigma_D;
      // Bayesian shrinkage: zSig küçükse rho zayıflasın (gürültü olabilir).
      const zFactor = zSig / (zSig + 1);  // zSig=∞ → 1, zSig=0 → 0
      const adjusted = raw * zFactor;
      // Matematiksel üst sınır
      const mathMax = lambdaLg * lambdaLg > 0 ? 1 / (lambdaLg * lambdaLg) : 1;
      return Math.max(-mathMax, Math.min(mathMax, adjusted));
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

    // ── Dinamik Blend Ağırlıkları — Veri Güvenilirliği Tabanlı ──────────────
    // SIFIR STATİK SABİT. Tüm ağırlıklar 3 kaynağın göreceli güveninden türer:
    //   - Poisson (analitik): lig fingerprint pool'u Poisson'a ne kadar uyuyor
    //   - NegBinom (overdispersion): per-team gol dağılımı Poisson'dan ne kadar sapıyor
    //   - Profile (empirik): home + away + H2H örneklem toplamı
    // Üç ağırlık [0,1] toplamı 1.0 — matematiksel zorunluluk, sabit alt/üst sınır yok.
    const _lfRel = leagueFingerprint?.reliability ?? 0;
    const _lfN   = leagueFingerprint?.poolSize ?? leagueFingerprint?.n ?? 0;

    // Toplam profil örneklemi (H2H direkt sinyal → 2× ağırlık)
    // Bayesian shrinkage: tpRel = n / (n + sqrt(n+1)) — n→∞ → 1, n=0 → 0
    const _tpN = (homeScoreProfile?.n || 0)
               + (awayScoreProfile?.n || 0)
               + (matchScoreProfile?.n || 0) * 2;
    const _tpRel = _tpN > 0 ? _tpN / (_tpN + Math.sqrt(_tpN + 1)) : 0;

    // NegBinom ağırlığı — overdispersion sinyali × lig güveni
    //   strength = (over - 1) / over   ∈ [0, 1)
    //     over=1.0 → 0 (Poisson eşdeğer)  | over=1.5 → 0.33 | over=2 → 0.50
    //   lfRel: lig pool'unun istatistiksel güvenilirliği
    const _overStrength = (overdispersion != null && overdispersion > 1)
      ? (overdispersion - 1) / overdispersion : 0;
    const _negBinomRaw = _overStrength * _lfRel;

    // Profile ağırlığı — örneklem güveni × profil/lig göreceli baskınlığı
    //   profileShare = tpN / (tpN + lfN) ∈ [0, 1)
    //   Takım profili büyükse → empirik dağılıma güven artar
    //   Lig fingerprint havuzu büyükse → analitik (Poisson) daha güvenilir
    const _profileShare = _tpN > 0 ? _tpN / (_tpN + _lfN) : 0;
    const _profileRaw = _tpRel * _profileShare;

    // Toplam ağırlık ≤ 1.0 — eğer (NB + profile) > 1 ise oransal normalize et
    // Aksi halde Poisson kalan farkı alır
    const _wSum = _negBinomRaw + _profileRaw;
    const negBinomWeight = _wSum > 1 ? _negBinomRaw / _wSum : _negBinomRaw;
    const profileWeight  = _wSum > 1 ? _profileRaw  / _wSum : _profileRaw;
    // poissonWeight = 1 - negBinom - profile  (blendScoreDistribution içinde hesaplanır)

    // ── Aşama 4: λ Simetrik Shrinkage ──────────────────────────────────
    // Yalnızca ÇOK aşırı sapmalarda devreye girer (z > 2.5).
    // Soft düzeltme: %70 orijinal + %30 profil (geometric mean yerine)
    let lambda_final_home = M167_home;
    let lambda_final_away = M167_away;
    let shrinkageApplied = { home: false, away: false };

    // Shrinkage ağırlığı profil örneklem büyüklüğünden türer (sabit 0.7/0.3 kaldırıldı):
    //   wProfile = n / (n + sqrt(n + 1))  — Bayesian shrinkage
    //   wOriginal = 1 - wProfile
    // n=5 → ~0.66 profil; n=20 → ~0.81 profil; n=50 → ~0.88 profil.
    let _shrinkageMetaH = null, _shrinkageMetaA = null;
    if (homeScoreProfile && homeScoreProfile.stdScored > 0.01 && homeScoreProfile.n >= 5) {
      const deviation = Math.abs(M167_home - homeScoreProfile.avgScored) / homeScoreProfile.stdScored;
      if (deviation > 2.5) {
        const n = homeScoreProfile.n;
        const wProfile = n / (n + Math.sqrt(n + 1));
        lambda_final_home = (1 - wProfile) * M167_home + wProfile * homeScoreProfile.avgScored;
        shrinkageApplied.home = true;
        _shrinkageMetaH = { deviation, wProfile, n, profileAvg: homeScoreProfile.avgScored };
      }
    }
    if (awayScoreProfile && awayScoreProfile.stdScored > 0.01 && awayScoreProfile.n >= 5) {
      const deviation = Math.abs(M167_away - awayScoreProfile.avgScored) / awayScoreProfile.stdScored;
      if (deviation > 2.5) {
        const n = awayScoreProfile.n;
        const wProfile = n / (n + Math.sqrt(n + 1));
        lambda_final_away = (1 - wProfile) * M167_away + wProfile * awayScoreProfile.avgScored;
        shrinkageApplied.away = true;
        _shrinkageMetaA = { deviation, wProfile, n, profileAvg: awayScoreProfile.avgScored };
      }
    }
    if (_shrinkageMetaH || _shrinkageMetaA) {
      _pushTrace('lambdaShrinkage', M167_home, lambda_final_home, M167_away, lambda_final_away, {
        home: _shrinkageMetaH, away: _shrinkageMetaA,
      });
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
        let _hwN = _homeWin / totalProb;
        let _dwN = _draw / totalProb;
        let _awN = _awayWin / totalProb;
        // ── Lig 1X2 prior blend — beraberlik sinyali eksikliği için ─────────
        // Sorun: düşük λ'da Poisson P(draw)≈%9 ama lig gerçek draw oranı ~%28.
        // ρ tek başına yetmiyor çünkü etkisi sadece P(0,0)/P(1,1)/P(1,0)/P(0,1).
        // Çözüm: fingerprint'ten gözlemlenen lig 1X2 oranlarını prior olarak blend.
        // Ağırlık: model olasılıklarının Shannon entropy'sinden — düz dağılım
        // → modelin az bilgisi var → prior'a güven; tepe dağılım → modele güven.
        // Sıfır statik: ağırlık tamamen entropy formülünden + reliability'den.
        const _lgHWR = leagueFingerprint?.leagueHomeWinRate;
        const _lgDWR = leagueFingerprint?.leagueDrawRate;
        const _lgAWR = leagueFingerprint?.leagueAwayWinRate;
        const _lfRelPrior = leagueFingerprint?.reliability ?? 0;
        if (_lgHWR != null && _lgDWR != null && _lgAWR != null && _lfRelPrior > 0) {
          const _eps = 1e-9;
          const _modelH = -(_hwN * Math.log(_hwN + _eps)
                          + _dwN * Math.log(_dwN + _eps)
                          + _awN * Math.log(_awN + _eps));
          const _maxH3 = Math.log(3);
          // Model balance: 1 = uniform (no info), 0 = max-info
          const _modelBalance = _maxH3 > 0 ? _modelH / _maxH3 : 0;
          // Prior ağırlığı = modelBalance × _lfRelPrior
          // Model bilgisizse VE lig fingerprint güvenilirse → prior dominant
          const _priorW = _modelBalance * _lfRelPrior;
          _hwN = _hwN * (1 - _priorW) + _lgHWR * _priorW;
          _dwN = _dwN * (1 - _priorW) + _lgDWR * _priorW;
          _awN = _awN * (1 - _priorW) + _lgAWR * _priorW;
          // Renormalize (lig prior toplamı 1.0 olmayabilir)
          const _sumN = _hwN + _dwN + _awN;
          if (_sumN > 0) {
            _hwN /= _sumN; _dwN /= _sumN; _awN /= _sumN;
          }
        }
        homeWinProb = _hwN * 100;
        drawProb    = _dwN * 100;
        awayWinProb = _awN * 100;
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
      // mostLikelyScore seçimi — argmax yerine EXPECTATION-AWARE.
      // Sorun: düşük λ'da Poisson PMF düz → argmax mode'u verir, mode genelde
      // λ_sum'dan az gol taşır. λ_h=2.4 → P(2)=0.27, P(1)=0.23 — argmax 2,
      // ama beklenen gol 2.4. λ_a=1.15 ekleyince argmax 2-1 (3 gol), beklenen 3.5.
      //
      // Çözüm: top-K içinde toplam gol'ü λ_sum'a en yakın olan + olasılığı en yüksek.
      // K = entropy'den türetilir: dağılım ne kadar düz ise o kadar geniş top-K bakarız.
      // Sıfır statik. K = effective_K = exp(entropy).
      const _lambdaSum = (lambda_final_home ?? 0) + (lambda_final_away ?? 0);
      const _lambdaGap = Math.abs((lambda_final_home ?? 0) - (lambda_final_away ?? 0));
      if (_lambdaSum > 0 && scoreProbs.length > 0) {
        // Entropy-driven adaptive K
        const _topProbs = scoreProbs.slice(0, Math.min(10, scoreProbs.length));
        const _sumTop = _topProbs.reduce((s, x) => s + x.prob, 0);
        let _entropy = 0;
        for (const sp of _topProbs) {
          const p = sp.prob / _sumTop;
          if (p > 0) _entropy -= p * Math.log(p);
        }
        const _kEff = Math.max(1, Math.round(Math.exp(_entropy)));
        const _candidates = scoreProbs.slice(0, _kEff);
        // 1D toplam gol mesafesi — λ_sum'a en yakın total-goal'lü skor.
        // 2D Euclidean denedi (eski commit): over-correction yaptı, ed.io.iconv
        let _best = _candidates[0];
        let _bestScore = -Infinity;
        for (const sp of _candidates) {
          const total = sp.home + sp.away;
          const distScore = 1 / (1 + Math.abs(total - _lambdaSum));
          const combined = sp.prob * distScore;
          if (combined > _bestScore) {
            _bestScore = combined;
            _best = sp;
          }
        }
        mostLikelyScore = _best;
      } else {
        mostLikelyScore = scoreProbs[0];
      }
    }
  }

  // ── Confidence Score & Data Integrity ── (Faz 6: Calibration-aware)
  //
  // Üç bileşen geometric ortalama ile birleştirilir; hiçbiri sıfırlanırsa
  // confidence düşer. Tek-eksenli (sadece veri çokluğu) eski formül LOW vs HIGH
  // tier ters-korelasyon göstermişti — calibration ekseni bunu kırar.
  //
  //   1. dataVolume:        veri miktarı (matchSample × metricFill)
  //   2. modelDecisiveness: 1X2 dağılımının netliği (top - secondTop) / top
  //                          → tahmin ne kadar net? Düşük margin = belirsizlik.
  //   3. sourceAgreement:   λ kaynak ailelerinin tutarlılığı (Faz 2.3'ten)
  //                          → kaynaklar çelişiyorsa model güveni düşer.
  //
  // Tüm bileşenler [0..1]; confidence = (a × b × c)^(1/3) × 100.
  // Yarısı eksikse confidence yarıya düşer; çift eksiklik daha sert.
  const matchSampleRatio = Math.min(1.0, Math.min(homeMatchCount, awayMatchCount) / 10);
  const metricFillingRatio = (allMetricIds?.size || allMetricIds?.length || 0) / 168;
  const dataVolumeComponent = Math.sqrt(matchSampleRatio * metricFillingRatio);

  // Decisiveness: 1X2 dağılımının netliği (gerçekleştirme sonrası)
  const _hwp = homeWinProb, _dp = drawProb, _awp = awayWinProb;
  const _decisiveness = (() => {
    if (_hwp == null || _dp == null || _awp == null) return null;
    const sorted = [_hwp, _dp, _awp].sort((a, b) => b - a);
    if (sorted[0] <= 0) return 0;
    const margin = (sorted[0] - sorted[1]) / sorted[0];
    return Math.max(0, Math.min(1, margin));
  })();

  // Source agreement: home ve away λ ailelerinin minimumu (zayıf halka)
  const _avgAgreement = (_agreementHome + _agreementAway) / 2;

  // Üç bileşen geometric mean. Eksik olanlar (null) at — uniform fallback.
  const _confComponents = [
    dataVolumeComponent,
    _decisiveness,
    _avgAgreement,
  ].filter(x => x != null && isFinite(x));
  const _geoMeanConf = _confComponents.length > 0
    ? Math.pow(_confComponents.reduce((p, x) => p * Math.max(x, 0.01), 1), 1 / _confComponents.length)
    : 0.1;
  const confidenceScore = clamp(_geoMeanConf * 100, 10, 100);

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
      lambdaAudit: {
        diag: _ldDiag,
        trace: _ldTrace,
      },
    }
  };
}

// poissonPMF, weightedAvg, clamp, round2 artık math-utils.js'den import ediliyor

module.exports = { calculateAdvancedMetrics };
