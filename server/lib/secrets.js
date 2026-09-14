const crypto = require('crypto');

function readLegacyAdminPasswordFromDb() {
  try {
    const { getDb } = require('./db');
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('ADMIN_PASSWORD');
    if (row && row.value && !String(row.value).startsWith('enc:v1:')) {
      return String(row.value);
    }
  } catch {}
  return process.env.ADMIN_PASSWORD || '';
}

/**
 * Chave dedicada para criptografar API keys / secrets.
 * Não usa a senha do usuário (trocar senha não quebra chaves).
 */
function getSecretsKey() {
  if (process.env.SECRETS_KEY && String(process.env.SECRETS_KEY).trim()) {
    return String(process.env.SECRETS_KEY).trim();
  }

  let settings;
  try {
    settings = require('./settings');
  } catch {
    settings = null;
  }

  if (settings) {
    try {
      const existing = settings.getRaw
        ? settings.getRaw('SECRETS_KEY')
        : null;
      if (existing && String(existing).trim()) return String(existing).trim();
      const viaGet = settings.get('SECRETS_KEY');
      if (viaGet && String(viaGet).trim()) return String(viaGet).trim();
    } catch {}
  }

  const legacy = readLegacyAdminPasswordFromDb();
  const key = legacy && legacy !== 'nilma-admin'
    ? legacy
    : crypto.randomBytes(32).toString('hex');

  if (settings && settings.setMany) {
    try {
      settings.setMany([{ key: 'SECRETS_KEY', value: key }]);
    } catch {}
  }

  return key;
}

module.exports = { getSecretsKey };
