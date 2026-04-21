'use strict';
/**
 * League Fingerprint — Lig seviyesinde empirik skor/BTTS/OU/draw dağılımı
 *
 * Kaynak: homeLastEvents ∪ awayLastEvents ∪ h2hEvents
 *   - Event ID ile dedup
 *   - tournament.uniqueTournament.id filtresi (lig dışı maçlar ayıklanır)
 *   - Zamansal decay: w = exp(-Δt / τ), τ = median(Δt) (veriden türüyor)
 *
 * Çapraz kontrol: standings'ten bağımsız agregat ile kıyaslama.
 *
 * Validation (lig-agnostik iç tutarlılık):
 *   1. Pool ↔ Standings uyumu (σ bazlı doğal tolerans)
 *   2. Dağılım normalizasyonu (Σ ≈ 1.0)
 *   3. Örneklem yeterliliği (√(teams×2))
 *
 * Testler başarısız → reliability = 0, blend'de sessizce dışlanır (fallback yok).
 */

const MS_PER_DAY = 86400000;

function extractFinishedMatches(events, tournamentId) {
  // flat array veya { events: [...] } her iki formatı kabul et
  const arr = Array.isArray(events) ? events : (events?.events ?? []);
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const out = [];
  events = arr;
  for (const e of events) {
    if (e?.status?.type !== 'finished') continue;
    if (e?.homeScore?.current == null || e?.awayScore?.current == null) continue;
    if (tournamentId != null) {
      const tId = e?.tournament?.uniqueTournament?.id;
      if (tId !== tournamentId) continue;
    }
    // startTimestamp saniye cinsinden (SofaScore convention)
    const ts = e.startTimestamp ? e.startTimestamp * 1000 : null;
    out.push({
      id: e.id,
      ts,
      home: e.homeScore.current,
      away: e.awayScore.current,
      tournamentId: e?.tournament?.uniqueTournament?.id,
    });
  }
  return out;
}

