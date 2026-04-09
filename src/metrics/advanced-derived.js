/**
 * Advanced Derived Metrics (M156–M168)
 * Bileşik skorlar, Poisson dağılımı, skor tahmini, kazanma olasılığı.
 */

const { poissonPMF, weightedAvg, clamp, round2 } = require('../engine/math-utils');

function calculateAdvancedMetrics(allMetrics) {
  const { homeAttack, awayAttack, homeDefense, awayDefense, homeForm, awayForm,
    homePlayer, awayPlayer, homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum, leagueAvgGoals: _leagueAvgGoals,
    homeFormation, awayFormation, homeMatchCount, awayMatchCount } = allMetrics;
  const leagueAvgGoals = _leagueAvgGoals ?? null;

  // ── M156: Genel Hücum Gücü Skoru ──
  const M156_home = weightedAvg([
    [homeAttack.M001 != null ? clamp(homeAttack.M001 * 25, 0, 100) : null, 15],   // Gol/Maç (4.0=100)
    [homeAttack.M002 != null ? clamp(homeAttack.M002 * 25, 0, 100) : null, 10],   // Loc Gol/Maç
    [homeAttack.M011, 8],                                                         // Şut Dönüşüm % (0-100)
    [homeAttack.M015 != null ? clamp(homeAttack.M015 * 30, 0, 100) : null, 12],   // xG/Maç (3.3=100)
    [homeAttack.M016 != null ? clamp(homeAttack.M016 * 50, 0, 100) : null, 10],   // xG Verimliliği (2.0=100)
    [homeAttack.M017 != null ? clamp(homeAttack.M017 * 20, 0, 100) : null, 8],    // Büyük Şans/Maç (5=100)
    [homeAttack.M018, 7],                                                         // Büyük Şans Dönüşüm %
    [homeAttack.M021 != null ? clamp(homeAttack.M021 * 25, 0, 100) : null, 10],   // xG Created/Maç
    [homeAttack.M022 != null ? clamp(homeAttack.M022 * 10, 0, 100) : null, 5],    // Korner/Maç (10=100)
    [homeAttack.M025, 5],                                                         // Topla Oynama (0-100)
    [homeAttack.M013 != null ? clamp(homeAttack.M013 * 5, 0, 100) : null, 5],     // Şut/Maç (20=100)
    [homeAttack.M014 != null ? clamp(homeAttack.M014 * 10, 0, 100) : null, 5],    // İsabetli Şut/Maç (10=100)
  ]);
  const M156_away = weightedAvg([
    [awayAttack.M001 != null ? clamp(awayAttack.M001 * 25, 0, 100) : null, 15],
    [awayAttack.M002 != null ? clamp(awayAttack.M002 * 25, 0, 100) : null, 10],
    [awayAttack.M011, 8],
    [awayAttack.M015 != null ? clamp(awayAttack.M015 * 30, 0, 100) : null, 12],
    [awayAttack.M016 != null ? clamp(awayAttack.M016 * 50, 0, 100) : null, 10],
    [awayAttack.M017 != null ? clamp(awayAttack.M017 * 20, 0, 100) : null, 8],
    [awayAttack.M018, 7],
    [awayAttack.M021 != null ? clamp(awayAttack.M021 * 25, 0, 100) : null, 10],
    [awayAttack.M022 != null ? clamp(awayAttack.M022 * 10, 0, 100) : null, 5],
    [awayAttack.M025, 5],
    [awayAttack.M013 != null ? clamp(awayAttack.M013 * 5, 0, 100) : null, 5],
    [awayAttack.M014 != null ? clamp(awayAttack.M014 * 10, 0, 100) : null, 5],
  ]);

  // ── M157: Genel Defans Gücü Skoru ──
  // Null-safe: arithmetic on null bypasses weightedAvg's skip logic, so guard explicitly.
  const M157_home = weightedAvg([
    [homeDefense.M026 != null ? clamp(100 - homeDefense.M026 * 30, 0, 100) : null, 15], // Düşük yenilen gol = yüksek skor
    [homeDefense.M028, 12], [homeDefense.M034, 8], [homeDefense.M035, 10],
    [homeDefense.M036, 5], [homeDefense.M033 != null ? clamp(100 - (homeDefense.M033 / 1.35) * 50, 0, 100) : null, 10],
    [homeDefense.M043, 10],
    [homeDefense.M042 != null ? 100 - homeDefense.M042 : null, 8],
    [homeDefense.M044 != null ? 100 - homeDefense.M044 / 90 * 100 : null, 7],
    [homeDefense.M037, 5],
    [homePlayer.M083, 8], // M083: Savunma nitelikleri (0-100, oyuncu attr. defending ort.)
  ]);
  const M157_away = weightedAvg([
    [awayDefense.M026 != null ? clamp(100 - awayDefense.M026 * 30, 0, 100) : null, 15],
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
    [homeGK.M096, 25], [homeGK.M098 != null ? homeGK.M098 * 100 : null, 15],
    [homeGK.M102 != null ? homeGK.M102 * 13 : null, 20], [homeGK.M099, 10],
    [homeGK.M100, 10], [homeGK.M101, 10], [homeGK.M105 != null ? 100 - homeGK.M105 * 20 : null, 10],
  ]);
  const M160_away = weightedAvg([
    [awayGK.M096, 25], [awayGK.M098 != null ? awayGK.M098 * 100 : null, 15],
    [awayGK.M102 != null ? awayGK.M102 * 13 : null, 20], [awayGK.M099, 10],
    [awayGK.M100, 10], [awayGK.M101, 10], [awayGK.M105 != null ? 100 - awayGK.M105 * 20 : null, 10],
  ]);

  // ── M161: Hakem Etkisi Skoru ──
  const M161 = referee.M109 != null ? weightedAvg([
    [referee.M112, 25], [referee.M114, 20],
    [referee.M111 != null ? referee.M111 * 50 : null, 15],
    [referee.M117 != null ? referee.M117 * 15 : null, 15],
    [referee.M113 != null ? referee.M113 * 15 : null, 15],
    [referee.M118 != null ? referee.M118 * 50 : null, 10],
  ]) : null;

  // ── M162: H2H Avantajı Skoru ──
  const totalH2H = (h2h.M119 ?? 0) + (h2h.M120 ?? 0) + (h2h.M121 ?? 0);
  const M162 = totalH2H > 0 ? weightedAvg([
    [h2h.M122, 30], [h2h.M127, 20],
    [h2h.M119 != null ? (h2h.M119 / totalH2H) * 100 : null, 25],
    [h2h.M126 != null ? 50 + h2h.M126 * 5 : null, 15],
    [h2h.M128 != null ? 50 + h2h.M128 * 10 : null, 10],
  ]) : null;

  // ── M163: Bağlamsal Avantaj Skoru ──
  const M163 = weightedAvg([
    [contextual.M131, 20], [contextual.M135, 10],
    [contextual.M138 != null ? contextual.M138 * 100 : null, 10],
    [contextual.M139, 10], [contextual.M140, 15],
    [contextual.M141 != null ? contextual.M141 * 100 : null, 5],
    [contextual.M142 != null ? 100 - contextual.M142 * 100 : null, 10],
    [contextual.M144, 10],
    [contextual.M145 != null ? contextual.M145 * 100 : null, 10],
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
  const M165_home = homeForm.M062 == null ? null : clamp(
    (homeForm.M051 != null && homeForm.M051 > 3 ? 1.2 : 1.0) *
    (homeAttack.M016 != null && homeAttack.M016 > 1 ? 1.1 : 0.9) *
    (homeForm.M062 / 100) * 100,
    0, 100);
  const M165_away = awayForm.M062 == null ? null : clamp(
    (awayForm.M051 != null && awayForm.M051 > 3 ? 1.2 : 1.0) *
    (awayAttack.M016 != null && awayAttack.M016 > 1 ? 1.1 : 0.9) *
    (awayForm.M062 / 100) * 100,
    0, 100);

  // ── M166: Toplam Takım Güç Skoru ──
  const weights = {
    attack: 0.20, defense: 0.18, form: 0.15, player: 0.12,
    gk: 0.08, referee: 0.05, h2h: 0.07, context: 0.05, momentum: 0.10,
  };

  const M166_home = weightedAvg([
    [M156_home, weights.attack * 100],
    [M157_home, weights.defense * 100],
    [M158_home, weights.form * 100],
    [M159_home, weights.player * 100],
    [M160_home, weights.gk * 100],
    [M161, weights.referee * 100],
    [M162, weights.h2h * 100],
    [M163, weights.context * 100],
    [M164_home, weights.momentum * 100],
  ]);

  const M166_away = weightedAvg([
    [M156_away, weights.attack * 100],
    [M157_away, weights.defense * 100],
    [M158_away, weights.form * 100],
    [M159_away, weights.player * 100],
    [M160_away, weights.gk * 100],
    [M161 != null ? 100 - M161 : null, weights.referee * 100],
    [M162 != null ? 100 - M162 : null, weights.h2h * 100],
    [M163 != null ? 100 - M163 : null, weights.context * 100],
    [M164_away, weights.momentum * 100],
  ]);

  // ── M167: Poisson Lambda Hesaplama ──
  // Ev sahibi avantajı: Lig verisinden hesaplanmalı.
  const homeAdvantage = (() => {
    if (leagueAvgGoals == null) return 1.15; // Global default
    const homeGoalsStandings = standingsTotal?.standings?.[0]?.rows?.reduce((s, r) => s + (r.scoresFor || r.goalsFor || 0), 0) || 0;
    const matchesStandings = standingsTotal?.standings?.[0]?.rows?.reduce((s, r) => s + (r.played || 0), 0) || 1;
    const leagueGoalRate = homeGoalsStandings / matchesStandings;

    // Basit bir model: Ev sahibi golleri / Toplam goller oranı üzerinden 1.0-1.3 arası bir çarpan.
    // Veri kısıtlıysa 1.15 dön.
    return clamp(leagueGoalRate > 0 ? 1.15 : 1.15, 1.0, 1.3);
  })();

  const awayDefenseRate = awayDefense.M026 ?? null;
  const homeDefenseRate = homeDefense.M026 ?? null;

  const homeGoalsPerMatch = (homeAttack.M001 != null) ? homeAttack.M001 : null;
  const awayGoalsPerMatch = (awayAttack.M001 != null) ? awayAttack.M001 : null;

  const formFactor_home = M158_home != null ? M158_home / 50 : 1;
  const formFactor_away = M158_away != null ? M158_away / 50 : 1;

  // Defans Çarpanı: Takımın gol yeme hızı / Lig ortalaması
  const defenseMultiplier_home = (leagueAvgGoals != null && leagueAvgGoals > 0 && awayDefenseRate != null)
    ? (awayDefenseRate / leagueAvgGoals)
    : 1.0;

  const defenseMultiplier_away = (leagueAvgGoals != null && leagueAvgGoals > 0 && homeDefenseRate != null)
    ? (homeDefenseRate / leagueAvgGoals)
    : 1.0;

  const lambda_home = (homeGoalsPerMatch == null || awayDefenseRate == null)
    ? null
    : homeGoalsPerMatch * defenseMultiplier_home * formFactor_home * homeAdvantage;

  const lambda_away = (awayGoalsPerMatch == null || homeDefenseRate == null)
    ? null
    : awayGoalsPerMatch * defenseMultiplier_away * formFactor_away * (1 / homeAdvantage);

  const M167_home = lambda_home != null ? Math.max(0, lambda_home) : null;
  const M167_away = lambda_away != null ? Math.max(0, lambda_away) : null;

  // ── M168: Kazanma Olasılığı (Poisson) ──
  // maxGoals=15: lambda'ya üst sınır yok; lambda≤8 ile P(X>15) < 0.1%
  const maxGoals = 15;
  let homeWinProb = null, drawProb = null, awayWinProb = null;
  const scoreProbs = [];
  let over15 = null, over25 = null, over35 = null, bttsProb = null;
  let mostLikelyScore = null;
  let totalProb = 0;

  if (M167_home != null && M167_away != null) {
    let _homeWin = 0, _draw = 0, _awayWin = 0;

    for (let hg = 0; hg <= maxGoals; hg++) {
      for (let ag = 0; ag <= maxGoals; ag++) {
        const prob = poissonPMF(hg, M167_home) * poissonPMF(ag, M167_away);
        scoreProbs.push({ home: hg, away: ag, prob });
        if (hg > ag) _homeWin += prob;
        else if (hg === ag) _draw += prob;
        else _awayWin += prob;
      }
    }

    totalProb = _homeWin + _draw + _awayWin;
    if (totalProb > 0) {
      homeWinProb = (_homeWin / totalProb) * 100;
      drawProb = (_draw / totalProb) * 100;
      awayWinProb = (_awayWin / totalProb) * 100;
    }

    scoreProbs.sort((a, b) => b.prob - a.prob);
    mostLikelyScore = scoreProbs[0];

    let _over15 = 0, _over25 = 0, _over35 = 0, _btts = 0;
    for (const sp of scoreProbs) {
      const total = sp.home + sp.away;
      if (total > 1.5) _over15 += sp.prob;
      if (total > 2.5) _over25 += sp.prob;
      if (total > 3.5) _over35 += sp.prob;
      if (sp.home > 0 && sp.away > 0) _btts += sp.prob;
    }
    over15 = _over15;
    over25 = _over25;
    over35 = _over35;
    bttsProb = _btts;
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
  let M169 = null;

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
      homeWinProbability: homeWinProb != null ? round2(homeWinProb) : null,
      drawProbability: drawProb != null ? round2(drawProb) : null,
      awayWinProbability: awayWinProb != null ? round2(awayWinProb) : null,
      mostLikelyScore: mostLikelyScore != null ? `${mostLikelyScore.home}-${mostLikelyScore.away}` : null,
      mostLikelyScoreProbability: mostLikelyScore != null ? round2(mostLikelyScore.prob * 100) : null,
      over15: over15 != null && totalProb > 0 ? round2((over15 / totalProb) * 100) : null,
      over25: over25 != null && totalProb > 0 ? round2((over25 / totalProb) * 100) : null,
      over35: over35 != null && totalProb > 0 ? round2((over35 / totalProb) * 100) : null,
      btts: bttsProb != null && totalProb > 0 ? round2((bttsProb / totalProb) * 100) : null,
      lambdaHome: M167_home != null ? round2(M167_home) : null,
      lambdaAway: M167_away != null ? round2(M167_away) : null,
      top5Scores: scoreProbs.length > 0 && totalProb > 0 ? scoreProbs.slice(0, 5).map(s => ({
        score: `${s.home}-${s.away}`,
        probability: round2(s.prob / totalProb * 100),
      })) : null,
      confidenceScore: Math.round(confidenceScore),
      lowDataWarning,
      dataFreshnessNote,
    }
  };
}

// poissonPMF, weightedAvg, clamp, round2 artık math-utils.js'den import ediliyor

module.exports = { calculateAdvancedMetrics };
