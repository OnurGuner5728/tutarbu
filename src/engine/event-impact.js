/**
 * event-impact.js
 * Merkezi olay etki motoru — tüm maç olaylarının game state üzerindeki etkisini hesaplar.
 * 
 * KRİTİK KURAL: Hiçbir statik katsayı kullanılmaz.
 * Tüm etki büyüklükleri lig verisinden (baseline) ve davranış birimlerinden türetilir.
 * Tek matematiksel sabitler: 0 (toplama kimliği), 1 (çarpma kimliği), -1 (ters yön).
 */

'use strict';

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────
const _s = v => (isFinite(v) && v > 0.01) ? v : 0.01;
const geo2 = (a, b) => Math.sqrt(_s(a) * _s(b));
const geo3 = (a, b, c) => Math.cbrt(_s(a) * _s(b) * _s(c));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * computeLeagueScale — Tüm etki büyüklüklerinin temel ölçeğini belirler.
 * Volatil lig → büyük salınımlar, stabil lig → küçük salınımlar.
 */
function computeLeagueScale(baseline) {
  if (!baseline) return 0.3; // güvenli nötr — baseline yoksa orta volatilite varsayımı
  const lgAvg = baseline.leagueAvgGoals ?? 1;
  const lgVol = baseline.leagueGoalVolatility ?? lgAvg * 0.3;
  return lgAvg > 0 ? lgVol / lgAvg : 0.3;
}

/**
 * computeTerritoryImpactScale — Territory güncellemelerinin büyüklüğü.
 * Ligteki gerçek possession yayılımından (possessionLimits spread) türetilir.
 * Ör: ligde possession 35-70% arasında değişiyorsa spread=0.35 → güçlü etki.
 * Veri yoksa: lgScale / sqrt(lgTeamCount) — standings-based fallback.
 */
function computeTerritoryImpactScale(baseline) {
  const pMin = baseline.possessionLimits?.min;
  const pMax = baseline.possessionLimits?.max;
  if (pMin != null && pMax != null && pMax > pMin) {
    // Gerçek possession yayılımı: ligteki max-min farkı (0-1 aralığında)
    const spread = (pMax - pMin) / 100;
    // Her territory biriminin possession'a katkısı spread oranında
    return spread;
  }
  // Fallback: lig volatilitesi × rekabet yoğunluğu
  const lgScale = computeLeagueScale(baseline);
  const density = baseline.leaguePointDensity ?? 1;
  const lgAvg = baseline.leagueAvgGoals ?? 1;
  return lgScale * density / (lgAvg + density);
}

/**
 * computePressingImpactScale — Pressing güncellemelerinin büyüklüğü.
 * Lig faul yoğunluğundan türetilir: agresif lig → pressing daha etkili.
 * foulRate × lgScale: faul sıklığı ile lig volatilitesinin bileşik etkisi.
 */
function computePressingImpactScale(baseline) {
  const lgScale = computeLeagueScale(baseline);
  // Faul oranı lig agresifliğini temsil eder — pressing yoğunluğuyla doğrudan ilişkili
  const foulRate = baseline.foulRate ?? null;
  if (foulRate != null) {
    // Normalize: faulRate × 90 = maç başı faul sayısı; lig ortalamasına böl
    const lgAvg = baseline.leagueAvgGoals ?? 1;
    return lgScale * (foulRate * 90) / (lgAvg * 10); // 10: faul/gol oranı normalize
  }
  const lgAvg = baseline.leagueAvgGoals ?? 1;
  const density = baseline.leaguePointDensity ?? lgAvg;
  return lgScale * density / (lgAvg + density);
}

/**
 * computeRegressionRate — Doğal regresyon hızı (dakika başı).
 * possessionSpread'e göre: geniş yayılım → ekipler bölgeyi uzun tutar → yavaş regresyon.
 * Dar yayılım → rakipler hızla toparlar → hızlı regresyon.
 */
