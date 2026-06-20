const express = require('express');
const { apiKeyMiddleware, rateLimit } = require('../lib/apiKey');
const { upload, UPLOAD_DIR } = require('../lib/upload');
const {
  listAllPosts,
  getPostBySlug,
  getPostById,
  getPostImages,
  createPost,
  updatePost,
  publishPost,
  deletePost,
  addPostImage,
  listTags,
} = require('../lib/posts');

const router = express.Router();

router.use(rateLimit({ windowMs: 60_000, max: 60 }));
router.use(apiKeyMiddleware);

router.get('/tags', (req, res) => {
  res.json({ tags: listTags() });
});

router.get('/posts', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const tag = req.query.tag || null;
  const { total, items } = listAllPosts({
    status: 'published',
    tag,
    limit,
    offset,
    includeDrafts: false,
  });
  res.json({ total, limit, offset, items });
});

router.get('/posts/:slug', (req, res) => {
  const post = getPostBySlug(req.params.slug);
  if (!post || post.status !== 'published') {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }
  const images = getPostImages(post.id);
  res.json({ ...post, images });
});

router.post('/posts', (req, res) => {
  const { title, excerpt, contentHtml, coverImage, author, tags, status } = req.body || {};
  if (!title || !contentHtml) {
    return res.status(400).json({ error: 'Campos obrigatórios: title, contentHtml.' });
  }
  // status é opcional. Padrão = draft. Sistemas externos podem enviar "published"
  // para criar já público (ex.: após aprovação em revisão).
  const allowedStatus = ['draft', 'published', 'archived'];
  const finalStatus = allowedStatus.includes(status) ? status : 'draft';
  const post = createPost({ title, excerpt, contentHtml, coverImage, author, tags, status: finalStatus });
  res.status(201).json(post);
});

router.put('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido.' });
  const { title, excerpt, contentHtml, coverImage, author, tags, status } = req.body || {};
  const post = updatePost(id, { title, excerpt, contentHtml, coverImage, author, tags, status });
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.delete('/posts/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido.' });
  const ok = deletePost(id);
  if (!ok) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true });
});

router.post('/posts/:id/publish', (req, res) => {
  const id = Number(req.params.id);
  const post = publishPost(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.post('/posts/:id/unpublish', (req, res) => {
  const id = Number(req.params.id);
  const post = updatePost(id, { status: 'draft' });
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.post('/posts/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const post = updatePost(id, { status: 'archived' });
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.post('/posts/:id/cover', upload.single('cover'), (req, res) => {
  const id = Number(req.params.id);
  const post = getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo de imagem é obrigatório.' });
  const url = `/uploads/blog/${req.file.filename}`;
  const updated = updatePost(id, { coverImage: url });
  res.status(201).json({ coverImage: url, post: updated });
});

router.post('/posts/:id/images', upload.single('image'), (req, res) => {
  const id = Number(req.params.id);
  const post = getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  if (!req.file) return res.status(400).json({ error: 'Arquivo de imagem é obrigatório.' });
  const alt = (req.body && req.body.alt) || '';
  const filename = req.file.filename;
  const url = `/uploads/blog/${filename}`;
  const image = addPostImage(id, { url, alt });
  res.status(201).json(image);
});

module.exports = router;
