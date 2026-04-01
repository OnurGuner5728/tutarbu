/**
 * Team Form & Trend Metrics (M046–M065)
 * Form, seri, puan durumu, gol trendi, KG var/yok, geriden gelme, fişi çekme.
 */

function calculateTeamFormMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const lastEvents = isHome ? data.homeLastEvents : data.awayLastEvents;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
  const formData = data.form;
  const streaks = data.streaks;
  const standings = data.standingsTotal;
  const homeStandings = data.standingsHome;
  const awayStandings = data.standingsAway;

  const finishedEvents = (lastEvents || []).filter(e => e.status?.type === 'finished');
  const last20 = finishedEvents.slice(0, 20);
  const last10 = finishedEvents.slice(0, 10);
  const last5 = finishedEvents.slice(0, 5);
  const totalMatches = last20.length;

  if (totalMatches === 0) return createEmptyFormMetrics();

  // Yardımcı: maç sonucunu belirle
  function getResult(ev) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const scored = isEvHome ? (ev.homeScore?.current || 0) : (ev.awayScore?.current || 0);
    const conceded = isEvHome ? (ev.awayScore?.current || 0) : (ev.homeScore?.current || 0);
    if (scored > conceded) return 'W';
    if (scored < conceded) return 'L';
    return 'D';
  }

  function formPoints(events) {
    let points = 0;
    for (const ev of events) {
      const r = getResult(ev);
      if (r === 'W') points += 3;
      else if (r === 'D') points += 1;
    }
    return points;
  }

  // ── formData parse (getEventForm API) ──
  const formString = formData?.value || '';
  const formScore = formString.split('').reduce((s, c) => s + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);
  const maxScore = formString.length * 3;
  const formPct = maxScore > 0 ? (formScore / maxScore) * 100 : 50;

  // ── M046-M048: Form Puanları ──
  // M046: Son 5 maç event tabanlı hesap (%70) + API form string'i (%30) ağırlıklı birleşim
  const M046raw = last5.length > 0 ? (formPoints(last5) / (last5.length * 3)) * 100 : 0;
  const M046 = maxScore > 0
    ? M046raw * 0.7 + formPct * 0.3
    : M046raw;
  const M047 = last10.length > 0 ? (formPoints(last10) / (last10.length * 3)) * 100 : 0;
  const M048 = last20.length > 0 ? (formPoints(last20) / (last20.length * 3)) * 100 : 0;

  // ── M049-M052: Seriler (Team Streaks'ten) ──
  let M049 = 0, M050raw = 0, M051 = 0, M052 = 0;

  // Streaks endpoint'ten
  const generalStreaks = streaks?.general || [];
  const teamName = isHome
    ? data.event?.event?.homeTeam?.name
    : data.event?.event?.awayTeam?.name;

  for (const s of generalStreaks) {
    const matchesTeam = s.team === teamName || s.teamId === teamId;
    if (!matchesTeam && s.team) continue;

    if (s.name === 'Wins' || s.name === 'wins') M049 = s.streak || s.value || 0;
    if (s.name === 'No losses' || s.name === 'Unbeaten') M050raw = s.streak || s.value || 0;
    if (s.name === 'Scoring' || s.name === 'Goals scored') M051 = s.streak || s.value || 0;
    if (s.name === 'No goals conceded' || s.name === 'Clean sheets') M052 = s.streak || s.value || 0;
  }

  // Eğer streaks API'den gelmezse, events'tan hesapla
  if (M049 === 0 && M050raw === 0) {
    let winStreak = 0, unbeatenStreak = 0, scoringStreak = 0, cleanStreak = 0;
    let winDone = false, unbeatenDone = false, scoringDone = false, cleanDone = false;

    for (const ev of finishedEvents) {
      const r = getResult(ev);
      const isEvHome = ev.homeTeam?.id === teamId;
      const scored = isEvHome ? (ev.homeScore?.current || 0) : (ev.awayScore?.current || 0);
      const conceded = isEvHome ? (ev.awayScore?.current || 0) : (ev.homeScore?.current || 0);

      if (!winDone) {
        if (r === 'W') winStreak++;
        else winDone = true;
      }
      if (!unbeatenDone) {
        if (r !== 'L') unbeatenStreak++;
        else unbeatenDone = true;
      }
      if (!scoringDone) {
        if (scored > 0) scoringStreak++;
        else scoringDone = true;
      }
      if (!cleanDone) {
        if (conceded === 0) cleanStreak++;
        else cleanDone = true;
      }
    }
    if (M049 === 0) M049 = winStreak;
    if (M050raw === 0) M050raw = unbeatenStreak;
    if (M051 === 0) M051 = scoringStreak;
    if (M052 === 0) M052 = cleanStreak;
  }

  // ── M050: avgRating entegrasyonu (getEventForm API) ──
  // Raw streak (M050raw) 0-100'e normalize (cap: 10 maç = %100),
  // avgRating 6-9 → 0-100 normalize; birleşim: streak %60 + avgRating %40
  // avgRating yoksa yalnızca raw streak kullanılır.
  const avgRating = formData?.avgRating;
  let M050;
  if (avgRating != null) {
    const M050streak = Math.min(M050raw, 10) * 10; // 0-100
    const M050rating = Math.min(Math.max((avgRating - 6) / (9 - 6), 0), 1) * 100; // 0-100
    M050 = M050streak * 0.6 + M050rating * 0.4;
  } else {
    M050 = M050raw; // Sadece streak, avgRating yoksa
  }

  // ── M053-M054: Gol Trend Yönü ──
  const first5Goals = getGoals(last5.slice(0, 5), teamId, true);
  const prev5 = finishedEvents.slice(5, 10);
  const prev5Goals = getGoals(prev5, teamId, true);

  const prev5Avg = prev5.length > 0 ? prev5Goals / prev5.length : 1;
  const last5Avg = last5.length > 0 ? first5Goals / last5.length : 0;
  const M053 = prev5Avg > 0 ? (last5Avg - prev5Avg) / prev5Avg : 0;

  const first5Conc = getGoals(last5, teamId, false);
  const prev5Conc = getGoals(prev5, teamId, false);
  const prev5ConcAvg = prev5.length > 0 ? prev5Conc / prev5.length : 1;
  const last5ConcAvg = last5.length > 0 ? first5Conc / last5.length : 0;
  const M054 = prev5ConcAvg > 0 ? (last5ConcAvg - prev5ConcAvg) / prev5ConcAvg : 0;

  // ── M055-M057: Puan Durumu Skorları ──
  const teamStanding = findTeamInStandings(standings, teamId);
  const totalTeams = getTotalTeams(standings);
  const M055 = teamStanding && totalTeams > 0
    ? ((totalTeams - teamStanding.position + 1) / totalTeams) * 100 : 50;

  const homeTeamStanding = findTeamInStandings(homeStandings, teamId);
  const M056 = homeTeamStanding && totalTeams > 0
    ? ((totalTeams - homeTeamStanding.position + 1) / totalTeams) * 100 : 50;

  const awayTeamStanding = findTeamInStandings(awayStandings, teamId);
  const M057 = awayTeamStanding && totalTeams > 0
    ? ((totalTeams - awayTeamStanding.position + 1) / totalTeams) * 100 : 50;

  // ── M058: Goal Difference ──
  const M058 = teamStanding
    ? (teamStanding.scoresFor || 0) - (teamStanding.scoresAgainst || 0) : 0;

  // ── M059-M061: Üst/Alt ve KG Var ──
  let over25 = 0, under25 = 0, btts = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const scored = isEvHome ? (ev.homeScore?.current || 0) : (ev.awayScore?.current || 0);
    const conceded = isEvHome ? (ev.awayScore?.current || 0) : (ev.homeScore?.current || 0);
    const total = scored + conceded;

    if (total > 2.5) over25++;
    else under25++;
    if (scored > 0 && conceded > 0) btts++;
  }
  const M059 = (over25 / totalMatches) * 100;
  const M060 = (under25 / totalMatches) * 100;
  const M061 = (btts / totalMatches) * 100;

  // ── M062-M063: İlk Golü Atma ──
  let firstGoalScored = 0, firstGoalWon = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    const goals = incidents.filter(i => i.incidentType === 'goal').sort((a, b) => (a.time || 0) - (b.time || 0));

    if (goals.length > 0 && goals[0].isHome === isMatchHome) {
      firstGoalScored++;
      const finalTeam = isMatchHome ? (match.homeScore?.current || 0) : (match.awayScore?.current || 0);
      const finalOpp = isMatchHome ? (match.awayScore?.current || 0) : (match.homeScore?.current || 0);
      if (finalTeam > finalOpp) firstGoalWon++;
    }
  }
  const recentCount = recentDetails.length || 1;
  const M062 = (firstGoalScored / recentCount) * 100;
  const M063 = firstGoalScored > 0 ? (firstGoalWon / firstGoalScored) * 100 : 0;

  // ── M064: Geriden Gelme Oranı ──
  let timesBehind = 0, comebacks = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let teamG = 0, oppG = 0, wasBehind = false;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome === isMatchHome) teamG++;
      else oppG++;
      if (oppG > teamG) wasBehind = true;
    }

    if (wasBehind) {
      timesBehind++;
      const finalTeam = isMatchHome ? (match.homeScore?.current || 0) : (match.awayScore?.current || 0);
      const finalOpp = isMatchHome ? (match.awayScore?.current || 0) : (match.homeScore?.current || 0);
      if (finalTeam >= finalOpp) comebacks++;
    }
  }
  const M064 = timesBehind > 0 ? (comebacks / timesBehind) * 100 : 0;

  // ── M065: Fişi Çekme İndeksi ──
  let totalWins = 0, bigWins = 0;
  for (const ev of last20) {
    const r = getResult(ev);
    if (r === 'W') {
      totalWins++;
      const isEvHome = ev.homeTeam?.id === teamId;
      const scored = isEvHome ? (ev.homeScore?.current || 0) : (ev.awayScore?.current || 0);
      const conceded = isEvHome ? (ev.awayScore?.current || 0) : (ev.homeScore?.current || 0);
      if (scored - conceded >= 2) bigWins++;
    }
  }
  const M065 = totalWins > 0 ? (bigWins / totalWins) * 100 : 0;

  return {
    M046, M047, M048, M049, M050, M051, M052, M053, M054, M055,
    M056, M057, M058, M059, M060, M061, M062, M063, M064, M065,
    _meta: { totalMatchesAnalyzed: totalMatches }
  };
}

// ── Yardımcı Fonksiyonlar ──
function getGoals(events, teamId, scored) {
  let total = 0;
  for (const ev of events) {
    const isEvHome = ev.homeTeam?.id === teamId;
    if (scored) {
      total += isEvHome ? (ev.homeScore?.current || 0) : (ev.awayScore?.current || 0);
    } else {
      total += isEvHome ? (ev.awayScore?.current || 0) : (ev.homeScore?.current || 0);
    }
  }
  return total;
}

function findTeamInStandings(standingsData, teamId) {
  if (!standingsData?.standings) return null;
  for (const s of standingsData.standings) {
    for (const row of (s.rows || [])) {
      if (row.team?.id === teamId) return row;
    }
  }
  return null;
}

function getTotalTeams(standingsData) {
  if (!standingsData?.standings) return 0;
  for (const s of standingsData.standings) {
    return (s.rows || []).length;
  }
  return 0;
}

function createEmptyFormMetrics() {
  const metrics = {};
  for (let i = 46; i <= 65; i++) {
    metrics[`M${String(i).padStart(3, '0')}`] = null;
  }
  metrics._meta = { totalMatchesAnalyzed: 0, error: 'No data' };
  return metrics;
}

module.exports = { calculateTeamFormMetrics };
