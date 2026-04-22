/**
 * Team Attack Metrics (M001–M025)
 * Takım hücum metrikleri — tamamı SofaScore API verisinden hesaplanır.
 * Hiçbir fallback/statik değer yoktur.
 */

const { extractTeamStats } = require('../engine/math-utils');

/**
 * @param {object} data - fetchAllMatchData() çıktısı
 * @param {string} side - 'home' | 'away'
 * @returns {object} M001-M025 metrikleri
 */
function calculateTeamAttackMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const lastEvents = isHome ? data.homeLastEvents : data.awayLastEvents;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
  const teamSeasonStats = isHome ? data.homeTeamSeasonStats : data.awayTeamSeasonStats;

  // Son 20 maçtan bitmiş olanları al
  const finishedEvents = (lastEvents || []).filter(e => e.status?.type === 'finished');
  const last20 = finishedEvents.slice(0, 20);
  const totalMatches = last20.length;

  if (totalMatches === 0) {
    return createEmptyAttackMetrics();
  }

  // ── M001: Maç Başı Atılan Gol Ortalaması ──
  let totalGoalsScored = 0, m001ValidMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const score = isEvHome
      ? (ev.homeScore?.current ?? ev.homeScore?.display ?? null)
      : (ev.awayScore?.current ?? ev.awayScore?.display ?? null);
    if (score == null) continue;
    totalGoalsScored += score;
    m001ValidMatches++;
  }
  const M001 = m001ValidMatches > 0 ? totalGoalsScored / m001ValidMatches : null;

  // ── M002: Konum Gol/Maç (Ev/Dep) ──
  let locationGoals = 0, locationMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    if (isEvHome === isHome) {
      const score = isHome ? (ev.homeScore?.current ?? ev.homeScore?.display ?? null)
        : (ev.awayScore?.current ?? ev.awayScore?.display ?? null);
      if (score == null) continue;
      locationGoals += score;
      locationMatches++;
    }
  }
  const M002 = locationMatches > 0 ? locationGoals / locationMatches : null;

  // ── M003-M010: Dakika Bazlı Gol Dağılımı ──
  const goalsByPeriod = { '0-15': 0, '16-30': 0, '31-45': 0, '46-60': 0, '61-75': 0, '76-90': 0 };
  let totalGoalsFromIncidents = 0;
  let firstHalfGoals = 0, secondHalfGoals = 0;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome !== isMatchHome) continue;
      totalGoalsFromIncidents++;
      const minute = inc.time;
      if (minute == null) continue;
      if (minute <= 45) firstHalfGoals++;
      else secondHalfGoals++;
      if (minute <= 15) goalsByPeriod['0-15']++;
      else if (minute <= 30) goalsByPeriod['16-30']++;
      else if (minute <= 45) goalsByPeriod['31-45']++;
      else if (minute <= 60) goalsByPeriod['46-60']++;
      else if (minute <= 75) goalsByPeriod['61-75']++;
      else goalsByPeriod['76-90']++;
    }
  }

  const recentMatchCount = recentDetails.length;
  const M003 = recentMatchCount > 0 ? firstHalfGoals / recentMatchCount : null;
  const M004 = recentMatchCount > 0 ? secondHalfGoals / recentMatchCount : null;
  const M005 = totalGoalsFromIncidents > 0 ? (goalsByPeriod['0-15'] / totalGoalsFromIncidents) * 100 : null;
  const M006 = totalGoalsFromIncidents > 0 ? (goalsByPeriod['16-30'] / totalGoalsFromIncidents) * 100 : null;
  const M007 = totalGoalsFromIncidents > 0 ? (goalsByPeriod['31-45'] / totalGoalsFromIncidents) * 100 : null;
  const M008 = totalGoalsFromIncidents > 0 ? (goalsByPeriod['46-60'] / totalGoalsFromIncidents) * 100 : null;
  const M009 = totalGoalsFromIncidents > 0 ? (goalsByPeriod['61-75'] / totalGoalsFromIncidents) * 100 : null;
  const M010 = totalGoalsFromIncidents > 0 ? (goalsByPeriod['76-90'] / totalGoalsFromIncidents) * 100 : null;

  // --- Unified Stat Helper ---
  const unifiedStat = (key, extractKey = key) => {
    let total = 0, count = 0;
    for (const match of recentDetails) {
      const ts = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
      if (ts && ts[extractKey] != null) {
        total += ts[extractKey];
        count++;
      }
    }
    if (count > 0) return total / count;
    const sVal = teamSeasonStats?.statistics?.[extractKey] ?? teamSeasonStats?.[extractKey];
    const sMatches = teamSeasonStats?.statistics?.matches ?? teamSeasonStats?.matches;
    if (sVal != null && sMatches > 0) {
      if (extractKey.toLowerCase().includes('percentage') || extractKey.toLowerCase().includes('rating')) return sVal;
      return sVal / sMatches;
    }
    return null;
  };

  // ── M011-M014: Şut ve İsabetli Şut Metrikleri ──
  let totalShotsFound = 0, totalShotsMatchesFound = 0;
  let totalOnTargetFound = 0, totalOnTargetMatchesFound = 0;
  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      if (stats.totalShots != null) { totalShotsFound += stats.totalShots; totalShotsMatchesFound++; }
      if (stats.shotsOnTarget != null) { totalOnTargetFound += stats.shotsOnTarget; totalOnTargetMatchesFound++; }
    }
  }

  const M011 = totalShotsFound > 0 ? Math.min((totalGoalsFromIncidents / totalShotsFound) * 100, 100) : null;
  const M012 = totalOnTargetFound > 0 ? Math.min((totalGoalsFromIncidents / totalOnTargetFound) * 100, 100) : null;
  const M013 = totalShotsMatchesFound > 0 ? (totalShotsFound / totalShotsMatchesFound) : unifiedStat('shots', 'shots');
  const M014 = totalOnTargetMatchesFound > 0 ? (totalOnTargetFound / totalOnTargetMatchesFound) : unifiedStat('shotsOnTarget', 'shotsOnTarget');

  // ── M015-M016: xG Metrikleri ──
  let totalXG = 0;
  let matchesWithXG = 0;

  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let matchXG = 0;

    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome && shot.xg != null) {
        matchXG += shot.xg;
      }
    }

    if (shotmapData.length > 0) {
      totalXG += matchXG;
      matchesWithXG++;
    }
  }

  const M015 = matchesWithXG > 0 ? totalXG / matchesWithXG : null;
  const M016 = totalXG > 0 ? totalGoalsFromIncidents / totalXG : null;

  // ── M017-M018: Büyük Şans (Big Chances) ──
  let totalBigChances = 0, totalBigChancesScored = 0, bigChancesMatches = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats && stats.bigChances != null) {
      totalBigChances += stats.bigChances;
      if (stats.bigChancesScored != null) totalBigChancesScored += stats.bigChancesScored;
      bigChancesMatches++;
    }
  }

  const M017 = bigChancesMatches > 0
    ? totalBigChances / bigChancesMatches
    : unifiedStat('bigChances', 'bigChances');
  const M018 = totalBigChances > 0 ? Math.min((totalBigChancesScored / totalBigChances) * 100, 100) : unifiedStat('bigChancesScoredPercentage', 'bigChancesScoredPercentage');

  // ── M019-M020: Penaltı Metrikleri ──
  let penaltiesWon = 0;
  let penaltiesScored = 0;
  let penaltiesTaken = 0;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.isHome !== isMatchHome) continue;
      if (inc.incidentType === 'goal' && inc.incidentClass === 'penalty') {
        penaltiesWon++;
        penaltiesScored++;
        penaltiesTaken++;
      }
      if (inc.incidentType === 'goal' && inc.incidentClass === 'penaltyMissed') {
        penaltiesWon++;
        penaltiesTaken++;
      }
    }

  }

  const M019 = recentMatchCount > 0 ? penaltiesWon / recentMatchCount : null;
  const M020 = penaltiesTaken > 0 ? (penaltiesScored / penaltiesTaken) * 100 : null;

  // ── M021: Hücum Baskı İndeksi (Graph'ten) ──
  let totalPositivePressure = 0;
  let pressureMatches = 0;

  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    if (graphPoints.length > 0) {
      let positiveSum = 0;
      let positiveCount = 0;

      for (const point of graphPoints) {
        const value = point.value;
        if (value == null) continue;
        // Ev sahibi için pozitif, deplasman için negatif baskı
        const teamPressure = isMatchHome ? value : -value;
        if (teamPressure > 0) {
          positiveSum += teamPressure;
          positiveCount++;
        }
      }

      if (positiveCount > 0) {
        totalPositivePressure += positiveSum / positiveCount;
        pressureMatches++;
      }
    }
  }

  const M021 = pressureMatches > 0
    ? Math.min(Math.max(totalPositivePressure / pressureMatches, 0), 100) : null;

  // ── M022-M023: Korner Metrikleri ──
  let totalCorners = 0, cornersMatches = 0;
  let cornerGoalsCount = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats && stats.cornerKicks != null) {
      totalCorners += stats.cornerKicks;
      cornersMatches++;
    }
    // Kornerden gol tespiti — shotmap "situation" bilgisi kullanılıyor
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome && shot.situation === 'corner' && shot.isGoal === true) {
        cornerGoalsCount++;
      }
    }
  }

  // M022: Maç başı korner — recentDetails yoksa sezon istatistiğinden hesapla
  const M022 = cornersMatches > 0
    ? totalCorners / cornersMatches
    : unifiedStat('corners', 'corners');
  const M023 = totalCorners > 0 ? (cornerGoalsCount / totalCorners) * 100 : null;

  // ── M024: Serbest Vuruş Gol Oranı ──
  let freeKickGoals = 0;
  let totalFreeKicks = 0;

  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome && shot.situation === 'setPiece') {
        totalFreeKicks++;
        if (shot.isGoal === true) freeKickGoals++;
      }
    }
  }

  const M024 = totalFreeKicks > 0
    ? (freeKickGoals / totalFreeKicks) * 100
    : (unifiedStat('freeKickGoals', 'freeKickGoals') != null && unifiedStat('freeKickShots', 'freeKickShots') > 0
        ? (unifiedStat('freeKickGoals', 'freeKickGoals') / unifiedStat('freeKickShots', 'freeKickShots')) * 100
        : null);

  // ── M025: Hücum Üçüncü Bölge Pas Başarısı ──
  let totalAccFinalThird = 0;
  let totalFinalThird = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      if (stats.accuratePassesFinalThird != null) totalAccFinalThird += stats.accuratePassesFinalThird;
      if (stats.totalPassesFinalThird != null) totalFinalThird += stats.totalPassesFinalThird;
    }
  }

  const M025 = totalFinalThird > 0 ? Math.min((totalAccFinalThird / totalFinalThird) * 100, 100) : null;

  // ── M025b: Set Piece (Korner + Serbest Vuruş) Gol Etkinliği ──
  // Shotmap situation alanından korner/set-piece gollerini tespit et
  let setPieceGoals = 0;
  let totalGoalsForSP = 0;

  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome) continue;
      if (!shot.isGoal) continue;
      totalGoalsForSP++;
      if (shot.situation === 'corner' || shot.situation === 'setPiece' || shot.situation === 'freekick') {
        setPieceGoals++;
      }
    }
  }
  const M025b = totalGoalsForSP > 0 ? (setPieceGoals / totalGoalsForSP) * 100 : null;

  // ── M025c: Korner Başına Tehlike Oranı ──
  // extractTeamStats zaten period='ALL' filtrelemesini yapıyor
  let totalCornersForM025c = 0;
  let cornerMatchCount = 0;
  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats && stats.cornerKicks != null) {
      totalCornersForM025c += stats.cornerKicks;
      cornerMatchCount++;
    }
  }
  const M025c = cornerMatchCount > 0 ? totalCornersForM025c / cornerMatchCount : null;

  return {
    M001, M002, M003, M004, M005, M006, M007, M008, M009, M010,
    M011, M012, M013, M014, M015, M016, M017, M018, M019, M020,
    M021, M022, M023, M024, M025, M025b, M025c,
    // --- New Advanced Metrics ---
    M177: teamSeasonStats?.statistics?.accurateOppositionHalfPassesPercentage ?? teamSeasonStats?.accurateOppositionHalfPassesPercentage ?? null,
    M179: (M015 && M015 > 0) ? M001 / M015 : null,
    M186: last20.length >= 2 ? (
      (isHome ? (last20[0].homeScore?.current - last20[0].awayScore?.current) : (last20[0].awayScore?.current - last20[0].homeScore?.current)) -
      (isHome ? (last20[1].homeScore?.current - last20[1].awayScore?.current) : (last20[1].awayScore?.current - last20[1].homeScore?.current))
    ) : null,
    _matchCount: totalMatches,
    _meta: {
      totalMatchesAnalyzed: totalMatches,
      recentMatchesDeepDive: recentMatchCount,
      totalGoalsScored,
      totalGoalsFromIncidents,
    }
  };
}

function createEmptyAttackMetrics() {
  const metrics = {};
  for (let i = 1; i <= 25; i++) {
    metrics[`M${String(i).padStart(3, '0')}`] = null;
  }
  metrics.M025b = null;
  metrics.M025c = null;
  metrics._meta = { totalMatchesAnalyzed: 0, error: 'No finished matches found' };
  return metrics;
}

module.exports = { calculateTeamAttackMetrics };
