/**
 * Advanced Derived Metrics (M156–M168)
 * Bileşik skorlar, Poisson dağılımı, skor tahmini, kazanma olasılığı.
 */

const { poissonPMF, weightedAvg, clamp, round2 } = require('../engine/math-utils');
const { calculateUnitImpact, SIM_BLOCKS } = require('../engine/match-simulator');

function calculateAdvancedMetrics(allMetrics) {
  const { homeAttack, awayAttack, homeDefense, awayDefense, homeForm, awayForm,
    homePlayer, awayPlayer, homeGK, awayGK, referee, h2h, contextual,
    homeMomentum, awayMomentum, leagueAvgGoals: _leagueAvgGoals,
    homeFormation, awayFormation, homeMatchCount, awayMatchCount,
    homeFlat, awayFlat, sharedFlat, allMetricIds } = allMetrics;
  
  const leagueAvgGoals = _leagueAvgGoals ?? 1.3;

  // 1. Calculate the 26 Behavioral Units for both teams
  const homeUnits = {};
  const awayUnits = {};
  for (const blockId in SIM_BLOCKS) {
    homeUnits[blockId] = calculateUnitImpact(blockId, { ...homeFlat, ...sharedFlat }, allMetricIds);
    awayUnits[blockId] = calculateUnitImpact(blockId, { ...awayFlat, ...sharedFlat }, allMetricIds);
  }

  // 2. Derive Lambda (Attack/Defense Power)
  // Eşit ağırlıklı geometrik ortalama yardımcıları — keyfi ağırlık katsayısı yok
  const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));
  const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));

  const getPower = (side, units) => {
    // Hücum: üç birim eşit ağırlıklı geometrik ortalama
    const atk = geo3(units.BITIRICILIK, units.YARATICILIK, units.SUT_URETIMI)
              * geo2(units.FORM_KISA, units.FORM_UZUN)
              * geo2(units.TOPLA_OYNAMA, units.BAGLANTI_OYUNU);

    // Savunma: üç birim eşit ağırlıklı geometrik ortalama
    const def = geo3(units.SAVUNMA_DIRENCI, units.SAVUNMA_AKSIYONU, units.GK_REFLEKS)
              * geo2(units.DISIPLIN, units.GK_ALAN_HAKIMIYETI)
              / Math.max(units.TURNUVA_BASKISI, 0.1); // Yüksek baskı → savunma azalır — saf ters orantı, keyfi sabit yok

    return { atk: clamp(atk, 0.4, 2.5), def: clamp(def, 0.4, 2.5) };
  };

  const hP = getPower('home', homeUnits);
  const aP = getPower('away', awayUnits);

  // Home Advantage (Enhanced)
  const homeAdv = 1.05 + (homeUnits.BAGLANTI_OYUNU * 0.05) + (homeUnits.MAC_BASLANGICI * 0.05);

  const lambda_home = (hP.atk / aP.def) * (leagueAvgGoals || 1.3) * homeAdv;
  const lambda_away = (aP.atk / hP.def) * (leagueAvgGoals || 1.3) * (1 / homeAdv);

  const M167_home = round2(clamp(lambda_home, 0.1, 8.0));
  const M167_away = round2(clamp(lambda_away, 0.1, 8.0));

  // Legacy M156-M160 scores (UI uyumluluğu için korunur — birimler 0-1 aralığında olduğundan
  // *50 ile 0-50 skala aralığına taşınır; bu ölçekleme keyfidir, yalnızca UI gösterimi içindir)
  const M156_home = homeUnits.BITIRICILIK * 50; // *50: 0-1 birim → 0-50 UI skalası
  const M156_away = awayUnits.BITIRICILIK * 50;
  const M157_home = homeUnits.SAVUNMA_DIRENCI * 50;
  const M157_away = awayUnits.SAVUNMA_DIRENCI * 50;
  const M158_home = homeUnits.FORM_KISA * 50;
  const M158_away = awayUnits.FORM_KISA * 50;
  const M159_home = homeUnits.KADRO_DERINLIGI * 50;
  const M159_away = awayUnits.KADRO_DERINLIGI * 50;
  const M160_home = homeUnits.GK_REFLEKS * 50;
  const M160_away = awayUnits.GK_REFLEKS * 50;

  // ── M161: Hakem Etkisi Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M161 = homeUnits.HAKEM_DINAMIKLERI * 50;

  // ── M162: H2H Avantajı Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M162 = homeUnits.H2H_DOMINASYON * 50;

  // ── M163: Bağlamsal Avantaj Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M163 = homeUnits.TURNUVA_BASKISI * 50;

  // ── M164: Momentum Skoru ── (*50: 0-1 birim → 0-50 UI skalası)
  const M164_home = homeUnits.MOMENTUM_AKIŞI * 50;
  const M164_away = awayUnits.MOMENTUM_AKIŞI * 50;

  // ── M165: Mutlaka Gol Atma İndeksi ── (*50: 0-1 birim → 0-50 UI skalası)
  const M165_home = homeUnits.GOL_IHTIYACI * 50;
  const M165_away = awayUnits.GOL_IHTIYACI * 50;

  // ── M166: Toplam Takım Güç Skoru ──
  // 7 birim eşit ağırlıklı geometrik ortalama — keyfi ağırlık katsayısı yok
  const geo7 = (...vals) => Math.pow(
    vals.reduce((prod, v) => prod * Math.max(v, 0.01), 1),
    1 / vals.length
  );
  const M166_home = geo7(
    homeUnits.BITIRICILIK,
    homeUnits.SAVUNMA_DIRENCI,
    homeUnits.FORM_KISA,
    homeUnits.GK_REFLEKS,
    homeUnits.MOMENTUM_AKIŞI,
    homeUnits.YARATICILIK,
    homeUnits.TAKTIKSEL_UYUM
  ) * 50;
  const M166_away = geo7(
    awayUnits.BITIRICILIK,
    awayUnits.SAVUNMA_DIRENCI,
    awayUnits.FORM_KISA,
    awayUnits.GK_REFLEKS,
    awayUnits.MOMENTUM_AKIŞI,
    awayUnits.YARATICILIK,
    awayUnits.TAKTIKSEL_UYUM
  ) * 50;

  // ── M168: Kazanma Olasılığı (Poisson) ──
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