function medianOf(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Lig parmak izini hesaplar.
 * @param {object} data - fetchAllMatchData çıktısı
 * @param {number} [nowMs] - şimdiki zaman ms (test için override)
 */
function computeLeagueFingerprint(data, nowMs = Date.now()) {
  const tournamentId = data?.event?.event?.tournament?.uniqueTournament?.id
    ?? data?.tournamentId
    ?? null;

  if (tournamentId == null) return { reliability: 0, reason: 'no_tournament_id' };

  // ─ Havuz ─────────────────────────────────────────────
  const pool = [];
  const seen = new Set();
  // homeLastEvents / awayLastEvents flat array döner; h2hEvents wrapped { events: [...] } gelir.
  // extractFinishedMatches her iki formatı kabul eder.
  const sources = [
    data?.homeLastEvents,
    data?.awayLastEvents,
    data?.h2hEvents,
  ];
  for (const src of sources) {
    const matches = extractFinishedMatches(src, tournamentId);
    for (const m of matches) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      pool.push(m);
    }
  }

  if (pool.length === 0) return { reliability: 0, reason: 'empty_pool' };

  // ─ Zamansal decay ───────────────────────────────────
  const deltas = pool.map(m => m.ts ? Math.max(1, (nowMs - m.ts) / MS_PER_DAY) : null).filter(x => x != null);
  const tau = deltas.length > 0 ? (medianOf(deltas) || 30) : 30;
  // τ=30 min guard: örneklemde timestamp yoksa nötr decay (günlük skalada makul)

  for (const m of pool) {
    const dt = m.ts ? Math.max(1, (nowMs - m.ts) / MS_PER_DAY) : tau;
    m.w = Math.exp(-dt / tau);
  }

  // ─ Ağırlıklı frekans dağılımı ───────────────────────
  const observedMax = pool.reduce((mx, m) => Math.max(mx, m.home, m.away), 0);
  const bins = observedMax + 2;
  const scoredFreq = new Array(bins).fill(0);
  const concededFreq = new Array(bins).fill(0);
  const jointFreq = {};
  let totalW = 0;
  let totalGoals_w = 0;
  let totalGoalsSq_w = 0;
  // Per-team istatistik: her maçtan iki sample (home goals + away goals)
  let perTeamGoals_w = 0, perTeamGoalsSq_w = 0, perTeamW = 0;
  let btts_w = 0;
  let over25_w = 0;
  let over15_w = 0;
  let over35_w = 0;
  let draws_w = 0;
  let homeWins_w = 0;
  let awayWins_w = 0;

  for (const m of pool) {
    const w = m.w;
    totalW += w;
    const h = Math.min(m.home, bins - 1);
    const a = Math.min(m.away, bins - 1);
    // "home perspective" yok — lig geneli olduğu için symmetric tretman: her maçtan hem home hem away tarafı
    // Ancak jointDist için "home-away" olduğu gibi tutulur (lig home-bias bilgisi kaybolmasın)
    scoredFreq[h] += w;
    scoredFreq[a] += w;
    concededFreq[a] += w;
    concededFreq[h] += w;
    const key = `${h}-${a}`;
    jointFreq[key] = (jointFreq[key] || 0) + w;

    const total = m.home + m.away;
    totalGoals_w += total * w;
    totalGoalsSq_w += total * total * w;
    // Per-team: ev + dep gol ayrı birer sample → overdispersion hesabı için
    perTeamGoals_w   += (m.home + m.away) * w;
    perTeamGoalsSq_w += (m.home * m.home + m.away * m.away) * w;
    perTeamW         += 2 * w;
    if (m.home > 0 && m.away > 0) btts_w += w;
    if (total > 2.5) over25_w += w;
    if (total > 1.5) over15_w += w;
    if (total > 3.5) over35_w += w;
    if (m.home > m.away) homeWins_w += w;
    else if (m.home < m.away) awayWins_w += w;
    else draws_w += w;
  }

  // Pool toplam maç sayısı: 2× (hem home hem away taraftan sayıldı); marjinal dağılımları buna göre normalize
  const scoredDist = scoredFreq.map(f => f / (2 * totalW));
  const concededDist = concededFreq.map(f => f / (2 * totalW));
  const jointDist = {};
  for (const [k, v] of Object.entries(jointFreq)) jointDist[k] = v / totalW;

  const leagueAvgGoals = totalGoals_w / totalW;
  const leagueGoalVariance = (totalGoalsSq_w / totalW) - leagueAvgGoals * leagueAvgGoals;
  const leagueGoalStd = Math.sqrt(Math.max(0, leagueGoalVariance));
  const leagueCV = leagueAvgGoals > 0 ? leagueGoalStd / leagueAvgGoals : 0;

  // Per-team overdispersion: Var(goals_per_team) / Mean(goals_per_team)
  // Her maçtan 2 bağımsız sample (home goals, away goals) — NegBinom r hesabı için doğru kaynak
  const leagueAvgGoalsPerTeam  = perTeamW > 0 ? perTeamGoals_w / perTeamW : null;
  const leagueVarGoalsPerTeam  = perTeamW > 0
    ? Math.max(0, (perTeamGoalsSq_w / perTeamW) - (leagueAvgGoalsPerTeam ** 2))
    : null;
  const leagueOverdispersion = (leagueAvgGoalsPerTeam != null && leagueAvgGoalsPerTeam > 0)
    ? leagueVarGoalsPerTeam / leagueAvgGoalsPerTeam
    : null;

  const result = {
    tournamentId,
    poolSize: pool.length,
    poolDateRangeDays: deltas.length > 0 ? Math.max(...deltas) - Math.min(...deltas) : 0,
    tempDecayTau: tau,
    scoredDist,
    concededDist,
    jointDist,
    leagueBTTSRate: btts_w / totalW,
    leagueOver25Rate: over25_w / totalW,
    leagueOver15Rate: over15_w / totalW,
    leagueOver35Rate: over35_w / totalW,
    leagueDrawRate: draws_w / totalW,
    leagueHomeWinRate: homeWins_w / totalW,
    leagueAwayWinRate: awayWins_w / totalW,
    leagueAvgGoals,
    leagueGoalVariance,
    leagueGoalStd,
    leagueCV,
    leagueAvgGoalsPerTeam,
    leagueVarGoalsPerTeam,
    leagueOverdispersion,
    n: pool.length,
    reliability: 0, // aşağıda validation sonrasında set edilir
    validation: {},
  };

  // ─ Standings-based agregat (çapraz kontrol) ─────────
  const rows = data?.standingsTotal?.standings?.[0]?.rows || [];
  let leagueAvgGoals_std = null;
  let leagueDrawRate_std = null;
  if (rows.length >= 2) {
    let totalGoals = 0, totalMatches = 0, totalDraws = 0;
    for (const r of rows) {
      totalGoals += (r.scoresFor || r.goalsFor || 0);
      totalMatches += (r.matches ?? r.played ?? 0);
      totalDraws += (r.draws ?? 0);
    }
    if (totalMatches > 0) {
      // Her maç iki takımda sayılıyor — scoresFor/(matches) takım başı
      // Lig geneli maç başı gol = (Σ scoresFor) / (Σ matches) — bölünme doğru (payda da 2× sayılmış)
      leagueAvgGoals_std = totalGoals / totalMatches;
      leagueDrawRate_std = totalDraws / totalMatches;
    }
  }
  result.leagueAvgGoals_std = leagueAvgGoals_std;
  result.leagueDrawRate_std = leagueDrawRate_std;

  // ─ Validation ────────────────────────────────────────
  // V1: Pool ↔ Standings uyumu (σ/√n doğal tolerans)
  let v1 = null;
  if (leagueAvgGoals_std != null && pool.length >= 3) {
    const poolStdErr = leagueGoalStd / Math.sqrt(pool.length);
    const diff = Math.abs(leagueAvgGoals - leagueAvgGoals_std);
    v1 = diff <= 2 * poolStdErr;
    result.validation.v1_poolVsStandings = { diff, tolerance: 2 * poolStdErr, passed: v1 };
  } else {
    result.validation.v1_poolVsStandings = { passed: null, reason: 'insufficient_data' };
  }

  // V2: Marjinal dağılım normalizasyonu
  const scoredSum = scoredDist.reduce((s, v) => s + v, 0);
  const concededSum = concededDist.reduce((s, v) => s + v, 0);
  const v2 = Math.abs(scoredSum - 1.0) < 1e-6 && Math.abs(concededSum - 1.0) < 1e-6;
  result.validation.v2_normalization = { scoredSum, concededSum, passed: v2 };

  // V3: Örneklem yeterliliği (√(teams × 2))
  const teamCount = rows.length || 20;
  const minPool = Math.ceil(Math.sqrt(teamCount * 2));
  const v3 = pool.length >= minPool;
  result.validation.v3_sampleSize = { pool: pool.length, required: minPool, passed: v3 };

  // Reliability: geçen test oranı × n-based shrinkage
  const tests = [v1, v2, v3].filter(t => t != null);
  const passedCount = tests.filter(t => t === true).length;
  const testRatio = tests.length > 0 ? passedCount / tests.length : 0;
  // Bayesian shrinkage: n/(n+√n)
  const nShrink = pool.length / (pool.length + Math.sqrt(pool.length));
  result.reliability = testRatio * nShrink;

  return result;
}

module.exports = { computeLeagueFingerprint };
