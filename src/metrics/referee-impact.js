/**
 * Referee Impact Metrics (M109–M118)
 * Hakem etkisi — kart ortalaması, penaltı sıklığı, ev sahibi avantajı, sertlik indeksi.
 */

function calculateRefereeMetrics(data) {
  const refereeStats = data.refereeStats;
  const event = data.event?.event;
  const refereeId = data.refereeId;

  if (!refereeStats && !refereeId) return createEmptyRefereeMetrics();

  // Hakem sezon istatistiklerini pars et (en güncel sezon)
  const seasons = refereeStats?.statistics?.seasons || refereeStats?.seasons || [];
  const sortedSeasons = [...seasons].sort((a, b) => {
    const yearA = a.season?.year ?? a.year ?? 0;
    const yearB = b.season?.year ?? b.year ?? 0;
    return yearB - yearA; // Azalan — en yeni önce
  });
  let currentSeason = sortedSeasons[0]; // En güncel sezon

  // Eğer sezon detayı yoksa, farklı yapılarda aranır
  if (!currentSeason && refereeStats) {
    currentSeason = refereeStats;
  }

  const stats = currentSeason?.statistics || currentSeason || {};
  const totalMatches = stats.matches ?? stats.gamesPlayed ?? stats.totalMatches ?? null;

  if (!totalMatches) {
    if (event?.referee && event.referee.games > 0) {
      // Fallback to basic referee object provided inside the event body
      stats.matches = event.referee.games;
      stats.yellowCards = event.referee.yellowCards ?? null;
      stats.redCards = (event.referee.redCards != null && event.referee.yellowRedCards != null)
        ? event.referee.redCards + event.referee.yellowRedCards
        : (event.referee.redCards ?? event.referee.yellowRedCards ?? null);
    } else {
      return createEmptyRefereeMetricsWithMeta(refereeId);
    }
  }

  const matchesCount = stats.matches ?? stats.gamesPlayed ?? stats.totalMatches ?? null;

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

  // ── M115-M116: Hakem Home/Away Bias (ev sahibi / deplasman faul oranı) ──
  // homeFouls/awayFouls ayrıştırılmış veri varsa kullan, yoksa null.
  // M112 kopyası KULLANILMAZ.
  const homeFouls = stats.homeFouls ?? stats.homeTeamFouls ?? null;
  const awayFouls = stats.awayFouls ?? stats.awayTeamFouls ?? null;
  let M115, M116;
  if (matchesCount != null && matchesCount > 0 && homeFouls != null && homeFouls > 0) {
    M115 = (homeFouls / matchesCount) * 100;
  } else {
    M115 = null;
  }
  if (matchesCount != null && matchesCount > 0 && awayFouls != null && awayFouls > 0) {
    M116 = (awayFouls / matchesCount) * 100;
  } else {
    M116 = null;
  }

  // ── M117: Sertlik İndeksi ──
  const M117 = (matchesCount != null && matchesCount > 0 && totalYellows != null && totalReds != null)
    ? (totalYellows + totalReds * 3) / matchesCount : null;

  // ── M118: Faul Toleransı ──
  const avgFouls = (matchesCount != null && matchesCount > 0 && totalFoulsForM112 != null && totalFoulsForM112 > 0)
    ? totalFoulsForM112 / matchesCount : null;
  const M118 = avgFouls;

  // ── M118b: Hakem Ev Sahibi Yanlılık İndeksi ──
  // İdeal hakem: 50 (tam tarafsız)
  // >50: ev sahibi lehine eğilim  <50: deplasman lehine eğilim
  // Hesaplama: ev sahibi kazanma oranı vs lig ortalaması karşılaştırması
  // Not: homeWins M112 bloğunda zaten tanımlı, burada awayWins/draws ekleniyor
  const awayWins = stats.awayWins ?? stats.awayTeamWins ?? null;
  const draws = stats.draws ?? null;
  const totalGamesForBias = (homeWins != null && awayWins != null && draws != null)
    ? homeWins + awayWins + draws
    : null;

  // Lig ev sahibi kazanma ortalamasını standingsHome'dan dinamik hesapla
  const homeRows = data.standingsHome?.standings?.[0]?.rows || [];
  const totalHomeWins = homeRows.reduce((s, r) => s + (r.wins || 0), 0);
  const totalHomePlayed = homeRows.reduce((s, r) => s + (r.played || 0), 0);
  const leagueHomeWinAvg = totalHomePlayed >= 10
    ? totalHomeWins / totalHomePlayed
    : null;

  let M118b = null;
  if (leagueHomeWinAvg != null && totalGamesForBias != null && totalGamesForBias >= 10) {
    const homeWinRate = homeWins / totalGamesForBias;
    M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 100;
    M118b = Math.max(0, Math.min(100, M118b));
  } else if (leagueHomeWinAvg != null && totalGamesForBias != null && totalGamesForBias > 0) {
    const homeWinRate = homeWins / totalGamesForBias;
    M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 50;
    M118b = Math.max(20, Math.min(80, M118b));
  }

  return {
    M109, M110, M111, M112, M113, M114, M115, M116, M117, M118, M118b,
    _meta: {
      refereeId,
      refereeName: event?.referee?.name || 'Unknown',
      matchesManaged: totalMatches,
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