function computeRegressionRate(baseline) {
  const lgTeamCount = baseline.leagueTeamCount ?? 20;
  const pMin = baseline.possessionLimits?.min;
  const pMax = baseline.possessionLimits?.max;
  if (pMin != null && pMax != null && pMax > pMin) {
    const spread = (pMax - pMin) / 100; // [0,1]
    // Geniş spread → takımlar dominant, bölgeyi tutarlar → regresyon yavaş
    // Dar spread → rekabetçi lig, hızla toparlanır → regresyon hızlı
    // Formül: (1 - spread) / lgTeamCount
    return (1 - spread) / lgTeamCount;
  }
  // Fallback: lig rekabetçilik indeksinden türet
  const comp = baseline.leagueCompetitiveness ?? 1;
  const lgScale = computeLeagueScale(baseline);
  return lgScale / (lgTeamCount * Math.max(comp, 0.1));
}

/**
 * deriveEventCoeff — Lig verisinden olay ağırlıkları türetir.
 * Gol = 1.0 referans. Diğer olaylar gole göre oransal (nadir olay → büyük etki).
 */
function deriveEventCoeff(eventType, baseline) {
  const lgGoals = baseline.leagueAvgGoals ?? 1;
  // Hardcoded fallback'lar kaldırıldı — veri yoksa lgGoals'a dayalı oransal fallback kullanılır.
  // Tipik oranlar: shots~13/maç, corners~5/maç, yellows~3/maç, fouls~22/maç, offsides~4/maç
  // Bu oranlar lgGoals ile ölçeklenir → statik değil, lig gol ortalamasına bağlı.
  const lgShots = baseline.shotsPerMin != null ? baseline.shotsPerMin * 90 : lgGoals * 5.2;
  const lgCorners = baseline.cornerPerMin != null ? baseline.cornerPerMin * 90 : lgGoals * 2.0;
  const lgYellows = baseline.yellowPerMin != null ? baseline.yellowPerMin * 90 : lgGoals * 1.2;
  const lgFouls = baseline.foulRate != null ? baseline.foulRate * 90 : lgGoals * 8.8;
  const lgOffsides = baseline.offsideRate != null ? baseline.offsideRate * 90 : lgGoals * 1.6;

  switch (eventType) {
    case 'goal':            return 1.0;
    case 'penalty_scored':  return 1.0;
    case 'shot_on_target':  return lgShots > 0 ? lgGoals / lgShots : lgGoals / 25;
    case 'shot_blocked':    return lgShots > 0 ? lgGoals / (lgShots * 2) : lgGoals / 50;
    case 'shot_off_target': return lgShots > 0 ? lgGoals / (lgShots * 4) : lgGoals / 100;
    case 'big_save':        return lgShots > 0 ? lgGoals / lgShots * 1.5 : lgGoals / 17;
    case 'corner':          return lgCorners > 0 ? lgGoals / lgCorners : lgGoals / 10;
    case 'free_kick':       return lgCorners > 0 ? lgGoals / lgCorners : lgGoals / 10;
    case 'yellow_card':     return lgYellows > 0 ? lgGoals / lgYellows : lgGoals / 3;
    case 'red_card':        return lgYellows > 0 ? (lgGoals / lgYellows) * 3 : lgGoals;
    case 'foul':            return lgFouls > 0 ? lgGoals / lgFouls : lgGoals / 22;
    case 'throw_in':        return lgFouls > 0 ? lgGoals / (lgFouls * 3) : lgGoals / 66;
    case 'offside':         return lgOffsides > 0 ? lgGoals / lgOffsides : lgGoals / 4;
    case 'goal_kick':       return lgShots > 0 ? lgGoals / (lgShots * 5) : lgGoals / 125;
    case 'penalty_missed':  return 1.0;
    case 'substitution':    return lgYellows > 0 ? lgGoals / (lgYellows * 2) : lgGoals / 6;
    default:                return 0;
  }
}

/**
 * computeUnitModifier — Olay türüne göre davranış birimlerinden etki çarpanı hesaplar.
 */
