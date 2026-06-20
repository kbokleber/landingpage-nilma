const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDb } = require('./db');

function adminPassword() {
  // Lazy require para evitar ciclo (auth.js -> settings.js -> auth.js)
  return require('./auth').getAdminPassword();
}

const DEFAULTS = {
  PORT: '3001',
  ADMIN_PASSWORD: 'nilma-admin',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  GOOGLE_REDIRECT_URI: 'http://127.0.0.1:3001/api/google/callback',
  BLOG_UPLOAD_MAX_MB: '5',
  INSTAGRAM_APP_ID: '',
  INSTAGRAM_APP_SECRET: '',
  INSTAGRAM_REDIRECT_URI: 'http://127.0.0.1:3001/api/instagram/callback',
  INSTAGRAM_PAGE_ID: '',
  INSTAGRAM_IG_USER_ID: '',
  INSTAGRAM_SYNC_INTERVAL_MIN: '30',
  INSTAGRAM_AUTO_IMPORT: '1',
  INSTAGRAM_AUTH_MODE: 'instagram',
};

const ENV_KEYS = {
  PORT: 'PORT',
  ADMIN_PASSWORD: 'ADMIN_PASSWORD',
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  GOOGLE_CLIENT_SECRET: 'GOOGLE_CLIENT_SECRET',
  GOOGLE_REDIRECT_URI: 'GOOGLE_REDIRECT_URI',
  BLOG_UPLOAD_MAX_MB: 'BLOG_UPLOAD_MAX_MB',
  INSTAGRAM_APP_ID: 'INSTAGRAM_APP_ID',
  INSTAGRAM_APP_SECRET: 'INSTAGRAM_APP_SECRET',
  INSTAGRAM_REDIRECT_URI: 'INSTAGRAM_REDIRECT_URI',
  INSTAGRAM_PAGE_ID: 'INSTAGRAM_PAGE_ID',
  INSTAGRAM_IG_USER_ID: 'INSTAGRAM_IG_USER_ID',
  INSTAGRAM_SYNC_INTERVAL_MIN: 'INSTAGRAM_SYNC_INTERVAL_MIN',
  INSTAGRAM_AUTO_IMPORT: 'INSTAGRAM_AUTO_IMPORT',
  INSTAGRAM_AUTH_MODE: 'INSTAGRAM_AUTH_MODE',
};

// ADMIN_PASSWORD fica em texto puro (para login funcionar sem dependência circular).
// GOOGLE_CLIENT_SECRET e INSTAGRAM_APP_SECRET são criptografados.
const SENSITIVE = new Set(['GOOGLE_CLIENT_SECRET', 'INSTAGRAM_APP_SECRET']);
const SECRETS_PREAMBLE = 'enc:v1:';

function deriveKey(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 32, { N: 16384, r: 8, p: 1 });
}

function encryptSecret(plain) {
  if (plain == null) plain = '';
  const password = adminPassword();
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return SECRETS_PREAMBLE + Buffer.concat([salt, iv, tag, ciphertext]).toString('base64');
}

function decryptSecret(stored) {
  if (typeof stored !== 'string' || !stored.startsWith(SECRETS_PREAMBLE)) {
    throw new Error('valor não está criptografado');
  }
  const buf = Buffer.from(stored.slice(SECRETS_PREAMBLE.length), 'base64');
  if (buf.length < 16 + 12 + 16) throw new Error('ciphertext inválido');
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const ciphertext = buf.subarray(44);
  const password = adminPassword();
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(SECRETS_PREAMBLE);
}

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
      const stored = SENSITIVE.has(dbKey) ? encryptSecret(value) : String(value);
      insert.run({ key: dbKey, value: stored });
    }
  });
  tx();
}

function migrateExistingPlaintextSecrets() {
  const db = getDb();
  const update = db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
  const decrypt = db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
  const tx = db.transaction(() => {
    for (const key of SENSITIVE) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      if (row && row.value && !isEncrypted(row.value)) {
        update.run(encryptSecret(row.value), key);
      }
    }
    // Correção: se ADMIN_PASSWORD foi criptografado por engano em alguma versão,
    // descriptografa e mantém em texto puro.
    const ap = db.prepare("SELECT value FROM settings WHERE key = 'ADMIN_PASSWORD'").get();
    if (ap && ap.value && isEncrypted(ap.value)) {
      try {
        const plain = decryptSecret(ap.value);
        if (plain) decrypt.run(plain, 'ADMIN_PASSWORD');
      } catch {}
    }
  });
  tx();
}

function ensureMigrated() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (row.c === 0) migrateFromEnv();
  migrateExistingPlaintextSecrets();
}

function get(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row && row.value != null && row.value !== '') {
    if (SENSITIVE.has(key)) {
      try {
        if (isEncrypted(row.value)) return decryptSecret(row.value);
        return row.value;
      } catch {
        return '';
      }
    }
    return row.value;
  }
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
    let value = '';
    let hasValue = false;
    if (row && row.value != null && row.value !== '') {
      hasValue = true;
      // Para sensíveis, nunca devolver o valor em getAll (precisa do /reveal)
      if (SENSITIVE.has(key)) {
        value = '';
      } else {
        value = row.value;
      }
    } else if (env[ENV_KEYS[key]]) {
      hasValue = true;
      value = SENSITIVE.has(key) ? '' : env[ENV_KEYS[key]];
    } else if (DEFAULTS[key]) {
      hasValue = true;
      value = SENSITIVE.has(key) ? '' : DEFAULTS[key];
    }
    return {
      key,
      value,
      hasValue,
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
      const raw = value == null ? '' : String(value);
      const stored = SENSITIVE.has(key) ? encryptSecret(raw) : raw;
      update.run({ key, value: stored });
    }
  });
  tx(values);
}

function revealSecret(key, password) {
  if (!SENSITIVE.has(key)) return { ok: false, error: 'Esta configuração não é sensível.' };
  if (typeof password !== 'string' || password === '') {
    return { ok: false, error: 'Senha é obrigatória.' };
  }
  if (password !== adminPassword()) {
    return { ok: false, error: 'Senha incorreta.' };
  }
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row || !row.value) {
    return { ok: false, error: 'Não há valor salvo para esta configuração.' };
  }
  try {
    const plain = isEncrypted(row.value) ? decryptSecret(row.value) : row.value;
    return { ok: true, key, value: plain };
  } catch (err) {
    return { ok: false, error: 'Não foi possível revelar. A senha do admin pode ter sido alterada desde que o valor foi salvo.' };
  }
}

module.exports = {
  DEFAULTS,
  ENV_KEYS,
  migrateFromEnv,
  ensureMigrated,
  get,
  getAll,
  setMany,
  revealSecret,
  SENSITIVE,
};
