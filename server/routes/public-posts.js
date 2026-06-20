const express = require('express');
const { listAllPosts, getPostBySlug, getPostImages, listTags } = require('../lib/posts');

const router = express.Router();

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
  const safeItems = items.map((p) => ({ ...p, contentHtml: undefined }));
  res.json({ total, limit, offset, items: safeItems });
});

router.get('/posts/:slug', (req, res) => {
  const post = getPostBySlug(req.params.slug);
  if (!post || post.status !== 'published') {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }
  const images = getPostImages(post.id);
  res.json({ ...post, images });
});

router.get('/tags', (req, res) => {
  res.json({ tags: listTags() });
});

module.exports = router;
