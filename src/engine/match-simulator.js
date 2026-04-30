/**
 * match-simulator.js
 * 90-minute minute-by-minute match simulation engine.
 * Decoupled from static constants and fully driven by dynamic baselines.
 */

'use strict';

const { SIM_CONFIG, getDynamicLimits } = require('./sim-config');
const { recordBaselineTrace, recordSimWarning } = require('./audit-helper');
const { computeWeatherMultipliers } = require('../services/weather-service');
const { BLOCK_QF_MAP, computeAlpha, computeQualityFactors } = require('./quality-factors');
const { applyZoneModifiers } = require('./lineup-impact');
const { applyEventImpact, applyNaturalRegression, applyHalftimeRegression, updateTacticalStance, computeLeagueScale, computePressingImpactScale } = require('./event-impact');
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
    { id: 'M064', weight: 4, sign: 1 }, { id: 'M165', weight: 3, sign: 1 },
    { id: 'M186', weight: 2, sign: 1 }  // ResistanceIndex: beklentinin üzerinde performans gösteren takım daha sağlam
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
    { id: 'M172', weight: 3, sign: 1 },
    { id: 'M188', weight: 2, sign: 1 }  // ΔMarketMove: piyasa bu yönde hareket ettiyse motivasyon sinyali
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
    : baseline.possessionBase != null ? baseline.possessionBase * 90 : 45; // veri yoksa %50 → 45dk
  const shotsPerMin = shotsPerMatch != null
    ? shotsPerMatch / Math.max(possMinutes, 1) // sıfıra bölme koruması
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

