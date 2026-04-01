/**
 * Momentum Metrics (M146–M155)
 * Baskı indeksi, baskı altında gol, topla oynama korelasyonu, pas/cross başarısı.
 */

const { extractTeamStats } = require('./team-attack');

function calculateMomentumMetrics(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const recentDetails = isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails;

  if (!recentDetails || recentDetails.length === 0) return createEmptyMomentumMetrics();

  const matchCount = recentDetails.length;

  // ── M146: Son 5 Maç Baskı İndeksi (Takımın baskısı) ──
  let totalPositivePressure = 0;
  let pressureMatchCount = 0;

  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    if (graphPoints.length > 0) {
      let positiveSum = 0, positiveCount = 0;
      for (const point of graphPoints) {
        const val = isMatchHome ? (point.value || 0) : -(point.value || 0);
        if (val > 0) { positiveSum += val; positiveCount++; }
      }
      if (positiveCount > 0) {
        totalPositivePressure += positiveSum / positiveCount;
        pressureMatchCount++;
      }
    }
  }
  const M146 = pressureMatchCount > 0 ? totalPositivePressure / pressureMatchCount : 50;

  // ── M147: Son 5 Maç Baskı Yeme İndeksi ──
  let totalNegativePressure = 0;
  let negPressureCount = 0;

  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    if (graphPoints.length > 0) {
      let negSum = 0, negCount = 0;
      for (const point of graphPoints) {
        const val = isMatchHome ? (point.value || 0) : -(point.value || 0);
        if (val < 0) { negSum += Math.abs(val); negCount++; }
      }
      if (negCount > 0) {
        totalNegativePressure += negSum / negCount;
        negPressureCount++;
      }
    }
  }
  const M147 = negPressureCount > 0 ? totalNegativePressure / negPressureCount : 50;

  // ── M148: Baskı Altında Gol Atma ──
  let goalsUnderOppPressure = 0;
  let totalGoalsScored = 0;

  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal' || inc.isHome !== isMatchHome) continue;
      totalGoalsScored++;

      const minute = inc.time || 0;
      const nearPoint = graphPoints.find(p => Math.abs(p.minute - minute) <= 2);
      if (nearPoint) {
        const teamVal = isMatchHome ? nearPoint.value : -nearPoint.value;
        if (teamVal < -30) goalsUnderOppPressure++; // Rakip baskıda iken gol
      }
    }
  }
  const M148 = totalGoalsScored > 0 ? (goalsUnderOppPressure / totalGoalsScored) * 100 : 0;

  // ── M149: Baskı Kurarken Gol Atma ──
  let goalsWhileDominating = 0;
  for (const match of recentDetails) {
    const graphPoints = match.graph?.graphPoints || [];
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;

    for (const inc of incidents) {
      if (inc.incidentType !== 'goal' || inc.isHome !== isMatchHome) continue;
      const minute = inc.time || 0;
      const nearPoint = graphPoints.find(p => Math.abs(p.minute - minute) <= 2);
      if (nearPoint) {
        const teamVal = isMatchHome ? nearPoint.value : -nearPoint.value;
        if (teamVal > 30) goalsWhileDominating++;
      }
    }
  }
  const M149 = totalGoalsScored > 0 ? (goalsWhileDominating / totalGoalsScored) * 100 : 0;

  // ── M150: Topla Oynama Ortalaması ──
  let totalPossession = 0;
  let possessionMatches = 0;

  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats?.possession) {
      totalPossession += stats.possession;
      possessionMatches++;
    }
  }
  const M150 = possessionMatches > 0 ? totalPossession / possessionMatches : 50;

  // ── M151: Topla Oynama vs Gol Korelasyonu ──
  const possessionArr = [];
  const goalsArr = [];
  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    const isMatchHome = match.homeTeam?.id === teamId;
    const scored = isMatchHome
      ? (match.homeScore?.current || 0) : (match.awayScore?.current || 0);

    if (stats?.possession) {
      possessionArr.push(stats.possession);
      goalsArr.push(scored);
    }
  }
  const M151raw = pearsonCorrelation(possessionArr, goalsArr); // -1..+1
  const M151 = ((M151raw + 1) / 2) * 100; // -1..+1 → 0..100

  // ── M152: Pas Tamamlama Oranı ──
  let totalAccPasses = 0, totalPasses = 0;
  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalAccPasses += stats.accuratePasses || 0;
      totalPasses += stats.totalPasses || 0;
    }
  }
  const M152 = totalPasses > 0 ? (totalAccPasses / totalPasses) * 100 : 78.5;

  // ── M153: Uzun Pas Başarısı ──
  let totalAccLong = 0, totalLong = 0;
  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalAccLong += stats.accurateLongBalls || 0;
      totalLong += stats.totalLongBalls || 0;
    }
  }
  const M153 = totalLong > 0 ? (totalAccLong / totalLong) * 100 : 58.0;

  // ── M154: Cross Başarısı ──
  let totalAccCross = 0, totalCross = 0;
  for (const match of recentDetails) {
    const stats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
    if (stats) {
      totalAccCross += stats.accurateCrosses || 0;
      totalCross += stats.totalCrosses || 0;
    }
  }
  const M154 = totalCross > 0 ? (totalAccCross / totalCross) * 100 : 28.5;

  // ── M155: Gole Katkı Sağlama İndeksi ──
  let goalContribs = 0;
  for (const match of recentDetails) {
    const incidents = match.incidents?.incidents || [];
    const isMatchHome = match.homeTeam?.id === teamId;
    for (const inc of incidents) {
      if (inc.incidentType !== 'goal' || inc.isHome !== isMatchHome) continue;
      goalContribs++; // gol
      if (inc.assist1) goalContribs++; // asist
    }
  }
  const M155 = matchCount > 0 ? goalContribs / matchCount : 0;

  return {
    M146, M147, M148, M149, M150, M151, M152, M153, M154, M155,
    _meta: { matchesAnalyzed: matchCount }
  };
}

function pearsonCorrelation(x, y) {
  if (x.length < 3 || x.length !== y.length) return 0;
  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 0 ? num / den : 0;
}

function createEmptyMomentumMetrics() {
  const m = {};
  for (let i = 146; i <= 155; i++) m[`M${String(i).padStart(3, '0')}`] = null;
  m._meta = { error: 'No data' };
  return m;
}

module.exports = { calculateMomentumMetrics };
