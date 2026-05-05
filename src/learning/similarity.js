'use strict';
/**
 * learning/similarity.js — Davranışsal-kondisyon benzerliği üzerinden
 * tarihsel residual aggregator (case-based reasoning).
 *
 * Akış:
 *   1. Tarihsel kayıt havuzunu al (kickoff_ts < query.kickoffTs).
 *   2. Pool üzerinde her boyut için dinamik mean/std hesapla → z-score.
 *   3. Query ve aday vektörleri ortak dimensyonlarda standardize et.
 *   4. Mesafe: weighted Euclidean (eksik boyut iki tarafta da varsa katılır).
 *   5. Adaptif Gaussian bandwidth h = median(k en yakın komşu mesafesi).
 *   6. wi = exp(-di^2 / (2h^2)).
 *   7. Aynı lig adayları için bonus çarpan (pool tabanından dinamik).
 *   8. Residual'ları posterior shrinkage ile ortala:
 *        μ̂ = Σ(wi * ri) / (Σwi + κ)
 *      burada κ = effective_n_floor — pool yoğunluğundan türetilir.
 *
 * Hardcoded yok. Tüm parametreler ya pool istatistiğinden ya da matematiksel
 * şarttan (örn. pencere boyu = sqrt(N)) gelir.
 */

const { FIELDS } = require('./fingerprint');

// ─── İstatistik yardımcıları ──────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return null;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function std(arr, m) {
  if (arr.length < 2) return null;
  let s = 0;
  for (const v of arr) { const d = v - m; s += d * d; }
  return Math.sqrt(s / (arr.length - 1));
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Pool stats: her boyut için {mean, std, n} (null değerleri sayma).
 */
