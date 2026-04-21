/**
 * Metric Calculator — Orchestrator
 * Tüm 168 metriği tek bir çağrıda hesaplar.
 * Dinamik lig ortalamaları league-averages.js ile hesaplanır.
 */

const { calculateTeamAttackMetrics } = require('../metrics/team-attack');
const { calculateTeamDefenseMetrics } = require('../metrics/team-defense');
const { calculateTeamFormMetrics } = require('../metrics/team-form');
const { calculatePlayerMetrics } = require('../metrics/player-performance');
const { calculateGoalkeeperMetrics } = require('../metrics/goalkeeper');
const { calculateRefereeMetrics } = require('../metrics/referee-impact');
const { calculateH2HMetrics } = require('../metrics/h2h-analysis');
const { calculateContextualMetrics } = require('../metrics/contextual');
const { calculateMomentumMetrics } = require('../metrics/momentum');
const { calculateAdvancedMetrics } = require('../metrics/advanced-derived');
const { computeAllLeagueAverages } = require('./league-averages');
const { computePositionMVBreakdown } = require('./quality-factors');
const { extractTeamScoreProfile, extractMatchScoreProfile } = require('./score-profile');
const { computeLeagueFingerprint } = require('./league-fingerprint');

/**
 * Tüm 168 metriği hesaplar.
 * @param {object} data - fetchAllMatchData çıktısı
 * @returns {object} Tüm metrikler + tahmin çıktısı
 */
