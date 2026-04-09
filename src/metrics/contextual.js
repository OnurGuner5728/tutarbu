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

  // ── Bahis Oranı Yardımcısı ──
  // SofaScore bazen decimalValue, bazen fractionalValue döndürür.
  // fractionalValue: "163/100" → decimal = (163+100)/100 = 2.63
  function parseOddsDecimal(choice) {
    if (choice.decimalValue != null) {
      const d = parseFloat(choice.decimalValue);
      return (!isNaN(d) && d > 1) ? d : null;
    }
    if (choice.fractionalValue != null) {
      const parts = String(choice.fractionalValue).split('/');
      if (parts.length !== 2) return null;
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (isNaN(num) || isNaN(den) || den === 0) return null;
      return (num + den) / den;
    }
    return null;
  }

  // ── M131-M134: Bahis Oranı İma Edilen Olasılıklar ──
  let M131 = null, M132 = null, M133 = null, M134 = null;
  let M134b = null, M134c = null, ahLine = null;

  // Ev takımı adı (AH choice name eşleşmesi için)
  const homeTeamName = (event?.homeTeam?.name || '').toLowerCase();

  const markets = odds?.markets || [];
  for (const market of markets) {
    const mId = market.marketId;
    const mName = (market.marketName || '').toLowerCase();

    // 1X2 (Full time)
    if (mId === 1 || mName === '1x2' || mName === 'full time') {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal != null) {
          if (choice.name === '1') M131 = (1 / decimal) * 100;
          if (choice.name === 'X') M132 = (1 / decimal) * 100;
          if (choice.name === '2') M133 = (1 / decimal) * 100;
        }
      }
    }

    // Over/Under 2.5 — marketId=9 (choiceGroup="2.5") veya marketId=11 veya marketName içerir
    const isMatchGoals = mId === 9 || mId === 11 || mName.includes('over/under') || mName.includes('match goals');
    if (isMatchGoals) {
      const cg = String(market.choiceGroup ?? '');
      const is25 = cg === '2.5' || cg === '2,5';
      // choiceGroup bilgisi yoksa sadece 'Over 2.5' isimli choice'ı al
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const isOver = choice.name === 'Over 2.5' || (choice.name === 'Over' && is25);
        if (isOver) M134 = (1 / decimal) * 100;
      }
    }

    // Asian Handicap — marketId=17 veya mName içerir
    if (mId === 17 || mName.includes('asian handicap') || mName.includes('asian')) {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const cName = (choice.name || '').toLowerCase();
        // choice.name = "(0) Real Madrid" veya "1" veya "Home" gibi olabilir
        const isHome = cName === '1' || cName.includes('home') || (homeTeamName && cName.includes(homeTeamName));
        if (isHome) {
          M134b = (1 / decimal) * 100;
          const hMatch = (choice.name + (choice.handicap || '')).match(/[-+]?\d*\.?\d+/);
          if (hMatch) ahLine = parseFloat(hMatch[0]);
        }
      }
    }

    // Draw No Bet — marketId=4 veya mName içerir
    if (mId === 4 || mName.includes('draw no bet') || mName.includes('dnb')) {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const cName = (choice.name || '').toLowerCase();
        const isHome = cName === '1' || cName.includes('home') || (homeTeamName && cName.includes(homeTeamName));
        if (isHome) M134c = (1 / decimal) * 100;
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
  const capacity = event?.venue?.stadium?.capacity;
  const M138 = (capacity != null && capacity > 0) ? Math.min(capacity / 80000, 1) : null; 

  // ── M139-M140: Menajer Deneyimi & Galibiyet Oranı ──
  // homeManagerCareer = getManagerLastEvents sonucu: { events: [...] }
  // M139: Son sayfada kaç maç var (0-20) → deneyim skoru (0-100)
  // M140: Mevcut takımla (homeTeamId) son maçlardaki galibiyet oranı
  let M139 = null, M140 = null;
  const homeMgrLastEv = data.homeManagerCareer?.events || [];
  const finishedMgrEv = homeMgrLastEv.filter(e =>
    e.status?.type === 'finished' && e.homeScore?.current != null && e.awayScore?.current != null
  );

  if (finishedMgrEv.length > 0) {
    M139 = Math.min((finishedMgrEv.length / 20) * 100, 100);

    let currentTeamWins = 0, currentTeamMatches = 0;
    for (const ev of finishedMgrEv) {
      const isHome = ev.homeTeam?.id === homeTeamId;
      const isAway = ev.awayTeam?.id === homeTeamId;
      if (!isHome && !isAway) continue;
      currentTeamMatches++;
      const hs = ev.homeScore.current;
      const as = ev.awayScore.current;
      if ((isHome && hs > as) || (isAway && as > hs)) currentTeamWins++;
    }
    M140 = currentTeamMatches > 0 ? (currentTeamWins / currentTeamMatches) * 100 : null;
  }

  // ── M141: Maçın Haftası (Round) Etkisi ──
  const standingsRows = data.standingsTotal?.standings?.[0]?.rows || [];
  const currentRound = event?.roundInfo?.round;
  const teamCount = standingsRows.length;
  const totalRounds = teamCount >= 4 ? (teamCount - 1) * 2 : null;
  const M141 = (currentRound != null && currentRound > 0 && totalRounds != null) ? currentRound / totalRounds : null;

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
  let M144 = null;
  if (standingsRows.length >= 4) {
    const totalGoals = standingsRows.reduce((s, r) => s + (r.scoresFor ?? 0), 0);
    const totalGames = Math.max(standingsRows.reduce((s, r) => s + (r.played ?? 0), 0), 1);
    const avgGoals = totalGoals / totalGames;
    const teamCount = standingsRows.length;
    // Yeni Formül: 40 baz puan + (Gol ortalaması * 15) + (takım sayısı >= 18 ? 15 : 0)
    // Örnek: UCL (3.0 gol, 36 takım) -> 40 + 45 + 15 = 100
    // Örnek: Yerel Lig (2.4 gol, 14 takım) -> 40 + 36 + 0 = 76
    M144 = Math.min(100, Math.round(40 + avgGoals * 15 + (teamCount >= 18 ? 15 : 0)));
  }

  // ── M145: Transfer Net Harcama Etkisi ──
  let homeMarketValue = 0, awayMarketValue = 0;
  const homePl = homePlayers?.players || [];
  const awayPl = awayPlayers?.players || [];

  for (const p of homePl) {
    const val = p.player?.proposedMarketValue;
    if (val != null) homeMarketValue += val;
  }
  for (const p of awayPl) {
    const val = p.player?.proposedMarketValue;
    if (val != null) awayMarketValue += val;
  }

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
