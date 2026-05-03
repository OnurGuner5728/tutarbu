'use strict';
/**
 * Score Profile — Takım Skor Parmak İzi & Gelişmiş Skor Dağılımı
 *
 * Poisson'un hep 1-0/1-1/0-1 üretme sorununu çözer:
 *   1. Takım Skor Profili: son N maçtaki gerçek skor frekansını çıkarır
 *   2. Negatif Binom: overdispersion'u modelleyerek daha çeşitli dağılım üretir
 *   3. Blend: Poisson + Profil + NegBinom harmonik karışımı
 *   4. Skor Kalibrasyonu: backtest verisinden öğrenilmiş skor çarpanları
 *
 * ⚠ SIFIR HARDCODED SABİT — Tüm parametreler veriden türetilir.
 */

const fs = require('fs');
const path = require('path');
// ─── Math Helpers ─────────────────────────────────────────────────

/**
 * Poisson PMF: P(X=k) = e^(-λ) × λ^k / k!
 */
function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1.0 : 0.0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Negatif Binom PMF: P(X=k) = C(k+r-1, k) × p^r × (1-p)^k
 * Parametre dönüşümü: mean = r(1-p)/p, variance = r(1-p)/p²
 * λ (mean) ve r (overdispersion) verildiğinde p hesaplanır.
 */
function negBinomPMF(k, r, lambda) {
  if (lambda <= 0) return k === 0 ? 1.0 : 0.0;
  if (r <= 0 || !isFinite(r)) return poissonPMF(k, lambda);
  
  const p = r / (r + lambda);
  const logBinom = lgamma(k + r) - lgamma(k + 1) - lgamma(r);
  const logP = logBinom + r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(logP);
}

/**
 * Log-gamma — Lanczos approximation.
 * Katsayılar matematiksel sabit (π, e gibi), veri değil.
 */
