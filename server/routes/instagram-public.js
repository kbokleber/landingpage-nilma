const express = require('express');
const instagram = require('../lib/instagram');
const sync = require('../lib/instagramSync');
const settings = require('../lib/settings');

const router = express.Router();

// Cache em memória: { ts: number, data: [...] }
let _cache = null;
const CACHE_MS = 5 * 60 * 1000; // 5 min

router.get('/instagram/recent', (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 8));
  const now = Date.now();
  if (_cache && _cache.limit === limit && now - _cache.ts < CACHE_MS) {
    return res.json({ items: _cache.data, cached: true });
  }
  const items = sync.getCachedRecent({ limit, includeHidden: false });
  const data = items.map((it) => ({
    id: it.id,
    igMediaType: it.igMediaType,
    caption: it.caption,
    permalink: it.permalink,
    mediaUrl: it.mediaUrl,
    thumbnailUrl: it.thumbnailUrl,
    localPath: it.localPath,
    timestamp: it.timestamp,
  }));
  _cache = { ts: now, limit, data };
  res.json({ items: data, cached: false });
});

router.get('/instagram/profile', (_req, res) => {
  let pageName = null, igUserId = null;
  try { igUserId = settings.get('INSTAGRAM_IG_USER_ID') || null; } catch {}
  try {
    const { readInstagramTokens } = require('../storage');
    const t = readInstagramTokens();
    if (t) {
      pageName = t.page_name || null;
    }
  } catch {}
  res.json({
    username: 'advnilmaalves',
    pageName,
    igUserId,
    connected: instagram.isConnected(),
  });
});

module.exports = router;