function computeUnitModifier(eventType, actorUnits, reactorUnits) {
  const u = actorUnits;
  const o = reactorUnits;

  switch (eventType) {
    case 'goal':
    case 'penalty_scored':
      return {
        actorMod: geo3(u.FİŞİ_ÇEKME, u.MOMENTUM_AKIŞI, u.BITIRICILIK),
        reactorMod: geo2(o.PSIKOLOJIK_KIRILGANLIK, 1 / _s(o.ZİHİNSEL_DAYANIKLILIK))
      };
    case 'shot_on_target':
      return {
        actorMod: geo2(u.SUT_URETIMI, u.MOMENTUM_AKIŞI),
        reactorMod: 1 / _s(o.SAVUNMA_DIRENCI)
      };
    case 'shot_blocked':
      return {
        actorMod: 1.0,
        reactorMod: geo2(o.SAVUNMA_AKSIYONU, o.ZİHİNSEL_DAYANIKLILIK)
      };
    case 'shot_off_target':
      return {
        actorMod: 1 / geo2(u.SUT_URETIMI, u.YARATICILIK),
        reactorMod: 1.0
      };
    case 'big_save':
      return {
        actorMod: 1 / _s(u.BITIRICILIK),
        reactorMod: geo2(o.GK_REFLEKS, o.ZİHİNSEL_DAYANIKLILIK)
      };
    case 'corner':
      return {
        actorMod: geo2(u.DURAN_TOP, u.HAVA_HAKIMIYETI),
        reactorMod: 1.0
      };
    case 'free_kick':
      return { actorMod: u.DURAN_TOP ?? 1.0, reactorMod: 1.0 };
    case 'foul':
      return { actorMod: 1.0, reactorMod: u.SAVUNMA_AKSIYONU ?? 1.0 };
    case 'yellow_card':
      return {
        actorMod: (1 / _s(u.DISIPLIN)) * (u.PSIKOLOJIK_KIRILGANLIK ?? 1.0),
        reactorMod: 1.0
      };
    case 'red_card':
      return {
        actorMod: (u.PSIKOLOJIK_KIRILGANLIK ?? 1.0) / _s(u.ZİHİNSEL_DAYANIKLILIK),
        reactorMod: o.FİŞİ_ÇEKME ?? 1.0
      };
    case 'penalty_missed':
      return {
        actorMod: u.PSIKOLOJIK_KIRILGANLIK ?? 1.0,
        reactorMod: o.GK_REFLEKS ?? 1.0
      };
    case 'throw_in':
      return {
        actorMod: u.TOPLA_OYNAMA ?? 1.0,
        reactorMod: 1.0
      };
    case 'offside':
      return { actorMod: 1 / _s(u.TAKTIKSEL_UYUM), reactorMod: 1.0 };
    case 'goal_kick':
      return { actorMod: 1.0, reactorMod: o.GK_ALAN_HAKIMIYETI ?? 1.0 };
    case 'substitution':
      return {
        actorMod: geo2(u.KADRO_DERINLIGI, u.MENAJER_STRATEJISI),
        reactorMod: 1.0
      };
    default:
      return { actorMod: 1.0, reactorMod: 1.0 };
  }
}

