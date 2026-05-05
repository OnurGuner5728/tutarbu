'use strict';
/**
 * learning/blender.js — Tarihsel residual'ı mevcut Poisson tahminine uygula.
 *
 * Strateji:
 *   λ'_home = λ_home × exp(α × dLambdaHome)
 *   λ'_away = λ_away × exp(α × dLambdaAway)
 *
 * α = similarity confidence (0..1). Düşük confidence → minimum müdahale.
 * Hardcoded scale faktörü yok; tüm gücü similarity engine'in confidence'ı belirler.
 *
 * Çıktı: düzeltilmiş 1X2, O25, BTTS olasılıkları (Poisson independence varsayımıyla).
 * Bu prediction-generator'daki ana blend'in ÜZERİNE üçüncü kaynak olarak konabilir
 * veya doğrudan post-hoc düzeltme olarak uygulanabilir.
 */

const { poissonPMF, poissonExceed } = require('../engine/math-utils');

/**
 * @param {object} args
 * @param {number} args.lambdaHome
 * @param {number} args.lambdaAway
 * @param {object} args.adjustment    {dLambdaHome, dLambdaAway, ...}
 * @param {number} args.confidence    [0,1]
 * @param {number} [args.maxGoals]    iterasyon üst sınırı (yoksa λ tabanlı)
 * @returns {object}
 */
function applyAdjustment({ lambdaHome, lambdaAway, adjustment, confidence, maxGoals }) {
  if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway)) {
    return { applied: false, reason: 'invalid_lambda' };
  }
  if (!adjustment || !Number.isFinite(confidence) || confidence <= 0) {
    return { applied: false, reason: 'no_confidence' };
  }

  const alpha = Math.max(0, Math.min(1, confidence));
  const dH = Number.isFinite(adjustment.dLambdaHome) ? adjustment.dLambdaHome : 0;
  const dA = Number.isFinite(adjustment.dLambdaAway) ? adjustment.dLambdaAway : 0;

  const lhAdj = Math.max(0.01, lambdaHome * Math.exp(alpha * dH));
  const laAdj = Math.max(0.01, lambdaAway * Math.exp(alpha * dA));

  // 1X2: bağımsız Poisson (Dixon-Coles ρ düzeltmesi yok — yalın baz)
  const _max = maxGoals ?? Math.max(8, Math.ceil(Math.max(lhAdj, laAdj) * 4));
  let pHome = 0, pDraw = 0, pAway = 0;
  let pBothScore = 0;
  let pTotalGtr2 = 0;
  let topScore = null, topScoreP = -1;
  for (let h = 0; h <= _max; h++) {
    const ph = poissonPMF(h, lhAdj);
    if (ph < 1e-9) continue;
    for (let a = 0; a <= _max; a++) {
      const pa = poissonPMF(a, laAdj);
      const p = ph * pa;
      if (p < 1e-9) continue;
      if (h > a) pHome += p;
      else if (h < a) pAway += p;
      else pDraw += p;
      if (h > 0 && a > 0) pBothScore += p;
      if (h + a > 2) pTotalGtr2 += p;
      if (p > topScoreP) { topScoreP = p; topScore = `${h}-${a}`; }
    }
  }

  // Normalize (truncation hatasını minimize et)
  const totalP = pHome + pDraw + pAway;
  if (totalP > 0) {
    pHome /= totalP; pDraw /= totalP; pAway /= totalP;
  }

  return {
    applied: true,
    alpha: +alpha.toFixed(4),
    lambdaHomeAdjusted: +lhAdj.toFixed(5),
    lambdaAwayAdjusted: +laAdj.toFixed(5),
    probHome: +(pHome * 100).toFixed(2),
    probDraw: +(pDraw * 100).toFixed(2),
    probAway: +(pAway * 100).toFixed(2),
    probO25: +(pTotalGtr2 * 100).toFixed(2),
    probBTTS: +(pBothScore * 100).toFixed(2),
    predictedScore: topScore,
  };
}

/**
 * Mevcut tahmin olasılıklarıyla learned-adjusted olasılıkları
 * confidence-ağırlıklı geometrik harmanlama ile birleştir.
 *
 * Hardcoded ağırlık yok: w_learned = confidence, w_base = 1 - confidence.
 * Confidence düşükse base baskın çıkar.
 */
function blendWithBase({ base, learned, confidence }) {
  if (!base || !learned || !learned.applied || !Number.isFinite(confidence) || confidence <= 0) {
    return base;
  }
  const w = Math.max(0, Math.min(1, confidence));
  function geo(b, l) {
    const bb = Math.max(1e-6, b / 100);
    const ll = Math.max(1e-6, l / 100);
    return Math.pow(bb, 1 - w) * Math.pow(ll, w);
  }
  let h = geo(base.probHome ?? 0, learned.probHome);
  let d = geo(base.probDraw ?? 0, learned.probDraw);
  let a = geo(base.probAway ?? 0, learned.probAway);
  const sum = h + d + a;
  if (sum > 0) { h /= sum; d /= sum; a /= sum; }

  // O25/BTTS için lineer karışım (oranlar 1-sınıflı, geo gereksiz)
  const o25 = (base.probO25 ?? 0) * (1 - w) + learned.probO25 * w;
  const btts = (base.probBTTS ?? 0) * (1 - w) + learned.probBTTS * w;

  return {
    probHome: +(h * 100).toFixed(2),
    probDraw: +(d * 100).toFixed(2),
    probAway: +(a * 100).toFixed(2),
    probO25: +o25.toFixed(2),
    probBTTS: +btts.toFixed(2),
    blendedFrom: { baseW: +(1 - w).toFixed(3), learnedW: +w.toFixed(3) },
  };
}

module.exports = {
  applyAdjustment,
  blendWithBase,
};
