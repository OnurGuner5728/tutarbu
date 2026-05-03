/**
 * match-db.js — SQLite Match Data Cache
 *
 * Normalize edilmiş şema: her veri tipi kendi tablosunda.
 * Her tablo için ayrı TTL — plan: match_db_plan.md
 *
 * Bağımlılık: better-sqlite3 (Node 20 prebuilt binary)
 * DB dosyası: <proje kökü>/data/match-cache.db
 */

const path = require('path');
const fs   = require('fs');

// ─── DB DOSYASI ───────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'match-cache.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('[MatchDB] data/ dizini oluşturuldu:', DATA_DIR);
}

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('[MatchDB] better-sqlite3 yüklü değil. "npm install better-sqlite3" çalıştır.');
  // Cache devre dışı — uygulama yine de çalışır, sadece DB olmadan
  Database = null;
}

let db = null;

// ─── TTL SABİTLERİ (saniye) ───────────────────────────────────────────────────
// Veri türüne göre dinamik TTL — sık değişen veriler daha kısa, stabil veriler daha uzun
const TTL = {
  PERMANENT     : Infinity,
  TEAM          : 48 * 3600,   // 48 saat — takım profili nadiren değişir
  TEAM_EVENTS   : 12 * 3600,   // 12 saat — son maçlar günde 1-2 kez güncellenir
  STANDINGS     : 6  * 3600,   // 6 saat — maç günü değişebilir
  TEAM_SEASON   : 12 * 3600,   // 12 saat — sezon istatistikleri yavaş değişir
  PLAYER        : 24 * 3600,   // 24 saat — oyuncu bilgileri nadiren güncellenir
  REFEREE       : 24 * 3600,   // 24 saat — hakem verileri stabil
  MANAGER       : 48 * 3600,   // 48 saat — menajer nadiren değişir
  WEATHER_FUTURE: 3  * 3600,   // 3 saat — hava durumu sık güncellenir
  H2H           : 7 * 24 * 3600, // 7 gün — H2H geçmiş nadiren değişir
  LINEUPS       : 2  * 3600,   // 2 saat — maç öncesi sık değişir
  ODDS          : 30 * 60,     // 30 dakika — oranlar sürekli hareket eder
};

// ─── YARDIMCI FONKSİYONLAR ────────────────────────────────────────────────────
function now() { return Date.now(); } // ms

function isStale(fetchedAt, ttlSeconds) {
  if (ttlSeconds === Infinity || !fetchedAt) return false;
  return (now() - fetchedAt) > ttlSeconds * 1000;
}

function j(obj)  { return obj != null ? JSON.stringify(obj) : null; }
function p(str)  { return str != null ? JSON.parse(str)     : null; }

