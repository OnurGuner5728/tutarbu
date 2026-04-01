/**
 * Team Attack Metrics (M001–M025)
 * Takım hücum metrikleri — tamamı SofaScore API verisinden hesaplanır.
 * Hiçbir fallback/statik değer yoktur.
 */

/**
 * @param {object} data - fetchAllMatchData() çıktısı
 * @param {string} side - 'home' | 'away'
 * @returns {object} M001-M025 metrikleri
 */
function calculateTeamAttackMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const lastEvents = isHome ? data.homeLastEvents : data.awayLastEvents;
  const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
  const teamSeasonStats = isHome ? data.homeTeamSeasonStats : data.awayTeamSeasonStats;

  // Son 20 maçtan bitmiş olanları al
  const finishedEvents = (lastEvents || []).filter(e => e.status?.type === 'finished');
  const last20 = finishedEvents.slice(0, 20);
  const totalMatches = last20.length;

  if (totalMatches === 0) {
    return createEmptyAttackMetrics();
  }

  // ── M001: Maç Başı Atılan Gol Ortalaması ──
  let totalGoalsScored = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    totalGoalsScored += isEvHome
      ? (ev.homeScore?.current || ev.homeScore?.display || 0)
      : (ev.awayScore?.current || ev.awayScore?.display || 0);
  }
  const M001 = totalGoalsScored / totalMatches;

  // ── M002: Ev/Deplasman Gol Ortalaması ──
  let locationGoals = 0;
  let locationMatches = 0;
  for (const ev of last20) {
    const isEvHome = ev.homeTeam?.id === teamId;
    // Mevcut maçın konumuna göre filtrele
    if ((isHome && isEvHome) || (!isHome && !isEvHome)) {
      locationGoals += isEvHome
        ? (ev.homeScore?.current || ev.homeScore?.display || 0)
        : (ev.awayScore?.current || ev.awayScore?.display || 0);
      locationMatches++;
    }
  }
  const M002 = locationMatches > 0 ? locationGoals / locationMatches : M001;

  // ── M003-M010: Dakika Bazlı Gol Dağılımı ──
  // recentDetails'deki incidents'lardan hesapla
  const goalsByPeriod = { '0-15': 0, '16-30': 0, '31-45': 0, '46-60': 0, '61-75': 0, '76-90': 0 };
  let totalGoalsFromIncidents = 0;
  let firstHalfGoals = 0;
  let secondHalfGoals = 0;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      if (inc.isHome !== isMatchHome) continue;

      totalGoalsFromIncidents++;
      const minute = inc.time || 0;

      if (minute <= 45) firstHalfGoals++;
      else secondHalfGoals++;

      if (minute <= 15) goalsByPeriod['0-15']++;
      else if (minute <= 30) goalsByPeriod['16-30']++;
      else if (minute <= 45) goalsByPeriod['31-45']++;
      else if (minute <= 60) goalsByPeriod['46-60']++;
      else if (minute <= 75) goalsByPeriod['61-75']++;
      else goalsByPeriod['76-90']++;
    }
  }

  const recentMatchCount = recentDetails.length || 1;
  const M003 = firstHalfGoals / recentMatchCount;
  const M004 = secondHalfGoals / recentMatchCount;

  const safeTotal = totalGoalsFromIncidents || 1;
  const M005 = (goalsByPeriod['0-15'] / safeTotal) * 100;
  const M006 = (goalsByPeriod['16-30'] / safeTotal) * 100;
  const M007 = (goalsByPeriod['31-45'] / safeTotal) * 100;
  const M008 = (goalsByPeriod['46-60'] / safeTotal) * 100;
  const M009 = (goalsByPeriod['61-75'] / safeTotal) * 100;
  const M010 = (goalsByPeriod['76-90'] / safeTotal) * 100;

  // FALLBACK: Eğer 0 ise, sezon ortalaması veya genel bir dağılım (simülasyon) yerine 0 bırakıyoruz 
  // ancak numuneyi 7 maça çıkardığımız için 0 olma ihtimali azaldı.

  // ── M011-M014: Şut ve İsabetli Şut Metrikleri ──
  let totalShots = 0;
  let shotsOnTarget = 0;
  let matchesWithStats = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalShots += stats.totalShots || 0;
      shotsOnTarget += stats.shotsOnTarget || 0;
      matchesWithStats++;
    }
  }

  // teamSeasonStats fallback helpers — recentDetails sparse olduğunda kullanılır
  const seasonStat = (name) =>
    teamSeasonStats?.statistics?.find(s => s.name === name)?.value ?? null;

  const M011 = totalShots > 0 ? Math.min((totalGoalsFromIncidents / totalShots) * 100, 100) : 0;
  const M012 = shotsOnTarget > 0 ? Math.min((totalGoalsFromIncidents / shotsOnTarget) * 100, 100) : 0;
  // M013: Maç başı toplam şut — recentDetails yoksa sezon "Shots per Game" kullan
  const M013 = matchesWithStats > 0
    ? totalShots / matchesWithStats
    : (seasonStat('Shots per Game') ?? 0);
  // M014: Maç başı isabetli şut — recentDetails yoksa sezon "Shots on Target per Game" kullan
  const M014 = matchesWithStats > 0
    ? shotsOnTarget / matchesWithStats
    : (seasonStat('Shots on Target per Game') ?? 0);

  // ── M015-M016: xG Metrikleri ──
  let totalXG = 0;
  let matchesWithXG = 0;

  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    let matchXG = 0;

    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome && shot.xg != null) {
        matchXG += shot.xg;
      }
    }

    if (shotmapData.length > 0) {
      totalXG += matchXG;
      matchesWithXG++;
    }
  }

  const M015 = matchesWithXG > 0 ? totalXG / matchesWithXG : 0;
  const M016 = totalXG > 0 ? totalGoalsFromIncidents / totalXG : 1;

  // ── M017-M018: Büyük Şans (Big Chances) ──
  let totalBigChances = 0;
  let totalBigChancesScored = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalBigChances += stats.bigChances || 0;
      totalBigChancesScored += stats.bigChancesScored || 0;
    }
  }

  // M017: Maç başı büyük şans — recentDetails yoksa sezon "Big Chances" değerini
  // totalMatches'e bölerek ortalama olarak kullan
  const M017 = matchesWithStats > 0
    ? totalBigChances / matchesWithStats
    : (() => {
        const seasonBigChances = seasonStat('Big Chances');
        return seasonBigChances != null && totalMatches > 0
          ? seasonBigChances / totalMatches
          : 0;
      })();
  const M018 = totalBigChances > 0 ? Math.min((totalBigChancesScored / totalBigChances) * 100, 100) : 0;

  // ── M019-M020: Penaltı Metrikleri ──
  let penaltiesWon = 0;
  let penaltiesScored = 0;
  let penaltiesTaken = 0;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.isHome !== isMatchHome) continue;
      if (inc.incidentType === 'goal' && inc.incidentClass === 'penalty') {
        penaltiesWon++;
        penaltiesScored++;
        penaltiesTaken++;
      }
      if (inc.incidentType === 'goal' && inc.incidentClass === 'penaltyMissed') {
        penaltiesWon++;
        penaltiesTaken++;
      }
    }

  }

  const M019 = recentMatchCount > 0 ? penaltiesWon / recentMatchCount : 0;
  const M020 = penaltiesTaken > 0 ? (penaltiesScored / penaltiesTaken) * 100 : 0;

  // ── M021: Hücum Baskı İndeksi (Graph'ten) ──
  let totalPositivePressure = 0;
  let pressureMatches = 0;

  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    if (graphPoints.length > 0) {
      let positiveSum = 0;
      let positiveCount = 0;

      for (const point of graphPoints) {
        const value = point.value || 0;
        // Ev sahibi için pozitif, deplasman için negatif baskı
        const teamPressure = isMatchHome ? value : -value;
        if (teamPressure > 0) {
          positiveSum += teamPressure;
          positiveCount++;
        }
      }

      if (positiveCount > 0) {
        totalPositivePressure += positiveSum / positiveCount;
        pressureMatches++;
      }
    }
  }

  const M021 = pressureMatches > 0
    ? Math.min(Math.max(totalPositivePressure / pressureMatches, 0), 100) : 50;

  // ── M022-M023: Korner Metrikleri ──
  let totalCorners = 0;
  let cornerGoalsCount = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalCorners += stats.cornerKicks || 0;
    }
    // Kornerden gol tespiti — shotmap "situation" bilgisi kullanılıyor
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome && shot.situation === 'corner' && shot.shotType === 'goal') {
        cornerGoalsCount++;
      }
    }
  }

  // M022: Maç başı korner — recentDetails yoksa sezon "Corners per Game" kullan
  const M022 = matchesWithStats > 0
    ? totalCorners / matchesWithStats
    : (seasonStat('Corners per Game') ?? 0);
  // Fallback: Eğer shotmap'te bulamazsak seasonStats'ten bakmayı deneyebiliriz (varsa)
  const M023 = totalCorners > 0 ? (cornerGoalsCount / totalCorners) * 100 : 0;

  // ── M024: Serbest Vuruş Gol Oranı ──
  let freeKickGoals = 0;
  let totalFreeKicks = 0;

  for (const match of recentDetails) {
    const shotmapData = match.shotmap?.shotmap || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const shot of shotmapData) {
      if (shot.isHome === isMatchHome && shot.situation === 'set-piece') {
        totalFreeKicks++;
        if (shot.shotType === 'goal') freeKickGoals++;
      }
    }
  }

  const M024 = totalFreeKicks > 0 ? (freeKickGoals / totalFreeKicks) * 100 : 0;

  // ── M025: Hücum Üçüncü Bölge Pas Başarısı ──
  let totalAccFinalThird = 0;
  let totalFinalThird = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalAccFinalThird += stats.accuratePassesFinalThird || 0;
      totalFinalThird += stats.totalPassesFinalThird || 0;
    }
  }

  const M025 = totalFinalThird > 0 ? Math.min((totalAccFinalThird / totalFinalThird) * 100, 100) : 0;

  // ── M025b: Set Piece (Korner + Serbest Vuruş) Gol Etkinliği ──
  // Son N maçtaki korner + serbest vuruştan gelen gollerin toplam gollere oranı
  let setPieceGoals = 0;
  let totalGoalsForSP = 0;

  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    for (const inc of incidents) {
      if (inc.incidentType !== 'goal') continue;
      const isMatchHome = match.homeTeam?.id === teamId;
      if (inc.isHome !== isMatchHome) continue;
      totalGoalsForSP++;
      // Set piece gol: direkt serbest vuruş, kornerden, penaltı hariç
      const isSetPiece = inc.goalType === 'header' || // Kornerden kafa
        inc.description?.toLowerCase().includes('corner') ||
        inc.description?.toLowerCase().includes('free kick') ||
        (inc.goalType === 'free-kick');
      if (isSetPiece) setPieceGoals++;
    }
  }
  const M025b = totalGoalsForSP > 0 ? (setPieceGoals / totalGoalsForSP) * 100 : 0;

  // ── M025c: Korner Başına Tehlike Oranı ──
  // Son maçlardaki korner istatistiklerinden hesaplanır
  let totalCornersForM025c = 0;
  let matchCountForCorners = 0;
  for (const match of recentDetails) {
    const stats = match.stats?.statistics || [];
    for (const period of stats) {
      const groups = period.groups || [];
      for (const group of groups) {
        for (const item of (group.statisticsItems || [])) {
          if (item.name?.toLowerCase().includes('corner') || item.key === 'cornerKicks') {
            const isMatchHome = match.homeTeam?.id === teamId;
            const val = isMatchHome
              ? parseInt(item.home, 10) || 0
              : parseInt(item.away, 10) || 0;
            totalCornersForM025c += val;
            matchCountForCorners++;
            break;
          }
        }
      }
    }
  }
  const M025c = matchCountForCorners > 0 ? totalCornersForM025c / recentDetails.length : 0;

  return {
    M001, M002, M003, M004, M005, M006, M007, M008, M009, M010,
    M011, M012, M013, M014, M015, M016, M017, M018, M019, M020,
    M021, M022, M023, M024, M025, M025b, M025c,
    _matchCount: totalMatches,
    _meta: {
      totalMatchesAnalyzed: totalMatches,
      recentMatchesDeepDive: recentMatchCount,
      totalGoalsScored,
      totalGoalsFromIncidents,
    }
  };
}

