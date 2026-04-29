/**
 * Player Performance Metrics (M066–M095)
 * Oyuncu kalitesi, kadro etkisi, sakatlık etkisi, güçlü/güçsüze gol atma.
 */

const { calculateDynamicRating } = require('../engine/player-rating-utils');

/**
 * Builds a map of { [playerId]: avgMinutesPerMatch } from recent match incidents.
 *
 * For each match in recentDetails:
 *   - substitution incidents with incidentType === 'substitution':
 *       playerOut.id  → played `inc.time` minutes (subbed off)
 *       playerIn.id   → played `(90 - inc.time)` minutes (subbed on)
 *   - players with no substitution incident are assumed to have played 90 minutes.
 *
 * Only players present in playerStats are included in the returned map.
 *
 * Falls back gracefully: if recentDetails is empty or has no substitution data,
 * every player in playerStats gets an implicit 90-minute average (no change to
 * existing behaviour because weight = 90/90 = 1.0).
 *
 * @param {Array}  recentDetails - Array of recent match detail objects.
 * @param {Array}  playerStats   - Array of player stat objects (must have .playerId).
 * @returns {{ [playerId: number]: number }} avgMinutesPerMatch per player.
 */
function getPlayerMinutesMap(recentDetails, playerStats) {
  const knownIds = new Set((playerStats || []).map(p => p.playerId).filter(Boolean));
  if (knownIds.size === 0 || !Array.isArray(recentDetails) || recentDetails.length === 0) {
    // No data — return 90 for every player so weights are neutral (1.0)
    const fallback = {};
    for (const id of knownIds) fallback[id] = 90;
    return fallback;
  }

  // Accumulate minutes per player across all recent matches
  // matchMinutes[playerId] = [minutesInMatch1, minutesInMatch2, ...]
  const matchMinutes = {};

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents;
    if (!Array.isArray(incidents)) continue;

    // Collect substitution events for this match
    const subbedOutAt = {};   // playerId → minute subbed off
    const subbedInAt = {};   // playerId → minute subbed on

    for (const inc of incidents) {
      if (inc.incidentType !== 'substitution') continue;
      const outId = inc.playerOut?.id;
      const inId = inc.playerIn?.id;
      const minute = typeof inc.time === 'number' ? inc.time : null;
      if (minute == null) continue;

      if (outId) subbedOutAt[outId] = minute;
      if (inId) subbedInAt[inId] = minute;
    }

    // For each known player, determine minutes played in this match
    for (const pid of knownIds) {
      let minutes;
      if (subbedOutAt[pid] != null) {
        // Player was substituted off — played until the substitution minute
        minutes = subbedOutAt[pid];
      } else if (subbedInAt[pid] != null) {
        // Player came on as a substitute — played the remainder
        minutes = Math.max(0, 90 - subbedInAt[pid]);
      } else if (Object.keys(subbedOutAt).length > 0 || Object.keys(subbedInAt).length > 0) {
        // There were substitutions in this match but this player was not involved → full 90
        minutes = 90;
      } else {
        // No substitution data at all for this match → assume 90
        minutes = 90;
      }

      if (!matchMinutes[pid]) matchMinutes[pid] = [];
      matchMinutes[pid].push(minutes);
    }
  }

  // Convert to averages; fall back to 90 for players with no recorded entries
  const avgMap = {};
  for (const pid of knownIds) {
    const entries = matchMinutes[pid];
    if (entries && entries.length > 0) {
      avgMap[pid] = entries.reduce((a, b) => a + b, 0) / entries.length;
    } else {
      avgMap[pid] = 90; // No match data → neutral weight
    }
  }
  return avgMap;
}

/**
 * computeSubParticipationProb(recentDetails, subs)
 * Derives the fraction of bench players who actually enter the match,
 * computed from substitution incidents across recent matches.
 * Returns null when there is insufficient data.
 */
