require('dotenv').config();
const express = require('express');
const fs = require('fs');
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
const { getPostBySlug, listPublishedSitemapEntries } = require('./lib/posts');
const uploads = require('./lib/upload');
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
const repairedCovers = uploads.repairStoredImages(getDb());
if (repairedCovers.length) {
  console.log(`Capas do blog renomeadas com extensão: ${repairedCovers.length}`);
}

const ROOT = path.join(__dirname, '..');
const SITE_ORIGIN = 'https://nilmaalves.adv.br';
const POST_SEO_RE = /<!-- post-seo -->[\s\S]*?<!-- \/post-seo -->/;
const app = express();
const PORT = (() => {
  try { return Number(settings.get('PORT')) || 3001; } catch { return Number(process.env.PORT) || 3001; }
})();

function requestHost(req) {
  const raw = req.headers['x-forwarded-host'] || req.headers.host || '';
  return String(raw).split(',')[0].trim().split(':')[0].toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function metaDescription(post) {
  const text = stripHtml(post.excerpt) || stripHtml(post.contentHtml) || 'Artigo do blog Nilma Alves Advocacia.';
  if (text.length <= 160) return text;
  const cut = text.slice(0, 157);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function absoluteAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `${SITE_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
}

function renderPostSeo(post, slug) {
  const title = `${post.title} | Nilma Alves Advocacia`;
  const description = metaDescription(post);
  const pageUrl = `${SITE_ORIGIN}/post.html?slug=${encodeURIComponent(slug)}`;
  const image = absoluteAssetUrl(post.coverImage);
  const imageTag = image ? `\n  <meta property="og:image" content="${escapeHtml(image)}">` : '';
  return `<!-- post-seo -->
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Nilma Alves Advocacia">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">${imageTag}
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <!-- /post-seo -->`;
}

app.use((req, res, next) => {
  if (requestHost(req) !== 'dev.nilmaalves.adv.br') return next();
  res.redirect(301, `${SITE_ORIGIN}${req.originalUrl || '/'}`);
});

app.get('/post.html', (req, res, next) => {
  const slug = String(req.query.slug || '').trim();
  let html;
  try {
    html = fs.readFileSync(path.join(ROOT, 'post.html'), 'utf8');
  } catch (err) {
    return next(err);
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!slug) return res.send(html);
  try {
    const post = getPostBySlug(slug);
    if (!post || post.status !== 'published') {
      res.status(404);
      return res.send(html);
    }
    if (!POST_SEO_RE.test(html)) return res.send(html);
    return res.send(html.replace(POST_SEO_RE, renderPostSeo(post, slug)));
  } catch (err) {
    return next(err);
  }
});

function xmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.get('/sitemap.xml', (req, res) => {
  const base = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const articles = listPublishedSitemapEntries().map((entry) => {
    const loc = `${SITE_ORIGIN}/post.html?slug=${encodeURIComponent(entry.slug)}`;
    const day = String(entry.updatedAt || '').slice(0, 10);
    const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(day) ? `\n    <lastmod>${day}</lastmod>` : '';
    return `  <url>\n    <loc>${xmlEscape(loc)}</loc>${lastmod}\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
  }).join('\n');
  const xml = articles ? base.replace('</urlset>', `${articles}\n</urlset>`) : base;
  res.type('application/xml');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(xml);
});

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
app.use('/uploads/blog', (req, res, next) => {
  let rel = '';
  try { rel = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return next(); }
  if (!rel || rel.includes('..') || uploads.extensionFromName(rel)) return next();
  const dir = uploads.getUploadDir;
  const stem = rel.endsWith('.') ? rel.slice(0, -1) : rel;
  for (const ext of ['.jpg', '.png', '.webp', '.gif']) {
    if (fs.existsSync(path.join(dir, `${stem}${ext}`))) {
      return res.redirect(301, `/uploads/blog/${stem}${ext}`);
    }
  }
  next();
});
app.use('/uploads/blog', express.static(uploads.getUploadDir, {
  setHeaders(res, filePath) {
    const type = uploads.contentTypeForFile(filePath);
    if (type) res.setHeader('Content-Type', type);
  },
}));

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
