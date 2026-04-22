/**
 * match-simulator.js
 * 90-minute minute-by-minute match simulation engine.
 * Decoupled from static constants and fully driven by dynamic baselines.
 */

'use strict';

const { SIM_CONFIG } = require('./sim-config');
const { recordBaselineTrace, recordSimWarning } = require('./audit-helper');
const { computeWeatherMultipliers } = require('../services/weather-service');
const { BLOCK_QF_MAP, computeAlpha, computeQualityFactors } = require('./quality-factors');
// METRIC_METADATA artık kullanılmıyor — tüm lig ortalamaları dinamik.

// Merkezi nötr sabitler referansı
const ND = SIM_CONFIG.NEUTRAL_DEFAULTS;

// ─────────────────────────────────────────────────────────────────────────────
// Behavioral Units (Blocks)
// ─────────────────────────────────────────────────────────────────────────────

const SIM_BLOCKS = {
  // I. ATTACK
  BITIRICILIK: [
    { id: 'M011', weight: 3, sign: 1 }, { id: 'M012', weight: 2, sign: 1 },
    { id: 'M016', weight: 2, sign: 1 }, { id: 'M018', weight: 2, sign: 1 },
    { id: 'M020', weight: 1, sign: 1 }
  ],
  YARATICILIK: [
    { id: 'M015', weight: 3, sign: 1 }, { id: 'M017', weight: 2, sign: 1 },
    { id: 'M021', weight: 3, sign: 1 }, { id: 'M070', weight: 3, sign: 1 },
    { id: 'M072', weight: 2, sign: 1 }
  ],
  SUT_URETIMI: [
    { id: 'M013', weight: 3, sign: 1 }, { id: 'M014', weight: 3, sign: 1 },
    { id: 'M001', weight: 2, sign: 1 }, { id: 'M002', weight: 2, sign: 1 }
  ],
  HAVA_HAKIMIYETI: [
    { id: 'M036', weight: 2, sign: 1 }, { id: 'M076', weight: 2, sign: 1 },
    { id: 'M085', weight: 1, sign: 1 }
  ],
  DURAN_TOP: [
    // Ablation: dirAcc=%45, corr=-0.105 → 1X2'de negatif sinyal
    // M024 (corner-goal dönüşüm) kaldırıldı — bağlama çok bağımlı, gürültü dominant
    // M023 (corner frekansı) ve M019 (penaltı) OU/BTTS için değerli, 1X2 etkisi azaltıldı
    { id: 'M023', weight: 1, sign: 1 },  // Korner frekansı (düşük ağırlık)
    { id: 'M019', weight: 1, sign: 1 }   // Penaltı kazanma
  ],

  // II. DEFENSE
  SAVUNMA_DIRENCI: [
    { id: 'M026', weight: 3, sign: -1 }, { id: 'M028', weight: 3, sign: 1 },
    { id: 'M033', weight: 2, sign: -1 }, { id: 'M157', weight: 2, sign: 1 }
  ],
  SAVUNMA_AKSIYONU: [
    { id: 'M034', weight: 2, sign: 1 }, { id: 'M035', weight: 2, sign: 1 },
    { id: 'M037', weight: 2, sign: 1 }, { id: 'M044', weight: 1, sign: -1 }
  ],
  GK_REFLEKS: [
    { id: 'M096', weight: 3, sign: 1 }, { id: 'M098', weight: 3, sign: 1 },
    { id: 'M102', weight: 2, sign: 1 }, { id: 'M108', weight: 2, sign: 1 }
  ],
  GK_ALAN_HAKIMIYETI: [
    { id: 'M100', weight: 2, sign: 1 }, { id: 'M101', weight: 1, sign: 1 },
    { id: 'M107', weight: 2, sign: 1 }
  ],

  // III. PSYCHOLOGY
  ZİHİNSEL_DAYANIKLILIK: [
    { id: 'M064', weight: 4, sign: 1 }, { id: 'M165', weight: 3, sign: 1 }
  ],
  FİŞİ_ÇEKME: [
    { id: 'M065', weight: 4, sign: 1 }, { id: 'M043', weight: 2, sign: 1 },
    { id: 'M063', weight: 2, sign: 1 }
  ],
  PSIKOLOJIK_KIRILGANLIK: [
    { id: 'M042', weight: 3, sign: 1 }, { id: 'M041', weight: 2, sign: 1 },
    { id: 'M090', weight: 1, sign: 1 }
  ],
  DISIPLIN: [
    { id: 'M038', weight: 1, sign: -1 }, { id: 'M039', weight: 2, sign: -1 },
    { id: 'M040', weight: 3, sign: -1 }
  ],
  MOMENTUM_AKIŞI: [
    { id: 'M146', weight: 3, sign: 1 }, { id: 'M149', weight: 2, sign: 1 },
    { id: 'M174', weight: 2, sign: 1 }, { id: 'M175', weight: 2, sign: 1 }
  ],

  // IV. CONTEXT & STRATEGY
  FORM_KISA: [
    { id: 'M046', weight: 3, sign: 1 }, { id: 'M049', weight: 2, sign: 1 },
    { id: 'M053', weight: 2, sign: 1 }, { id: 'M092', weight: 1, sign: 1 }
  ],
  FORM_UZUN: [
    { id: 'M047', weight: 3, sign: 1 }, { id: 'M048', weight: 2, sign: 1 },
    { id: 'M158', weight: 2, sign: 1 }
  ],
  MAC_BASLANGICI: [
    { id: 'M062', weight: 3, sign: 1 }, { id: 'M031', weight: 2, sign: -1 },
    { id: 'M005', weight: 1, sign: 1 }
  ],
  MAC_SONU: [
    // Ablation: dirAcc=%34.8 (ters sinyal), 1X2 tahmininde zararlı.
    // Bu metrikler zamanlama için MC motorunda kullanılır ama getPower/lambda'ya katkı vermiyor.
    // Ağırlıklar düşürüldü — behavMod etkisi minimumd tutuluyor.
    { id: 'M010', weight: 1, sign: 1 }  // Sadece geç gol eğilimi (OU/BTTS için değerli)
  ],
  MENAJER_STRATEJISI: [
    { id: 'M139', weight: 2, sign: 1 }, { id: 'M140', weight: 3, sign: 1 }
  ],
  TURNUVA_BASKISI: [
    { id: 'M141', weight: 3, sign: 1 }, { id: 'M170', weight: 3, sign: 1 }
  ],
  GOL_IHTIYACI: [
    { id: 'M141', weight: 2, sign: 1 }, { id: 'M171', weight: 4, sign: 1 },
    { id: 'M172', weight: 3, sign: 1 }
  ],

  // V. OPERATIONAL
  TOPLA_OYNAMA: [
    { id: 'M025', weight: 3, sign: 1 }, { id: 'M150', weight: 3, sign: 1 },
    { id: 'M177', weight: 2, sign: 1 }  // Pressing yoğunluğu (PPDA bazlı) — dinamik
  ],
  BAGLANTI_OYUNU: [
    { id: 'M152', weight: 2, sign: 1 }, { id: 'M154', weight: 2, sign: 1 },
    { id: 'M178', weight: 1, sign: 1 }  // Territorial control — dinamik
  ],
  KADRO_DERINLIGI: [
    { id: 'M067', weight: 2, sign: 1 }, { id: 'M079', weight: 2, sign: 1 },
    { id: 'M088', weight: 1, sign: 1 },
    { id: 'M096b', weight: 2, sign: -1 } // Yorgunluk endeksi (yüksek = kötü) — dinamik
  ],
  H2H_DOMINASYON: [
    { id: 'M119', weight: 2, sign: 1 }, { id: 'M122', weight: 3, sign: 1 }
  ],
  HAKEM_DINAMIKLERI: [
    { id: 'M111', weight: 2, sign: 1 }, { id: 'M118b', weight: 3, sign: 1 },
    { id: 'M117', weight: 1, sign: 1 }, { id: 'M122', weight: 2, sign: 1 }  // Blend sertlik skoru
  ],
  TAKTIKSEL_UYUM: [
    // M068 (formasyon string parsing) ve M075 (formasyon adaptasyon) kaldırıldı:
    // Ablation: dirAcc=%43 (rastgele altı), corr=0.031 (sinyalsiz)
    // Kağıt üstü formasyon gerçek taktik şekli yansıtmıyor — değerleme.md §2
    // M177/178/179 (sonuç bazlı pressing/territory) çok daha güçlü sinyal
    { id: 'M179', weight: 2, sign: 1 },  // Savunma hat yüksekliği (finalThirdEntries bazlı)
    { id: 'M177', weight: 1, sign: 1 }   // Pressing yoğunluğu (TOPLA_OYNAMA ile örtüşmemesi için weight düşük)
  ]
};