// ─── EVENT → STATE DELTA YÖN MATRİSİ ──────────────────────────────────────
// Sadece YÖNLER (pozitif/negatif). Büyüklük tamamen lgScale × eventCoeff × unitMod ile belirlenir.
const EVENT_STATE_MATRIX = {
  goal:            { actorMom: +1.0,  reactorMom: -0.6,  actorMorale: +1.0,  reactorMorale: -0.8,  actorTerr: +1.0,  reactorTerr: -0.5,  actorPress: +1.0,  reactorPress: -0.5 },
  penalty_scored:  { actorMom: +0.8,  reactorMom: -0.5,  actorMorale: +0.8,  reactorMorale: -0.7,  actorTerr: +0.6,  reactorTerr: -0.3,  actorPress: +0.5,  reactorPress: -0.3 },
  shot_on_target:  { actorMom: +1.0,  reactorMom: -0.3,  actorMorale: +0.2,  reactorMorale: 0,     actorTerr: +1.0,  reactorTerr: 0,     actorPress: +0.3,  reactorPress: 0 },
  shot_blocked:    { actorMom: -0.2,  reactorMom: +1.0,  actorMorale: 0,     reactorMorale: +0.2,  actorTerr: -0.3,  reactorTerr: +1.0,  actorPress: 0,     reactorPress: +0.3 },
  shot_off_target: { actorMom: -1.0,  reactorMom: +0.2,  actorMorale: -0.1,  reactorMorale: 0,     actorTerr: -0.2,  reactorTerr: +0.1,  actorPress: 0,     reactorPress: 0 },
  big_save:        { actorMom: -0.8,  reactorMom: +1.0,  actorMorale: -0.5,  reactorMorale: +0.7,  actorTerr: -0.5,  reactorTerr: +0.8,  actorPress: -0.3,  reactorPress: +0.5 },
  corner:          { actorMom: +1.0,  reactorMom: 0,     actorMorale: 0,     reactorMorale: 0,     actorTerr: +1.0,  reactorTerr: 0,     actorPress: +0.5,  reactorPress: 0 },
  free_kick:       { actorMom: +0.8,  reactorMom: 0,     actorMorale: 0,     reactorMorale: 0,     actorTerr: +0.8,  reactorTerr: 0,     actorPress: +0.3,  reactorPress: 0 },
  foul:            { actorMom: +0.5,  reactorMom: -0.3,  actorMorale: 0,     reactorMorale: 0,     actorTerr: +0.5,  reactorTerr: -0.5,  actorPress: 0,     reactorPress: -0.2 },
  yellow_card:     { actorMom: -0.2,  reactorMom: +0.1,  actorMorale: -1.0,  reactorMorale: +0.1,  actorTerr: -0.2,  reactorTerr: 0,     actorPress: -0.5,  reactorPress: 0 },
  red_card:        { actorMom: -0.8,  reactorMom: +0.8,  actorMorale: -1.0,  reactorMorale: +0.5,  actorTerr: -1.0,  reactorTerr: +0.5,  actorPress: -1.0,  reactorPress: +0.5 },
  penalty_missed:  { actorMom: -1.0,  reactorMom: +1.0,  actorMorale: -1.0,  reactorMorale: +0.7,  actorTerr: -0.5,  reactorTerr: +0.5,  actorPress: -0.5,  reactorPress: +0.3 },
  throw_in:        { actorMom: +0.3,  reactorMom: 0,     actorMorale: 0,     reactorMorale: 0,     actorTerr: +0.3,  reactorTerr: 0,     actorPress: 0,     reactorPress: 0 },
  offside:         { actorMom: -0.5,  reactorMom: +0.3,  actorMorale: -0.1,  reactorMorale: 0,     actorTerr: +0.3,  reactorTerr: 0,     actorPress: 0,     reactorPress: 0 },
  goal_kick:       { actorMom: 0,     reactorMom: +0.3,  actorMorale: 0,     reactorMorale: 0,     actorTerr: -0.2,  reactorTerr: +0.5,  actorPress: 0,     reactorPress: +0.2 },
  substitution:    { actorMom: 0,     reactorMom: 0,     actorMorale: +0.3,  reactorMorale: 0,     actorTerr: 0,     reactorTerr: 0,     actorPress: +0.3,  reactorPress: 0 },
};

/**
 * applyEventImpact — Merkezi state güncelleme motoru.
 * SIFIR statik katsayı — tüm büyüklükler lig verisinden türetilir.
 */