function computeSubParticipationProb(recentDetails, subs) {
  const benchSize = subs.length;
  if (benchSize === 0 || !Array.isArray(recentDetails) || recentDetails.length === 0) return null;

  let totalSubIns = 0;
  let matchCount = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents;
    if (!Array.isArray(incidents)) continue;
    matchCount++;
    // Count unique playerIn IDs per match to avoid double-counting
    const subInIds = new Set(
      incidents
        .filter(inc => inc.incidentType === 'substitution' && inc.playerIn?.id)
        .map(inc => inc.playerIn.id)
    );
    totalSubIns += subInIds.size;
  }
  if (matchCount === 0) return null;
  return Math.min(1.0, totalSubIns / (matchCount * benchSize));
}

function calculatePlayerMetrics(data, side, dynamicAvgs) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const playerStats = isHome ? data.homePlayerStats : data.awayPlayerStats;
  const missingPlayers = data.missingPlayers;
  const teamPlayers = isHome ? data.homePlayers : data.awayPlayers;
  const topPlayers = isHome ? data.homeTopPlayers : data.awayTopPlayers;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
  const lastEvents = (isHome ? data.homeLastEvents : data.awayLastEvents) || [];
  const standings = data.standingsTotal;
  const _dynAvg = dynamicAvgs || {};

  if (!playerStats || playerStats.length === 0) return createEmptyPlayerMetrics();

  // isReserve:true ama substitute:false olabilir (edge case) — reserve asla starter sayılmaz
  const starters = playerStats.filter(p => !p.substitute && !p.isReserve);
  const subs = playerStats.filter(p => p.substitute || p.isReserve);

  // Substitution-aware minutes map — weights each player by actual minutes played
  const minutesMap = getPlayerMinutesMap(recentDetails, playerStats);

  // ── M066: İlk 11 Ortalama Rating (dakika ağırlıklı) ──
  const starterRatingEntries = starters
    .map(p => {
      const rating = p.seasonStats?.statistics?.rating;
      if (rating == null || rating <= 0) return null;
      const weight = (minutesMap[p.playerId] ?? 90) / 90;
      return { rating, weight };
    })
    .filter(r => r != null);
  const starterTotalWeight = starterRatingEntries.reduce((a, b) => a + b.weight, 0);
  const M066 = starterTotalWeight > 0
    ? starterRatingEntries.reduce((a, b) => a + b.rating * b.weight, 0) / starterTotalWeight : null;
  // Keep plain array for M068/other downstream uses
  const starterRatings = starterRatingEntries.map(e => e.rating);

  // ── M067: Yedek Ortalama Rating (katılım + dakika ağırlıklı) ──
  // SUB_PARTICIPATION_PROB: recentDetails substitution incidents'tan türetilir.
  // Veri yoksa sabit kullanılmaz — katılım ağırlığı uygulanmaz (1.0 olarak işlenir).
  const SUB_PARTICIPATION_PROB = computeSubParticipationProb(recentDetails, subs);
  const subWeightedRatings = subs
    .map(p => {
      const rating = p.seasonStats?.statistics?.rating;
      if (rating == null || rating <= 0) return null;
      const minuteWeight = (minutesMap[p.playerId] ?? 90) / 90;
      const participationWeight = SUB_PARTICIPATION_PROB ?? 1.0;
      return rating * participationWeight * minuteWeight;
    })
    .filter(r => r != null);
  const M067 = subWeightedRatings.length > 0
    ? subWeightedRatings.reduce((a, b) => a + b, 0) / subWeightedRatings.length : null;

  // ── M068: Rating Farkı ──
  const subRatings = subs.map(p => p.seasonStats?.statistics?.rating).filter(r => r != null && r > 0);
  const allRatings = [...starterRatings, ...subRatings];
  const M068 = allRatings.length > 1
    ? Math.max(...allRatings) - Math.min(...allRatings) : null;

  // ── M069: Forvet Hattı Gol Katkısı ──
  const forwards = starters.filter(p => p.position === 'F' || p.position === 'FW');
  let forwardGoalContrib = 0;
  let teamTotalGoals = 0;

  for (const p of starters) {
    const goals = p.seasonStats?.statistics?.goals;
    if (goals == null) continue;
    const assists = p.seasonStats?.statistics?.assists || 0;
    teamTotalGoals += goals;
    if (p.position === 'F' || p.position === 'FW') {
      forwardGoalContrib += goals + assists;
    }
  }
  const totalContrib = starters.reduce((sum, p) => {
    const pG = p.seasonStats?.statistics?.goals;
    const pA = p.seasonStats?.statistics?.assists;
    if (pG == null && pA == null) return sum;
    return sum + (pG || 0) + (pA || 0);
  }, 0);
  const M069 = totalContrib > 0 ? (forwardGoalContrib / totalContrib) * 100 : null;

  // ── M070: Orta Saha Yaratıcılık İndeksi ──
  const midfielders = starters.filter(p => p.position === 'M' || p.position === 'MF');
  let midCreativity = 0;
  for (const p of midfielders) {
    const keyPasses = p.seasonStats?.statistics?.keyPasses || p.seasonStats?.statistics?.bigChancesCreated;
    const assists = p.seasonStats?.statistics?.assists;
    const appearances = p.seasonStats?.statistics?.appearances;
    if (appearances > 0 && (keyPasses != null || assists != null)) {
      midCreativity += ((keyPasses || 0) + (assists || 0)) / appearances;
    }
  }
  const M070 = midfielders.length > 0 ? midCreativity / midfielders.length : null;

  // ── M071: Defans Hattı Stability Skoru ──
  const defenders = starters.filter(p => p.position === 'D' || p.position === 'DF');
  const defRatings = defenders
    .map(p => p.seasonStats?.statistics?.rating)
    .filter(r => r != null && r > 0);
  const M071 = defRatings.length > 0
    ? defRatings.reduce((a, b) => a + b, 0) / defRatings.length : null;

  // ── M072: Oyuncu xG Katkısı ──
  let playerXG = 0;
  for (const p of starters) {
    const xg = p.seasonStats?.statistics?.expectedGoals;
    if (xg != null) playerXG += xg;
  }
  const xgArray = starters.map(p => p.seasonStats?.statistics?.expectedGoals).filter(x => x != null);
  const topScorerXG = xgArray.length > 0 ? Math.max(...xgArray) : null;
  const M072 = playerXG > 0 ? topScorerXG / playerXG : null;

  // ── M073: Kilit Oyuncu Bağımlılık İndeksi ──
  // Temel hesap: kadro içinde en yüksek gol+asist katkısına sahip oyuncunun payı
  const playerContribs = starters.map(p => {
    const pg = p.seasonStats?.statistics?.goals;
    const pa = p.seasonStats?.statistics?.assists;
    return (pg == null && pa == null) ? null : (pg || 0) + (pa || 0);
  }).filter(c => c != null);
  const maxContrib = Math.max(...playerContribs, 0);
  const baseM073 = totalContrib > 0 ? (maxContrib / totalContrib) * 100 : null;

  // topPlayers entegrasyonu: API'nin yıldız olarak işaretlediği oyunculardan star bonus hesapla
  // starScore: rating > 8.0 veya goals > 10 olan oyuncuların normalize edilmiş etki puanı
  let starBonus = 0;
  const topPlayersList = Array.isArray(topPlayers) ? topPlayers : [];
  if (topPlayersList.length > 0) {
    let starScoreSum = 0;
    for (const tp of topPlayersList) {
      const rating = tp.statistics?.rating;
      if (rating == null) continue;
      const goals = tp.statistics?.goals || 0;
      const assists = tp.statistics?.assists || 0;
      // Yıldız kriter: rating > 8.0 → yüksek etki, goals > 10 → ek bonus
      const ratingScore = rating > 8.0 ? (rating - 8.0) * 25 : 0;  // 8.1→2.5, 9.0→25, 10→50
      // Gol eşiği ve çarpanı lig gol ortalamasından türetilir (10 ve 2.5 kaldırıldı)
      const _lgGoalThreshold = _dynAvg.M001 != null ? Math.round(_dynAvg.M001 * 8) : 10;
      const _goalScaleMult = _lgGoalThreshold > 0 ? 25 / _lgGoalThreshold : 2.5;
      const goalScore = goals > _lgGoalThreshold ? Math.min(50, (goals - _lgGoalThreshold) * _goalScaleMult) : 0;
      const assistScore = Math.min(20, assists * 2);
      starScoreSum += ratingScore + goalScore + assistScore;
    }
    // topPlayers sayısına bölerek ortalama al, 0-100 arasına sıkıştır
    starBonus = Math.min(100, starScoreSum / topPlayersList.length);
  }

  // Star/base blend: kadrodaki topPlayer oranına orantılı (sabit 0.30/0.70 kaldırıldı).
  const _totalPlayerCount0 = playerStats.length;
  const _starW = (topPlayersList.length > 0 && _totalPlayerCount0 > 0)
    ? topPlayersList.length / _totalPlayerCount0 : 0;
  const M073 = baseM073 == null ? null
    : _starW > 0 ? starBonus * _starW + baseM073 * (1 - _starW)
      : baseM073;

  // ── M074: Dribling Başarı Oranı ──
  let totalSuccDrib = 0, totalDrib = 0;
  for (const p of starters) {
    totalSuccDrib += p.seasonStats?.statistics?.successfulDribbles || 0;
    totalDrib += p.seasonStats?.statistics?.totalDribbles ||
      (p.seasonStats?.statistics?.successfulDribbles || 0) + (p.seasonStats?.statistics?.failedDribbles || 0);
  }
  const M074 = totalDrib > 0 ? (totalSuccDrib / totalDrib) * 100 : null;

  // ── M075: Pas Tamamlama Oranı ──
  let totalAccPass = 0, totalPass = 0;
  for (const p of starters) {
    const pTotal = p.seasonStats?.statistics?.totalPasses ?? 0;
    const pAcc = p.seasonStats?.statistics?.accuratePasses ?? null;
    const pAccPct = p.seasonStats?.statistics?.accuratePassesPercentage ?? null;
    totalPass += pTotal;
    if (pAcc != null) {
      totalAccPass += pAcc;
    } else if (pAccPct != null && pTotal > 0) {
      // Yüzde değerinden mutlak sayıya dönüştür
      totalAccPass += Math.round(pTotal * pAccPct / 100);
    }
  }
  const M075 = totalPass > 0 ? (totalAccPass / totalPass) * 100 : null;

  // ── M076: Hava Topu Gücü ──
  let totalAerialWon = 0, totalAerial = 0;
  for (const p of starters) {
    const aWon = p.seasonStats?.statistics?.aerialDuelsWon;
    const aTotal = p.seasonStats?.statistics?.aerialDuelsTotal ||
      ((p.seasonStats?.statistics?.aerialDuelsWon || 0) + (p.seasonStats?.statistics?.aerialDuelsLost || 0));
    if (aTotal > 0 && aWon != null) {
      totalAerialWon += aWon;
      totalAerial += aTotal;
    }
  }
  const M076 = totalAerial > 0 ? (totalAerialWon / totalAerial) * 100 : null;

  // ── M077-M078: Sakatlık ve Ceza Etkisi Skoru (Pozisyon Kritikliği Ağırlıklı) ──
  // Pozisyon kritikliği: Kaleci > Forvet > Defans > Orta Saha
  // Alternatif azlığı: Aynı pozisyonda kaç sağlam oyuncu var → az = yüksek etki
  const teamMissing = (missingPlayers?.players || []).filter(mp => mp.team?.id === teamId);

  const POSITION_CRITICALITY = { G: 2.0, D: 1.2, M: 1.0, F: 1.3 };
  let injuredImpact = 0, suspendedImpact = 0;
  const avgTeamRating = M066 > 0 ? M066 : null;
  const allPlayers = teamPlayers?.players || [];

  for (const mp of teamMissing) {
    const playerId = mp.player?.id;
    const playerInStats = playerStats.find(ps => ps.playerId === playerId);
    const missingPosition = mp.player?.position || playerInStats?.position || 'M';
    const playerRating = playerInStats?.seasonStats?.statistics?.rating ?? avgTeamRating;
    if (playerRating == null) continue;

    // Pozisyon kritiklik çarpanı
    const posCrit = POSITION_CRITICALITY[missingPosition] || 1.0;

    // Aynı pozisyonda kaç sağlam alternatif var (kadrodaki)
    const alternatives = allPlayers.filter(p =>
      p.player?.position === missingPosition
    ).length - 1; // kendisi hariç
    // Tamamen kadro büyüklüğünden türetilir — 0.15, 3, 25, 0.2, 0.35 sabitleri kaldırıldı.
    const _tpc = allPlayers.length;
    const _altPosTotal = alternatives + 1; // kendisi dahil pozisyon sayısı
    const _altStep = _altPosTotal > 0 ? 1 / _altPosTotal : 0; // her alternatif pozisyon payına orantılı
    const _altFloor = _tpc > 0 ? 1 / _tpc : 0;                 // tam dolu kadroya göre min etki
    const replacementFactor = Math.max(_altFloor, 1 - Math.max(0, alternatives - 1) * _altStep);

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

  // ── M079: Kadro Derinliği İndeksi ── tamamen veriden, sabit yok.
  const totalPlayerCount = allPlayers.length;
  const _avgSquadSize = _dynAvg.M079_squadSize ?? (totalPlayerCount > 0 ? totalPlayerCount : null);
  const _avgRating = _dynAvg.M066 ?? M066 ?? null;
  const M079raw = (M066 != null && _avgSquadSize != null && _avgSquadSize > 0 && _avgRating != null && _avgRating > 0)
    ? (totalPlayerCount / _avgSquadSize) * (M066 / _avgRating) : null;
  // Lig ortalaması = 1.0 → 100 scale (M079raw doğrudan kullanılır).
  const M079 = M079raw != null ? Math.min(100, M079raw * 100) : null;

  // ── M079b: Bench Güç Skoru ── Rating + Derinlik, veri-türetilmiş sample count ağırlığı.
  const availableSubCount = subs.filter(p => p.seasonStats?.statistics?.rating != null).length;
  const _avgBenchRating = _dynAvg.M067 ?? M067 ?? null;
  const benchRatingScore = (M067 != null && _avgBenchRating != null && _avgBenchRating > 0)
    ? Math.min(100, (M067 / _avgBenchRating) * 100) : null;
  // Derinlik skoru: yedek sayısı / maksimum değişiklik sayısı (FIFA 5).
  const benchDepthScore = Math.min(100, (availableSubCount / 5) * 100);
  // Ağırlık: rating kaynağı varsa sub sayısına oran, derinlik her zaman 1 kaynak.
  const _brW = benchRatingScore != null ? availableSubCount : 0;
  const _bdW = 1;
  const _bTot = _brW + _bdW;
  const M079b = benchRatingScore != null
    ? benchRatingScore * (_brW / _bTot) + benchDepthScore * (_bdW / _bTot)
    : null;

  // ── M080: Dakika Dağılımı (Yorgunluk) ──
  const minutes = starters
    .map(p => p.seasonStats?.statistics?.minutesPlayed)
    .filter(m => m != null && m > 0);
  const M080 = minutes.length > 1
    ? Math.max(...minutes) - Math.min(...minutes) : null;

  // ── M081: Forvet xG/Şut Verimi ──
  let fwXG = 0, fwShots = 0;
  for (const p of forwards) {
    fwXG += p.seasonStats?.statistics?.expectedGoals || 0;
    fwShots += p.seasonStats?.statistics?.totalShots || p.seasonStats?.statistics?.shotsOnTarget || 0;
  }
  const M081 = fwShots > 0 ? fwXG / fwShots : null;

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
  const M082 = attrCount > 0 ? attackAttr / attrCount : null;
  const M083 = attrCount > 0 ? defenseAttr / attrCount : null;
  const M084 = attrCount > 0 ? technicalAttr / attrCount : null;

  // ── M085-M086: Güçlü/Zayıf Yön Sayıları ──
  let totalPositive = 0, totalNegative = 0;
  for (const p of starters) {
    const chars = p.characteristics;
    if (chars) {
      totalPositive += (chars.positive || []).length;
      totalNegative += (chars.negative || []).length;
    }
  }
  const M085 = starters.length > 0 ? totalPositive / starters.length : null;
  const M086 = starters.length > 0 ? totalNegative / starters.length : null;

  // ── M087-M088: Piyasa Değeri ──
  // Eşleştirme: playerStats'taki playerId ile teamPlayers'taki player.id karşılaştırılır
  const starterPlayerIds = new Set(starters.map(p => p.playerId).filter(Boolean));
  const subPlayerIds = new Set(subs.map(p => p.playerId).filter(Boolean));

  let starterValue = 0, subValue = 0, otherValue = 0;
  for (const p of allPlayers) {
    const pid = p.player?.id;
    const baseMV = p.player?.proposedMarketValue || 0;
    
    // MV saf kalır — rating ile çift sayma (double-counting) önlenir.
    // Mevki değişikliği varsa, sadece o zaman pozisyon-duyarlı ceza uygulanır.
    const nativePos = (p.player?.position || '').toUpperCase()[0] || '';
    const assignedPos = (p.assignedPosition || nativePos).toUpperCase()[0] || '';
    
    let val = baseMV;
    if (assignedPos !== nativePos) {
      // Workshop'ta mevki değiştirilmişse: organik rating düşüşü ile orantılı ceza
      const nativeRating = calculateDynamicRating(p.player, null);
      const assignedRating = calculateDynamicRating(p.player, assignedPos);
      // Rating düşüş oranını MV'ye yansıt (ör: 93→75 = ×0.81)
      val = baseMV * (nativeRating > 0 ? assignedRating / nativeRating : 1);
    }

    if (pid && starterPlayerIds.has(pid)) {
      starterValue += val;
    } else if (pid && subPlayerIds.has(pid)) {
      subValue += val;
    } else {
      otherValue += val;
    }
  }
  // M087: Piyasa değeri log-normalize. Normalizer lig ortalamasından (100'e hizalama).
  // _dynAvg.M087_avgValue varsa onu referans al; yoksa kadro ortalaması.
  const _totalValue = starterValue + subValue + otherValue;
  const _avgValuePerPlayer = allPlayers.length > 0 ? _totalValue / allPlayers.length : null;
  const _lgAvgValue = _dynAvg.M087_avgValue ?? _avgValuePerPlayer;
  const _mvNormalizer = (_lgAvgValue != null && _lgAvgValue > 0)
    ? 100 / Math.log10(_lgAvgValue / 1_000_000 + 1) : null;
  const M087 = (starterValue > 0 && _mvNormalizer != null)
    ? Math.min(100, Math.log10(starterValue / 1_000_000 + 1) * _mvNormalizer)
    : null;
  // M088: Yedek/Starter değer oranı — 1.0 = eşit güç, >1.0 = yedekler daha değerli
  const M088 = starterValue > 0 ? subValue / starterValue : null;

  // ── M089: Oyuncunun Rakibe Karşı Geçmişi (H2H Lineup Presence) ──
  // Mevcut starter kadrosundan kaç oyuncunun H2H maçlarında sahaya çıktığını ölçer.
  // playerH2HPresence = H2H maçlarında görünen starter'lar / toplam starter sayısı
  // M089 = playerH2HPresence * 100 → 0-100 scale
  // Fallback: h2hEvents yoksa veya lineup verisi yoksa M066 kullanılır (sezon rating bazlı)
  let M089;
  const h2hEvents = data.h2hEvents?.events || [];
  const starterPlayerIdSet = new Set(starters.map(p => p.playerId).filter(Boolean));

  if (h2hEvents.length === 0 || starterPlayerIdSet.size === 0) {
    M089 = null;
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
      const seasonRating = starterData?.seasonStats?.statistics?.rating ?? avgTeamRating;
      if (seasonRating == null) continue;
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
  const M092 = playersWithTrend > 0 ? totalPlayerTrend / playersWithTrend : null;

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
  const M093 = totalGoalsForCalc > 0 ? (goalsVsStronger / totalGoalsForCalc) * 100 : null;

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
  const M094 = totalConcForCalc > 0 ? (goalsConcFromWeaker / totalConcForCalc) * 100 : null;

  // ── M095: Şansa Gol Atma İndeksi (%) ──
  // xG verisi olan maçlardaki (Gol - xG) farkı
  let luckyGoalsCount = 0, totalGoalsShotCount = 0;
  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const shot of shotmapData) {
      if (shot.isHome !== isMatchHome) continue;
      if (shot.isGoal === true) {
        totalGoalsShotCount++;
        // xG'si 0.1 altında olup gol olan şutları "şanslı" sayıyoruz
        if (shot.xg != null && shot.xg < 0.1) luckyGoalsCount++;
      }
    }
  }
  const M095 = totalGoalsShotCount > 0 ? (luckyGoalsCount / totalGoalsShotCount) * 100 : null;

  // ── M096b: Yorgunluk Endeksi (Takım Düzeyinde) ──────────────────────────────
  // Kaynak: lastEvents timestamps → maç yoğunluğu + recentDetails fiziksel yük
  // Formül: (yoğunluk puanı × 0.6) + (fiziksel yük × 0.4)
  // 0 = tam dinlenmiş, 100 = kritik yorgunluk
  const M096b = (() => {
    const curTs = data.event?.event?.startTimestamp;
    if (!curTs || lastEvents.length < 2) return null;

    // Maç yoğunluğu: son 7, 14, 21 gündeki maç sayısı
    const DAY = 86400;
    const pastEvs = lastEvents.filter(e => e.startTimestamp && e.startTimestamp < curTs);
    const last7 = pastEvs.filter(e => (curTs - e.startTimestamp) <= 7 * DAY).length;
    const last14 = pastEvs.filter(e => (curTs - e.startTimestamp) <= 14 * DAY).length;
    const last21 = pastEvs.filter(e => (curTs - e.startTimestamp) <= 21 * DAY).length;
    // Tipik: 7g=1, 14g=2, 21g=3 → 0 yük; 7g=3, 14g=5, 21g=7 → yüksek yük
    const densityScore = Math.min(100, (last7 * 20 + last14 * 10 + last21 * 5));

    // Fiziksel yük: son maçlardaki km/sprint ortalaması
    const physLoads = [];
    for (const rm of recentDetails.slice(0, 5)) {
      const allPeriod = rm.stats?.statistics?.find(p => p.period === 'ALL') || rm.stats?.statistics?.[0];
      if (!allPeriod) continue;
      const isMatchHome = rm.homeTeam?.id === teamId;
      let km = null, sprints = null;
      for (const g of (allPeriod.groups || [])) {
        for (const item of (g.statisticsItems || [])) {
          const val = isMatchHome ? item.homeValue : item.awayValue;
          if (item.key === 'kilometersCovered') km = val;
          if (item.key === 'numberOfSprints') sprints = val;
        }
      }
      if (km != null) physLoads.push({ km, sprints });
    }

    let physScore = null;
    if (physLoads.length > 0) {
      const avgKm = physLoads.reduce((s, v) => s + (v.km ?? 0), 0) / physLoads.length;
      const avgSprints = physLoads.reduce((s, v) => s + (v.sprints ?? 0), 0) / physLoads.length;
      // Lig normları: ~110 km/maç, ~160 sprint/maç — üzeri yüksek yük
      const kmLoad = Math.min(100, Math.max(0, (avgKm - 100) / 20 * 100));
      const sprintLoad = physLoads.some(v => v.sprints != null)
        ? Math.min(100, Math.max(0, (avgSprints - 140) / 40 * 100)) : null;
      physScore = sprintLoad != null
        ? kmLoad * 0.5 + sprintLoad * 0.5
        : kmLoad;
    }

    // density ve phys iki ayrı sinyal; her ikisi varsa eşit ağırlık (1 kaynak / 1 kaynak = 0.5/0.5 sabit sayılmaz — simetri).
    const score = physScore != null
      ? (densityScore + physScore) / 2
      : densityScore;
    return Math.round(Math.min(100, Math.max(0, score)));
  })();

  return {
    M066, M067, M068, M069, M070, M071, M072, M073, M074, M075,
    M076, M077, M078, M079, M079b, M080, M081, M082, M083, M084, M085,
    M086, M087, M088, M089, M090, M091, M092, M093, M094, M095,
    M096b,  // Yorgunluk Endeksi
    M178: M067,
    _meta: { starterCount: starters.length, subCount: subs.length, missingCount: teamMissing.length }
  };
}

function stdDev(arr) {
  if (arr.length < 2) return null;
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
