/**
 * match-context.js — Ortak Maç Bağlamı Hazırlama
 *
 * server.js'deki predict, workshop, simulate ve backtest endpointlerinde
 * tekrar eden mantığı tek bir modülde toplar:
 *   - Data klonlama & lineup uygulama
 *   - LQR (Lineup Quality Ratio)
 *   - ZQM (Zone Quality Ratios)
 *   - DBW (Dynamic Block Weights)
 *   - Metrics hesaplama
 *   - Baseline oluşturma & league params enjeksiyonu
 *   - PVKD (Position-based Market Value Breakdown)
 *   - GK integrity kontrolü
 */

'use strict';

const { calculateAllMetrics } = require('./metric-calculator');
const { getDynamicBaseline } = require('./dynamic-baseline');
const { calculateDynamicRating } = require('./player-rating-utils');
const { computeZoneQualityRatios, computeDynamicBlockWeights } = require('./lineup-impact');
const { computePositionMVBreakdown } = require('./quality-factors');

// ── Yardımcı Fonksiyonlar ────────────────────────────────────────────────

/**
 * İlk 11 starter'ın ortalama dinamik ratingini hesaplar.
 */
function computeAvgRating(players) {
  if (!players?.length) return null;
  const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
  if (!starters.length) return null;
  return starters.reduce((s, p) => s + calculateDynamicRating(p.player || p, p.assignedPosition || null), 0) / starters.length;
}

/**
 * Kaleci pozisyonunda gerçek kaleci olup olmadığını kontrol eder.
 * false dönerse LQR'ye %30 ek ceza uygulanır.
 */
function checkGKIntegrity(players) {
  if (!players?.length) return true;
  const starters = players.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
  const gkSlotPlayer = starters.find(p => {
    const assigned = (p.assignedPosition || '').toUpperCase()[0];
    const native = (p.player?.position || '').toUpperCase()[0];
    return assigned === 'G' || (!assigned && native === 'G');
  });
  if (!gkSlotPlayer) return false;
  const nativePos = (gkSlotPlayer.player?.position || '').toUpperCase()[0];
  return nativePos === 'G';
}

/**
 * Metrik tarafını (home/away) düz bir { M001: value, ... } map'ine çevirir.
 */
function flattenMetricSide(side) {
  const result = {};
  const groups = Object.values(side);
  for (const group of groups) {
    if (group && typeof group === 'object') {
      for (const [key, val] of Object.entries(group)) {
        if (/^M\d{3}[a-z]?$/i.test(key)) result[key] = val;
      }
    }
  }
  return result;
}

/**
 * Lig fizik parametrelerini baseline'a enjekte eder.
 */
function injectLeagueParams(baseline, metrics) {
  baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
  baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
  baseline.medianGoalRate = metrics.meta?.medianGoalRate ?? null;
  baseline.leagueTeamCount = metrics.meta?.leagueTeamCount ?? null;
  baseline.ptsCV = metrics.meta?.ptsCV ?? null;
  baseline.normMinRatio = metrics.meta?.normMinRatio ?? null;
  baseline.normMaxRatio = metrics.meta?.normMaxRatio ?? null;
  baseline._htLeadContinuation = metrics.dynamicLeagueAvgs?._htLeadContinuation ?? null;
  baseline._htDrawToWinRate = metrics.dynamicLeagueAvgs?._htDrawToWinRate ?? null;
  baseline._htReversalRate = metrics.dynamicLeagueAvgs?._htReversalRate ?? null;
}

/**
 * PVKD — Mevki Bazlı Piyasa Değeri Kalite Düzeltmesi
 */
function injectPVKD(baseline, data, modifiedLineup) {
  const pvkdHomeSrc = (modifiedLineup?.home && data.lineups?.home)
    ? { players: data.lineups.home.players } : (data.homePlayers || []);
  const pvkdAwaySrc = (modifiedLineup?.away && data.lineups?.away)
    ? { players: data.lineups.away.players } : (data.awayPlayers || []);
  baseline.homeMVBreakdown = computePositionMVBreakdown(pvkdHomeSrc);
  baseline.awayMVBreakdown = computePositionMVBreakdown(pvkdAwaySrc);
}

