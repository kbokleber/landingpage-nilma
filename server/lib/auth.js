const crypto = require('crypto');

const SESSIONS = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || 'nilma-admin';
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, { createdAt: Date.now() });
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const session = SESSIONS.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    SESSIONS.delete(token);
    return false;
  }
  return true;
}

function login(password) {
  if (password !== getAdminPassword()) {
    return null;
  }
  return createSession();
}

function logout(token) {
  SESSIONS.delete(token);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.admin_token;

  if (!validateSession(token)) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  req.adminToken = token;
  next();
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.admin_token;
}

module.exports = {
  login,
  logout,
  authMiddleware,
  validateSession,
  getTokenFromRequest,
};
