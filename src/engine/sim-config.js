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

module.exports = {
  SIM_CONFIG: SIM_CONFIG
};