/**
 * LQR — Lineup Quality Ratio hesaplama ve baseline'a enjeksiyon.
 * modifiedLineup yoksa ratio 1.0 olarak atanır.
 */
function injectLQR(baseline, cachedData, data, modifiedLineup) {
  if (modifiedLineup) {
    const origH = computeAvgRating(cachedData.lineups?.home?.players || []);
    const origA = computeAvgRating(cachedData.lineups?.away?.players || []);
    const modH = computeAvgRating(data.lineups?.home?.players || []);
    const modA = computeAvgRating(data.lineups?.away?.players || []);
    baseline.homeLineupQualityRatio = (origH && modH) ? modH / origH : 1.0;
    baseline.awayLineupQualityRatio = (origA && modA) ? modA / origA : 1.0;
  } else {
    baseline.homeLineupQualityRatio = 1.0;
    baseline.awayLineupQualityRatio = 1.0;
  }
}

/**
 * ZQM — Zone Quality Ratios hesaplama ve baseline'a enjeksiyon.
 */
function injectZQM(baseline, cachedData, data, modifiedLineup) {
  baseline.homeDynamicBlockWeights = computeDynamicBlockWeights(cachedData.lineups?.home?.players || []);
  baseline.awayDynamicBlockWeights = computeDynamicBlockWeights(cachedData.lineups?.away?.players || []);
  if (modifiedLineup) {
    baseline.homeZoneQualityRatios = computeZoneQualityRatios(
      cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], calculateDynamicRating
    );
    baseline.awayZoneQualityRatios = computeZoneQualityRatios(
      cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], calculateDynamicRating
    );
  }
}

/**
 * DBW — Dynamic Block Weights'ı data objesine enjekte eder (calculateAllMetrics'ten ÖNCE).
 */
function injectDBW(data, cachedData) {
  data._homeDynamicBlockWeights = computeDynamicBlockWeights(cachedData.lineups?.home?.players || []);
  data._awayDynamicBlockWeights = computeDynamicBlockWeights(cachedData.lineups?.away?.players || []);
}

/**
 * GK Integrity kontrolü — kaleci pozisyonunda gerçek kaleci yoksa LQR'ye %30 ek ceza.
 */
function applyGKIntegrityPenalty(baseline, data, modifiedLineup, logPrefix) {
  if (!modifiedLineup) return;
  if (modifiedLineup.home && !checkGKIntegrity(data.lineups?.home?.players)) {
    baseline.homeLineupQualityRatio *= 0.70;
    console.log(`[${logPrefix}] ⚠️ Ev sahibi kaleci yok/yanlış mevki! LQR ek ceza: ${baseline.homeLineupQualityRatio.toFixed(3)}`);
  }
  if (modifiedLineup.away && !checkGKIntegrity(data.lineups?.away?.players)) {
    baseline.awayLineupQualityRatio *= 0.70;
    console.log(`[${logPrefix}] ⚠️ Deplasman kaleci yok/yanlış mevki! LQR ek ceza: ${baseline.awayLineupQualityRatio.toFixed(3)}`);
  }
}

/**
 * LQR pre-metrics — calculateAllMetrics'ten ÖNCE data objesine enjekte edilir.
 * advanced-derived.js lambda'yı düzeltecek.
 */
function injectLQRPreMetrics(data, cachedData, modifiedLineup, logPrefix) {
  if (!modifiedLineup) return;
  const origH = computeAvgRating(cachedData.lineups?.home?.players || []);
  const origA = computeAvgRating(cachedData.lineups?.away?.players || []);
  const modH = computeAvgRating(data.lineups?.home?.players || []);
  const modA = computeAvgRating(data.lineups?.away?.players || []);
  data._homeLineupQualityRatio = (origH && modH) ? modH / origH : 1.0;
  data._awayLineupQualityRatio = (origA && modA) ? modA / origA : 1.0;
  console.log(`[${logPrefix}] LQR pre-metrics: home=${data._homeLineupQualityRatio.toFixed(3)}, away=${data._awayLineupQualityRatio.toFixed(3)}`);

  // ZQM pre-metrics
  data._homeZoneQualityRatios = computeZoneQualityRatios(
    cachedData.lineups?.home?.players || [], data.lineups?.home?.players || [], calculateDynamicRating
  );
  data._awayZoneQualityRatios = computeZoneQualityRatios(
    cachedData.lineups?.away?.players || [], data.lineups?.away?.players || [], calculateDynamicRating
  );
}