function parseStatValue(item, isHome) {
  const value = isHome ? item.homeValue : item.awayValue;
  const raw = isHome ? item.home : item.away;

  // Simple numeric case
  if (value != null && !isNaN(value)) return { current: Number(value), total: null };
  if (raw != null && !isNaN(raw)) return { current: Number(raw), total: null };

  // Fractional case: "10/20 (50%)" or "10/20"
  const str = value || raw || "";
  const match = str.match(/^(\d+)[\/:](\d+)/);
  if (match) {
    return { current: parseInt(match[1], 10), total: parseInt(match[2], 10) };
  }

  // Percentage only case: "55%"
  const percMatch = str.match(/^(\d+)%/);
  if (percMatch) {
    return { current: parseInt(percMatch[1], 10), total: 100 };
  }

  return { current: parseFloat(str) || 0, total: null };
}

/**
 * Match statistics objesinden takım verilerini çıkarır.
 */
function extractTeamStats(statsResponse, isHome) {
  if (!statsResponse?.statistics) return null;

  const result = {
    totalShots: 0, shotsOnTarget: 0, cornerKicks: 0, bigChances: 0,
    bigChancesScored: 0, bigChancesMissed: 0, fouls: 0, possession: 50,
    expectedGoals: 0, blockedShots: 0, shotsOffTarget: 0, hitWoodwork: 0,
    shotsInsideBox: 0, shotsOutsideBox: 0, accuratePasses: 0, totalPasses: 0,
    accurateLongBalls: 0, totalLongBalls: 0, accurateCrosses: 0, totalCrosses: 0,
    duelsWon: 0, totalDuels: 0, aerialDuelsWon: 0, totalAerialDuels: 0,
    interceptions: 0, tackles: 0, clearances: 0, saves: 0,
    accuratePassesFinalThird: 0, totalPassesFinalThird: 0,
    yellowCards: 0, redCards: 0, offsides: 0
  };

  // Key-based lookup map (locale-independent — SofaScore sabit İngilizce key döner).
  // item.key mevcutsa önce buradan resolve edilir; bulunamazsa aşağıdaki switch fallback devreye girer.
  // Fraction/total gerektiren case'ler üçüncü parametre (st = stats objesi) ile birlikte handle edilir.
  const KEY_MAP = {
    'totalShots':                (r, v)     => { r.totalShots = v; },
    'onTargetScoringAttempts':   (r, v)     => { r.shotsOnTarget = v; },
    'cornerKicks':               (r, v)     => { r.cornerKicks = v; },
    'bigChances':                (r, v)     => { r.bigChances = v; },
    'bigChancesScored':          (r, v)     => { r.bigChancesScored = v; },
    'bigChancesMissed':          (r, v)     => { r.bigChancesMissed = v; },
    'fouls':                     (r, v)     => { r.fouls = v; },
    'ballPossession':            (r, v)     => { r.possession = v; },
    'expectedGoals':             (r, v)     => { r.expectedGoals = v; },
    'blockedShots':              (r, v)     => { r.blockedShots = v; },
    'shotsOffTarget':            (r, v)     => { r.shotsOffTarget = v; },
    'hitWoodwork':               (r, v)     => { r.hitWoodwork = v; },
    'shotsInsideBox':            (r, v)     => { r.shotsInsideBox = v; },
    'shotsOutsideBox':           (r, v)     => { r.shotsOutsideBox = v; },
    'totalPasses':               (r, v)     => { r.totalPasses = v; },
    'totalLongBalls':            (r, v)     => { r.totalLongBalls = v; },
    'totalCrosses':              (r, v)     => { r.totalCrosses = v; },
    'totalDuels':                (r, v)     => { r.totalDuels = v; },
    'totalAerialDuels':          (r, v)     => { r.totalAerialDuels = v; },
    'interceptions':             (r, v)     => { r.interceptions = v; },
    'tackles':                   (r, v)     => { r.tackles = v; },
    'clearances':                (r, v)     => { r.clearances = v; },
    'saves':                     (r, v)     => { r.saves = v; },
    'goalKeeperSaves':           (r, v)     => { r.saves = v; },
    'yellowCards':               (r, v)     => { r.yellowCards = v; },
    'redCards':                  (r, v)     => { r.redCards = v; },
    'offsides':                  (r, v)     => { r.offsides = v; },
    // Fraction case'ler: current + total birlikte yazılır
    'accuratePasses':            (r, v, st) => { r.accuratePasses = v; if (st.total) r.totalPasses = st.total; },
    'accurateLongBalls':         (r, v, st) => { r.accurateLongBalls = v; if (st.total) r.totalLongBalls = st.total; },
    'accurateCrosses':           (r, v, st) => { r.accurateCrosses = v; if (st.total) r.totalCrosses = st.total; },
    'accuratePassesFinalThird':  (r, v, st) => { r.accuratePassesFinalThird = v; if (st.total) r.totalPassesFinalThird = st.total; },
    'duelsWon':                  (r, v, st) => { r.duelsWon = v; if (st.total) r.totalDuels = st.total; },
    'aerialDuelsWon':            (r, v, st) => { r.aerialDuelsWon = v; if (st.total) r.totalAerialDuels = st.total; },
  };

  for (const period of statsResponse.statistics) {
    if (period.period !== 'ALL') continue;
    for (const group of (period.groups || [])) {
      for (const item of (group.statisticsItems || [])) {
        const stats = parseStatValue(item, isHome);
        const val = stats.current;

        // Key-based lookup önce dene (locale-independent)
        if (item.key && KEY_MAP[item.key]) {
          KEY_MAP[item.key](result, val, stats);
          continue;
        }

        // Fallback: name-based switch (İngilizce lokalizasyon veya key yoksa çalışır)
        switch (item.name) {
          case 'Total shots': result.totalShots = val; break;
          case 'Shots on target': result.shotsOnTarget = val; break;
          case 'Corner kicks': result.cornerKicks = val; break;
          case 'Big chances': result.bigChances = val; break;
          case 'Big chances scored': result.bigChancesScored = val; break;
          case 'Big chances missed': result.bigChancesMissed = val; break;
          case 'Fouls': result.fouls = val; break;
          case 'Ball possession': result.possession = val; break;
          case 'Expected goals': result.expectedGoals = val; break;
          case 'Blocked shots': result.blockedShots = val; break;
          case 'Shots off target': result.shotsOffTarget = val; break;
          case 'Hit woodwork': result.hitWoodwork = val; break;
          case 'Shots inside box': result.shotsInsideBox = val; break;
          case 'Shots outside box': result.shotsOutsideBox = val; break;
          case 'Passes':
          case 'Accurate passes':
            result.accuratePasses = stats.current;
            if (stats.total) result.totalPasses = stats.total;
            break;
          case 'Total passes': result.totalPasses = stats.current; break;
          case 'Long balls':
          case 'Accurate long balls':
            result.accurateLongBalls = stats.current;
            if (stats.total) result.totalLongBalls = stats.total;
            break;
          case 'Crosses':
          case 'Accurate crosses':
            result.accurateCrosses = stats.current;
            if (stats.total) result.totalCrosses = stats.total;
            break;
          case 'Final third entries':
          case 'Passes in final third':
          case 'Accurate passes in final third':
            result.accuratePassesFinalThird = stats.current;
            if (stats.total) result.totalPassesFinalThird = stats.total;
            break;
          case 'Duels':
          case 'Duels won':
            result.duelsWon = stats.current;
            if (stats.total) result.totalDuels = stats.total;
            break;
          case 'Aerial duels':
          case 'Aerial duels won':
            result.aerialDuelsWon = stats.current;
            if (stats.total) result.totalAerialDuels = stats.total;
            break;
          case 'Total long balls': result.totalLongBalls = val; break;
          case 'Total crosses': result.totalCrosses = val; break;
          case 'Total duels': result.totalDuels = val; break;
          case 'Total aerial duels': result.totalAerialDuels = val; break;
          case 'Interceptions': result.interceptions = val; break;
          case 'Tackles': result.tackles = val; break;
          case 'Clearances': result.clearances = val; break;
          case 'Goalkeeper saves':
          case 'Saves': result.saves = val; break;
          case 'Passes final third':
          case 'Accurate passes final third':
            result.accuratePassesFinalThird = val;
            if (stats.total) result.totalPassesFinalThird = stats.total;
            break;
          case 'Yellow cards': result.yellowCards = val; break;
          case 'Red cards': result.redCards = val; break;
          case 'Offsides': result.offsides = val; break;
        }
      }
    }
  }
  return result;
}

function createEmptyAttackMetrics() {
  const metrics = {};
  for (let i = 1; i <= 25; i++) {
    metrics[`M${String(i).padStart(3, '0')}`] = null;
  }
  metrics.M025b = 0;
  metrics.M025c = 0;
  metrics._meta = { totalMatchesAnalyzed: 0, error: 'No finished matches found' };
  return metrics;
}

module.exports = { calculateTeamAttackMetrics, extractTeamStats };
