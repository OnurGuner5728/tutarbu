'use strict';
/**
 * learning/store.js — Persistent feature/prediction/outcome/residual store.
 *
 * Ayrı bir SQLite veritabanı (data/learning.db). match-cache.db ile karışmaz.
 * Tüm tablolar normalize, asOfTs ile zaman kilitli.
 *
 * Kayıtlar:
 *   - learning_predictions: bir maç için yapılan tahmin + tam girdi snapshot'ı.
 *   - learning_outcomes:    aynı maç bittiğinde gerçek skor + türetilmiş target'lar.
 *   - learning_residuals:   prediction-outcome eşlenmesi sonrası residual sinyalleri.
 *   - learning_fingerprints: kondisyon vektörü (k-NN ile benzerlik araması için).
 *
 * Hardcoded fallback yok. Eksik veri NULL kalır.
 */

const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'learning.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let Database = null;
try {
  Database = require('better-sqlite3');
} catch (_) {
  console.error('[Learning Store] better-sqlite3 yok — learning store devre dışı.');
}

let db = null;

function initDB() {
  if (!Database) return false;
  if (db) return true;

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -32000');

  db.exec(`
    -- ── Tahmin Snapshot'ı ────────────────────────────────────────────────────
    -- Bir maç için bir tahmin yapıldığında tam girdi+çıktı kalıcılaşır.
    -- as_of_ts: tahminin yapıldığı an (kickoff'tan ÖNCE olmalı, backtest'te zorlanır).
    CREATE TABLE IF NOT EXISTS learning_predictions (
      match_id        INTEGER NOT NULL,
      model_version   TEXT    NOT NULL,
      as_of_ts        INTEGER NOT NULL,
      kickoff_ts      INTEGER,
      tournament_id   INTEGER,
      season_id       INTEGER,
      home_team_id    INTEGER,
      away_team_id    INTEGER,
      manager_home_id INTEGER,
      manager_away_id INTEGER,
      referee_id      INTEGER,
      lambda_home     REAL,
      lambda_away     REAL,
      rho             REAL,
      prob_home       REAL,
      prob_draw       REAL,
      prob_away       REAL,
      prob_o25        REAL,
      prob_btts       REAL,
      predicted_score TEXT,
      metric_matrix   TEXT,
      baseline        TEXT,
      contextual      TEXT,
      learned_adj     TEXT,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (match_id, model_version, as_of_ts)
    );

    -- ── Gerçek Sonuç ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS learning_outcomes (
      match_id        INTEGER PRIMARY KEY,
      kickoff_ts      INTEGER,
      tournament_id   INTEGER,
      home_team_id    INTEGER,
      away_team_id    INTEGER,
      home_score      INTEGER,
      away_score      INTEGER,
      ht_home         INTEGER,
      ht_away         INTEGER,
      result_1x2      TEXT,
      ou25            TEXT,
      btts            TEXT,
      htft            TEXT,
      total_goals     INTEGER,
      created_at      INTEGER NOT NULL
    );

    -- ── Residual'lar (Prediction × Outcome) ────────────────────────────────────
    -- d_lambda_home = log(actualHome+0.5) - log(λ̂_home+0.5)  (smoothed)
    -- surprise_index = -log(p̂_actual_outcome)
    CREATE TABLE IF NOT EXISTS learning_residuals (
      match_id        INTEGER NOT NULL,
      model_version   TEXT    NOT NULL,
      as_of_ts        INTEGER NOT NULL,
      d_lambda_home   REAL,
      d_lambda_away   REAL,
      d_lambda_total  REAL,
      d_lambda_diff   REAL,
      surprise_index  REAL,
      brier_1x2       REAL,
      log_loss_1x2    REAL,
      hit_1x2         INTEGER,
      hit_ou25        INTEGER,
      hit_btts        INTEGER,
      hit_score       INTEGER,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (match_id, model_version, as_of_ts)
    );

    -- ── Kondisyon Fingerprint'i ────────────────────────────────────────────────
    -- Davranışsal/metrik-matris seviyesinde maçın özet vektörü.
    -- Kovaryans hesaplaması ve k-NN için ayrı tablo (predictions ile JOIN edilir).
    -- vector_json: { f1: 0.32, f2: -1.05, ... } ham (z-score öncesi) değerler.
    CREATE TABLE IF NOT EXISTS learning_fingerprints (
      match_id        INTEGER NOT NULL,
      model_version   TEXT    NOT NULL,
      as_of_ts        INTEGER NOT NULL,
      tournament_id   INTEGER,
      season_id       INTEGER,
      home_team_id    INTEGER,
      away_team_id    INTEGER,
      kickoff_ts      INTEGER,
      vector_json     TEXT NOT NULL,
      schema_version  INTEGER NOT NULL,
      created_at      INTEGER NOT NULL,
      PRIMARY KEY (match_id, model_version, as_of_ts)
    );

    CREATE INDEX IF NOT EXISTS idx_lp_kickoff      ON learning_predictions(kickoff_ts);
    CREATE INDEX IF NOT EXISTS idx_lp_tournament   ON learning_predictions(tournament_id, kickoff_ts);
    CREATE INDEX IF NOT EXISTS idx_lo_kickoff      ON learning_outcomes(kickoff_ts);
    CREATE INDEX IF NOT EXISTS idx_lr_match        ON learning_residuals(match_id);
    CREATE INDEX IF NOT EXISTS idx_lf_kickoff      ON learning_fingerprints(kickoff_ts);
    CREATE INDEX IF NOT EXISTS idx_lf_tournament   ON learning_fingerprints(tournament_id, kickoff_ts);
    CREATE INDEX IF NOT EXISTS idx_lf_teams        ON learning_fingerprints(home_team_id, away_team_id);
  `);

  return true;
}