function getM(metrics, selected, id) {
  if (!selected.has(id)) return null;
  const v = metrics?.[id];
  return (v != null && isFinite(v)) ? v : null;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Compute metric-derived base probabilities for simulation.
 * Driven by the provided baseline object instead of static coefficients.
 */
function computeProbBases(metrics, sel, units, baseline, audit, posQF) {
  const gm = (id) => getM(metrics, sel, id);

  // Helper for baseline fallback with tracing
  const getBase = (key, metricId, unitKey) => {
    const val = gm(metricId);
    if (val != null) return val;
    const fallback = (units[unitKey] ?? ND.UNIT_IDENTITY) * baseline[key];
    recordBaselineTrace(audit, `Used dynamic baseline for ${key} (derived from ${unitKey})`);
    return fallback;
  };

  const shotsPerMatch = gm('M013');
  // KRİTİK: shotsPerMin, "gerçek possession dakikası başına şut" olasılığıdır.
  // Bölücü olarak takımın GERÇEK possession oranı (M150) kullanılır.
  // Bayern %60 possession → 54 dk → shotsPerMin = M013/54 (statik 45 değil)
  // Bu kalibrasyonla simülasyonda beklenen şut = M013 (sezon verisiyle tutarlı)
  const m150_for_shots = gm('M150'); // erken okuma — shots'tan önce gerekli
  const possMinutes = m150_for_shots != null
    ? (m150_for_shots / 100) * 90                          // gerçek possession dakikası
    : (baseline.possessionBase ?? 0.50) * 90;              // baseline veya nötr (%50→45)
  const shotsPerMin = shotsPerMatch != null
    ? shotsPerMatch / possMinutes
    : baseline.shotsPerMin * (units.SUT_URETIMI ?? ND.UNIT_IDENTITY);

  const m014 = gm('M014');
  const onTargetRate = (m014 != null && shotsPerMatch != null && shotsPerMatch > 0)
    ? m014 / shotsPerMatch
    : baseline.onTargetRate;

  // SOT üzerinden Gol dönüşümü (M012); eğer yoksa M011'i SOT oranına göre ölçekle
  const m012 = gm('M012');
  const m011 = gm('M011');
  let fallbackConv = baseline.goalConvRate;
  if (m012 != null) {
    fallbackConv = m012 / 100;
  } else if (m011 != null && onTargetRate > 0) {
    fallbackConv = (m011 / 100) / onTargetRate;
  }
  const goalConvRate = fallbackConv;

  const m034 = gm('M034');
  const blockRate = m034 != null ? m034 / 100 : baseline.blockRate * (units.SAVUNMA_AKSIYONU ?? ND.UNIT_IDENTITY);

  const m022 = gm('M022');
  const cornerPerMin = m022 != null ? m022 / 90 : baseline.cornerPerMin * (units.DURAN_TOP ?? ND.UNIT_IDENTITY);

  const m039 = gm('M039');
  const yellowPerMin = m039 != null ? m039 / 90 : baseline.yellowPerMin;

  const m040 = gm('M040');
  const redPerMin = m040 != null ? m040 / 90 : baseline.redPerMin;

  const m020 = gm('M020');
  const penConvRate = m020 != null ? m020 / 100 : baseline.penConvRate;

  const m096 = gm('M096');
  const gkSaveRate = m096 != null
    ? m096 / 100
    : baseline.gkSaveRate != null
      ? baseline.gkSaveRate * (units.GK_REFLEKS ?? ND.UNIT_IDENTITY)
      : null;

  const m019 = gm('M019');
  const penPerMatch = m019 != null ? m019 : baseline.penPerMatch;

  // M150: sezon boyunca ortalama topla oynama (possession %) — 0-1 scale
  // M051 = Gol Atma Serisi (streak count), M150 = Top Kontrolü % (possession percent)
  const m150 = gm('M150');
  const possessionBase = m150 != null
    ? m150 / 100
    : (baseline.possessionBase ?? ND.POSSESSION_SYMMETRY); // Dynamic baseline → nötr simetri

  // avgGKSave: Dynamic baseline'dan alınır
  const avgGKSave = baseline.gkSaveRate;

  // ─── YENİ DİNAMİK METRİKLER ───────────────────────────────────────────────────
  // Her alan null-safe; simülasyon bozulmaz, ileri aşamada scoring için kullanılır.

  // ── Hücum Kalitesi ──────────────────────────────────────────────────────────

  // xG isabetlilik oranı: gerçek gol/maç ÷ beklenen gol/maç
  // >1 = takım xG'sinden fazla gol atıyor (bitmişlik üstü), <1 = altında
  let xGOverPerformance = (gm('M011') != null && gm('M001') != null && gm('M001') > 0)
    ? gm('M011') / gm('M001')  // M011 = gol%, M001 = xG/maç
    : null;

  // İlk yarı gol oranı (0-1 arası oran): erken baskı sinyali
  const firstHalfGoalRate = gm('M005') != null ? gm('M005') / 100 : null;

  // Son 15 dakika gol oranı (0-1 arası oran): geç baskı sinyali
  const lateGoalRate = gm('M010') != null ? gm('M010') / 100 : null;

  // Penaltı kazanma oranı (maç başına): duran top tehlikesi
  const penWinRate = gm('M019') != null ? gm('M019') : baseline.penPerMatch;

  // Serbest vuruş tehlike oranı (dakika başına)
  const freeKickThreatRate = gm('M023') != null ? gm('M023') / 90 : null;

  // ── Savunma Kalitesi ──────────────────────────────────────────────────────────

  // Clean sheet oranı (0-1): düşük gol yeme direncinin güçlü göstergesi
  const cleanSheetRate = gm('M028') != null ? gm('M028') / 100 : null;

  // Maç başı yenilen gol (rakip gol/maç): savunma zafiyeti ölçüsü
  const goalsAgainstRate = gm('M026') != null ? gm('M026') : null;

  // İkinci top kazanma oranı (0-1): orta saha-savunma geçiş kalitesi
  const secondBallRate = gm('M035') != null ? gm('M035') / 100 : null;

  // ── Orta Saha Kontrolü ────────────────────────────────────────────────────────

  // Press yoğunluğu (dakika başına): M025 = son 1/3 pas başarısı — yüksek değer = baskı
  const pressIntensity = gm('M025') != null ? gm('M025') / 90 : null;

  // Yüksek blok başarı oranı (0-1): M037 = müdahale/maç
  const highBlockSuccessRate = gm('M037') != null ? gm('M037') / 100 : null;

  // ── Fiziksel / Disiplin ───────────────────────────────────────────────────────

  // Maç başı faul oranı (dakika başına)
  const foulRate = gm('M038') != null ? gm('M038') / 90 : null;

  // Sarı kart birikimi (dakika başına): süspansiyon/kart riski ölçüsü
  const yellowAccumulation = gm('M039') != null ? gm('M039') / 90 : null;

  // ── Kaleci ────────────────────────────────────────────────────────────────────

  // Kurtarış kalitesi: gerçek save% - beklenen save% (xG bazlı sapma)
  // M096 = gerçek kurtarış %, M098 = beklenen kurtarış (goals_vs_xG proxy)
  // Pozitif = beklentinin üzerinde kurtarış, negatif = altında
  let savePctAboveExpected = (gm('M096') != null && gm('M098') != null)
    ? (gm('M096') - gm('M098')) / 100
    : null;

  // Penaltı kurtarma oranı (0-1): M102 = GK rating; rating > 7.0 → yüksek pen. kurtarma proxy
  // M099 = gerçek penaltı kurtarma % ise önce onu kullan, yoksa M102 rating normalization
  const penaltySaveRate = gm('M102') != null ? gm('M102') / 100 : null;

  // ─── PVKD İle Ölçekleme ──────────────────────────────────────────────────────
  // posQF varsa ilgili kalite faktörüyle sqrt ölçeği — savunma/hücum kalitesi etkisi
  //
  // Mevki Bazlı PVKD — posQF varsa temel + yeni metriklere uygulanır:
  //   ATK_MID: şut üretimi ve dönüşüm (hücum + orta saha kalitesi)
  //   ATK:     xG dönüşümü, gol tamamlama kalitesi
  //   DEF:     blok oranı, clean sheet (savunma kalitesi)
  //   GK:      kurtarış oranı, beklenen üzeri kurtarış (kaleci kalitesi)
  //   MID:     topla oynama / possession, press yoğunluğu
  let _shots = shotsPerMin;
  let _otRate = onTargetRate;
  let _conv = goalConvRate;
  let _block = blockRate;
  let _gkSave = gkSaveRate;
  let _poss = possessionBase;
  // Yeni metrikler — posQF ölçeklemesi için let
  let _xGOverPerf = xGOverPerformance;
  let _savePctAboveExp = savePctAboveExpected;
  let _cleanSheetRate = cleanSheetRate;
  let _pressIntensity = pressIntensity;

  if (posQF != null) {
    // Mevcut 6 temel metrik
    _shots *= posQF.ATK_MID;
    _otRate *= Math.sqrt(posQF.ATK_MID);
    _conv *= Math.sqrt(posQF.ATK);
    _block *= Math.sqrt(posQF.DEF);
    if (_gkSave != null) _gkSave *= Math.sqrt(posQF.GK);
    _poss *= Math.sqrt(posQF.MID);
    // Yeni dinamik metrikler için PVKD ölçeklemesi:
    // xGOverPerformance: ATK ile — kalite arttıkça xG'yi daha iyi çevirirler
    if (_xGOverPerf != null) _xGOverPerf *= Math.sqrt(posQF.ATK);
    // savePctAboveExpected: GK ile — kaleci kalitesi kurtarış sapmasını etkiler
    if (_savePctAboveExp != null) _savePctAboveExp *= Math.sqrt(posQF.GK ?? 1);
    // cleanSheetRate: DEF_GK kombinasyonu — GK ve DEF kalitesinin bileşik etkisi
    if (_cleanSheetRate != null) _cleanSheetRate *= Math.sqrt(posQF.DEF_GK ?? posQF.DEF ?? 1);
    // pressIntensity: MID ile — orta saha kalitesi baskı yoğunluğunu etkiler
    if (_pressIntensity != null) _pressIntensity *= Math.sqrt(posQF.MID ?? 1);
  }

  return {
    // Mevcut 12 temel alan
    shotsPerMin: _shots, onTargetRate: _otRate, goalConvRate: _conv,
    blockRate: _block, cornerPerMin, yellowPerMin,
    redPerMin, penConvRate, gkSaveRate: _gkSave, penPerMatch,
    possessionBase: _poss, avgGKSave,
    // Yeni dinamik alanlar (scoring için ileride kullanılır, null-safe)
    xGOverPerformance: _xGOverPerf,   // xG performans üstünlüğü (hücum kalitesi)
    firstHalfGoalRate,                // İlk yarı gol oranı (erken baskı)
    lateGoalRate,                     // Geç gol oranı (son 15dk baskısı)
    penWinRate,                       // Penaltı kazanma oranı/maç
    freeKickThreatRate,               // Serbest vuruş tehlikesi/dakika
    cleanSheetRate: _cleanSheetRate,  // Clean sheet oranı (savunma gücü)
    goalsAgainstRate,                 // Yenilen gol/maç (savunma zafiyeti)
    secondBallRate,                   // İkinci top kazanma oranı
    pressIntensity: _pressIntensity,  // Press yoğunluğu (orta saha kontrolü)
    highBlockSuccessRate,             // Yüksek blok başarı oranı
    foulRate,                         // Faul oranı/dakika (fiziksel yoğunluk)
    yellowAccumulation,               // Sarı kart birikimi/dakika (süspansiyon riski)
    savePctAboveExpected: _savePctAboveExp, // Beklenen üzeri kurtarış oranı (kaleci kalitesi)
    penaltySaveRate,                  // Penaltı kurtarma oranı (GK rating bazlı)
  };
}

function calculateUnitImpact(blockId, metrics, selected, audit, dynamicAvgs, baseline) {
  const block = SIM_BLOCKS[blockId];
  if (!block) return 1.0;

  // Dinamik normalizasyon sınırları: baseline'dan al (league-averages.js türetir).
  // normMinRatio = min takım gol/maç ÷ lig ort., normMaxRatio = max takım ÷ lig ort.
  // Veri yoksa 1.0 kimliği (normalizasyon uygulanmaz — identity clamp).
  // İKİ MOTOR (match-simulator + simulatorEngine) AYNI BU DEĞERLERİ KULLANIR.
  const nMin = (baseline && baseline.normMinRatio != null && baseline.normMinRatio > 0) ? baseline.normMinRatio : 0.5;
  const nMax = (baseline && baseline.normMaxRatio != null && baseline.normMaxRatio > 0) ? baseline.normMaxRatio : 2.0;

  let totalWeight = 0;
  let weightedFactor = 0;
  let missingAny = false;

  for (const item of block) {
    const { id, weight, sign } = item;
    const val = getM(metrics, selected, id);
    if (val == null) {
      missingAny = true;
      continue;
    }

    const leagueAvg = dynamicAvgs?.[id];
    if (leagueAvg == null || leagueAvg <= 0) {
      missingAny = true;
      continue;
    }
    // normalized = 1.0 at league average; clamp sınırları liğin kendi min/max takım dağılımı.
    // DİNAMİK VARYANS BÜYÜTECİ: lig volatilitesine göre farklılıkları matematiksel olarak belirginleştir
    const amplify = baseline.leagueGoalVolatility ? Math.max(1.0, baseline.leagueGoalVolatility) : 1.2;
    const rawRatio = val / leagueAvg;
    const variance = rawRatio - 1.0;
    let normalized = clamp(1.0 + (variance * amplify), nMin, nMax);

    if (sign === -1) normalized = 2.0 - normalized;
    weightedFactor += normalized * weight;
    totalWeight += weight;
  }

  if (missingAny) {
    recordSimWarning(audit, `Unit ${blockId} calculation incomplete - using baseline scaling`);
  }

  const result = totalWeight > 0 ? weightedFactor / totalWeight : 1.0;
  return result;
}

function simulateSingleRun({ homeMetrics, awayMetrics, selectedMetrics, lineups, weatherMetrics, baseline, rng, audit, homeSubQuality, awaySubQuality, dynamicAvgs, homeAdvantage, dynamicTimeWindows }) {
  const r = rng || Math.random;
  const { goalMult: weatherGoalMult, errorMult: weatherErrorMult } = computeWeatherMultipliers(weatherMetrics || {});
  const sel = selectedMetrics instanceof Set ? selectedMetrics : new Set(selectedMetrics || []);
  const hPlayers = lineups?.home?.players || lineups?.home || null;
  const aPlayers = lineups?.away?.players || lineups?.away || null;

  // Sıfıra bölme epsilon — lig gol ortalamasından türetilir (veri yoksa 1/1000 güvenli).
  const EPS = (baseline?.leagueAvgGoals || 1) / 1000;

  const goals = { home: 0, away: 0 };
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
    away: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
  };
  const events = [];
  const minuteLog = [];

  const homeUnits = {};
  const awayUnits = {};
  for (const blockId in SIM_BLOCKS) {
    homeUnits[blockId] = calculateUnitImpact(blockId, homeMetrics, sel, audit, dynamicAvgs, baseline);
    awayUnits[blockId] = calculateUnitImpact(blockId, awayMetrics, sel, audit, dynamicAvgs, baseline);
  }

  // Mevki Bazlı PVKD — birimler kalite ile ölçeklenmeden ÖNCE computeProbBases'e geçilir
  // baseline.homeMVBreakdown / awayMVBreakdown server'dan gelir
  const _simAlpha = computeAlpha(baseline.leagueGoalVolatility, baseline.leagueAvgGoals);
  const _simHomeBD = baseline.homeMVBreakdown ?? { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 };
  const _simAwayBD = baseline.awayMVBreakdown ?? { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 };
  const _simQF = computeQualityFactors(_simHomeBD, _simAwayBD, _simAlpha);

  // Birimsel PVKD: mevki bazlı kalite faktörleri birimlere uygulanır
  for (const blockId in BLOCK_QF_MAP) {
    const qfType = BLOCK_QF_MAP[blockId];
    if (!qfType) continue;
    if (homeUnits[blockId] != null) homeUnits[blockId] *= _simQF.home[qfType];
    if (awayUnits[blockId] != null) awayUnits[blockId] *= _simQF.away[qfType];
  }

  const hProb = computeProbBases(homeMetrics, sel, homeUnits, baseline, audit, _simQF.home);
  const aProb = computeProbBases(awayMetrics, sel, awayUnits, baseline, audit, _simQF.away);

  // Ev sahibi avantajı doğrudan uygulanır (Anchor engeli kaldırıldı)
  if (homeAdvantage != null && homeAdvantage !== 1.0) {
    const advBoost = Math.sqrt(homeAdvantage);
    hProb.shotsPerMin = hProb.shotsPerMin * advBoost;
    aProb.shotsPerMin = aProb.shotsPerMin / advBoost;
  }

  // Morale başlangıcı: FORM_KISA birimine göre. normLimits envelope'undan (dinamik).
  // Scale: lig CV'si (vol/avg) — volatil lig daha sert morale kayması.
  const _mMin = (baseline.normMinRatio != null && baseline.normMinRatio > 0) ? baseline.normMinRatio : SIM_CONFIG.LIMITS.FORM_MORALE.MIN;
  const _mMax = (baseline.normMaxRatio != null && baseline.normMaxRatio > 0) ? baseline.normMaxRatio : SIM_CONFIG.LIMITS.FORM_MORALE.MAX;
  const _mScale = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals
    : SIM_CONFIG.LIMITS.FORM_MORALE.SCALE;
  const homeMoraleStart = clamp(1.0 + (homeUnits.FORM_KISA - 1.0) * _mScale, _mMin, _mMax);
  const awayMoraleStart = clamp(1.0 + (awayUnits.FORM_KISA - 1.0) * _mScale, _mMin, _mMax);

  const state = {
    home: { momentum: homeUnits.MOMENTUM_AKIŞI, morale: homeMoraleStart, urgency: 1.0, redCardPenalty: 0 },
    away: { momentum: awayUnits.MOMENTUM_AKIŞI, morale: awayMoraleStart, urgency: 1.0, redCardPenalty: 0 }
  };

  const expelledPlayers = { home: new Set(), away: new Set() };
  const playerYellows = { home: {}, away: {} };
  const subsDone = { home: 0, away: 0 };

  const homePenBudget = getM(homeMetrics, sel, 'M019') ?? baseline.penPerMatch;
  const awayPenBudget = getM(awayMetrics, sel, 'M019') ?? baseline.penPerMatch;
  const penCurrentBudget = { home: homePenBudget, away: awayPenBudget };

  const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));
  const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));

  const getAttackPower = (side, oppSide, minute) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const oppU = oppSide === 'home' ? homeUnits : awayUnits;

    const atkUnit = geo3(u.BITIRICILIK, u.YARATICILIK, u.SUT_URETIMI);
    const formUnit = geo2(u.FORM_KISA, u.FORM_UZUN);
    // Momentum-morale dampening: formu stabil takım (formUnit≈1.0) → düşük sapma
    // Formsuz takım (formUnit < 0.85) → yüksek morale etkisi
    const rawState = geo2(s.momentum, s.morale);
    const _sdEPS = (baseline.leagueAvgGoals || 1) / 1000;
    const stateDamp = Math.max(_sdEPS, 1.0 - formUnit);
    const stateUnit = 1.0 + (rawState - 1.0) * stateDamp;

    // GOL_IHTIYACI üst satürasyon: normLimits envelope'undan 1.0 etrafında simetrik uzantı.
    const _ihtMax = (baseline.normMaxRatio != null && baseline.normMinRatio != null)
      ? baseline.normMaxRatio + (1.0 - baseline.normMinRatio) : 2.0;
    const urgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(u.GOL_IHTIYACI, 1.0, _ihtMax) - 1.0));
    const urgency = (minute > urgencyStart) ? s.urgency : 1.0;

    // Konfor freni: kazanılan fark takımın beklenen gol eşiğini geçince devreye girer
    // comfortBrake = (ZİHİNSEL/FİŞİ) × (takımın beklenen gol/maç ÷ lig ortalaması gol/maç)
    // → nötr nokta "1.0" değil, takımın kendi gol profili
    // Bayern (2.5 gol/maç) önde olunca da basar; Atletico (0.9) geriler
    const pb_side = side === 'home' ? hProb : aProb;
    const oppPb = oppSide === 'home' ? hProb : aProb;
    const teamExpGoals = pb_side.shotsPerMin * 90 * pb_side.onTargetRate * pb_side.goalConvRate;
    const comfortThreshold = Math.max(1, Math.ceil(teamExpGoals));
    let comfortBrake = 1.0;
    if ((goals[side] - goals[oppSide]) >= comfortThreshold) {
      const oppExpGoals = oppPb.shotsPerMin * 90 * oppPb.onTargetRate * oppPb.goalConvRate;
      const matchAvgGoals = (teamExpGoals + oppExpGoals) / 2;
      const leagueRef = baseline.leagueAvgGoals ?? matchAvgGoals;
      comfortBrake = (u.ZİHİNSEL_DAYANIKLILIK / u.FİŞİ_ÇEKME) * (teamExpGoals / leagueRef);
    }

    return clamp(atkUnit * formUnit * stateUnit * urgency * comfortBrake * (1 - s.redCardPenalty), SIM_CONFIG.LIMITS.POWER.MIN, SIM_CONFIG.LIMITS.POWER.MAX);
  };

  const getDefensePower = (side) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const defUnit = geo3(u.SAVUNMA_DIRENCI, u.SAVUNMA_AKSIYONU, u.GK_REFLEKS);
    const orgUnit = geo2(u.DISIPLIN, u.GK_ALAN_HAKIMIYETI);
    const _sddEPS = (baseline.leagueAvgGoals || 1) / 1000;
    const stateDefDamp = Math.max(_sddEPS, 1.0 - orgUnit);
    const stateUnit = 1.0 + (s.morale - 1.0) * stateDefDamp;
    return clamp(defUnit * orgUnit * stateUnit * (1 - s.redCardPenalty), SIM_CONFIG.LIMITS.POWER.MIN, SIM_CONFIG.LIMITS.POWER.MAX);
  };

  function pickActivePlayer(players, positions, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const pool = players.filter(p => {
      if (!p || p.substitute) return false;
      const name = p?.player?.name || p?.name || '';
      if (expelled.has(name)) return false;
      const pos = (p.player?.position || p.position || '').toUpperCase()[0];
      return !positions || positions.includes(pos);
    });
    const list = pool.length ? pool : players.filter(p => !p.substitute && !expelled.has(p?.player?.name || p?.name));
    if (!list.length) return null;
    const p = list[Math.floor(r() * list.length)];
    return p?.player?.name || p?.name || SIM_CONFIG.LABELS.PLAYER;
  }

  const subbedInNames = { home: new Set(), away: new Set() };

  function pickSub(players, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const alreadySubbed = subbedInNames[side];
    const getName = p => p?.player?.name || p?.name || '';
    let pool = players.filter(p => p && p.substitute && !expelled.has(getName(p)) && !alreadySubbed.has(getName(p)));
    if (!pool.length) {
      pool = players.filter(p => p && !expelled.has(getName(p)) && !alreadySubbed.has(getName(p)));
    }
    if (!pool.length) return null;
    const p = pool[Math.floor(r() * pool.length)];
    const name = getName(p) || SIM_CONFIG.LABELS.SUB;
    alreadySubbed.add(name);
    p.substitute = false;
    return name;
  }

  const getEffectiveUnits = (side, minute) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const effective = { ...u };
    const rcMult = (1 - s.redCardPenalty);
    
    // Lig temposu (volatility) ve kadro derinliğine göre dinamik yorgunluk hızı
    // Yüksek tempolu ligde dar kadrolar daha çabuk yorulur.
    const leaguePace = baseline.leagueGoalVolatility || 1.0; 
    const squadDepth = u.KADRO_DERINLIGI || 1.0;
    const fragility = u.PSIKOLOJIK_KIRILGANLIK || 1.0;
    const mentalToughness = u.ZİHİNSEL_DAYANIKLILIK || 1.0;
    const leagueTeamCount = baseline.leagueTeamCount || 20; // Genelde 18-20

    // Maçın hangi safhasında olduğumuzu lateBase (dinamik gol sonları dakikası) belirler
    const matchProgress = minute / (lateBase || 90); 
    
    // Yorgunluk Çarpanı: Takımın yorgunluk eşiği kadro derinliği ve zihinsel dirence göre esner
    const fatigueRate = (leaguePace * fragility) / (squadDepth * mentalToughness);
    // Yorgunluk maç ilerledikçe artar, minimum sınır kırılganlıkla orantılıdır, ölçek için lig takım sayısı kullanılır
    const fatigueFactor = Math.max(fragility / (squadDepth + mentalToughness), 1.0 - ((matchProgress * fatigueRate) / leagueTeamCount)); 

    // ── HÜCUM GRUBU ──
    effective.BITIRICILIK = u.BITIRICILIK * s.morale * rcMult * fatigueFactor;
    effective.YARATICILIK = u.YARATICILIK * s.morale * rcMult * fatigueFactor;
    effective.SUT_URETIMI = u.SUT_URETIMI * s.momentum * s.urgency * rcMult;
    effective.HAVA_HAKIMIYETI = u.HAVA_HAKIMIYETI * fatigueFactor * rcMult;
    effective.DURAN_TOP = u.DURAN_TOP * s.morale * rcMult;

    // ── SAVUNMA GRUBU ──
    effective.SAVUNMA_DIRENCI = u.SAVUNMA_DIRENCI * s.morale * fatigueFactor * rcMult;
    effective.SAVUNMA_AKSIYONU = u.SAVUNMA_AKSIYONU * s.momentum * fatigueFactor * rcMult;
    // Disiplin: takımın aciliyeti arttıkça kırılganlığa bağlı olarak düşer
    const urgencyExcess = Math.max(0, s.urgency - 1.0);
    const disciplineDrop = urgencyExcess * fragility * leaguePace; 
    effective.DISIPLIN = u.DISIPLIN * rcMult * Math.max(fragility / squadDepth, 1.0 - disciplineDrop); 

    // ── PSİKANALİZ GRUBU ──
    const moraleMin = baseline.normMinRatio || 0.5;
    const moraleMax = baseline.normMaxRatio || 2.0;
    effective.ZİHİNSEL_DAYANIKLILIK = clamp(u.ZİHİNSEL_DAYANIKLILIK * s.morale * rcMult, moraleMin, moraleMax);
    // Kırılganlık ters çalışır: Moral düştükçe ve kırmızı kart oldukça kırılganlık üstel artar
    const moraleDeficit = Math.max(0, 1.0 - s.morale);
    const cardImpact = s.redCardPenalty * (leaguePace / squadDepth); 
    effective.PSIKOLOJIK_KIRILGANLIK = u.PSIKOLOJIK_KIRILGANLIK * (1.0 + moraleDeficit) * (1.0 + cardImpact);
    effective.GOL_IHTIYACI = u.GOL_IHTIYACI * s.urgency * rcMult;
    // Turnuva baskısı: maç sonuna yaklaştıkça ligin temposu kadar artar
    const pressureGrowth = matchProgress * leaguePace * fragility;
    effective.TURNUVA_BASKISI = u.TURNUVA_BASKISI * (1.0 + pressureGrowth);

    // ── BAĞLAM GRUBU ──
    // Başlangıç etkisi dinamik earlyBase (ör. ilk 20 dk) içinde erir
    const earlyPhaseRatio = minute / (earlyBase || 20);
    effective.MAC_BASLANGICI = u.MAC_BASLANGICI * Math.max(0, 1.0 - earlyPhaseRatio);
    
    // Son dakika etkisi: lateBase geçildikten sonra aciliyete göre üstel fırlar
    const latePhaseAmplifier = Math.max(1.0, Math.pow(minute / (lateBase || 75), urgencyExcess + 1.0));
    effective.MAC_SONU = u.MAC_SONU * latePhaseAmplifier; 
    
    // Menajer taktiği, takımın aciliyet seviyesine göre sahaya daha çok yansır
    effective.MENAJER_STRATEJISI = u.MENAJER_STRATEJISI * s.urgency;
    
    // Hakem kararları stadyum momentumundan (lig volatilitesi oranında) etkilenir
    const momentumExcess = s.momentum - 1.0;
    effective.HAKEM_DINAMIKLERI = u.HAKEM_DINAMIKLERI * (1.0 + (momentumExcess * leaguePace)); 

    // ── OPERASYONEL GRUP ──
    effective.TAKTIKSEL_UYUM = u.TAKTIKSEL_UYUM * rcMult * fatigueFactor;
    effective.BAGLANTI_OYUNU = u.BAGLANTI_OYUNU * s.momentum * rcMult * fatigueFactor;
    // Kadro derinliği, yedekler oyuna girdikçe takımın base derinliğine ve lige göre artar
    const subImpact = subsDone[side] * (leaguePace / (squadDepth * leagueTeamCount));
    effective.KADRO_DERINLIGI = u.KADRO_DERINLIGI * (1.0 + subImpact);
    // H2H Dominasyon tarihseldir, maç içi sabittir (tek istisna)
    effective.H2H_DOMINASYON = u.H2H_DOMINASYON; 
    const momMin = baseline.normMinRatio || 0.5;
    const momMax = baseline.normMaxRatio || 2.5;
    effective.MOMENTUM_AKIŞI = clamp(u.MOMENTUM_AKIŞI * s.momentum * rcMult, momMin, momMax);

    // ── KALECİ GRUBU ──
    // Kaleci yorulmaz ama morali (ve savunmanın çöküşü) etkiler
    effective.GK_REFLEKS = u.GK_REFLEKS * s.morale; 
    effective.GK_ALAN_HAKIMIYETI = u.GK_ALAN_HAKIMIYETI * s.morale;
    effective.TOPLA_OYNAMA = u.TOPLA_OYNAMA * s.momentum * rcMult;

    return effective;
  };

  // Momentum → Possession duyarlılık katsayısı: lig gol dağılımından türetilir
  // Formül: possRange × leagueGoalVolatility / (leagueAvgGoals × momentumRange)
  // Volatil lig → momentum → possession etkisi büyür; stabil lig → daha az sapma
  const _mRange = SIM_CONFIG.LIMITS.MOMENTUM.MAX - SIM_CONFIG.LIMITS.MOMENTUM.MIN;
  const _pRange = SIM_CONFIG.LIMITS.POSSESSION.MAX - SIM_CONFIG.LIMITS.POSSESSION.MIN;
  const _lgVol = baseline.leagueGoalVolatility ?? null;
  const momentumPossCoeff = (_lgVol != null && baseline.leagueAvgGoals != null && baseline.leagueAvgGoals > 0)
    ? _pRange * _lgVol / (baseline.leagueAvgGoals * _mRange)
    : _pRange / (4 * _mRange); // saf geometri fallback: ~6.67

  // Dinamik zaman pencereleri: gerçek lig gol dağılımından (M005-M010) türetilir.
  // Veri yoksa makul statik fallback kullanılır.
  const earlyBase = dynamicTimeWindows?.EARLY_GAME_END ?? 20;
  const lateBase = dynamicTimeWindows?.LATE_GAME_START ?? 75;

  // Urgency erken faz kısaltma: density saturation formu (0.6/0.08/0.5/0.95 sabitleri kaldırıldı).
  const _urgencyEarlyFactor = (baseline.leaguePointDensity != null && baseline.leaguePointDensity >= 0)
    ? baseline.leaguePointDensity / (baseline.leaguePointDensity + 1)
    : 0;

  // Kırmızı kart ceza sınırları: RC_MAX × saturation (sabit 0.10/0.60/0.20/0.35/0.75 kaldırıldı).
  const _rcPenMax = SIM_CONFIG.LIMITS.RED_CARD_POWER_PENALTY_MAX ?? 0.8;
  const _rcCV = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  const _rcMedianCV = (baseline.medianGoalRate != null && baseline.leagueAvgGoals > 0)
    ? Math.abs(baseline.medianGoalRate - baseline.leagueAvgGoals) / baseline.leagueAvgGoals : null;
  const _rcMinPenalty = (_rcCV != null) ? _rcPenMax * _rcCV * _rcCV : null;
  const _rcMaxPenalty = (_rcCV != null && _rcMedianCV != null)
    ? _rcPenMax * _rcCV / (_rcCV + _rcMedianCV) : null;

  for (let minute = 1; minute <= 95; minute++) {
    const minuteEvents = [];
    const pushEvent = (ev) => {
      events.push(ev);
      minuteEvents.push(ev);
    };

    if (minute === 46) {
      pushEvent({ minute: 45, type: 'halftime', homeGoals: goals.home, awayGoals: goals.away });
    }

    // Urgency başlangıcı — dinamik _ihtMax envelope'u
    const _ihtMaxLoop = (baseline.normMaxRatio != null && baseline.normMinRatio != null)
      ? baseline.normMaxRatio + (1.0 - baseline.normMinRatio) : 2.0;
    const homeUrgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(homeUnits.GOL_IHTIYACI, 1.0, _ihtMaxLoop) - 1.0));
    const awayUrgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(awayUnits.GOL_IHTIYACI, 1.0, _ihtMaxLoop) - 1.0));

    if (minute > homeUrgencyStart || minute > awayUrgencyStart) {
      if (goals.away > goals.home && minute > homeUrgencyStart) {
        const timeRatio = (minute - homeUrgencyStart) / (95 - homeUrgencyStart);
        state.home.urgency = 1.0 + homeUnits.GOL_IHTIYACI * timeRatio;
      }
      if (goals.home > goals.away && minute > awayUrgencyStart) {
        const timeRatio = (minute - awayUrgencyStart) / (95 - awayUrgencyStart);
        state.away.urgency = 1.0 + awayUnits.GOL_IHTIYACI * timeRatio;
      }
    }

    // Erken oyun fazı: neutral takım earlyBase'e kadar sürer, GOL_IHTIYACI yüksekse kısalır
    const homeEarlyEnd = Math.max(0, earlyBase - earlyBase * _urgencyEarlyFactor * Math.max(0, homeUnits.GOL_IHTIYACI - 1.0));
    const awayEarlyEnd = Math.max(0, earlyBase - earlyBase * _urgencyEarlyFactor * Math.max(0, awayUnits.GOL_IHTIYACI - 1.0));
    const twHome = minute <= homeEarlyEnd ? homeUnits.MAC_BASLANGICI : (minute > homeUrgencyStart ? homeUnits.MAC_SONU : 1.0);
    const twAway = minute <= awayEarlyEnd ? awayUnits.MAC_BASLANGICI : (minute > awayUrgencyStart ? awayUnits.MAC_SONU : 1.0);

    // ─── Possession Belirleme (dakika başında) ──────────────────────────────
    // Şut ve korner yalnızca top sahibi takım için hesaplanır — fizik gerçeği.
    // Kart ve oyuncu değişikliği possession'dan bağımsız her iki takım için çalışır.
    const rawHomePoss = hProb.possessionBase * 100;
    const rawAwayPoss = aProb.possessionBase * 100;
    const possTotal = rawHomePoss + rawAwayPoss;
    const normalizedHomePoss = possTotal > 0 ? (rawHomePoss / possTotal) * 100 : 50;
    const currentHomePos = clamp(
      normalizedHomePoss + (state.home.momentum - state.away.momentum) * momentumPossCoeff,
      SIM_CONFIG.LIMITS.POSSESSION.MIN, SIM_CONFIG.LIMITS.POSSESSION.MAX
    );
    // Rastgele top sahibi: ev sahibi possession oranına göre stokastik seçim
    const possessor = r() < currentHomePos / 100 ? 'home' : 'away';
    const oppSideOfPoss = possessor === 'home' ? 'away' : 'home';

    // ─── Hücum Fazı: Yalnızca top sahibi takım şut + korner + penaltı ──────
    {
      const side = possessor;
      const isHome = side === 'home';
      const atkPower = getAttackPower(side, oppSideOfPoss, minute) * (isHome ? twHome : twAway);
      const oppDefPower = getDefensePower(oppSideOfPoss);
      const attkProb = isHome ? hProb : aProb;
      const defProb = isHome ? aProb : hProb;

      // Azalan verimler: pow(rawFlow, blockRate) — doğal logaritmik sönümleme
      // dampCoeff = defProb.blockRate: gerçek blok oranı verisi (M034) — statik sınır yok
      const rawFlow = atkPower / Math.max(oppDefPower, EPS);
      const dampCoeff = defProb.blockRate;
      const dampedFlow = Math.pow(Math.max(rawFlow, EPS), dampCoeff);
      const shotProb = clamp(attkProb.shotsPerMin * dampedFlow, SIM_CONFIG.LIMITS.PROBABILITY.MIN, SIM_CONFIG.LIMITS.PROBABILITY.MAX);
      if (r() < shotProb) {
        stats[side].shots++;
        // KRİTİK: onTargetRate = M014/M013 (gerçek sezon SOT oranı) — BAGLANTI_OYUNU burada çift sayma olur
        // adjustedOnTargetRate: blok sonrası kalan şutların isabetli olma olasılığı
        // P(isabet | bloklanmamış) = rawOnTargetRate / (1 - blockRate) — matematiksel türev, veri bazlı
        const adjustedOnTargetRate = attkProb.onTargetRate / Math.max(1 - defProb.blockRate, EPS);
        const onTargetProb = clamp(adjustedOnTargetRate / (weatherErrorMult || ND.WEATHER_IDENTITY), SIM_CONFIG.LIMITS.ON_TARGET.MIN, SIM_CONFIG.LIMITS.ON_TARGET.MAX);
        const blockProb = clamp(defProb.blockRate * oppDefPower / Math.max(atkPower, EPS), SIM_CONFIG.LIMITS.BLOCK.MIN, SIM_CONFIG.LIMITS.BLOCK.MAX);

        if (r() < blockProb) {
          pushEvent({ minute, type: 'shot_blocked', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
        } else if (r() < onTargetProb) {
          stats[side].shotsOnTarget++;
          // Gol dönüşüm oranı — kaleci performansına göre adjust, flow çarpanı YOK
          // Kalite üstünlüğü daha fazla gol değil, daha temiz fırsatlar üretir
          // gkAdj: sqrt() doğal sönümleme — statik clamp yerine matematiksel azalan verimler
          // rawGkAdj=1.0 → gkAdj=1.0, rawGkAdj=4.0 → gkAdj=2.0 (doğal tavan)
          // gkAdj: rakip KK oranı lig ortalamasına göre normalize — veri yoksa lig ortalaması (gkAdj=1.0)
          const defGKSave = defProb.gkSaveRate ?? baseline.gkSaveRate;
          const rawGkAdj = (1 - defGKSave) / Math.max(1 - baseline.gkSaveRate, 0.01);
          const gkAdj = Math.sqrt(Math.max(rawGkAdj, 0.01));
          const goalProb = clamp(attkProb.goalConvRate * gkAdj, SIM_CONFIG.LIMITS.PROBABILITY.MIN, SIM_CONFIG.LIMITS.PROBABILITY.MAX) * (weatherGoalMult || ND.WEATHER_IDENTITY);

          if (r() < goalProb) {
            goals[side]++;
            pushEvent({ minute, type: 'goal', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
            const sResil = isHome ? homeUnits.ZİHİNSEL_DAYANIKLILIK : awayUnits.ZİHİNSEL_DAYANIKLILIK;
            const cFragil = isHome ? awayUnits.PSIKOLOJIK_KIRILGANLIK : homeUnits.PSIKOLOJIK_KIRILGANLIK;
            const scorerKillerInst = isHome ? homeUnits.FİŞİ_ÇEKME : awayUnits.FİŞİ_ÇEKME;
            // Morale cascade: goalConvRate / expected shots ile normalize
            const goalDampening = 1.0 / (goals[side] + 1);
            const expectedShots = Math.max(attkProb.shotsPerMin * 90, 1);
            const normalizedConv = attkProb.goalConvRate / expectedShots;
            const oppExpShots = Math.max(defProb.shotsPerMin * 90, 1);
            const negNormalizedConv = defProb.goalConvRate / oppExpShots;
            const posBoost = normalizedConv * scorerKillerInst * goalDampening;
            const negDrop = negNormalizedConv * cFragil * goalDampening;
            if (isHome) {
              state.home.morale = clamp(state.home.morale + posBoost, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
              state.home.momentum = clamp(state.home.momentum + posBoost * attkProb.onTargetRate, SIM_CONFIG.LIMITS.MOMENTUM.MIN, SIM_CONFIG.LIMITS.MOMENTUM.MAX);
              state.away.morale = clamp(state.away.morale - negDrop, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            } else {
              state.away.morale = clamp(state.away.morale + posBoost, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
              state.away.momentum = clamp(state.away.momentum + posBoost * attkProb.onTargetRate, SIM_CONFIG.LIMITS.MOMENTUM.MIN, SIM_CONFIG.LIMITS.MOMENTUM.MAX);
              state.home.morale = clamp(state.home.morale - negDrop, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            }
          } else {
            pushEvent({ minute, type: 'shot_on_target', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
          }
        } else {
          pushEvent({ minute, type: 'shot_off_target', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
        }
      }

      // Korner — takımın kendi korner üretim kapasitesine dayalı, baskıdan BAĞIMSIZ
      // Gerçek futbolda korner; savunma bloğu, kenar baskısı ve orta sıklığından oluşur
      // Atak gücüyle doğrudan çarpılmaz — takımın kendi cornerPerMin datası yeterli
      const cornerProb = clamp(attkProb.cornerPerMin, SIM_CONFIG.LIMITS.CORNER.MIN, SIM_CONFIG.LIMITS.CORNER.MAX);
      if (r() < cornerProb) {
        stats[side].corners++;
        const m023raw = getM(isHome ? homeMetrics : awayMetrics, sel, 'M023') ?? dynamicAvgs?.M023 ?? SIM_CONFIG.GLOBAL_FALLBACK.CORNER_GOAL_RATE;
        if (m023raw != null) {
          const havaFactor = isHome ? homeUnits.HAVA_HAKIMIYETI : awayUnits.HAVA_HAKIMIYETI;
          const cornerGoalRate = (m023raw / 100) * havaFactor;
          const cgProb = clamp(cornerGoalRate, SIM_CONFIG.LIMITS.CORNER_GOAL.MIN, SIM_CONFIG.LIMITS.CORNER_GOAL.MAX);
          // spMorale: gol morale ile aynı normalize formül — goalConvRate / expectedShots
          const spExpShots = Math.max(attkProb.shotsPerMin * 90, 1);
          const spMorale = attkProb.goalConvRate / spExpShots;
          if (r() < cgProb) {
            goals[side]++;
            pushEvent({ minute, type: 'goal', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'D'], side), subtype: 'corner' });
            const sResil = isHome ? homeUnits.ZİHİNSEL_DAYANIKLILIK : awayUnits.ZİHİNSEL_DAYANIKLILIK;
            const cFragil = isHome ? awayUnits.PSIKOLOJIK_KIRILGANLIK : homeUnits.PSIKOLOJIK_KIRILGANLIK;
            if (isHome) {
              state.home.morale = clamp(state.home.morale + spMorale * sResil, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
              state.away.morale = clamp(state.away.morale - spMorale * cFragil, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            } else {
              state.away.morale = clamp(state.away.morale + spMorale * sResil, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
              state.home.morale = clamp(state.home.morale - spMorale * cFragil, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            }
          } else {
            pushEvent({ minute, type: 'corner', team: side });
          }
        } else {
          pushEvent({ minute, type: 'corner', team: side });
        }
      }

      // Penaltı — hücum fazında, top sahibi takım
      if (state[side].redCardPenalty === 0) {
        if (r() < penCurrentBudget[side] / 90) {
          penCurrentBudget[side] = 0;
          stats[side].penalties++;
          const penPlayer = pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M'], side);
          if (r() < attkProb.penConvRate) {
            goals[side]++;
            pushEvent({ minute, type: 'goal', team: side, player: penPlayer, subtype: 'penalty' });
          } else {
            pushEvent({ minute, type: 'penalty_missed', team: side, player: penPlayer });
          }
        }
      }
    }

    // ─── Kart & Değişiklik Fazı: Her iki takım (possession'dan bağımsız) ───
    for (const side of ['home', 'away']) {
      const isHome = side === 'home';
      const attkProb = isHome ? hProb : aProb;
      const discUnit = isHome ? homeUnits.DISIPLIN : awayUnits.DISIPLIN;

      const yellowProb = clamp(attkProb.yellowPerMin / Math.max(discUnit, EPS), 0.0001, 0.05);
      const redProb = clamp(attkProb.redPerMin / Math.max(discUnit, EPS), 0, 0.002);
      const resilience = geo2(isHome ? homeUnits.DISIPLIN : awayUnits.DISIPLIN, isHome ? homeUnits.ZİHİNSEL_DAYANIKLILIK : awayUnits.ZİHİNSEL_DAYANIKLILIK);
      const kadroDepth = isHome ? homeUnits.KADRO_DERINLIGI : awayUnits.KADRO_DERINLIGI;
      const _rcPM = _rcMinPenalty ?? 0;
      const _rcPX = _rcMaxPenalty ?? _rcPenMax;
      const organicPenalty = clamp((1.0 / Math.max(kadroDepth, EPS) - 1.0) / Math.max(EPS, resilience), _rcPM, _rcPX);

      // Direct Red Card
      if (r() < redProb) {
        const cardName = pickActivePlayer(isHome ? hPlayers : aPlayers, null, side) || `Player ${Math.floor(r() * 11) + 1}`;
        if (!expelledPlayers[side].has(cardName)) {
          expelledPlayers[side].add(cardName);
          stats[side].redCards++;
          state[side].redCardPenalty = clamp(state[side].redCardPenalty + organicPenalty, 0, _rcPenMax);
          pushEvent({ minute, type: 'red_card', team: side, player: cardName, subtype: 'direct_red' });
        }
      } 
      // Yellow Card
      else if (r() < yellowProb) {
        // Use a generic player ID 1-11 if lineups are missing to prevent every card going to the same "Player"
        const cardName = pickActivePlayer(isHome ? hPlayers : aPlayers, null, side) || `Player ${Math.floor(r() * 11) + 1}`;
        if (!expelledPlayers[side].has(cardName)) {
          const yellows = playerYellows[side];
          yellows[cardName] = (yellows[cardName] || 0) + 1;
          stats[side].yellowCards++;
          
          if (yellows[cardName] >= 2) {
            expelledPlayers[side].add(cardName);
            stats[side].redCards++;
            state[side].redCardPenalty = clamp(state[side].redCardPenalty + organicPenalty, 0, _rcPenMax);
            pushEvent({ minute, type: 'red_card', team: side, player: cardName, subtype: 'second_yellow' });
          } else {
            pushEvent({ minute, type: 'yellow_card', team: side, player: cardName });
          }
        }
      }

      if (minute > 45 && subsDone[side] < SIM_CONFIG.SUBS.MAX) {
        if (r() < (SIM_CONFIG.SUBS.MAX - subsDone[side]) / (95 - minute + 1)) {
          const subIn = pickSub(isHome ? hPlayers : aPlayers, side);
          if (subIn) {
            subsDone[side]++;
            pushEvent({ minute, type: 'substitution', team: side, playerIn: subIn, playerOut: pickActivePlayer(isHome ? hPlayers : aPlayers, null, side) });
            const sqImpact = isHome ? (homeSubQuality ?? ND.COUNTER_INIT) : (awaySubQuality ?? ND.COUNTER_INIT);
            if (sqImpact !== 0) {
              state[side].morale = clamp(state[side].morale + sqImpact, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            }
          }
        }
      }
    }

    minuteLog.push({
      minute,
      events: minuteEvents,
      behavioralState: { home: getEffectiveUnits('home', minute), away: getEffectiveUnits('away', minute) },
      possession: { home: Math.round(currentHomePos), away: 100 - Math.round(currentHomePos) }
    });
  }

  // Final possession: M150-based baseline normalized between two teams, adjusted by TOPLA_OYNAMA unit delta
  const _fpTotal = hProb.possessionBase * 100 + aProb.possessionBase * 100;
  const _fpBase = _fpTotal > 0 ? (hProb.possessionBase * 100 / _fpTotal) * 100 : 50;
  const finalHomePoss = Math.round(clamp(
    _fpBase + (homeUnits.TOPLA_OYNAMA - awayUnits.TOPLA_OYNAMA) * 20,
    SIM_CONFIG.LIMITS.POSSESSION.MIN, SIM_CONFIG.LIMITS.POSSESSION.MAX
  ));
  return { result: { homeGoals: goals.home, awayGoals: goals.away, winner: goals.home > goals.away ? 'home' : (goals.away > goals.home ? 'away' : 'draw') }, stats: { home: { ...stats.home, possession: finalHomePoss }, away: { ...stats.away, possession: 100 - finalHomePoss } }, events, minuteLog, units: { home: homeUnits, away: awayUnits } };
}

function simulateMultipleRuns(params) {
  const { runs = 1000, rng } = params;
  const r = rng || Math.random;
  let bestSampleRun = null;
  let bestSampleDist = Infinity;
  const candidateRuns = [];

  let homeWins = 0, draws = 0, awayWins = 0;
  let over15 = 0, over25 = 0, btts = 0;
  let totalGoals = 0, totalHomeGoals = 0, totalAwayGoals = 0;
  const scoreMap = {};

  for (let i = 0; i < runs; i++) {
    const run = simulateSingleRun(params);
    const hg = run.result.homeGoals;
    const ag = run.result.awayGoals;
    
    const total = hg + ag;
    if (hg > ag) homeWins++;
    else if (ag > hg) awayWins++;
    else draws++;
    
    if (total > 1.5) over15++;
    if (total > 2.5) over25++;
    if (hg > 0 && ag > 0) btts++;
    
    totalGoals += total;
    totalHomeGoals += hg;
    totalAwayGoals += ag;
    
    const key = `${hg}-${ag}`;
    scoreMap[key] = (scoreMap[key] || 0) + 1;

    if (i === 0 || i % 50 === 0) candidateRuns.push(run);
  }

  const avgHome = totalHomeGoals / runs;
  const avgAway = totalAwayGoals / runs;
  for (const run of candidateRuns) {
    const dist = Math.abs(run.result.homeGoals - avgHome) + Math.abs(run.result.awayGoals - avgAway);
    if (dist < bestSampleDist) {
      bestSampleDist = dist;
      bestSampleRun = run;
    }
  }

  const pct = v => +((v / runs) * 100).toFixed(1);
  const sortedScores = Object.entries(scoreMap).sort((a, b) => b[1] - a[1]);
  return {
    runs,
    distribution: {
      homeWin: pct(homeWins), draw: pct(draws), awayWin: pct(awayWins),
      over15: pct(over15), over25: pct(over25), btts: pct(btts),
      avgGoals: +(totalGoals / runs).toFixed(2),
      avgHomeGoals: +avgHome.toFixed(2),
      avgAwayGoals: +avgAway.toFixed(2),
      topScore: sortedScores[0]?.[0] ?? null,
      scoreFrequency: sortedScores.slice(0, 10).reduce((acc, [score, cnt]) => { acc[score] = pct(cnt); return acc; }, {}),
      lambdaAnchored: false,
    },
    sampleRun: bestSampleRun
  };
}

function simulateMatch(params) {
  const { runs = 1, lineups, audit } = params;

  // Lineup Pool Audit - Trace exactly how many players were active in this simulation
  if (audit && audit.addSimTrace) {
    audit.addSimTrace('lineup_pool_size', {
      home: lineups?.home?.players?.length || 0,
      away: lineups?.away?.players?.length || 0,
      isFallback: lineups?.isFallback || false
    });
  }

  if (runs > 1) return simulateMultipleRuns(params);
  return simulateSingleRun(params);
}

module.exports = { simulateMatch, simulateSingleRun, simulateMultipleRuns, calculateUnitImpact, computeProbBases, SIM_BLOCKS };