function applyEventImpact(eventType, actorSide, reactorSide, minute, state, homeUnits, awayUnits, baseline, DYN_LIMITS) {
  const matrix = EVENT_STATE_MATRIX[eventType];
  if (!matrix) return;

  const actorUnits = actorSide === 'home' ? homeUnits : awayUnits;
  const reactorUnits = reactorSide === 'home' ? homeUnits : awayUnits;

  // 1. Lig ölçeği — dinamik
  const lgScale = computeLeagueScale(baseline);

  // 2. Olay katsayısı — lig frekanslarından
  const eventCoeff = deriveEventCoeff(eventType, baseline);

  // 3. Birim çarpanları — davranış matrislerinden
  const { actorMod, reactorMod } = computeUnitModifier(eventType, actorUnits, reactorUnits);

  // 4. Azalan verimler — son 5dk olay sayısı × lgScale
  const recentCount = (state[actorSide].recentActions || []).length;
  const diminishing = 1 / (1 + recentCount * lgScale);

  // 5. Zaman çarpanı — maç sonu yaklaştıkça etkiler büyür
  // MAC_SONU/MAC_BASLANGICI birimleri 1.0 ise (nötr), lig volatilitesi devreye girer
  const matchProgress = minute / 90;
  const macSonuUnit = actorSide === 'home' ? (homeUnits.MAC_SONU ?? 1) : (awayUnits.MAC_SONU ?? 1);
  const macBasiUnit = actorSide === 'home' ? (homeUnits.MAC_BASLANGICI ?? 1) : (awayUnits.MAC_BASLANGICI ?? 1);
  // Eğer birimler nötr (1.0), lig volatilitesi zaman amplifikasyonu üstlenir
  const _macRatio = macSonuUnit / _s(macBasiUnit);
  const _timeAmp = (Math.abs(_macRatio - 1.0) < 0.01)
    ? (1.0 + lgScale * 0.5) // Nötr birim: lgScale × 0.5 ile maç sonu yoğunlaşır
    : _macRatio;
  const timeMod = 1 + matchProgress * (_timeAmp - 1);

  // 6. Toplam delta — tamamen dinamik
  const baseDelta = lgScale * eventCoeff * diminishing * timeMod;
  const actorDelta = baseDelta * actorMod;
  const reactorDelta = baseDelta * reactorMod;

  // 7. Ölçek faktörleri — lig verisinden türetilir, statik sabit YOK
  const terrScale = computeTerritoryImpactScale(baseline);
  const pressScale = computePressingImpactScale(baseline);

  const as = state[actorSide];
  const rs = state[reactorSide];

  // Momentum — doğrudan lgScale zaten ölçekliyor
  as.momentum = clamp(as.momentum + matrix.actorMom * actorDelta,
    DYN_LIMITS.MOMENTUM.MIN, DYN_LIMITS.MOMENTUM.MAX);
  rs.momentum = clamp(rs.momentum + matrix.reactorMom * reactorDelta,
    DYN_LIMITS.MOMENTUM.MIN, DYN_LIMITS.MOMENTUM.MAX);

  // Morale — doğrudan lgScale zaten ölçekliyor
  as.morale = clamp(as.morale + matrix.actorMorale * actorDelta,
    DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
  rs.morale = clamp(rs.morale + matrix.reactorMorale * reactorDelta,
    DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);

  // Territory — terrScale lig verisinden türetilir
  as.territory = clamp(as.territory + matrix.actorTerr * actorDelta * terrScale, 0, 1);
  rs.territory = clamp(rs.territory + matrix.reactorTerr * reactorDelta * terrScale, 0, 1);

  // Pressing — pressScale lig verisinden türetilir
  as.pressing = clamp(as.pressing + matrix.actorPress * actorDelta * pressScale, 0, 1);
  rs.pressing = clamp(rs.pressing + matrix.reactorPress * reactorDelta * pressScale, 0, 1);

  // Recent actions tracking
  if (!as.recentActions) as.recentActions = [];
  as.recentActions.push(minute);
  as.recentActions = as.recentActions.filter(m => m >= minute - 5);
}

/**
 * applyNaturalRegression — Her dakika doğal dengeye dönüş.
 * Regresyon hızı: lig rekabetçiliği ve takım sayısından türetilir.
 * İyi topla oynayan takım momentum'unu uzun tutar → regresyon yavaşlar.
 */
function applyNaturalRegression(sideState, units, baseline, initialMomentum, initialMorale) {
  // Regresyon hızı tamamen lig yapısından türetilir
  const baseRegRate = computeRegressionRate(baseline);

  // Momentum regresyonu: TOPLA_OYNAMA × BAGLANTI_OYUNU ile modüleli
  // İyi pas yapan takım momentum'unu uzun tutar → regresyon yavaşlar
  const momRegMod = 1 / geo2(units.TOPLA_OYNAMA, units.BAGLANTI_OYUNU);
  const momDecay = baseRegRate * momRegMod;
  sideState.momentum += (initialMomentum - sideState.momentum) * momDecay;

  // Territory regresyonu: BAGLANTI_OYUNU ile modüleli
  // İyi bağlantı oyunu territory'yi korur → regresyon yavaşlar
  const terrRegMod = 1 / _s(units.BAGLANTI_OYUNU);
  const terrDecay = baseRegRate * terrRegMod;
  const terrTarget = sideState._initialTerritory ?? 0.5;
  sideState.territory += (terrTarget - sideState.territory) * terrDecay;

  // Pressing regresyonu: yorgunluk × (1/KADRO_DERINLIGI) ile modüleli
  const lgScale = computeLeagueScale(baseline);
  const pressDecay = (sideState.fatigue ?? 0) * (1 / _s(units.KADRO_DERINLIGI)) * lgScale * baseRegRate;
  sideState.pressing = Math.max(0, sideState.pressing - pressDecay);
}

/**
 * applyHalftimeRegression — Devre arası menajer etkisi.
 * Regresyon büyüklüğü: MENAJER_STRATEJISI × lgScale — tamamen dinamik.
 */
function applyHalftimeRegression(sideState, units, baseline, initialMomentum, initialMorale, initialPressing) {
  const lgScale = computeLeagueScale(baseline);
  const menajerEffect = (units.MENAJER_STRATEJISI ?? 1.0) * lgScale;

  // HT/FT reversal boost: geri dönüş oranı yüksek liglerde regresyon güçlenir
  const htRegBoost = (baseline._htReversalRate != null && lgScale > 0)
    ? 1 + baseline._htReversalRate / lgScale
    : 1.0;
  const boostedEffect = menajerEffect * htRegBoost;

  // Momentum kısmen başlangıca döner — menajer etkisi oranında
  sideState.momentum += (initialMomentum - sideState.momentum) * boostedEffect;

  // Morale: menajer etkisi × FORM_UZUN (uzun vadeli form stabilitesi)
  const formStability = units.FORM_UZUN ?? 1.0;
  sideState.morale += (initialMorale - sideState.morale) * boostedEffect * formStability / _s(formStability + boostedEffect);

  // Territory sıfırlanır (restart — her iki takım kendi yarısında başlar)
  sideState.territory = sideState._initialTerritory ?? 0.5;

  // Pressing: menajer stratejisi oranında yeniden ayarlanır
  sideState.pressing += (initialPressing - sideState.pressing) * boostedEffect * formStability / _s(formStability + boostedEffect);

  // Recent actions temizlenir
  sideState.recentActions = [];
}

/**
 * updateTacticalStance — Gol farkına göre taktik stance güncelleme.
 * Comfort brake'i absorbe eder. Tüm katsayılar davranış birimlerinden.
 */
function updateTacticalStance(sideState, units, goalDiff, expectedGoals, oppUnits, baseline) {
  const comfortThreshold = Math.max(1, Math.ceil(expectedGoals));
  const lgScale = computeLeagueScale(baseline);

  if (goalDiff >= comfortThreshold) {
    // Önde ve fark açık → defansa çekilme eğilimi
    const bloodlust = geo3(units.FİŞİ_ÇEKME, units.GOL_IHTIYACI, units.TURNUVA_BASKISI);
    const oppCollapse = (oppUnits.PSIKOLOJIK_KIRILGANLIK ?? 1) / _s(oppUnits.ZİHİNSEL_DAYANIKLILIK);
    // bloodlust yüksek → az fren, düşük → çok fren
    const stanceShift = -(1 / _s(bloodlust)) * (1 / _s(oppCollapse)) * lgScale;
    sideState.tacticalStance = clamp(sideState.tacticalStance + stanceShift, -1, 1);
  } else if (goalDiff < 0) {
    // Gerideyiz → hücuma geç — GOL_IHTIYACI × urgency × lgScale
    const needShift = (units.GOL_IHTIYACI ?? 1) * sideState.urgency * lgScale
      / _s(units.GOL_IHTIYACI + sideState.urgency); // saturasyon — veriden
    sideState.tacticalStance = clamp(sideState.tacticalStance + needShift, -1, 1);
  } else {
    // Berabere veya küçük fark → nötre doğru regresyon — regresyon hızı lgScale'den
    const regRate = computeRegressionRate(baseline);
    sideState.tacticalStance += (0 - sideState.tacticalStance) * regRate;
  }
}

module.exports = {
  applyEventImpact,
  applyNaturalRegression,
  applyHalftimeRegression,
  updateTacticalStance,
  deriveEventCoeff,
  computeUnitModifier,
  computeLeagueScale,
  computeTerritoryImpactScale,
  computePressingImpactScale,
  computeRegressionRate,
  EVENT_STATE_MATRIX
};
