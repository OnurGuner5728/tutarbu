'use strict';
/**
 * learning/fingerprint.js — Maç davranışsal-kondisyon vektörü.
 *
 * Halihazırda hesaplanmış metrik matrisi, baseline ve Poisson lambda'larından
 * türetilir. Ek API çağrısı YOKTUR. Hardcoded fallback yoktur — ilgili alan
 * yoksa null kalır ve k-NN dimensiyonu o örnek için devre dışı kalır.
 *
 * Vektörün her boyutu ham (z-score öncesi) saklanır. Normalizasyon similarity
 * engine içinde, tüm tarihsel havuzun istatistiklerinden dinamik olarak yapılır.
 *
 * Schema versiyonlama: yeni alan eklenirse SCHEMA_VERSION ↑.
 * Eski schema sürümü olan kayıtlar k-NN'e dahil edilebilir ama yalnızca
 * ortak boyutlar üzerinden mesafe hesaplanır.
 */

const SCHEMA_VERSION = 1;

const FIELDS = [
  'lambdaTotal',       // λH + λA  → beklenen toplam gol
  'lambdaDiff',        // λH - λA  → güç farkı (işaretli)
  'leagueAvgGoals',    // lig ortalama gol/maç
  'leagueCV',          // lig gol volatilitesi / ortalaması (predictability)
  'homeAdvantage',     // dinamik ev avantajı katsayısı
  'compositeGap',      // M156_home - M156_away (toplam takım kompozisyonu farkı)
  'defenseGap',        // M157_home - M157_away (savunma kompozisyonu farkı)
  'shortFormGap',      // M046_home - M046_away
  'longFormGap',       // M047_home - M047_away
  'restDayGap',        // homeRestDays - awayRestDays
  'fatigueGap',        // awayFatigue - homeFatigue (pozitif = ev avantajı)
  'h2hHomeBias',       // shared.h2h.homeWinRate gibi proxy (varsa)
  'refereeCardRate',   // hakem maç başına ortalama kart (varsa)
  'leagueDrawRate',    // lig X oranı (drawTendency)
  'totalGoalsCV',      // ligin toplam-gol varyansı (overdispersion proxy)
];

function num(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeDiff(a, b) {
  const ax = num(a), bx = num(b);
  if (ax == null || bx == null) return null;
  return ax - bx;
}

/**
 * @param {object} ctx
 * @param {object} ctx.metricsResult   calculateAllMetrics() çıktısı
 * @param {object} ctx.baseline        getDynamicBaseline() çıktısı (ek alanlar dahil)
 * @param {object} ctx.poissonResult   {lambdaHome, lambdaAway, ...}
 * @returns {{vector: object, schemaVersion: number, dimsAvailable: number}}
 */
function buildFingerprint({ metricsResult, baseline, poissonResult }) {
  const home = metricsResult?.home || {};
  const away = metricsResult?.away || {};
  const shared = metricsResult?.shared || {};

  const lambdaHome = num(poissonResult?.lambdaHome);
  const lambdaAway = num(poissonResult?.lambdaAway);

  const lambdaTotal = (lambdaHome != null && lambdaAway != null)
    ? lambdaHome + lambdaAway : null;
  const lambdaDiff  = (lambdaHome != null && lambdaAway != null)
    ? lambdaHome - lambdaAway : null;

  const leagueAvgGoals = num(baseline?.leagueAvgGoals);
  const leagueVol      = num(baseline?.leagueGoalVolatility);
  const leagueCV = (leagueAvgGoals != null && leagueAvgGoals > 0 && leagueVol != null)
    ? leagueVol / leagueAvgGoals : null;

  const homeAdvantage = num(metricsResult?.dynamicHomeAdvantage);

  const compositeGap = safeDiff(home?.compositeScores?.M156, away?.compositeScores?.M156);
  const defenseGap   = safeDiff(home?.compositeScores?.M157, away?.compositeScores?.M157);

  // Form: M046 (short), M047 (long). Takım form metric'leri team-form modülünden gelir.
  const shortFormGap = safeDiff(home?.form?.M046, away?.form?.M046);
  const longFormGap  = safeDiff(home?.form?.M047, away?.form?.M047);

  const restDayGap = safeDiff(baseline?.homeRestDays, baseline?.awayRestDays);
  const fatigueGap = safeDiff(baseline?.awayFatigue, baseline?.homeFatigue);

  // H2H proxy: shared.h2h içinde bulunan home-bias indikatörü.
  // Olası alanlar: M???. Henüz garanti bir alan yok — null bırakıp veri akarsa zenginleştirilir.
  let h2hHomeBias = null;
  const h2h = shared?.h2h || {};
  // M080 ailesi h2h'a ait (homeWinRate, awayWinRate, drawRate, vs.) — varsa kullan
  if (h2h.homeWinRate != null && h2h.awayWinRate != null) {
    h2hHomeBias = num(h2h.homeWinRate) - num(h2h.awayWinRate);
  } else if (typeof h2h.M080 === 'number' && typeof h2h.M082 === 'number') {
    h2hHomeBias = h2h.M080 - h2h.M082;
  }

  // Hakem kart profili: shared.referee.* — yoksa null
  const refereeCardRate = num(shared?.referee?.cardsPerMatch
    ?? shared?.referee?.M120
    ?? shared?.referee?.avgCards);

  const leagueDrawRate = num(metricsResult?.leagueFingerprint?.leagueDrawRate
    ?? baseline?.drawTendency);

  // Toplam gol CV proxy: leagueCV zaten yukarıda. totalGoalsCV ayrıca
  // homeScoreProfile/awayScoreProfile birleşik varyansından türetilebilir.
  const hN = num(metricsResult?.homeScoreProfile?.n) || 0;
  const aN = num(metricsResult?.awayScoreProfile?.n) || 0;
  const hVar = num(metricsResult?.homeScoreProfile?.variance);
  const aVar = num(metricsResult?.awayScoreProfile?.variance);
  let totalGoalsCV = null;
  if (hVar != null && aVar != null && lambdaTotal != null && lambdaTotal > 0
      && (hN + aN) > 0) {
    const pooledVar = (hVar * hN + aVar * aN) / (hN + aN);
    totalGoalsCV = Math.sqrt(Math.max(0, pooledVar)) / lambdaTotal;
  }

  const vector = {
    lambdaTotal,
    lambdaDiff,
    leagueAvgGoals,
    leagueCV,
    homeAdvantage,
    compositeGap,
    defenseGap,
    shortFormGap,
    longFormGap,
    restDayGap,
    fatigueGap,
    h2hHomeBias,
    refereeCardRate,
    leagueDrawRate,
    totalGoalsCV,
  };

  let dimsAvailable = 0;
  for (const k of FIELDS) {
    if (vector[k] != null && Number.isFinite(vector[k])) dimsAvailable++;
  }

  return { vector, schemaVersion: SCHEMA_VERSION, dimsAvailable };
}

module.exports = {
  buildFingerprint,
  FIELDS,
  SCHEMA_VERSION,
};
