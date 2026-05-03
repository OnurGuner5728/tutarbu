/**
 * sim-config.js
 * Centralized configuration for the simulation engine.
 * Contains model constants, physics limits, and logic thresholds.
 */

'use strict';

const SIM_CONFIG = {
  // ─── Clamps & Limits (ULTIMA RATIO FALLBACKS) ──────────────────────────────
  // getDynamicLimits() lig verisinden TÜM sınırları türetir.
  // Bu değerler YALNIZCA tüm dinamik katmanlar başarısız olduğunda kullanılır.
  LIMITS: {
    POWER: { MIN: 0.5, MAX: 2.0 },
    MOMENTUM: { MIN: 0.5, MAX: 2.0 },
    MORALE: { MIN: 0.4, MAX: 1.6 },
    POSSESSION: { MIN: 0, MAX: 100 },          // Matematiksel: [0, 100] — lig verisi daraltır
    PROBABILITY: { MIN: 0, MAX: 1 },            // Matematiksel kural: p ∈ [0,1]
    ON_TARGET: { MIN: 0, MAX: 1 },               // Matematiksel kural: oran ∈ [0,1]
    BLOCK: { MIN: 0, MAX: 1 },                   // Matematiksel kural: oran ∈ [0,1]
    CORNER: { MIN: 0, MAX: 1 },                  // Matematiksel kural: oran ∈ [0,1]
    CORNER_GOAL: { MIN: 0, MAX: 1 },             // Matematiksel kural: oran ∈ [0,1]
    CARDS: { YELLOW_MAX: 1, RED_MAX: 1 },         // Matematiksel kural: oran ∈ [0,1]
    LAMBDA: { MIN: 0.01, MAX: 20 },               // Matematiksel: Poisson λ > 0
    FORM_MORALE: { MIN: 0.1, MAX: 3.0, SCALE: 1.0 },
  },

  // ─── Model Sabitler (Matematiksel — Statik Veri Değil) ─────────────────────
  // Bunlar veri yokken kullanılan fallback DEĞİLDİR.
  // Modelin matematiksel parametreleridir: ağırlık katsayıları, ölçek faktörleri.
  // Veri null ise null döner — bu sabitler "veri yerine geçmez".
  GLOBAL_FALLBACK: {
    CORNER_GOAL_RATE: null,  // null → veri yoksa korner golü denemesi yapılmaz
    // SET_PIECE_MORALE: kaldırıldı — artık goalConvRate/(shotsPerMin×90) ile normalize
    // HOME_ADV_UNIT_WEIGHT: kaldırıldı — homeAdvantage zaten standings'ten dinamik
    // SUB_QUALITY_SCALE: kaldırıldı — sqImpact zaten metric-calculator'da hesaplanıyor
  },

  // ─── Cascades ─────────────────────────────────────────────────────────────────
  // COMFORT_GOAL_THRESHOLD: kaldırıldı — artık Math.ceil(expectedGoals) ile dinamik
  // expectedGoals = shotsPerMin × 90 × onTargetRate × goalConvRate (takım bazlı)
  CASCADES: {},

  // ─── Operational ─────────────────────────────────────────────────────────────
  SUBS: {
    MAX: 5,
  },

  // ─── Default Labels ──────────────────────────────────────────────────────────
  LABELS: {
    PLAYER: 'unknown_player',
    SUB: 'unknown_sub',
  },

  // ─── Neutral Defaults (Matematiksel Simetri Noktaları) ────────────────────
  // Bunlar "veri tahmini" DEĞİLDİR. Simülasyonda hiçbir yön sapması üretmeyen
  // matematiksel kimlik/sıfır noktalarıdır. Sadece TÜM dinamik katmanlar
  // (Standings → Team Proxy → Derived) başarısız olduğunda kullanılır.
  NEUTRAL_DEFAULTS: {
    UNIT_IDENTITY: 1.0,           // Çarpan etkisiz elemanı (1×x = x)
    POSSESSION_SYMMETRY: 0.50,    // Topla Oynama (%50-%50 simetri)
    WIN_PROBABILITY_SYMMETRY: 50, // Kazanma Olasılığı (%50 — bilgi yoksa eşit şans)
    SQUAD_DEPTH_MEDIAN: 50,       // Kadro Derinliği (0-100 skalasının ortası)
    COUNTER_INIT: 0,              // Sayaç başlangıcı (sarı kart sayısı, vb.)
    WEATHER_IDENTITY: 1.0,        // Hava durumu çarpanı (etkisiz)
  },

  // ─── UI Thresholds (rapor görsel sınırları — modeli etkilemez) ────────────
  UI_THRESHOLDS: {
    MAX_UI_PROB: 95,              // Rapor ekranında olasılık tavanı (görsel)
    HT_RESULT_THRESHOLD: 0.2,     // İlk yarı sonucu eşiği (rapor metni için)
    O15_CAP: 90,                  // Rapor üst sınırı
    FORM_HIGH: 80,                // Yüksek form eşiği (highlight için)
    FORM_LOW: 30,                 // Düşük form eşiği (highlight için)
    CONFIDENCE_HIGH: 75,          // Yüksek güven eşiği
    CONFIDENCE_LOW: 45,           // Düşük güven eşiği
    SURPRISE_HIGH: 60,            // Yüksek sürpriz endeksi eşiği
  },

  // ─── Poisson Thresholds ──────────────────────────────────────────────────────
  // CORNER_L/M/H ve CARD_L/H kaldırıldı — prediction-generator'da lig ortalamasından
  // dinamik olarak hesaplanıyor. Sadece matematiksel üst sınır korunur.
  POISSON_THRESHOLDS: {
    MAX_GOALS: 15,
  },
};

