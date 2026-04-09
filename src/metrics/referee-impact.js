/**
 * Referee Impact Metrics (M109–M118)
 * Hakem etkisi — kart ortalaması, penaltı sıklığı, ev sahibi avantajı, sertlik indeksi.
 */

function calculateRefereeMetrics(data) {
  const refereeStats = data.refereeStats;
  const refereeLastEvents = data.refereeLastEvents;
  const event = data.event?.event;
  const refereeId = data.refereeId;

  if (!refereeStats && !refereeId && !refereeLastEvents) return createEmptyRefereeMetrics();

  // 1. Hakem sezon istatistiklerini pars et (en güncel sezon)
  // SofaScore API'den gelen kariyer verisi (games, yellowCards, redCards) en güveniliridir.
  let stats = {};
  let matchesCount = null;

  if (refereeStats?.eventReferee) {
    matchesCount = refereeStats.eventReferee.games;
    stats.yellowCards = refereeStats.eventReferee.yellowCards;
    stats.redCards = refereeStats.eventReferee.redCards;
  }

  // Eğer eventReferee yoksa veya veri eksikse sezon bazlı istatistiklere bak
  if (!matchesCount) {
    const seasons = refereeStats?.statistics?.seasons || refereeStats?.seasons || [];
    let currentSeason = seasons.length > 0 
      ? [...seasons].sort((a, b) => (b.season?.year ?? 0) - (a.season?.year ?? 0))[0]
      : refereeStats;

    const s = currentSeason?.statistics || currentSeason || {};
    matchesCount = s.matches ?? s.gamesPlayed ?? s.totalMatches ?? null;
    stats.yellowCards = s.yellowCards ?? s.totalYellowCards ?? stats.yellowCards;
    stats.redCards = s.redCards ?? s.totalRedCards ?? stats.redCards;
    stats.penalties = s.penalties ?? s.penaltiesAwarded ?? s.penaltiesGiven ?? null;
    stats.fouls = s.fouls ?? s.totalFouls ?? null;
    stats.homeWins = s.homeWins ?? s.homeTeamWins ?? null;
    stats.awayWins = s.awayWins ?? s.awayTeamWins ?? null;
    stats.draws = s.draws ?? null;
  }

  // matchesCount yoksa kariyer metriklerini skip et ama refereeLastEvents verisi yine işlenir.
  // M109-M114, M117-M118 için matchesCount zorunlu; M115-M116, M118b için refereeLastEvents yeterli.

  // ── M109: Maç Başı Sarı Kart Ortalaması ──
  const totalYellows = stats.yellowCards ?? stats.totalYellowCards ?? null;
  const M109 = (matchesCount != null && matchesCount > 0 && totalYellows != null)
    ? totalYellows / matchesCount : null;

  // ── M110: Maç Başı Kırmızı Kart Ortalaması ──
  const totalReds = stats.redCards ?? stats.totalRedCards ?? null;
  const M110 = (matchesCount != null && matchesCount > 0 && totalReds != null)
    ? totalReds / matchesCount : null;

  // ── M111: Kırmızı Kart Oranı (redCards / matchesOfficiated) ──
  const totalPenalties = stats.penalties ?? stats.penaltiesAwarded ?? null;
  let M111;
  if (matchesCount != null && matchesCount > 0 && totalReds != null && totalReds > 0) {
    M111 = totalReds / matchesCount; // Gerçek veri: kırmızı kart / maç
  } else if (matchesCount != null && matchesCount > 0 && totalPenalties != null && totalPenalties > 0) {
    M111 = totalPenalties / matchesCount; // Penaltı verisi varsa kullan
  } else {
    M111 = null;
  }

  // ── M112: Faul / Maç Ortalaması (fouls / matchesOfficiated) ──
  const homeWins = stats.homeWins ?? stats.homeTeamWins ?? null;
  const totalFoulsForM112 = stats.fouls ?? stats.totalFouls ?? null;
  const M112 = (matchesCount != null && matchesCount > 0 && totalFoulsForM112 != null && totalFoulsForM112 > 0)
    ? totalFoulsForM112 / matchesCount : null;

  // ── M113: Sarı Kart / Maç Ortalaması (yellowCards / matchesOfficiated) ──
  const M113 = (matchesCount != null && matchesCount > 0 && totalYellows != null && totalYellows > 0)
    ? totalYellows / matchesCount : null;

  // ── M114: Dakika / Faul Oranı (minutes / fouls) ──
  const totalMinutes = stats.minutes ?? stats.totalMinutes ?? null;
  const M114 = (matchesCount != null && matchesCount > 0 && totalFoulsForM112 != null && totalFoulsForM112 > 0 && totalMinutes != null && totalMinutes > 0)
    ? totalMinutes / totalFoulsForM112 : null;

  // ── M115-M116: Hakemin Son Maçlarında Kırmızı Kart Bias ──
  // SofaScore hakem API'sinde homeFouls/awayFouls gelmiyor.
  // Bunun yerine /referee/{id}/events/last/0 endpoint'inden
  // homeRedCards / awayRedCards kullanılır.
  // M115 = ev sahibi kırmızı kart / maç (×100 normalleştirilmiş)
  // M116 = deplasman kırmızı kart / maç (×100 normalleştirilmiş)
  let M115 = null, M116 = null;
  let refLastEventsCount = 0;
  let refHomeWins = 0, refDraws = 0, refAwayWins = 0;
  let refTotalGoals = 0, refOver25Count = 0, refBTTSCount = 0;
  let refHomeRed = 0, refAwayRed = 0;

  const lastEvArr = refereeLastEvents?.events || [];
  const lastEvFinished = lastEvArr.filter(e =>
    e.homeScore?.current != null && e.awayScore?.current != null
  );

  for (const ev of lastEvFinished) {
    const hs = ev.homeScore.current;
    const as = ev.awayScore.current;
    const hRed = ev.homeRedCards || 0;
    const aRed = ev.awayRedCards || 0;
    const total = hs + as;

    refLastEventsCount++;
    refHomeRed += hRed;
    refAwayRed += aRed;
    refTotalGoals += total;
    if (total > 2.5) refOver25Count++;
    if (hs > 0 && as > 0) refBTTSCount++;
    if (hs > as) refHomeWins++;
    else if (hs === as) refDraws++;
    else refAwayWins++;
  }

  if (refLastEventsCount > 0) {
    M115 = (refHomeRed / refLastEventsCount) * 100;
    M116 = (refAwayRed / refLastEventsCount) * 100;
  }

  // ── M117: Sertlik İndeksi ──
  const M117 = (matchesCount != null && matchesCount > 0 && totalYellows != null && totalReds != null)
    ? (totalYellows + totalReds * 3) / matchesCount : null;

  // ── M118: Faul Toleransı ──
  const avgFouls = (matchesCount != null && matchesCount > 0 && totalFoulsForM112 != null && totalFoulsForM112 > 0)
    ? totalFoulsForM112 / matchesCount : null;
  const M118 = avgFouls;

  // --- New Advanced Referee Metrics ---
  const M181 = avgFouls;
  const M182 = (avgFouls != null && M117 != null && M117 > 0) ? avgFouls / M117 : null;

  // ── M118b: Hakem Ev Sahibi Yanlılık İndeksi ──
  // Hakemin son maçlarından gelen ev/dep/beraberlik sayıları kullanılır.
  // refereeLastEvents verisi varsa onu önce dene; yoksa stats'tan al.
  const totalGamesForBias = refLastEventsCount >= 5
    ? refLastEventsCount
    : (() => {
        const hw = homeWins != null ? homeWins : null;
        const aw = stats.awayWins ?? stats.awayTeamWins ?? null;
        const dr = stats.draws ?? null;
        return (hw != null && aw != null && dr != null) ? hw + aw + dr : null;
      })();

  const biasHomeWins = refLastEventsCount >= 5 ? refHomeWins : (homeWins ?? null);

  // Lig ev sahibi kazanma ortalamasını standingsHome'dan dinamik hesapla
  const homeRows = data.standingsHome?.standings?.[0]?.rows || [];
  const totalHomeWins = homeRows.reduce((s, r) => s + (r.wins ?? 0), 0);
  const totalHomePlayed = homeRows.reduce((s, r) => s + (r.played ?? 0), 0);
  const leagueHomeWinAvg = totalHomePlayed >= 10
    ? totalHomeWins / totalHomePlayed
    : null;

  let M118b = null;
  if (leagueHomeWinAvg != null && totalGamesForBias != null && totalGamesForBias >= 10 && biasHomeWins != null) {
    const homeWinRate = biasHomeWins / totalGamesForBias;
    M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 100;
    M118b = Math.max(0, Math.min(100, M118b));
  } else if (leagueHomeWinAvg != null && totalGamesForBias != null && totalGamesForBias > 0 && biasHomeWins != null) {
    const homeWinRate = biasHomeWins / totalGamesForBias;
    M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 50;
    M118b = Math.max(20, Math.min(80, M118b));
  }

  // ── Hakem Maç Bazlı Türetilmiş İstatistikler (refereeLastEvents) ──
  // Bu değerler referee scope'unda ek bilgi olarak dönülür.
  const refGoalsPerMatch = refLastEventsCount > 0 ? refTotalGoals / refLastEventsCount : null;
  const refOver25Rate = refLastEventsCount > 0 ? (refOver25Count / refLastEventsCount) * 100 : null;
  const refBTTSRate = refLastEventsCount > 0 ? (refBTTSCount / refLastEventsCount) * 100 : null;
  const refHomeWinRate = refLastEventsCount > 0 ? (refHomeWins / refLastEventsCount) * 100 : null;
  const refAwayWinRate = refLastEventsCount > 0 ? (refAwayWins / refLastEventsCount) * 100 : null;

  return {
    M109, M110, M111, M112, M113, M114, M115, M116, M117, M118, M118b,
    M181, M182,
    // Hakem son maçlarından türetilen ek metrikler
    refGoalsPerMatch,
    refOver25Rate,
    refBTTSRate,
    refHomeWinRate,
    refAwayWinRate,
    _meta: {
      refereeId,
      refereeName: event?.referee?.name || 'Unknown',
      matchesManaged: matchesCount,
      lastEventsAnalyzed: refLastEventsCount,
    }
  };
}

function createEmptyRefereeMetrics() {
  const m = {};
  for (let i = 109; i <= 118; i++) m[`M${String(i).padStart(3, '0')}`] = null;
  m.M118b = null;
  m._meta = { error: 'No referee data' };
  return m;
}

function createEmptyRefereeMetricsWithMeta(refId) {
  const m = createEmptyRefereeMetrics();
  m._meta.refereeId = refId;
  m._meta.error = 'Referee stats empty or unavailable';
  return m;
}

module.exports = { calculateRefereeMetrics };
