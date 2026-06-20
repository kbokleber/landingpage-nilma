const sanitizeHtml = require('sanitize-html');
const { getDb } = require('./db');

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'blockquote', 'pre', 'code', 'img', 'figure', 'figcaption',
  'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
];

const SANITIZE_OPTS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    '*': ['class', 'id'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
  },
};

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function sanitizeContent(html) {
  return sanitizeHtml(String(html || ''), SANITIZE_OPTS);
}

function uniqueSlug(base, ignoreId = null) {
  const db = getDb();
  const slug = base || 'post';
  let candidate = slug;
  let counter = 1;
  while (true) {
    const existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(candidate);
    if (!existing || existing.id === ignoreId) return candidate;
    counter += 1;
    candidate = `${slug}-${counter}`;
  }
}

function parseTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return value.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}

function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || '',
    contentHtml: row.content_html,
    coverImage: row.cover_image || '',
    author: row.author || 'Dra. Nilma Alves',
    tags: parseTags(row.tags),
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listAllPosts({ status = null, tag = null, limit = 20, offset = 0, includeDrafts = true, dateFrom = null, dateTo = null } = {}) {
  const db = getDb();
  const where = [];
  const params = {};
  if (status) { where.push('status = @status'); params.status = status; }
  else if (!includeDrafts) { where.push("status = 'published'"); }
  if (tag) { where.push('tags LIKE @tag'); params.tag = `%"${tag}"%`; }
  if (dateFrom) { where.push('date(created_at) >= @dateFrom'); params.dateFrom = dateFrom; }
  if (dateTo) { where.push('date(created_at) <= @dateTo'); params.dateTo = dateTo; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM posts ${whereSql}`).get(params);
  const rows = db.prepare(`
    SELECT * FROM posts ${whereSql}
    ORDER BY COALESCE(published_at, created_at) DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });
  return {
    total: totalRow.c,
    items: rows.map(rowToPost),
  };
}

function getPostBySlug(slug) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug);
  return rowToPost(row);
}

function getPostById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  return rowToPost(row);
}

function getPostImages(postId) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY position, id').all(postId);
  return rows.map((r) => ({ id: r.id, url: r.url, alt: r.alt || '', position: r.position }));
}

function createPost({ title, excerpt, contentHtml, coverImage, author, tags, status }) {
  const db = getDb();
  const baseSlug = slugify(title);
  const slug = uniqueSlug(baseSlug);
  const safeContent = sanitizeContent(contentHtml);
  const tagsJson = JSON.stringify(parseTags(tags));
  const finalStatus = status === 'published' ? 'published' : 'draft';
  const publishedAt = finalStatus === 'published' ? new Date().toISOString() : null;
  const stmt = db.prepare(`
    INSERT INTO posts (slug, title, excerpt, content_html, cover_image, author, tags, status, published_at, created_at, updated_at)
    VALUES (@slug, @title, @excerpt, @contentHtml, @coverImage, @author, @tags, @status, @publishedAt, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const info = stmt.run({
    slug,
    title: title.trim(),
    excerpt: excerpt || '',
    contentHtml: safeContent,
    coverImage: coverImage || '',
    author: author || 'Dra. Nilma Alves',
    tags: tagsJson,
    status: finalStatus,
    publishedAt,
  });
  return getPostById(info.lastInsertRowid);
}

function updatePost(id, { title, excerpt, contentHtml, coverImage, author, tags, status }) {
  const db = getDb();
  const existing = getPostById(id);
  if (!existing) return null;
  const newTitle = title != null ? title : existing.title;
  let newSlug = existing.slug;
  if (title && title !== existing.title) {
    newSlug = uniqueSlug(slugify(title), id);
  }
  const fields = {
    slug: newSlug,
    title: newTitle,
    excerpt: excerpt != null ? excerpt : existing.excerpt,
    contentHtml: contentHtml != null ? sanitizeContent(contentHtml) : existing.contentHtml,
    coverImage: coverImage != null ? coverImage : existing.coverImage,
    author: author != null ? author : existing.author,
    tags: tags != null ? JSON.stringify(parseTags(tags)) : JSON.stringify(existing.tags),
    status: existing.status,
    publishedAt: existing.publishedAt,
  };
  if (status === 'published' && existing.status !== 'published') {
    fields.status = 'published';
    fields.publishedAt = new Date().toISOString();
  } else if (status === 'draft' || status === 'archived') {
    fields.status = status;
  }
  db.prepare(`
    UPDATE posts SET
      slug = @slug,
      title = @title,
      excerpt = @excerpt,
      content_html = @contentHtml,
      cover_image = @coverImage,
      author = @author,
      tags = @tags,
      status = @status,
      published_at = @publishedAt,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ ...fields, id });
  return getPostById(id);
}

function publishPost(id) {
  const db = getDb();
  const existing = getPostById(id);
  if (!existing) return null;
  db.prepare(`
    UPDATE posts SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
  return getPostById(id);
}

function deletePost(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM posts WHERE id = ?').run(id);
  return info.changes > 0;
}

function addPostImage(postId, { url, alt, position }) {
  const db = getDb();
  const pos = position != null ? Number(position) : Date.now();
  const info = db.prepare(`
    INSERT INTO post_images (post_id, url, alt, position) VALUES (?, ?, ?, ?)
  `).run(postId, url, alt || '', pos);
  return { id: info.lastInsertRowid, url, alt: alt || '', position: pos };
}

function deletePostImage(imageId) {
  const db = getDb();
  const info = db.prepare('DELETE FROM post_images WHERE id = ?').run(imageId);
  return info.changes > 0;
}

function listTags() {
  const db = getDb();
  const rows = db.prepare("SELECT tags FROM posts WHERE tags IS NOT NULL AND tags != ''").all();
  const set = new Set();
  for (const r of rows) {
    parseTags(r.tags).forEach((t) => set.add(t));
  }
  return Array.from(set).sort();
}

module.exports = {
  slugify,
  sanitizeContent,
  listAllPosts,
  getPostBySlug,
  getPostById,
  getPostImages,
  createPost,
  updatePost,
  publishPost,
  deletePost,
  addPostImage,
  deletePostImage,
  listTags,
};
