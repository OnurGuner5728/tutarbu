/**
 * Team Defense Metrics (M026–M045)
 * Takım defans metrikleri — tamamı SofaScore API verisinden hesaplanır.
 */

const { extractTeamStats } = require('./team-attack');

/**
 * @param {object} data - fetchAllMatchData() çıktısı
 * @param {string} side - 'home' | 'away'
 */
function calculateTeamDefenseMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const lastEvents = isHome ? data.homeLastEvents : data.awayLastEvents;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];

  const finishedEvents = (lastEvents || []).filter(e => e.status?.type === 'finished');
  const last20 = finishedEvents.slice(0, 20);
  const totalMatches = last20.length;

  if (totalMatches === 0) return createEmptyDefenseMetrics();

  // ── M026: Maç Başı Yenilen Gol Ortalaması ──
  let totalGoalsConceded = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    totalGoalsConceded += isEvHome
      ? (ev.awayScore?.current || ev.awayScore?.display || 0)
      : (ev.homeScore?.current || ev.homeScore?.display || 0);
  }
  const M026 = totalGoalsConceded / totalMatches;

  // ── M027: Ev/Deplasman Yenilen Gol Ortalaması ──
  let locConceded = 0, locMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    if ((isHome && isEvHome) || (!isHome && !isEvHome)) {
      locConceded += isEvHome
        ? (ev.awayScore?.current || ev.awayScore?.display || 0)
        : (ev.homeScore?.current || ev.homeScore?.display || 0);
      locMatches++;
    }
  }
  const M027 = locMatches > 0 ? locConceded / locMatches : M026;

  // ── M028: Clean Sheet Oranı ──
  let cleanSheets = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const conceded = isEvHome
      ? (ev.awayScore?.current || ev.awayScore?.display || 0)
      : (ev.homeScore?.current || ev.homeScore?.display || 0);
    if (conceded === 0) cleanSheets++;
  }
  const M028 = Math.min((cleanSheets / totalMatches) * 100, 100);

  // ── M029-M032: Yarı Bazlı ve Dakika Bazlı Gol Yeme ──
  let firstHalfConceded = 0, secondHalfConceded = 0;
  let conceded015 = 0, conceded7690 = 0;
  let totalConcededInc = 0;
  const recentMatchCount = recentDetails.length || 1;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) continue; // Rakibin golü

      totalConcededInc++;
      const minute = inc.time || 0;

      if (minute <= 45) firstHalfConceded++;
      else secondHalfConceded++;

      if (minute <= 15) conceded015++;
      if (minute >= 76) conceded7690++;
    }
  }

  const M029 = firstHalfConceded / recentMatchCount;
  const M030 = secondHalfConceded / recentMatchCount;
  const safeConceded = totalConcededInc || 1;
  const M031 = (conceded015 / safeConceded) * 100;
  const M032 = (conceded7690 / safeConceded) * 100;

  // FALLBACK: Eğer 0 ise, %0 olarak kalıyor ama numuneyi 7 maça çıkardık.

  // ── M033: Rakip xG'yi Düşürme Oranı ──
  let totalOpponentXG = 0;
  let xgMatches = 0;
  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let opponentXG = 0;

    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome && shot.xg != null) {
        opponentXG += shot.xg;
      }
    }
    if (shotmapData.length > 0) {
      totalOpponentXG += opponentXG;
      xgMatches++;
    }
  }
  const avgOpponentXG = xgMatches > 0 ? totalOpponentXG / xgMatches : 1.5;
  const M033 = avgOpponentXG; // Düşük = iyi defans

  // ── M034-M038: Defansif İstatistikler ──
  let totalBlocked = 0, totalOpponentShots = 0;
  let totalDuelsWon = 0, totalDuels = 0;
  let totalAerialWon = 0, totalAerial = 0;
  let totalInterceptions = 0;
  let totalFouls = 0;
  let matchesWithStats = 0;

  for (const match of recentDetails) {
    const teamStats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    const oppStats = extractTeamStats(match.stats, match.homeTeam?.id !== teamId);

    if (teamStats) {
      totalBlocked += teamStats.blockedShots || 0;
      totalDuelsWon += teamStats.duelsWon || 0;
      totalAerialWon += teamStats.aerialDuelsWon || 0;
      totalAerial += teamStats.totalAerialDuels || 0;
      totalInterceptions += teamStats.interceptions || 0;
      totalFouls += teamStats.fouls || 0;
      matchesWithStats++;
    }
    if (oppStats) {
      totalOpponentShots += oppStats.totalShots || 0;
      totalDuels += (teamStats?.totalDuels || 0) > 0
        ? (teamStats.totalDuels || 0)
        : (teamStats?.duelsWon || 0) + (teamStats?.duelsLost || 0);
    }
  }

  const M034 = totalOpponentShots > 0 ? Math.min((totalBlocked / totalOpponentShots) * 100, 100) : 0;
  const M035 = totalDuels > 0 ? Math.min((totalDuelsWon / totalDuels) * 100, 100) : 50;
  const M036 = totalAerial > 0 ? Math.min((totalAerialWon / totalAerial) * 100, 100) : 50;
  const M037 = matchesWithStats > 0 ? totalInterceptions / matchesWithStats : 0;
  const M038 = matchesWithStats > 0 ? totalFouls / matchesWithStats : 0;

  // ── M039-M040: Kart Metrikleri ──
  let totalYellows = 0, totalReds = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'card') continue;
      if (inc.isHome !== isMatchHome) continue;
      if (inc.incidentClass === 'yellow') totalYellows++;
      if (inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed') totalReds++;
    }
  }
  const M039 = recentMatchCount > 0 ? totalYellows / recentMatchCount : 0;
  const M040 = recentMatchCount > 0 ? totalReds / recentMatchCount : 0;

  // ── M041: Defansif Baskı Altında Gol Yeme ──
  let goalsUnderPressure = 0;
  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) continue;

      const minute = inc.time || 0;
      const nearPoint = graphPoints.find(p => Math.abs(p.minute - minute) <= 2);
      if (nearPoint) {
        const pressure = isMatchHome ? nearPoint.value : -nearPoint.value;
        if (pressure < -30) goalsUnderPressure++; // Takım baskı altında
      }
    }
  }
  const M041 = totalConcededInc > 0 ? (goalsUnderPressure / totalConcededInc) * 100 : 0;

  // ── M042: Geri Düşünce Gol Yeme (önde gidip yenilme) ──
  let timesAhead = 0, lostFromAhead = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let teamGoals = 0, oppGoals = 0;
    let wasAhead = false;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) teamGoals++;
      else oppGoals++;

      if (teamGoals > oppGoals) wasAhead = true;
    }

    if (wasAhead) {
      timesAhead++;
      const finalTeam = isMatchHome
        ? (match.homeScore?.current || 0)
        : (match.awayScore?.current || 0);
      const finalOpp = isMatchHome
        ? (match.awayScore?.current || 0)
        : (match.homeScore?.current || 0);
      if (finalOpp >= finalTeam) lostFromAhead++;
    }
  }
  const M042 = timesAhead > 0 ? (lostFromAhead / timesAhead) * 100 : 0;

  // ── M043: Öne Geçince Maç Kapatma ──
  let wonFromAhead = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let teamGoals = 0, oppGoals = 0;
    let wasAhead = false;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) teamGoals++;
      else oppGoals++;
      if (teamGoals > oppGoals) wasAhead = true;
    }

    if (wasAhead) {
      const finalTeam = isMatchHome ? (match.homeScore?.current || 0) : (match.awayScore?.current || 0);
      const finalOpp = isMatchHome ? (match.awayScore?.current || 0) : (match.homeScore?.current || 0);
      if (finalTeam > finalOpp) wonFromAhead++;
    }
  }
  const M043 = timesAhead > 0 ? (wonFromAhead / timesAhead) * 100 : 0;

  // ── M044: Gol Yedikten Sonra Tepki Süresi ──
  let totalReactionMinutes = 0;
  let reactionCount = 0;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    const goals = incidents.filter(i => i.incidentType === 'goal').sort((a, b) => (a.time || 0) - (b.time || 0));

    for (let i = 0; i < goals.length; i++) {
      if (goals[i].isHome === isMatchHome) continue; // Rakip attı
      // Sonraki takım golünü bul
      for (let j = i + 1; j < goals.length; j++) {
        if (goals[j].isHome === isMatchHome) {
          totalReactionMinutes += (goals[j].time - goals[i].time);
          reactionCount++;
          break;
        }
      }
    }
  }
  const M044 = reactionCount > 0 ? totalReactionMinutes / reactionCount : 90;

  // ── M045: Rakip Korner Engelleme Verimi ──
  let totalOppCorners = 0;
  let goalsFromOppCorner = 0;

  for (const match of recentDetails) {
    const oppStats = extractTeamStats(match.stats, match.homeTeam?.id !== teamId);
    if (oppStats) {
      totalOppCorners += oppStats.cornerKicks || 0;
    }
    // Rakip kornerden gol bulmuş mu?
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome && shot.situation === 'corner' && shot.shotType === 'goal') {
        goalsFromOppCorner++;
      }
    }
  }
  const M045 = totalOppCorners > 0 ? (1 - (goalsFromOppCorner / totalOppCorners)) * 100 : 100;

  return {
    M026, M027, M028, M029, M030, M031, M032, M033, M034, M035,
    M036, M037, M038, M039, M040, M041, M042, M043, M044, M045,
    _meta: {
      totalMatchesAnalyzed: totalMatches,
      totalGoalsConceded,
      cleanSheets,
    }
  };
}

function createEmptyDefenseMetrics() {
  const metrics = {};
  for (let i = 26; i <= 45; i++) {
    metrics[`M${String(i).padStart(3, '0')}`] = null;
  }
  metrics._meta = { totalMatchesAnalyzed: 0, error: 'No finished matches found' };
  return metrics;
}

module.exports = { calculateTeamDefenseMetrics };
