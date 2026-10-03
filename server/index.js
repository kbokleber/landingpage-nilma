require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const { readDraft, writeDraft, writePublic, ensureReviewsSynced, newId } = require('./lib/storage');
const { markFieldEdited, buildPublicFromDraft } = require('./lib/merge');
const {
  login,
  logout,
  authMiddleware,
  getTokenFromRequest,
  validateSession,
  getSession,
} = require('./lib/auth');
const users = require('./lib/users');

const { getDb } = require('./lib/db');
const settings = require('./lib/settings');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./openapi');
const postsApiRouter = require('./routes/posts');
const reviewsApiRouter = require('./routes/reviews');
const publicPostsRouter = require('./routes/public-posts');
const publicReviewsRouter = require('./routes/public-reviews');
const adminPostsRouter = require('./routes/admin-posts');
const adminApiKeysRouter = require('./routes/admin-api-keys');
const adminSettingsRouter = require('./routes/admin-settings');
const adminUsersRouter = require('./routes/admin-users');
const editorConfigRouter = require('./routes/editor-config');

settings.ensureMigrated();
getDb();
users.ensureBootstrapAdmin();
// Garante SECRETS_KEY persistida (criptografia de API keys)
require('./lib/secrets').getSecretsKey();
// Reconcilia depoimentos: volume Docker (draft) ↔ JSON público (site)
ensureReviewsSynced();

const ROOT = path.join(__dirname, '..');
const app = express();
const PORT = (() => {
  try { return Number(settings.get('PORT')) || 3001; } catch { return Number(process.env.PORT) || 3001; }
})();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(ROOT, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));
app.use('/uploads/blog', express.static(path.join(ROOT, 'data', 'uploads', 'blog')));

app.get('/api/docs/openapi.json', (req, res) => res.json(openapiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Nilma Alves — Blog & Depoimentos API',
  swaggerOptions: { url: '/api/docs/openapi.json' },
}));
app.use('/api/public', publicPostsRouter);
app.use('/api/public', publicReviewsRouter);
app.use('/api/public', editorConfigRouter);
app.use('/api/v1', postsApiRouter);
app.use('/api/v1', reviewsApiRouter);
app.use('/api/admin', adminPostsRouter);
app.use('/api/admin', adminApiKeysRouter);
app.use('/api/admin', adminSettingsRouter);
app.use('/api/admin', adminUsersRouter);

app.get('/api/admin/diag', authMiddleware, (req, res) => {
  const { dbPath } = require('./lib/db');
  res.json({
    ok: true,
    dbPath,
    cwd: process.cwd(),
    env: {
      PORT: process.env.PORT || null,
      BLOG_DB_PATH: process.env.BLOG_DB_PATH || null,
    },
    uptimeSec: Math.round(process.uptime()),
  });
});

