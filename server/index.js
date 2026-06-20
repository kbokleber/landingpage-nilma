require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const { readDraft, writeDraft, writePublic, newId, writeGbpSettings } = require('./lib/storage');
const { mergeGoogleReviews, markFieldEdited, buildPublicFromDraft } = require('./lib/merge');
const {
  login,
  logout,
  authMiddleware,
  getTokenFromRequest,
  validateSession,
} = require('./lib/auth');
const {
  getAuthUrl,
  handleOAuthCallback,
  fetchAllGoogleReviews,
  listGoogleLocations,
  getLocationName,
  isOAuthConfigured,
  isGoogleConfigured,
  isGoogleConnected,
} = require('./lib/google');

const ROOT = path.join(__dirname, '..');
const app = express();
const PORT = (() => {
  try { return Number(settings.get('PORT')) || 3001; } catch { return Number(process.env.PORT) || 3001; }
})();

const { getDb } = require('./lib/db');
const settings = require('./lib/settings');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('./openapi');
const postsApiRouter = require('./routes/posts');
const publicPostsRouter = require('./routes/public-posts');
const adminPostsRouter = require('./routes/admin-posts');
const adminApiKeysRouter = require('./routes/admin-api-keys');
const adminSettingsRouter = require('./routes/admin-settings');
const adminInstagramRouter = require('./routes/instagram');
const publicInstagramRouter = require('./routes/instagram-public');
const instagramCallbackRouter = require('./routes/instagram-callback');
const instagramSync = require('./lib/instagramSync');

settings.ensureMigrated();
getDb();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(ROOT));
app.use('/uploads/blog', express.static(path.join(ROOT, 'data', 'uploads', 'blog')));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Nilma Alves — Blog API',
}));
app.get('/api/docs/openapi.json', (req, res) => res.json(openapiSpec));
app.use('/api/public', publicPostsRouter);
app.use('/api/public', publicInstagramRouter);
app.use('/api/v1', postsApiRouter);
app.use('/api/admin', adminPostsRouter);
app.use('/api/admin', adminApiKeysRouter);
app.use('/api/admin', adminSettingsRouter);
app.use('/api/admin', adminInstagramRouter);

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
  if (!expected) {
    return res.status(503).json({ error: 'Reset desabilitado. Defina ADMIN_RESET_TOKEN no .env para habilitar.' });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Token inválido.' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Nova senha deve ter pelo menos 4 caracteres.' });
  }
  try {
    const { getDb } = require('./lib/db');
    const db = getDb();
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run('ADMIN_PASSWORD', newPassword);
    res.json({ ok: true, message: 'Senha redefinida com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao redefinir senha: ' + err.message });
  }
});
app.use('/api/instagram', instagramCallbackRouter);

app.post('/api/auth/login', (req, res) => {
  const token = login(req.body?.password || '');
  if (!token) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  res.cookie('admin_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ ok: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getTokenFromRequest(req);
  if (token) logout(token);
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = getTokenFromRequest(req);
  res.json({ authenticated: validateSession(token) });
});

app.get('/api/google/status', authMiddleware, (_req, res) => {
  const locationName = getLocationName();
  res.json({
    oauthConfigured: isOAuthConfigured(),
    configured: isGoogleConfigured(),
    connected: isGoogleConnected(),
    locationName,
    locationConfigured: Boolean(locationName),
  });
});

app.get('/api/google/locations', authMiddleware, async (_req, res) => {
  try {
    const locations = await listGoogleLocations();
    res.json({ locations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/google/location', authMiddleware, (req, res) => {
  const { locationName } = req.body || {};
  if (!locationName?.trim()) {
    return res.status(400).json({ error: 'Selecione um estabelecimento.' });
  }
  writeGbpSettings({ locationName: locationName.trim() });
  res.json({ ok: true, locationName: locationName.trim() });
});

app.get('/api/google/connect', authMiddleware, (_req, res) => {
  try {
    res.json({ url: getAuthUrl() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect('/admin/?google=error');
  }
  try {
    await handleOAuthCallback(code);
    res.redirect('/admin/?google=connected');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/?google=error');
  }
});

app.get('/api/draft', authMiddleware, (_req, res) => {
  res.json(readDraft());
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
  const { author, text, rating } = req.body || {};
  if (!author?.trim() || !text?.trim()) {
    return res.status(400).json({ error: 'Autor e texto são obrigatórios.' });
  }

  const maxOrder = draft.items.reduce((max, item) => Math.max(max, item.order || 0), 0);
  draft.items.push({
    id: newId(),
    source: 'manual',
    author: author.trim(),
    authorUrl: '',
    rating: Number(rating) || 5,
    text: text.trim(),
    textOriginal: text.trim(),
    publishedAt: new Date().toISOString().split('T')[0],
    visible: true,
    order: maxOrder + 1,
    editedFields: ['text', 'author'],
    status: 'active',
  });

  writeDraft(draft);
  res.json(draft);
});

app.patch('/api/draft/items/:id', authMiddleware, (req, res) => {
  const draft = readDraft();
  const item = draft.items.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Depoimento não encontrado.' });
  }

  const { author, text, rating, visible, order } = req.body || {};

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

  writeDraft(draft);
  res.json(draft);
});

app.post('/api/sync', authMiddleware, async (_req, res) => {
  try {
    const googlePayload = await fetchAllGoogleReviews();
    const draft = readDraft();
    const summary = mergeGoogleReviews(draft, googlePayload);
    writeDraft(draft);
    res.json({ draft, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
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
  console.log(`Servidor em http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin/`);
  // Cron do Instagram: sincroniza periodicamente se estiver conectado
  try {
    instagramSync.startInstagramSyncCron();
    console.log(`[instagram] cron ativo (verifica a cada 60s)`);
  } catch (err) {
    console.warn(`[instagram] cron não pôde iniciar: ${err.message}`);
  }
});