function calculateUnitImpact(blockId, metrics, selected, audit, dynamicAvgs, baseline, dynamicLimits) {
  const block = SIM_BLOCKS[blockId];
  if (!block) return 1.0;

  // Dinamik normalizasyon sınırları: baseline'dan al (league-averages.js türetir).
  // normMinRatio = min takım gol/maç ÷ lig ort., normMaxRatio = max takım ÷ lig ort.
  // Veri yoksa 1.0 kimliği (normalizasyon uygulanmaz — identity clamp).
  // İKİ MOTOR (match-simulator + simulatorEngine) AYNI BU DEĞERLERİ KULLANIR.
  const nMin = (baseline && baseline.normMinRatio != null && baseline.normMinRatio > 0) ? baseline.normMinRatio : (dynamicLimits?.POWER?.MIN ?? 1.0);
  const nMax = (baseline && baseline.normMaxRatio != null && baseline.normMaxRatio > 0) ? baseline.normMaxRatio : (dynamicLimits?.POWER?.MAX ?? 1.0);

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
    const amplify = baseline.leagueGoalVolatility ?? null;
    const rawRatio = val / leagueAvg;
    let normalized;
    if (amplify != null) {
      const variance = rawRatio - 1.0;
      normalized = clamp(1.0 + (variance * amplify), nMin, nMax);
    } else {
      normalized = rawRatio; // volatilite yoksa ham oran
    }

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
  const { goalMult: weatherGoalMult, errorMult: weatherErrorMult } = computeWeatherMultipliers(weatherMetrics || {}, baseline?.leagueGoalVolatility);
  const sel = selectedMetrics instanceof Set ? selectedMetrics : new Set(selectedMetrics || []);
  const hPlayers = lineups?.home?.players || lineups?.home || null;
  const aPlayers = lineups?.away?.players || lineups?.away || null;

  // ── Sahada olan oyuncuları açıkça takip et ──────────────────────────────
  // SofaScore verisindeki substitute/isReserve bayraklarına güvenmek yerine,
  // simülasyon başında sadece ilk 11'i "sahada" olarak işaretle.
  // Oyuncu değişikliklerinde bu set güncellenir.
  // Bu sayede kadro dışı bir oyuncu asla gol atamaz veya kart göremez.
  const getName = p => p?.player?.name || p?.name || '';
  const onPitch = {
    home: new Set(),
    away: new Set()
  };

  // İlk 11'i belirle: substitute=false VE isReserve=false olan ilk 11 oyuncu
  if (hPlayers) {
    let count = 0;
    for (const p of hPlayers) {
      if (!p || p.substitute || p.isReserve) continue;
      if (count >= 11) break;
      const name = getName(p);
      if (name) onPitch.home.add(name);
      count++;
    }
  }
  if (aPlayers) {
    let count = 0;
    for (const p of aPlayers) {
      if (!p || p.substitute || p.isReserve) continue;
      if (count >= 11) break;
      const name = getName(p);
      if (name) onPitch.away.add(name);
      count++;
    }
  }

  // Sıfıra bölme epsilon — lig gol ortalamasından türetilir (veri yoksa 1/1000 güvenli).
  const EPS = (baseline?.leagueAvgGoals || 1) / 1000;

  const goals = { home: 0, away: 0 };
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
    away: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
  };
  const events = [];
  const minuteLog = [];

  // Dinamik limitler — calculateUnitImpact'a parametre olarak geçirilir
  const DYN_LIMITS = getDynamicLimits ? getDynamicLimits(baseline) : SIM_CONFIG.LIMITS;

  const homeUnits = {};
  const awayUnits = {};
  for (const blockId in SIM_BLOCKS) {
    homeUnits[blockId] = calculateUnitImpact(blockId, homeMetrics, sel, audit, dynamicAvgs, baseline, DYN_LIMITS);
    awayUnits[blockId] = calculateUnitImpact(blockId, awayMetrics, sel, audit, dynamicAvgs, baseline, DYN_LIMITS);
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

  // ── Bölgesel Kadro Etkisi (ZQM) ──────────────────────────────────────────
  // PVKD piyasa değeri kalite faktörlerinden SONRA, bireysel oyuncu kalitesini
  // mevki bazlı (G/D/M/F) behavioral unit'lere yansıtır.
  // zoneQualityRatios = { G: 0.85, D: 1.0, M: 0.95, F: 1.1 } — Workshop'ta hesaplanır.
  // Yoksa (kadro değişmedi): tüm ratios identity (1.0), applyZoneModifiers erken çıkar.
  const _hZQR = baseline.homeZoneQualityRatios ?? { G: 1.0, D: 1.0, M: 1.0, F: 1.0 };
  const _aZQR = baseline.awayZoneQualityRatios ?? { G: 1.0, D: 1.0, M: 1.0, F: 1.0 };
  const _hLQRForZQM = baseline.homeLineupQualityRatio ?? 1.0;
  const _aLQRForZQM = baseline.awayLineupQualityRatio ?? 1.0;
  const _hDynW = baseline.homeDynamicBlockWeights ?? null;
  const _aDynW = baseline.awayDynamicBlockWeights ?? null;
  applyZoneModifiers(homeUnits, _hZQR, _hLQRForZQM, _hDynW);
  applyZoneModifiers(awayUnits, _aZQR, _aLQRForZQM, _aDynW);

  // ── GOL_IHTIYACI Baskı Boost (M180/M182 entegrasyonu) ──────────────────────
  // Küme düşme veya şampiyonluk baskısı GOL_IHTIYACI birimini güçlendirir.
  // M180: ev küme düşme [0-1], M182: ev şampiyonluk [0-1]
  // M181: dep küme düşme [0-1], M183: dep şampiyonluk [0-1]
  // Baskı çarpanı: lgCV'den türetilir. Volatil lig → baskı daha etkili
  const _lgCVForPressure = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  const _pressureMult = _lgCVForPressure != null ? _lgCVForPressure / (1 + _lgCVForPressure) : null;
  const _hRelP = homeMetrics.M180 ?? null;
  const _hTitP = homeMetrics.M182 ?? null;
  if (homeUnits.GOL_IHTIYACI != null && (_hRelP != null || _hTitP != null) && _pressureMult != null) {
    const maxPressure = Math.max(_hRelP ?? 0, _hTitP ?? 0);
    homeUnits.GOL_IHTIYACI *= (1.0 + maxPressure * _pressureMult);
  }
  const _aRelP = awayMetrics.M181 ?? null;
  const _aTitP = awayMetrics.M183 ?? null;
  if (awayUnits.GOL_IHTIYACI != null && (_aRelP != null || _aTitP != null) && _pressureMult != null) {
    const maxPressure = Math.max(_aRelP ?? 0, _aTitP ?? 0);
    awayUnits.GOL_IHTIYACI *= (1.0 + maxPressure * _pressureMult);
  }

  const hProb = computeProbBases(homeMetrics, sel, homeUnits, baseline, audit, _simQF.home);
  const aProb = computeProbBases(awayMetrics, sel, awayUnits, baseline, audit, _simQF.away);



  // ── Bölge-Bazlı Sim Param Ölçeklemesi ────────────────────────────────
  // ZQM behavioral unit'leri zaten modifiye etti. Burada sim parametrelerini
  // (shotsPerMin, goalConvRate, gkSaveRate, blockRate) de bölge oranlarıyla
  // ölçekliyoruz. Her parametre ilgili bölgenin kalitesinden etkilenir:
  //   shotsPerMin → ATK zone (forvet üretimi)
  //   onTargetRate → ATK zone
  //   goalConvRate → ATK+MID zone (bitiricilik + yaratıcılık)
  //   gkSaveRate → GK zone (kaleci refleksi)
  //   blockRate → DEF zone (savunma müdahalesi)
  const { computeBlockZoneModifier: _cbzm } = require('./lineup-impact');
  const _applyZoneSimParams = (prob, zqr, lqr, dynW) => {
    if (!zqr) return;
    const allIdentity = Object.values(zqr).every(r => r === 1.0);
    if (allIdentity && lqr === 1.0) return;
    // ATK bölgesi → şut üretimi ve isabetlilik
    const atkMod = _cbzm('BITIRICILIK', zqr, lqr, dynW);   // Dinamik: oyuncu profil bazlı
    if (atkMod !== 1.0) {
      prob.shotsPerMin *= atkMod;
      prob.onTargetRate *= atkMod;
    }
    // ATK+MID bölgesi → gol dönüşümü (bitiricilik + yaratıcılık)
    const atkMidMod = _cbzm('YARATICILIK', zqr, lqr, dynW); // Dinamik: oyuncu profil bazlı
    if (atkMidMod !== 1.0) {
      // Damping: lgCV'den türetilen yuvarlanma. Düşük CV → damping sert (~0.5), yüksek CV → damping hafif (~0.8)
      const _dampExp = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
        ? 1 / (1 + baseline.leagueGoalVolatility / baseline.leagueAvgGoals) : (1 / 2);
      prob.goalConvRate *= Math.pow(atkMidMod, _dampExp);
    }
    // GK bölgesi → kaleci kurtarış performansı
    const gkMod = _cbzm('GK_REFLEKS', zqr, lqr, dynW);     // G:1.00 (statik, tek bölge)
    if (gkMod !== 1.0 && prob.gkSaveRate != null) {
      prob.gkSaveRate *= gkMod;
    }
    // DEF bölgesi → savunma müdahalesi
    const defMod = _cbzm('SAVUNMA_AKSIYONU', zqr, lqr, dynW); // Dinamik: oyuncu profil bazlı
    if (defMod !== 1.0) {
      // Savunma damping: aynı lgCV-bazlı exponent
      const _defDampExp = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
        ? 1 / (1 + baseline.leagueGoalVolatility / baseline.leagueAvgGoals) : (1 / 2);
      prob.blockRate *= Math.pow(defMod, _defDampExp);
    }
  };
  _applyZoneSimParams(hProb, _hZQR, _hLQRForZQM, _hDynW);
  _applyZoneSimParams(aProb, _aZQR, _aLQRForZQM, _aDynW);

  // Ev sahibi avantajı doğrudan uygulanır (Anchor engeli kaldırıldı)
  if (homeAdvantage != null && homeAdvantage !== 1.0) {
    const advBoost = Math.sqrt(homeAdvantage);
    hProb.shotsPerMin = hProb.shotsPerMin * advBoost;
    aProb.shotsPerMin = aProb.shotsPerMin / advBoost;
  }

  // Morale başlangıcı: FORM_KISA birimine göre. normLimits envelope'undan (dinamik).
  // Scale: lig CV'si (vol/avg) — volatil lig daha sert morale kayması.
  // DYN_LIMITS daha yukarıda hesaplandı (calculateUnitImpact'tan önce).
  const _mMin = (baseline.normMinRatio != null && baseline.normMinRatio > 0) ? baseline.normMinRatio : DYN_LIMITS.FORM_MORALE.MIN;
  const _mMax = (baseline.normMaxRatio != null && baseline.normMaxRatio > 0) ? baseline.normMaxRatio : DYN_LIMITS.FORM_MORALE.MAX;
  const _mScale = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals
    : DYN_LIMITS.FORM_MORALE.SCALE;
  const homeMoraleStart = clamp(1.0 + (homeUnits.FORM_KISA - 1.0) * _mScale, _mMin, _mMax);
  const awayMoraleStart = clamp(1.0 + (awayUnits.FORM_KISA - 1.0) * _mScale, _mMin, _mMax);

  // NaN koruma: herhangi bir birim hesabı NaN üretirse, nötr kimlik (1.0) kullanılır.
  // Bu veri kaybı değil — NaN demek "hesap yapılamadı" demektir, 1.0 ise "etki yok" (identity).
  const _safeNum = (v) => (isFinite(v) ? v : 1.0);

  // ── Genişletilmiş Game State ──────────────────────────────────────────────────
  // M177: pressing yoğunluğu, M178: territorial control, M096b: yorgunluk endeksi
  const _hPressing = getM(homeMetrics, sel, 'M177');
  const _aPressing = getM(awayMetrics, sel, 'M177');
  const _hTerritory = getM(homeMetrics, sel, 'M178');
  const _aTerritory = getM(awayMetrics, sel, 'M178');
  const _hFatigue = getM(homeMetrics, sel, 'M096b');
  const _aFatigue = getM(awayMetrics, sel, 'M096b');

  // Territory ve pressing başlangıç fallback: possessionBase'den türetilir (0.5 statik değil)
  const _hTerritoryInit = _hTerritory != null ? _hTerritory / 100 : hProb.possessionBase;
  const _aTerritoryInit = _aTerritory != null ? _aTerritory / 100 : aProb.possessionBase;
  const _hPressingInit = _hPressing != null ? _hPressing / 100 : (hProb.pressIntensity ?? hProb.possessionBase);
  const _aPressingInit = _aPressing != null ? _aPressing / 100 : (aProb.pressIntensity ?? aProb.possessionBase);
  // Fatigue başlangıç: dinlenme günü ve yorgunluk endeksinden türetilir
  const _hFatigueInit = _hFatigue != null ? _hFatigue / 100 : (baseline.homeFatigue != null ? (1 - baseline.homeFatigue) : 0);
  const _aFatigueInit = _aFatigue != null ? _aFatigue / 100 : (baseline.awayFatigue != null ? (1 - baseline.awayFatigue) : 0);

  const state = {
    home: {
      momentum: _safeNum(homeUnits.MOMENTUM_AKIŞI),
      morale: _safeNum(homeMoraleStart),
      urgency: 1.0,
      redCardPenalty: 0,
      tacticalStance: 0.0,                  // [-1, +1]: park the bus ↔ all-out attack
      territory: _hTerritoryInit,            // [0, 1]: possessionBase'den türetilir
      pressing: _hPressingInit,              // [0, 1]: pressing verisi veya possessionBase
      fatigue: _hFatigueInit,                // [0, 1]: yorgunluk endeksi veya rest days
      recentActions: [],
      _initialTerritory: _hTerritoryInit,    // regresyon hedefi için
    },
    away: {
      momentum: _safeNum(awayUnits.MOMENTUM_AKIŞI),
      morale: _safeNum(awayMoraleStart),
      urgency: 1.0,
      redCardPenalty: 0,
      tacticalStance: 0.0,
      territory: _aTerritoryInit,
      pressing: _aPressingInit,
      fatigue: _aFatigueInit,
      recentActions: [],
      _initialTerritory: _aTerritoryInit,
    }
  };

  // Başlangıç değerleri — regresyon sistemi için saklama
  const initialState = {
    home: { momentum: state.home.momentum, morale: state.home.morale, pressing: state.home.pressing },
    away: { momentum: state.away.momentum, morale: state.away.morale, pressing: state.away.pressing },
  };

  const expelledPlayers = { home: new Set(), away: new Set() };
  const playerYellows = { home: {}, away: {} };
  const subsDone = { home: 0, away: 0 };

  const homePenBudget = getM(homeMetrics, sel, 'M019') ?? baseline.penPerMatch;
  const awayPenBudget = getM(awayMetrics, sel, 'M019') ?? baseline.penPerMatch;
  const penCurrentBudget = { home: homePenBudget, away: awayPenBudget };

  // NaN-safe geometrik ortalama: isFinite kontrolü ile.
  // Math.max(NaN, 0.01) = NaN olduğundan, açık isFinite kontrolü gerekli.
  const _s = v => (isFinite(v) && v > 0.01) ? v : 0.01;
  const geo3 = (a, b, c) => Math.cbrt(_s(a) * _s(b) * _s(c));
  const geo2 = (a, b) => Math.sqrt(_s(a) * _s(b));

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
      ? baseline.normMaxRatio + (1.0 - baseline.normMinRatio)
      : (DYN_LIMITS?.POWER?.MAX != null ? DYN_LIMITS.POWER.MAX + (1.0 - (DYN_LIMITS?.POWER?.MIN ?? 1.0)) : 2.0);

    const urgencyStart = _ihtMax != null
      ? Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(u.GOL_IHTIYACI, 1.0, _ihtMax) - 1.0))
      : lateBase; // veri yoksa urgency başlangıcı = lateBase (nötr)
    const urgency = (minute > urgencyStart) ? s.urgency : 1.0;

    // ── Dinamik Konfor Freni (comfortBrake) ──────────────────────────────────
    // Fark açıldığında takımın hücum eforunu azaltma (rehavet) veya sürdürme (acımasızlık) kararı.
    // Tüm parametreler dinamik: statik yüzdelik değer veya keyfi sabit YOK.
    //
    // Girdiler:
    //   - Saldıran: FİŞİ_ÇEKME (killer instinct), GOL_IHTIYACI (relegation/cup/championship pressure),
    //               TURNUVA_BASKISI (tournament stage importance)
    //   - Savunan:  PSIKOLOJIK_KIRILGANLIK (fragility), ZİHİNSEL_DAYANIKLILIK (toughness)
    //   - Lig:      leagueGoalVolatility (league pace)
    //
    // Mantık:
    //   1. rawBrake: Takımın doğal rehavet eğilimi (ZİHİNSEL/FİŞİ × leagueRef/teamExp).
    //      Oran tersine çevrildi: güçlü takımda < 1.0 → doğal fren, zayıf takımda ≈ 1.0.
    //   2. Her ekstra gol için üstel sönümleme uygulanır, AMA sönümlemenin şiddeti
    //      tamamen "Kan Kokusu" (bloodlustRatio) tarafından belirlenir.
    //   3. bloodlustRatio yüksekse (acımasız takım + kırılgan rakip + turnuva baskısı):
    //      sönümleme neredeyse sıfır → maç 7-0, 8-0'a gidebilir.
    //   4. bloodlustRatio düşükse (rahat takım + dirençli rakip + düşük baskı):
    //      sönümleme sert → maç 2-0 veya 3-0'da donar.
    const pb_side = side === 'home' ? hProb : aProb;
    const oppPb = oppSide === 'home' ? hProb : aProb;
    const teamExpGoalsRaw = pb_side.shotsPerMin * 90 * pb_side.onTargetRate * pb_side.goalConvRate;
    const _brakeLeagueRef = baseline.leagueAvgGoals ?? teamExpGoalsRaw;
    // Konfor freni referansı: lgCV'den türetilen minimum beklenen gol
    // Düşük CV → %50 referans (istikrarlı lig = düşük gol beklentisi yeterli)
    // Yüksek CV → %30 referans (kaotik lig = düşük beklenti normal)
    const _brakeThreshRatio = (baseline?.leagueGoalVolatility != null && baseline?.leagueAvgGoals > 0)
      ? 1 / (1 + baseline.leagueGoalVolatility / baseline.leagueAvgGoals)
      : (1 / 2);
    const teamExpGoals = (teamExpGoalsRaw < _brakeLeagueRef * _brakeThreshRatio)
      ? _brakeLeagueRef
      : teamExpGoalsRaw;
    const comfortThreshold = Math.max(1, Math.ceil(teamExpGoals));
    let comfortBrake = 1.0;
    if ((goals[side] - goals[oppSide]) >= comfortThreshold) {
      const oppExpGoals = oppPb.shotsPerMin * 90 * oppPb.onTargetRate * oppPb.goalConvRate;
      const matchAvgGoals = (teamExpGoals + oppExpGoals) / 2;
      const leagueRef = baseline.leagueAvgGoals ?? matchAvgGoals;

      // 1. Doğal rehavet eğilimi — oran TERSİNE ÇEVRİLDİ (leagueRef / teamExp).
      //    Güçlü hücum takımı (teamExp > leagueRef) → rawBrake < 1.0 → doğal fren.
      //    Zayıf hücum takımı → rawBrake ≈ 1.0 → fren yok (zaten gol bulmak mucize).
      const rawBrake = (u.ZİHİNSEL_DAYANIKLILIK / Math.max(u.FİŞİ_ÇEKME, EPS))
        * (leagueRef / Math.max(teamExpGoals, EPS));

      // 2. Fark eşiği aşıldı mı? Aşıldıysa her ekstra gol için sönümleme hesapla.
      const goalDiff = goals[side] - goals[oppSide];
      const excessGoals = goalDiff - comfortThreshold;

      let diminishingMultiplier = 1.0;
      if (excessGoals > 0) {
        const oppU = oppSide === 'home' ? homeUnits : awayUnits;

        // Rakibin çökme eğilimi: kırılganlık / dayanıklılık oranı
        const oppCollapseRatio = (oppU.PSIKOLOJIK_KIRILGANLIK || 1.0) / Math.max(oppU.ZİHİNSEL_DAYANIKLILIK || 1.0, EPS);

        // Saldıranın motivasyon profili:
        //   FİŞİ_ÇEKME: acımasızlık içgüdüsü
        //   GOL_IHTIYACI: küme düşme/şampiyonluk/kupa baskısından gelen gol ihtiyacı
        //   TURNUVA_BASKISI: turnuva aşaması önemi (final vs grup maçı)
        const killerInstinct = u.FİŞİ_ÇEKME || 1.0;
        const goalNeed = u.GOL_IHTIYACI || 1.0;
        const tournamentPressure = u.TURNUVA_BASKISI || 1.0;

        // Lig temposu: volatil liglerde farklar daha kolay açılır
        const volatility = baseline.leagueGoalVolatility ?? baseline.leagueAvgGoals ?? teamExpGoalsRaw;

        // "Kan Kokusu" (Bloodlust) Ratio — tamamen dinamik, sıfır sabit değer
        // Yüksek → takım acımasızca basmaya devam eder (7-0 mümkün)
        // Düşük → takım rehavete girer, tempo düşer
        const bloodlustRatio = (killerInstinct * goalNeed * tournamentPressure * volatility * oppCollapseRatio);

        // Sönümleme katsayısı: bloodlustRatio üzerinden sigmoid benzeri dönüşüm
        // bloodlust çok yüksekse (>>1): decayPerGoal → 1.0'a yaklaşır (sönümleme yok)
        // bloodlust çok düşükse (<<1): decayPerGoal → 1/e ≈ 0.37'ye yaklaşır (sert fren)
        // Formül: 1 - (1 / (1 + bloodlustRatio))  →  bloodlust/(1+bloodlust)
        // Bu, (0,1) aralığında doğal bir sigmoid oluşturur — hiçbir keyfi sabit YOK.
        // Dinamik cap: lig gol ortalaması + volatilite'ye bağlı — yüksek golcü ligde daha az fren
        const _decayCapGoals = baseline?.leagueAvgGoals ?? teamExpGoals;
        const _decayCapVol = baseline?.leagueGoalVolatility ?? _decayCapGoals;
        const _decayCapLeague = _decayCapGoals + _decayCapVol;
        const _decayCap = 1.0 - 1.0 / Math.max(2, _decayCapLeague);
        const decayPerGoal = Math.min(_decayCap, bloodlustRatio / (1.0 + bloodlustRatio));

        diminishingMultiplier = Math.pow(decayPerGoal, excessGoals);
      }

      // Sonuç asla 1.0'ı geçemez — takıma doğaüstü güç vermek yasak.
      comfortBrake = Math.min(1.0, rawBrake * diminishingMultiplier);
    }

    // Yorgunluk çarpanı: baseline'dan dinlenme günü bazlı (dynamic-baseline.js hesaplar)
    let fatigueMult = side === 'home'
      ? (baseline?.homeFatigue ?? null)
      : (baseline?.awayFatigue ?? null);
    if (fatigueMult == null) fatigueMult = 1.0; // yorgunluk verisi yoksa nötr — sadece çarpan kimliği

    return clamp(atkUnit * formUnit * stateUnit * urgency * comfortBrake * fatigueMult * (1 - s.redCardPenalty), DYN_LIMITS.POWER.MIN, DYN_LIMITS.POWER.MAX);
  };

  const getDefensePower = (side) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const defUnit = geo3(u.SAVUNMA_DIRENCI, u.SAVUNMA_AKSIYONU, u.GK_REFLEKS);
    const orgUnit = geo2(u.DISIPLIN, u.GK_ALAN_HAKIMIYETI);
    const _sddEPS = (baseline.leagueAvgGoals || 1) / 1000;
    const stateDefDamp = Math.max(_sddEPS, 1.0 - orgUnit);
    const stateUnit = 1.0 + (s.morale - 1.0) * stateDefDamp;
    return clamp(defUnit * orgUnit * stateUnit * (1 - s.redCardPenalty), DYN_LIMITS.POWER.MIN, DYN_LIMITS.POWER.MAX);
  };

  function pickActivePlayer(players, positions, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const pitchSet = onPitch[side];

    // Sadece sahada olan oyunculardan seç — onPitch set'i ground truth
    const pool = players.filter(p => {
      const name = getName(p);
      if (!name || !pitchSet.has(name)) return false;
      if (expelled.has(name)) return false;
      const pos = (p.player?.position || p.position || '').toUpperCase()[0];
      return !positions || positions.includes(pos);
    });
    // Fallback: pozisyon filtresi kaldırılır ama yine sadece sahada olan oyuncular
    const list = pool.length ? pool : players.filter(p => {
      const name = getName(p);
      return name && pitchSet.has(name) && !expelled.has(name);
    });
    if (!list.length) return null;
    const p = list[Math.floor(r() * list.length)];
    return getName(p) || SIM_CONFIG.LABELS.PLAYER;
  }

  const subbedInNames = { home: new Set(), away: new Set() };

  function pickSub(players, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const alreadySubbed = subbedInNames[side];
    const pitchSet = onPitch[side];

    // Yedek havuzu: sahada OLMAYAN, atılmamış, reserve olmayan, daha önce girmemiş oyuncular
    let pool = players.filter(p => {
      const name = getName(p);
      return p && name && !pitchSet.has(name) && !p.isReserve && !expelled.has(name) && !alreadySubbed.has(name);
    });
    if (!pool.length) return null;
    const p = pool[Math.floor(r() * pool.length)];
    const name = getName(p) || SIM_CONFIG.LABELS.SUB;
    alreadySubbed.add(name);
    // Oyuncuyu sahaya al
    pitchSet.add(name);
    return name;
  }

  const getEffectiveUnits = (side, minute) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const effective = { ...u };
    const rcMult = (1 - s.redCardPenalty);

    // Lig temposu (volatility) ve kadro derinliğine göre dinamik yorgunluk hızı
    // Yüksek tempolu ligde dar kadrolar daha çabuk yorulur.
    const leaguePace = baseline.leagueGoalVolatility ?? (baseline.leagueAvgGoals ?? 1);
    const squadDepth = u.KADRO_DERINLIGI ?? 1; // BIM'den, yoksa etkisiz
    const fragility = u.PSIKOLOJIK_KIRILGANLIK ?? 1; // BIM'den, yoksa etkisiz
    const mentalToughness = u.ZİHİNSEL_DAYANIKLILIK ?? 1; // BIM'den, yoksa etkisiz
    const leagueTeamCount = baseline.leagueTeamCount ?? null;

    // Maçın hangi safhasında olduğumuzu lateBase (dinamik gol sonları dakikası) belirler
    const matchProgress = minute / (lateBase || _matchMins);

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
    const moraleMin = baseline.normMinRatio ?? DYN_LIMITS.POWER.MIN;
    const moraleMax = baseline.normMaxRatio ?? DYN_LIMITS.POWER.MAX;
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
    const subImpact = (leagueTeamCount != null && squadDepth > 0) ? subsDone[side] * (leaguePace / (squadDepth * leagueTeamCount)) : 0;
    effective.KADRO_DERINLIGI = u.KADRO_DERINLIGI * (1.0 + subImpact);
    // H2H Dominasyon tarihseldir, maç içi sabittir (tek istisna)
    effective.H2H_DOMINASYON = u.H2H_DOMINASYON;
    const momMin = baseline.normMinRatio ?? DYN_LIMITS.MOMENTUM.MIN;
    const momMax = baseline.normMaxRatio ?? DYN_LIMITS.MOMENTUM.MAX;
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
  const _mRange = DYN_LIMITS.MOMENTUM.MAX - DYN_LIMITS.MOMENTUM.MIN;
  const _pRange = DYN_LIMITS.POSSESSION.MAX - DYN_LIMITS.POSSESSION.MIN;
  const _lgVol = baseline.leagueGoalVolatility ?? null;
  // _mRange ≈ 0 → lig takımları arasında momentum farkı yok demektir.
  // Bu durumda momentum, possession'ı etkilememeli → katsayı sıfır.
  // _mRange > 0 ise: volatil ligde momentum → possession kayması daha belirgin.
  const momentumPossCoeff = (_mRange > 1e-9)
    ? ((_lgVol != null && baseline.leagueAvgGoals != null && baseline.leagueAvgGoals > 0)
      ? _pRange * _lgVol / (baseline.leagueAvgGoals * _mRange)
      : _pRange / (4 * _mRange))
    : 0; // Lig momentum aralığı sıfır → momentum etkisiz

  // Dinamik zaman pencereleri: gerçek lig gol dağılımından (M005-M010) türetilir.
  // Veri yoksa makul statik fallback kullanılır.
  const _matchMins = baseline.matchMinutes ?? 90;
  // Erken faz bölücü: lig gol dağılımından (0-15dk payından) türetilir
  // M005 (0-15dk gol oranı) varsa: İlk %X gol 0-Ydk aralığında → earlyBase ≈ Y
  const _earlyFraction = baseline?.dynamicAvgs?.M005 != null
    ? baseline.dynamicAvgs.M005 / (baseline.leagueAvgGoals > 0 ? baseline.leagueAvgGoals : 1)
    : null;
  const earlyBase = dynamicTimeWindows?.EARLY_GAME_END
    ?? (_earlyFraction != null && _earlyFraction > 0 ? Math.round(_matchMins * _earlyFraction) : Math.round(_matchMins / (100 / 22))); // ~20 için 90dk
  const lateBase = dynamicTimeWindows?.LATE_GAME_START ?? Math.round(_matchMins * 5 / 6); // ~75 for 90min

  // Urgency erken faz kısaltma: density saturation formu (0.6/0.08/0.5/0.95 sabitleri kaldırıldı).
  const _urgencyEarlyFactor = (baseline.leaguePointDensity != null && baseline.leaguePointDensity >= 0)
    ? baseline.leaguePointDensity / (baseline.leaguePointDensity + 1)
    : 0;

  // Kırmızı kart ceza sınırları: RC_MAX × saturation (sabit 0.10/0.60/0.20/0.35/0.75 kaldırıldı).
  const _rcPenMax = DYN_LIMITS.RED_CARD_POWER_PENALTY_MAX ?? null;
  const _rcCV = (baseline.leagueGoalVolatility != null && baseline.leagueAvgGoals > 0)
    ? baseline.leagueGoalVolatility / baseline.leagueAvgGoals : null;
  const _rcMedianCV = (baseline.medianGoalRate != null && baseline.leagueAvgGoals > 0)
    ? Math.abs(baseline.medianGoalRate - baseline.leagueAvgGoals) / baseline.leagueAvgGoals : null;
  const _rcMinPenalty = (_rcCV != null) ? _rcPenMax * _rcCV * _rcCV : null;
  const _rcMaxPenalty = (_rcCV != null && _rcMedianCV != null)
    ? _rcPenMax * _rcCV / (_rcCV + _rcMedianCV) : null;

  // lgPace: loop dışında hesapla — 95 tekrar gereksiz, scope sorununu da önler
  const _lgPace = computeLeagueScale(baseline);

  for (let minute = 1; minute <= 95; minute++) {
    const minuteEvents = [];
    const pushEvent = (ev) => {
      events.push(ev);
      minuteEvents.push(ev);
    };

    if (minute === 46) {
      pushEvent({ minute: 45, type: 'halftime', homeGoals: goals.home, awayGoals: goals.away });
      // Devre arası regresyon: menajer etkisi
      applyHalftimeRegression(state.home, homeUnits, baseline,
        initialState.home.momentum, initialState.home.morale, initialState.home.pressing);
      applyHalftimeRegression(state.away, awayUnits, baseline,
        initialState.away.momentum, initialState.away.morale, initialState.away.pressing);
      // Devre arası tacticalStance: menajer skor farkına göre revize eder
      const _htExpGoalsH = hProb.shotsPerMin * 90 * hProb.onTargetRate * hProb.goalConvRate;
      const _htExpGoalsA = aProb.shotsPerMin * 90 * aProb.onTargetRate * aProb.goalConvRate;
      updateTacticalStance(state.home, homeUnits, goals.home - goals.away, _htExpGoalsH, awayUnits, baseline);
      updateTacticalStance(state.away, awayUnits, goals.away - goals.home, _htExpGoalsA, homeUnits, baseline);
    }

    // ─── Doğal Regresyon + Yorgunluk (her dakika başında) ──────────────────
    applyNaturalRegression(state.home, homeUnits, baseline,
      initialState.home.momentum, initialState.home.morale);
    applyNaturalRegression(state.away, awayUnits, baseline,
      initialState.away.momentum, initialState.away.morale);

    // Yorgunluk artışı: pressing × lgScale / KADRO_DERINLIGI — tamamen dinamik
    const _hKadroD = _s(homeUnits.KADRO_DERINLIGI);
    const _aKadroD = _s(awayUnits.KADRO_DERINLIGI);
    state.home.fatigue = Math.min(1, state.home.fatigue + state.home.pressing * _lgPace / (_hKadroD * 90));
    state.away.fatigue = Math.min(1, state.away.fatigue + state.away.pressing * _lgPace / (_aKadroD * 90));

    // ─── Possession Belirleme — 4 Katmanlı Dinamik Model ────────────────
    // KATMAN 1: Her takımın lig ortalamasından sezonal sapması
    // Sapma: takım avg - lig avg → "doğal possession çekişi"
    const _lgPossAvg100 = (baseline.possessionBase ?? 0.5) * 100;
    const _hPoss100 = hProb.possessionBase * 100;
    const _aPoss100 = aProb.possessionBase * 100;
    const _hDevPct = _hPoss100 - _lgPossAvg100; // + ise lig ort. üstünde
    const _aDevPct = _aPoss100 - _lgPossAvg100;

    // KATMAN 2: Dinamik sigma — sapma büyüklüğü × lig volatilitesi
    // UCL: lgPace=0.374, min sapma ≈0.5puan → minSigma=1.12, hSigma=1.49
    // Büyük sapmalı takım (Pep'in City) → çok daha geniş maç içi salınım
    const _minSigma = _lgPace * 3;
    const _hSigma = _minSigma + Math.abs(_hDevPct) * _lgPace * 2;
    const _aSigma = _minSigma + Math.abs(_aDevPct) * _lgPace * 2;

    // KATMAN 3: Maç durumu — her etken takımın kendi sigması ile ölçeklenir
    // territory: bölgesel kontrol (>0.5 = rakip yarısında)
    // tacticalStance: −1=park the bus, +1=all-out attack
    // urgency: geri kalan dakika × gol ihtiyacı baskısı
    const _hMatchPoss = _hPoss100
      + _hSigma * (state.home.territory - 0.5) * 4
      + _hSigma * state.home.tacticalStance * 3
      + _hSigma * Math.max(0, state.home.urgency - 1) * 2;
    const _aMatchPoss = _aPoss100
      + _aSigma * (state.away.territory - 0.5) * 4
      + _aSigma * state.away.tacticalStance * 3
      + _aSigma * Math.max(0, state.away.urgency - 1) * 2;

    // Normalize: toplam = 100% garantisi
    const _rawPossSum = _hMatchPoss + _aMatchPoss;
    const _normalizedBase = _rawPossSum > 0 ? (_hMatchPoss / _rawPossSum) * 100 : 50;

    // KATMAN 4: Momentum kayması (mevcut dinamik formül korunur)
    const _momShift = (state.home.momentum - state.away.momentum) * momentumPossCoeff;
    const currentHomePos = clamp(
      _normalizedBase + (isFinite(_momShift) ? _momShift : 0),
      DYN_LIMITS.POSSESSION.MIN, DYN_LIMITS.POSSESSION.MAX
    );
    const possessor = r() < currentHomePos / 100 ? 'home' : 'away';



    // Urgency başlangıcı — dinamik _ihtMax envelope'u
    const _ihtMaxLoop = (baseline.normMaxRatio != null && baseline.normMinRatio != null)
      ? baseline.normMaxRatio + (1.0 - baseline.normMinRatio) : 2.0;
    const homeUrgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(homeUnits.GOL_IHTIYACI, 1.0, _ihtMaxLoop) - 1.0));
    const awayUrgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(awayUnits.GOL_IHTIYACI, 1.0, _ihtMaxLoop) - 1.0));

    if (minute > homeUrgencyStart || minute > awayUrgencyStart) {
      // ── Klasik Urgency: mevcut maçta geride olan takım daha agresif olur ──
      if (goals.away > goals.home && minute > homeUrgencyStart) {
        const timeRatio = (minute - homeUrgencyStart) / (95 - homeUrgencyStart);
        state.home.urgency = 1.0 + homeUnits.GOL_IHTIYACI * timeRatio;
      }
      if (goals.home > goals.away && minute > awayUrgencyStart) {
        const timeRatio = (minute - awayUrgencyStart) / (95 - awayUrgencyStart);
        state.away.urgency = 1.0 + awayUnits.GOL_IHTIYACI * timeRatio;
      }

      // ── Agrega Urgency: mevcut maçta önde AMA hâlâ gol ihtiyacı olan takım ──
      if (goals.home >= goals.away && minute > homeUrgencyStart) {
        const homeAggExcess = Math.max(0, homeUnits.GOL_IHTIYACI - 1.0);
        if (homeAggExcess > 0) {
          const timeRatio = (minute - homeUrgencyStart) / (95 - homeUrgencyStart);
          const aggregateUrgency = 1.0 + homeAggExcess * timeRatio;
          // Klasik urgency (gerideyken) zaten hesaplanmışsa, en yükseğini al
          state.home.urgency = Math.max(state.home.urgency, aggregateUrgency);
        }
      }
      if (goals.away >= goals.home && minute > awayUrgencyStart) {
        const awayAggExcess = Math.max(0, awayUnits.GOL_IHTIYACI - 1.0);
        if (awayAggExcess > 0) {
          const timeRatio = (minute - awayUrgencyStart) / (95 - awayUrgencyStart);
          const aggregateUrgency = 1.0 + awayAggExcess * timeRatio;
          state.away.urgency = Math.max(state.away.urgency, aggregateUrgency);
        }
      }
    }

    // Erken oyun fazı: neutral takım earlyBase'e kadar sürer, GOL_IHTIYACI yüksekse kısalır
    const homeEarlyEnd = Math.max(0, earlyBase - earlyBase * _urgencyEarlyFactor * Math.max(0, homeUnits.GOL_IHTIYACI - 1.0));
    const awayEarlyEnd = Math.max(0, earlyBase - earlyBase * _urgencyEarlyFactor * Math.max(0, awayUnits.GOL_IHTIYACI - 1.0));
    const twHome = minute <= homeEarlyEnd ? homeUnits.MAC_BASLANGICI : (minute > homeUrgencyStart ? homeUnits.MAC_SONU : 1.0);
    const twAway = minute <= awayEarlyEnd ? awayUnits.MAC_BASLANGICI : (minute > awayUrgencyStart ? awayUnits.MAC_SONU : 1.0);

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
      // Goal velocity cap: tek taraflı 5+ gol sonrası şut olasılığı %50 düşer
      // Gerçek futbolda 5-0'dan sonra tempo ve motivasyon belirgin biçimde düşer.
      const goalVelocityCap = goals[side] >= 5 ? 0.50 : 1.0;
      const shotProb = clamp(attkProb.shotsPerMin * dampedFlow * goalVelocityCap, DYN_LIMITS.PROBABILITY.MIN, DYN_LIMITS.PROBABILITY.MAX);

      if (r() < shotProb) {
        stats[side].shots++;
        // KRİTİK: onTargetRate = M014/M013 (gerçek sezon SOT oranı) — BAGLANTI_OYUNU burada çift sayma olur
        // adjustedOnTargetRate: blok sonrası kalan şutların isabetli olma olasılığı
        // P(isabet | bloklanmamış) = rawOnTargetRate / (1 - blockRate) — matematiksel türev, veri bazlı
        const adjustedOnTargetRate = attkProb.onTargetRate / Math.max(1 - defProb.blockRate, EPS);
        const onTargetProb = clamp(adjustedOnTargetRate / (weatherErrorMult || ND.WEATHER_IDENTITY), DYN_LIMITS.ON_TARGET.MIN, DYN_LIMITS.ON_TARGET.MAX);
        const blockProb = clamp(defProb.blockRate * oppDefPower / Math.max(atkPower, EPS), DYN_LIMITS.BLOCK.MIN, DYN_LIMITS.BLOCK.MAX);

        if (r() < blockProb) {
          pushEvent({ minute, type: 'shot_blocked', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
          applyEventImpact('shot_blocked', oppSideOfPoss, side, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
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
          const goalProb = clamp(attkProb.goalConvRate * gkAdj, DYN_LIMITS.PROBABILITY.MIN, DYN_LIMITS.PROBABILITY.MAX) * (weatherGoalMult || ND.WEATHER_IDENTITY);

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
              state.home.morale = clamp(state.home.morale + posBoost, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
              state.home.momentum = clamp(state.home.momentum + posBoost * attkProb.onTargetRate, DYN_LIMITS.MOMENTUM.MIN, DYN_LIMITS.MOMENTUM.MAX);
              state.away.morale = clamp(state.away.morale - negDrop, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
            } else {
              state.away.morale = clamp(state.away.morale + posBoost, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
              state.away.momentum = clamp(state.away.momentum + posBoost * attkProb.onTargetRate, DYN_LIMITS.MOMENTUM.MIN, DYN_LIMITS.MOMENTUM.MAX);
              state.home.morale = clamp(state.home.morale - negDrop, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
            }
            // Gol sonrası merkezi etki motoru + taktik stance gücelleme
            applyEventImpact('goal', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
            const _geH = hProb.shotsPerMin * 90 * hProb.onTargetRate * hProb.goalConvRate;
            const _geA = aProb.shotsPerMin * 90 * aProb.onTargetRate * aProb.goalConvRate;
            updateTacticalStance(state.home, homeUnits, goals.home - goals.away, _geH, awayUnits, baseline);
            updateTacticalStance(state.away, awayUnits, goals.away - goals.home, _geA, homeUnits, baseline);
          } else {
            pushEvent({ minute, type: 'shot_on_target', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
            applyEventImpact('shot_on_target', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
            // Big save kontrolü: isabetli şut gol olmadıysa, GK performansına göre
            const _defSavePctAbove = (isHome ? aProb : hProb).savePctAboveExpected;
            const _gkRefleksUnit = isHome ? awayUnits.GK_REFLEKS : homeUnits.GK_REFLEKS;
            if (_defSavePctAbove != null && _defSavePctAbove > 0 && r() < _defSavePctAbove * (_gkRefleksUnit ?? 1)) {
              pushEvent({ minute, type: 'big_save', team: oppSideOfPoss });
              applyEventImpact('big_save', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
            }
          }
        } else {
          pushEvent({ minute, type: 'shot_off_target', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
          applyEventImpact('shot_off_target', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
          // Goal kick kontrolü: isabetsiz şut aut olabilir — oran lig verilerinden
          const _gkRatio = (baseline.leagueAvgGoals ?? 1) / ((baseline.shotsPerMin ?? 0.15) * 90); // gol/şut oranı
          const _goalKickProb = (1 - attkProb.onTargetRate) * (1 - defProb.blockRate) * _gkRatio;
          if (r() < _goalKickProb) {
            pushEvent({ minute, type: 'goal_kick', team: oppSideOfPoss });
            applyEventImpact('goal_kick', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
          }
        }
      }

      // Korner — takımın kendi korner üretim kapasitesine dayalı, baskıdan BAĞIMSIZ
      // Gerçek futbolda korner; savunma bloğu, kenar baskısı ve orta sıklığından oluşur
      // Atak gücüyle doğrudan çarpılmaz — takımın kendi cornerPerMin datası yeterli
      const cornerProb = clamp(attkProb.cornerPerMin, DYN_LIMITS.CORNER.MIN, DYN_LIMITS.CORNER.MAX);
      if (r() < cornerProb) {
        stats[side].corners++;
        const m023raw = getM(isHome ? homeMetrics : awayMetrics, sel, 'M023') ?? dynamicAvgs?.M023 ?? (baseline?.cornerGoalRate != null ? baseline.cornerGoalRate * 100 : null) ?? SIM_CONFIG.GLOBAL_FALLBACK.CORNER_GOAL_RATE;
        if (m023raw != null) {
          const havaFactor = isHome ? homeUnits.HAVA_HAKIMIYETI : awayUnits.HAVA_HAKIMIYETI;
          const cornerGoalRate = (m023raw / 100) * havaFactor;
          const cgProb = clamp(cornerGoalRate, DYN_LIMITS.CORNER_GOAL.MIN, DYN_LIMITS.CORNER_GOAL.MAX);
          // spMorale: gol morale ile aynı normalize formül — goalConvRate / expectedShots
          const spExpShots = Math.max(attkProb.shotsPerMin * 90, 1);
          const spMorale = attkProb.goalConvRate / spExpShots;
          if (r() < cgProb) {
            goals[side]++;
            pushEvent({ minute, type: 'goal', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'D'], side), subtype: 'corner' });
            const sResil = isHome ? homeUnits.ZİHİNSEL_DAYANIKLILIK : awayUnits.ZİHİNSEL_DAYANIKLILIK;
            const cFragil = isHome ? awayUnits.PSIKOLOJIK_KIRILGANLIK : homeUnits.PSIKOLOJIK_KIRILGANLIK;
            if (isHome) {
              state.home.morale = clamp(state.home.morale + spMorale * sResil, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
              state.away.morale = clamp(state.away.morale - spMorale * cFragil, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
            } else {
              state.away.morale = clamp(state.away.morale + spMorale * sResil, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
              state.home.morale = clamp(state.home.morale - spMorale * cFragil, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
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
            applyEventImpact('penalty_scored', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
          } else {
            pushEvent({ minute, type: 'penalty_missed', team: side, player: penPlayer });
            applyEventImpact('penalty_missed', side, oppSideOfPoss, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
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
      const _rcPX = _rcMaxPenalty ?? _rcPenMax ?? 1; // 1 = matematiksel üst sınır (tam çöküş)
      const organicPenalty = clamp((1.0 / Math.max(kadroDepth, EPS) - 1.0) / Math.max(EPS, resilience), _rcPM, _rcPX);

      // Direct Red Card
      if (r() < redProb) {
        const cardName = pickActivePlayer(isHome ? hPlayers : aPlayers, null, side) || `Player ${Math.floor(r() * 11) + 1}`;
        if (!expelledPlayers[side].has(cardName)) {
          expelledPlayers[side].add(cardName);
          onPitch[side].delete(cardName);
          stats[side].redCards++;
          state[side].redCardPenalty = clamp(state[side].redCardPenalty + organicPenalty, 0, _rcPenMax ?? 1);
          pushEvent({ minute, type: 'red_card', team: side, player: cardName, subtype: 'direct_red' });
          applyEventImpact('red_card', side, side === 'home' ? 'away' : 'home', minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
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
            onPitch[side].delete(cardName);
            stats[side].redCards++;
            state[side].redCardPenalty = clamp(state[side].redCardPenalty + organicPenalty, 0, _rcPenMax ?? 1);
            pushEvent({ minute, type: 'red_card', team: side, player: cardName, subtype: 'second_yellow' });
            applyEventImpact('red_card', side, side === 'home' ? 'away' : 'home', minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
          } else {
            pushEvent({ minute, type: 'yellow_card', team: side, player: cardName });
            applyEventImpact('yellow_card', side, side === 'home' ? 'away' : 'home', minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
          }
        }
      }

      // ── Dinamik Oyuncu Değişikliği ──────────────────────────────────────────
      // Statik "minute > 45" yerine, takımın durumuna göre dinamik zamanlama.
      // Gerçek futbolda değişiklik zamanı:
      //   - Devre arası (46'): geride olan, stratejik değişiklik
      //   - 55-65': taktiksel değişiklik (en yaygın)
      //   - 70-80': yorgunluk kaynaklı
      //   - 85+': zaman kazanma / son hamle
      //
      // Dinamik eşik: earlyBase (genelde ~20) + takımın durumuna göre kayma.
      // urgency yüksek veya morale düşükse takım daha erken değişiklik yapar.
      // Rahat ve formda takım geç değişiklik yapar.
      {
        const maxSubs = SIM_CONFIG.SUBS.MAX;
        const remainingSubs = maxSubs - subsDone[side];
        if (remainingSubs > 0) {
          const sState = state[side];
          const sUnits = side === 'home' ? homeUnits : awayUnits;

          // Dinamik değişiklik başlangıç dakikası:
          // Base: devre arası (46). Urgency ve morale düşüşü bunu erkene çekebilir.
          // Rahat takım (morale yüksek, urgency yok): 46 + offset → ~60-65 arası
          // Zor durumdaki takım: 46 → devre arasında hemen değiştirir
          const moraleDeficit = Math.max(0, 1.0 - sState.morale);
          const urgencyExcess = Math.max(0, sState.urgency - 1.0);
          const comfortOffset = Math.max(0, (1.0 - moraleDeficit - urgencyExcess) * (lateBase - 46));
          const subStartMinute = 46 + comfortOffset;

          if (minute >= subStartMinute) {
            // Değişiklik olasılığı: kalan değişiklik sayısı / kalan dakika
            // Urgency ve yorgunluk bu olasılığı artırır
            const remainingMinutes = Math.max(1, 95 - minute + 1);
            const fatigueNeed = (sUnits.PSIKOLOJIK_KIRILGANLIK || 1.0) / Math.max(sUnits.KADRO_DERINLIGI || 1.0, EPS);
            const subUrgency = 1.0 + urgencyExcess + moraleDeficit + (fatigueNeed - 1.0);
            const subProb = (remainingSubs * subUrgency) / remainingMinutes;

            if (r() < subProb) {
              const subIn = pickSub(isHome ? hPlayers : aPlayers, side);
              if (subIn) {
                subsDone[side]++;
                const subOut = pickActivePlayer(isHome ? hPlayers : aPlayers, null, side);
                // Sahadan çıkan oyuncuyu onPitch setinden kaldır
                if (subOut) onPitch[side].delete(subOut);
                pushEvent({ minute, type: 'substitution', team: side, playerIn: subIn, playerOut: subOut });
                const sqImpact = isHome ? (homeSubQuality ?? ND.COUNTER_INIT) : (awaySubQuality ?? ND.COUNTER_INIT);
                if (sqImpact !== 0) {
                  state[side].morale = clamp(state[side].morale + sqImpact, DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
                }
                applyEventImpact('substitution', side, side === 'home' ? 'away' : 'home', minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
              }
            }
          }
        }
      }
    }

    // ─── Yeni Olay Türleri: Faul, Taç, Ofsayt (her dakika, her iki takım) ───
    for (const side of ['home', 'away']) {
      const isHome = side === 'home';
      const oppSide = isHome ? 'away' : 'home';
      const sideUnits = isHome ? homeUnits : awayUnits;
      const sProb = isHome ? hProb : aProb;

      // Faul: foulRate × (1/DISIPLIN) × urgency × pressing
      const _baseFoulRate = sProb.foulRate ?? baseline.foulRate ?? null;
      if (_baseFoulRate != null) {
        const _discFactor = 1 / Math.max(sideUnits.DISIPLIN ?? 1, EPS);
        const _urgFactor = 1 + Math.max(0, state[side].urgency - 1);
        const _pressFactor = 1 + state[side].pressing * _lgPace; // lgScale yerine statik 0.5 yoktu
        const foulProb = clamp(_baseFoulRate * _discFactor * _urgFactor * _pressFactor, 0, 1);
        if (r() < foulProb) {
          pushEvent({ minute, type: 'foul', team: side });
          applyEventImpact('foul', oppSide, side, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);

          // Faul sonrası: serbest vuruş tehlikesi (rakip sahasında)
          const _fkThreat = (isHome ? aProb : hProb).freeKickThreatRate ?? null;
          if (_fkThreat != null && state[oppSide].territory > (aProb.possessionBase ?? hProb.possessionBase)) {
            const fkProb = clamp(_fkThreat * ((isHome ? awayUnits : homeUnits).DURAN_TOP ?? 1) * state[oppSide].territory, 0, 1);
            if (r() < fkProb) {
              pushEvent({ minute, type: 'free_kick', team: oppSide });
              applyEventImpact('free_kick', oppSide, side, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
            }
          }
        }
      }

      // Taç atışı: (1 - TOPLA_OYNAMA) × (1 - BAGLANTI_OYUNU) × throwInRate
      const _baseThrowIn = baseline.throwInRate ?? null;
      if (_baseThrowIn != null) {
        const _topKontrol = 1 / _s(sideUnits.TOPLA_OYNAMA); // birim üzerinden, statik 0.5 değil
        const _baglantiKayip = 1 / _s(sideUnits.BAGLANTI_OYUNU); // birim üzerinden, statik 0.3 değil
        const throwInProb = clamp(_baseThrowIn * (_topKontrol / (_topKontrol + 1)) * (_baglantiKayip / (_baglantiKayip + 1)), 0, 1);
        if (r() < throwInProb) {
          pushEvent({ minute, type: 'throw_in', team: side });
          applyEventImpact('throw_in', side, oppSide, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
        }
      }

      // Ofsayt: territory × (1/TAKTIKSEL_UYUM) × oppDefLine × offsideRate
      const _baseOffside = baseline.offsideRate ?? null;
      if (_baseOffside != null) {
        const _terrFactor = state[side].territory;
        const _taktikFactor = 1 / Math.max(sideUnits.TAKTIKSEL_UYUM ?? 1, EPS);
        const _oppDefLine = getM(isHome ? awayMetrics : homeMetrics, sel, 'M179');
        const _defLineFactor = _oppDefLine != null ? (_oppDefLine / 100) : (isHome ? aProb.possessionBase : hProb.possessionBase); // possessionBase'den türetilir, 0.5 değil
        const offsideProb = clamp(_baseOffside * _terrFactor * _taktikFactor * _defLineFactor, 0, 1);
        if (r() < offsideProb) {
          pushEvent({ minute, type: 'offside', team: side });
          applyEventImpact('offside', side, oppSide, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS);
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

  // Final possession — aynı 4 katmanlı model (maç sonu snapshot)
  const _fpLgScale = computeLeagueScale(baseline); // _lgPace loop-scoped, burada yeniden hesapla
  const _fpLgAvg = (baseline.possessionBase ?? 0.5) * 100;
  const _fpH = hProb.possessionBase * 100;
  const _fpA = aProb.possessionBase * 100;
  const _fpHSigma = _fpLgScale * 3 + Math.abs(_fpH - _fpLgAvg) * _fpLgScale * 2;
  const _fpASigma = _fpLgScale * 3 + Math.abs(_fpA - _fpLgAvg) * _fpLgScale * 2;
  // TOPLA_OYNAMA birimi: possession dominansını final skora yansıt
  const _fpHMatch = _fpH + _fpHSigma * (homeUnits.TOPLA_OYNAMA - 1.0) * 4;
  const _fpAMatch = _fpA + _fpASigma * (awayUnits.TOPLA_OYNAMA - 1.0) * 4;
  const _fpSum = _fpHMatch + _fpAMatch;
  const finalHomePoss = Math.round(clamp(
    _fpSum > 0 ? (_fpHMatch / _fpSum) * 100 : 50,
    DYN_LIMITS.POSSESSION.MIN, DYN_LIMITS.POSSESSION.MAX
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
  // Öneri E: topScore filtrelemesi için kare toplamları (varyans hesabı)
  let totalHomeGoalsSq = 0, totalAwayGoalsSq = 0;
  const scoreMap = {};

  // ── İlk Yarı İzleme ─────────────────────────────────────────────────────
  // simulateSingleRun, minute=46'da halftime event'i push eder:
  // { minute: 45, type: 'halftime', homeGoals: N, awayGoals: N }
  // Bu event'ten HT skoru her koşu için direkt alınır.
  let htHomeWins = 0, htDraws = 0, htAwayWins = 0;
  let totalHTHomeGoals = 0, totalHTAwayGoals = 0;
  const htScoreMap = {};
  // ── HT/FT 9-Sınıflı Kombine İzleme ──────────────────────────────────────
  // Her koşuda HT sonucu (1/X/2) ve FT sonucu (1/X/2) birlikte kaydedilir.
  // Bu sayede HT/FT marketi doğrudan simülasyon frekanslarından türetilir.
  const htftMap = {};

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
    totalHomeGoalsSq += hg * hg;
    totalAwayGoalsSq += ag * ag;

    const key = `${hg}-${ag}`;
    scoreMap[key] = (scoreMap[key] || 0) + 1;

    // HT skor: events dizisindeki halftime olayından al
    const htEvent = run.events?.find(e => e.type === 'halftime');
    const htH = htEvent ? (htEvent.homeGoals ?? 0) : 0;
    const htA = htEvent ? (htEvent.awayGoals ?? 0) : 0;
    if (htH > htA) htHomeWins++;
    else if (htA > htH) htAwayWins++;
    else htDraws++;
    totalHTHomeGoals += htH;
    totalHTAwayGoals += htA;
    const htKey = `${htH}-${htA}`;
    htScoreMap[htKey] = (htScoreMap[htKey] || 0) + 1;

    // HT/FT kombine sonuç: HT tarafı (1/X/2) + FT tarafı (1/X/2)
    const htSide = htH > htA ? '1' : htA > htH ? '2' : 'X';
    const ftSide = hg > ag ? '1' : ag > hg ? '2' : 'X';
    const htftKey = `${htSide}/${ftSide}`;
    htftMap[htftKey] = (htftMap[htftKey] || 0) + 1;

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

  // ── Öneri E: topScore 2σ Varyans Filtresi ───────────────────────────────────
  // Simülasyonun kendi dağılımından türetilen istatistiksel üst sınır.
  // Absürd skorları (7-0, 0-8 vb.) topScore adaylarından elemek için kullanılır.
  // E[X²] - E[X]² = Var[X] → std = sqrt(Var). 2σ üst sınır = avg + 2 × std.
  // Tamamen simülasyonun kendi ürettiği veriden türer — sabit eşik yok.
  const varHome = (totalHomeGoalsSq / runs) - (avgHome * avgHome);
  const varAway = (totalAwayGoalsSq / runs) - (avgAway * avgAway);
  const stdHome = varHome > 0 ? Math.sqrt(varHome) : avgHome * 0.5;
  const stdAway = varAway > 0 ? Math.sqrt(varAway) : avgAway * 0.5;
  const maxReasonableHome = avgHome + stdHome * 2;
  const maxReasonableAway = avgAway + stdAway * 2;

  // 2σ içinde kalan adayları filtrele; hiçbiri kalmazsa fallback olarak tüm liste
  const filteredTopScores = sortedScores.filter(([score]) => {
    const [h, a] = score.split('-').map(Number);
    return h <= maxReasonableHome && a <= maxReasonableAway;
  });
  const topScoreCandidates = filteredTopScores.length > 0 ? filteredTopScores : sortedScores;

  // HT dağılımı
  const sortedHTScores = Object.entries(htScoreMap).sort((a, b) => b[1] - a[1]);
  const avgHTHome = totalHTHomeGoals / runs;
  const avgHTAway = totalHTAwayGoals / runs;

  // HT/FT 9-sınıflı dağılım — doğrudan simülasyon frekanslarından
  const ALL_HTFT_COMBOS = ['1/1','1/X','1/2','X/1','X/X','X/2','2/1','2/X','2/2'];
  const htftProbs = {};
  for (const combo of ALL_HTFT_COMBOS) {
    htftProbs[combo] = pct(htftMap[combo] || 0);
  }
  const sortedHTFT = Object.entries(htftProbs).sort((a, b) => b[1] - a[1]);

  return {
    runs,
    distribution: {
      homeWin: pct(homeWins), draw: pct(draws), awayWin: pct(awayWins),
      over15: pct(over15), over25: pct(over25), btts: pct(btts),
      avgGoals: +(totalGoals / runs).toFixed(2),
      avgHomeGoals: +avgHome.toFixed(2),
      avgAwayGoals: +avgAway.toFixed(2),
      topScore: topScoreCandidates[0]?.[0] ?? null,
      scoreFrequency: sortedScores.slice(0, 10).reduce((acc, [score, cnt]) => { acc[score] = pct(cnt); return acc; }, {}),
      lambdaAnchored: false,
      // İlk yarı simülasyon dağılımı
      ht: {
        homeWin: pct(htHomeWins), draw: pct(htDraws), awayWin: pct(htAwayWins),
        avgHomeGoals: +avgHTHome.toFixed(2),
        avgAwayGoals: +avgHTAway.toFixed(2),
        topScore: sortedHTScores[0]?.[0] ?? null,
        scoreFrequency: sortedHTScores.slice(0, 6).reduce((acc, [s, c]) => { acc[s] = pct(c); return acc; }, {}),
      },
      // HT/FT 9-sınıflı market — 1000 koşudan doğrudan frekans
      htft: {
        probs: htftProbs,
        top1: sortedHTFT[0]?.[0] ?? null,
        top3: sortedHTFT.slice(0, 3).map(([k, v]) => ({ result: k, prob: v })),
      },
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
