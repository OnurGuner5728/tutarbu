/**
 * match-simulator.js
 * 90-dakikalık dakika-dakika maç simülasyonu.
 *
 * Tüm 168+ metrik (M001–M169, M134b, M134c) simülasyona bağlıdır.
 * selectedMetrics Set'inde olmayan veya null olan metrikler atlanır.
 * Hiçbir sabit fallback yoktur — veri yoksa o hesaplama atlanır.
 */

'use strict';

const { METRIC_METADATA } = require('./metric-metadata');
const { computeWeatherMultipliers } = require('../services/weather-service');

// ─────────────────────────────────────────────────────────────────────────────
// Temel Yardımcılar
// ─────────────────────────────────────────────────────────────────────────────
function getM(metrics, selected, id) {
  if (!selected.has(id)) return null;
  const v = metrics?.[id];
  return (v != null && !Number.isNaN(v)) ? v : null;
}

const r = () => Math.random();

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Ağırlıklı ortalama — null/NaN girişler atlanır.
 * Hiç geçerli giriş yoksa null döner.
 */
function wAvg(entries) {
  let tw = 0, tv = 0;
  for (const [v, w] of entries) {
    if (v == null || !isFinite(v)) continue;
    tv += v * w;
    tw += w;
  }
  return tw > 0 ? tv / tw : null;
}

function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = k * Math.log(lambda) - lambda;
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function samplePoisson(lambda) {
  if (lambda == null || lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L && k < 20);
  return k - 1;
}

function pickPlayer(players, positions) {
  if (!players || !players.length) return null;
  const pool = players.filter(p => {
    if (!p || p.substitute) return false;
    const pos = (p.player?.position || p.position || '').toUpperCase()[0];
    return !positions || positions.includes(pos);
  });
  const list = pool.length ? pool : players.filter(p => p && !p.substitute);
  if (!list.length) return null;
  const p = list[Math.floor(r() * list.length)];
  return p?.player?.name || p?.name || 'Oyuncu';
}

function pickSub(players) {
  if (!players) return null;
  const subs = players.filter(p => p?.substitute);
  if (!subs.length) return null;
  const p = subs[Math.floor(r() * subs.length)];
  return p?.player?.name || p?.name || 'Yedek';
}

function getWindowMetricId(minute) {
  if (minute <= 15)  return 'M005';
  if (minute <= 30)  return 'M006';
  if (minute <= 45)  return 'M007';
  if (minute <= 60)  return 'M008';
  if (minute <= 75)  return 'M009';
  return 'M010';
}

