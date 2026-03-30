/**
 * Player Performance Metrics (M066–M095)
 * Oyuncu kalitesi, kadro etkisi, sakatlık etkisi, güçlü/güçsüze gol atma.
 */

function calculatePlayerMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const playerStats = isHome ? data.homePlayerStats : data.awayPlayerStats;
  const missingPlayers = data.missingPlayers;
  const teamPlayers = isHome ? data.homePlayers : data.awayPlayers;
  const topPlayers = isHome ? data.homeTopPlayers : data.awayTopPlayers;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
  const lastEvents = (isHome ? data.homeLastEvents : data.awayLastEvents) || [];
  const standings = data.standingsTotal;

  if (!playerStats || playerStats.length === 0) return createEmptyPlayerMetrics();

  const starters = playerStats.filter(p => !p.substitute);
  const subs = playerStats.filter(p => p.substitute);

  // ── M066: İlk 11 Ortalama Rating ──
  const starterRatings = starters
    .map(p => p.seasonStats?.statistics?.rating)
    .filter(r => r != null && r > 0);
  const M066 = starterRatings.length > 0
    ? starterRatings.reduce((a, b) => a + b, 0) / starterRatings.length : 0;

  // ── M067: Yedek Ortalama Rating ──
  const subRatings = subs
    .map(p => p.seasonStats?.statistics?.rating)
    .filter(r => r != null && r > 0);
  const M067 = subRatings.length > 0
    ? subRatings.reduce((a, b) => a + b, 0) / subRatings.length : 0;

  // ── M068: Rating Farkı ──
  const allRatings = [...starterRatings, ...subRatings];
  const M068 = allRatings.length > 1
    ? Math.max(...allRatings) - Math.min(...allRatings) : 0;

  // ── M069: Forvet Hattı Gol Katkısı ──
  const forwards = starters.filter(p => p.position === 'F' || p.position === 'FW');
  let forwardGoalContrib = 0;
  let teamTotalGoals = 0;

  for (const p of starters) {
    const goals = p.seasonStats?.statistics?.goals || 0;
    const assists = p.seasonStats?.statistics?.assists || 0;
    teamTotalGoals += goals;
    if (p.position === 'F' || p.position === 'FW') {
      forwardGoalContrib += goals + assists;
    }
  }
  const totalContrib = starters.reduce((sum, p) => {
    return sum + (p.seasonStats?.statistics?.goals || 0) + (p.seasonStats?.statistics?.assists || 0);
  }, 0);
  const M069 = totalContrib > 0 ? (forwardGoalContrib / totalContrib) * 100 : 0;

  // ── M070: Orta Saha Yaratıcılık İndeksi ──
  const midfielders = starters.filter(p => p.position === 'M' || p.position === 'MF');
  let midCreativity = 0;
  for (const p of midfielders) {
    const keyPasses = p.seasonStats?.statistics?.keyPasses || p.seasonStats?.statistics?.bigChancesCreated || 0;
    const assists = p.seasonStats?.statistics?.assists || 0;
    const appearances = p.seasonStats?.statistics?.appearances || 1;
    midCreativity += (keyPasses + assists) / appearances;
  }
  const M070 = midfielders.length > 0 ? midCreativity / midfielders.length : 0;

  // ── M071: Defans Hattı Stability Skoru ──
  const defenders = starters.filter(p => p.position === 'D' || p.position === 'DF');
  const defRatings = defenders
    .map(p => p.seasonStats?.statistics?.rating)
    .filter(r => r != null && r > 0);
  const M071 = defRatings.length > 0
    ? defRatings.reduce((a, b) => a + b, 0) / defRatings.length : 0;

  // ── M072: Oyuncu xG Katkısı ──
  let playerXG = 0;
  for (const p of starters) {
    playerXG += p.seasonStats?.statistics?.expectedGoals || 0;
  }
  const teamXG = playerXG || 1;
  const topScorerXG = Math.max(...starters.map(p => p.seasonStats?.statistics?.expectedGoals || 0), 0);
  const M072 = teamXG > 0 ? topScorerXG / teamXG : 0;

  // ── M073: Kilit Oyuncu Bağımlılık İndeksi ──
  const playerContribs = starters.map(p => {
    return (p.seasonStats?.statistics?.goals || 0) + (p.seasonStats?.statistics?.assists || 0);
  });
  const maxContrib = Math.max(...playerContribs, 0);
  const M073 = totalContrib > 0 ? (maxContrib / totalContrib) * 100 : 0;

  // ── M074: Dribling Başarı Oranı ──
  let totalSuccDrib = 0, totalDrib = 0;
  for (const p of starters) {
    totalSuccDrib += p.seasonStats?.statistics?.successfulDribbles || 0;
    totalDrib += p.seasonStats?.statistics?.totalDribbles ||
      (p.seasonStats?.statistics?.successfulDribbles || 0) + (p.seasonStats?.statistics?.failedDribbles || 0);
  }
  const M074 = totalDrib > 0 ? (totalSuccDrib / totalDrib) * 100 : 0;

  // ── M075: Pas Tamamlama Oranı ──
  let totalAccPass = 0, totalPass = 0;
  for (const p of starters) {
    totalAccPass += p.seasonStats?.statistics?.accuratePasses || p.seasonStats?.statistics?.accuratePassesPercentage || 0;
    totalPass += p.seasonStats?.statistics?.totalPasses || 1;
  }
  const M075 = totalPass > 0 ? (totalAccPass / totalPass) * 100 : 0;

  // ── M076: Hava Topu Gücü ──
  let totalAerialWon = 0, totalAerial = 0;
  for (const p of starters) {
    totalAerialWon += p.seasonStats?.statistics?.aerialDuelsWon || 0;
    totalAerial += (p.seasonStats?.statistics?.aerialDuelsWon || 0) +
      (p.seasonStats?.statistics?.aerialDuelsLost || 0);
  }
  const M076 = totalAerial > 0 ? (totalAerialWon / totalAerial) * 100 : 50;

  // ── M077-M078: Sakatlık ve Ceza Etkisi Skoru ──
  // API returns flat { players: [...] } with team.id on each entry — filter by teamId.
  const teamMissing = (missingPlayers?.players || []).filter(mp => mp.team?.id === teamId);

  let injuredImpact = 0, suspendedImpact = 0;
  const avgTeamRating = M066 || 6.5;

  for (const mp of teamMissing) {
    const playerId = mp.player?.id;
    // missing-players endpoint'inde player nesnesi içinde istatistik olmayabilir,
    // o yüzden playerStats or topPlayers içinden bulmaya çalışıyoruz.
    const playerInStats = playerStats.find(ps => ps.playerId === playerId);
    const playerRating = playerInStats?.seasonStats?.statistics?.rating || avgTeamRating;

    const isInjured = mp.type === 'injured' || mp.reason?.description?.includes('Injury');
    const isSuspended = mp.type === 'suspended' || mp.reason?.description?.includes('Suspended');

    if (isInjured) {
      injuredImpact += playerRating / avgTeamRating;
    } else if (isSuspended) {
      suspendedImpact += playerRating / avgTeamRating;
    }
  }
  const M077 = injuredImpact;
  const M078 = suspendedImpact;

  // ── M079: Kadro Derinliği İndeksi ──
  const allPlayers = teamPlayers?.players || [];
  const totalPlayerCount = allPlayers.length;
  const M079 = (totalPlayerCount / 25) * (M066 / 7.0);

  // ── M080: Dakika Dağılımı (Yorgunluk) ──
  const minutes = starters
    .map(p => p.seasonStats?.statistics?.minutesPlayed || 0)
    .filter(m => m > 0);
  const M080 = minutes.length > 1
    ? Math.max(...minutes) - Math.min(...minutes) : 0;

  // ── M081: Forvet xG/Şut Verimi ──
  let fwXG = 0, fwShots = 0;
  for (const p of forwards) {
    fwXG += p.seasonStats?.statistics?.expectedGoals || 0;
    fwShots += p.seasonStats?.statistics?.totalShots || p.seasonStats?.statistics?.shotsOnTarget || 0;
  }
  const M081 = fwShots > 0 ? fwXG / fwShots : 0;

  // ── M082-M084: Nitelik Puanları (Attribute Overviews) ──
  let attackAttr = 0, defenseAttr = 0, technicalAttr = 0, attrCount = 0;
  for (const p of starters) {
    const attrs = p.attributes?.averageAttributeOverviews?.[0];
    if (attrs) {
      attackAttr += attrs.attacking || 0;
      defenseAttr += attrs.defending || 0;
      technicalAttr += attrs.technical || 0;
      attrCount++;
    }
  }
  const M082 = attrCount > 0 ? attackAttr / attrCount : 0;
  const M083 = attrCount > 0 ? defenseAttr / attrCount : 0;
  const M084 = attrCount > 0 ? technicalAttr / attrCount : 0;

  // ── M085-M086: Güçlü/Zayıf Yön Sayıları ──
  let totalPositive = 0, totalNegative = 0;
  for (const p of starters) {
    const chars = p.characteristics;
    if (chars) {
      totalPositive += (chars.positive || []).length;
      totalNegative += (chars.negative || []).length;
    }
  }
  const M085 = starters.length > 0 ? totalPositive / starters.length : 0;
  const M086 = starters.length > 0 ? totalNegative / starters.length : 0;

  // ── M087-M088: Piyasa Değeri ──
  let starterValue = 0, subValue = 0;
  for (const p of allPlayers) {
    const val = p.player?.proposedMarketValue || 0;
    const isStarter = starters.some(s => s.playerId === p.player?.id);
    if (isStarter) starterValue += val;
    else subValue += val;
  }
  const M087 = starterValue;
  const M088 = starterValue > 0 ? subValue / starterValue : 0;

  // ── M089: Oyuncunun Rakibe Karşı Geçmişi ──
  // H2H maçlarındaki ortalama rating — basitleştirilmiş
  const M089 = M066; // Mevcut sezon rating'i kullanılır

  // ── M090-M091: Tutarlılık (StdDev) ──
  const goalPerMatch = [];
  const assistPerMatch = [];
  for (const match of recentDetails) {
    const isMatchHome = match.homeTeam?.id === teamId;
    const incidents = match.incidents?.incidents || [];
    let matchGoals = 0, matchAssists = 0;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome !== isMatchHome) continue;
      matchGoals++;
      if (inc.assist1) matchAssists++;
    }
    goalPerMatch.push(matchGoals);
    assistPerMatch.push(matchAssists);
  }
  const M090 = stdDev(goalPerMatch);
  const M091 = stdDev(assistPerMatch);

  // ── M092: Son 5 Maç Rating Trendi ──
  let totalTrend = 0;
  let matchesWithRatings = 0;

  for (const match of recentDetails) {
    const sideLineup = isHome ? match.lineups?.home : match.lineups?.away;
    if (sideLineup?.players) {
      const ratings = sideLineup.players
        .map(p => p.statistics?.rating)
        .filter(r => r != null && r > 0);
      if (ratings.length > 0) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        totalTrend += (avg - avgTeamRating);
        matchesWithRatings++;
      }
    }
  }
  const M092 = matchesWithRatings > 0 ? totalTrend / matchesWithRatings : 0;

  // ── M093: Kendinden Güçlüye Gol Atma Oranı ──
  let goalsVsStronger = 0, totalGoalsForCalc = 0;
  const teamPosition = findTeamPosition(standings, teamId);

  for (const ev of lastEvents.slice(0, 20)) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const opponentId = isEvHome ? ev.awayTeam?.id : ev.homeTeam?.id;
    const opponentPos = findTeamPosition(standings, opponentId);
    const scored = isEvHome ? (ev.homeScore?.current || 0) : (ev.awayScore?.current || 0);

    totalGoalsForCalc += scored;
    if (opponentPos && teamPosition && opponentPos < teamPosition) {
      goalsVsStronger += scored;
    }
  }
  const M093 = totalGoalsForCalc > 0 ? (goalsVsStronger / totalGoalsForCalc) * 100 : 0;

  // ── M094: Kendinden Güçsüzden Gol Yeme Oranı ──
  let goalsConcFromWeaker = 0, totalConcForCalc = 0;
  for (const ev of lastEvents.slice(0, 20)) {
    const isEvHome = ev.homeTeam?.id === teamId;
    const opponentId = isEvHome ? ev.awayTeam?.id : ev.homeTeam?.id;
    const opponentPos = findTeamPosition(standings, opponentId);
    const conceded = isEvHome ? (ev.awayScore?.current || 0) : (ev.homeScore?.current || 0);

    totalConcForCalc += conceded;
    if (opponentPos && teamPosition && opponentPos > teamPosition) {
      goalsConcFromWeaker += conceded;
    }
  }
  const M094 = totalConcForCalc > 0 ? (goalsConcFromWeaker / totalConcForCalc) * 100 : 0;

  // ── M095: Şansa Gol Atma İndeksi (%) ──
  // xG verisi olan maçlardaki (Gol - xG) farkı
  let luckyGoalsCount = 0, totalGoalsShotCount = 0;
  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome) continue;
      if (shot.shotType === 'goal') {
        totalGoalsShotCount++;
        // xG'si 0.1 altında olup gol olan şutları "şanslı" sayıyoruz
        if (shot.xg != null && shot.xg < 0.1) luckyGoalsCount++;
      }
    }
  }
  const M095 = totalGoalsShotCount > 0 ? (luckyGoalsCount / totalGoalsShotCount) * 100 : 0;

  return {
    M066, M067, M068, M069, M070, M071, M072, M073, M074, M075,
    M076, M077, M078, M079, M080, M081, M082, M083, M084, M085,
    M086, M087, M088, M089, M090, M091, M092, M093, M094, M095,
    _meta: { starterCount: starters.length, subCount: subs.length, missingCount: teamMissing.length }
  };
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const squareDiffs = arr.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

function findTeamPosition(standings, teamId) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) {
    for (const row of (s.rows || [])) {
      if (row.team?.id === teamId) return row.position;
    }
  }
  return null;
}

function createEmptyPlayerMetrics() {
  const m = {};
  for (let i = 66; i <= 95; i++) m[`M${String(i).padStart(3, '0')}`] = null;
  m._meta = { error: 'No player data' };
  return m;
}

module.exports = { calculatePlayerMetrics };
