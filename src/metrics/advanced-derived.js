/**
 * Advanced Derived Metrics (M156–M168)
 * Bileşik skorlar, Poisson dağılımı, skor tahmini, kazanma olasılığı.
 */

function calculateAdvancedMetrics(allMetrics) {
  const { homeAttack, awayAttack, homeDefense, awayDefense, homeForm, awayForm,
    homePlayer, awayPlayer, homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum, leagueAvgGoals: _leagueAvgGoals,
    homeFormation, awayFormation } = allMetrics;
  const leagueAvgGoals = _leagueAvgGoals || 1.35; // Fallback: 1.35

  // ── M156: Genel Hücum Gücü Skoru ──
  const M156_home = weightedAvg([
    [homeAttack.M001, 15], [homeAttack.M002, 10], [homeAttack.M011, 8],
    [homeAttack.M015, 12], [homeAttack.M016, 10], [homeAttack.M017, 8],
    [homeAttack.M018, 7], [homeAttack.M021, 10], [homeAttack.M022, 5],
    [homeAttack.M025, 5], [homeAttack.M013, 5], [homeAttack.M014, 5],
  ]);
  const M156_away = weightedAvg([
    [awayAttack.M001, 15], [awayAttack.M002, 10], [awayAttack.M011, 8],
    [awayAttack.M015, 12], [awayAttack.M016, 10], [awayAttack.M017, 8],
    [awayAttack.M018, 7], [awayAttack.M021, 10], [awayAttack.M022, 5],
    [awayAttack.M025, 5], [awayAttack.M013, 5], [awayAttack.M014, 5],
  ]);

  // ── M157: Genel Defans Gücü Skoru ──
  // Null-safe: arithmetic on null bypasses weightedAvg's skip logic, so guard explicitly.
  const M157_home = weightedAvg([
    [100 - (homeDefense.M026 || 0) * 30, 15], // Düşük yenilen gol = yüksek skor
    [homeDefense.M028, 12], [homeDefense.M034, 8], [homeDefense.M035, 10],
    [homeDefense.M036, 5], [homeDefense.M033 != null ? clamp(100 - (homeDefense.M033 / 1.35) * 50, 0, 100) : null, 10],
    [homeDefense.M043, 10],
    [homeDefense.M042 != null ? 100 - homeDefense.M042 : null, 8],
    [homeDefense.M044 != null ? 100 - homeDefense.M044 / 90 * 100 : null, 7],
    [homeDefense.M037, 5],
    [homePlayer.M083, 8], // M083: Savunma nitelikleri (0-100, oyuncu attr. defending ort.)
  ]);
  const M157_away = weightedAvg([
    [100 - (awayDefense.M026 || 0) * 30, 15],
    [awayDefense.M028, 12], [awayDefense.M034, 8], [awayDefense.M035, 10],
    [awayDefense.M036, 5], [awayDefense.M033 != null ? clamp(100 - (awayDefense.M033 / 1.35) * 50, 0, 100) : null, 10],
    [awayDefense.M043, 10],
    [awayDefense.M042 != null ? 100 - awayDefense.M042 : null, 8],
    [awayDefense.M044 != null ? 100 - awayDefense.M044 / 90 * 100 : null, 7],
    [awayDefense.M037, 5],
    [awayPlayer.M083, 8], // M083: Savunma nitelikleri (0-100, oyuncu attr. defending ort.)
  ]);

  // ── M158: Genel Form Skoru ──
  const M158_home = weightedAvg([
    [homeForm.M046, 25], [homeForm.M047, 20], [homeForm.M048, 10],
    [homeForm.M055, 15], [homeForm.M062, 10], [homeForm.M063, 10],
    [homeForm.M064, 5], [homeForm.M065, 5],
  ]);
  const M158_away = weightedAvg([
    [awayForm.M046, 25], [awayForm.M047, 20], [awayForm.M048, 10],
    [awayForm.M055, 15], [awayForm.M062, 10], [awayForm.M063, 10],
    [awayForm.M064, 5], [awayForm.M065, 5],
  ]);

  // ── M159: Oyuncu Kalitesi Skoru ──
  // Null-safe: arithmetic on null bypasses weightedAvg's skip logic, so guard explicitly.
  const M159_home = weightedAvg([
    [homePlayer.M066 != null ? (homePlayer.M066 / 10) * 100 : null, 20], [homePlayer.M069, 10],
    [homePlayer.M070 != null ? homePlayer.M070 * 20 : null, 10],
    [homePlayer.M071 != null ? (homePlayer.M071 / 10) * 100 : null, 10],
    [homePlayer.M082, 10], [homePlayer.M084, 10],
    [homePlayer.M077 != null ? Math.max(0, 100 - (homePlayer.M077 / 5.0) * 100) : null, 15],
    [homePlayer.M078 != null ? Math.max(0, 100 - (homePlayer.M078 / 5.0) * 100) : null, 15],
  ]);
  const M159_away = weightedAvg([
    [awayPlayer.M066 != null ? (awayPlayer.M066 / 10) * 100 : null, 20], [awayPlayer.M069, 10],
    [awayPlayer.M070 != null ? awayPlayer.M070 * 20 : null, 10],
    [awayPlayer.M071 != null ? (awayPlayer.M071 / 10) * 100 : null, 10],
    [awayPlayer.M082, 10], [awayPlayer.M084, 10],
    [awayPlayer.M077 != null ? Math.max(0, 100 - (awayPlayer.M077 / 5.0) * 100) : null, 15],
    [awayPlayer.M078 != null ? Math.max(0, 100 - (awayPlayer.M078 / 5.0) * 100) : null, 15],
  ]);

  // ── M160: Kaleci Gücü Skoru ──
  const M160_home = weightedAvg([
    [homeGK.M096, 25], [(homeGK.M098 || 0) * 100, 15],
    [(homeGK.M102 || 0) * 13, 20], [homeGK.M099, 10],
    [homeGK.M100, 10], [homeGK.M101, 10], [100 - (homeGK.M105 || 0) * 20, 10],
  ]);
  const M160_away = weightedAvg([
    [awayGK.M096, 25], [(awayGK.M098 || 0) * 100, 15],
    [(awayGK.M102 || 0) * 13, 20], [awayGK.M099, 10],
    [awayGK.M100, 10], [awayGK.M101, 10], [100 - (awayGK.M105 || 0) * 20, 10],
  ]);

  // ── M161: Hakem Etkisi Skoru ──
  const M161 = referee.M109 != null ? weightedAvg([
    [referee.M112, 25], [referee.M114, 20],
    [referee.M111 != null ? referee.M111 * 50 : null, 15],
    [referee.M117 != null ? referee.M117 * 15 : null, 15],
    [referee.M113 != null ? referee.M113 * 15 : null, 15],
    [referee.M118 != null ? referee.M118 * 50 : null, 10],
  ]) : 50;

  // ── M162: H2H Avantajı Skoru ──
  const totalH2H = (h2h.M119 || 0) + (h2h.M120 || 0) + (h2h.M121 || 0);
  const M162 = totalH2H > 0 ? weightedAvg([
    [h2h.M122, 30], [h2h.M127, 20], [(h2h.M119 / totalH2H) * 100, 25],
    [50 + h2h.M126 * 5, 15], [50 + h2h.M128 * 10, 10],
  ]) : 50;

  // ── M163: Bağlamsal Avantaj Skoru ──
  const M163 = weightedAvg([
    [contextual.M131, 20], [contextual.M135, 10], [contextual.M138 * 100, 10],
    [contextual.M139, 10], [contextual.M140, 15], [contextual.M141 * 100, 5],
    [100 - contextual.M142 * 100, 10], [contextual.M144, 10], [contextual.M145 * 100, 10],
  ]);

  // ── M164: Momentum Skoru ──
  // Note: arithmetic on null produces 0/100 in JS which bypasses weightedAvg's null-skip.
  // Wrap expressions so null inputs yield null (skipped by weightedAvg).
  const M164_home = weightedAvg([
    [homeMomentum.M146, 20],
    [homeMomentum.M147 != null ? 100 - homeMomentum.M147 : null, 15],
    [homeMomentum.M149, 15], [homeMomentum.M150, 15],
    [homeMomentum.M152, 10], [homeMomentum.M154, 10],
    [homeMomentum.M155 != null ? homeMomentum.M155 * 20 : null, 15],
  ]);
  const M164_away = weightedAvg([
    [awayMomentum.M146, 20],
    [awayMomentum.M147 != null ? 100 - awayMomentum.M147 : null, 15],
    [awayMomentum.M149, 15], [awayMomentum.M150, 15],
    [awayMomentum.M152, 10], [awayMomentum.M154, 10],
    [awayMomentum.M155 != null ? awayMomentum.M155 * 20 : null, 15],
  ]);

  // ── M165: Mutlaka Gol Atma İndeksi ──
  const M165_home = clamp(
    ((homeForm.M051 || 0) > 3 ? 1.2 : 1.0) *
    ((homeAttack.M016 || 1) > 1 ? 1.1 : 0.9) *
    ((homeForm.M062 || 0) / 100) * 100,
    0, 100);
  const M165_away = clamp(
    ((awayForm.M051 || 0) > 3 ? 1.2 : 1.0) *
    ((awayAttack.M016 || 1) > 1 ? 1.1 : 0.9) *
    ((awayForm.M062 || 0) / 100) * 100,
    0, 100);

  // ── M166: Toplam Takım Güç Skoru ──
  const weights = {
    attack: 0.20, defense: 0.18, form: 0.15, player: 0.12,
    gk: 0.08, referee: 0.05, h2h: 0.07, context: 0.05, momentum: 0.10,
  };

  const M166_home = clamp(
    M156_home * weights.attack +
    M157_home * weights.defense +
    M158_home * weights.form +
    M159_home * weights.player +
    M160_home * weights.gk +
    M161 * weights.referee +
    M162 * weights.h2h +
    M163 * weights.context +
    M164_home * weights.momentum, 0, 100);

  const M166_away = clamp(
    M156_away * weights.attack +
    M157_away * weights.defense +
    M158_away * weights.form +
    M159_away * weights.player +
    M160_away * weights.gk +
    (100 - M161) * weights.referee +
    (100 - M162) * weights.h2h +
    (100 - M163) * weights.context +
    M164_away * weights.momentum, 0, 100);

  // ── M167: Poisson Lambda Hesaplama ──
  const homeAdvantage = 1.15; // Ev sahibi avantaj çarpanı

  // M026 (goals conceded/match): null → use league avg; 0 → legitimate (perfect defense), keep 0.
  // Using || would silently replace 0 with leagueAvgGoals, overstating lambda for elite defenses.
  const awayDefenseRate = awayDefense.M026 != null ? awayDefense.M026 : leagueAvgGoals;
  const homeDefenseRate = homeDefense.M026 != null ? homeDefense.M026 : leagueAvgGoals;

  // M001=0 gerçek mi yoksa veri eksikliği mi?
  // Kural: M001 null/undefined ise → veri yok → fallback.
  //        M001 > 0 ise → gerçek veri, kullan.
  //        M001 = 0 AND ≥5 maç varsa → gerçekten 0 gol atan takım, kullan.
  //        M001 = 0 AND <5 maç varsa → yetersiz veri → fallback.
  const homeMatchCount = homeAttack._matchCount ?? 0;
  const homeGoalsPerMatch = (homeAttack.M001 != null && (homeAttack.M001 > 0 || homeMatchCount >= 5))
    ? homeAttack.M001
    : leagueAvgGoals;

  const awayMatchCount = awayAttack._matchCount ?? 0;
  const awayGoalsPerMatch = (awayAttack.M001 != null && (awayAttack.M001 > 0 || awayMatchCount >= 5))
    ? awayAttack.M001
    : leagueAvgGoals;

  const lambda_home = homeGoalsPerMatch *
    (awayDefenseRate / leagueAvgGoals) *
    ((M158_home || 50) / 50) * homeAdvantage;

  const lambda_away = awayGoalsPerMatch *
    (homeDefenseRate / leagueAvgGoals) *
    ((M158_away || 50) / 50) * (1 / homeAdvantage);

  const M167_home = Math.max(0.3, Math.min(lambda_home, 3.5));
  const M167_away = Math.max(0.3, Math.min(lambda_away, 3.5));

  // ── M168: Kazanma Olasılığı (Poisson) ──
  // maxGoals=10: lambda≤3.5 ile P(X>10) < 0.1% → probability loss ihmal edilebilir
  const maxGoals = 10;
  let homeWinProb = 0, drawProb = 0, awayWinProb = 0;
  const scoreProbs = [];

  for (let hg = 0; hg <= maxGoals; hg++) {
    for (let ag = 0; ag <= maxGoals; ag++) {
      const prob = poissonPMF(hg, M167_home) * poissonPMF(ag, M167_away);
      scoreProbs.push({ home: hg, away: ag, prob });
      if (hg > ag) homeWinProb += prob;
      else if (hg === ag) drawProb += prob;
      else awayWinProb += prob;
    }
  }

  // Normalize — guard against totalProb=0 (should never happen with clamped lambdas, but defensive)
  const totalProb = homeWinProb + drawProb + awayWinProb;
  if (totalProb <= 0) {
    // Fallback: equal split
    homeWinProb = 33.33;
    drawProb = 33.33;
    awayWinProb = 33.34;
  } else {
    homeWinProb = (homeWinProb / totalProb) * 100;
    drawProb = (drawProb / totalProb) * 100;
    awayWinProb = (awayWinProb / totalProb) * 100;
  }

  // En olası skor
  scoreProbs.sort((a, b) => b.prob - a.prob);
  const mostLikelyScore = scoreProbs[0];

  // Üst/Alt hesaplamaları
  let over15 = 0, over25 = 0, over35 = 0, bttsProb = 0;
  for (const sp of scoreProbs) {
    const total = sp.home + sp.away;
    if (total > 1.5) over15 += sp.prob;
    if (total > 2.5) over25 += sp.prob;
    if (total > 3.5) over35 += sp.prob;
    if (sp.home > 0 && sp.away > 0) bttsProb += sp.prob;
  }

  // ── Confidence Score / Data Quality ──
  const matchDataScore = Math.min(homeMatchCount, awayMatchCount) >= 5
    ? 40
    : Math.min(homeMatchCount, awayMatchCount) * 8;
  const metricCompleteness = [homeAttack.M001, homeAttack.M026, homeForm.M046, homePlayer.M066]
    .filter(v => v != null).length * 10; // max 40
  const confidenceScore = Math.min(100, matchDataScore + metricCompleteness + 20); // 20 base
  const lowDataWarning = Math.min(homeMatchCount, awayMatchCount) < 5;
  const dataFreshnessNote = `${Math.min(homeMatchCount, awayMatchCount)} maç verisi kullanıldı`;

  // ── M169: Formasyon Uyumsuzluğu Avantajı ──
  // Pozitif değer ev sahibi lehine taktik avantaj gösterir.
  function parseForm(f) {
    if (!f) return null;
    let normalized = String(f).trim();
    // Dash-less: "442" → "4-4-2", "4321" → "4-3-2-1"
    if (!normalized.includes('-') && !normalized.includes(' ') && /^\d+$/.test(normalized)) {
      normalized = normalized.split('').join('-');
    }
    // Space-separated: "4 4 2" → "4-4-2"
    if (normalized.includes(' ') && !normalized.includes('-')) {
      normalized = normalized.replace(/\s+/g, '-');
    }
    // Dot-separated: "4.4.2" → "4-4-2"
    if (normalized.includes('.') && !normalized.includes('-')) {
      normalized = normalized.replace(/\./g, '-');
    }
    const parts = normalized.split('-').map(Number).filter(n => !isNaN(n) && n >= 0);
    if (parts.length < 3) return null;
    return { def: parts[0], mid: parts.slice(1, -1).reduce((a, b) => a + b, 0), fwd: parts[parts.length - 1] };
  }
  const homeF = parseForm(homeFormation);
  const awayF = parseForm(awayFormation);
  let M169 = 50;

  if (homeF && awayF) {
    const awayUses3Back = awayF.def === 3 || awayF.def === 5;
    const midDiff = homeF.mid - awayF.mid;
    const attackPresence = homeF.fwd - awayF.def;
    M169 = 50
      + (awayUses3Back ? 3 : 0)
      + midDiff * 2
      + attackPresence * 1.5;
    M169 = Math.max(20, Math.min(80, M169));
  }

  return {
    home: {
      M156: M156_home, M157: M157_home, M158: M158_home, M159: M159_home,
      M160: M160_home, M164: M164_home, M165: M165_home, M166: M166_home,
      M167: M167_home,
    },
    away: {
      M156: M156_away, M157: M157_away, M158: M158_away, M159: M159_away,
      M160: M160_away, M164: M164_away, M165: M165_away, M166: M166_away,
      M167: M167_away,
    },
    shared: { M161, M162, M163, M169 },
    prediction: {
      homeWinProbability: round2(homeWinProb),
      drawProbability: round2(drawProb),
      awayWinProbability: round2(awayWinProb),
      mostLikelyScore: `${mostLikelyScore.home}-${mostLikelyScore.away}`,
      mostLikelyScoreProbability: round2(mostLikelyScore.prob * 100),
      over15: round2(totalProb > 0 ? (over15 / totalProb) * 100 : 0),
      over25: round2(totalProb > 0 ? (over25 / totalProb) * 100 : 0),
      over35: round2(totalProb > 0 ? (over35 / totalProb) * 100 : 0),
      btts: round2(totalProb > 0 ? (bttsProb / totalProb) * 100 : 0),
      lambdaHome: round2(M167_home),
      lambdaAway: round2(M167_away),
      top5Scores: scoreProbs.slice(0, 5).map(s => ({
        score: `${s.home}-${s.away}`,
        probability: round2(s.prob / totalProb * 100),
      })),
      confidenceScore: Math.round(confidenceScore),
      lowDataWarning,
      dataFreshnessNote,
    }
  };
}

function poissonPMF(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function weightedAvg(pairs) {
  let totalWeight = 0, totalValue = 0;
  for (const [value, weight] of pairs) {
    if (value == null || isNaN(value)) continue;
    totalValue += clamp(value, 0, 100) * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? clamp(totalValue / totalWeight, 0, 100) : 50;
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function round2(val) {
  return Math.round(val * 100) / 100;
}

module.exports = { calculateAdvancedMetrics };
