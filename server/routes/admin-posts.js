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

router.post('/posts', (req, res) => {
  const { title, excerpt, contentHtml, coverImage, author, tags, status } = req.body || {};
  if (!title || !contentHtml) {
    return res.status(400).json({ error: 'Campos obrigatórios: title, contentHtml.' });
  }
  const post = createPost({ title, excerpt, contentHtml, coverImage, author, tags, status });
  res.status(201).json(post);
});

router.put('/posts/:id', (req, res) => {
  const post = updatePost(Number(req.params.id), req.body || {});
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.post('/posts/:id/publish', (req, res) => {
  const post = publishPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json(post);
});

router.delete('/posts/:id', (req, res) => {
  const ok = deletePost(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true });
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