function ensureDB() {
  if (!db) initDB();
  return !!db;
}

const j = (v) => v == null ? null : JSON.stringify(v);
const p = (v) => v == null ? null : JSON.parse(v);
const now = () => Date.now();

// ─── PREDICTIONS ─────────────────────────────────────────────────────────────

function recordPrediction(rec) {
  if (!ensureDB()) return false;
  if (!rec || rec.matchId == null || !rec.modelVersion || rec.asOfTs == null) return false;

  db.prepare(`
    INSERT INTO learning_predictions (
      match_id, model_version, as_of_ts, kickoff_ts,
      tournament_id, season_id,
      home_team_id, away_team_id,
      manager_home_id, manager_away_id, referee_id,
      lambda_home, lambda_away, rho,
      prob_home, prob_draw, prob_away,
      prob_o25, prob_btts, predicted_score,
      metric_matrix, baseline, contextual, learned_adj,
      created_at
    ) VALUES (?,?,?,?, ?,?, ?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?, ?)
    ON CONFLICT(match_id, model_version, as_of_ts) DO UPDATE SET
      kickoff_ts      = excluded.kickoff_ts,
      lambda_home     = excluded.lambda_home,
      lambda_away     = excluded.lambda_away,
      rho             = excluded.rho,
      prob_home       = excluded.prob_home,
      prob_draw       = excluded.prob_draw,
      prob_away       = excluded.prob_away,
      prob_o25        = excluded.prob_o25,
      prob_btts       = excluded.prob_btts,
      predicted_score = excluded.predicted_score,
      metric_matrix   = excluded.metric_matrix,
      baseline        = excluded.baseline,
      contextual      = excluded.contextual,
      learned_adj     = excluded.learned_adj,
      created_at      = excluded.created_at
  `).run(
    rec.matchId, rec.modelVersion, rec.asOfTs, rec.kickoffTs ?? null,
    rec.tournamentId ?? null, rec.seasonId ?? null,
    rec.homeTeamId ?? null, rec.awayTeamId ?? null,
    rec.managerHomeId ?? null, rec.managerAwayId ?? null, rec.refereeId ?? null,
    rec.lambdaHome ?? null, rec.lambdaAway ?? null, rec.rho ?? null,
    rec.probHome ?? null, rec.probDraw ?? null, rec.probAway ?? null,
    rec.probO25 ?? null, rec.probBTTS ?? null, rec.predictedScore ?? null,
    j(rec.metricMatrix), j(rec.baseline), j(rec.contextual), j(rec.learnedAdj),
    now()
  );
  return true;
}

