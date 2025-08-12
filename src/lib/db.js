const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH =
  process.env.SQLITE_PATH ||
  path.join(__dirname, "../../data/links-shortener.sqlite");

let dbInstance;

function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
  }
  return dbInstance;
}

function ensureDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = getDb();
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL,
      owner_id INTEGER,
      total_clicks INTEGER DEFAULT 0,
      first_clicked_at DATETIME NULL,
      last_clicked_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS link_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      referer TEXT,
      user_agent TEXT,
      accept_language TEXT,
      is_bot INTEGER DEFAULT 0,
      ip_trunc TEXT,
      ip_hash TEXT,
      geo_country TEXT,
      device TEXT,
      os TEXT,
      browser TEXT,
      FOREIGN KEY(link_id) REFERENCES links(id)
    );
    CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id ON link_clicks(link_id);
    CREATE INDEX IF NOT EXISTS idx_link_clicks_clicked_at ON link_clicks(clicked_at);
  `);

  // Asegurar columnas nuevas en 'links' si la DB existía antes
  const cols = db.prepare("PRAGMA table_info(links)").all();
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("total_clicks")) {
    db.exec("ALTER TABLE links ADD COLUMN total_clicks INTEGER DEFAULT 0");
  }
  if (!colNames.has("first_clicked_at")) {
    db.exec("ALTER TABLE links ADD COLUMN first_clicked_at DATETIME NULL");
  }
  if (!colNames.has("last_clicked_at")) {
    db.exec("ALTER TABLE links ADD COLUMN last_clicked_at DATETIME NULL");
  }
}

module.exports = { getDb, ensureDb };