// ─── INIT ─────────────────────────────────────────────────────────────────────
function initDB() {
  if (!Database) {
    console.warn('[MatchDB] better-sqlite3 yok — cache devre dışı.');
    return false;
  }
  if (db) return true;

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');   // Eş zamanlı okuma için
  db.pragma('synchronous = NORMAL'); // Performans/güvenilirlik dengesi
  db.pragma('cache_size = -32000');  // 32MB page cache

  db.exec(`
    -- ── Maç Kaydı ────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS matches (
      event_id        INTEGER PRIMARY KEY,
      event_date      TEXT    NOT NULL,
      start_ts        INTEGER NOT NULL,
      tournament_id   INTEGER,
      tournament_name TEXT,
      season_id       INTEGER,
      home_team_id    INTEGER NOT NULL,
      home_team_name  TEXT,
      away_team_id    INTEGER NOT NULL,
      away_team_name  TEXT,
      status          TEXT    DEFAULT 'notstarted',
      home_score      INTEGER,
      away_score      INTEGER,
      home_score_ht   INTEGER,
      away_score_ht   INTEGER,
      referee_id      INTEGER,
      home_manager_id INTEGER,
      away_manager_id INTEGER,
      fetched_at      INTEGER NOT NULL,
      updated_at      INTEGER
    );

    -- ── Maç Günü Değişen Veri ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS match_volatile (
      event_id        INTEGER PRIMARY KEY,
      lineups         TEXT,
      odds            TEXT,
      odds_changes    TEXT,
      missing_players TEXT,
      streaks         TEXT,
      form            TEXT,
      votes           TEXT,
      fetched_at      INTEGER NOT NULL
    );

    -- ── H2H & Tarihsel Maç Verisi ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS match_static (
      event_id          INTEGER PRIMARY KEY,
      h2h               TEXT,
      h2h_events        TEXT,
      h2h_match_details TEXT,
      fetched_at        INTEGER NOT NULL
    );

    -- ── Takım Genel Bilgisi ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS team_cache (
      team_id    INTEGER PRIMARY KEY,
      data       TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    -- ── Takım Son Maçlar (Form) ───────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS team_last_events (
      team_id    INTEGER PRIMARY KEY,
      events     TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL
    );

    -- ── Bitmiş Maç Detayları (incidents, stats, shotmap, graph, lineups) ──────
    -- event_id ile unique — kalıcı (finished match data never changes)
    CREATE TABLE IF NOT EXISTS team_recent_details (
      event_id   INTEGER PRIMARY KEY,
      home_team  TEXT,
      away_team  TEXT,
      home_score TEXT,
      away_score TEXT,
      incidents  TEXT,
      stats      TEXT,
      shotmap    TEXT,
      graph      TEXT,
      lineups    TEXT,
      fetched_at INTEGER NOT NULL
    );

    -- ── Lig Sıralaması ────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS standings_cache (
      tournament_id INTEGER NOT NULL,
      season_id     INTEGER NOT NULL,
      type          TEXT    NOT NULL,
      data          TEXT    NOT NULL,
      fetched_at    INTEGER NOT NULL,
      PRIMARY KEY (tournament_id, season_id, type)
    );

    -- ── Takım Sezon İstatistikleri ────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS team_season_stats (
      team_id       INTEGER NOT NULL,
      tournament_id INTEGER NOT NULL,
      season_id     INTEGER NOT NULL,
      stats         TEXT,
      top_players   TEXT,
      fetched_at    INTEGER NOT NULL,
      PRIMARY KEY (team_id, tournament_id, season_id)
    );

    -- ── Oyuncu Cache ──────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS player_cache (
      player_id       INTEGER NOT NULL,
      tournament_id   INTEGER NOT NULL,
      season_id       INTEGER NOT NULL,
      season_stats    TEXT,
      attributes      TEXT,
      characteristics TEXT,
      fetched_at      INTEGER NOT NULL,
      PRIMARY KEY (player_id, tournament_id, season_id)
    );

    -- ── Hakem Cache ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS referee_cache (
      referee_id   INTEGER PRIMARY KEY,
      stats        TEXT,
      last_events  TEXT,
      fetched_at   INTEGER NOT NULL
    );

    -- ── Menajer Cache ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS manager_cache (
      manager_id   INTEGER PRIMARY KEY,
      last_events  TEXT,
      fetched_at   INTEGER NOT NULL
    );

    -- ── Hava Durumu Cache ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS weather_cache (
      lat        REAL NOT NULL,
      lon        REAL NOT NULL,
      match_date TEXT NOT NULL,
      metrics    TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      PRIMARY KEY (lat, lon, match_date)
    );

    -- ── İndeksler ─────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_matches_date       ON matches(event_date);
    CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id, season_id);
    CREATE INDEX IF NOT EXISTS idx_matches_status     ON matches(status);
    CREATE INDEX IF NOT EXISTS idx_matches_teams      ON matches(home_team_id, away_team_id);
    CREATE INDEX IF NOT EXISTS idx_player_pid         ON player_cache(player_id);
    CREATE INDEX IF NOT EXISTS idx_standings_ttl      ON standings_cache(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_player_ttl         ON player_cache(fetched_at);
  `);

  console.log('[MatchDB] SQLite hazır:', DB_PATH);
  return true;
}

// ─── TEAM CACHE ───────────────────────────────────────────────────────────────

function getTeam(teamId) {
  if (!db) return null;
  const row = db.prepare('SELECT data, fetched_at FROM team_cache WHERE team_id = ?').get(teamId);
  if (!row || isStale(row.fetched_at, TTL.TEAM)) return null;
  return p(row.data);
}

function saveTeam(teamId, data) {
  if (!db || !data) return;
  db.prepare(`
    INSERT INTO team_cache (team_id, data, fetched_at) VALUES (?,?,?)
    ON CONFLICT(team_id) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at
  `).run(teamId, j(data), now());
}

// ─── TEAM LAST EVENTS ─────────────────────────────────────────────────────────

function getTeamLastEvents(teamId) {
  if (!db) return null;
  const row = db.prepare('SELECT events, fetched_at FROM team_last_events WHERE team_id = ?').get(teamId);
  if (!row || isStale(row.fetched_at, TTL.TEAM_EVENTS)) return null;
  return p(row.events);
}

function saveTeamLastEvents(teamId, events) {
  if (!db || !events) return;
  db.prepare(`
    INSERT INTO team_last_events (team_id, events, fetched_at) VALUES (?,?,?)
    ON CONFLICT(team_id) DO UPDATE SET events=excluded.events, fetched_at=excluded.fetched_at
  `).run(teamId, j(events), now());
}

// ─── TEAM RECENT DETAILS (KALICI) ─────────────────────────────────────────────

