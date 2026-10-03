const crypto = require('crypto');
const { getDb } = require('./db');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const HASH_PREFIX = 'scrypt:v1:';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 32, SCRYPT_OPTS);
  return HASH_PREFIX + Buffer.concat([salt, derived]).toString('base64');
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith(HASH_PREFIX)) return false;
  try {
    const buf = Buffer.from(stored.slice(HASH_PREFIX.length), 'base64');
    if (buf.length !== 48) return false;
    const salt = buf.subarray(0, 16);
    const expected = buf.subarray(16);
    const actual = crypto.scryptSync(String(password), salt, 32, SCRYPT_OPTS);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name || row.username,
    role: row.role || 'admin',
    active: row.active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || null,
  };
}

function countUsers() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
}

function findByUsername(username) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(String(username || '').trim());
}

function findById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function listUsers() {
  const db = getDb();
  return db.prepare(`
    SELECT id, username, name, role, active, created_at, updated_at, last_login_at
    FROM users ORDER BY id ASC
  `).all().map(toPublicUser);
}

function createUser({ username, password, name, role = 'admin' }) {
  const cleanUser = String(username || '').trim().toLowerCase();
  const cleanPass = String(password || '');
  if (!cleanUser || cleanUser.length < 3) {
    throw new Error('Usuário deve ter pelo menos 3 caracteres.');
  }
  if (!/^[a-z0-9._-]+$/.test(cleanUser)) {
    throw new Error('Usuário: use apenas letras, números, ponto, hífen ou sublinhado.');
  }
  if (cleanPass.length < 8) {
    throw new Error('Senha deve ter pelo menos 8 caracteres.');
  }
  const db = getDb();
  if (findByUsername(cleanUser)) {
    throw new Error('Este usuário já existe.');
  }
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, name, role, active)
    VALUES (?, ?, ?, ?, 1)
  `).run(cleanUser, hashPassword(cleanPass), String(name || cleanUser).trim(), role === 'admin' ? 'admin' : 'editor');
  return toPublicUser(findById(info.lastInsertRowid));
}

function updatePassword(userId, newPassword) {
  const cleanPass = String(newPassword || '');
  if (cleanPass.length < 8) {
    throw new Error('Senha deve ter pelo menos 8 caracteres.');
  }
  const db = getDb();
  const row = findById(userId);
  if (!row) throw new Error('Usuário não encontrado.');
  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(hashPassword(cleanPass), userId);
  return toPublicUser(findById(userId));
}

function setActive(userId, active) {
  const db = getDb();
  const row = findById(userId);
  if (!row) throw new Error('Usuário não encontrado.');
  db.prepare(`
    UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(active ? 1 : 0, userId);
  return toPublicUser(findById(userId));
}

function deleteUser(userId) {
  const db = getDb();
  const row = findById(userId);
  if (!row) throw new Error('Usuário não encontrado.');
  const admins = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1`).get().c;
  if (row.role === 'admin' && row.active && admins <= 1) {
    throw new Error('Não é possível remover o último administrador ativo.');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return true;
}

function touchLogin(userId) {
  const db = getDb();
  db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
}

function readLegacyPlainPassword() {
  try {
    const settings = require('./settings');
    const fromDb = settings.getRaw('ADMIN_PASSWORD');
    if (fromDb && typeof fromDb === 'string' && fromDb && !String(fromDb).startsWith('enc:v1:')) {
      return fromDb;
    }
  } catch {}
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }
  return null;
}

/**
 * Garante pelo menos um usuário admin.
 * Migra senha legada de settings/env; se não houver, gera senha aleatória (logada uma vez).
 */
function ensureBootstrapAdmin() {
  if (countUsers() > 0) return { created: false };

  let password = readLegacyPlainPassword();
  let generated = false;
  // Se a única senha conhecida for o default público antigo, gera uma nova
  if (!password || password === 'nilma-admin') {
    password = crypto.randomBytes(9).toString('base64url');
    generated = true;
  }

  const user = createUser({
    username: 'admin',
    password,
    name: 'Administrador',
    role: 'admin',
  });

  // Remove senha plaintext das settings (não usar mais para login)
  try {
    const db = getDb();
    db.prepare('DELETE FROM settings WHERE key = ?').run('ADMIN_PASSWORD');
  } catch {}

  if (generated) {
    console.warn('');
    console.warn('════════════════════════════════════════════════════════');
    console.warn('  Usuário admin criado (senha gerada — guarde agora):');
    console.warn(`  usuário: admin`);
    console.warn(`  senha:   ${password}`);
    console.warn('  Troque a senha em Admin → Usuários após o login.');
    console.warn('════════════════════════════════════════════════════════');
    console.warn('');
  } else {
    console.log('[auth] Usuário admin migrado a partir da senha anterior (settings/env).');
  }

  return { created: true, user, generated, password: generated ? password : undefined };
}

module.exports = {
  hashPassword,
  verifyPassword,
  countUsers,
  findByUsername,
  findById,
  listUsers,
  createUser,
  updatePassword,
  setActive,
  deleteUser,
  touchLogin,
  toPublicUser,
  ensureBootstrapAdmin,
  readLegacyPlainPassword,
};
