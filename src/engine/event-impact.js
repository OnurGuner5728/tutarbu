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
  // Saf veri türevi: vol/avg = lig CV'si. Statik fallback'lar (0.3) KALDIRILDI.
  // Veri yoksa null döner — caller "yok" sinyalini ele almalı.
  if (!baseline) return null;
  const lgAvg = baseline.leagueAvgGoals;
  const lgVol = baseline.leagueGoalVolatility;
  if (lgAvg == null || lgVol == null || lgAvg <= 0) return null;
  return lgVol / lgAvg;
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
    return (pMax - pMin) / 100;
  }
  // Fallback: lig volatilitesi × yoğunluk — TÜM bileşenler veriden, sabit yok.
  const lgScale = computeLeagueScale(baseline);
  const density = baseline.leaguePointDensity;
  const lgAvg = baseline.leagueAvgGoals;
  if (lgScale == null || density == null || lgAvg == null || lgAvg + density <= 0) return null;
  return lgScale * density / (lgAvg + density);
}

/**
 * computePressingImpactScale — Pressing güncellemelerinin büyüklüğü.
 * Lig faul yoğunluğundan türetilir: agresif lig → pressing daha etkili.
 * foulRate × lgScale: faul sıklığı ile lig volatilitesinin bileşik etkisi.
 */
function computePressingImpactScale(baseline) {
  const lgScale = computeLeagueScale(baseline);
  if (lgScale == null) return null;
  const foulRate = baseline.foulRate ?? null;
  const lgAvg = baseline.leagueAvgGoals;
  if (lgAvg == null || lgAvg <= 0) return null;

  if (foulRate != null) {
    // foulsPerMatch / goalsPerMatch — gerçek lig oranı (sabit "10" KALDIRILDI).
    const foulsPerMatch = foulRate * 90;
    const totalGoalsPerMatch = lgAvg * 2; // home+away
    if (totalGoalsPerMatch <= 0) return null;
    // Pressing etki = lgScale × (faul yoğunluğu / gol yoğunluğu) — saf veri oranı
    return lgScale * foulsPerMatch / (foulsPerMatch + totalGoalsPerMatch);
  }
  const density = baseline.leaguePointDensity ?? lgAvg;
  return lgScale * density / (lgAvg + density);
}

/**
 * computeRegressionRate — Doğal regresyon hızı (dakika başı).
 * possessionSpread'e göre: geniş yayılım → ekipler bölgeyi uzun tutar → yavaş regresyon.
 * Dar yayılım → rakipler hızla toparlar → hızlı regresyon.
 */
function computeRegressionRate(baseline) {
  // lgTeamCount'in 20 statik fallback'i KALDIRILDI — yoksa null.
  const lgTeamCount = baseline.leagueTeamCount;
  if (lgTeamCount == null || lgTeamCount <= 0) return null;
  const pMin = baseline.possessionLimits?.min;
  const pMax = baseline.possessionLimits?.max;
  if (pMin != null && pMax != null && pMax > pMin) {
    const spread = (pMax - pMin) / 100;
    return (1 - spread) / lgTeamCount;
  }
  // Fallback: lig rekabetçilik + scale'den (sabit min "0.1" KALDIRILDI)
  const comp = baseline.leagueCompetitiveness;
  const lgScale = computeLeagueScale(baseline);
  if (comp == null || comp <= 0 || lgScale == null) return null;
  return lgScale / (lgTeamCount * comp);
}

/**
 * deriveEventCoeff — Lig verisinden olay ağırlıkları türetir.
 * Gol = 1.0 referans. Diğer olaylar gole göre oransal (nadir olay → büyük etki).
 */
