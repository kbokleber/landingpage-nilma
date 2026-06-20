const path = require('path');
const fs = require('fs');
const { getDb } = require('./db');

const DEFAULTS = {
  PORT: '3001',
  ADMIN_PASSWORD: 'nilma-admin',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3001/api/google/callback',
  GBP_LOCATION_NAME: '',
  BLOG_DB_PATH: '',
  BLOG_UPLOAD_DIR: '',
  BLOG_UPLOAD_MAX_MB: '5',
};

const ENV_KEYS = {
  PORT: 'PORT',
  ADMIN_PASSWORD: 'ADMIN_PASSWORD',
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  GOOGLE_CLIENT_SECRET: 'GOOGLE_CLIENT_SECRET',
  GOOGLE_REDIRECT_URI: 'GOOGLE_REDIRECT_URI',
  GBP_LOCATION_NAME: 'GBP_LOCATION_NAME',
  BLOG_DB_PATH: 'BLOG_DB_PATH',
  BLOG_UPLOAD_DIR: 'BLOG_UPLOAD_DIR',
  BLOG_UPLOAD_MAX_MB: 'BLOG_UPLOAD_MAX_MB',
};

const SENSITIVE = new Set(['ADMIN_PASSWORD', 'GOOGLE_CLIENT_SECRET']);

function readDotEnv(envPath) {
  const map = {};
  if (!fs.existsSync(envPath)) return map;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function migrateFromEnv() {
  const db = getDb();
  const envPath = path.join(__dirname, '..', '..', '.env');
  const env = { ...readDotEnv(envPath), ...process.env };
  const insert = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO NOTHING
  `);
  const get = db.prepare('SELECT value FROM settings WHERE key = ?');
  const tx = db.transaction(() => {
    for (const [dbKey, envKey] of Object.entries(ENV_KEYS)) {
      const exists = get.get(dbKey);
      if (exists) continue;
      let value = env[envKey];
      if (value == null || value === '') value = DEFAULTS[dbKey] ?? '';
      insert.run({ key: dbKey, value: String(value) });
    }
  });
  tx();
}

function ensureMigrated() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (row.c === 0) migrateFromEnv();
  else migrateFromEnv();
}

function get(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value !== null && row.value !== '') return row.value;
  const envVal = process.env[ENV_KEYS[key]];
  if (envVal != null && envVal !== '') return envVal;
  return DEFAULTS[key] ?? '';
}

function getAll() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key').all();
  const env = { ...readDotEnv(path.join(__dirname, '..', '..', '.env')), ...process.env };
  const items = Object.keys(DEFAULTS).map((key) => {
    const row = rows.find((r) => r.key === key);
    const value = row ? row.value : (env[ENV_KEYS[key]] || DEFAULTS[key] || '');
    return {
      key,
      value: value || '',
      source: row ? 'database' : (env[ENV_KEYS[key]] ? 'env' : 'default'),
      sensitive: SENSITIVE.has(key),
      updatedAt: row ? row.updated_at : null,
    };
  });
  return items;
}

function setMany(values) {
  const db = getDb();
  const update = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const allowed = new Set(Object.keys(DEFAULTS));
  const tx = db.transaction((entries) => {
    for (const { key, value } of entries) {
      if (!allowed.has(key)) continue;
      update.run({ key, value: value == null ? '' : String(value) });
    }
  });
  tx(values);
}

function getSecret(key) {
  return get(key);
}

module.exports = {
  DEFAULTS,
  ENV_KEYS,
  migrateFromEnv,
  ensureMigrated,
  get,
  getAll,
  setMany,
  getSecret,
  SENSITIVE,
};
