const express = require('express');
const { authMiddleware } = require('../lib/auth');
const instagram = require('../lib/instagram');
const sync = require('../lib/instagramSync');
const settings = require('../lib/settings');
const { readInstagramSyncMeta } = require('../lib/storage');

const router = express.Router();
router.use(authMiddleware);

router.get('/instagram/status', (_req, res) => {
  const meta = readInstagramSyncMeta();
  let pageId = null, igUserId = null;
  try { pageId = settings.get('INSTAGRAM_PAGE_ID') || null; } catch {}
  try { igUserId = settings.get('INSTAGRAM_IG_USER_ID') || null; } catch {}
  res.json({
    configured: instagram.isConfigured(),
    connected: instagram.isConnected(),
    pageId,
    igUserId,
    autoImport: (() => { try { return settings.get('INSTAGRAM_AUTO_IMPORT') || '1'; } catch { return '1'; } })(),
    intervalMin: (() => { try { return Number(settings.get('INSTAGRAM_SYNC_INTERVAL_MIN')) || 30; } catch { return 30; } })(),
    lastSyncAt: meta.lastSyncAt || null,
    lastResult: meta.lastResult || null,
  });
});

router.get('/instagram/connect', (_req, res) => {
  try {
    if (!instagram.isConfigured()) {
      return res.status(400).json({ error: 'Preencha INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET em Configurações primeiro.' });
    }
    const url = instagram.buildAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/instagram/disconnect', (_req, res) => {
  try {
    instagram.disconnect();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/instagram/sync', async (_req, res) => {
  try {
    if (!instagram.isConnected()) {
      return res.status(400).json({ error: 'Instagram não está conectado.' });
    }
    const limit = Math.min(50, Math.max(1, Number(_req.body?.limit) || 20));
    const result = await sync.syncInstagramPosts({ limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/instagram/posts', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const data = sync.listAll({ limit, offset });
  res.json(data);
});

router.post('/instagram/posts/:id/hide', (req, res) => {
  const ok = sync.setHidden(req.params.id, true);
  if (!ok) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true });
});

router.post('/instagram/posts/:id/show', (req, res) => {
  const ok = sync.setHidden(req.params.id, false);
  if (!ok) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true });
});

router.delete('/instagram/posts/:id', (req, res) => {
  const ok = sync.deleteById(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Post não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