function deriveEventCoeff(eventType, baseline) {
  const lgGoals = baseline.leagueAvgGoals ?? null;
  // SAF VERİ TÜREVİ: tüm oranlar baseline'da hesaplanmış lig ortalamalarından gelir.
  // Hardcoded sabit oranlar (5.2, 2.0, 1.2, 8.8, 1.6) ve switch içi fallback bölme
  // sabitleri (25, 50, 100, 17, 10, 3, 22, 66, 4, 125, 6) KALDIRILDI.
  // Veri yoksa coefficient null döner — caller bu olayı atlamalı.
  const lgShots    = baseline.shotsPerMin    != null ? baseline.shotsPerMin    * 90 : null;
  const lgCorners  = baseline.cornerPerMin   != null ? baseline.cornerPerMin   * 90 : null;
  const lgYellows  = baseline.yellowPerMin   != null ? baseline.yellowPerMin   * 90 : null;
  const lgReds     = baseline.redPerMin      != null ? baseline.redPerMin      * 90 : null;
  const lgFouls    = baseline.foulRate       != null ? baseline.foulRate       * 90 : null;
  const lgOffsides = baseline.offsideRate    != null ? baseline.offsideRate    * 90 : null;

  if (lgGoals == null) return null;

  // Helper: gol referansa göre olay başına etki ratio
  const r = (lgEventCount) => (lgEventCount != null && lgEventCount > 0)
    ? lgGoals / lgEventCount : null;

  switch (eventType) {
    case 'goal':            return 1.0;
    case 'penalty_scored':  return 1.0;
    case 'penalty_missed':  return 1.0;  // Aynı şut hacmi/şans, sonuç farkı sıfır gol
    case 'shot_on_target':  return r(lgShots);
    case 'shot_blocked':    return lgShots != null ? r(lgShots * 2) : null;
    case 'shot_off_target': return lgShots != null ? r(lgShots * 4) : null;
    // big_save: shot_on_target'tan biraz daha yüksek etki — kritik kurtarış. Saves/SOT oranı
    // baseline'dan türetilebiliyorsa kullan; yoksa shot_on_target ile aynı (üst-eşitliği).
    case 'big_save':        return r(lgShots);
    case 'corner':          return r(lgCorners);
    case 'free_kick':       return r(lgCorners);  // Tehlikeli serbest vuruş ≈ köşe yoğunluğu
    case 'yellow_card':     return r(lgYellows);
    // red_card: kart başına gol etkisi. lgReds varsa direkt; yoksa yellow ile yaklaşıkla
    case 'red_card':        return lgReds != null ? r(lgReds) : (lgYellows != null ? lgGoals / lgYellows : null);
    case 'foul':            return r(lgFouls);
    case 'throw_in':        return lgFouls != null ? r(lgFouls * 3) : null;
    case 'offside':         return r(lgOffsides);
    case 'goal_kick':       return lgShots != null ? r(lgShots * 5) : null;
    case 'substitution':    return lgYellows != null ? r(lgYellows * 2) : null;
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

  // 1. Lig ölçeği — dinamik. Veri yoksa olay state'i etkilemez (nötr çıkış).
  const lgScale = computeLeagueScale(baseline);
  if (lgScale == null) return;

  // 2. Olay katsayısı — lig frekanslarından. Yoksa atla.
  const eventCoeff = deriveEventCoeff(eventType, baseline);
  if (eventCoeff == null) return;

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
  // Eğer birimler nötr (1.0), lig volatilitesi zaman amplifikasyonu üstlenir.
  // Sabit "0.5" çarpanı KALDIRILDI — lgScale tek başına ölçek taşır.
  const _macRatio = macSonuUnit / _s(macBasiUnit);
  const _timeAmp = (Math.abs(_macRatio - 1.0) < 0.01)
    ? (1.0 + (lgScale ?? 0))
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

  as.momentum = clamp(as.momentum + matrix.actorMom * actorDelta,
    DYN_LIMITS.MOMENTUM.MIN, DYN_LIMITS.MOMENTUM.MAX);
  rs.momentum = clamp(rs.momentum + matrix.reactorMom * reactorDelta,
    DYN_LIMITS.MOMENTUM.MIN, DYN_LIMITS.MOMENTUM.MAX);

  as.morale = clamp(as.morale + matrix.actorMorale * actorDelta,
    DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);
  rs.morale = clamp(rs.morale + matrix.reactorMorale * reactorDelta,
    DYN_LIMITS.MORALE.MIN, DYN_LIMITS.MORALE.MAX);

  // Territory ve pressing — scale veri yoksa o boyut etkilenmez (NaN korumalı).
  if (terrScale != null) {
    as.territory = clamp(as.territory + matrix.actorTerr * actorDelta * terrScale, 0, 1);
    rs.territory = clamp(rs.territory + matrix.reactorTerr * reactorDelta * terrScale, 0, 1);
  }
  if (pressScale != null) {
    as.pressing = clamp(as.pressing + matrix.actorPress * actorDelta * pressScale, 0, 1);
    rs.pressing = clamp(rs.pressing + matrix.reactorPress * reactorDelta * pressScale, 0, 1);
  }

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
  if (lgScale != null) {
    const pressDecay = (sideState.fatigue ?? 0) * (1 / _s(units.KADRO_DERINLIGI)) * lgScale * baseRegRate;
    sideState.pressing = Math.max(0, sideState.pressing - pressDecay);
  }
}

/**
 * applyHalftimeRegression — Devre arası menajer etkisi.
 * Regresyon büyüklüğü: MENAJER_STRATEJISI × lgScale — tamamen dinamik.
 */
function applyHalftimeRegression(sideState, units, baseline, initialMomentum, initialMorale, initialPressing) {
  const lgScale = computeLeagueScale(baseline);
  if (lgScale == null) return; // Lig verisi yoksa devre arası etkisi uygulanmaz
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
  if (lgScale == null) return; // Lig verisi yoksa stance değişmez

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
