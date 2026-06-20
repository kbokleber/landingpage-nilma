const crypto = require('crypto');
const { getDb } = require('./db');
const { getAdminPassword } = require('./auth');

const KEY_PREFIX = 'nilma_';

function generateKey() {
  const random = crypto.randomBytes(32).toString('hex');
  return `${KEY_PREFIX}${random}`;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function deriveKey(password, salt) {
  return crypto.scryptSync(String(password || ''), salt, 32, { N: 16384, r: 8, p: 1 });
}

function encryptForAdmin(plaintext) {
  const password = getAdminPassword();
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ciphertext]).toString('base64');
}

function decryptForAdmin(b64) {
  const password = getAdminPassword();
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (buf.length < 16 + 12 + 16) throw new Error('ciphertext inválido');
  const salt = buf.subarray(0, 16);
  const iv = buf.subarray(16, 28);
  const tag = buf.subarray(28, 44);
  const ciphertext = buf.subarray(44);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

function createApiKey(name) {
  const db = getDb();
  const cleanName = (name || 'Default').toString().trim().slice(0, 80) || 'Default';
  const key = generateKey();
  const keyHash = hashKey(key);
  const prefix = key.slice(0, KEY_PREFIX.length + 8);
  const keyEncrypted = encryptForAdmin(key);
  const info = db.prepare(`
    INSERT INTO api_keys (name, key_hash, prefix, key_encrypted) VALUES (?, ?, ?, ?)
  `).run(cleanName, keyHash, prefix, keyEncrypted);
  return {
    id: info.lastInsertRowid,
    name: cleanName,
    prefix,
    key,
  };
}

function listApiKeys() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, prefix, created_at, last_used_at
    FROM api_keys ORDER BY id DESC
  `).all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }));
}

function deleteApiKey(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  return info.changes > 0;
}

function revealApiKey(id, password) {
  if (typeof password !== 'string' || password === '') {
    return { ok: false, error: 'Senha é obrigatória.' };
  }
  if (password !== getAdminPassword()) {
    return { ok: false, error: 'Senha incorreta.' };
  }
  const db = getDb();
  const row = db.prepare('SELECT id, name, prefix, key_encrypted FROM api_keys WHERE id = ?').get(id);
  if (!row || !row.key_encrypted) {
    return { ok: false, error: 'Chave não encontrada ou sem valor armazenado.' };
  }
  try {
    const key = decryptForAdmin(row.key_encrypted);
    return { ok: true, id: row.id, name: row.name, prefix: row.prefix, key };
  } catch (err) {
    return { ok: false, error: 'Não foi possível revelar a chave. A senha do admin pode ter sido alterada desde a criação.' };
  }
}

function verifyApiKey(key) {
  if (!key || typeof key !== 'string') return null;
  const db = getDb();
  const keyHash = hashKey(key);
  const row = db.prepare(`
    SELECT id, name, prefix FROM api_keys
    WHERE key_hash = ? LIMIT 1
  `).get(keyHash);
  if (!row) return null;
  db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
  return { id: row.id, name: row.name, prefix: row.prefix };
}

const _buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'global';
    const now = Date.now();
    const bucket = _buckets.get(ip) || { start: now, count: 0 };
    if (now - bucket.start > windowMs) {
      bucket.start = now;
      bucket.count = 0;
    }
    bucket.count += 1;
    _buckets.set(ip, bucket);
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    }
    next();
  };
}

function apiKeyMiddleware(req, res, next) {
  const key = req.headers['x-api-key'];
  const result = verifyApiKey(key);
  if (!result) {
    return res.status(401).json({ error: 'API Key inválida.' });
  }
  req.apiKey = result;
  next();
}

module.exports = {
  generateKey,
  hashKey,
  encryptForAdmin,
  decryptForAdmin,
  createApiKey,
  listApiKeys,
  deleteApiKey,
  revealApiKey,
  revokeApiKey: deleteApiKey,
  verifyApiKey,
  apiKeyMiddleware,
  rateLimit,
};