/**
 * Dinamik Limit Hesaplayıcı:
 * Tüm sınırlar baseline'daki API verisinden türetilir.
 * Veri yoksa SIM_CONFIG.LIMITS'teki statik değerler kullanılır (ultima ratio).
 */
function getDynamicLimits(baseline) {
  const L = SIM_CONFIG.LIMITS;

  // normMinRatio / normMaxRatio: ligteki en az ve en çok gol atan takımın lig ortalamasına oranı
  // Bu doğrudan güç çarpan aralığını belirler
  const powerMin = baseline?.normMinRatio ?? L.POWER.MIN;
  const powerMax = baseline?.normMaxRatio ?? L.POWER.MAX;

  // Momentum: güç aralığıyla aynı kaynak, volatiliteye göre genişler
  const lgCV = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  const momMin = lgCV != null ? powerMin / (1 + lgCV) : L.MOMENTUM.MIN;
  const momMax = lgCV != null ? powerMax * (1 + lgCV) : L.MOMENTUM.MAX;

  // Morale: normRatio aralığından, rekabetçilik indeksi ile daraltılır/genişletilir
  const compInv = baseline?.leagueCompetitiveness; // 1/CV — yüksek = rekabetçi
  const moraleMin = compInv != null ? powerMin * compInv / (compInv + 1) : L.MORALE.MIN;
  const moraleMax = (compInv != null && compInv > 0) ? powerMax * (compInv + 1) / compInv : L.MORALE.MAX;

  // possessionLimits: dynamic-baseline.js {min, max} (küçük harf) döndürür,
  // ancak simülasyon motoru {MIN, MAX} (büyük harf) bekler.
  const _rawPossLimits = baseline?.possessionLimits;
  const possession = _rawPossLimits
    ? { MIN: _rawPossLimits.MIN ?? _rawPossLimits.min, MAX: _rawPossLimits.MAX ?? _rawPossLimits.max }
    : L.POSSESSION;

  // On-target: baseline onTargetRate'ten — geniş dinamik aralık
  const onTarget = baseline?.onTargetRate != null
    ? { MIN: Math.max(0, baseline.onTargetRate / 4), MAX: Math.min(1, baseline.onTargetRate * 4) }
    : L.ON_TARGET;

  // Block: baseline blockRate'ten — geniş dinamik aralık
  const block = baseline?.blockRate != null
    ? { MIN: Math.max(0, baseline.blockRate / 4), MAX: Math.min(1, baseline.blockRate * 4) }
    : L.BLOCK;

  // Corner: baseline cornerPerMin'den — geniş dinamik aralık
  const corner = baseline?.cornerPerMin != null
    ? { MIN: Math.max(0, baseline.cornerPerMin / 4), MAX: Math.min(1, baseline.cornerPerMin * 4) }
    : L.CORNER;

  // Corner→Goal: baseline cornerGoalRate'ten — geniş dinamik aralık
  const cornerGoal = baseline?.cornerGoalRate != null
    ? { MIN: Math.max(0, baseline.cornerGoalRate / 4), MAX: Math.min(1, baseline.cornerGoalRate * 4) }
    : L.CORNER_GOAL;

  // Cards: baseline'dan türetilir — lig ortalamasının geniş katları
  const cards = (baseline?.yellowPerMin != null && baseline?.redPerMin != null)
    ? { YELLOW_MAX: Math.min(1, baseline.yellowPerMin * 90 / 5), RED_MAX: Math.min(1, baseline.redPerMin * 90 / 2) }
    : L.CARDS;

  // Lambda: standings gol dağılımından (case mismatch: {min,max} → {MIN,MAX})
  const _rawLambda = baseline?.lambdaLimits;
  const lambda = _rawLambda
    ? { MIN: _rawLambda.MIN ?? _rawLambda.min, MAX: _rawLambda.MAX ?? _rawLambda.max }
    : L.LAMBDA;

  // Form→Morale: normRatio'dan
  const formMorale = (baseline?.normMinRatio != null && baseline?.normMaxRatio != null)
    ? { MIN: baseline.normMinRatio, MAX: baseline.normMaxRatio, SCALE: baseline.normMaxRatio - baseline.normMinRatio }
    : L.FORM_MORALE;

  return {
    POWER: { MIN: powerMin, MAX: powerMax },
    MOMENTUM: { MIN: momMin, MAX: momMax },
    MORALE: { MIN: moraleMin, MAX: moraleMax },
    POSSESSION: possession,
    PROBABILITY: { MIN: 0, MAX: 1 },  // p ∈ [0,1] — matematiksel kural, veriyle değişmez
    ON_TARGET: onTarget,
    BLOCK: block,
    CORNER: corner,
    CORNER_GOAL: cornerGoal,
    CARDS: cards,
    LAMBDA: lambda,
    FORM_MORALE: formMorale,
    RED_CARD_POWER_PENALTY_MAX: lgCV != null ? lgCV / (1 + lgCV) : null,
  };
}

module.exports = {
  SIM_CONFIG,
  getDynamicLimits
};