app.post('/api/admin/reset-password', (req, res) => {
  const expected = process.env.ADMIN_RESET_TOKEN || '';
  const provided = String(req.body?.token || '');
  const newPassword = String(req.body?.newPassword || '');
  const username = String(req.body?.username || 'admin').trim();
  if (!expected) {
    return res.status(503).json({ error: 'Reset desabilitado. Defina ADMIN_RESET_TOKEN no .env para habilitar.' });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Nova senha deve ter pelo menos 8 caracteres.' });
  }
  try {
    const row = users.findByUsername(username);
    if (!row) {
      users.createUser({ username, password: newPassword, name: 'Administrador', role: 'admin' });
    } else {
      users.updatePassword(row.id, newPassword);
    }
    res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao redefinir senha: ' + err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const username = req.body?.username || req.body?.user || '';
  const password = req.body?.password || '';
  const result = login(username, password);
  if (!result) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }
  res.cookie('admin_token', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true, token: result.token, user: result.user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getTokenFromRequest(req);
  if (token) logout(token);
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = getTokenFromRequest(req);
  const session = getSession(token);
  if (!session) {
    return res.json({ authenticated: false });
  }
  const row = users.findById(session.userId);
  res.json({
    authenticated: true,
    user: users.toPublicUser(row),
  });
});

app.get('/api/draft', authMiddleware, (_req, res) => {
  // Garante que itens publicados no site voltem a aparecer no admin
  res.json(ensureReviewsSynced());
});

app.put('/api/draft', authMiddleware, (req, res) => {
  const draft = req.body;
  if (!draft || !Array.isArray(draft.items)) {
    return res.status(400).json({ error: 'Rascunho inválido.' });
  }
  writeDraft(draft);
  res.json(draft);
});

app.post('/api/draft/items', authMiddleware, (req, res) => {
  const draft = readDraft();
  const { author, text, rating, area, visible, siteStatus } = req.body || {};
  if (!author?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Autor e texto são obrigatórios.' });
  }

  const finalSiteStatus = siteStatus === 'published' ? 'published' : 'draft';
  const maxOrder = draft.items.reduce((max, item) => Math.max(max, item.order || 0), 0);
  draft.items.push({
    id: newId(),
    source: 'manual',
    author: author.trim(),
    authorUrl: '',
    rating: Number(rating) || 5,
    text: text.trim(),
    textOriginal: text.trim(),
    area: area ? String(area).trim() : '',
    publishedAt: new Date().toISOString().split('T')[0],
    visible: visible === undefined ? true : Boolean(visible),
    siteStatus: finalSiteStatus,
    order: maxOrder + 1,
    editedFields: ['text', 'author'],
    status: 'active',
  });

  writeDraft(draft);

  if (finalSiteStatus === 'published') {
    writePublic(buildPublicFromDraft(draft));
  }

  res.json(draft);
});

app.patch('/api/draft/items/:id', authMiddleware, (req, res) => {
  const draft = readDraft();
  const item = draft.items.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }

  const { author, text, rating, visible, order, area, siteStatus } = req.body || {};

  if (author != null && author !== item.author) {
    item.author = author;
    markFieldEdited(item, 'author');
  }
  if (text != null && text !== item.text) {
    item.text = text;
    markFieldEdited(item, 'text');
  }
  if (rating != null && Number(rating) !== item.rating) {
    item.rating = Number(rating);
    markFieldEdited(item, 'rating');
  }
  if (visible != null && visible !== item.visible) {
    item.visible = Boolean(visible);
    markFieldEdited(item, 'visible');
  }
  if (order != null && order !== item.order) {
    item.order = Number(order);
    markFieldEdited(item, 'order');
  }
  if (area != null) {
    item.area = String(area).trim();
  }
  if (siteStatus === 'draft' || siteStatus === 'published') {
    item.siteStatus = siteStatus;
    if (siteStatus === 'published') {
      item.visible = true;
      item.publishedAt = item.publishedAt || new Date().toISOString().split('T')[0];
    }
  }

  writeDraft(draft);

  if (siteStatus === 'published' || siteStatus === 'draft') {
    writePublic(buildPublicFromDraft(draft));
  }

  res.json(draft);
});

app.post('/api/draft/items/:id/publish', authMiddleware, (req, res) => {
  const draft = readDraft();
  const item = draft.items.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }
  item.siteStatus = 'published';
  item.visible = true;
  item.publishedAt = item.publishedAt || new Date().toISOString().split('T')[0];
  writeDraft(draft);
  const publicData = buildPublicFromDraft(draft);
  writePublic(publicData);
  res.json({ draft, public: publicData });
});

app.post('/api/draft/items/:id/unpublish', authMiddleware, (req, res) => {
  const draft = readDraft();
  const item = draft.items.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }
  item.siteStatus = 'draft';
  writeDraft(draft);
  const publicData = buildPublicFromDraft(draft);
  writePublic(publicData);
  res.json({ draft, public: publicData });
});

app.delete('/api/draft/items/:id', authMiddleware, (req, res) => {
  const draft = readDraft();
  const before = draft.items.length;
  draft.items = draft.items.filter((i) => i.id !== req.params.id);
  if (draft.items.length === before) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }
  writeDraft(draft);
  writePublic(buildPublicFromDraft(draft));
  res.json(draft);
});

app.post('/api/publish', authMiddleware, (_req, res) => {
  const draft = readDraft();
  const publicData = buildPublicFromDraft(draft);
  writePublic(publicData);
  res.json({ ok: true, public: publicData });
});

app.use((err, req, res, next) => {
  console.error('ERR_STACK:', err.stack || err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

app.listen(PORT, () => {
  const { dbPath } = require('./lib/db');
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin/`);
  console.log(`Banco SQLite: ${dbPath}`);
});