function getRecentDetail(eventId) {
  if (!db) return null;
  // Kalıcı — TTL kontrolü yok
  const row = db.prepare('SELECT * FROM team_recent_details WHERE event_id = ?').get(eventId);
  if (!row) return null;
  return {
    eventId   : row.event_id,
    homeTeam  : p(row.home_team),
    awayTeam  : p(row.away_team),
    homeScore : p(row.home_score),
    awayScore : p(row.away_score),
    incidents : p(row.incidents),
    stats     : p(row.stats),
    shotmap   : p(row.shotmap),
    graph     : p(row.graph),
    lineups   : p(row.lineups),
  };
}

function saveRecentDetail(eventId, detail) {
  if (!db || !detail) return;
  db.prepare(`
    INSERT OR IGNORE INTO team_recent_details
      (event_id, home_team, away_team, home_score, away_score,
       incidents, stats, shotmap, graph, lineups, fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    eventId,
    j(detail.homeTeam), j(detail.awayTeam),
    j(detail.homeScore), j(detail.awayScore),
    j(detail.incidents), j(detail.stats),
    j(detail.shotmap), j(detail.graph), j(detail.lineups),
    now()
  );
  // INSERT OR IGNORE: kalıcı veri — bir kez yazıldı mı dokunma
}

// ─── STANDINGS ────────────────────────────────────────────────────────────────

function getStandings(tournamentId, seasonId, type) {
  if (!db) return null;
  const row = db.prepare(`
    SELECT data, fetched_at FROM standings_cache
    WHERE tournament_id=? AND season_id=? AND type=?
  `).get(tournamentId, seasonId, type);
  if (!row || isStale(row.fetched_at, TTL.STANDINGS)) return null;
  return p(row.data);
}

function saveStandings(tournamentId, seasonId, type, data) {
  if (!db || !data) return;
  db.prepare(`
    INSERT INTO standings_cache (tournament_id, season_id, type, data, fetched_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(tournament_id, season_id, type) DO UPDATE SET
      data=excluded.data, fetched_at=excluded.fetched_at
  `).run(tournamentId, seasonId, type, j(data), now());
}

// ─── TEAM SEASON STATS ────────────────────────────────────────────────────────

function getTeamSeasonStats(teamId, tournamentId, seasonId) {
  if (!db) return null;
  const row = db.prepare(`
    SELECT stats, top_players, fetched_at FROM team_season_stats
    WHERE team_id=? AND tournament_id=? AND season_id=?
  `).get(teamId, tournamentId, seasonId);
  if (!row || isStale(row.fetched_at, TTL.TEAM_SEASON)) return null;
  return { stats: p(row.stats), topPlayers: p(row.top_players) };
}

function saveTeamSeasonStats(teamId, tournamentId, seasonId, stats, topPlayers) {
  if (!db) return;
  db.prepare(`
    INSERT INTO team_season_stats (team_id, tournament_id, season_id, stats, top_players, fetched_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(team_id, tournament_id, season_id) DO UPDATE SET
      stats=excluded.stats, top_players=excluded.top_players, fetched_at=excluded.fetched_at
  `).run(teamId, tournamentId, seasonId, j(stats), j(topPlayers), now());
}

// ─── PLAYER CACHE ─────────────────────────────────────────────────────────────

function getPlayer(playerId, tournamentId, seasonId) {
  if (!db) return null;
  const row = db.prepare(`
    SELECT season_stats, attributes, characteristics, fetched_at FROM player_cache
    WHERE player_id=? AND tournament_id=? AND season_id=?
  `).get(playerId, tournamentId, seasonId);
  if (!row || isStale(row.fetched_at, TTL.PLAYER)) return null;
  return {
    seasonStats    : p(row.season_stats),
    attributes     : p(row.attributes),
    characteristics: p(row.characteristics),
  };
}

function savePlayer(playerId, tournamentId, seasonId, data) {
  if (!db || !data) return;
  db.prepare(`
    INSERT INTO player_cache
      (player_id, tournament_id, season_id, season_stats, attributes, characteristics, fetched_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(player_id, tournament_id, season_id) DO UPDATE SET
      season_stats=excluded.season_stats, attributes=excluded.attributes,
      characteristics=excluded.characteristics, fetched_at=excluded.fetched_at
  `).run(
    playerId, tournamentId, seasonId,
    j(data.seasonStats), j(data.attributes), j(data.characteristics),
    now()
  );
}

// ─── REFEREE CACHE ────────────────────────────────────────────────────────────

function getReferee(refereeId) {
  if (!db) return null;
  const row = db.prepare('SELECT stats, last_events, fetched_at FROM referee_cache WHERE referee_id=?').get(refereeId);
  if (!row || isStale(row.fetched_at, TTL.REFEREE)) return null;
  return { stats: p(row.stats), lastEvents: p(row.last_events) };
}

function saveReferee(refereeId, stats, lastEvents) {
  if (!db) return;
  db.prepare(`
    INSERT INTO referee_cache (referee_id, stats, last_events, fetched_at)
    VALUES (?,?,?,?)
    ON CONFLICT(referee_id) DO UPDATE SET
      stats=excluded.stats, last_events=excluded.last_events, fetched_at=excluded.fetched_at
  `).run(refereeId, j(stats), j(lastEvents), now());
}

// ─── MANAGER CACHE ────────────────────────────────────────────────────────────

function getManager(managerId) {
  if (!db) return null;
  const row = db.prepare('SELECT last_events, fetched_at FROM manager_cache WHERE manager_id=?').get(managerId);
  if (!row || isStale(row.fetched_at, TTL.MANAGER)) return null;
  return p(row.last_events);
}

function saveManager(managerId, lastEvents) {
  if (!db) return;
  db.prepare(`
    INSERT INTO manager_cache (manager_id, last_events, fetched_at)
    VALUES (?,?,?)
    ON CONFLICT(manager_id) DO UPDATE SET
      last_events=excluded.last_events, fetched_at=excluded.fetched_at
  `).run(managerId, j(lastEvents), now());
}

// ─── WEATHER CACHE ────────────────────────────────────────────────────────────

function getWeather(lat, lon, matchDate) {
  if (!db) return null;
  const row = db.prepare(`
    SELECT metrics, fetched_at FROM weather_cache
    WHERE lat=? AND lon=? AND match_date=?
  `).get(lat, lon, matchDate);
  if (!row) return null;
  // Geçmiş tarih → kalıcı; gelecek → 3h TTL
  const today = new Date().toISOString().split('T')[0];
  const ttl = matchDate < today ? TTL.PERMANENT : TTL.WEATHER_FUTURE;
  if (isStale(row.fetched_at, ttl)) return null;
  return p(row.metrics);
}

function saveWeather(lat, lon, matchDate, metrics) {
  if (!db || !metrics) return;
  db.prepare(`
    INSERT INTO weather_cache (lat, lon, match_date, metrics, fetched_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(lat, lon, match_date) DO UPDATE SET
      metrics=excluded.metrics, fetched_at=excluded.fetched_at
  `).run(lat, lon, matchDate, j(metrics), now());
}

// ─── ADMİN ────────────────────────────────────────────────────────────────────

function invalidateMatch(eventId) {
  if (!db) return;
  db.prepare('DELETE FROM matches WHERE event_id=?').run(eventId);
  db.prepare('DELETE FROM match_volatile WHERE event_id=?').run(eventId);
  db.prepare('DELETE FROM match_static WHERE event_id=?').run(eventId);
  console.log(`[MatchDB] invalidateMatch: ${eventId}`);
}

function invalidateAll() {
  if (!db) return;
  const tables = [
    'matches','match_volatile','match_static','team_cache','team_last_events',
    'team_recent_details','standings_cache','team_season_stats',
    'player_cache','referee_cache','manager_cache','weather_cache'
  ];
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
  console.log('[MatchDB] Tüm cache temizlendi.');
}

function getStats() {
  if (!db) return { enabled: false };
  const tables = [
    'matches','match_volatile','match_static','team_cache','team_last_events',
    'team_recent_details','standings_cache','team_season_stats',
    'player_cache','referee_cache','manager_cache','weather_cache'
  ];
  const counts = {};
  for (const t of tables) {
    counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  }
  let dbSizeBytes = 0;
  try { dbSizeBytes = fs.statSync(DB_PATH).size; } catch(_) {}
  return {
    enabled: true,
    dbPath: DB_PATH,
    dbSizeMB: (dbSizeBytes / 1024 / 1024).toFixed(2),
    counts,
    ttl: {
      standings_hours : TTL.STANDINGS / 3600,
      player_hours    : TTL.PLAYER / 3600,
      referee_hours   : TTL.REFEREE / 3600,
      manager_hours   : TTL.MANAGER / 3600,
      team_hours      : TTL.TEAM / 3600,
      team_events_hours: TTL.TEAM_EVENTS / 3600,
    }
  };
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
module.exports = {
  initDB,
  // team
  getTeam, saveTeam,
  getTeamLastEvents, saveTeamLastEvents,
  getRecentDetail, saveRecentDetail,
  // standings
  getStandings, saveStandings,
  // team season
  getTeamSeasonStats, saveTeamSeasonStats,
  // player
  getPlayer, savePlayer,
  // referee
  getReferee, saveReferee,
  // manager
  getManager, saveManager,
  // weather
  getWeather, saveWeather,
  // admin
  invalidateMatch, invalidateAll, getStats,
};
