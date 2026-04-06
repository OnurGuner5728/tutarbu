/**
 * H2H Analysis Metrics (M119–M130)
 * Kafa kafaya: geçmiş karşılaşmalar, menajer H2H, gol/kart/korner ortalamaları.
 */

function calculateH2HMetrics(data) {
  const h2h = data.h2h;
  const h2hEvents = data.h2hEvents;
  const homeTeamId = data.homeTeamId;
  const awayTeamId = data.awayTeamId;

  if (!h2h && !h2hEvents) return createEmptyH2HMetrics();

  // ── M119-M121: Galibiyet Dağılımı ──
  const teamDuel = h2h?.teamDuel || h2h?.h2h || {};
  const _m119Raw = teamDuel.homeWins ?? teamDuel.team1Wins;
  const _m120Raw = teamDuel.draws;
  const _m121Raw = teamDuel.awayWins ?? teamDuel.team2Wins;
  const M119 = (_m119Raw != null) ? _m119Raw : null;
  const M120 = (_m120Raw != null) ? _m120Raw : null;
  const M121 = (_m121Raw != null) ? _m121Raw : null;

  // H2H Events analizi — çoklu kaynak ile fallback zinciri
  let events = h2hEvents?.events || [];
  if (events.length === 0) {
    events = data.teamH2H?.events || data.teamH2H?.previousEvents || data.teamH2H?.teamDuel?.events || [];
  }
  if (events.length === 0) {
    events = h2h?.events || h2h?.previousEvents || h2h?.lastH2H || [];
  }
  // FALLBACK: Her iki takımın son maçlarını tara
  if (events.length === 0) {
    const homeLast = Array.isArray(data.homeLastEvents) ? data.homeLastEvents : [];
    const awayLast = Array.isArray(data.awayLastEvents) ? data.awayLastEvents : [];
    const merged = [...homeLast, ...awayLast];
    const seenIds = new Set();
    events = merged.filter(ev => {
      if (!ev || seenIds.has(ev.id)) return false;
      seenIds.add(ev.id);
      const isHomeTeamPresent = ev.homeTeam?.id === homeTeamId || ev.awayTeam?.id === homeTeamId;
      const isAwayTeamPresent = ev.homeTeam?.id === awayTeamId || ev.awayTeam?.id === awayTeamId;
      return isHomeTeamPresent && isAwayTeamPresent;
    });
  }

  const last5H2H = events.slice(0, 5);

  // ── M122: Son 5 H2H'de Ev Sahibi Performansı ──
  let homePoints = 0, m122Valid = 0;
  for (const ev of last5H2H) {
    const homeScore = ev.homeScore?.current ?? ev.homeScore?.display ?? null;
    const awayScore = ev.awayScore?.current ?? ev.awayScore?.display ?? null;
    if (homeScore == null || awayScore == null) continue;
    m122Valid++;
    const isCurrentHome = ev.homeTeam?.id === homeTeamId;

    if (isCurrentHome) {
      if (homeScore > awayScore) homePoints += 3;
      else if (homeScore === awayScore) homePoints += 1;
    } else {
      if (awayScore > homeScore) homePoints += 3;
      else if (awayScore === homeScore) homePoints += 1;
    }
  }
  const M122 = m122Valid > 0 ? (homePoints / (m122Valid * 3)) * 100 : null;

  // ── M123: H2H Maç Başı Gol Ortalaması ──
  let totalH2HGoals = 0, m123Valid = 0;
  for (const ev of events) {
    const hs = ev.homeScore?.current ?? ev.homeScore?.display ?? null;
    const as = ev.awayScore?.current ?? ev.awayScore?.display ?? null;
    if (hs == null || as == null) continue;
    totalH2HGoals += hs + as;
    m123Valid++;
  }
  const M123 = m123Valid > 0 ? totalH2HGoals / m123Valid : null;

  // ── M124: H2H Üst 2.5 Oranı ──
  let h2hOver25 = 0, m124Valid = 0;
  for (const ev of events) {
    const hs = ev.homeScore?.current ?? null;
    const as = ev.awayScore?.current ?? null;
    if (hs == null || as == null) continue;
    m124Valid++;
    if (hs + as > 2.5) h2hOver25++;
  }
  const M124 = m124Valid > 0 ? (h2hOver25 / m124Valid) * 100 : null;

  // ── M125: H2H KG Var (BTTS) Oranı ──
  let h2hBTTS = 0, m125Valid = 0;
  for (const ev of events) {
    const hs = ev.homeScore?.current ?? ev.homeScore?.display ?? null;
    const as = ev.awayScore?.current ?? ev.awayScore?.display ?? null;
    if (hs == null || as == null) continue;
    m125Valid++;
    if (hs > 0 && as > 0) h2hBTTS++;
  }
  const M125 = m125Valid > 0 ? (h2hBTTS / m125Valid) * 100 : null;

  // ── M126: Son Maç Skoru Etkisi ──
  let M126 = null;
  if (events.length > 0) {
    const lastMatch = events[0];
    const isLastHome = lastMatch.homeTeam?.id === homeTeamId;
    const scored = isLastHome
      ? (lastMatch.homeScore?.current ?? null) : (lastMatch.awayScore?.current ?? null);
    const conceded = isLastHome
      ? (lastMatch.awayScore?.current ?? null) : (lastMatch.homeScore?.current ?? null);
    if (scored != null && conceded != null) M126 = scored - conceded;
  }

  // ── M127: Menajer H2H Galibiyet Oranı ──
  const managerH2H = h2h?.managerDuel || h2h?.managerH2h || {};
  const mgr1Wins = managerH2H.homeWins ?? managerH2H.manager1Wins ?? managerH2H.homeManagerWins ?? null;
  const mgr2Wins = managerH2H.awayWins ?? managerH2H.manager2Wins ?? managerH2H.awayManagerWins ?? null;
  const mgrDraws = managerH2H.draws ?? null;
  const mgrTotal = (mgr1Wins != null && mgr2Wins != null && mgrDraws != null)
    ? mgr1Wins + mgr2Wins + mgrDraws : null;
  const M127 = mgrTotal != null && mgrTotal > 0 ? (mgr1Wins / mgrTotal) * 100 : null;

  // ── M128: H2H Gol Farkı Trendi ──
  let goalDiffTrend = 0, m128Valid = 0;
  for (let i = 0; i < Math.min(5, events.length); i++) {
    const ev = events[i];
    const isEvHome = ev.homeTeam?.id === homeTeamId;
    const teamGoals = isEvHome ? (ev.homeScore?.current ?? null) : (ev.awayScore?.current ?? null);
    const oppGoals = isEvHome ? (ev.awayScore?.current ?? null) : (ev.homeScore?.current ?? null);
    if (teamGoals == null || oppGoals == null) continue;
    m128Valid++;
    goalDiffTrend += teamGoals - oppGoals;
  }
  const M128 = m128Valid > 0 ? goalDiffTrend / m128Valid : null;

  // ── M129: H2H Kart Ortalaması (gerçek incident verilerinden) ──
  // ── M130: H2H Korner Ortalaması (gerçek incident verilerinden) ──
  let totalH2HCards = 0;
  let totalH2HCorners = 0;
  let matchesWithIncidents = 0;

  for (const ev of events) {
    let matchCards = 0;
    let matchCorners = 0;
    let foundData = false;

    // Önce incidents dizisini kontrol et
    if (Array.isArray(ev.incidents) && ev.incidents.length > 0) {
      for (const inc of ev.incidents) {
        if (inc.incidentType === 'card') {
          matchCards++;
          foundData = true;
        } else if (
          inc.incidentType === 'corner' ||
          (typeof inc.description === 'string' && inc.description.toLowerCase().includes('corner'))
        ) {
          matchCorners++;
          foundData = true;
        }
      }
    }

    // incidents yoksa ya da boşsa statistics dizisini dene
    if (!foundData && Array.isArray(ev.statistics) && ev.statistics.length > 0) {
      for (const stat of ev.statistics) {
        const name = (stat.name || stat.type || stat.statisticsType || '').toLowerCase();
        if (name.includes('yellow card') || name.includes('red card') || name === 'cards') {
          const home = Number(stat.homeValue ?? stat.home ?? 0);
          const away = Number(stat.awayValue ?? stat.away ?? 0);
          matchCards += home + away;
          foundData = true;
        } else if (name.includes('corner')) {
          const home = Number(stat.homeValue ?? stat.home ?? 0);
          const away = Number(stat.awayValue ?? stat.away ?? 0);
          matchCorners += home + away;
          foundData = true;
        }
      }
    }

    if (foundData) {
      totalH2HCards += matchCards;
      totalH2HCorners += matchCorners;
      matchesWithIncidents++;
    }
  }

  const M129 = matchesWithIncidents > 0 ? totalH2HCards / matchesWithIncidents : null;
  const M130 = matchesWithIncidents > 0 ? totalH2HCorners / matchesWithIncidents : null;

  return {
    M119, M120, M121, M122, M123, M124, M125, M126, M127, M128,
    M129, M130,
    _meta: {
      totalH2HMatches: events.length,
      homeTeamH2HWins: M119,
      awayTeamH2HWins: M121,
    }
  };
}

function createEmptyH2HMetrics() {
  const m = {};
  for (let i = 119; i <= 130; i++) m[`M${String(i).padStart(3, '0')}`] = null;
  m._meta = { error: 'No H2H data' };
  return m;
}

module.exports = { calculateH2HMetrics };
