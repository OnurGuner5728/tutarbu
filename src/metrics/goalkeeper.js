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
  const saves = gkStats.saves ?? null;
  const goalsConceded = gkStats.goalsConceded ?? gkStats.goalsAgainst ?? null;
  const M096 = (saves == null || goalsConceded == null)
    ? null
    : (saves + goalsConceded) > 0 ? (saves / (saves + goalsConceded)) * 100 : null;

  // ── M097: Maç Başı Kurtarış Ortalaması ──
  const appearances = gkStats.appearances ?? gkStats.matchesPlayed ?? null;
  const M097 = (saves == null || appearances == null || appearances === 0) ? null : saves / appearances;

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
      const conceded = isMatchHome
        ? (match.awayScore?.current ?? null)
        : (match.homeScore?.current ?? null);
      if (conceded == null) continue;
      totalOpponentXG += oppXG;
      totalActualConceded += conceded;
      xgMatches++;
    }
  }
  const M098 = (xgMatches === 0 || totalOpponentXG === 0)
    ? null
    : (totalOpponentXG - totalActualConceded) / totalOpponentXG;

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
  const seasonPenaltySaved = gkStats.penaltySaved;
  const seasonPenaltyFaced = gkStats.penaltyFaced;
  const M099_season = (seasonPenaltyFaced != null && seasonPenaltyFaced > 0 && seasonPenaltySaved != null) 
    ? (seasonPenaltySaved / seasonPenaltyFaced) * 100 : null;
  const M099 = penaltiesFaced > 0 ? (penaltiesSaved / penaltiesFaced) * 100 : M099_season;
  const M180 = M099; // Sync with M099 but specific ID as requested

  // ── M100: 1v1 Kurtarma (Big Chance) ──
  const bigChancesSaved = gkStats.savedShotsFromInsideTheBox ?? gkStats.bigChancesSaved ?? null;
  const bigChancesConceeded = gkStats.goalsConcededInsideTheBox ?? goalsConceded ?? null;
  const bigChancesFaced = (bigChancesSaved == null || bigChancesConceeded == null)
    ? null
    : bigChancesSaved + bigChancesConceeded;
  const M100 = bigChancesFaced == null ? null : bigChancesFaced > 0 ? (bigChancesSaved / bigChancesFaced) * 100 : null;

  // ── M101: Kaleci Dağıtım Başarısı ──
  const gkAccPass = gkStats.accuratePasses ?? gkStats.accuratePassesPercentage ?? null;
  const gkTotalPass = gkStats.totalPasses ?? null;
  const M101 = gkAccPass == null ? null
    : gkTotalPass != null && gkTotalPass > 1 ? (gkAccPass / gkTotalPass) * 100
    : gkAccPass;

  // ── M102: Kaleci Rating Ortalaması ──
  const M102 = gkStats.rating ?? null;

  // ── M103: Clean Sheet Streak ──
  let cleanStreak = 0;
  for (const ev of finishedEvents) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const conceded = isEvHome
      ? (ev.awayScore?.current ?? ev.awayScore?.display ?? null)
      : (ev.homeScore?.current ?? ev.homeScore?.display ?? null);
    if (conceded == null) break;
    if (conceded === 0) cleanStreak++;
    else break;
  }
  const M103 = finishedEvents.length > 0 ? cleanStreak : null;

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
        if (!shot.isGoal) outsideSaves++;
      }
    }
  }
  const M104 = outsideShots > 0 ? (outsideSaves / outsideShots) * 100 : null;

  // ── M105: Kaleci Hata Sonucu Gol ──
  const M105 = gkStats.errorLeadToGoal ?? gkStats.errorsLeadingToGoal ?? null;

  // ── M106: Kaleci Nitelik Skoru ──
  const gkAttrs = gk.attributes?.averageAttributeOverviews?.[0];
  const M106 = gkAttrs
    ? ((gkAttrs.attacking ?? null) != null && (gkAttrs.technical ?? null) != null && (gkAttrs.defending ?? null) != null
      ? (gkAttrs.attacking + gkAttrs.technical + gkAttrs.defending) / 3
      : null)
    : null;

  // ── M107: Hava Hakimiyeti ──
  const punches = gkStats.punches ?? null;
  const highClaims = gkStats.highClaims ?? gkStats.totalHighClaim ?? null;
  const M107 = (punches == null || highClaims == null || appearances == null || appearances === 0)
    ? null
    : (punches + highClaims) / appearances;

  // --- GK Advanced Attributes (M180 range) ---
  const M180_att = gkAttrs?.attacking ?? null;
  const M180_tec = gkAttrs?.technical ?? null;
  const M180_tac = gkAttrs?.tactical ?? null;
  const M180_def = gkAttrs?.defending ?? null;
  const M180_cre = gkAttrs?.creativity ?? null;

  // ── M108: Kaleci Son 5 Maç Rating Ortalaması ──
  const gkRatings = [];
  for (const match of recentDetails) {
    const isMatchHome = match.homeTeam?.id === teamId;
    const lineupSide = isMatchHome ? match.lineups?.home : match.lineups?.away;
    const players = lineupSide?.players || [];
    const matchGk = players.find(p => p.position === 'G' || p.positionName === 'Goalkeeper');
    const rating = matchGk?.statistics?.rating;
    if (rating != null && !isNaN(rating)) gkRatings.push(Number(rating));
  }
  const avgGkRating = gkRatings.length > 0
    ? gkRatings.reduce((sum, r) => sum + r, 0) / gkRatings.length
    : null;
  const M108 = avgGkRating != null ? Math.min(Math.max(avgGkRating * 10, 0), 100) : null;

  return {
    M096, M097, M098, M099, M100, M101, M102, M103, M104, M105,
    M106, M107, M108,
    M180, M180_att, M180_tec, M180_tac, M180_def, M180_cre,
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
