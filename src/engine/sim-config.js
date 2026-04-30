/**
 * sim-config.js
 * Centralized configuration for the simulation engine.
 * Contains model constants, physics limits, and logic thresholds.
 */

'use strict';

const SIM_CONFIG = {
  // ─── Clamps & Limits ─────────────────────────────────────────────────────────
  LIMITS: {
    POWER: { MIN: 0.5, MAX: 2.0 },
    MOMENTUM: { MIN: 0.5, MAX: 2.0 },
    MORALE: { MIN: 0.4, MAX: 1.6 },
    POSSESSION: { MIN: 30, MAX: 70 },       // Matematiksel: %100 top kontrolü imkansız
    PROBABILITY: { MIN: 0.001, MAX: 0.90 },  // Olasılık sınırı: p ∈ [0,1]
    ON_TARGET: { MIN: 0.01, MAX: 0.90 },     // İsabet oranı: oran sınırı
    BLOCK: { MIN: 0.001, MAX: 0.60 },         // Blok oranı: her şutu bloklayamazsın
    // GK_ADJ: kaldırıldı — artık sqrt() doğal sönümleme kullanılıyor
    // URGENCY: kaldırıldı — GOL_IHTIYACI [0.75,1.35] doğal sınır yeterli
    CORNER: { MIN: 0.001, MAX: 0.50 },
    CORNER_GOAL: { MIN: 0.01, MAX: 0.20 }, // Korner → gol olasılığı sınırları
    CARDS: { YELLOW_MAX: 0.20, RED_MAX: 0.10 },
    // Poisson lambda — gerçekçi futbol aralığı (takım başı beklenen gol/maç)
    // Kaynak: UEFA/FIFA istatistikleri, top 5 lig ortalaması 0.8–2.8 arası
    LAMBDA: { MIN: 0.3, MAX: 3.5 },
    // Form bazlı morale başlangıç sınırları
    // 1.0 = nötr (lig ortalaması form), SCALE = form sapmasının morale etkisi
    FORM_MORALE: { MIN: 0.7, MAX: 1.3, SCALE: 0.3 },
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

  // ─── Poisson Thresholds (bahis endüstrisi standart çizgileri) ─────────────
  POISSON_THRESHOLDS: {
    CORNER_L: 8.5,
    CORNER_M: 9.5,
    CORNER_H: 10.5,
    CARD_L: 3.5,
    CARD_H: 4.5,
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
  const moraleMax = compInv != null ? powerMax * (compInv + 1) / compInv : L.MORALE.MAX;

  // Possession: standings possession verisinden
  const possession = baseline?.possessionLimits ?? L.POSSESSION;

  // On-target: baseline onTargetRate'ten (takım başına per-min → 90dk oran)
  const onTarget = baseline?.onTargetRate != null
    ? { MIN: Math.max(0, baseline.onTargetRate / 3), MAX: Math.min(1, baseline.onTargetRate * 3) }
    : L.ON_TARGET;

  // Block: baseline blockRate'ten
  const block = baseline?.blockRate != null
    ? { MIN: Math.max(0, baseline.blockRate / 3), MAX: Math.min(1, baseline.blockRate * 3) }
    : L.BLOCK;

  // Corner: baseline cornerPerMin'den
  const corner = baseline?.cornerPerMin != null
    ? { MIN: Math.max(0, baseline.cornerPerMin / 3), MAX: baseline.cornerPerMin * 3 }
    : L.CORNER;

  // Corner→Goal: baseline cornerGoalRate'ten
  const cornerGoal = baseline?.cornerGoalRate != null
    ? { MIN: Math.max(0, baseline.cornerGoalRate / 3), MAX: baseline.cornerGoalRate * 3 }
    : L.CORNER_GOAL;

  // Cards: baseline yellowPerMin / redPerMin'den (per-minute → per-play olasılık)
  const cards = (baseline?.yellowPerMin != null && baseline?.redPerMin != null)
    ? { YELLOW_MAX: baseline.yellowPerMin * 90 / 10, RED_MAX: baseline.redPerMin * 90 / 10 }
    : L.CARDS;

  // Lambda: standings gol dağılımından
  const lambda = baseline?.lambdaLimits ?? L.LAMBDA;

  // Form→Morale: normRatio'dan
  const formMorale = (baseline?.normMinRatio != null && baseline?.normMaxRatio != null)
    ? { MIN: baseline.normMinRatio, MAX: baseline.normMaxRatio, SCALE: baseline.normMaxRatio - baseline.normMinRatio }
    : L.FORM_MORALE;

  return {
    POWER: { MIN: powerMin, MAX: powerMax },
    MOMENTUM: { MIN: momMin, MAX: momMax },
    MORALE: { MIN: moraleMin, MAX: moraleMax },
    POSSESSION: possession,
    PROBABILITY: L.PROBABILITY, // p ∈ [0,1] — matematiksel, veriyle değişmez
    ON_TARGET: onTarget,
    BLOCK: block,
    CORNER: corner,
    CORNER_GOAL: cornerGoal,
    CARDS: cards,
    LAMBDA: lambda,
    FORM_MORALE: formMorale,
    RED_CARD_POWER_PENALTY_MAX: lgCV != null ? lgCV / (1 + lgCV) : (L.RED_CARD_POWER_PENALTY_MAX ?? null),
  };
}

module.exports = {
  SIM_CONFIG,
  getDynamicLimits
};
