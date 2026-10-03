const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { upload } = require('../lib/upload');
const {
  listAllPosts,
  getPostById,
  getPostImages,
  createPost,
  updatePost,
  publishPost,
  deletePost,
  addPostImage,
  deletePostImage,
} = require('../lib/posts');

const router = express.Router();
router.use(authMiddleware);

function readMultipartBody(req) {
  const rawTitle = req.body?.title;
  const rawExcerpt = req.body?.excerpt;
  const rawContent = req.body?.contentHtml;
  const rawAuthor = req.body?.author;
  const rawTags = req.body?.tags;
  const rawStatus = req.body?.status;

  const title = typeof rawTitle === 'string' ? rawTitle : '';
  const excerpt = typeof rawExcerpt === 'string' ? rawExcerpt : '';
  const contentHtml = typeof rawContent === 'string' ? rawContent : '';
  const author = typeof rawAuthor === 'string' ? rawAuthor : '';

  let tags;
  if (typeof rawTags === 'string') {
    const trimmed = rawTags.trim();
    if (!trimmed) tags = [];
    else if (trimmed.startsWith('[')) {
      try { tags = JSON.parse(trimmed); } catch { tags = trimmed.split(',').map((t) => t.trim()).filter(Boolean); }
    } else {
      tags = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  const status = typeof rawStatus === 'string' ? rawStatus : undefined;

  return { title, excerpt, contentHtml, author, tags, status };
}

function cleanUpFiles(req) {
  if (req.file?.path) {
    try { require('fs').unlinkSync(req.file.path); } catch {}
  }
}

router.get('/posts', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const status = req.query.status || null;
  const tag = req.query.tag || null;
  const dateFrom = req.query.dateFrom || null;
  const dateTo = req.query.dateTo || null;
  const { total, items } = listAllPosts({ status, tag, dateFrom, dateTo, limit, offset, includeDrafts: true });
  res.json({ total, limit, offset, items });
});

router.get('/posts/:id', (req, res) => {
  const post = getPostById(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  const images = getPostImages(post.id);
  res.json({ ...post, images });
});

router.post('/posts', upload.single('cover'), (req, res) => {
  try {
    const { title, excerpt, contentHtml, author, tags, status } = readMultipartBody(req);
    if (!title || !contentHtml) {
      cleanUpFiles(req);
      return res.status(400).json({ error: 'Campos obrigatórios: title, contentHtml.' });
    }
    const coverImage = req.file ? `/uploads/blog/${req.file.filename}` : '';
    const post = createPost({ title, excerpt, contentHtml, coverImage, author, tags, status });
    if (req.file) {
      post.coverImageUploaded = true;
    }
    res.status(201).json(post);
  } catch (err) {
    cleanUpFiles(req);
    res.status(400).json({ error: err.message });
  }
});

router.put('/posts/:id', upload.single('cover'), (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, excerpt, contentHtml, author, tags, status } = readMultipartBody(req);
    const body = { title, excerpt, contentHtml, author, tags };
    if (status) body.status = status;
    if (req.file) body.coverImage = `/uploads/blog/${req.file.filename}`;
    const post = updatePost(id, body);
    if (!post) {
      cleanUpFiles(req);
      return res.status(404).json({ error: 'Post não encontrado.' });
    }
    res.json(post);
  } catch (err) {
    cleanUpFiles(req);
    res.status(400).json({ error: err.message });
  }
});

router.post('/posts/:id/publish', (req, res) => {
  const post = publishPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.post('/posts/normalize-all', (_req, res) => {
  try {
    const { getDb } = require('../lib/db');
    const { sanitizeContent, normalizeContent } = require('../lib/posts');
    const db = getDb();
    const rows = db.prepare("SELECT id, content_html FROM posts").all();
    const update = db.prepare("UPDATE posts SET content_html = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    let updated = 0;
    let skipped = 0;
    const tx = db.transaction((items) => {
      for (const r of items) {
        const original = r.content_html || '';
        const normalized = sanitizeContent(normalizeContent(original));
        if (normalized !== original) {
          update.run(normalized, r.id);
          updated += 1;
        } else {
          skipped += 1;
        }
      }
    });
    tx(rows);
    res.json({ total: rows.length, updated, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/posts/:id', (req, res) => {
  const ok = deletePost(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true });
});

router.post('/posts/:id/cover', upload.single('cover'), (req, res) => {
  const id = Number(req.params.id);
  const post = getPostById(id);
  if (!post) {
    cleanUpFiles(req);
    return res.status(404).json({ error: 'Post não encontrado.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Arquivo de imagem é obrigatório.' });
  const url = `/uploads/blog/${req.file.filename}`;
  const updated = updatePost(id, { coverImage: url });
  res.status(201).json({ coverImage: url, post: updated });
});

router.post('/posts/:id/images', upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const post = getPostById(id);
  if (!post) {
    cleanUpFiles(req);
    return res.status(404).json({ error: 'Post não encontrado.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Arquivo de imagem é obrigatório.' });
  const alt = (req.body && req.body.alt) || '';
  const url = `/uploads/blog/${req.file.filename}`;
  const image = addPostImage(id, { url, alt });
  res.status(201).json(image);
});

router.delete('/post-images/:imageId', (req, res) => {
  const ok = deletePostImage(Number(req.params.imageId));
  if (!ok) return res.status(404).json({ error: 'Imagem não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;