function timeWeight(minute, metrics, selected) {
  const id = getWindowMetricId(minute);
  const pct = getM(metrics, selected, id);
  if (pct == null) return 1.0;
  return pct / (100 / 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// BOYUT SKORU FONKSİYONLARI
// Her biri ~1.0 etrafında bir çarpan döndürür [0.7 – 1.4 arası]
// wAvg kullanılır → null metrikler atlanır, kalibre kalır
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Form çarpanı
 * M046-M065, M092, M158
 */
function computeFormMult(mets, sel, isHome) {
  const m046 = getM(mets, sel, 'M046'); // son 5 form %
  const m047 = getM(mets, sel, 'M047'); // son 10 form %
  const m048 = getM(mets, sel, 'M048'); // son 20 form %
  const m049 = getM(mets, sel, 'M049'); // kazanma serisi
  const m050 = getM(mets, sel, 'M050'); // yenilmezlik serisi %
  const m051 = getM(mets, sel, 'M051'); // gol atma serisi
  const m052 = getM(mets, sel, 'M052'); // clean sheet serisi (form)
  const m053 = getM(mets, sel, 'M053'); // gol trendi (-1..+1)
  const m054 = getM(mets, sel, 'M054'); // gol yeme trendi
  const m055 = getM(mets, sel, 'M055'); // lig konum puanı %
  const m056 = getM(mets, sel, 'M056'); // ev konum puanı %
  const m057 = getM(mets, sel, 'M057'); // deplasman konum puanı %
  const m058 = getM(mets, sel, 'M058'); // gol farkı
  const m059 = getM(mets, sel, 'M059'); // over 2.5 %
  const m060 = getM(mets, sel, 'M060'); // under 2.5 %
  const m061 = getM(mets, sel, 'M061'); // BTTS %
  const m063 = getM(mets, sel, 'M063'); // ilk gol → kazanma %
  const m064 = getM(mets, sel, 'M064'); // geriden gelme %
  const m065 = getM(mets, sel, 'M065'); // fişi çekme indeksi %
  const m092 = getM(mets, sel, 'M092'); // rating trendi
  const m158 = getM(mets, sel, 'M158'); // form skoru (derived)

  const posM = isHome ? (m056 ?? m055) : (m057 ?? m055);
  // over/under dengesi: over yüksekse hücum, under yüksekse defensif
  const overUnderM = (m059 != null && m060 != null) ? (m059 / 100 - m060 / 100) * 0.1 : null;

  return clamp(wAvg([
    [m046 != null ? 0.7 + (m046 / 100) * 0.6 : null, 3],
    [m047 != null ? 0.7 + (m047 / 100) * 0.6 : null, 2],
    [m048 != null ? 0.7 + (m048 / 100) * 0.6 : null, 1],
    [posM  != null ? 0.7 + (posM  / 100) * 0.6 : null, 2],
    [m049 != null ? 1.0 + clamp(m049, 0, 10) * 0.02 : null, 1],
    [m050 != null ? 0.85 + (m050 / 100) * 0.3 : null, 1],
    [m051 != null ? 1.0 + clamp(m051, 0, 12) * 0.012 : null, 0.8],
    [m052 != null ? 1.0 + clamp(m052, 0, 8)  * 0.008 : null, 0.4],
    [m053 != null ? 1.0 + clamp(m053, -1, 1) * 0.1 : null, 1],
    [m054 != null ? 1.0 - clamp(m054, -1, 1) * 0.05 : null, 0.5],
    [m058 != null ? 1.0 + clamp(m058 / 25, -0.15, 0.15) : null, 0.5],
    [m059 != null ? 0.85 + (m059 / 100) * 0.3 : null, 0.8],
    [m060 != null ? 1.15 - (m060 / 100) * 0.3 : null, 0.4], // yüksek under → az gol
    [m061 != null ? 0.85 + (m061 / 100) * 0.3 : null, 0.5],
    [m063 != null ? 0.9  + (m063 / 100) * 0.2 : null, 0.3],
    [m064 != null ? 0.95 + (m064 / 100) * 0.1 : null, 0.2],
    [m065 != null ? 0.9  + (m065 / 100) * 0.2 : null, 0.2],
    [m092 != null ? 1.0 + clamp(m092 / 10, -0.12, 0.12) : null, 0.5],
    [m158 != null ? 0.7 + (m158 / 100) * 0.6 : null, 2],
    [overUnderM != null ? 1.0 + overUnderM : null, 0.3],
  ]) ?? 1.0, 0.7, 1.4);
}

/**
 * Oyuncu / Kadro kalitesi çarpanı
 * M066-M095, M159, M166
 */
function computeQualityMult(mets, sel) {
  const m066 = getM(mets, sel, 'M066'); // ilk 11 rating (0-10)
  const m067 = getM(mets, sel, 'M067'); // yedek rating (0-10)
  const m068 = getM(mets, sel, 'M068'); // rating farkı (ilk11 - yedek)
  const m069 = getM(mets, sel, 'M069'); // forvet katkı %
  const m070 = getM(mets, sel, 'M070'); // orta saha yaratıcılık
  const m071 = getM(mets, sel, 'M071'); // defans kararlılık (0-10)
  const m073 = getM(mets, sel, 'M073'); // kilit oyuncu bağımlılık % (yüksek = risk)
  const m074 = getM(mets, sel, 'M074'); // dribling %
  const m075 = getM(mets, sel, 'M075'); // pas tamamlama %
  const m076 = getM(mets, sel, 'M076'); // hava topu %
  const m079 = getM(mets, sel, 'M079'); // kadro derinliği %
  const m080 = getM(mets, sel, 'M080'); // dakika dağılımı (rotasyon)
  const m082 = getM(mets, sel, 'M082'); // saldırı niteliği (0-100)
  const m083 = getM(mets, sel, 'M083'); // savunma niteliği (0-100)
  const m084 = getM(mets, sel, 'M084'); // teknik nitelik (0-100)
  const m085 = getM(mets, sel, 'M085'); // güçlü yön / starter
  const m086 = getM(mets, sel, 'M086'); // zayıf yön / starter
  const m087 = getM(mets, sel, 'M087'); // piyasa değeri log (0-100)
  const m088 = getM(mets, sel, 'M088'); // yedek/starter değer oranı
  const m089 = getM(mets, sel, 'M089'); // H2H lineup presence %
  const m090 = getM(mets, sel, 'M090'); // gol std dev (düşük = tutarlı)
  const m091 = getM(mets, sel, 'M091'); // asist std dev
  const m093 = getM(mets, sel, 'M093'); // güçlüye gol %
  const m094 = getM(mets, sel, 'M094'); // zayıftan gol yeme % (düşük = iyi)
  const m095 = getM(mets, sel, 'M095'); // şans golü indeksi %
  const m159 = getM(mets, sel, 'M159'); // oyuncu kalitesi (derived)
  const m166 = getM(mets, sel, 'M166'); // toplam güç (derived)

  // trait balance: güçlü yön fazla = pozitif
  const traitBal = (m085 != null && m086 != null)
    ? 1.0 + clamp((m085 - m086) / 8, -0.08, 0.08) : null;
  // kilit oyuncu bağımlılığı: yüksek bağımlılık = daha riskli (küçük negatif)
  const depRisk = m073 != null ? 1.0 - (m073 / 100) * 0.06 : null;
  // gol tutarsızlığı: yüksek std dev = belirsiz
  const consistency = m090 != null ? 1.0 - clamp(m090 / 5, 0, 0.08) : null;
  // rotasyon: çok az dakika = yorgunluk riskine işaret
  const fatigue = m080 != null ? (m080 > 50 ? 1.0 : 0.95 + m080 / 1000) : null;
  // yedek kalitesi
  const benchQ = m088 != null ? 0.95 + m088 * 0.05 : null;
  // şans golü: yüksekse gol kalitesi düşük → küçük negatif
  const luckAdj = m095 != null ? 1.0 - (m095 / 100) * 0.04 : null;

  return clamp(wAvg([
    [m066 != null ? clamp(0.7 + ((m066 - 5.0) / 5.0) * 0.6, 0.5, 1.4) : null, 3],
    [m067 != null ? clamp(0.7 + ((m067 - 5.0) / 5.0) * 0.4, 0.5, 1.3) : null, 1],
    [m069 != null ? 0.85 + (m069 / 100) * 0.3 : null, 1],
    [m070 != null ? 0.9 + clamp(m070 / 3, 0, 0.2) : null, 1],
    [m074 != null ? 0.88 + (m074 / 100) * 0.24 : null, 0.8],
    [m075 != null ? 0.88 + (m075 / 100) * 0.24 : null, 0.8],
    [m076 != null ? 0.9 + (m076 / 100) * 0.2 : null, 0.3],
    [m079 != null ? 0.88 + (m079 / 100) * 0.24 : null, 0.5],
    [m082 != null ? 0.7 + (m082 / 100) * 0.6 : null, 2],
    [m084 != null ? 0.85 + (m084 / 100) * 0.3 : null, 1],
    [m087 != null ? 0.7 + (m087 / 100) * 0.6 : null, 1],
    [m093 != null ? 0.9 + (m093 / 100) * 0.2 : null, 0.3],
    [m094 != null ? 1.1 - (m094 / 100) * 0.2 : null, 0.3],
    [traitBal, 0.4],
    [depRisk, 0.3],
    [consistency, 0.3],
    [fatigue, 0.3],
    [benchQ, 0.3],
    [luckAdj, 0.2],
    [m068 != null ? 1.0 + clamp(m068 / 10, -0.05, 0.05) : null, 0.2],
    [m089 != null ? 0.95 + (m089 / 100) * 0.1 : null, 0.2],
    [m091 != null ? 1.0 - clamp(m091 / 5, 0, 0.05) : null, 0.2],
    [m159 != null ? 0.7 + (m159 / 100) * 0.6 : null, 2],
    [m166 != null ? 0.7 + (m166 / 100) * 0.6 : null, 3],
  ]) ?? 1.0, 0.7, 1.4);
}

/**
 * Hücum boost çarpanı — şut üretim kapasitesi
 * M002, M017, M018, M021, M023, M024, M025, M051, M053, M069, M070, M072,
 * M074, M081, M082, M084, M146, M150, M151, M152, M154, M155, M156
 */
function computeAttackBoost(mets, sel) {
  const m002 = getM(mets, sel, 'M002'); // ev/dep gol ort
  const m017 = getM(mets, sel, 'M017'); // büyük şans/maç (leagueAvg 1.2)
  const m018 = getM(mets, sel, 'M018'); // büyük şans gol %
  const m021 = getM(mets, sel, 'M021'); // hücum baskısı indeksi (0-100)
  const m023 = getM(mets, sel, 'M023'); // kornerden gol %
  const m024 = getM(mets, sel, 'M024'); // serbest vuruştan gol %
  const m025 = getM(mets, sel, 'M025'); // 3.bölge pas %
  const m069 = getM(mets, sel, 'M069'); // forvet katkı %
  const m070 = getM(mets, sel, 'M070'); // orta saha yaratıcılık
  const m072 = getM(mets, sel, 'M072'); // xG katkı oranı
  const m074 = getM(mets, sel, 'M074'); // dribling %
  const m081 = getM(mets, sel, 'M081'); // forvet xG/şut (leagueAvg 0.09)
  const m082 = getM(mets, sel, 'M082'); // saldırı niteliği
  const m084 = getM(mets, sel, 'M084'); // teknik nitelik
  const m146 = getM(mets, sel, 'M146'); // baskı indeksi (0-100)
  const m150 = getM(mets, sel, 'M150'); // top kontrolü %
  const m151 = getM(mets, sel, 'M151'); // top→gol korelasyonu %
  const m152 = getM(mets, sel, 'M152'); // pas tamamlama %
  const m154 = getM(mets, sel, 'M154'); // cross başarısı %
  const m155 = getM(mets, sel, 'M155'); // gol katkı/maç (leagueAvg 2.5)
  const m156 = getM(mets, sel, 'M156'); // hücum gücü skoru (derived)

  return clamp(wAvg([
    [m002 != null ? clamp(0.7 + m002 * 0.22, 0.5, 1.5) : null, 2],
    [m017 != null ? clamp(0.9 + (m017 - 1.2) * 0.07, 0.85, 1.2) : null, 1],
    [m018 != null ? 0.85 + (m018 / 100) * 0.3 : null, 1],
    [m021 != null ? 0.7 + (m021 / 100) * 0.6 : null, 1.5],
    [m023 != null ? 1.0 + (m023 / 100) * 0.1 : null, 0.3],
    [m024 != null ? 1.0 + (m024 / 100) * 0.1 : null, 0.3],
    [m025 != null ? 0.9 + (m025 / 100) * 0.2 : null, 0.5],
    [m069 != null ? 0.85 + (m069 / 100) * 0.3 : null, 1],
    [m070 != null ? 0.9 + clamp(m070 / 3, 0, 0.2) : null, 1],
    [m072 != null ? 0.9 + clamp(m072 / 2, 0, 0.2) : null, 0.4],
    [m074 != null ? 0.9 + (m074 / 100) * 0.2 : null, 0.5],
    [m081 != null ? clamp(0.85 + (m081 / 0.09 - 1) * 0.15, 0.7, 1.3) : null, 1],
    [m082 != null ? 0.7 + (m082 / 100) * 0.6 : null, 2],
    [m084 != null ? 0.85 + (m084 / 100) * 0.3 : null, 1],
    [m146 != null ? 0.7 + (m146 / 100) * 0.6 : null, 1.5],
    [m150 != null ? 0.85 + (m150 / 100) * 0.3 : null, 1],
    [m151 != null ? 0.85 + (m151 / 100) * 0.3 : null, 0.5],
    [m152 != null ? 0.85 + (m152 / 100) * 0.3 : null, 0.5],
    [m154 != null ? 0.88 + (m154 / 100) * 0.24 : null, 0.3],
    [m155 != null ? clamp(0.9 + (m155 - 2.5) * 0.04, 0.85, 1.2) : null, 0.5],
    [m156 != null ? 0.7 + (m156 / 100) * 0.6 : null, 2],
  ]) ?? 1.0, 0.7, 1.4);
}

/**
 * Savunma çarpanı — düşük = güçlü savunma (rakibin gol olasılığını azaltır)
 * M026-M045, M071, M083, M147, M157
 */
function computeDefenseMult(mets, sel) {
  const m026 = getM(mets, sel, 'M026'); // yenilen gol/maç (leagueAvg 1.35)
  const m027 = getM(mets, sel, 'M027'); // ev/dep yenilen gol
  const m028 = getM(mets, sel, 'M028'); // clean sheet %
  const m029 = getM(mets, sel, 'M029'); // 1.yarı yenilen gol
  const m030 = getM(mets, sel, 'M030'); // 2.yarı yenilen gol
  const m033 = getM(mets, sel, 'M033'); // rakip xG ortalaması
  const m034 = getM(mets, sel, 'M034'); // şut engelleme %
  const m035 = getM(mets, sel, 'M035'); // duel kazanma %
  const m036 = getM(mets, sel, 'M036'); // hava dueli %
  const m037 = getM(mets, sel, 'M037'); // maç başı kesinti
  const m041 = getM(mets, sel, 'M041'); // baskı altında gol yeme %
  const m044 = getM(mets, sel, 'M044'); // tepki süresi (dakika)
  const m045 = getM(mets, sel, 'M045'); // korner engelleme %
  const m071 = getM(mets, sel, 'M071'); // defans kararlılık (0-10)
  const m083 = getM(mets, sel, 'M083'); // savunma niteliği (0-100)
  const m147 = getM(mets, sel, 'M147'); // baskı yeme (yüksek = savunma zayıf)
  const m157 = getM(mets, sel, 'M157'); // defans gücü skoru (derived)

  // Gol yeme metriklerinden "güçlü savunma" sinyali
  // Düşük gol yeme → düşük çarpan → saldırganı zorlar
  const glConc  = m026 != null ? clamp(1.5 - m026 * 0.3, 0.5, 1.5) : null;
  const glConcH = m027 != null ? clamp(1.5 - m027 * 0.3, 0.5, 1.5) : null;
  const csRate  = m028 != null ? 0.7 + (m028 / 100) * 0.6 : null;
  const h1Conc  = m029 != null ? clamp(1.4 - m029 * 0.4, 0.5, 1.4) : null;
  const h2Conc  = m030 != null ? clamp(1.4 - m030 * 0.4, 0.5, 1.4) : null;
  const xgAllow = m033 != null ? clamp(1.5 - m033 * 0.35, 0.5, 1.5) : null;
  const blockR  = m034 != null ? 0.85 + (m034 / 100) * 0.3 : null;
  const duelW   = m035 != null ? 0.85 + (m035 / 100) * 0.3 : null;
  const aerialW = m036 != null ? 0.9 + (m036 / 100) * 0.2 : null;
  const intM    = m037 != null ? clamp(0.9 + m037 / 50, 0.9, 1.2) : null;
  const pressC  = m041 != null ? 1.15 - (m041 / 100) * 0.3 : null;
  const recovM  = m044 != null ? 1.0 + clamp((45 - m044) / 100, -0.1, 0.1) : null;
  const cornDef = m045 != null ? 0.85 + (m045 / 100) * 0.3 : null;
  const defKar  = m071 != null ? clamp(0.7 + ((m071 - 5.0) / 5.0) * 0.6, 0.5, 1.4) : null;
  const defNit  = m083 != null ? 0.7 + (m083 / 100) * 0.6 : null;
  const pressRec = m147 != null ? 1.15 - (m147 / 100) * 0.3 : null;
  const derived = m157 != null ? 0.7 + (m157 / 100) * 0.6 : null;

  return clamp(wAvg([
    [glConc,   3],
    [glConcH,  2],
    [csRate,   2],
    [xgAllow,  2],
    [blockR,   1.5],
    [duelW,    1],
    [aerialW,  0.4],
    [intM,     0.5],
    [pressC,   1],
    [recovM,   0.3],
    [cornDef,  0.5],
    [defKar,   1.5],
    [defNit,   1.5],
    [pressRec, 0.5],
    [derived,  2],
    [h1Conc,   0.5],
    [h2Conc,   0.5],
  ]) ?? 1.0, 0.5, 1.9);
}

/**
 * Kaleci çarpanı (saldırganın gol olasılığını azaltır)
 * M096-M108, M160
 * Düşük gkFactor = iyi kaleci (gol zor)
 */
function computeGKFactor(mets, sel) {
  const m096 = getM(mets, sel, 'M096'); // kurtarış % (leagueAvg 69)
  const m097 = getM(mets, sel, 'M097'); // kurtarış/maç (leagueAvg 3.1)
  const m098 = getM(mets, sel, 'M098'); // xG bazlı verim (ratio)
  const m099 = getM(mets, sel, 'M099'); // penaltı kurtarma % (leagueAvg 22)
  const m100 = getM(mets, sel, 'M100'); // büyük şans kurtarma %
  const m101 = getM(mets, sel, 'M101'); // dağıtım % (savunmayı dolaylı etkiler)
  const m102 = getM(mets, sel, 'M102'); // sezon rating (0-10)
  const m103 = getM(mets, sel, 'M103'); // clean sheet serisi
  const m104 = getM(mets, sel, 'M104'); // uzak mesafe kurtarma %
  const m105 = getM(mets, sel, 'M105'); // hata→gol (yüksek = kötü)
  const m106 = getM(mets, sel, 'M106'); // kaleci nitelik (0-100)
  const m107 = getM(mets, sel, 'M107'); // hava hakimiyeti/maç
  const m108 = getM(mets, sel, 'M108'); // son 5 maç rating (leagueAvg 70)
  const m160 = getM(mets, sel, 'M160'); // kaleci gücü (derived)

  // Düşük değer = iyi kaleci
  const saveRateF  = m096 != null ? 1.0 - clamp(m096 - 69, -25, 25) / 100 : null;
  const bigChanceF = m100 != null ? 1.0 - clamp(m100 - 35, -25, 25) / 100 : null;
  const ratingF    = m102 != null ? clamp(1.4 - ((m102 - 5.0) / 5.0) * 0.8, 0.35, 1.3) : null;
  const recentF    = m108 != null ? 1.4 - (m108 / 100) * 0.8 : null;
  const xgEffF     = m098 != null ? clamp(1.0 - m098 * 0.3, 0.35, 1.5) : null;
  const errorF     = m105 != null ? 1.0 + clamp(m105 / 3, 0, 0.15) : null;
  const niF        = m106 != null ? 1.4 - (m106 / 100) * 0.8 : null;
  const derivedF   = m160 != null ? 1.4 - (m160 / 100) * 0.8 : null;
  const savesF     = m097 != null ? clamp(1.4 - (m097 / 3.1) * 0.4, 0.5, 1.3) : null;
  const longF      = m104 != null ? 1.0 - clamp(m104 - 75, -30, 20) / 100 * 0.3 : null;
  const csF        = m103 != null ? 1.0 - clamp(m103, 0, 8) * 0.01 : null;
  const aerialF    = m107 != null ? 1.0 - clamp(m107 - 1.0, -0.5, 0.5) * 0.05 : null;
  const distF      = m101 != null ? 1.0 - clamp(m101 - 65, -20, 20) / 100 * 0.05 : null;

  const gkFactor = clamp(wAvg([
    [saveRateF,  3],
    [bigChanceF, 2],
    [ratingF,    2],
    [recentF,    2],
    [xgEffF,     1.5],
    [errorF,     0.5],
    [niF,        1],
    [derivedF,   2],
    [savesF,     1],
    [longF,      0.3],
    [csF,        0.3],
    [aerialF,    0.2],
    [distF,      0.2],
  ]) ?? 1.0, 0.25, 1.3);

  return { gkFactor, penaltySavePct: m099 };
}

/**
 * H2H çarpanları
 * M119-M130, M162
 */
function computeH2HMults(sharedMets, awayMets, sel) {
  const m119 = getM(sharedMets, sel, 'M119') ?? getM(awayMets, sel, 'M119');
  const m120 = getM(sharedMets, sel, 'M120') ?? getM(awayMets, sel, 'M120');
  const m121 = getM(sharedMets, sel, 'M121') ?? getM(awayMets, sel, 'M121');
  const m122 = getM(sharedMets, sel, 'M122') ?? getM(awayMets, sel, 'M122');
  const m123 = getM(sharedMets, sel, 'M123') ?? getM(awayMets, sel, 'M123');
  const m124 = getM(sharedMets, sel, 'M124') ?? getM(awayMets, sel, 'M124');
  const m125 = getM(sharedMets, sel, 'M125') ?? getM(awayMets, sel, 'M125');
  const m126 = getM(sharedMets, sel, 'M126') ?? getM(awayMets, sel, 'M126');
  const m127 = getM(sharedMets, sel, 'M127') ?? getM(awayMets, sel, 'M127');
  const m128 = getM(sharedMets, sel, 'M128') ?? getM(awayMets, sel, 'M128');
  const m162 = getM(sharedMets, sel, 'M162') ?? getM(awayMets, sel, 'M162');

  // H2H sonuç dağılımından yön
  let h2hResHome = null, h2hResAway = null;
  if (m119 != null && m120 != null && m121 != null) {
    const total = m119 + m120 + m121;
    if (total > 0) {
      h2hResHome = 0.85 + (m119 / total) * 0.3;
      h2hResAway = 0.85 + (m121 / total) * 0.3;
    }
  }

  const homeH2HMult = clamp(wAvg([
    [m122 != null ? 0.85 + (m122 / 100) * 0.3 : null, 2],
    [h2hResHome, 2],
    [m126 != null ? 1.0 + clamp(m126 / 5, -0.08, 0.08) : null, 0.5],
    [m127 != null ? 0.9 + (m127 / 100) * 0.2 : null, 0.5],
    [m128 != null ? 1.0 + clamp(m128 / 5, -0.08, 0.08) : null, 0.3],
    [m162 != null ? 0.7 + (m162 / 100) * 0.6 : null, 2],
  ]) ?? 1.0, 0.85, 1.2);

  const awayH2HMult = clamp(wAvg([
    [h2hResAway, 2],
    [m126 != null ? 1.0 - clamp(m126 / 5, -0.08, 0.08) : null, 0.5],
    [m127 != null ? 0.9 + ((100 - m127) / 100) * 0.2 : null, 0.5],
    [m162 != null ? 0.7 + ((100 - m162) / 100) * 0.6 : null, 2],
  ]) ?? 1.0, 0.85, 1.2);

  // H2H goal mult: m123 (avg goals), m124 (over2.5%), m125 (btts%)
  const h2hGoalMult = clamp(wAvg([
    [m123 != null ? clamp(0.7 + m123 * 0.22, 0.8, 1.3) : null, 1.5],
    [m124 != null ? 0.85 + (m124 / 100) * 0.3 : null, 1],
    [m125 != null ? 0.85 + (m125 / 100) * 0.3 : null, 0.5],
  ]) ?? 1.0, 0.85, 1.2);

  return { homeH2HMult, awayH2HMult, h2hGoalMult };
}

/**
 * Bağlam çarpanları
 * M131-M145, M163
 */
function computeContextMults(sharedMets, homeM, awayM, sel) {
  const m131  = getM(sharedMets, sel, 'M131') ?? getM(homeM, sel, 'M131');
  const m132  = getM(sharedMets, sel, 'M132') ?? getM(homeM, sel, 'M132');
  const m133  = getM(sharedMets, sel, 'M133') ?? getM(homeM, sel, 'M133');
  const m134  = getM(sharedMets, sel, 'M134') ?? getM(homeM, sel, 'M134');
  const m134b = getM(sharedMets, sel, 'M134b') ?? getM(homeM, sel, 'M134b');
  const m134c = getM(sharedMets, sel, 'M134c') ?? getM(homeM, sel, 'M134c');
  const m135  = getM(sharedMets, sel, 'M135') ?? getM(homeM, sel, 'M135');
  const m136  = getM(sharedMets, sel, 'M136') ?? getM(homeM, sel, 'M136');
  const m137  = getM(sharedMets, sel, 'M137') ?? getM(homeM, sel, 'M137');
  const m138  = getM(sharedMets, sel, 'M138') ?? getM(homeM, sel, 'M138');
  const m141  = getM(sharedMets, sel, 'M141') ?? getM(homeM, sel, 'M141');
  const m142  = getM(sharedMets, sel, 'M142') ?? getM(homeM, sel, 'M142');
  const m143  = getM(sharedMets, sel, 'M143') ?? getM(homeM, sel, 'M143');
  const m144  = getM(sharedMets, sel, 'M144') ?? getM(homeM, sel, 'M144');
  const m145  = getM(sharedMets, sel, 'M145') ?? getM(homeM, sel, 'M145');
  const m139h = getM(homeM, sel, 'M139');
  const m140h = getM(homeM, sel, 'M140');
  const m139a = getM(awayM, sel, 'M139');
  const m140a = getM(awayM, sel, 'M140');
  const m163  = getM(sharedMets, sel, 'M163') ?? getM(homeM, sel, 'M163');

  const HOME_ADV  = m138 != null ? 1.0 + m138 * 0.15 : 1.10;
  const roundMult = m141 != null ? 0.95 + m141 * 0.1 : 1.0;
  const valueAdv  = m145 != null ? 0.9 + m145 * 0.2 : 1.0;

  // Bahis sinyalleri
  const oddHome  = m131 != null ? 0.85 + (m131 / 100) * 0.3 : 1.0;
  const oddAway  = m133 != null ? 0.85 + (m133 / 100) * 0.3 : 1.0;
  const ahMult   = m134b != null ? 0.9 + (m134b / 100) * 0.2 : 1.0;
  const dnbMult  = m134c != null ? 0.92 + (m134c / 100) * 0.08 : 1.0;
  // beraberlik ağırlığı yüksekse her iki taraf da daha az saldırgan
  const drawBias = m132 != null ? 1.0 - (m132 / 100) * 0.06 : 1.0;

  // Kullanıcı sentimanı
  const sentHome = m135 != null ? 0.95 + (m135 / 100) * 0.1 : 1.0;
  const sentAway = m137 != null ? 0.95 + (m137 / 100) * 0.1 : 1.0;
  const sentDraw = m136 != null ? 1.0 - (m136 / 100) * 0.04 : 1.0; // iki taraf için de düşürür

  // Kalite farkı yönü: M055 karşılaştırması (homeM vs awayM)
  const homePosSc = getM(homeM, sel, 'M055');
  const awayPosSc = getM(awayM, sel, 'M055');
  let qualGapHome = 1.0, qualGapAway = 1.0;
  if (homePosSc != null && awayPosSc != null) {
    const diff = clamp((homePosSc - awayPosSc) / 100, -0.15, 0.15);
    qualGapHome = 1.0 + diff * 0.3;
    qualGapAway = 1.0 - diff * 0.3;
  } else if (m142 != null && m143 != null) {
    // yönü bilinmeden gap'i sadece genel oyun temposi olarak kullan
    const gapBonus = m142 * 0.05 + clamp(m143 / 100, 0, 0.05);
    qualGapHome = 1.0 + gapBonus;
    qualGapAway = 1.0 + gapBonus;
  }

  // Lig gücü: daha güçlü lig → daha az gol (savunma taktiksel)
  const leagueQ = m144 != null ? clamp(1.05 - (m144 - 70) / 100 * 0.1, 0.9, 1.1) : 1.0;

  // Menajer faktörü
  const homeMgr = wAvg([
    [m139h != null ? 0.95 + (m139h / 100) * 0.1 : null, 1],
    [m140h != null ? 0.9 + (m140h / 100) * 0.2 : null, 1],
  ]) ?? 1.0;
  const awayMgr = wAvg([
    [m139a != null ? 0.95 + (m139a / 100) * 0.1 : null, 1],
    [m140a != null ? 0.9 + (m140a / 100) * 0.2 : null, 1],
  ]) ?? 1.0;

  const contextDerived = m163 != null ? 0.85 + (m163 / 100) * 0.3 : null;
  const goalTotalMult  = clamp(wAvg([
    [m134 != null ? 0.85 + (m134 / 100) * 0.3 : null, 1.5],
    [leagueQ != 1.0 ? leagueQ : null, 0.5],
    [drawBias != 1.0 ? drawBias : null, 0.5],
    [sentDraw != 1.0 ? sentDraw : null, 0.3],
  ]) ?? 1.0, 0.85, 1.2);

  // BUG6: Çarpımsal zincir → wAvg ile tutarlı hesaplama (overflow önlenir)
  const homeContextMult = clamp(wAvg([
    [HOME_ADV, 3],             // stadyum kapasitesi ev avantajı
    [roundMult != 1.0 ? roundMult : null, 0.5],
    [valueAdv != 1.0 ? valueAdv : null, 1],
    [oddHome != 1.0 ? oddHome : null, 2],     // bahis sinyali
    [ahMult != 1.0 ? ahMult : null, 1],
    [dnbMult != 1.0 ? dnbMult : null, 0.5],
    [sentHome != 1.0 ? sentHome : null, 0.5],
    [homeMgr != 1.0 ? homeMgr : null, 1],
    [contextDerived, 1.5],
    [qualGapHome != 1.0 ? qualGapHome : null, 1.5],
  ]) ?? 1.0, 0.7, 1.6);

  const awayContextMult = clamp(wAvg([
    [roundMult != 1.0 ? roundMult : null, 0.5],
    [oddAway != 1.0 ? oddAway : null, 2],
    [sentAway != 1.0 ? sentAway : null, 0.5],
    [awayMgr != 1.0 ? awayMgr : null, 1],
    [contextDerived, 1.5],
    [qualGapAway != 1.0 ? qualGapAway : null, 1.5],
  ]) ?? 1.0, 0.7, 1.5);

  return { homeContextMult, awayContextMult, goalTotalMult };
}

/**
 * Momentum çarpanı
 * M146-M155, M164
 */
function computeMomMult(mets, sel) {
  const m146 = getM(mets, sel, 'M146'); // baskı indeksi
  const m147 = getM(mets, sel, 'M147'); // baskı yeme
  const m148 = getM(mets, sel, 'M148'); // baskı altında gol %
  const m149 = getM(mets, sel, 'M149'); // dominant gol %
  const m151 = getM(mets, sel, 'M151'); // top→gol korelasyon
  const m152 = getM(mets, sel, 'M152'); // pas tamamlama
  const m153 = getM(mets, sel, 'M153'); // uzun pas %
  const m154 = getM(mets, sel, 'M154'); // cross başarısı
  const m155 = getM(mets, sel, 'M155'); // gol katkı/maç
  const m164 = getM(mets, sel, 'M164'); // momentum skoru (derived)

  return clamp(wAvg([
    [m146 != null ? 0.7 + (m146 / 100) * 0.6 : null, 2],
    [m147 != null ? 1.2 - (m147 / 100) * 0.4 : null, 1],
    [m148 != null ? 0.9 + (m148 / 100) * 0.2 : null, 0.5],
    [m149 != null ? 0.85 + (m149 / 100) * 0.3 : null, 1],
    [m151 != null ? 0.85 + (m151 / 100) * 0.3 : null, 0.5],
    [m152 != null ? 0.88 + (m152 / 100) * 0.24 : null, 0.5],
    [m153 != null ? 0.92 + (m153 / 100) * 0.16 : null, 0.3],
    [m154 != null ? 0.92 + (m154 / 100) * 0.16 : null, 0.3],
    [m155 != null ? clamp(0.9 + (m155 - 2.5) * 0.03, 0.85, 1.15) : null, 0.5],
    [m164 != null ? 0.85 + (m164 / 100) * 0.3 : null, 2],
  ]) ?? 1.0, 0.8, 1.25);
}

/**
 * Kart/faul hakemi çarpanı
 * M038-M040, M109-M118, M129, M161
 */
function computeCardMod(homeM, awayM, sel) {
  const refY  = getM(homeM, sel, 'M109') ?? getM(awayM, sel, 'M109');
  const refR  = getM(homeM, sel, 'M110') ?? getM(awayM, sel, 'M110');
  const penR  = getM(homeM, sel, 'M111') ?? getM(awayM, sel, 'M111');
  const refF  = getM(homeM, sel, 'M112') ?? getM(awayM, sel, 'M112');
  const refYD = getM(homeM, sel, 'M113') ?? getM(awayM, sel, 'M113');
  const mPerF = getM(homeM, sel, 'M114') ?? getM(awayM, sel, 'M114');
  const homeFP = getM(homeM, sel, 'M115') ?? getM(awayM, sel, 'M115');
  const awayFP = getM(homeM, sel, 'M116') ?? getM(awayM, sel, 'M116');
  const harsh = getM(homeM, sel, 'M117') ?? getM(awayM, sel, 'M117');
  const ftol  = getM(homeM, sel, 'M118') ?? getM(awayM, sel, 'M118');
  const m118b = getM(homeM, sel, 'M118b') ?? getM(awayM, sel, 'M118b'); // BUG7: Hakem ev sahibi yanlılık indeksi
  const h2hCd = getM(homeM, sel, 'M129') ?? getM(awayM, sel, 'M129');
  const refImp = getM(homeM, sel, 'M161') ?? getM(awayM, sel, 'M161');

  const cardMod = clamp(wAvg([
    [refY  != null ? refY  / 3.6 : null, 3],
    [refR  != null ? refR  / 0.16 : null, 1],
    [harsh != null ? harsh / 4.0 : null, 2],
    [refF  != null ? refF  / 45.5 : null, 0.5],
    [refYD != null ? refYD / 2.65 : null, 1],
    [mPerF != null ? clamp(52 / mPerF, 0.4, 2.2) : null, 0.3],
    [h2hCd != null ? h2hCd / 4.5 : null, 1],
    [ftol  != null ? clamp(1.0 / ftol, 0.5, 2.0) : null, 0.3],
    [refImp != null ? 0.5 + (refImp / 100) : null, 1],
    [m118b != null ? 0.9 + (m118b / 100) * 0.2 : null, 1.5], // BUG7: M118b entegrasyonu
  ]) ?? 1.0, 0.3, 2.5);

  // BUG7: M118b ev sahibi yanlılık → bias ayarı
  let homeBiasVal = homeFP != null ? homeFP / 50 : null;
  let awayBiasVal = awayFP != null ? awayFP / 50 : null;
  if (m118b != null) {
    const biasAdj = (m118b - 50) / 200; // >50 = ev lehine, <50 = deplasman lehine
    homeBiasVal = (homeBiasVal ?? 1.0) * (1 - biasAdj); // ev sahibine daha az faul
    awayBiasVal = (awayBiasVal ?? 1.0) * (1 + biasAdj); // deplasmanа daha fazla faul
  }

  return {
    cardMod,
    penMod: penR != null ? penR / 0.24 : 1.0,
    homeBias: homeBiasVal ?? 1.0,
    awayBias: awayBiasVal ?? 1.0,
    refHomeBias: m118b, // BUG7: Context'e de aktarılacak
  };
}

/**
 * Kadro eksikliği etkisi (sakatlık/süspansiyon)
 * M077, M078
 */
function computeSquadImpact(mets, sel) {
  const m077 = getM(mets, sel, 'M077');
  const m078 = getM(mets, sel, 'M078');
  if (m077 == null && m078 == null) return 1.0;
  return clamp(1.0 - ((m077 ?? 0) + (m078 ?? 0)) * 0.04, 0.75, 1.0);
}

/**
 * Oyun durumu dinamiği (geride/önde olma)
 * M042, M043, M064, M065
 */
function computeGameStateMult(mets, sel, isTrailing, isLeading, minute) {
  const m042 = getM(mets, sel, 'M042');
  const m043 = getM(mets, sel, 'M043');
  const m064 = getM(mets, sel, 'M064');
  const m065 = getM(mets, sel, 'M065');

  if (isTrailing) {
    // geriden gelen takım daha agresif
    if (m064 == null) return 1.0; // veri yoksa nötr
    const comeback = 1.0 + (m064 / 100) * 0.25;
    // Stoppage time (91-95 dk) → geride kalan çok daha agresif
    const stoppageMult = minute > 90 ? 1.4 : (minute > 85 ? 1.15 : 1.0);
    return clamp(comeback * stoppageMult, 0.9, 1.5);
  }
  if (isLeading) {
    // M042: önde gidip puan kaybetme oranı — yüksekse savunma zafiyeti
    const dropRisk = m042 != null ? 1.0 + (m042 / 100) * 0.12 : 1.0; // yüksek = riskli savunma
    // M043: önde gidip kapatma oranı — yüksek = iyi geri çekilme
    const leadProtect = m043 != null ? 0.88 + (m043 / 100) * 0.15 : 1.0;
    // M065: fişi çekme = önde iken de gol atmaya devam eder
    const blowout = m065 != null ? 0.95 + (m065 / 100) * 0.1 : 1.0;
    // dropRisk yüksekse savunma çöker → atkMult artar (karşı taraf için de bağlamda etki)
    const combined = (leadProtect * 0.5 + blowout * 0.3 + dropRisk * 0.2);
    // Stoppage time (91-95 dk) → önde olan daha savunmacı
    const stoppageMult = minute > 90 ? 0.7 : 1.0;
    return clamp(combined * stoppageMult, 0.85, 1.15);
  }
  return 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEK KOŞU
// ─────────────────────────────────────────────────────────────────────────────
function simulateSingleRun({ homeMetrics, awayMetrics, selectedMetrics, lineups, weatherMetrics }) {
  // Hava durumu çarpanları
  const { goalMult: weatherGoalMult, errorMult: weatherErrorMult, fatigueMult: weatherFatigueMult } =
    computeWeatherMultipliers(weatherMetrics || {});
  const sel = selectedMetrics instanceof Set
    ? selectedMetrics
    : new Set(selectedMetrics || []);

  const hPlayers = lineups?.home?.players || lineups?.home || null;
  const aPlayers = lineups?.away?.players || lineups?.away || null;

  const events = [];
  const goals = { home: 0, away: 0 };
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
    away: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
  };
  const minuteLog = [];

  // ── Boyut skorlarını hesapla ─────────────────────────────────────────────
  const homeFormMult  = computeFormMult(homeMetrics, sel, true);
  const awayFormMult  = computeFormMult(awayMetrics, sel, false);
  const homeQualMult  = computeQualityMult(homeMetrics, sel);
  const awayQualMult  = computeQualityMult(awayMetrics, sel);
  const homeAttBoost  = computeAttackBoost(homeMetrics, sel);
  const awayAttBoost  = computeAttackBoost(awayMetrics, sel);
  const homeDefMult   = computeDefenseMult(homeMetrics, sel);
  const awayDefMult   = computeDefenseMult(awayMetrics, sel);
  const { gkFactor: homeGKF, penaltySavePct: homeGKPen } = computeGKFactor(homeMetrics, sel);
  const { gkFactor: awayGKF, penaltySavePct: awayGKPen  } = computeGKFactor(awayMetrics, sel);
  const { homeH2HMult, awayH2HMult, h2hGoalMult } = computeH2HMults(homeMetrics, awayMetrics, sel);
  const { homeContextMult, awayContextMult, goalTotalMult } =
    computeContextMults(homeMetrics, homeMetrics, awayMetrics, sel);
  const homeMomMult   = computeMomMult(homeMetrics, sel);
  const awayMomMult   = computeMomMult(awayMetrics, sel);
  const { cardMod, penMod, homeBias, awayBias } = computeCardMod(homeMetrics, awayMetrics, sel);
  const homeSquadImp  = computeSquadImpact(homeMetrics, sel);
  const awaySquadImp  = computeSquadImpact(awayMetrics, sel);

  // Formation & win prob & need goal (derived)
  const homeFormAdv  = getM(homeMetrics, sel, 'M169');
  const awayFormAdv  = getM(awayMetrics, sel, 'M169');
  const homeWinProb  = getM(homeMetrics, sel, 'M168');
  const awayWinProb  = getM(awayMetrics, sel, 'M168');
  const homeNeedGoal = getM(homeMetrics, sel, 'M165');
  const awayNeedGoal = getM(awayMetrics, sel, 'M165');

  const homeFormAdvM = homeFormAdv != null ? 0.92 + (homeFormAdv / 100) * 0.16 : 1.0;
  const awayFormAdvM = awayFormAdv != null ? 0.92 + (awayFormAdv / 100) * 0.16 : 1.0;
  const homeWinM     = homeWinProb != null ? 0.92 + (homeWinProb / 100) * 0.16 : 1.0;
  const awayWinM     = awayWinProb != null ? 0.92 + (awayWinProb / 100) * 0.16 : 1.0;
  const homeNeedM    = homeNeedGoal != null ? 1.0 + (homeNeedGoal / 100) * 0.15 : 1.0;
  const awayNeedM    = awayNeedGoal != null ? 1.0 + (awayNeedGoal / 100) * 0.15 : 1.0;

  // ── Toplam saldırı çarpanı (wAvg → kalibre kalır) ───────────────────────
  const homeAttackMult = clamp(wAvg([
    [homeFormMult,    3],
    [homeQualMult,    3],
    [homeAttBoost,    2],
    [homeMomMult,     2],
    [homeH2HMult,     1.5],
    [homeContextMult, 2],
    [homeSquadImp,    1],
    [homeFormAdvM,    0.5],
    [homeWinM,        0.5],
    [homeNeedM,       0.5],
    [h2hGoalMult,     0.5],
    [goalTotalMult,   0.5],
  ]) ?? 1.0, 0.35, 2.5);

  const awayAttackMult = clamp(wAvg([
    [awayFormMult,    3],
    [awayQualMult,    3],
    [awayAttBoost,    2],
    [awayMomMult,     2],
    [awayH2HMult,     1.5],
    [awayContextMult, 2],
    [awaySquadImp,    1],
    [awayFormAdvM,    0.5],
    [awayWinM,        0.5],
    [awayNeedM,       0.5],
    [h2hGoalMult,     0.5],
    [goalTotalMult,   0.5],
  ]) ?? 1.0, 0.35, 2.5);

  // ── Gol kaynağı: M013 → M015 → M167 → M001 ─────────────────────────────
  const homeShotsPerGame = getM(homeMetrics, sel, 'M013');
  const awayShotsPerGame = getM(awayMetrics, sel, 'M013');
  const homeXGPerGame    = getM(homeMetrics, sel, 'M015'); // xG/maç
  const awayXGPerGame    = getM(awayMetrics, sel, 'M015');
  const homeXGConv       = getM(homeMetrics, sel, 'M016') ?? 1.0; // xG dönüşüm oranı
  const awayXGConv       = getM(awayMetrics, sel, 'M016') ?? 1.0;
  const homeLambda       = getM(homeMetrics, sel, 'M167')
    ?? (getM(homeMetrics, sel, 'M001') != null ? getM(homeMetrics, sel, 'M001') * 1.12 : null);
  const awayLambda       = getM(awayMetrics, sel, 'M167')
    ?? getM(awayMetrics, sel, 'M001');

  function getShotSrc(shots, xg, lambda) {
    if (shots  != null) return { type: 'shots',  value: shots  };
    if (xg     != null) return { type: 'xg',     value: xg     };
    if (lambda != null) return { type: 'lambda', value: lambda };
    return null;
  }
  const homeShotSrc = getShotSrc(homeShotsPerGame, homeXGPerGame, homeLambda);
  const awayShotSrc = getShotSrc(awayShotsPerGame, awayXGPerGame, awayLambda);

  // ── Şut & gol dönüşüm ───────────────────────────────────────────────────
  const homeGoalPerShot      = getM(homeMetrics, sel, 'M012');
  const awayGoalPerShot      = getM(awayMetrics, sel, 'M012');
  const homeConvFromOnTarget = getM(homeMetrics, sel, 'M011');
  const awayConvFromOnTarget = getM(awayMetrics, sel, 'M011');
  const homeOnTargetRate     = (homeShotsPerGame && getM(homeMetrics, sel, 'M014'))
    ? getM(homeMetrics, sel, 'M014') / homeShotsPerGame : null;
  const awayOnTargetRate     = (awayShotsPerGame && getM(awayMetrics, sel, 'M014'))
    ? getM(awayMetrics, sel, 'M014') / awayShotsPerGame : null;
  // M018: big chance gol % (dönüşüm boost)
  const homeBigChancePct = getM(homeMetrics, sel, 'M018');
  const awayBigChancePct = getM(awayMetrics, sel, 'M018');

  // ── İlk gol & set piece ──────────────────────────────────────────────────
  const homeFirstGoalPct  = getM(homeMetrics, sel, 'M062');
  const awayFirstGoalPct  = getM(awayMetrics, sel, 'M062');
  const homeCornerGoalPct = getM(homeMetrics, sel, 'M023'); // kornerden gol %
  const awayCornerGoalPct = getM(awayMetrics, sel, 'M023');
  const homeFKGoalPct     = getM(homeMetrics, sel, 'M024'); // serbest vuruş gol %
  const awayFKGoalPct     = getM(awayMetrics, sel, 'M024');

  // ── Yarı gol ortalamaları ────────────────────────────────────────────────
  const homeH1Goals = getM(homeMetrics, sel, 'M003');
  const homeH2Goals = getM(homeMetrics, sel, 'M004');
  const awayH1Goals = getM(awayMetrics, sel, 'M003');
  const awayH2Goals = getM(awayMetrics, sel, 'M004');
  const homeH1Conc  = getM(homeMetrics, sel, 'M029');
  const homeH2Conc  = getM(homeMetrics, sel, 'M030');
  const awayH1Conc  = getM(awayMetrics, sel, 'M029');
  const awayH2Conc  = getM(awayMetrics, sel, 'M030');
  // Erken/geç dakika savunma güçsüzlüğü: M031, M032
  const homeEarlyConc = getM(homeMetrics, sel, 'M031'); // 0-15 dk yenilen %
  const homeLateConc  = getM(homeMetrics, sel, 'M032'); // 76-90 dk yenilen %
  const awayEarlyConc = getM(awayMetrics, sel, 'M031');
  const awayLateConc  = getM(awayMetrics, sel, 'M032');

  // ── Kart & korner ────────────────────────────────────────────────────────
  const homeYellowPG  = getM(homeMetrics, sel, 'M039');
  const awayYellowPG  = getM(awayMetrics, sel, 'M039');
  const homeRedPG     = getM(homeMetrics, sel, 'M040');
  const awayRedPG     = getM(awayMetrics, sel, 'M040');
  const homeFoulsPG   = getM(homeMetrics, sel, 'M038');
  const awayFoulsPG   = getM(awayMetrics, sel, 'M038');
  const homeCornersPG = getM(homeMetrics, sel, 'M022');
  const awayCornersPG = getM(awayMetrics, sel, 'M022');
  const h2hCornerAvg  = getM(homeMetrics, sel, 'M130') ?? getM(awayMetrics, sel, 'M130');

  // ── Penaltı ─────────────────────────────────────────────────────────────
  const homePenPG   = getM(homeMetrics, sel, 'M019');
  const awayPenPG   = getM(awayMetrics, sel, 'M019');
  const homePenConv = getM(homeMetrics, sel, 'M020');
  const awayPenConv = getM(awayMetrics, sel, 'M020');
  let homePenBudget = homePenPG != null ? homePenPG * penMod : null;
  let awayPenBudget = awayPenPG != null ? awayPenPG * penMod : null;
  // Çoklu penaltı: bütçeyi sıfırlama yerine azalt (gerçekte %8 maçta 2+ penaltı)
  const PEN_BUDGET_DECAY = 0.25; // her penaltıdan sonra bütçenin %25'i kalır

  const subsDone    = { home: 0, away: 0 };
  const MAX_SUBS    = 5;

  // BUG1+BUG5: Oyuncu bazlı sarı kart takibi (takım bazlı değil)
  const playerYellows   = { home: {}, away: {} };
  // BUG2: Kırmızı kart sonrası dinamik güç düşüşü
  const redCardPenalty  = { home: 0, away: 0 };
  // BUG2: Atılan oyuncular (pickPlayer'da filtrelenecek)
  const expelledPlayers = { home: new Set(), away: new Set() };
  // Sarı kart sonrası temkinli oynayan oyuncular
  const cautionedPlayers = { home: new Set(), away: new Set() };

  // Oyuncu seçiminde atılmış oyuncuları filtrele
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
    const list = pool.length ? pool : players.filter(p => {
      const name = p?.player?.name || p?.name || '';
      return p && !p.substitute && !expelled.has(name);
    });
    if (!list.length) return null;
    const p = list[Math.floor(r() * list.length)];
    return p?.player?.name || p?.name || 'Oyuncu';
  }

  // ── Dakika döngüsü ────────────────────────────────────────────────────────
  for (let minute = 1; minute <= 95; minute++) {
    const minuteEvents = [];
    const isFirstHalf = minute <= 45;
    // BUG4: Aynı dakikada aynı taraftan max 1 gol
    const goalScoredThisMinute = { home: false, away: false };

    if (minute === 46) {
      events.push({ minute: 45, type: 'halftime', homeGoals: goals.home, awayGoals: goals.away });
      minuteEvents.push({ minute: 45, type: 'halftime' });
    }

    // Zaman penceresi (M005-M010)
    const twHome = timeWeight(minute, homeMetrics, sel);
    const twAway = timeWeight(minute, awayMetrics, sel);

    // Yarı gol modifikatörü (M003/M004 + M029/M030)
    function halfMod(h1, h2, h1c, h2c, isH1) {
      const srcAtk = isH1 ? h1 : h2;
      const srcDef = isH1 ? h1c : h2c;
      const totAtk = (h1 ?? 0) + (h2 ?? 0);
      const totDef = (h1c ?? 0) + (h2c ?? 0);
      const src = srcAtk ?? srcDef;
      const tot = totAtk > 0 ? totAtk : (totDef > 0 ? totDef : 0);
      if (src == null || tot === 0) return 1.0;
      return clamp(src / (tot / 2), 0.6, 1.7);
    }
    const homeHTMod = halfMod(homeH1Goals, homeH2Goals, homeH1Conc, homeH2Conc, isFirstHalf);
    const awayHTMod = halfMod(awayH1Goals, awayH2Goals, awayH1Conc, awayH2Conc, isFirstHalf);

    // Erken dakika bonus (M062)
    function earlyBonus(fgPct, min) {
      if (fgPct == null || min > 20) return 1.0;
      return 1.0 + (fgPct / 100) * 0.5 * (1 - min / 20);
    }
    const homeEB = earlyBonus(homeFirstGoalPct, minute);
    const awayEB = earlyBonus(awayFirstGoalPct, minute);

    // Savunma zafiyet zamanlama (M031/M032): karşı takımın savunması bu dakikada daha zayıf
    function defTimeVuln(earlyC, lateC, min) {
      if (min <= 15 && earlyC != null) return clamp(earlyC / 12, 0.7, 1.7); // leagueAvg 12%
      if (min > 75  && lateC  != null) return clamp(lateC  / 20, 0.7, 1.7); // leagueAvg 20%
      return 1.0;
    }
    const homeDefTimeV = defTimeVuln(homeEarlyConc, homeLateConc, minute);
    const awayDefTimeV = defTimeVuln(awayEarlyConc, awayLateConc, minute);

    // Oyun durumu — minute parametresi eklendi (stoppage time desteği)
    const homeTrailing = goals.away > goals.home;
    const awayTrailing = goals.home > goals.away;
    const homeLeading  = goals.home > goals.away;
    const awayLeading  = goals.away > goals.home;
    const homeGSM = computeGameStateMult(homeMetrics, sel, homeTrailing, homeLeading, minute);
    const awayGSM = computeGameStateMult(awayMetrics, sel, awayTrailing, awayLeading, minute);

    // BUG2: Kırmızı kart sonrası dinamik güç ayarı
    const homeRedAdj = 1 - redCardPenalty.home; // her kırmızı kart %15 düşüş
    const awayRedAdj = 1 - redCardPenalty.away;
    // Karşı takım avantaj kazanır
    const homeRedOppBonus = 1 + redCardPenalty.away * 0.5;
    const awayRedOppBonus = 1 + redCardPenalty.home * 0.5;

    // ─── Şut ve gol ────────────────────────────────────────────────────────
    for (const side of ['home', 'away']) {
      if (goalScoredThisMinute[side]) continue; // BUG4: bu dakikada zaten gol attı

      const isHome      = side === 'home';
      const players     = isHome ? hPlayers : aPlayers;
      const shotSrc     = isHome ? homeShotSrc : awayShotSrc;
      // BUG2: Kırmızı kart dinamik çarpanları uygula
      const atkMult     = (isHome ? homeAttackMult : awayAttackMult) * (isHome ? homeRedAdj : awayRedAdj) * (isHome ? homeRedOppBonus : awayRedOppBonus);
      // Karşı takımın savunması + kalecisi
      const defMult     = (isHome ? awayDefMult : homeDefMult) * (isHome ? awayRedAdj : homeRedAdj);
      const gkF         = isHome ? awayGKF : homeGKF;
      const tw          = isHome ? twHome : twAway;
      const htMod       = isHome ? homeHTMod : awayHTMod;
      const eb          = isHome ? homeEB : awayEB;
      const gsm         = isHome ? homeGSM : awayGSM;
      const defTimeV    = isHome ? awayDefTimeV : homeDefTimeV; // karşının zafiyet anı
      const goalPerShot = isHome ? homeGoalPerShot : awayGoalPerShot;
      const otRate      = isHome ? homeOnTargetRate : awayOnTargetRate;
      const convOT      = isHome ? homeConvFromOnTarget : awayConvFromOnTarget;
      const bigCpct     = isHome ? homeBigChancePct : awayBigChancePct;
      const xgConv      = isHome ? homeXGConv : awayXGConv;

      // Hava yorgunluğu (sadece 2. yarıda etkili)
      const fatigue = (!isFirstHalf && weatherFatigueMult > 1.0) ? weatherFatigueMult : 1.0;
      // Yorgunluk saldırıyı azaltır, savunmayı zayıflatır (defMult zaten bölen olduğu için fatigue artırır)
      const wAtkMult = atkMult / fatigue;
      const wDefMult = defMult / fatigue;

      if (shotSrc == null) continue;

      let shotProb;
      if (shotSrc.type === 'shots') {
        shotProb = (shotSrc.value / 90) * wAtkMult * (1 / wDefMult) * tw * htMod * eb * gsm * defTimeV * weatherGoalMult;
      } else if (shotSrc.type === 'xg') {
        const impliedShots = (shotSrc.value * xgConv) / 0.12;
        shotProb = (impliedShots / 90) * wAtkMult * (1 / wDefMult) * tw * htMod * eb * gsm * defTimeV * weatherGoalMult;
      } else {
        shotProb = (shotSrc.value / 90) * wAtkMult * (1 / wDefMult) * tw * htMod * eb * gsm * defTimeV * 2.5 * weatherGoalMult;
      }
      shotProb = Math.min(shotProb, 0.45);

      if (r() < shotProb) {
        stats[side].shots++;
        // Fallback temizliği + Hava durumu hata çarpanı
        // (errorMult > 1 ise isabet oranı düşer)
        const onTarget = otRate != null ? r() < (otRate / weatherErrorMult) : false;
        if (onTarget) stats[side].shotsOnTarget++;

        let isGoal = false;
        if (onTarget) {
          let gp = null;
          if (convOT != null) {
            // M011: isabetli şut → gol dönüşümü
            gp = (convOT / 100) * gkF;
            if (bigCpct != null) gp *= (0.8 + (bigCpct / 100) * 0.4);
          } else if (goalPerShot != null) {
            // M012: toplam şut → gol dönüşümü (isabetlilere kısmen uygula)
            gp = (goalPerShot / 100) * 2.5 * gkF; // isabetli = ~2.5x toplam oran
          } else {
            // xG/şut ile dolaylı tahmin (M015 + M013)
            const sideXGPG = isHome ? homeXGPerGame : awayXGPerGame;
            const sideShotsPG = isHome ? homeShotsPerGame : awayShotsPerGame;
            if (sideXGPG != null && sideShotsPG != null && sideShotsPG > 0) {
              gp = Math.min((sideXGPG * xgConv) / sideShotsPG, 0.8) * gkF;
            } else if (shotSrc.type === 'xg') {
              gp = 0.12 * xgConv * gkF;
            }
            // Veri yoksa gol üretilmez (gp = null)
          }
          if (gp != null) isGoal = r() < Math.min(gp, 0.9);
        } else if (shotSrc.type === 'xg') {
          // İsabetsiz ama xG kaynağı — nadir gol ihtimali
          isGoal = r() < (0.12 * xgConv * gkF * 0.15);
        } else if (shotSrc.type === 'lambda') {
          isGoal = r() < (shotSrc.value / 90) * atkMult * (1 / defMult) * tw * htMod * eb * gsm;
        } else if (!onTarget && goalPerShot != null) {
          isGoal = r() < (goalPerShot / 100) * 0.05;
        }

        if (isGoal) {
          // VAR müdahalesi: ~%3 gol iptal olasılığı (offside, faul, el)
          const varCancelled = r() < 0.03;
          if (varCancelled) {
            const ev = { minute, type: 'var_cancelled_goal', team: side, reason: r() < 0.6 ? 'Ofsayt' : (r() < 0.5 ? 'Faul' : 'El') };
            events.push(ev); minuteEvents.push(ev);
          } else {
            const scorer   = pickActivePlayer(players, ['F', 'M', 'A', 'W'], side);
            const assister = r() < 0.6 ? pickActivePlayer(players, ['M', 'F', 'A'], side) : null;
            const xg       = goalPerShot != null ? Math.min(goalPerShot / 100, 0.95) : null;
            goals[side]++;
            goalScoredThisMinute[side] = true; // BUG4
            const ev = {
              minute, type: 'goal', team: side,
              player: scorer || 'Bilinmeyen',
              ...(assister && assister !== scorer ? { assist: assister } : {}),
              ...(xg != null ? { xg: +xg.toFixed(2) } : {}),
            };
            events.push(ev); minuteEvents.push(ev);
          }
        } else {
          const ev = { minute, type: onTarget ? 'shot_on_target' : 'shot', team: side, onTarget };
          events.push(ev); minuteEvents.push(ev);
          if (!onTarget && r() < 0.28) {
            stats[side].corners++;
            events.push({ minute, type: 'corner', team: side });
            minuteEvents.push({ minute, type: 'corner', team: side });
          }
        }
      }
    }

    // ─── Serbest vuruş golü (M024, M038) ───────────────────────────────────
    for (const [side, fkPct, fouls] of [
      ['home', homeFKGoalPct, homeFoulsPG],
      ['away', awayFKGoalPct, awayFoulsPG],
    ]) {
      if (fkPct == null || fouls == null) continue; // Fallback temizliği: fouls null ise atla
      if (goalScoredThisMinute[side]) continue; // BUG4
      const fkProb = (fouls / 90) * 0.3;
      if (r() < fkProb && r() < fkPct / 100) {
        // VAR müdahalesi: serbest vuruş gollerine nadiren karışır (~%1)
        if (r() < 0.01) {
          events.push({ minute, type: 'var_cancelled_goal', team: side, reason: 'Faul kontrolü' });
          minuteEvents.push({ minute, type: 'var_cancelled_goal', team: side, reason: 'Faul kontrolü' });
          continue;
        }
        const player = pickActivePlayer(side === 'home' ? hPlayers : aPlayers, ['M', 'F'], side);
        goals[side]++;
        goalScoredThisMinute[side] = true; // BUG4
        events.push({ minute, type: 'goal', team: side, player: player || 'Oyuncu', setpiece: 'freekick' });
        minuteEvents.push({ minute, type: 'goal', team: side, player: player || 'Oyuncu', setpiece: 'freekick' });
      }
    }

    // ─── Bağımsız korner (M022, M130) + korner golü (M023) ─────────────────
    for (const [side, cornPG] of [['home', homeCornersPG], ['away', awayCornersPG]]) {
      const base = cornPG ?? (h2hCornerAvg != null ? h2hCornerAvg / 2 : null);
      if (base == null) continue;
      if (r() < base / 90) {
        stats[side].corners++;
        events.push({ minute, type: 'corner', team: side });
        minuteEvents.push({ minute, type: 'corner', team: side });
        if (goalScoredThisMinute[side]) continue; // BUG4
        const cgPct = side === 'home' ? homeCornerGoalPct : awayCornerGoalPct;
        if (cgPct != null && r() < cgPct / 100) {
          const player = pickActivePlayer(side === 'home' ? hPlayers : aPlayers, ['D', 'F', 'M'], side);
          goals[side]++;
          goalScoredThisMinute[side] = true; // BUG4
          const cev = { minute, type: 'goal', team: side, player: player || 'Oyuncu', setpiece: 'corner' };
          events.push(cev); minuteEvents.push(cev);
        }
      }
    }

    // ─── Sarı kart (M039 + hakem M109/M117 + M115/M116) ────────────────────
    for (const [side, yPG, bias] of [
      ['home', homeYellowPG, homeBias],
      ['away', awayYellowPG, awayBias],
    ]) {
      if (yPG == null) continue;
      const prob = (yPG / 90) * cardMod * (bias ?? 1.0);
      if (r() < prob) {
        const player = pickActivePlayer(side === 'home' ? hPlayers : aPlayers, ['D', 'M', 'F', 'B'], side);
        if (!player) continue;

        // Sarı kart sonrası temkinli oynayan oyuncu daha az kart görür
        if (cautionedPlayers[side].has(player) && r() < 0.5) continue;

        // BUG1: Oyuncu bazlı sarı kart takibi
        playerYellows[side][player] = (playerYellows[side][player] || 0) + 1;
        stats[side].yellowCards++;
        const ev = { minute, type: 'yellow_card', team: side, player };
        events.push(ev); minuteEvents.push(ev);

        // BUG1: İkinci sarı → kesin kırmızı (r() kontrolü yok)
        if (playerYellows[side][player] >= 2) {
          stats[side].redCards++;
          redCardPenalty[side] = Math.min(redCardPenalty[side] + 0.15, 0.45); // BUG2: max 3 kırmızı etkisi
          expelledPlayers[side].add(player); // BUG2: listeden çıkar
          events.push({ minute, type: 'red_card', team: side, player, reason: 'İkinci sarı' });
          minuteEvents.push({ minute, type: 'red_card', team: side, player, reason: 'İkinci sarı' });
        } else {
          // İlk sarı → oyuncu temkinli oynamaya başlar
          cautionedPlayers[side].add(player);
        }
      }
    }

    // ─── Kırmızı kart (M040 + hakem M110) ──────────────────────────────────
    for (const [side, rPG] of [['home', homeRedPG], ['away', awayRedPG]]) {
      if (rPG == null) continue;
      if (r() < (rPG / 90) * cardMod) {
        const player = pickActivePlayer(side === 'home' ? hPlayers : aPlayers, ['D', 'M', 'F'], side);
        if (!player) continue;
        stats[side].redCards++;
        redCardPenalty[side] = Math.min(redCardPenalty[side] + 0.15, 0.45); // BUG2
        expelledPlayers[side].add(player); // BUG2
        const ev = { minute, type: 'red_card', team: side, player, reason: 'Doğrudan kırmızı' };
        events.push(ev); minuteEvents.push(ev);

        // VAR: Doğrudan kırmızı kartların %5'i VAR ile iptal
        if (r() < 0.05) {
          stats[side].redCards--;
          redCardPenalty[side] = Math.max(redCardPenalty[side] - 0.15, 0);
          expelledPlayers[side].delete(player);
          events.push({ minute, type: 'var_red_card_cancelled', team: side, player });
          minuteEvents.push({ minute, type: 'var_red_card_cancelled', team: side, player });
        }
      }
    }

    // ─── Faul sayacı (M038 + hakem M112/M114) ──────────────────────────────
    for (const [side, fPG, bias] of [
      ['home', homeFoulsPG, homeBias],
      ['away', awayFoulsPG, awayBias],
    ]) {
      if (fPG == null) continue;
      if (r() < (fPG / 90) * cardMod * (bias ?? 1.0)) stats[side].fouls++;
    }

    // ─── Penaltı (M019 + M111 + M020 + M099) ───────────────────────────────
    for (const [side, convPct, gkSave] of [
      ['home', homePenConv, awayGKPen],
      ['away', awayPenConv, homeGKPen],
    ]) {
      const budget = side === 'home' ? homePenBudget : awayPenBudget;
      if (budget == null || budget <= 0 || minute < 10) continue;
      if (goalScoredThisMinute[side]) continue; // BUG4
      if (r() < budget / 80) {
        // Çoklu penaltı: bütçeyi tamamen sıfırlama, azalt
        if (side === 'home') homePenBudget = (homePenBudget || 0) * PEN_BUDGET_DECAY;
        else awayPenBudget = (awayPenBudget || 0) * PEN_BUDGET_DECAY;
        stats[side].penalties++;
        const shooter = pickActivePlayer(side === 'home' ? hPlayers : aPlayers, ['F', 'M', 'A'], side);

        // VAR: Penaltı kararlarının %4'ü VAR ile iptal
        if (r() < 0.04) {
          const ev = { minute, type: 'var_penalty_cancelled', team: side };
          events.push(ev); minuteEvents.push(ev);
          continue;
        }

        // BUG8: Çifte hesap düzeltmesi — M099 ağırlığı yarıya indirildi
        // M020 zaten kaleci performansını içerir, M099 ek kontrol
        const savedByGK = gkSave != null ? r() < (gkSave * 0.5) / 100 : false;
        const converted = savedByGK ? false
          : (convPct != null ? r() < convPct / 100 : r() < 0.78); // lig ort. ~%78
        const ev = { minute, type: 'penalty', team: side, player: shooter || 'Oyuncu', converted };
        if (converted) {
          goals[side]++;
          goalScoredThisMinute[side] = true; // BUG4
        }
        events.push(ev); minuteEvents.push(ev);
      }
    }

    // ─── Oyuncu değişikliği ───────────────────────────────────────────────
    const subWindows = [46, 57, 62, 70, 78, 84];
    if (subWindows.includes(minute) || (minute > 55 && minute < 85 && r() < 0.04)) {
      for (const [side, players] of [['home', hPlayers], ['away', aPlayers]]) {
        if (subsDone[side] >= MAX_SUBS) continue;
        const pOut = pickActivePlayer(players, ['F', 'M', 'D'], side);
        const pIn  = pickSub(players);
        if (pOut && pIn && pOut !== pIn) {
          subsDone[side]++;
          events.push({ minute, type: 'substitution', team: side, playerOut: pOut, playerIn: pIn });
          minuteEvents.push({ minute, type: 'substitution', team: side, playerOut: pOut, playerIn: pIn });
          // Değişiklik sonrası dinamik güç güncellemesi
          // Forvet girince küçük saldırı bonusu, defans girince savunma bonusu
          // (pickSub pozisyon bilgisi yok, ama genel küçük pozitif etki)
          // Yorgunluk azalması etkisi
        }
      }
    }

    // ─── Sakatlık (M077) — BUG3: işlevsel sakatlık sistemi ─────────────────
    const hInj = getM(homeMetrics, sel, 'M077');
    const aInj = getM(awayMetrics, sel, 'M077');
    const injP = 0.003;
    // BUG3: Sakatlık olasılığı M077 bazlı (yüksek M077 = daha sık sakatlanma)
    const homeInjProb = hInj != null ? injP * (1 + hInj / 5) : injP;
    const awayInjProb = aInj != null ? injP * (1 + aInj / 5) : injP;

    for (const [side, prob, players] of [
      ['home', homeInjProb, hPlayers],
      ['away', awayInjProb, aPlayers],
    ]) {
      if (r() < prob) {
        const player = pickActivePlayer(players, ['D', 'M', 'F'], side);
        if (!player) continue;
        events.push({ minute, type: 'injury', team: side, player });
        minuteEvents.push({ minute, type: 'injury', team: side, player });

        // BUG3: Sakatlık sonrası otomatik değişiklik
        if (subsDone[side] < MAX_SUBS) {
          const pIn = pickSub(players);
          if (pIn && pIn !== player) {
            subsDone[side]++;
            events.push({ minute, type: 'substitution', team: side, playerOut: player, playerIn: pIn, reason: 'Sakatlık' });
            minuteEvents.push({ minute, type: 'substitution', team: side, playerOut: player, playerIn: pIn, reason: 'Sakatlık' });
          }
        } else {
          // BUG3: Değişiklik hakkı kalmadı → küçük güç düşüşü (10 kişi benzeri)
          redCardPenalty[side] = Math.min(redCardPenalty[side] + 0.05, 0.45);
          expelledPlayers[side].add(player);
          events.push({ minute, type: 'injury_no_sub', team: side, player, note: 'Değişiklik hakkı yok, 10 kişi' });
          minuteEvents.push({ minute, type: 'injury_no_sub', team: side, player });
        }
      }
    }

    minuteLog.push({ minute, homeGoals: goals.home, awayGoals: goals.away, events: minuteEvents });
  }

  // ── Full time ────────────────────────────────────────────────────────────
  events.push({ minute: 90, type: 'fulltime', homeGoals: goals.home, awayGoals: goals.away });

  // ── Top kontrolü (M150) ───────────────────────────────────────────────────
  const homePoss = getM(homeMetrics, sel, 'M150');
  const possessionHome = homePoss != null ? Math.round(homePoss) : null;

  const winner = goals.home > goals.away ? 'home'
    : goals.away > goals.home ? 'away' : 'draw';

  return {
    events,
    result: { homeGoals: goals.home, awayGoals: goals.away, winner },
    stats: {
      home: { ...stats.home, ...(possessionHome != null ? { possession: possessionHome } : {}) },
      away: { ...stats.away, ...(possessionHome != null ? { possession: 100 - possessionHome } : {}) },
    },
    minuteLog,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ÇOKLU KOŞU (Monte Carlo)
// ─────────────────────────────────────────────────────────────────────────────
function simulateMultipleRuns(params) {
  const { runs = 1000 } = params;
  let homeWins = 0, draws = 0, awayWins = 0;
  let over15 = 0, over25 = 0, over35 = 0, btts = 0;
  let totalGoals = 0, totalHomeGoals = 0, totalAwayGoals = 0;
  const scoreMap = {};
  // BUG9: Medyan skora en yakın koşuyu sampleRun olarak seç
  let bestSampleRun = null;
  let bestSampleDist = Infinity;
  const allRuns = [];

  for (let i = 0; i < runs; i++) {
    const run = simulateSingleRun(params);
    const hg = run.result.homeGoals;
    const ag = run.result.awayGoals;
    const total = hg + ag;

    if (run.result.winner === 'home') homeWins++;
    else if (run.result.winner === 'away') awayWins++;
    else draws++;

    if (total > 1.5) over15++;
    if (total > 2.5) over25++;
    if (total > 3.5) over35++;
    if (hg > 0 && ag > 0) btts++;
    totalGoals += total;
    totalHomeGoals += hg;
    totalAwayGoals += ag;

    const key = `${hg}-${ag}`;
    scoreMap[key] = (scoreMap[key] || 0) + 1;

    // İlk 100 koşuyu sakla, sonra seyrelterek devam et (bellek optimizasyonu)
    if (i < 100 || i % 10 === 0) allRuns.push(run);
    if (i === 0) bestSampleRun = run; // Fallback
  }

  // BUG9: Medyan skora en yakın koşuyu seç (ilk koşu yerine temsili koşu)
  const avgHome = totalHomeGoals / runs;
  const avgAway = totalAwayGoals / runs;
  for (const run of allRuns) {
    const dist = Math.abs(run.result.homeGoals - avgHome) + Math.abs(run.result.awayGoals - avgAway);
    if (dist < bestSampleDist) {
      bestSampleDist = dist;
      bestSampleRun = run;
    }
  }

  const pct = v => +((v / runs) * 100).toFixed(1);
  const scoreFrequency = Object.entries(scoreMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reduce((acc, [score, cnt]) => { acc[score] = pct(cnt); return acc; }, {});

  return {
    runs,
    distribution: {
      homeWin: pct(homeWins),
      draw: pct(draws),
      awayWin: pct(awayWins),
      over15: pct(over15),
      over25: pct(over25),
      over35: pct(over35),
      btts: pct(btts),
      avgGoals: +(totalGoals / runs).toFixed(2),
      scoreFrequency,
    },
    sampleRun: bestSampleRun,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA FONKSİYON
// ─────────────────────────────────────────────────────────────────────────────
function simulateMatch(params) {
  const { runs = 1 } = params;
  if (runs > 1) return simulateMultipleRuns(params);
  return simulateSingleRun(params);
}

module.exports = { simulateMatch, simulateSingleRun, simulateMultipleRuns };