// ── Ana Pipeline ─────────────────────────────────────────────────────────

/**
 * Tüm ortak pipeline'ı tek çağrıyla çalıştırır.
 *
 * @param {object} opts
 * @param {object} opts.cachedData    - Ham veri (cache'ten veya fetchAllMatchData'dan)
 * @param {object} [opts.modifiedLineup] - Workshop lineup değişiklikleri (null = yok)
 * @param {boolean} [opts.forBacktest]   - true ise LQR/ZQM pre-metrics atlanır (modified lineup yok)
 * @param {string} [opts.logPrefix]      - Log mesajları için etiket ('API PREDICT', 'API WORKSHOP', vb.)
 * @returns {{ data: object, metrics: object, baseline: object }}
 */
function prepareMatchContext({ cachedData, modifiedLineup, forBacktest = false, logPrefix = 'API' }) {
  // 1. Data klonlama & lineup uygulama
  const data = modifiedLineup ? structuredClone(cachedData) : (forBacktest ? cachedData : cachedData);
  if (modifiedLineup) {
    if (modifiedLineup.home && data.lineups?.home) data.lineups.home.players = modifiedLineup.home;
    if (modifiedLineup.away && data.lineups?.away) data.lineups.away.players = modifiedLineup.away;
  }

  // 2. LQR + ZQM pre-metrics (calculateAllMetrics'ten ÖNCE, data objesine enjekte)
  if (!forBacktest) {
    injectLQRPreMetrics(data, cachedData, modifiedLineup, logPrefix);
  }

  // 3. DBW (ORİJİNAL kadrodan)
  injectDBW(data, cachedData);

  // 4. Metrics
  const metrics = calculateAllMetrics(data);

  // 5. Baseline
  const baseline = getDynamicBaseline(data);

  // 6. League params enjeksiyonu
  injectLeagueParams(baseline, metrics);

  // 7. PVKD
  injectPVKD(baseline, data, modifiedLineup);

  // 8. LQR baseline enjeksiyonu
  injectLQR(baseline, cachedData, data, modifiedLineup);

  // 9. GK integrity
  applyGKIntegrityPenalty(baseline, data, modifiedLineup, logPrefix);

  // 10. ZQM baseline enjeksiyonu
  injectZQM(baseline, cachedData, data, modifiedLineup);

  if (modifiedLineup && baseline.homeZoneQualityRatios) {
    console.log(`[${logPrefix}] ZQM home: G=${baseline.homeZoneQualityRatios.G.toFixed(3)} D=${baseline.homeZoneQualityRatios.D.toFixed(3)} M=${baseline.homeZoneQualityRatios.M.toFixed(3)} F=${baseline.homeZoneQualityRatios.F.toFixed(3)}`);
    console.log(`[${logPrefix}] ZQM away: G=${baseline.awayZoneQualityRatios.G.toFixed(3)} D=${baseline.awayZoneQualityRatios.D.toFixed(3)} M=${baseline.awayZoneQualityRatios.M.toFixed(3)} F=${baseline.awayZoneQualityRatios.F.toFixed(3)}`);
  }

  if (modifiedLineup) {
    console.log(`[${logPrefix}] LQR: home=${baseline.homeLineupQualityRatio.toFixed(3)}, away=${baseline.awayLineupQualityRatio.toFixed(3)}`);
  }

  if (baseline.homeMVBreakdown) {
    console.log(`[${logPrefix}] PVKD Enjeksiyonu başarılı. home: ${baseline.homeMVBreakdown?.total}, away: ${baseline.awayMVBreakdown?.total}`);
  }

  return { data, metrics, baseline };
}

module.exports = {
  computeAvgRating,
  checkGKIntegrity,
  flattenMetricSide,
  injectLeagueParams,
  injectPVKD,
  injectLQR,
  injectZQM,
  injectDBW,
  prepareMatchContext,
};