function calculateAllMetrics(data) {
  console.log('[MetricCalculator] Calculating 168 metrics...');
  const startTime = Date.now();

  // ── Dinamik Lig Ortalamaları Hesapla ──────────────────────────────────────
  const leagueAvgResult = computeAllLeagueAverages(data);
  const dynamicAvgs = leagueAvgResult.averages;
  const dynamicHomeAdvantage = leagueAvgResult.dynamicHomeAdvantage;
  const dynamicTimeWindows = leagueAvgResult.dynamicTimeWindows;
  console.log(`[MetricCalculator] Dynamic league averages computed: ${Object.keys(dynamicAvgs).length} metrics`);

  // Bölüm A: Hücum (M001-M025) — Her iki takım
  const homeAttack = calculateTeamAttackMetrics(data, 'home');
  const awayAttack = calculateTeamAttackMetrics(data, 'away');

  // Bölüm B: Defans (M026-M045) — Her iki takım
  const homeDefense = calculateTeamDefenseMetrics(data, 'home');
  const awayDefense = calculateTeamDefenseMetrics(data, 'away');

  // Bölüm C: Form (M046-M065) — Her iki takım
  const homeForm = calculateTeamFormMetrics(data, 'home');
  const awayForm = calculateTeamFormMetrics(data, 'away');

  // Bölüm D: Oyuncu (M066-M095) — Her iki takım
  const homePlayer = calculatePlayerMetrics(data, 'home', dynamicAvgs);
  const awayPlayer = calculatePlayerMetrics(data, 'away', dynamicAvgs);

  // Bölüm E: Kaleci (M096-M108) — Her iki takım
  const homeGK = calculateGoalkeeperMetrics(data, 'home');
  const awayGK = calculateGoalkeeperMetrics(data, 'away');

  // Bölüm F: Hakem (M109-M118) — Paylaşılan
  const referee = calculateRefereeMetrics(data);

  // Bölüm G: H2H (M119-M130) — Paylaşılan
  const h2h = calculateH2HMetrics(data);

  // Bölüm H: Bağlamsal (M131-M145) — Paylaşılan
  const contextual = calculateContextualMetrics(data);

  // Bölüm I: Momentum (M146-M155) — Her iki takım
  const homeMomentum = calculateMomentumMetrics(data, 'home');
  const awayMomentum = calculateMomentumMetrics(data, 'away');

  // Bölüm J: Tüm metrikleri düzleştir (Dinamik Üniteler İçin)
  const homeFlat = { ...homeAttack, ...homeDefense, ...homeForm, ...homePlayer, ...homeGK, ...homeMomentum,
    M170: contextual.M170, // Leg (shared)
    M171: 5 - contextual.M171, // Agg Deficit (mapped with pedestal of 5)
    M172: contextual.M172, // Importance (Home)
    M174: contextual.M174, // PPG Ratio (Home based)
    M175: contextual.M175, // Rank Adv (Home based)
    // Yorgunluk + Pressing metrikleri — ev sahibi perspektifi
    M096b: homePlayer.M096b,         // Yorgunluk endeksi
    M177:  contextual.M177_home,     // Pressing yoğunluğu
    M178:  contextual.M178_home,     // Territorial control
    M179:  contextual.M179_home,     // Savunma hat yüksekliği
  };
  const awayFlat = { ...awayAttack, ...awayDefense, ...awayForm, ...awayPlayer, ...awayGK, ...awayMomentum,
    M170: contextual.M170,
    M171: 5 + contextual.M171, // Agg Deficit for away
    M172: contextual.M173,  // Importance (Away) => M172
    M174: (contextual.M174 > 0 ? 1 / contextual.M174 : null), // Inverted PPG Ratio
    M175: 100 - contextual.M175, // Inverted Rank Adv
    // Yorgunluk + Pressing metrikleri — deplasman perspektifi
    M096b: awayPlayer.M096b,
    M177:  contextual.M177_away,
    M178:  contextual.M178_away,
    M179:  contextual.M179_away,
  };
  const { M170, M171, M172, M173, M174, M175, ...contextualClean } = contextual;
  const sharedFlat = { ...referee, ...h2h, ...contextualClean };
  
  const allMetricIds = new Set([
     ...Object.keys(homeFlat), ...Object.keys(awayFlat), ...Object.keys(sharedFlat)
  ].filter(k => /^M[0-9]{3}[a-z]?$/i.test(k)));

  // Dinamik lig ortalaması — standings verisinden hesaplanır
  const leagueAvgGoals = computeLeagueAvgGoals(data.standingsTotal);
  const homeFormation = data.lineups?.home?.formation || null;
  const awayFormation = data.lineups?.away?.formation || null;

  // xG ortalamaları: context-aware (ev sahibi takım → HOME role, deplasman → AWAY role)
  // Yetersiz veri (<2 maç) durumunda genel ortalamaya (role=null) düşülür
  const MIN_XG_SAMPLES = 2;
  const homeXGHome = extractXGFromRecentMatches(data.homeRecentMatchDetails, data.homeTeamId, 'home');
  const homeXG = homeXGHome.sampleCount >= MIN_XG_SAMPLES
    ? homeXGHome
    : extractXGFromRecentMatches(data.homeRecentMatchDetails, data.homeTeamId, null);

  const awayXGAway = extractXGFromRecentMatches(data.awayRecentMatchDetails, data.awayTeamId, 'away');
  const awayXG = awayXGAway.sampleCount >= MIN_XG_SAMPLES
    ? awayXGAway
    : extractXGFromRecentMatches(data.awayRecentMatchDetails, data.awayTeamId, null);

  // Kadro piyasa değerleri — mevki bazlı lig kalitesi düzeltmesi için (PVKD)
  const homeMVBreakdown = computePositionMVBreakdown(data.homePlayers);
  const awayMVBreakdown = computePositionMVBreakdown(data.awayPlayers);

  // ── Standings-Based Home/Away Specific Goal Rates ──────────────────────────
  // En güvenilir veri kaynağı: SofaScore standingsHome (sadece evdeki maçlar tablosu) +
  // standingsAway (sadece deplasman maçlar tablosu). Takım-spesifik, tarafa özel.
  // Örn: Atletico evinde GF/match=2.75, GA/match=1.25 (sezon 4 maç)
  //      Barcelona deplasmanda GF/match=2.25, GA/match=2.25 (sezon 4 maç)
  const _homeRows = data.standingsHome?.standings?.[0]?.rows || [];
  const _awayRows = data.standingsAway?.standings?.[0]?.rows || [];
  const _hStRow = _homeRows.find(r => r.team?.id === data.homeTeamId);
  const _aStRow = _awayRows.find(r => r.team?.id === data.awayTeamId);
  const homeStGF = (_hStRow && _hStRow.matches > 0) ? _hStRow.scoresFor / _hStRow.matches : null;
  const homeStGA = (_hStRow && _hStRow.matches > 0) ? _hStRow.scoresAgainst / _hStRow.matches : null;
  const awayStGF = (_aStRow && _aStRow.matches > 0) ? _aStRow.scoresFor / _aStRow.matches : null;
  const awayStGA = (_aStRow && _aStRow.matches > 0) ? _aStRow.scoresAgainst / _aStRow.matches : null;
  // Örneklem sayısı — güvenirliğe oran verirken kullanılır
  const homeStMatches = _hStRow?.matches || 0;
  const awayStMatches = _aStRow?.matches || 0;

  // ── Takım Skor Profilleri (Score Fingerprint) ──────────────────────────────
  // Öncelik: konum-özel (ev/deplasman maçları). Yetersiz örneklem → takımın tüm maçları.
  // Her iki adım da gerçek API verisinden türer; statik default veya null fallback yoktur.
  const homeScoreProfile =
    extractTeamScoreProfile(data.homeLastEvents, data.homeTeamId, 'home', 20) ??
    extractTeamScoreProfile(data.homeLastEvents, data.homeTeamId, null, 20);
  const awayScoreProfile =
    extractTeamScoreProfile(data.awayLastEvents, data.awayTeamId, 'away', 20) ??
    extractTeamScoreProfile(data.awayLastEvents, data.awayTeamId, null, 20);
  // Eşleşme (H2H) skor parmak izi — iki takımın karşılıklı geçmişi (home-perspektif)
  const matchScoreProfile = extractMatchScoreProfile(data.h2hEvents, data.homeTeamId, data.awayTeamId, 10);

  // ── Lig Parmak İzi (League Fingerprint) ──────────────────────────────────
  // Havuz: homeLastEvents ∪ awayLastEvents ∪ h2hEvents — dedup + tournament filtre + temporal decay
  const leagueFingerprint = computeLeagueFingerprint(data);

  const advanced = calculateAdvancedMetrics({
    homeAttack, awayAttack, homeDefense, awayDefense,
    homeForm, awayForm, homePlayer, awayPlayer,
    homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum,
    leagueAvgGoals,
    homeFormation, awayFormation,
    homeMatchCount: data.homeLastEvents?.length || 0,
    awayMatchCount: data.awayLastEvents?.length || 0,
    // Add flattened data for unit calculations
    homeFlat, awayFlat, sharedFlat, allMetricIds,
    // Dinamik lig ortalamaları ve ev sahibi avantajı
    dynamicAvgs,
    dynamicHomeAdvantage,
    // xG verileri — Dixon-Coles lambda kalibrasyonu için
    homeXGScored:   homeXG.avgXGScored,
    homeXGConceded: homeXG.avgXGConceded,
    awayXGScored:   awayXG.avgXGScored,
    awayXGConceded: awayXG.avgXGConceded,
    // Standings home/away-specific goal rates — en güvenilir home advantage kaynağı
    homeStGF, homeStGA, awayStGF, awayStGA,
    homeStMatches, awayStMatches,
    // Dinamik lig fiziği: yoğunluk ve volatilite — veri yoksa null
    leaguePointDensity: leagueAvgResult.leaguePointSpread ?? null,
    leagueGoalVolatility: leagueAvgResult.leagueGoalVolatility ?? null,
    medianGoalRate: leagueAvgResult.medianGoalRate ?? null,
    leagueTeamCount: leagueAvgResult.leagueTeamCount ?? null,
    ptsCV: leagueAvgResult.ptsCV ?? null,
    normMinRatio: leagueAvgResult.normMinRatio ?? null,
    normMaxRatio: leagueAvgResult.normMaxRatio ?? null,
    leagueCompetitiveness: leagueAvgResult.leagueCompetitiveness ?? null,
    leagueHomeBias: leagueAvgResult.leagueHomeBias ?? null,
    leagueDrawTendency: leagueAvgResult.leagueDrawTendency ?? null,
    // Piyasa Değeri Kalite Düzeltmesi — mevki bazlı ligler arası kalibrasyon
    homeMVBreakdown,
    awayMVBreakdown,
    // Takım Skor Profilleri — Poisson blend için
    homeScoreProfile,
    awayScoreProfile,
    matchScoreProfile,
    // Lig Parmak İzi — blend'e lig dağılımı ekleme için
    leagueFingerprint,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[MetricCalculator] All metrics calculated in ${elapsed}s`);

  // Metrik sayısını doğrula
  const metricCount = countMetrics({
    homeAttack, awayAttack, homeDefense, awayDefense,
    homeForm, awayForm, homePlayer, awayPlayer,
    homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum, advanced,
  });

  const result = {
    home: {
      attack: homeAttack,
      defense: homeDefense,
      form: { ...homeForm, M170: homeFlat.M170, M171: homeFlat.M171, M172: homeFlat.M172, M174: homeFlat.M174, M175: homeFlat.M175 },
      player: homePlayer,
      goalkeeper: homeGK,
      momentum: homeMomentum,
      compositeScores: advanced.home,
    },
    away: {
      attack: awayAttack,
      defense: awayDefense,
      form: { ...awayForm, M170: awayFlat.M170, M171: awayFlat.M171, M172: awayFlat.M172, M174: awayFlat.M174, M175: awayFlat.M175 },
      player: awayPlayer,
      goalkeeper: awayGK,
      momentum: awayMomentum,
      compositeScores: advanced.away,
    },
    shared: {
      referee,
      h2h,
      contextual,
      sharedComposite: advanced.shared,
    },
    prediction: advanced.prediction,
    // Lig parmak izi — skor blend ve BTTS/OU kalibrasyon için
    leagueFingerprint,
    // Dinamik lig ortalamaları — simülasyon motoru ve UI tarafından kullanılır
    dynamicLeagueAvgs: dynamicAvgs,
    dynamicHomeAdvantage,
    dynamicTimeWindows,
    leagueAvgTraces: leagueAvgResult.traces,
    meta: {
      calculationTimeMs: Date.now() - startTime,
      totalMetricsCalculated: metricCount,
      dynamicAvgsCount: Object.keys(dynamicAvgs).length,
      eventId: data.eventId,
      tournamentId: data.tournamentId ?? data.event?.event?.tournament?.uniqueTournament?.id ?? null,
      homeTeam: data.event?.event?.homeTeam?.name,
      awayTeam: data.event?.event?.awayTeam?.name,
      timestamp: new Date().toISOString(),
      leaguePointDensity: leagueAvgResult.leaguePointSpread ?? null,
      leagueGoalVolatility: leagueAvgResult.leagueGoalVolatility ?? null,
      medianGoalRate: leagueAvgResult.medianGoalRate ?? null,
      leagueTeamCount: leagueAvgResult.leagueTeamCount ?? null,
      ptsCV: leagueAvgResult.ptsCV ?? null,
      normMinRatio: leagueAvgResult.normMinRatio ?? null,
      normMaxRatio: leagueAvgResult.normMaxRatio ?? null,
      leagueCompetitiveness: leagueAvgResult.leagueCompetitiveness ?? null,
      leagueHomeBias: leagueAvgResult.leagueHomeBias ?? null,
      leagueDrawTendency: leagueAvgResult.leagueDrawTendency ?? null,
      ...(contextual?._meta || {})
    }
  };

  // Phase 1 Observation: Metric Audit
  const { getMetricAuditSummary } = require('./audit-helper');
  result.metricAudit = getMetricAuditSummary(data, result);

  return result;
}

function countMetrics(groups) {
  let count = 0;
  const metricRegex = /^M[0-9]{3}[a-z]?$/i;
  for (const [key, group] of Object.entries(groups)) {
    if (typeof group !== 'object' || !group) continue;
    for (const [k, v] of Object.entries(group)) {
      if (metricRegex.test(k)) count++;
      if (k === 'home' || k === 'away') {
        for (const [kk] of Object.entries(v || {})) {
          if (metricRegex.test(kk)) count++;
        }
      }
    }
  }
  return count;
}

function computeLeagueAvgGoals(standingsTotal) {
  const rows = standingsTotal?.standings?.[0]?.rows || [];
  if (rows.length < 4) return null; // Yeterli veri yok, fallback kullanılmaz
  const totalGoals = rows.reduce((s, r) => s + (r.scoresFor || r.goalsFor || 0), 0);
  const totalGames = rows.reduce((s, r) => s + (r.matches ?? r.played ?? 0), 0);
  return totalGames > 0 ? totalGoals / totalGames : null;
}

/**
 * Son N maçın istatistik detaylarından takımın xG ortalamasını çıkarır.
 * Context-aware: role='home' → yalnızca ev sahibi olduğu maçlar,
 *                role='away' → yalnızca deplasman olduğu maçlar,
 *                role=null  → tüm maçlar (genel ortalama)
 *
 * Dixon-Coles için doğru kullanım:
 *   - Ev sahibi takım: role='home' (kendi sahasındaki xG performansı)
 *   - Deplasman takımı: role='away' (deplasmandaki xG performansı)
 *
 * @param {Array} recentMatchDetails - fetchRecentMatchDetails() çıktısı
 * @param {number} teamId - Takımın SofaScore ID'si
 * @param {'home'|'away'|null} role - Filtrelenecek rol (null = tümü)
 * @returns {{ avgXGScored: number|null, avgXGConceded: number|null, sampleCount: number }}
 */
function extractXGFromRecentMatches(recentMatchDetails, teamId, role = null) {
  if (!Array.isArray(recentMatchDetails) || recentMatchDetails.length === 0 || !teamId) {
    return { avgXGScored: null, avgXGConceded: null, sampleCount: 0 };
  }

  const samples = [];

  for (const matchDetail of recentMatchDetails) {
    const teamWasHome = matchDetail.homeTeam?.id === teamId;
    const teamWasAway = matchDetail.awayTeam?.id === teamId;

    // Rol filtresi
    if (role === 'home' && !teamWasHome) continue;
    if (role === 'away' && !teamWasAway) continue;
    if (!teamWasHome && !teamWasAway) continue; // takım bu maçta yoksa atla

    const stats = matchDetail.stats;
    if (!stats?.statistics) continue;

    // "ALL" period (tam maç) — yoksa ilk periyot
    const allPeriod = stats.statistics.find(p => p.period === 'ALL') || stats.statistics[0];
    if (!allPeriod) continue;

    // Tüm grupları tara, expectedGoals key'ini bul
    let xgItem = null;
    for (const group of (allPeriod.groups || [])) {
      for (const item of (group.statisticsItems || [])) {
        if (item.key === 'expectedGoals') { xgItem = item; break; }
      }
      if (xgItem) break;
    }
    if (!xgItem) continue;

    const homeValue = xgItem.homeValue;
    const awayValue = xgItem.awayValue;
    if (homeValue == null || awayValue == null) continue;

    const xgScored    = teamWasHome ? homeValue : awayValue;
    const xgConceded  = teamWasHome ? awayValue : homeValue;

    samples.push({ xgScored, xgConceded });
  }

  if (samples.length === 0) return { avgXGScored: null, avgXGConceded: null, sampleCount: 0 };

  const avgXGScored   = samples.reduce((s, v) => s + v.xgScored, 0)   / samples.length;
  const avgXGConceded = samples.reduce((s, v) => s + v.xgConceded, 0) / samples.length;

  return {
    avgXGScored:   Math.round(avgXGScored   * 100) / 100,
    avgXGConceded: Math.round(avgXGConceded * 100) / 100,
    sampleCount: samples.length,
  };
}

module.exports = { calculateAllMetrics };
