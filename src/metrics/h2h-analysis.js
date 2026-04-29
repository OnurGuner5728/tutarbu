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

  // ── M119-M121: Galibiyet Dağılımı — /event/:id/h2h endpoint'inden gelen teamDuel
  const teamDuel = h2h?.teamDuel || {};
  const _m119Raw = teamDuel.homeWins ?? teamDuel.team1Wins;
  const _m120Raw = teamDuel.draws;
  const _m121Raw = teamDuel.awayWins ?? teamDuel.team2Wins;
  const M119 = (_m119Raw != null) ? _m119Raw : null;
  const M120 = (_m120Raw != null) ? _m120Raw : null;
  const M121 = (_m121Raw != null) ? _m121Raw : null;

  // H2H Events — yalnızca /event/:id/h2h/events endpoint'inden
  const events = h2hEvents?.events || [];

  // Sadece skoru belli bitmiş maçları al (upcoming maç kendisi filtrelenir)
  const finishedForForm = events.filter(e =>
    e.homeScore?.current != null && e.awayScore?.current != null
  );
  const last5H2H = finishedForForm.slice(0, 5);

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
  // events[0] upcoming maç olabilir (henüz oynanmamış); sadece bitmiş maçlara bak.
  let M126 = null;
  const finishedEvents = events.filter(e =>
    e.homeScore?.current != null && e.awayScore?.current != null
  );
  if (finishedEvents.length > 0) {
    const lastMatch = finishedEvents[0];
    const isLastHome = lastMatch.homeTeam?.id === homeTeamId;
    const scored = isLastHome
      ? lastMatch.homeScore.current : lastMatch.awayScore.current;
    const conceded = isLastHome
      ? lastMatch.awayScore.current : lastMatch.homeScore.current;
    M126 = scored - conceded;
  }

  // ── M127: Menajer H2H Galibiyet Oranı — /event/:id/h2h endpoint'inden
  const managerH2H = h2h?.managerDuel || {};
  const mgr1Wins = managerH2H.homeWins ?? managerH2H.manager1Wins ?? managerH2H.homeManagerWins ?? null;
  const mgr2Wins = managerH2H.awayWins ?? managerH2H.manager2Wins ?? managerH2H.awayManagerWins ?? null;
  const mgrDraws = managerH2H.draws ?? null;
  const mgrTotal = (mgr1Wins != null && mgr2Wins != null && mgrDraws != null)
    ? mgr1Wins + mgr2Wins + mgrDraws : null;
  let M127 = mgrTotal != null && mgrTotal > 0 ? (mgr1Wins / mgrTotal) * 100 : null;

  // Fallback: managerDuel yoksa menajer kariyer maçlarından karşılıklı sonuçları say
  if (M127 == null) {
    const homeMgrEvents = data.homeManagerCareer?.events || [];
    const awayMgrEvents = data.awayManagerCareer?.events || [];
    // Her iki menajer de bir maçta yer alıyorsa o maç H2H'dir
    const homeMgrTeamIds = new Set();
    for (const ev of homeMgrEvents) {
      if (ev.homeTeam?.id) homeMgrTeamIds.add(ev.homeTeam.id);
      if (ev.awayTeam?.id) homeMgrTeamIds.add(ev.awayTeam.id);
    }
    let mgrH2HWins = 0, mgrH2HTotal = 0;
    for (const ev of awayMgrEvents) {
      const hid = ev.homeTeam?.id;
      const aid = ev.awayTeam?.id;
      if (!hid || !aid) continue;
      if (homeMgrTeamIds.has(hid) || homeMgrTeamIds.has(aid)) {
        const hs = ev.homeScore?.current;
        const as = ev.awayScore?.current;
        if (hs == null || as == null) continue;
        mgrH2HTotal++;
        // Ev sahibi takım data.homeTeamId ise ev menajeri kazandı
        const isCurrentHome = hid === homeTeamId;
        if (isCurrentHome && hs > as) mgrH2HWins++;
        else if (!isCurrentHome && as > hs) mgrH2HWins++;
      }
    }
    if (mgrH2HTotal > 0) M127 = (mgrH2HWins / mgrH2HTotal) * 100;
    // Son fallback: Menajer kariyer galibiyet oranlarını karşılaştır
    if (M127 == null) {
      const _calcMgrWinRate = (events, teamId) => {
        let wins = 0, total = 0;
        for (const ev of events) {
          const hs = ev.homeScore?.current;
          const as = ev.awayScore?.current;
          if (hs == null || as == null) continue;
          total++;
          const isH = ev.homeTeam?.id === teamId;
          if ((isH && hs > as) || (!isH && as > hs)) wins++;
        }
        return total > 0 ? wins / total : null;
      };
      const homeWR = _calcMgrWinRate(homeMgrEvents, homeTeamId);
      const awayWR = _calcMgrWinRate(awayMgrEvents, awayTeamId);
      if (homeWR != null && awayWR != null && (homeWR + awayWR) > 0) {
        M127 = (homeWR / (homeWR + awayWR)) * 100;
      } else if (homeWR != null) {
        M127 = homeWR * 100;
      } else if (awayWR != null) {
        M127 = (1 - awayWR) * 100;
      }
      // Hiçbir veri yoksa null bırak — statik değer sokma
    }
  }

  // ── M128: H2H Gol Farkı Trendi ──
  let goalDiffTrend = 0, m128Valid = 0;
  for (let i = 0; i < Math.min(5, finishedForForm.length); i++) {
    const ev = finishedForForm[i];
    const isEvHome = ev.homeTeam?.id === homeTeamId;
    const teamGoals = isEvHome ? (ev.homeScore?.current ?? null) : (ev.awayScore?.current ?? null);
    const oppGoals = isEvHome ? (ev.awayScore?.current ?? null) : (ev.homeScore?.current ?? null);
    if (teamGoals == null || oppGoals == null) continue;
    m128Valid++;
    goalDiffTrend += teamGoals - oppGoals;
  }
  const M128 = m128Valid > 0 ? goalDiffTrend / m128Valid : null;

  // ── M129: H2H Kart Ortalaması ──
  // ── M130: H2H Korner Ortalaması ──
  // data.h2hMatchDetails'ten gelir (data-fetcher tarafından ayrı ayrı çekilen incidents/stats).
  // Yoksa h2hEvents içindeki gömülü veriyi fallback olarak dener.
  const h2hMatchDetails = data.h2hMatchDetails || [];

  let totalH2HCards = 0;
  let totalH2HCorners = 0;
  let matchesWithIncidents = 0;

  // Her maç için önce h2hMatchDetails'ten ara, yoksa event'in kendi incidents/statistics'ine bak
  const eventsToScan = events.slice(0, 5);
  for (const ev of eventsToScan) {
    const detail = h2hMatchDetails.find(d => d.eventId === ev.id);
    let matchCards = 0, matchCorners = 0, foundData = false;

    // 1. h2hMatchDetails'ten (ayrı çekilen incidents)
    if (detail) {
      for (const inc of (detail.incidents || [])) {
        if (inc.incidentType === 'card') { matchCards++; foundData = true; }
      }
      for (const stat of (detail.statistics || [])) {
        const name = (stat.name || '').toLowerCase();
        if (name.includes('corner kick') || name === 'corner kicks') {
          const h = Number(stat.homeValue ?? 0);
          const a = Number(stat.awayValue ?? 0);
          matchCorners += h + a;
          foundData = true;
        }
        if (!name.includes('corner') && (name.includes('yellow card') || name.includes('red card'))) {
          const h = Number(stat.homeValue ?? 0);
          const a = Number(stat.awayValue ?? 0);
          matchCards += h + a;
          foundData = true;
        }
      }
    }

    // 2. Gömülü incidents/statistics (nadiren dolu gelir)
    if (!foundData) {
      if (Array.isArray(ev.incidents) && ev.incidents.length > 0) {
        for (const inc of ev.incidents) {
          if (inc.incidentType === 'card') { matchCards++; foundData = true; }
          if (inc.incidentType === 'corner') { matchCorners++; foundData = true; }
        }
      }
      if (!foundData && Array.isArray(ev.statistics) && ev.statistics.length > 0) {
        for (const stat of ev.statistics) {
          const name = (stat.name || '').toLowerCase();
          if (name.includes('corner')) {
            matchCorners += Number(stat.homeValue ?? 0) + Number(stat.awayValue ?? 0);
            foundData = true;
          }
          if (name.includes('yellow card') || name.includes('red card')) {
            matchCards += Number(stat.homeValue ?? 0) + Number(stat.awayValue ?? 0);
            foundData = true;
          }
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
    // --- New Advanced H2H Metrics (M18x Series) ---
    M183: M123,
    M184: M124,
    M185: M125,
    M187: M127,
    M188: M128,
    M189: M129,
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
