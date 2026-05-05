'use strict';
/**
 * scripts/backfill-outcomes.js
 *
 * learning.db'deki outcome'u eksik prediction'lar için match-cache.db'den
 * (matches tablosu) gerçek skoru bulup learning_outcomes'a yazar ve residual
 * hesaplar.
 *
 * Kullanım: node scripts/backfill-outcomes.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const learning = require('../src/learning');

learning.store.initDB();
const ldb = learning.store._getDB();

const cachePath = path.join(__dirname, '..', 'data', 'match-cache.db');
let cdb;
try {
  cdb = new Database(cachePath, { readonly: true });
} catch (e) {
  console.error('[Backfill] match-cache.db açılamadı:', e.message);
  process.exit(1);
}

// Outcome'u olmayan unique match_id'ler
const orphans = ldb.prepare(`
  SELECT DISTINCT p.match_id, p.kickoff_ts, p.tournament_id, p.home_team_id, p.away_team_id
  FROM learning_predictions p
  LEFT JOIN learning_outcomes o ON o.match_id = p.match_id
  WHERE o.match_id IS NULL
`).all();

console.log(`[Backfill] ${orphans.length} prediction outcome bekliyor`);

let filled = 0;
const getMatch = cdb.prepare(`SELECT home_score, away_score, home_score_ht, away_score_ht, status, start_ts FROM matches WHERE event_id = ?`);
const getRecent = cdb.prepare(`SELECT home_score, away_score FROM team_recent_details WHERE event_id = ?`);

for (const o of orphans) {
  let homeScore = null, awayScore = null, htHome = null, htAway = null, startTs = null;

  // 1. yol: matches tablosu (her zaman dolu olmayabiliyor)
  const m = getMatch.get(o.match_id);
  if (m && m.status === 'finished' && m.home_score != null && m.away_score != null) {
    homeScore = m.home_score;
    awayScore = m.away_score;
    htHome = m.home_score_ht;
    htAway = m.away_score_ht;
    startTs = m.start_ts;
  } else {
    // 2. yol: team_recent_details — skor JSON olarak: {current, period1, period2}
    const r = getRecent.get(o.match_id);
    if (!r) continue;
    try {
      const hs = typeof r.home_score === 'string' ? JSON.parse(r.home_score) : r.home_score;
      const as = typeof r.away_score === 'string' ? JSON.parse(r.away_score) : r.away_score;
      if (hs?.current == null || as?.current == null) continue;
      homeScore = hs.current;
      awayScore = as.current;
      htHome = hs.period1 ?? null;
      htAway = as.period1 ?? null;
    } catch (_) { continue; }
  }

  learning.persistOutcome({
    matchId: o.match_id,
    kickoffTs: o.kickoff_ts ?? startTs ?? null,
    tournamentId: o.tournament_id ?? null,
    homeTeamId: o.home_team_id ?? null,
    awayTeamId: o.away_team_id ?? null,
    homeScore,
    awayScore,
    htHome,
    htAway,
  });
  filled++;
}

console.log(`[Backfill] ${filled} outcome yazıldı`);

const recon = learning.reconcileResiduals();
console.log(`[Backfill] ${recon.updated} residual reconcile edildi`);
console.log(`[Backfill] Final stats:`, learning.getStats());

cdb.close();
