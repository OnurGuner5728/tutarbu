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
  const totalMatches = stats.matches || stats.gamesPlayed || stats.totalMatches || 0;

  if (totalMatches === 0) {
    if (event?.referee && event.referee.games > 0) {
      // Fallback to basic referee object provided inside the event body
      stats.matches = event.referee.games;
      stats.yellowCards = event.referee.yellowCards || 0;
      stats.redCards = (event.referee.redCards || 0) + (event.referee.yellowRedCards || 0);
    } else {
      return createEmptyRefereeMetricsWithMeta(refereeId);
    }
  }

  const matchesCount = stats.matches || stats.gamesPlayed || stats.totalMatches || 0;

  // ── M109: Maç Başı Sarı Kart Ortalaması ──
  const totalYellows = stats.yellowCards || stats.totalYellowCards || 0;
  const M109 = matchesCount > 0 ? totalYellows / matchesCount : 0;

  // ── M110: Maç Başı Kırmızı Kart Ortalaması ──
  const totalReds = stats.redCards || stats.totalRedCards || 0;
  const M110 = matchesCount > 0 ? totalReds / matchesCount : 0;

  // ── M111: Kırmızı Kart Oranı (redCards / matchesOfficiated) ──
  const totalPenalties = stats.penalties || stats.penaltiesAwarded || 0;
  let M111;
  if (matchesCount > 0 && totalReds > 0) {
    M111 = totalReds / matchesCount; // Gerçek veri: kırmızı kart / maç
  } else if (matchesCount > 0 && totalPenalties > 0) {
    M111 = totalPenalties / matchesCount; // Penaltı verisi varsa kullan
  } else {
    M111 = 0.24; // Fallback: lig ortalaması tahmini (gerçek veri yok)
  }

  // ── M112: Faul / Maç Ortalaması (fouls / matchesOfficiated) ──
  const homeWins = stats.homeWins || stats.homeTeamWins || 0;
  const totalFoulsForM112 = stats.fouls || stats.totalFouls || 0;
  let M112;
  if (matchesCount > 0 && totalFoulsForM112 > 0) {
    M112 = totalFoulsForM112 / matchesCount; // Gerçek veri: faul / maç
  } else if (matchesCount > 0 && homeWins > 0) {
    M112 = (homeWins / matchesCount) * 100; // Ev sahibi galibiyet oranı (yedek)
  } else {
    M112 = 45.5; // Fallback: lig ortalaması tahmini (gerçek veri yok)
  }

  // ── M113: Sarı Kart / Maç Ortalaması (yellowCards / matchesOfficiated) ──
  const totalGoals = stats.goals || stats.totalGoals || 0;
  let M113;
  if (matchesCount > 0 && totalYellows > 0) {
    M113 = totalYellows / matchesCount; // Gerçek veri: sarı kart / maç
  } else if (matchesCount > 0 && totalGoals > 0) {
    M113 = totalGoals / matchesCount; // Gol verisi varsa kullan
  } else {
    M113 = 2.65; // Fallback: lig ortalaması tahmini (gerçek veri yok)
  }

  // ── M114: Dakika / Faul Oranı (minutes / fouls) ──
  const over25 = stats.over25 || stats.overTwoFiveGoals || 0;
  const totalMinutes = stats.minutes || stats.totalMinutes || 0;
  let M114;
  if (matchesCount > 0 && totalFoulsForM112 > 0 && totalMinutes > 0) {
    M114 = totalMinutes / totalFoulsForM112; // Gerçek veri: dakika / faul
  } else if (matchesCount > 0 && over25 > 0) {
    M114 = (over25 / matchesCount) * 100; // Üst 2.5 oranı (yedek)
  } else {
    M114 = 52.0; // Fallback: lig ortalaması tahmini (gerçek veri yok)
  }

  // ── M115-M116: Hakem Home/Away Bias (ev sahibi / deplasman faul oranı) ──
  // homeFouls/awayFouls ayrıştırılmış veri varsa kullan, yoksa nötr 50.
  // M112 kopyası KULLANILMAZ.
  const homeFouls = stats.homeFouls || stats.homeTeamFouls || 0;
  const awayFouls = stats.awayFouls || stats.awayTeamFouls || 0;
  let M115, M116;
  if (matchesCount > 0 && homeFouls > 0) {
    M115 = (homeFouls / matchesCount) * 100; // Ev sahibi faul oranı (0-100 ölçek)
  } else {
    M115 = 50; // Veri yok → nötr
  }
  if (matchesCount > 0 && awayFouls > 0) {
    M116 = (awayFouls / matchesCount) * 100; // Deplasman faul oranı (0-100 ölçek)
  } else {
    M116 = 50; // Veri yok → nötr
  }

  // ── M117: Sertlik İndeksi ──
  const M117 = matchesCount > 0 ? (totalYellows + totalReds * 3) / matchesCount : 0;

  // ── M118: Faul Toleransı ──
  const avgFouls = matchesCount > 0 && totalFoulsForM112 > 0 ? totalFoulsForM112 / matchesCount : 25;
  const M118 = avgFouls / 25; // 25 = lig ortalaması yaklaşık (API'den hesaplanacak)

  // ── M118b: Hakem Ev Sahibi Yanlılık İndeksi ──
  // İdeal hakem: 50 (tam tarafsız)
  // >50: ev sahibi lehine eğilim  <50: deplasman lehine eğilim
  // Hesaplama: ev sahibi kazanma oranı vs lig ortalaması (%52) karşılaştırması
  // Not: homeWins M112 bloğunda zaten tanımlı, burada awayWins/draws ekleniyor
  const awayWins = stats.awayWins || stats.awayTeamWins || 0;
  const draws = stats.draws || 0;
  const totalGamesForBias = homeWins + awayWins + draws;

  let M118b = 50; // Nötr başlangıç
  if (totalGamesForBias >= 10) {
    const homeWinRate = homeWins / totalGamesForBias; // Hakeme göre ev kazanma oranı
    const leagueHomeWinAvg = 0.46; // Avrupa liglerinde ortalama ev sahibi kazanma oranı
    // 50 + (hakemde ev kazanma oranı - lig ortalaması) × 100
    M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 100;
    M118b = Math.max(0, Math.min(100, M118b));
  } else if (totalGamesForBias > 0) {
    // Az veri: lig ortalamasına çek
    const homeWinRate = homeWins / totalGamesForBias;
    M118b = 50 + (homeWinRate - 0.46) * 50; // Daha az ağırlık (az veri)
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
