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
  let M131 = 33.3, M132 = 33.3, M133 = 33.3, M134 = 50;
  let M134b = 50, M134c = 50, ahLine = null;

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
  let M135 = 33.3, M136 = 33.3, M137 = 33.3;
  if (votes) {
    const voteData = votes.vote || votes;
    const vote1 = voteData.vote1 || voteData.home || 0;
    const voteX = voteData.voteX || voteData.draw || 0;
    const vote2 = voteData.vote2 || voteData.away || 0;
    const totalVotes = vote1 + voteX + vote2;
    if (totalVotes > 0) {
      M135 = (vote1 / totalVotes) * 100;
      M136 = (voteX / totalVotes) * 100;
      M137 = (vote2 / totalVotes) * 100;
    }
  }

  // ── M138: Stadyum Kapasitesi Etkisi ──
  const capacity = event?.venue?.stadium?.capacity || 0;
  const M138 = capacity > 0 ? Math.min(capacity / 80000, 1) : 0.3; // 80K = normalize ref

  // ── M139-M140: Menajer Deneyimi ──
  let M139 = 50, M140 = 50;
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
    M140 = currentTeamMatches > 0 ? (currentTeamWins / currentTeamMatches) * 100 : 50;
  }

  // ── M141: Maçın Haftası (Round) Etkisi ──
  const currentRound = event?.roundInfo?.round || 0;
  const totalRounds = 38; // Çoğu lig 38 hafta — standings row count'tan da alınabilir
  const M141 = totalRounds > 0 ? currentRound / totalRounds : 0.5;

  // ── M142-M143: Puan Durumu Farkı ──
  const homeRow = findTeamRow(standings, homeTeamId);
  const awayRow = findTeamRow(standings, awayTeamId);
  const totalTeams = getTotalTeams(standings);

  const homePos = homeRow?.position || totalTeams / 2;
  const awayPos = awayRow?.position || totalTeams / 2;
  const M142 = totalTeams > 0 ? Math.abs(homePos - awayPos) / totalTeams : 0;

  const homePoints = homeRow?.points || 0;
  const awayPoints = awayRow?.points || 0;
  const M143 = Math.abs(homePoints - awayPoints);

  // ── M144: Lig Gücü İndeksi (normalize) ──
  // Top 5 lig ID'leri: Premier League=17, LaLiga=8, Bundesliga=35, SerieA=23, Ligue1=34
  const ligGücüMap = { 17: 100, 8: 95, 35: 88, 23: 90, 34: 82, 52: 65, 7: 100, 679: 85 };
  const M144 = ligGücüMap[data.tournamentId] || 50;

  // ── M145: Transfer Net Harcama Etkisi ──
  let homeMarketValue = 0, awayMarketValue = 0;
  const homePl = homePlayers?.players || [];
  const awayPl = awayPlayers?.players || [];

  for (const p of homePl) homeMarketValue += p.player?.proposedMarketValue || 0;
  for (const p of awayPl) awayMarketValue += p.player?.proposedMarketValue || 0;

  const maxValue = Math.max(homeMarketValue, awayMarketValue, 1);
  const M145 = homeMarketValue / maxValue; // Ev sahibinin görece gücü

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
  if (!standings?.standings) return 20;
  for (const s of standings.standings) return (s.rows || []).length;
  return 20;
}

module.exports = { calculateContextualMetrics };
