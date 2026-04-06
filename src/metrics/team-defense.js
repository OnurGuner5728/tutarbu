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
  let m026ValidMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const score = isEvHome
      ? (ev.awayScore?.current ?? ev.awayScore?.display)
      : (ev.homeScore?.current ?? ev.homeScore?.display);
    if (score == null) continue;
    totalGoalsConceded += score;
    m026ValidMatches++;
  }
  const M026 = m026ValidMatches > 0 ? totalGoalsConceded / m026ValidMatches : null;

  // ── M027: Ev/Deplasman Yenilen Gol Ortalaması ──
  let locConceded = 0, locMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    if ((isHome && isEvHome) || (!isHome && !isEvHome)) {
      const score = isEvHome
        ? (ev.awayScore?.current ?? ev.awayScore?.display)
        : (ev.homeScore?.current ?? ev.homeScore?.display);
      if (score == null) continue;
      locConceded += score;
      locMatches++;
    }
  }
  const M027 = locMatches > 0 ? locConceded / locMatches : null;

  // ── M028: Clean Sheet Oranı ──
  let cleanSheets = 0;
  let m028ValidMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const score = isEvHome
      ? (ev.awayScore?.current ?? ev.awayScore?.display)
      : (ev.homeScore?.current ?? ev.homeScore?.display);
    if (score == null) continue;
    if (score === 0) cleanSheets++;
    m028ValidMatches++;
  }
  const M028 = m028ValidMatches > 0 ? Math.min((cleanSheets / m028ValidMatches) * 100, 100) : null;

  // ── M029-M032: Yarı Bazlı ve Dakika Bazlı Gol Yeme ──
  let firstHalfConceded = 0, secondHalfConceded = 0;
  let conceded015 = 0, conceded7690 = 0;
  let totalConcededInc = 0;
  const recentMatchCount = recentDetails.length;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) continue; // Rakibin golü

      const minute = inc.time;
      if (minute == null) continue; // Dakika verisi yoksa atla

      totalConcededInc++;

      if (minute <= 45) firstHalfConceded++;
      else secondHalfConceded++;

      if (minute >= 1 && minute <= 15) conceded015++;
      if (minute >= 76 && minute <= 90) conceded7690++;
    }
  }

  const M029 = recentMatchCount > 0 ? firstHalfConceded / recentMatchCount : null;
  const M030 = recentMatchCount > 0 ? secondHalfConceded / recentMatchCount : null;
  const M031 = totalConcededInc > 0 ? (conceded015 / totalConcededInc) * 100 : null;
  const M032 = totalConcededInc > 0 ? (conceded7690 / totalConcededInc) * 100 : null;

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
  const avgOpponentXG = xgMatches > 0 ? totalOpponentXG / xgMatches : null;
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
      if (teamStats.blockedShots != null) totalBlocked += teamStats.blockedShots;
      if (teamStats.duelsWon != null) totalDuelsWon += teamStats.duelsWon;
      if (teamStats.aerialDuelsWon != null) totalAerialWon += teamStats.aerialDuelsWon;
      if (teamStats.totalAerialDuels != null) totalAerial += teamStats.totalAerialDuels;
      if (teamStats.interceptions != null) totalInterceptions += teamStats.interceptions;
      if (teamStats.fouls != null) totalFouls += teamStats.fouls;
      matchesWithStats++;
    }
    if (oppStats) {
      if (oppStats.totalShots != null) totalOpponentShots += oppStats.totalShots;
      const duelsTotal = teamStats?.totalDuels != null
        ? teamStats.totalDuels
        : (teamStats?.duelsWon != null && teamStats?.duelsLost != null)
          ? teamStats.duelsWon + teamStats.duelsLost
          : null;
      if (duelsTotal != null) totalDuels += duelsTotal;
    }
  }

  const M034 = totalOpponentShots > 0 ? Math.min((totalBlocked / totalOpponentShots) * 100, 100) : null;
  const M035 = totalDuels > 0 ? Math.min((totalDuelsWon / totalDuels) * 100, 100) : null;
  const M036 = totalAerial > 0 ? Math.min((totalAerialWon / totalAerial) * 100, 100) : null;
  const M037 = matchesWithStats > 0 ? totalInterceptions / matchesWithStats : null;
  const M038 = matchesWithStats > 0 ? totalFouls / matchesWithStats : null;

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
  const M039 = recentMatchCount > 0 ? totalYellows / recentMatchCount : null;
  const M040 = recentMatchCount > 0 ? totalReds / recentMatchCount : null;

  // ── M041: Defansif Baskı Altında Gol Yeme ──
  let goalsUnderPressure = 0;
  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) continue;

      const minute = inc.time;
      if (minute == null) continue;
      const nearPoint = graphPoints.find(p => Math.abs(p.minute - minute) <= 2);
      if (nearPoint) {
        const pressure = isMatchHome ? nearPoint.value : -nearPoint.value;
        if (pressure < -30) goalsUnderPressure++; // Takım baskı altında
      }
    }
  }
  const M041 = totalConcededInc > 0 ? (goalsUnderPressure / totalConcededInc) * 100 : null;

  // ── M042: Geri Düşünce Gol Yeme (önde gidip yenilme) ──
  // ── M043: Öne Geçince Maç Kapatma ──
  // State machine yaklaşımı: wasAhead boolean yerine her gol sonrası
  // durum geçişi izlenerek takımın kaç kez öne geçtiği doğru sayılır.
  // Örn: 1-0 → 1-1 → 2-1 senaryosunda timesWentAhead = 2 olmalı.
  let timesAhead = 0, lostFromAhead = 0, wonFromAhead = 0;
  for (const match of recentDetails) {
    const rawIncidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    // Olayları zamana göre sırala
    const sortedIncidents = rawIncidents.slice().sort((a, b) => (a.time || 0) - (b.time || 0));

    let teamGoals = 0, oppGoals = 0;
    let wasLeading = false;  // Önceki adımda önde miydi?
    let everWentAhead = false;

    for (const inc of sortedIncidents) {
      if (inc.incidentType !== 'goal') continue;

      const prevLeading = teamGoals > oppGoals;

      if (inc.isHome === isMatchHome) teamGoals++;
      else oppGoals++;

      const nowLeading = teamGoals > oppGoals;

      // Öne geçiş: önceden önde değildi, şimdi önde
      if (!prevLeading && nowLeading) {
        timesAhead++;
        everWentAhead = true;
      }

      wasLeading = nowLeading;
    }

    if (everWentAhead) {
      const finalTeamHome = isMatchHome ? match.homeScore?.current : match.awayScore?.current;
      const finalOppHome = isMatchHome ? match.awayScore?.current : match.homeScore?.current;
      if (finalTeamHome == null || finalOppHome == null) continue;
      if (finalOppHome >= finalTeamHome) lostFromAhead++;
      if (finalTeamHome > finalOppHome) wonFromAhead++;
    }
  }
  const M042 = timesAhead > 0 ? (lostFromAhead / timesAhead) * 100 : null;
  const M043 = timesAhead > 0 ? (wonFromAhead / timesAhead) * 100 : null;

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
  const M044 = reactionCount > 0 ? totalReactionMinutes / reactionCount : null;

  // ── M045: Rakip Korner Engelleme Verimi ──
  let totalOppCorners = 0;
  let goalsFromOppCorner = 0;

  for (const match of recentDetails) {
    const oppStats = extractTeamStats(match.stats, match.homeTeam?.id !== teamId);
    if (oppStats && oppStats.cornerKicks != null) {
      totalOppCorners += oppStats.cornerKicks;
    }
    // Rakip kornerden gol bulmuş mu?
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome && shot.situation === 'corner' && shot.isGoal === true) {
        goalsFromOppCorner++;
      }
    }
  }
  const M045 = totalOppCorners > 0 ? (1 - (goalsFromOppCorner / totalOppCorners)) * 100 : null;

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