function getPrediction(matchId, modelVersion) {
  if (!ensureDB()) return null;
  const row = db.prepare(`
    SELECT * FROM learning_predictions
    WHERE match_id=? AND model_version=?
    ORDER BY as_of_ts DESC LIMIT 1
  `).get(matchId, modelVersion);
  if (!row) return null;
  return inflatePrediction(row);
}

function inflatePrediction(row) {
  return {
    matchId       : row.match_id,
    modelVersion  : row.model_version,
    asOfTs        : row.as_of_ts,
    kickoffTs     : row.kickoff_ts,
    tournamentId  : row.tournament_id,
    seasonId      : row.season_id,
    homeTeamId    : row.home_team_id,
    awayTeamId    : row.away_team_id,
    managerHomeId : row.manager_home_id,
    managerAwayId : row.manager_away_id,
    refereeId     : row.referee_id,
    lambdaHome    : row.lambda_home,
    lambdaAway    : row.lambda_away,
    rho           : row.rho,
    probHome      : row.prob_home,
    probDraw      : row.prob_draw,
    probAway      : row.prob_away,
    probO25       : row.prob_o25,
    probBTTS      : row.prob_btts,
    predictedScore: row.predicted_score,
    metricMatrix  : p(row.metric_matrix),
    baseline      : p(row.baseline),
    contextual    : p(row.contextual),
    learnedAdj    : p(row.learned_adj),
    createdAt     : row.created_at,
  };
}

// ─── OUTCOMES ────────────────────────────────────────────────────────────────

function recordOutcome(rec) {
  if (!ensureDB()) return false;
  if (!rec || rec.matchId == null) return false;
  db.prepare(`
    INSERT INTO learning_outcomes (
      match_id, kickoff_ts, tournament_id,
      home_team_id, away_team_id,
      home_score, away_score, ht_home, ht_away,
      result_1x2, ou25, btts, htft, total_goals,
      created_at
    ) VALUES (?,?,?, ?,?, ?,?,?,?, ?,?,?,?,?, ?)
    ON CONFLICT(match_id) DO UPDATE SET
      kickoff_ts    = excluded.kickoff_ts,
      home_score    = excluded.home_score,
      away_score    = excluded.away_score,
      ht_home       = excluded.ht_home,
      ht_away       = excluded.ht_away,
      result_1x2    = excluded.result_1x2,
      ou25          = excluded.ou25,
      btts          = excluded.btts,
      htft          = excluded.htft,
      total_goals   = excluded.total_goals,
      created_at    = excluded.created_at
  `).run(
    rec.matchId, rec.kickoffTs ?? null, rec.tournamentId ?? null,
    rec.homeTeamId ?? null, rec.awayTeamId ?? null,
    rec.homeScore ?? null, rec.awayScore ?? null,
    rec.htHome ?? null, rec.htAway ?? null,
    rec.result1X2 ?? null, rec.ou25 ?? null, rec.btts ?? null,
    rec.htft ?? null, rec.totalGoals ?? null,
    now()
  );
  return true;
}

