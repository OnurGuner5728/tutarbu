/**
 * Contextual Metrics (M131–M145)
 * Bahis oranları, kullanıcı oyları, stadyum, menajer deneyimi, sezon bağlamı, puan farkı.
 */

function calculateContextualMetrics(data) {
  const odds = data.odds;
  const votes = data.votes;
  const event = data.event?.event;
  const standings = data.standingsTotal;
  const homeTeamId = data.homeTeamId;
  const awayTeamId = data.awayTeamId;
  const homePlayers = data.homePlayers;
  const awayPlayers = data.awayPlayers;

  // ── M131-M134: Bahis Oranı İma Edilen Olasılıklar ──
  let M131 = null, M132 = null, M133 = null, M134 = null;
  let M134b = null, M134c = null, ahLine = null;

  const markets = odds?.markets || [];
  for (const market of markets) {
    if (market.marketId === 1 || market.marketName === '1X2' || market.marketName === 'Full time') {
      for (const choice of (market.choices || [])) {
        const decimal = parseFloat(choice.decimalValue) || 0;
        if (decimal > 0) {
          if (choice.name === '1') M131 = (1 / decimal) * 100;
          if (choice.name === 'X') M132 = (1 / decimal) * 100;
          if (choice.name === '2') M133 = (1 / decimal) * 100;
        }
      }
    }
    if (market.marketId === 11 || market.marketName === 'Over/Under') {
      for (const choice of (market.choices || [])) {
        const decimal = parseFloat(choice.decimalValue) || 0;
        if (decimal > 0 && (choice.name === 'Over 2.5' || choice.name === 'Over')) {
          M134 = (1 / decimal) * 100;
        }
      }
    }
  }

  // ── M134b: Asian Handicap İma Edilen Olasılık (Ev Sahibi) ──
  // AH hat 0 ise dengeli maç; negatif hat → ev sahibi favori
  for (const market of markets) {
    const mName = (market.marketName || '').toLowerCase();
    const mId = market.marketId;

    // Asian Handicap tespiti
    if (mId === 2 || mName.includes('asian handicap') || mName.includes('asian')) {
      for (const choice of (market.choices || [])) {
        const decimal = parseFloat(choice.decimalValue) || 0;
        if (decimal > 0 && (choice.name === '1' || choice.name?.includes('Home'))) {
          M134b = (1 / decimal) * 100;
          // Handicap hattını çıkarmaya çalış
          const handicapMatch = (choice.name + (choice.handicap || '')).match(/[-+]?\d*\.?\d+/);
          if (handicapMatch) ahLine = parseFloat(handicapMatch[0]);
        }
      }
    }

    // Draw No Bet (DNB) tespiti
    if (mId === 3 || mName.includes('draw no bet') || mName.includes('dnb')) {
      for (const choice of (market.choices || [])) {
        const decimal = parseFloat(choice.decimalValue) || 0;
        if (decimal > 0 && (choice.name === '1' || choice.name?.includes('Home'))) {
          M134c = (1 / decimal) * 100;
        }
      }
    }
  }

  // ── M135-M137: Kullanıcı Oyları ──
  let M135 = null, M136 = null, M137 = null;
  if (votes) {
    const voteData = votes.vote || votes;
    const vote1Raw = voteData.vote1 ?? voteData.home ?? null;
    const voteXRaw = voteData.voteX ?? voteData.draw ?? null;
    const vote2Raw = voteData.vote2 ?? voteData.away ?? null;
    if (vote1Raw != null && voteXRaw != null && vote2Raw != null) {
      const totalVotes = vote1Raw + voteXRaw + vote2Raw;
      if (totalVotes > 0) {
        M135 = (vote1Raw / totalVotes) * 100;
        M136 = (voteXRaw / totalVotes) * 100;
        M137 = (vote2Raw / totalVotes) * 100;
      }
    }
  }

  // ── M138: Stadyum Kapasitesi Etkisi ──
  const capacity = event?.venue?.stadium?.capacity || 0;
  const M138 = capacity > 0 ? Math.min(capacity / 80000, 1) : null; // 80K = normalize ref

  // ── M139-M140: Menajer Deneyimi ──
  let M139 = null, M140 = null;
  const homeCareer = data.homeManagerCareer;
  const awayCareer = data.awayManagerCareer;

  if (homeCareer?.career || homeCareer) {
    const entries = homeCareer.career || [homeCareer];
    let totalMgrMatches = 0;
    let currentTeamWins = 0, currentTeamMatches = 0;

    for (const entry of entries) {
      totalMgrMatches += entry.matches || entry.totalMatches || 0;
      if (entry.team?.id === homeTeamId || entry.teamId === homeTeamId) {
        currentTeamWins += entry.wins || 0;
        currentTeamMatches += entry.matches || entry.totalMatches || 0;
      }
    }
    M139 = Math.min((totalMgrMatches / 500) * 100, 100); // 500 maç = max deneyim
    M140 = currentTeamMatches > 0 ? (currentTeamWins / currentTeamMatches) * 100 : null;
  }

  // ── M141: Maçın Haftası (Round) Etkisi ──
  const standingsRows = data.standingsTotal?.standings?.[0]?.rows || [];
  const currentRound = event?.roundInfo?.round || 0;
  const teamCount = standingsRows.length;
  const totalRounds = teamCount >= 4 ? (teamCount - 1) * 2 : null;
  const M141 = currentRound > 0 && totalRounds != null ? currentRound / totalRounds : null;

  // ── M142-M143: Puan Durumu Farkı ──
  const homeRow = findTeamRow(standings, homeTeamId);
  const awayRow = findTeamRow(standings, awayTeamId);
  const totalTeams = getTotalTeams(standings);

  const homePos = homeRow?.position ?? null;
  const awayPos = awayRow?.position ?? null;
  const M142 = (homePos != null && awayPos != null && totalTeams > 0) ? Math.abs(homePos - awayPos) / totalTeams : null;

  const homePoints = homeRow?.points ?? null;
  const awayPoints = awayRow?.points ?? null;
  const M143 = (homePoints != null && awayPoints != null) ? Math.abs(homePoints - awayPoints) : null;

  // ── M144: Lig Gücü İndeksi (normalize) ──
  // Standings üzerinden dinamik hesap (avgGoals + takım sayısı)
  // Standings yetersizse null (hardcoded fallback kaldırıldı)
  let M144 = null;
  if (standingsRows.length >= 4) {
    const totalGoals = standingsRows.reduce((s, r) => s + (r.scoresFor || 0), 0);
    const totalGames = Math.max(standingsRows.reduce((s, r) => s + (r.played || 0), 0), 1);
    const avgGoals = totalGoals / totalGames;
    const teamCount = standingsRows.length;
    M144 = Math.min(100, Math.round(50 + avgGoals * 10 + (teamCount >= 18 ? 10 : 0)));
  }

  // ── M145: Transfer Net Harcama Etkisi ──
  let homeMarketValue = 0, awayMarketValue = 0;
  const homePl = homePlayers?.players || [];
  const awayPl = awayPlayers?.players || [];

  for (const p of homePl) homeMarketValue += p.player?.proposedMarketValue || 0;
  for (const p of awayPl) awayMarketValue += p.player?.proposedMarketValue || 0;

  const maxValue = Math.max(homeMarketValue, awayMarketValue);
  const M145 = maxValue > 0 ? homeMarketValue / maxValue : null;

  return {
    M131, M132, M133, M134, M134b, M134c, M135, M136, M137, M138, M139, M140,
    M141, M142, M143, M144, M145,
    _meta: {
      oddsAvailable: markets.length > 0,
      votesAvailable: !!votes,
      stadiumCapacity: capacity,
    }
  };
}

function findTeamRow(standings, teamId) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) {
    for (const row of (s.rows || [])) {
      if (row.team?.id === teamId) return row;
    }
  }
  return null;
}

function getTotalTeams(standings) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) return (s.rows || []).length;
  return null;
}

module.exports = { calculateContextualMetrics };
