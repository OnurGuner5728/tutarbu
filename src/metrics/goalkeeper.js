/**
 * Goalkeeper Metrics (M096–M108)
 * Kaleci performansı — kurtarış, xG bazlı verim, penaltı, dağıtım, hata.
 */

function calculateGoalkeeperMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const playerStats = isHome ? data.homePlayerStats : data.awayPlayerStats;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
  const lastEvents = (isHome ? data.homeLastEvents : data.awayLastEvents) || [];

  // Kaleci bul
  const gk = playerStats?.find(p => p.position === 'G' || p.position === 'GK');
  if (!gk) return createEmptyGKMetrics();

  const gkStats = gk.seasonStats?.statistics || {};
  const finishedEvents = lastEvents.filter(e => e.status?.type === 'finished');

  // ── M096: Kurtarış Yüzdesi ──
  const saves = gkStats.saves || 0;
  const goalsConceded = gkStats.goalsConceded || gkStats.goalsAgainst || 0;
  const M096 = (saves + goalsConceded) > 0 ? (saves / (saves + goalsConceded)) * 100 : 0;

  // ── M097: Maç Başı Kurtarış Ortalaması ──
  const appearances = gkStats.appearances || gkStats.matchesPlayed || 1;
  const M097 = saves / appearances;

  // ── M098: xG Bazlı Kurtarış Verimi ──
  let totalOpponentXG = 0, totalActualConceded = 0, xgMatches = 0;
  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let oppXG = 0;

    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome && shot.xg != null) oppXG += shot.xg;
    }
    if (shotmapData.length > 0) {
      totalOpponentXG += oppXG;
      const conceded = isMatchHome
        ? (match.awayScore?.current || 0) : (match.homeScore?.current || 0);
      totalActualConceded += conceded;
      xgMatches++;
    }
  }
  const M098 = totalOpponentXG > 0
    ? (totalOpponentXG - totalActualConceded) / totalOpponentXG : 0;

  // ── M099: Penaltı Kurtarma Oranı ──
  let penaltiesFaced = 0, penaltiesSaved = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const inc of incidents) {
      if (inc.isHome === isMatchHome) continue;
      if (inc.incidentClass === 'penalty' || inc.incidentClass === 'penaltyMissed') {
        penaltiesFaced++;
        if (inc.incidentClass === 'penaltyMissed') penaltiesSaved++;
      }
    }
  }
  const M099 = penaltiesFaced > 0 ? (penaltiesSaved / penaltiesFaced) * 100 : 0;

  // ── M100: 1v1 Kurtarma (Big Chance) ──
  const bigChancesSaved = gkStats.savedShotsFromInsideTheBox || gkStats.bigChancesSaved || 0;
  const bigChancesFaced = bigChancesSaved + (gkStats.goalsConcededInsideTheBox || goalsConceded);
  const M100 = bigChancesFaced > 0 ? (bigChancesSaved / bigChancesFaced) * 100 : 0;

  // ── M101: Kaleci Dağıtım Başarısı ──
  const gkAccPass = gkStats.accuratePasses || gkStats.accuratePassesPercentage || 0;
  const gkTotalPass = gkStats.totalPasses || 1;
  const M101 = gkTotalPass > 1 ? (gkAccPass / gkTotalPass) * 100 : gkAccPass;

  // ── M102: Kaleci Rating Ortalaması ──
  const M102 = gkStats.rating || 0;

  // ── M103: Clean Sheet Streak ──
  let cleanStreak = 0;
  for (const ev of finishedEvents) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const conceded = isEvHome
      ? (ev.awayScore?.current || ev.awayScore?.display || 0)
      : (ev.homeScore?.current || ev.homeScore?.display || 0);
    if (conceded === 0) cleanStreak++;
    else break;
  }
  const M103 = cleanStreak;

  // ── M104: Uzak Mesafe Şut Kurtarma ──
  let outsideSaves = 0, outsideShots = 0;
  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome) continue;
      const x = shot.draw?.start?.x || 0;
      if (x > 20) { // ceza sahası dışı (yaklaşık)
        outsideShots++;
        if (shot.shotType !== 'goal') outsideSaves++;
      }
    }
  }
  const M104 = outsideShots > 0 ? (outsideSaves / outsideShots) * 100 : 0;

  // ── M105: Kaleci Hata Sonucu Gol ──
  const M105 = gkStats.errorLeadToGoal || gkStats.errorsLeadingToGoal || 0;

  // ── M106: Kaleci Nitelik Skoru ──
  const gkAttrs = gk.attributes?.averageAttributeOverviews?.[0];
  const M106 = gkAttrs
    ? ((gkAttrs.attacking || 0) + (gkAttrs.technical || 0) + (gkAttrs.defending || 0)) / 3
    : M102 * 10;

  // ── M107: Hava Hakimiyeti ──
  const punches = gkStats.punches || 0;
  const highClaims = gkStats.highClaims || gkStats.totalHighClaim || 0;
  const M107 = appearances > 0 ? (punches + highClaims) / appearances : 0;

  // ── M108: Kaleci Son 5 Maç Trend ──
  const M108 = 0; // Maç-maç kaleci rating verisi gerektirir

  return {
    M096, M097, M098, M099, M100, M101, M102, M103, M104, M105,
    M106, M107, M108,
    _meta: { goalkeeperName: gk.name, goalkeeperRating: M102 }
  };
}

function createEmptyGKMetrics() {
  const m = {};
  for (let i = 96; i <= 108; i++) m[`M${String(i).padStart(3, '0')}`] = null;
  m._meta = { error: 'No goalkeeper data' };
  return m;
}

module.exports = { calculateGoalkeeperMetrics };
