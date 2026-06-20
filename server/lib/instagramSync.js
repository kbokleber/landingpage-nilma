const path = require('path');
const fs = require('fs');
const { getDb } = require('./db');
const { getUploadDir } = require('./upload');
const instagram = require('./instagram');
const settings = require('./settings');
const { readInstagramSyncMeta, writeInstagramSyncMeta } = require('./storage');

const TABLE = 'instagram_posts';

function rowToItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    igMediaId: row.ig_media_id,
    igMediaType: row.ig_media_type,
    caption: row.caption || '',
    permalink: row.permalink,
    mediaUrl: row.media_url,
    thumbnailUrl: row.thumbnail_url,
    localPath: row.local_path,
    timestamp: row.timestamp,
    hidden: !!row.hidden,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
  };
}

function getCachedRecent({ limit = 8, includeHidden = false } = {}) {
  const db = getDb();
  const where = includeHidden ? '' : 'WHERE hidden = 0';
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 8));
  const rows = db.prepare(`
    SELECT * FROM ${TABLE} ${where}
    ORDER BY COALESCE(timestamp, created_at) DESC
    LIMIT ?
  `).all(safeLimit);
  return rows.map(rowToItem);
}

function getByMediaId(igMediaId) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM ${TABLE} WHERE ig_media_id = ?`).get(igMediaId);
  return rowToItem(row);
}

function listAll({ limit = 100, offset = 0 } = {}) {
  const db = getDb();
  const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM ${TABLE}`).get().c;
  const rows = db.prepare(`
    SELECT * FROM ${TABLE}
    ORDER BY COALESCE(timestamp, created_at) DESC
    LIMIT ? OFFSET ?
  `).all(safeLimit, safeOffset);
  return { total, items: rows.map(rowToItem) };
}

function setHidden(id, hidden) {
  const db = getDb();
  const info = db.prepare(`UPDATE ${TABLE} SET hidden = ?, last_synced_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hidden ? 1 : 0, Number(id));
  return info.changes > 0;
}

function deleteById(id) {
  const db = getDb();
  const info = db.prepare(`DELETE FROM ${TABLE} WHERE id = ?`).run(Number(id));
  return info.changes > 0;
}

function inferExt(mediaUrl, mediaType) {
  if (mediaType === 'VIDEO' || mediaType === 'REEL') return '.mp4';
  const m = String(mediaUrl || '').match(/\.(jpe?g|png|webp|mp4)(\?|$)/i);
  if (m) return '.' + m[1].toLowerCase().replace('jpeg', 'jpg');
  return '.jpg';
}

async function syncInstagramPosts({ limit = 20 } = {}) {
  const result = { added: 0, updated: 0, skipped: 0, errors: [] };
  if (!instagram.isConnected()) {
    throw new Error('Instagram não está conectado. Conecte primeiro em Configurações.');
  }
  const data = await instagram.fetchRecentMedia({ limit });
  const items = data.items || [];
  const uploadDir = getUploadDir();

  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO ${TABLE} (
      ig_media_id, ig_media_type, caption, permalink,
      media_url, thumbnail_url, local_path, timestamp,
      hidden, last_synced_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const update = db.prepare(`
    UPDATE ${TABLE}
    SET caption = ?, media_url = ?, thumbnail_url = ?, timestamp = ?, last_synced_at = CURRENT_TIMESTAMP
    WHERE ig_media_id = ?
  `);
  const getById = db.prepare(`SELECT id, caption, media_url, local_path FROM ${TABLE} WHERE ig_media_id = ?`);

  for (const media of items) {
    try {
      const mediaUrl = media.media_url || media.thumbnail_url || null;
      const thumb = media.thumbnail_url || media.media_url || null;
      const existing = getById.get(media.id);

      if (existing) {
        // Atualiza caption/mídia se mudou
        if (
          (existing.caption || '') !== (media.caption || '') ||
          (existing.media_url || '') !== (mediaUrl || '')
        ) {
          // Atualiza também a mídia local se a URL mudou e ainda não temos local
          let localPath = existing.local_path;
          if (!localPath && mediaUrl) {
            try {
              const ext = inferExt(mediaUrl, media.media_type);
              const dest = path.join(uploadDir, `ig-${media.id}${ext}`);
              await instagram.downloadMedia(mediaUrl, dest);
              localPath = `/uploads/blog/ig-${media.id}${ext}`;
            } catch (e) {
              // Falha ao baixar não bloqueia update
            }
          }
          update.run(media.caption || '', mediaUrl, thumb, media.timestamp, media.id);
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      let localPath = null;
      if (mediaUrl) {
        try {
          const ext = inferExt(mediaUrl, media.media_type);
          const dest = path.join(uploadDir, `ig-${media.id}${ext}`);
          await instagram.downloadMedia(mediaUrl, dest);
          localPath = `/uploads/blog/ig-${media.id}${ext}`;
        } catch (e) {
          result.errors.push(`download ${media.id}: ${e.message}`);
        }
      }

      insert.run(
        media.id,
        media.media_type || null,
        media.caption || '',
        media.permalink || '',
        mediaUrl,
        thumb,
        localPath,
        media.timestamp || null
      );
      result.added += 1;
    } catch (err) {
      result.errors.push(`${media.id || 'unknown'}: ${err.message}`);
    }
  }

  // Metadados de sync
  const meta = readInstagramSyncMeta();
  writeInstagramSyncMeta({
    ...meta,
    lastSyncAt: new Date().toISOString(),
    lastResult: result,
    pageId: (() => { try { return settings.get('INSTAGRAM_PAGE_ID'); } catch { return null; } })(),
    igUserId: (() => { try { return settings.get('INSTAGRAM_IG_USER_ID'); } catch { return null; } })(),
  });

  return result;
}

let _intervalHandle = null;
let _running = false;

function startInstagramSyncCron() {
  if (_intervalHandle) return;
  // primeira execução após 30s
  setTimeout(() => {
    runIfDue().catch(() => {});
  }, 30 * 1000);
  // checa a cada minuto se está na hora
  _intervalHandle = setInterval(() => {
    runIfDue().catch(() => {});
  }, 60 * 1000);
}

async function runIfDue() {
  if (_running) return;
  try {
    let autoFlag = '1';
    let intervalMin = 30;
    try {
      autoFlag = settings.get('INSTAGRAM_AUTO_IMPORT') || '1';
      intervalMin = Number(settings.get('INSTAGRAM_SYNC_INTERVAL_MIN')) || 30;
    } catch {}
    if (autoFlag === '0' || autoFlag === 'false') return;
    if (!instagram.isConnected()) return;
    const meta = readInstagramSyncMeta();
    const last = meta.lastSyncAt ? new Date(meta.lastSyncAt).getTime() : 0;
    const due = Date.now() - last >= Math.max(5, intervalMin) * 60 * 1000;
    if (!due) return;
    _running = true;
    const res = await syncInstagramPosts({ limit: 20 });
    console.log(`[instagram] sync ok: +${res.added} novos, ~${res.updated} atualizados, ${res.skipped} sem mudança${res.errors.length ? `, ${res.errors.length} erros` : ''}`);
  } catch (err) {
    console.warn(`[instagram] sync falhou: ${err.message}`);
  } finally {
    _running = false;
  }
}

function stopInstagramSyncCron() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

module.exports = {
  getCachedRecent,
  getByMediaId,
  listAll,
  setHidden,
  deleteById,
  syncInstagramPosts,
  startInstagramSyncCron,
  stopInstagramSyncCron,
  runIfDue,
};