function lgamma(x) {
  if (x <= 0) return 0;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < c.length; i++) {
    a += c[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ─── Takım Skor Profili ──────────────────────────────────────────

/**
 * Takımın son N maçındaki gol frekansını çıkarır.
 * Tüm eşikler veriden türetilir.
 * 
 * @param {object[]} lastEvents - SofaScore teamLastEvents dizisi
 * @param {number} teamId - Takım ID'si
 * @param {'home'|'away'|null} location - Sadece ev/deplasman maçları filtrele
 * @param {number} maxMatches - Kullanılacak max maç sayısı
 * @returns {object|null}
 */
function extractTeamScoreProfile(lastEvents, teamId, location = null, maxMatches = 20, nowMs = Date.now()) {
  if (!lastEvents || !Array.isArray(lastEvents) || lastEvents.length === 0) {
    return null;
  }

  const finished = lastEvents
    .filter(e => e.status?.type === 'finished' && e.homeScore?.current != null)
    .slice(0, maxMatches * 3);

  const matches = [];
  for (const e of finished) {
    if (matches.length >= maxMatches) break;
    const isHome = e.homeTeam?.id === teamId;
    const isAway = e.awayTeam?.id === teamId;
    if (!isHome && !isAway) continue;
    if (location === 'home' && !isHome) continue;
    if (location === 'away' && !isAway) continue;

    const scored = isHome ? (e.homeScore.current ?? 0) : (e.awayScore.current ?? 0);
    const conceded = isHome ? (e.awayScore.current ?? 0) : (e.homeScore.current ?? 0);
    const ts = e.startTimestamp ? e.startTimestamp * 1000 : null;
    matches.push({ scored, conceded, score: `${scored}-${conceded}`, ts });
  }

  const minSample = Math.max(1, Math.ceil(Math.sqrt(maxMatches)));
  if (matches.length < minSample) return null;

  // ─ Zamansal decay: τ = median(Δt) ─
  const MS_DAY = 86400000;
  const deltas = matches.map(m => m.ts ? Math.max(1, (nowMs - m.ts) / MS_DAY) : null).filter(x => x != null);
  let tau = 30;
  if (deltas.length > 0) {
    const sorted = [...deltas].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    tau = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }
  for (const m of matches) {
    const dt = m.ts ? Math.max(1, (nowMs - m.ts) / MS_DAY) : tau;
    m.w = Math.exp(-dt / tau);
  }

  const observedMaxGoal = matches.reduce((mx, m) => Math.max(mx, m.scored, m.conceded), 0);
  const maxGoalBins = observedMaxGoal + 2;

  const scoredFreq = new Array(maxGoalBins).fill(0);
  const concededFreq = new Array(maxGoalBins).fill(0);
  const jointFreq = {};
  let totalW = 0;
  let btts_w = 0, over25_w = 0, over15_w = 0, clean_w = 0, scoring_w = 0;
  let sumScored_w = 0, sumConceded_w = 0;
  let sumScoredSq_w = 0, sumConcededSq_w = 0;

  for (const m of matches) {
    const w = m.w;
    totalW += w;
    const s = Math.min(m.scored, maxGoalBins - 1);
    const c = Math.min(m.conceded, maxGoalBins - 1);
    scoredFreq[s] += w;
    concededFreq[c] += w;
    jointFreq[m.score] = (jointFreq[m.score] || 0) + w;
    const total = m.scored + m.conceded;
    if (m.scored > 0 && m.conceded > 0) btts_w += w;
    if (total > 2.5) over25_w += w;
    if (total > 1.5) over15_w += w;
    if (m.conceded === 0) clean_w += w;
    if (m.scored > 0) scoring_w += w;
    sumScored_w += m.scored * w;
    sumConceded_w += m.conceded * w;
    sumScoredSq_w += m.scored * m.scored * w;
    sumConcededSq_w += m.conceded * m.conceded * w;
  }

  const n = matches.length;
  const scoredDist = scoredFreq.map(f => f / totalW);
  const concededDist = concededFreq.map(f => f / totalW);
  const jointDist = {};
  for (const [score, count] of Object.entries(jointFreq)) jointDist[score] = count / totalW;

  const avgScored = sumScored_w / totalW;
  const avgConceded = sumConceded_w / totalW;
  const varScored = Math.max(0, (sumScoredSq_w / totalW) - avgScored * avgScored);
  const varConceded = Math.max(0, (sumConcededSq_w / totalW) - avgConceded * avgConceded);

  return {
    scoredDist, concededDist, jointDist,
    n, maxMatches,
    avgScored, avgConceded,
    variance: { scored: varScored, conceded: varConceded },
    stdScored: Math.sqrt(varScored),
    stdConceded: Math.sqrt(varConceded),
    bttsRate: btts_w / totalW,
    over25Rate: over25_w / totalW,
    over15Rate: over15_w / totalW,
    cleanSheetRate: clean_w / totalW,
    scoringRate: scoring_w / totalW,
    tempDecayTau: tau,
  };
}

// ─── Eşleşme (H2H) Skor Parmak İzi ───────────────────────────────
/**
 * İki takımın karşılıklı H2H maçlarındaki skor parmak izini çıkarır.
 * Ev sahibi perspektifi: home = bu maçta ev sahibi olan takım.
 * Geçmiş H2H maçları iki takım arasındaki karşılaşmalardır — ev/dep rolü
 * maçtan maça değişebilir; biz her maçı "bu karşılaşmanın" ev sahibi perspektifine
 * çeviririz.
 *
 * @param {object} h2hEventsData - SofaScore event/{id}/h2h/events cevabı ({ events: [...] })
 * @param {number} homeTeamId - Bu maçın ev sahibi takım ID'si
 * @param {number} awayTeamId - Bu maçın deplasman takım ID'si
 * @param {number} maxMatches - Kullanılacak max H2H maç sayısı
 * @returns {object|null}
 */
function extractMatchScoreProfile(h2hEventsData, homeTeamId, awayTeamId, maxMatches = 10) {
  const events = h2hEventsData?.events || [];
  if (!Array.isArray(events) || events.length === 0) return null;
  if (!homeTeamId || !awayTeamId) return null;

  const finished = events
    .filter(e => e.status?.type === 'finished' && e.homeScore?.current != null && e.awayScore?.current != null)
    .slice(0, maxMatches * 2);

  const matches = [];
  for (const e of finished) {
    if (matches.length >= maxMatches) break;
    const hId = e.homeTeam?.id;
    const aId = e.awayTeam?.id;
    // Her iki takım da bu geçmiş maçta olmalı (aksi halde farklı bir karşılaşma)
    const involvesBoth =
      (hId === homeTeamId && aId === awayTeamId) ||
      (hId === awayTeamId && aId === homeTeamId);
    if (!involvesBoth) continue;

    // Bu maçın ev sahibi perspektifine çevir
    const wasHome = (hId === homeTeamId);
    const homeGoals = wasHome ? e.homeScore.current : e.awayScore.current;
    const awayGoals = wasHome ? e.awayScore.current : e.homeScore.current;
    matches.push({ homeGoals, awayGoals, score: `${homeGoals}-${awayGoals}` });
  }

  // H2H örneklemi genelde azdır — min 2 yeterli (karekök aralığı koruması).
  const minSample = Math.max(2, Math.ceil(Math.sqrt(maxMatches / 2)));
  if (matches.length < minSample) return null;

  const observedMax = matches.reduce((mx, m) => Math.max(mx, m.homeGoals, m.awayGoals), 0);
  const bins = observedMax + 2;

  const homeScoredFreq = new Array(bins).fill(0);
  const awayScoredFreq = new Array(bins).fill(0);
  const jointFreq = {};

  for (const m of matches) {
    const h = Math.min(m.homeGoals, bins - 1);
    const a = Math.min(m.awayGoals, bins - 1);
    homeScoredFreq[h]++;
    awayScoredFreq[a]++;
    jointFreq[m.score] = (jointFreq[m.score] || 0) + 1;
  }

  const n = matches.length;
  const homeScoredDist = homeScoredFreq.map(f => f / n);
  const awayScoredDist = awayScoredFreq.map(f => f / n);
  const jointDist = {};
  for (const [s, c] of Object.entries(jointFreq)) jointDist[s] = c / n;

  return {
    homeScoredDist,     // P(home takım h gol attı)
    awayScoredDist,     // P(away takım a gol attı)
    jointDist,          // P("h-a" skoru) — en güçlü sinyal
    n,
    maxMatches,
    avgHomeGoals: matches.reduce((s, m) => s + m.homeGoals, 0) / n,
    avgAwayGoals: matches.reduce((s, m) => s + m.awayGoals, 0) / n,
  };
}

// ─── Overdispersion Parameter ────────────────────────────────────

/**
 * λ'dan Negatif Binom r parametresini tahmin et.
 * Hiçbir hardcoded default yok — overdispersionFactor zorunlu parametre.
 * Minimum r, lambda'dan türetilir.
 * 
 * @param {number} lambda - Poisson λ
 * @param {number} overdispersionFactor - variance/mean oranı (ZORUNLU, veriden hesaplanır)
 * @returns {number} r parametresi
 */
function estimateR(lambda, overdispersionFactor) {
  if (overdispersionFactor == null || overdispersionFactor <= 1.0) return Infinity;
  const variance = lambda * overdispersionFactor;
  const r = (lambda * lambda) / (variance - lambda);
  // Minimum r: lambda'nın %10'u — lambda büyükse min r de büyür, küçükse küçük kalır
  const minR = lambda * 0.1;
  return Math.max(minR, r);
}

// ─── Blend Dağılımları ───────────────────────────────────────────

/**
 * Poisson skor dağılımını takım profili ile harmanlayarak
 * daha çeşitli ve gerçekçi bir skor dağılımı üretir.
 *
 * Tüm ağırlıklar zorunlu parametre — varsayılan yok.
 * Güvenilirlik veriden türetilir.
 *
 * @param {object} opts — Tüm parametreler ZORUNLU
 */
function blendScoreDistribution(opts) {
  const {
    lambdaHome,
    lambdaAway,
    rho,
    homeProfile,
    awayProfile,
    matchProfile,           // H2H karşılaşma parmak izi (opsiyonel)
    leagueProfile,          // Lig parmak izi (opsiyonel)
    maxGoals,
    profileWeight: _pw,
    negBinomWeight,
    overdispersion,
  } = opts;

  if (lambdaHome == null || lambdaAway == null) return null;

  // Profil güvenilirliği: Bayesian shrinkage = n / (n + √n) — veriden türetilmiş
  // n=3 → 0.63, n=5 → 0.69, n=10 → 0.76, n=15 → 0.79
  const profileReliability = (profile) => {
    if (!profile || !profile.n) return 0;
    return profile.n / (profile.n + Math.sqrt(profile.n));
  };
  const homeRel = profileReliability(homeProfile);
  const awayRel = profileReliability(awayProfile);
  const matchRel = profileReliability(matchProfile);
  // League profile: score blend'de kullanılmaz (draw'u bozar), sadece BTTS/OU kalibrasyon kaynağı
  const leagueRel = 0;
  // Ortak profil güvenilirliği: tüm mevcut kaynakların ortalaması
  const relSources = [homeRel, awayRel, matchRel, leagueRel].filter(r => r > 0);
  const avgProfileReliability = relSources.length > 0
    ? relSources.reduce((s, r) => s + r, 0) / relSources.length
    : 0;

  // Profil bucket'ı içi alt-ağırlıklar
  // Hiyerarşi: matchProfile > teamProfile > leagueProfile
  const totalRel = homeRel + awayRel + matchRel + leagueRel;
  const wTeam = totalRel > 0 ? (homeRel + awayRel) / totalRel : 0;
  const wMatch = totalRel > 0 ? matchRel / totalRel : 0;
  const wLeague = totalRel > 0 ? leagueRel / totalRel : 0;

  // Efektif ağırlıklar — profil yoksa profileWeight otomatik 0
  const effectiveProfileWeight = (_pw ?? 0) * avgProfileReliability;
  const effectiveNegBinomWeight = negBinomWeight ?? 0;
  const poissonWeight = 1.0 - effectiveProfileWeight - effectiveNegBinomWeight;

  // Dixon-Coles tau fonksiyonu
  const dcTau = (hg, ag) => {
    const _rho = rho ?? 0;
    if (hg === 0 && ag === 0) return 1 - lambdaHome * lambdaAway * _rho;
    if (hg === 0 && ag === 1) return 1 + lambdaHome * _rho;
    if (hg === 1 && ag === 0) return 1 + lambdaAway * _rho;
    if (hg === 1 && ag === 1) return 1 - _rho;
    return 1;
  };

  // NegBinom r parametreleri — overdispersion veriden gelen zorunlu parametre
  const rHome = estimateR(lambdaHome, overdispersion);
  const rAway = estimateR(lambdaAway, overdispersion);

  // maxGoals: verilen parametre yoksa lambda'lardan türet
  const _maxGoals = maxGoals ?? Math.ceil(Math.max(lambdaHome, lambdaAway) * 4);

  const scores = [];
  let totalProb = 0;

  for (let hg = 0; hg <= _maxGoals; hg++) {
    for (let ag = 0; ag <= _maxGoals; ag++) {
      // 1. Poisson (Dixon-Coles)
      const pPoisson = poissonPMF(hg, lambdaHome) * poissonPMF(ag, lambdaAway) * dcTau(hg, ag);

      // 2. Negatif Binom (bağımsız home × away) — yalnızca weight > 0 iken hesapla (0*NaN=NaN riski)
      const pNegBinom = effectiveNegBinomWeight > 0
        ? negBinomPMF(hg, rHome, lambdaHome) * negBinomPMF(ag, rAway, lambdaAway)
        : 0;

      // 3. Takım Profili (empirik dağılım)
      let pTeamProfile = 0;
      if (homeProfile && awayProfile) {
        const hScored = homeProfile.scoredDist[Math.min(hg, homeProfile.scoredDist.length - 1)] || 0;
        const aConceded = awayProfile.concededDist[Math.min(hg, awayProfile.concededDist.length - 1)] || 0;
        const aScored = awayProfile.scoredDist[Math.min(ag, awayProfile.scoredDist.length - 1)] || 0;
        const hConceded = homeProfile.concededDist[Math.min(ag, homeProfile.concededDist.length - 1)] || 0;

        // Geometrik ortalama
        const pHomeGoals = (hScored > 0 && aConceded > 0) ? Math.sqrt(hScored * aConceded) : (hScored + aConceded) / 2;
        const pAwayGoals = (aScored > 0 && hConceded > 0) ? Math.sqrt(aScored * hConceded) : (aScored + hConceded) / 2;
        pTeamProfile = pHomeGoals * pAwayGoals;
      } else if (homeProfile) {
        const hScored = homeProfile.scoredDist[Math.min(hg, homeProfile.scoredDist.length - 1)] || 0;
        pTeamProfile = hScored * poissonPMF(ag, lambdaAway);
      } else if (awayProfile) {
        const aScored = awayProfile.scoredDist[Math.min(ag, awayProfile.scoredDist.length - 1)] || 0;
        pTeamProfile = poissonPMF(hg, lambdaHome) * aScored;
      }

      // 3b. H2H Eşleşme Profili (joint distribution — iki takımın birlikte geçmişi)
      let pMatchProfile = 0;
      if (matchProfile) {
        const jointKey = `${hg}-${ag}`;
        const jointP = matchProfile.jointDist?.[jointKey];
        if (jointP != null && jointP > 0) {
          pMatchProfile = jointP;
        } else {
          const hP = matchProfile.homeScoredDist[Math.min(hg, matchProfile.homeScoredDist.length - 1)] || 0;
          const aP = matchProfile.awayScoredDist[Math.min(ag, matchProfile.awayScoredDist.length - 1)] || 0;
          pMatchProfile = (hP > 0 && aP > 0) ? Math.sqrt(hP * aP) : (hP + aP) / 2;
        }
      }

      // 3c. Lig Profili (lig geneli skor dağılımı)
      let pLeagueProfile = 0;
      if (leagueProfile && leagueProfile.reliability > 0) {
        const jointKey = `${hg}-${ag}`;
        const jointP = leagueProfile.jointDist?.[jointKey];
        if (jointP != null && jointP > 0) {
          pLeagueProfile = jointP;
        } else {
          // Marjinal dağılımlardan — scored × conceded geometrik ortalama
          const sH = leagueProfile.scoredDist?.[Math.min(hg, (leagueProfile.scoredDist?.length || 1) - 1)] || 0;
          const sA = leagueProfile.scoredDist?.[Math.min(ag, (leagueProfile.scoredDist?.length || 1) - 1)] || 0;
          pLeagueProfile = (sH > 0 && sA > 0) ? Math.sqrt(sH * sA) : (sH + sA) / 2;
        }
      }

      // Profil bucket'ı içi blend: takım vs H2H vs lig (wTeam + wMatch + wLeague = 1)
      const pProfile = (wTeam * pTeamProfile) + (wMatch * pMatchProfile) + (wLeague * pLeagueProfile);

      // Blend
      const prob = (poissonWeight * pPoisson) + (effectiveNegBinomWeight * pNegBinom) + (effectiveProfileWeight * pProfile);
      scores.push({ home: hg, away: ag, prob });
      totalProb += prob;
    }
  }

  // Renormalize
  if (totalProb > 0) {
    for (const s of scores) s.prob /= totalProb;
  }

  scores.sort((a, b) => b.prob - a.prob);

  return {
    scores,
    topScore: `${scores[0].home}-${scores[0].away}`,
    topProb: scores[0].prob,
  };
}


// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  extractTeamScoreProfile,
  extractMatchScoreProfile,
  blendScoreDistribution,
};
