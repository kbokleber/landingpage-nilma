const express = require('express');
const { apiKeyMiddleware, rateLimit } = require('../lib/apiKey');
const { readDraft, writeDraft, writePublic, newId } = require('../lib/storage');
const { buildPublicFromDraft, markFieldEdited, normalizeSiteStatus } = require('../lib/merge');

const router = express.Router();

router.use(rateLimit({ windowMs: 60_000, max: 60 }));
router.use(apiKeyMiddleware);

function clampRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function nextOrder(items) {
  if (!items.length) return 1;
  return Math.max(...items.map((i) => i.order || 0)) + 1;
}

function toApiItem(item) {
  return {
    id: item.id,
    author: item.author,
    authorName: item.author,
    authorUrl: item.authorUrl || '',
    rating: item.rating,
    text: item.text,
    publishedAt: item.publishedAt,
    date: item.publishedAt,
    area: item.area || '',
    source: item.source || 'api',
    visible: item.visible !== false,
    order: item.order || 0,
    status: item.status || 'active',
    siteStatus: normalizeSiteStatus(item),
  };
}

function republish(draft) {
  const publicData = buildPublicFromDraft(draft);
  writePublic(publicData);
  return publicData;
}

router.get('/reviews', (req, res) => {
  const draft = readDraft();
  const statusFilter = String(req.query.status || req.query.siteStatus || 'all').toLowerCase();
  let items = Array.isArray(draft.items) ? draft.items.slice() : [];

  if (statusFilter === 'draft' || statusFilter === 'published') {
    items = items.filter((i) => normalizeSiteStatus(i) === statusFilter);
  }

  items.sort((a, b) => (a.order || 0) - (b.order || 0));
  res.json({
    total: items.length,
    rating: draft.rating,
    totalReviews: draft.totalReviews,
    updatedAt: draft.updatedAt,
    items: items.map(toApiItem),
  });
});

router.post('/reviews/publish', (_req, res) => {
  const draft = readDraft();
  const publicData = republish(draft);
  res.json({ ok: true, total: publicData.items.length, public: publicData });
});

router.get('/reviews/:id', (req, res) => {
  const draft = readDraft();
  const item = (draft.items || []).find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Depoimento nao encontrado.' });
  res.json(toApiItem(item));
});

router.post('/reviews', (req, res) => {
  const draft = readDraft();
  if (!Array.isArray(draft.items)) draft.items = [];

  const { author, text, rating, area, visible, publish, authorName, status, siteStatus } = req.body || {};
  const finalAuthor = String(author || authorName || '').trim();
  const finalText = String(text || '').trim();
  if (!finalAuthor || !finalText) {
    return res.status(400).json({ error: 'Campos obrigatorios: author (ou authorName) e text.' });
  }

  const wantPublish = publish === true || publish === '1' || publish === 1
    || status === 'published' || siteStatus === 'published';
  const finalSiteStatus = wantPublish ? 'published' : 'draft';

  const item = {
    id: newId(),
    source: 'api',
    author: finalAuthor,
    authorUrl: '',
    rating: clampRating(rating),
    text: finalText,
    textOriginal: finalText,
    area: area ? String(area).trim() : '',
    publishedAt: new Date().toISOString().split('T')[0],
    visible: visible === undefined ? true : Boolean(visible),
    siteStatus: finalSiteStatus,
    order: nextOrder(draft.items),
    editedFields: ['text', 'author'],
    status: 'active',
  };

  draft.items.push(item);
  writeDraft(draft);

  let publicData = null;
  if (finalSiteStatus === 'published') {
    publicData = republish(draft);
  }

  res.status(201).json({
    item: toApiItem(item),
    published: Boolean(publicData),
    public: publicData,
  });
});

router.put('/reviews/:id', (req, res) => {
  const draft = readDraft();
  const item = (draft.items || []).find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Depoimento nao encontrado.' });

  const { author, authorName, text, rating, visible, order, area, status, siteStatus, publish } = req.body || {};

  if (author != null || authorName != null) {
    const nextAuthor = String(author || authorName || '').trim();
    if (nextAuthor && nextAuthor !== item.author) {
      item.author = nextAuthor;
      markFieldEdited(item, 'author');
    }
  }
  if (text != null && String(text) !== item.text) {
    item.text = String(text).trim();
    markFieldEdited(item, 'text');
  }
  if (rating != null && clampRating(rating) !== item.rating) {
    item.rating = clampRating(rating);
    markFieldEdited(item, 'rating');
  }
  if (visible != null && Boolean(visible) !== item.visible) {
    item.visible = Boolean(visible);
    markFieldEdited(item, 'visible');
  }
  if (order != null && Number(order) !== item.order) {
    item.order = Number(order);
    markFieldEdited(item, 'order');
  }
  if (area != null) item.area = String(area).trim();

  if (publish === true || status === 'published' || siteStatus === 'published') {
    item.siteStatus = 'published';
    item.visible = true;
  } else if (status === 'draft' || siteStatus === 'draft') {
    item.siteStatus = 'draft';
  }

  writeDraft(draft);
  const publicData = republish(draft);
  res.json({ item: toApiItem(item), public: publicData });
});

router.post('/reviews/:id/publish', (req, res) => {
  const draft = readDraft();
  const item = (draft.items || []).find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Depoimento nao encontrado.' });
  item.siteStatus = 'published';
  item.visible = true;
  item.publishedAt = item.publishedAt || new Date().toISOString().split('T')[0];
  writeDraft(draft);
  const publicData = republish(draft);
  res.json({ item: toApiItem(item), public: publicData });
});

router.post('/reviews/:id/unpublish', (req, res) => {
  const draft = readDraft();
  const item = (draft.items || []).find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Depoimento nao encontrado.' });
  item.siteStatus = 'draft';
  writeDraft(draft);
  const publicData = republish(draft);
  res.json({ item: toApiItem(item), public: publicData });
});

router.delete('/reviews/:id', (req, res) => {
  const draft = readDraft();
  const before = (draft.items || []).length;
  draft.items = (draft.items || []).filter((i) => i.id !== req.params.id);
  if (draft.items.length === before) {
    return res.status(404).json({ error: 'Depoimento nao encontrado.' });
  }
  writeDraft(draft);
  republish(draft);
  res.json({ ok: true });
});

module.exports = router;
