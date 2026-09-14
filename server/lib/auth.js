const crypto = require('crypto');
const users = require('./users');

const SESSIONS = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(token, {
    createdAt: Date.now(),
    userId: user.id,
    username: user.username,
    role: user.role,
  });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const session = SESSIONS.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    SESSIONS.delete(token);
    return null;
  }
  return session;
}

function validateSession(token) {
  return Boolean(getSession(token));
}

function login(username, password) {
  const row = users.findByUsername(username);
  if (!row || row.active === 0) return null;
  if (!users.verifyPassword(password, row.password_hash)) return null;
  users.touchLogin(row.id);
  const publicUser = users.toPublicUser(row);
  const token = createSession(publicUser);
  return { token, user: publicUser };
}

function logout(token) {
  SESSIONS.delete(token);
}

function invalidateUserSessions(userId) {
  for (const [token, session] of SESSIONS.entries()) {
    if (session.userId === userId) SESSIONS.delete(token);
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.admin_token;
  const session = getSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  req.adminToken = token;
  req.user = {
    id: session.userId,
    username: session.username,
    role: session.role,
  };
  next();
}

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.admin_token;
}

/** @deprecated use getSecretsKey — mantido para imports antigos */
function getAdminPassword() {
  return require('./secrets').getSecretsKey();
}

module.exports = {
  login,
  logout,
  authMiddleware,
  validateSession,
  getSession,
  getTokenFromRequest,
  getAdminPassword,
  invalidateUserSessions,
  createSession,
};