function getOutcome(matchId) {
  if (!ensureDB()) return null;
  const row = db.prepare('SELECT * FROM learning_outcomes WHERE match_id=?').get(matchId);
  if (!row) return null;
  return {
    matchId       : row.match_id,
    kickoffTs     : row.kickoff_ts,
    tournamentId  : row.tournament_id,
    homeTeamId    : row.home_team_id,
    awayTeamId    : row.away_team_id,
    homeScore     : row.home_score,
    awayScore     : row.away_score,
    htHome        : row.ht_home,
    htAway        : row.ht_away,
    result1X2     : row.result_1x2,
    ou25          : row.ou25,
    btts          : row.btts,
    htft          : row.htft,
    totalGoals    : row.total_goals,
  };
}

// ─── RESIDUALS ───────────────────────────────────────────────────────────────

function recordResidual(rec) {
  if (!ensureDB()) return false;
  if (!rec || rec.matchId == null || !rec.modelVersion || rec.asOfTs == null) return false;
  db.prepare(`
    INSERT INTO learning_residuals (
      match_id, model_version, as_of_ts,
      d_lambda_home, d_lambda_away, d_lambda_total, d_lambda_diff,
      surprise_index, brier_1x2, log_loss_1x2,
      hit_1x2, hit_ou25, hit_btts, hit_score,
      created_at
    ) VALUES (?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?, ?)
    ON CONFLICT(match_id, model_version, as_of_ts) DO UPDATE SET
      d_lambda_home  = excluded.d_lambda_home,
      d_lambda_away  = excluded.d_lambda_away,
      d_lambda_total = excluded.d_lambda_total,
      d_lambda_diff  = excluded.d_lambda_diff,
      surprise_index = excluded.surprise_index,
      brier_1x2      = excluded.brier_1x2,
      log_loss_1x2   = excluded.log_loss_1x2,
      hit_1x2        = excluded.hit_1x2,
      hit_ou25       = excluded.hit_ou25,
      hit_btts       = excluded.hit_btts,
      hit_score      = excluded.hit_score,
      created_at     = excluded.created_at
  `).run(
    rec.matchId, rec.modelVersion, rec.asOfTs,
    rec.dLambdaHome ?? null, rec.dLambdaAway ?? null,
    rec.dLambdaTotal ?? null, rec.dLambdaDiff ?? null,
    rec.surpriseIndex ?? null, rec.brier1X2 ?? null, rec.logLoss1X2 ?? null,
    rec.hit1X2 == null ? null : (rec.hit1X2 ? 1 : 0),
    rec.hitOU25 == null ? null : (rec.hitOU25 ? 1 : 0),
    rec.hitBTTS == null ? null : (rec.hitBTTS ? 1 : 0),
    rec.hitScore == null ? null : (rec.hitScore ? 1 : 0),
    now()
  );
  return true;
}

// ─── FINGERPRINTS ────────────────────────────────────────────────────────────

function recordFingerprint(rec) {
  if (!ensureDB()) return false;
  if (!rec || rec.matchId == null || !rec.modelVersion || rec.asOfTs == null) return false;
  if (!rec.vector || typeof rec.vector !== 'object') return false;
  db.prepare(`
    INSERT INTO learning_fingerprints (
      match_id, model_version, as_of_ts,
      tournament_id, season_id,
      home_team_id, away_team_id, kickoff_ts,
      vector_json, schema_version, created_at
    ) VALUES (?,?,?, ?,?, ?,?,?, ?,?,?)
    ON CONFLICT(match_id, model_version, as_of_ts) DO UPDATE SET
      tournament_id  = excluded.tournament_id,
      season_id      = excluded.season_id,
      home_team_id   = excluded.home_team_id,
      away_team_id   = excluded.away_team_id,
      kickoff_ts     = excluded.kickoff_ts,
      vector_json    = excluded.vector_json,
      schema_version = excluded.schema_version,
      created_at     = excluded.created_at
  `).run(
    rec.matchId, rec.modelVersion, rec.asOfTs,
    rec.tournamentId ?? null, rec.seasonId ?? null,
    rec.homeTeamId ?? null, rec.awayTeamId ?? null, rec.kickoffTs ?? null,
    JSON.stringify(rec.vector), rec.schemaVersion ?? 1,
    now()
  );
  return true;
}

