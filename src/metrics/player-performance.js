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

  // ── M067: Yedek Ortalama Rating (Katılım Olasılığı Ağırlıklı) ──
  // Her yedeğin rating'i 0.6 katılım olasılığıyla ağırlıklandırılır.
  // 0.6: modern futbolda ortalama yedek sahaya girme olasılığı (5 değişiklik hakkıyla ~60%)
  const SUB_PARTICIPATION_PROB = 0.6;
  const subWeightedRatings = subs
    .map(p => {
      const rating = p.seasonStats?.statistics?.rating;
      return (rating != null && rating > 0) ? rating * SUB_PARTICIPATION_PROB : null;
    })
    .filter(r => r != null);
  const M067 = subWeightedRatings.length > 0
    ? subWeightedRatings.reduce((a, b) => a + b, 0) / subWeightedRatings.length : 0;

  // ── M068: Rating Farkı ──
  const subRatings = subs.map(p => p.seasonStats?.statistics?.rating).filter(r => r != null && r > 0);
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
  // Temel hesap: kadro içinde en yüksek gol+asist katkısına sahip oyuncunun payı
  const playerContribs = starters.map(p => {
    return (p.seasonStats?.statistics?.goals || 0) + (p.seasonStats?.statistics?.assists || 0);
  });
  const maxContrib = Math.max(...playerContribs, 0);
  const baseM073 = totalContrib > 0 ? (maxContrib / totalContrib) * 100 : 0;

  // topPlayers entegrasyonu: API'nin yıldız olarak işaretlediği oyunculardan star bonus hesapla
  // starScore: rating > 8.0 veya goals > 10 olan oyuncuların normalize edilmiş etki puanı
  let starBonus = 0;
  const topPlayersList = Array.isArray(topPlayers) ? topPlayers : [];
  if (topPlayersList.length > 0) {
    let starScoreSum = 0;
    for (const tp of topPlayersList) {
      const rating = tp.statistics?.rating || 0;
      const goals = tp.statistics?.goals || 0;
      const assists = tp.statistics?.assists || 0;
      // Yıldız kriter: rating > 8.0 → yüksek etki, goals > 10 → ek bonus
      const ratingScore = rating > 8.0 ? (rating - 8.0) * 25 : 0;  // 8.1→2.5, 9.0→25, 10→50
      const goalScore = goals > 10 ? Math.min(50, (goals - 10) * 2.5) : 0;
      const assistScore = Math.min(20, assists * 2);
      starScoreSum += ratingScore + goalScore + assistScore;
    }
    // topPlayers sayısına bölerek ortalama al, 0-100 arasına sıkıştır
    starBonus = Math.min(100, starScoreSum / topPlayersList.length);
  }

  // topPlayers varsa: %30 star bonus + %70 mevcut hesap; yoksa mevcut hesap değişmez
  const M073 = topPlayersList.length > 0
    ? starBonus * 0.30 + baseM073 * 0.70
    : baseM073;

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

  // ── M077-M078: Sakatlık ve Ceza Etkisi Skoru (Pozisyon Kritikliği Ağırlıklı) ──
  // Pozisyon kritikliği: Kaleci > Forvet > Defans > Orta Saha
  // Alternatif azlığı: Aynı pozisyonda kaç sağlam oyuncu var → az = yüksek etki
  const teamMissing = (missingPlayers?.players || []).filter(mp => mp.team?.id === teamId);

  const POSITION_CRITICALITY = { G: 2.0, D: 1.2, M: 1.0, F: 1.3 };
  let injuredImpact = 0, suspendedImpact = 0;
  const avgTeamRating = M066 || 6.5;
  const allPlayers = teamPlayers?.players || [];

  for (const mp of teamMissing) {
    const playerId = mp.player?.id;
    const playerInStats = playerStats.find(ps => ps.playerId === playerId);
    const missingPosition = mp.player?.position || playerInStats?.position || 'M';
    const playerRating = playerInStats?.seasonStats?.statistics?.rating || avgTeamRating;

    // Pozisyon kritiklik çarpanı
    const posCrit = POSITION_CRITICALITY[missingPosition] || 1.0;

    // Aynı pozisyonda kaç sağlam alternatif var (kadrodaki)
    const alternatives = allPlayers.filter(p =>
      p.player?.position === missingPosition
    ).length - 1; // kendisi hariç
    // 0 alternatif → factor 1.0, her ek alternatif etkiyi %20 düşürür, min 0.3
    const replacementFactor = Math.max(0.3, 1 - Math.max(0, alternatives - 1) * 0.2);

    const baseImpact = (playerRating / avgTeamRating) * posCrit * replacementFactor;

    const isInjured = mp.type === 'injured' || mp.reason?.description?.toLowerCase().includes('injury');
    const isSuspended = mp.type === 'suspended' || mp.reason?.description?.toLowerCase().includes('suspended');

    if (isInjured) {
      injuredImpact += baseImpact;
    } else if (isSuspended) {
      suspendedImpact += baseImpact;
    }
  }
  const M077 = injuredImpact;
  const M078 = suspendedImpact;

  // ── M079: Kadro Derinliği İndeksi ──
  const totalPlayerCount = allPlayers.length;
  const M079 = (totalPlayerCount / 25) * (M066 / 7.0);

  // ── M079b: Bench Güç Skoru ──
  // Yedek oyuncuların kalitesi ile sayısının birleşik skoru (0-100)
  // benchRatingScore: yedeklerin ortalama ağırlıklı rating'i (M067 bazlı)
  // benchDepthScore: kaç yedeğin gerçek anlamda kullanılabilir olduğu (min 5 = tam derinlik)
  const availableSubCount = subs.filter(p => p.seasonStats?.statistics?.rating != null).length;
  const benchRatingScore = M067 > 0 ? Math.min(100, (M067 / 7.5) * 100) : 0;
  const benchDepthScore = Math.min(100, (availableSubCount / 5) * 100);
  // Ağırlıklar: Rating kalitesi %60, Derinlik (oyuncu sayısı) %40
  const M079b = benchRatingScore * 0.6 + benchDepthScore * 0.4;

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
  // Eşleştirme: playerStats'taki playerId ile teamPlayers'taki player.id karşılaştırılır
  const starterPlayerIds = new Set(starters.map(p => p.playerId).filter(Boolean));
  const subPlayerIds = new Set(subs.map(p => p.playerId).filter(Boolean));

  let starterValue = 0, subValue = 0, otherValue = 0;
  for (const p of allPlayers) {
    const pid = p.player?.id;
    const val = p.player?.proposedMarketValue || 0;
    if (pid && starterPlayerIds.has(pid)) {
      starterValue += val;
    } else if (pid && subPlayerIds.has(pid)) {
      subValue += val;
    } else {
      otherValue += val; // Kadrodaki diğer oyuncular (stats alınamamış)
    }
  }
  const M087 = starterValue;
  // M088: Yedek/Starter değer oranı — 1.0 = eşit güç, >1.0 = yedekler daha değerli
  const M088 = starterValue > 0 ? subValue / starterValue : 0;

  // ── M089: Oyuncunun Rakibe Karşı Geçmişi (H2H Lineup Presence) ──
  // Mevcut starter kadrosundan kaç oyuncunun H2H maçlarında sahaya çıktığını ölçer.
  // playerH2HPresence = H2H maçlarında görünen starter'lar / toplam starter sayısı
  // M089 = playerH2HPresence * 100 → 0-100 scale
  // Fallback: h2hEvents yoksa veya lineup verisi yoksa M066 kullanılır (sezon rating bazlı)
  let M089;
  const h2hEvents = data.h2hEvents || [];
  const starterPlayerIdSet = new Set(starters.map(p => p.playerId).filter(Boolean));

  if (h2hEvents.length === 0 || starterPlayerIdSet.size === 0) {
    // Fallback: H2H verisi yok
    M089 = M066;
  } else {
    const seenInH2H = new Set();

    for (const h2hMatch of h2hEvents) {
      // Bu H2H maçında geçerli takımın hangi tarafta olduğunu belirle
      const matchHomeId = h2hMatch.homeTeam?.id;
      const matchAwayId = h2hMatch.awayTeam?.id;

      let sideLineup = null;
      if (matchHomeId === teamId) {
        sideLineup = h2hMatch.lineups?.home;
      } else if (matchAwayId === teamId) {
        sideLineup = h2hMatch.lineups?.away;
      } else {
        // Takım bu maçta yok (veri tutarsızlığı), geç
        continue;
      }

      if (!sideLineup?.players) continue;

      for (const lp of sideLineup.players) {
        const pid = lp.player?.id;
        if (pid && starterPlayerIdSet.has(pid)) {
          seenInH2H.add(pid);
        }
      }
    }

    const playerH2HPresence = seenInH2H.size / starterPlayerIdSet.size;
    M089 = playerH2HPresence * 100;
  }

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

  // ── M092: Son Maçlar Bireysel Rating Trendi ──
  // Her mevcut kadro oyuncusunun son maçtaki ratingini sezon ortalamasıyla karşılaştırır.
  // Sadece takım ortalaması değil, MEVCUT KADRODA OLAN oyuncular için hesaplanır.
  const currentStarterIds = new Set(starters.map(p => p.playerId).filter(Boolean));
  const playerTrends = new Map(); // playerId → [trendDelta, ...]

  for (const match of recentDetails) {
    const sideLineup = isHome ? match.lineups?.home : match.lineups?.away;
    if (!sideLineup?.players) continue;

    for (const lp of sideLineup.players) {
      const pid = lp.player?.id;
      if (!pid || !currentStarterIds.has(pid)) continue; // Sadece mevcut ilk 11
      const matchRating = lp.statistics?.rating;
      if (matchRating == null || matchRating <= 0) continue;

      // Bu oyuncunun sezon ortalaması
      const starterData = starters.find(s => s.playerId === pid);
      const seasonRating = starterData?.seasonStats?.statistics?.rating || avgTeamRating;
      const delta = matchRating - seasonRating;

      if (!playerTrends.has(pid)) playerTrends.set(pid, []);
      playerTrends.get(pid).push(delta);
    }
  }

  // Her oyuncu için ortalama delta al, sonra tüm oyuncuların ortalaması
  let totalPlayerTrend = 0;
  let playersWithTrend = 0;
  for (const [, deltas] of playerTrends) {
    if (deltas.length === 0) continue;
    totalPlayerTrend += deltas.reduce((a, b) => a + b, 0) / deltas.length;
    playersWithTrend++;
  }
  const M092 = playersWithTrend > 0 ? totalPlayerTrend / playersWithTrend : 0;

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
    M076, M077, M078, M079, M079b, M080, M081, M082, M083, M084, M085,
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
  m.M079b = null;
  m._meta = { error: 'No player data' };
  return m;
}

module.exports = { calculatePlayerMetrics };
