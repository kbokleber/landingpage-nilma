const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..', '..');
const DB_DIR = path.join(ROOT, 'data');
const DEFAULT_DB_PATH = path.join(DB_DIR, 'blog.db');

function resolveDbPath() {
  let configured = '';
  try { configured = require('./settings').get('BLOG_DB_PATH') || ''; } catch {}
  if (configured) {
    if (path.isAbsolute(configured)) return configured;
    return path.join(ROOT, configured);
  }
  if (process.env.BLOG_DB_PATH) {
    return path.isAbsolute(process.env.BLOG_DB_PATH)
      ? process.env.BLOG_DB_PATH
      : path.join(ROOT, process.env.BLOG_DB_PATH);
  }
  return DEFAULT_DB_PATH;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

let _db = null;
let _dbPath = null;

function getDb() {
  if (_db) return _db;
  _dbPath = resolveDbPath();
  ensureDir(path.dirname(_dbPath));
  _db = new Database(_dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT,
      content_html TEXT NOT NULL,
      cover_image TEXT,
      author TEXT DEFAULT 'Dra. Nilma Alves',
      tags TEXT,
      status TEXT DEFAULT 'draft',
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at);

    CREATE TABLE IF NOT EXISTS post_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      alt TEXT,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_encrypted TEXT,
      prefix TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS instagram_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ig_media_id TEXT UNIQUE NOT NULL,
      ig_media_type TEXT,
      caption TEXT,
      permalink TEXT NOT NULL,
      media_url TEXT,
      thumbnail_url TEXT,
      local_path TEXT,
      timestamp DATETIME,
      hidden INTEGER DEFAULT 0,
      last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_instagram_posts_timestamp ON instagram_posts(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_instagram_posts_hidden ON instagram_posts(hidden);
  `);

  // Migrações idempotentes (ALTER TABLE seguro)
  const apiKeysCols = db.prepare("PRAGMA table_info(api_keys)").all();
  if (!apiKeysCols.find((c) => c.name === 'key_encrypted')) {
    db.exec('ALTER TABLE api_keys ADD COLUMN key_encrypted TEXT');
  }
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb, get dbPath() { return _dbPath || resolveDbPath(); } };