function computePoolStats(cases, fields = FIELDS) {
  const stats = {};
  for (const f of fields) {
    const vals = [];
    for (const c of cases) {
      const v = c.vector?.[f];
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    if (vals.length < 2) {
      stats[f] = { mean: null, std: null, n: vals.length };
      continue;
    }
    const m = mean(vals);
    const s = std(vals, m);
    // std === 0 (tüm değerler aynı) → boyut bilgisiz, devre dışı
    stats[f] = { mean: m, std: (s != null && s > 0) ? s : null, n: vals.length };
  }
  return stats;
}

/**
 * İki vektör arasındaki standardize edilmiş Öklid mesafesi.
 * Yalnızca her iki tarafta da değer + pool std mevcut boyutlar katılır.
 * Mesafe = sqrt( Σ (zq - zc)^2 ) / sqrt(K_used) — boyut sayısına normalize.
 *
 * @returns {{distance: number, dimsUsed: number}}
 */
function standardizedDistance(q, c, stats, fields = FIELDS) {
  let sumSq = 0;
  let used = 0;
  for (const f of fields) {
    const qv = q?.[f], cv = c?.[f];
    if (qv == null || cv == null) continue;
    if (!Number.isFinite(qv) || !Number.isFinite(cv)) continue;
    const st = stats[f];
    if (!st || st.std == null) continue;
    const zq = (qv - st.mean) / st.std;
    const zc = (cv - st.mean) / st.std;
    sumSq += (zq - zc) * (zq - zc);
    used++;
  }
  if (used === 0) return { distance: Infinity, dimsUsed: 0 };
  return { distance: Math.sqrt(sumSq / used), dimsUsed: used };
}

/**
 * @param {object} opts
 * @param {object} opts.queryVector              Tahmin edilen maçın fingerprint vektörü
 * @param {Array}  opts.cases                    store.getHistoricalCases() çıktısı
 * @param {number} [opts.queryTournamentId]      Aynı-lig bonusu için
 * @param {number} [opts.queryKickoffTs]         Recency decay için
 * @param {string[]} [opts.fields]               Kullanılacak boyutlar
 * @returns {object} adjustment + debug
 */
function computeAdjustment(opts) {
  const fields = opts.fields || FIELDS;
  const cases = Array.isArray(opts.cases) ? opts.cases : [];
  if (cases.length === 0) {
    return _emptyAdjustment('no_cases');
  }
  if (!opts.queryVector || typeof opts.queryVector !== 'object') {
    return _emptyAdjustment('no_query_vector');
  }

  // Tüm pool tek seferde standardize edilir (lig-ayrımsız) — boyutlar lig-ötesi
  // anlamlı kalsın diye. İstenirse aynı-lig case'ler bonusla öne çıkar.
  const stats = computePoolStats(cases, fields);

  // ── 1. Tüm case'ler için mesafe hesapla ─────────────────────────────────────
  const enriched = [];
  for (const c of cases) {
    if (!c.residual) continue;
    const { distance, dimsUsed } = standardizedDistance(
      opts.queryVector, c.vector, stats, fields
    );
    if (!Number.isFinite(distance)) continue;
    enriched.push({ ...c, distance, dimsUsed });
  }

  if (enriched.length === 0) {
    return _emptyAdjustment('no_comparable_cases');
  }

  // ── 2. Adaptif bandwidth ────────────────────────────────────────────────────
  // h = median(k_floor en yakın mesafe), k_floor = sqrt(N) (Silverman-tipi).
  const N = enriched.length;
  const kFloor = Math.max(8, Math.min(N, Math.ceil(Math.sqrt(N))));
  enriched.sort((a, b) => a.distance - b.distance);
  const nearestKDist = enriched.slice(0, kFloor).map(c => c.distance);
  let h = median(nearestKDist);
  // Tüm en yakın mesafeler 0 ise (sentetik) → küçük epsilon
  if (h == null || h <= 0) h = 1e-3;

  // ── 3. Aynı-lig bonusu: pool içi aynı-lig case oranından türetilir ─────────
  // Eğer aynı-lig kayıt yoğunluğu düşükse cross-league sinyale daha çok yaslan.
  // Yoğunsa aynı-lig case'lere mesafe çarpanı uygulanır (bonus).
  let leagueBonus = 1.0;
  if (opts.queryTournamentId != null) {
    let sameLeague = 0;
    for (const c of enriched) {
      if (c.tournamentId === opts.queryTournamentId) sameLeague++;
    }
    const frac = sameLeague / enriched.length;
    // frac yüksekse (yeterli aynı-lig örnek) bonus güçlü; düşükse zayıf.
    // Bonus ∈ [1.0, 2.0]: aynı lig case'in mesafesi /bonus → ağırlığı ↑
    leagueBonus = 1.0 + frac;  // tamamen data-driven, sabit yok
  }

  // ── 4. Recency decay (data-driven half-life) ────────────────────────────────
  // half-life = pool zaman aralığının yarısı. Pool kısa süreliyse decay zayıf;
  // çok uzun ise eski veriler doğal şekilde sönümlenir.
  let halfLifeSec = null;
  if (opts.queryKickoffTs != null) {
    const tsArr = enriched
      .map(c => c.kickoffTs)
      .filter(t => t != null && Number.isFinite(t));
    if (tsArr.length >= 2) {
      const tMin = Math.min(...tsArr);
      const tMax = Math.max(...tsArr);
      const span = tMax - tMin;
      if (span > 0) halfLifeSec = span / 2;
    }
  }

  // ── 5. Ağırlıklar ───────────────────────────────────────────────────────────
  // wi = exp(-d^2 / (2h^2)) × leagueBonusIfSame × recencyDecay
  let sumW   = 0;
  let sumWdH = 0; // Σ wi * dLambdaHome
  let sumWdA = 0;
  let sumWdT = 0;
  let sumWdD = 0;
  let sumWS  = 0; // surpriseIndex
  let nEff   = 0;
  const debugTop = [];

  for (const c of enriched) {
    const r = c.residual;
    // En azından dLambda'lardan biri olmalı
    const hasH = Number.isFinite(r.dLambdaHome);
    const hasA = Number.isFinite(r.dLambdaAway);
    if (!hasH && !hasA) continue;

    let dEff = c.distance;
    // Aynı lig ise mesafe küçültülür (bonus → ağırlık artar)
    if (opts.queryTournamentId != null && c.tournamentId === opts.queryTournamentId) {
      dEff = c.distance / leagueBonus;
    }

    let w = Math.exp(-(dEff * dEff) / (2 * h * h));

    // Recency decay
    if (halfLifeSec != null && opts.queryKickoffTs != null && c.kickoffTs != null) {
      const ageSec = opts.queryKickoffTs - c.kickoffTs;
      if (ageSec > 0) {
        const decay = Math.pow(0.5, ageSec / halfLifeSec);
        w *= decay;
      }
    }

    if (!Number.isFinite(w) || w <= 0) continue;

    sumW += w;
    nEff += w;
    if (hasH) sumWdH += w * r.dLambdaHome;
    if (hasA) sumWdA += w * r.dLambdaAway;
    if (Number.isFinite(r.dLambdaTotal)) sumWdT += w * r.dLambdaTotal;
    if (Number.isFinite(r.dLambdaDiff))  sumWdD += w * r.dLambdaDiff;
    if (Number.isFinite(r.surpriseIndex)) sumWS += w * r.surpriseIndex;

    if (debugTop.length < 12) {
      debugTop.push({
        matchId: c.matchId,
        distance: +c.distance.toFixed(4),
        weight: +w.toFixed(4),
        sameLeague: c.tournamentId === opts.queryTournamentId,
        ageDays: opts.queryKickoffTs != null && c.kickoffTs != null
          ? Math.round((opts.queryKickoffTs - c.kickoffTs) / 86400)
          : null,
        residual: r,
      });
    }
  }

  if (sumW <= 0) {
    return _emptyAdjustment('no_effective_weight');
  }

  // ── 6. Posterior shrinkage ─────────────────────────────────────────────────
  // κ = log(N) → büyük havuzda küçük shrinkage, küçük havuzda büyük.
  // Tamamen pool boyutundan türetilir (sabit değil).
  const kappa = Math.max(1, Math.log(Math.max(2, N)));

  const dLambdaHome = sumWdH / (sumW + kappa);
  const dLambdaAway = sumWdA / (sumW + kappa);
  const dLambdaTotal = sumWdT / (sumW + kappa);
  const dLambdaDiff  = sumWdD / (sumW + kappa);
  const surpriseIndex = sumWS / (sumW + kappa);

  // Confidence: effective sample / (effective + kappa)
  // Aralık (0,1). Pool yoğunluğu ve query'ye yakınlık birlikte yansır.
  const confidence = sumW / (sumW + kappa);

  return {
    enabled: true,
    reason: 'ok',
    poolSize: N,
    bandwidth: +h.toFixed(6),
    leagueBonus: +leagueBonus.toFixed(3),
    halfLifeDays: halfLifeSec != null ? +(halfLifeSec / 86400).toFixed(1) : null,
    effectiveN: +nEff.toFixed(3),
    kappa: +kappa.toFixed(3),
    confidence: +confidence.toFixed(4),
    adjustment: {
      dLambdaHome: +dLambdaHome.toFixed(5),
      dLambdaAway: +dLambdaAway.toFixed(5),
      dLambdaTotal: +dLambdaTotal.toFixed(5),
      dLambdaDiff: +dLambdaDiff.toFixed(5),
      surpriseIndex: +surpriseIndex.toFixed(5),
    },
    poolStatsSummary: _summarizeStats(stats),
    debugTopCases: debugTop,
  };
}

function _emptyAdjustment(reason) {
  return {
    enabled: false,
    reason,
    poolSize: 0,
    confidence: 0,
    adjustment: {
      dLambdaHome: 0,
      dLambdaAway: 0,
      dLambdaTotal: 0,
      dLambdaDiff: 0,
      surpriseIndex: 0,
    },
  };
}

function _summarizeStats(stats) {
  const out = {};
  for (const k of Object.keys(stats)) {
    const s = stats[k];
    out[k] = {
      n: s.n,
      mean: s.mean != null ? +s.mean.toFixed(4) : null,
      std: s.std != null ? +s.std.toFixed(4) : null,
    };
  }
  return out;
}

module.exports = {
  computeAdjustment,
  computePoolStats,
  standardizedDistance,
};
