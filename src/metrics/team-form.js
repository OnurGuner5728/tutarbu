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

  // Yardımcı: maç sonucunu belirle — skor yoksa null döner
  function getResult(ev) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const scored = isEvHome ? (ev.homeScore?.current ?? null) : (ev.awayScore?.current ?? null);
    const conceded = isEvHome ? (ev.awayScore?.current ?? null) : (ev.homeScore?.current ?? null);
    if (scored == null || conceded == null) return null;
    if (scored > conceded) return 'W';
    if (scored < conceded) return 'L';
    return 'D';
  }

  // formPoints: null sonuçları (veri yok) atlar; {points, valid} döner
  function formPoints(events) {
    let points = 0, valid = 0;
    for (const ev of events) {
      const r = getResult(ev);
      if (r == null) continue;
      valid++;
      if (r === 'W') points += 3;
      else if (r === 'D') points += 1;
    }
    return { points, valid };
  }

  // ── formData parse (getEventForm API) ──
  const formString = formData?.value || '';
  const formScore = formString.split('').reduce((s, c) => s + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);
  const maxScore = formString.length * 3;
  const formPct = maxScore > 0 ? (formScore / maxScore) * 100 : null;

  // ── M046-M048: Form Puanları ──
  // M046: Son 5 maç event tabanlı hesap (%70) + API form string'i (%30) ağırlıklı birleşim
  const fp5 = formPoints(last5);
  const fp10 = formPoints(last10);
  const fp20 = formPoints(last20);
  const M046raw = fp5.valid > 0 ? (fp5.points / (fp5.valid * 3)) * 100 : null;
  const M046 = M046raw != null && formPct != null
    ? M046raw * 0.7 + formPct * 0.3
    : M046raw != null
      ? M046raw
      : formPct != null
        ? formPct
        : null;
  const M047 = fp10.valid > 0 ? (fp10.points / (fp10.valid * 3)) * 100 : null;
  const M048 = fp20.valid > 0 ? (fp20.points / (fp20.valid * 3)) * 100 : null;

  // ── M049-M052: Seriler (Team Streaks'ten) ──
  // null = bilinmiyor; sayısal değer = gerçek seri
  let M049 = null, M050raw = null, M051 = null, M052 = null;

  // Streaks endpoint'ten
  const generalStreaks = streaks?.general || [];
  const teamName = isHome
    ? data.event?.event?.homeTeam?.name
    : data.event?.event?.awayTeam?.name;

  for (const s of generalStreaks) {
    const matchesTeam = s.team === teamName || s.teamId === teamId;
    if (!matchesTeam && s.team) continue;

    const val = s.streak != null ? s.streak : (s.value != null ? s.value : null);
    if (s.name === 'Wins' || s.name === 'wins') M049 = val;
    if (s.name === 'No losses' || s.name === 'Unbeaten') M050raw = val;
    if (s.name === 'Scoring' || s.name === 'Goals scored') M051 = val;
    if (s.name === 'No goals conceded' || s.name === 'Clean sheets') M052 = val;
  }

  // Eğer streaks API'den gelmezse, events'tan hesapla
  if (M049 == null && M050raw == null) {
    let winStreak = 0, unbeatenStreak = 0, scoringStreak = 0, cleanStreak = 0;
    let winDone = false, unbeatenDone = false, scoringDone = false, cleanDone = false;

    for (const ev of finishedEvents) {
      const r = getResult(ev);
      const isEvHome = ev.homeTeam?.id === teamId;
      const scored = isEvHome ? (ev.homeScore?.current ?? null) : (ev.awayScore?.current ?? null);
      const conceded = isEvHome ? (ev.awayScore?.current ?? null) : (ev.homeScore?.current ?? null);
      if (scored == null || conceded == null) break; // skor yoksa seriyi durdur

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
    M049 = winStreak;
    M050raw = unbeatenStreak;
    if (M051 == null) M051 = scoringStreak;
    if (M052 == null) M052 = cleanStreak;
  }

  // ── M050: avgRating entegrasyonu (getEventForm API) ──
  // Raw streak (M050raw) 0-100'e normalize (cap: 10 maç = %100),
  // avgRating 6-9 → 0-100 normalize; birleşim: streak %60 + avgRating %40
  // avgRating yoksa yalnızca normalize edilmiş raw streak kullanılır.
  const avgRating = formData?.avgRating;
  let M050;
  if (M050raw == null) {
    M050 = null;
  } else if (avgRating != null) {
    const M050streak = Math.min(M050raw, 10) * 10; // 0-100
    const M050rating = Math.min(Math.max((avgRating - 6) / (9 - 6), 0), 1) * 100; // 0-100
    M050 = M050streak * 0.6 + M050rating * 0.4;
  } else {
    M050 = Math.min(M050raw, 10) * 10; // normalize to 0-100
  }

  // ── M053-M054: Gol Trend Yönü ──
  const first5Goals = getGoals(last5.slice(0, 5), teamId, true);
  const prev5 = finishedEvents.slice(5, 10);
  const prev5Goals = getGoals(prev5, teamId, true);

  const prev5Avg = prev5.length > 0 ? prev5Goals / prev5.length : null;
  const last5Avg = last5.length > 0 ? first5Goals / last5.length : null;
  const M053 = (prev5Avg != null && last5Avg != null && prev5Avg > 0)
    ? (last5Avg - prev5Avg) / prev5Avg : null;

  const first5Conc = getGoals(last5, teamId, false);
  const prev5Conc = getGoals(prev5, teamId, false);
  const prev5ConcAvg = prev5.length > 0 ? prev5Conc / prev5.length : null;
  const last5ConcAvg = last5.length > 0 ? first5Conc / last5.length : null;
  const M054 = (prev5ConcAvg != null && last5ConcAvg != null && prev5ConcAvg > 0)
    ? (last5ConcAvg - prev5ConcAvg) / prev5ConcAvg : null;

  // ── M055-M057: Puan Durumu Skorları ──
  const teamStanding = findTeamInStandings(standings, teamId);
  const totalTeams = getTotalTeams(standings);
  const M055 = teamStanding && totalTeams > 0
    ? ((totalTeams - teamStanding.position + 1) / totalTeams) * 100 : null;

  const homeTeamStanding = findTeamInStandings(homeStandings, teamId);
  const M056 = homeTeamStanding && totalTeams > 0
    ? ((totalTeams - homeTeamStanding.position + 1) / totalTeams) * 100 : null;

  const awayTeamStanding = findTeamInStandings(awayStandings, teamId);
  const M057 = awayTeamStanding && totalTeams > 0
    ? ((totalTeams - awayTeamStanding.position + 1) / totalTeams) * 100 : null;

  // ── M058: Goal Difference ──
  const M058 = teamStanding
    ? (teamStanding.scoresFor != null && teamStanding.scoresAgainst != null
        ? teamStanding.scoresFor - teamStanding.scoresAgainst
        : null)
    : null;

  // ── M059-M061: Üst/Alt ve KG Var ──
  let over25 = 0, under25 = 0, btts = 0, goalMatchCount = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const scored = isEvHome ? (ev.homeScore?.current ?? null) : (ev.awayScore?.current ?? null);
    const conceded = isEvHome ? (ev.awayScore?.current ?? null) : (ev.homeScore?.current ?? null);
    if (scored == null || conceded == null) continue;
    goalMatchCount++;
    const total = scored + conceded;
    if (total > 2.5) over25++;
    else under25++;
    if (scored > 0 && conceded > 0) btts++;
  }
  const M059 = goalMatchCount > 0 ? (over25 / goalMatchCount) * 100 : null;
  const M060 = goalMatchCount > 0 ? (under25 / goalMatchCount) * 100 : null;
  const M061 = goalMatchCount > 0 ? (btts / goalMatchCount) * 100 : null;

  // ── M062-M063: İlk Golü Atma ──
  let firstGoalScored = 0, firstGoalWon = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    const goals = incidents.filter(i => i.incidentType === 'goal').sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

    if (goals.length > 0 && goals[0].isHome === isMatchHome) {
      firstGoalScored++;
      const finalTeam = isMatchHome ? (match.homeScore?.current ?? null) : (match.awayScore?.current ?? null);
      const finalOpp = isMatchHome ? (match.awayScore?.current ?? null) : (match.homeScore?.current ?? null);
      if (finalTeam != null && finalOpp != null && finalTeam > finalOpp) firstGoalWon++;
    }
  }
  const recentCount = recentDetails.length;
  const M062 = recentCount > 0 ? (firstGoalScored / recentCount) * 100 : null;
  const M063 = firstGoalScored > 0 ? (firstGoalWon / firstGoalScored) * 100 : null;

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
      const finalTeam = isMatchHome ? (match.homeScore?.current ?? 0) : (match.awayScore?.current ?? 0);
      const finalOpp = isMatchHome ? (match.awayScore?.current ?? 0) : (match.homeScore?.current ?? 0);
      if (finalTeam >= finalOpp) comebacks++;
    }
  }
  const M064 = timesBehind > 0 ? (comebacks / timesBehind) * 100 : null;

  // ── M065: Fişi Çekme İndeksi ──
  let totalWins = 0, bigWins = 0;
  for (const ev of last20) {
    const r = getResult(ev);
    if (r === 'W') {
      totalWins++;
      const isEvHome = ev.homeTeam?.id === teamId;
      const scored = isEvHome ? (ev.homeScore?.current ?? 0) : (ev.awayScore?.current ?? 0);
      const conceded = isEvHome ? (ev.awayScore?.current ?? 0) : (ev.homeScore?.current ?? 0);
      if (scored - conceded >= 2) bigWins++;
    }
  }
  const M065 = totalWins > 0 ? (bigWins / totalWins) * 100 : null;

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
    const score = scored
      ? (isEvHome ? (ev.homeScore?.current ?? null) : (ev.awayScore?.current ?? null))
      : (isEvHome ? (ev.awayScore?.current ?? null) : (ev.homeScore?.current ?? null));
    if (score != null) total += score;
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
