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
  let currentSeason = seasons[0]; // En güncel sezon

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

  // ── M111: Penaltı Verme Sıklığı ──
  const totalPenalties = stats.penalties || stats.penaltiesAwarded || 0;
  let M111 = matchesCount > 0 ? totalPenalties / matchesCount : 0;
  if (M111 === 0 && matchesCount > 0) M111 = 0.24; // Lig ortalaması tahmini

  // ── M112: Ev Sahibi Galibiyet Oranı ──
  const homeWins = stats.homeWins || stats.homeTeamWins || 0;
  const M112 = matchesCount > 0 && homeWins > 0 ? (homeWins / matchesCount) * 100 : 45.5;

  // ── M113: Maçlardaki Gol Ortalaması ──
  const totalGoals = stats.goals || stats.totalGoals || 0;
  let M113 = matchesCount > 0 ? totalGoals / matchesCount : 0;
  if (M113 === 0 && matchesCount > 0) M113 = 2.65; // Lig ortalaması tahmini

  // ── M114: Üst 2.5 Oranı ──
  const over25 = stats.over25 || stats.overTwoFiveGoals || 0;
  const M114 = matchesCount > 0 && over25 > 0 ? (over25 / matchesCount) * 100 : 52.0;

  // ── M115-M116: Bu takımı yönetme geçmişi ──
  // Detaylı veri gerektirdiği için mevcut refereeStats'tan yaklaşık
  const M115 = M112; // Ev sahibine yönelik ortalama
  const M116 = 100 - M112; // Deplasmana yönelik yaklaşım

  // ── M117: Sertlik İndeksi ──
  const M117 = matchesCount > 0 ? (totalYellows + totalReds * 3) / matchesCount : 0;

  // ── M118: Faul Toleransı ──
  const totalFouls = stats.fouls || stats.totalFouls || 0;
  const avgFouls = matchesCount > 0 && totalFouls > 0 ? totalFouls / matchesCount : 25;
  const M118 = avgFouls / 25; // 25 = lig ortalaması yaklaşık (API'den hesaplanacak)

  return {
    M109, M110, M111, M112, M113, M114, M115, M116, M117, M118,
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