/**
 * Tüm tarihsel fingerprint'leri (residual ile JOIN) belirli bir kickoff_ts'den ÖNCE getir.
 * Aynı maçın kendi fingerprint'i hariç tutulur (matchId !=).
 *
 * @param {object} opts
 * @param {string} opts.modelVersion
 * @param {number} opts.beforeKickoffTs  (saniye veya ms — schema saniye saklıyor)
 * @param {number} [opts.excludeMatchId]
 * @param {number} [opts.tournamentId]    sadece aynı lig istenirse
 * @returns {Array<{matchId, vector, residual, kickoffTs, tournamentId, homeTeamId, awayTeamId}>}
 */
function getHistoricalCases(opts) {
  if (!ensureDB()) return [];
  const { modelVersion, beforeKickoffTs } = opts;
  if (!modelVersion || beforeKickoffTs == null) return [];

  const params = [modelVersion, beforeKickoffTs];
  let sql = `
    SELECT f.match_id, f.vector_json, f.kickoff_ts, f.tournament_id, f.home_team_id, f.away_team_id,
           r.d_lambda_home, r.d_lambda_away, r.d_lambda_total, r.d_lambda_diff,
           r.surprise_index, r.brier_1x2, r.log_loss_1x2,
           r.hit_1x2, r.hit_ou25, r.hit_btts, r.hit_score
    FROM learning_fingerprints f
    INNER JOIN learning_residuals r
      ON r.match_id = f.match_id
     AND r.model_version = f.model_version
     AND r.as_of_ts = f.as_of_ts
    WHERE f.model_version = ?
      AND f.kickoff_ts IS NOT NULL
      AND f.kickoff_ts < ?
  `;
  if (opts.excludeMatchId != null) {
    sql += ' AND f.match_id != ?';
    params.push(opts.excludeMatchId);
  }
  if (opts.tournamentId != null) {
    sql += ' AND f.tournament_id = ?';
    params.push(opts.tournamentId);
  }
  // Performans için son N (örn. 50000) sınırla
  sql += ' ORDER BY f.kickoff_ts DESC LIMIT 50000';

  const rows = db.prepare(sql).all(...params);
  return rows.map(row => ({
    matchId      : row.match_id,
    kickoffTs    : row.kickoff_ts,
    tournamentId : row.tournament_id,
    homeTeamId   : row.home_team_id,
    awayTeamId   : row.away_team_id,
    vector       : JSON.parse(row.vector_json),
    residual     : {
      dLambdaHome  : row.d_lambda_home,
      dLambdaAway  : row.d_lambda_away,
      dLambdaTotal : row.d_lambda_total,
      dLambdaDiff  : row.d_lambda_diff,
      surpriseIndex: row.surprise_index,
      brier1X2     : row.brier_1x2,
      logLoss1X2   : row.log_loss_1x2,
      hit1X2       : row.hit_1x2,
      hitOU25      : row.hit_ou25,
      hitBTTS      : row.hit_btts,
      hitScore     : row.hit_score,
    },
  }));
}

function getStats() {
  if (!ensureDB()) return null;
  const rows = {
    predictions  : db.prepare('SELECT COUNT(*) AS c FROM learning_predictions').get().c,
    outcomes     : db.prepare('SELECT COUNT(*) AS c FROM learning_outcomes').get().c,
    residuals    : db.prepare('SELECT COUNT(*) AS c FROM learning_residuals').get().c,
    fingerprints : db.prepare('SELECT COUNT(*) AS c FROM learning_fingerprints').get().c,
  };
  return rows;
}

module.exports = {
  initDB,
  recordPrediction,
  getPrediction,
  recordOutcome,
  getOutcome,
  recordResidual,
  recordFingerprint,
  getHistoricalCases,
  getStats,
  // Düşük seviye erişim (test/migration için)
  _getDB: () => { ensureDB(); return db; },
  DB_PATH,
};
