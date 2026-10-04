const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_UPLOAD_DIR = path.join(ROOT, 'data', 'uploads', 'blog');

function resolveUploadDir() {
  let configured = '';
  try { configured = require('./settings').get('BLOG_UPLOAD_DIR') || ''; } catch {}
  if (!configured && process.env.BLOG_UPLOAD_DIR) configured = process.env.BLOG_UPLOAD_DIR;
  if (!configured) configured = DEFAULT_UPLOAD_DIR;
  return path.isAbsolute(configured) ? configured : path.join(ROOT, configured);
}

function resolveMaxMb() {
  let configured = '';
  try { configured = require('./settings').get('BLOG_UPLOAD_MAX_MB') || ''; } catch {}
  if (!configured && process.env.BLOG_UPLOAD_MAX_MB) configured = process.env.BLOG_UPLOAD_MAX_MB;
  return Number(configured || 10);
}

const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/pjpeg',
  'image/png', 'image/x-png',
  'image/webp', 'image/x-webp',
  'image/gif',
  'image/bmp', 'image/x-bmp',
  'image/tiff', 'image/tif',
  'image/svg+xml',
  'image/avif', 'image/x-avif',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
  'image/x-icon', 'image/vnd.microsoft.icon',
  'image/apng',
]);

const ALLOWED_EXTS = new Set([
  '.jpg', '.jpeg', '.jfif',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif', '.tiff',
  '.svg',
  '.avif',
  '.heic', '.heif',
  '.ico',
  '.apng',
]);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/x-png': '.png',
  'image/webp': '.webp',
  'image/x-webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/x-bmp': '.bmp',
  'image/tiff': '.tif',
  'image/tif': '.tif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/x-avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/heic-sequence': '.heic',
  'image/heif-sequence': '.heif',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/apng': '.png',
};

function extensionFromName(filename) {
  const raw = path.extname(String(filename || '')).toLowerCase();
  if (raw === '.jpg' || raw === '.jpeg' || raw === '.jfif') return '.jpg';
  if (raw === '.png' || raw === '.apng') return '.png';
  if (raw === '.tiff') return '.tif';
  if (ALLOWED_EXTS.has(raw)) return raw;
  return '';
}

function getExt(filename, mimetype) {
  return extensionFromName(filename) || MIME_TO_EXT[String(mimetype || '').toLowerCase()] || '';
}

function sniffImage(buffer) {
  if (!buffer || buffer.length < 3) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: '.png', mime: 'image/png' };
  }
  if (buffer.length >= 6 && buffer.slice(0, 3).toString('ascii') === 'GIF') return { ext: '.gif', mime: 'image/gif' };
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { ext: '.webp', mime: 'image/webp' };
  }
  return null;
}

function isImageFile(file) {
  if (!file) return false;
  const mime = String(file.mimetype || '').toLowerCase();
  const ext = getExt(file.originalname);
  if (ALLOWED_MIMES.has(mime)) return true;
  if (mime.startsWith('image/')) return true;
  if (mime === 'application/octet-stream' && ALLOWED_EXTS.has(ext)) return true;
  if (!mime && ALLOWED_EXTS.has(ext)) return true;
  return false;
}

let UPLOAD_DIR = null;
let MAX_MB = null;

function ensureDir() {
  UPLOAD_DIR = resolveUploadDir();
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function sanitizeName(name) {
  return String(name || 'image')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureDir();
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = getExt(file.originalname, file.mimetype) || '.jpg';
    const base = sanitizeName(path.basename(file.originalname, path.extname(file.originalname || '')));
    const id = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${base}-${id}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!isImageFile(file)) {
    const ext = getExt(file.originalname);
    const extLabel = ext ? ext.replace(/^\./, '').toUpperCase() : 'sem extensão';
    return cb(new Error(`Tipo de arquivo não permitido (.${extLabel}). Formatos aceitos: JPEG, PNG, WebP, GIF, BMP, TIFF, SVG, AVIF, HEIC/HEIF, ICO.`));
  }
  cb(null, true);
};

function buildUpload() {
  const mb = resolveMaxMb();
  const maxBytes = mb * 1024 * 1024;
  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxBytes, files: 6 },
  });
}

const upload = buildUpload();

function getUploadDir() {
  if (!UPLOAD_DIR) { UPLOAD_DIR = resolveUploadDir(); ensureDir(); }
  return UPLOAD_DIR;
}

function getMaxMb() {
  if (MAX_MB == null) MAX_MB = resolveMaxMb();
  return MAX_MB;
}

function getAllowedFormats() {
  return Array.from(ALLOWED_EXTS).map((e) => e.replace(/^\./, '').toUpperCase()).join(', ');
}

function mimeFromExtension(ext) {
  const normalized = String(ext || '').toLowerCase();
  if (normalized === '.jpg' || normalized === '.jpeg' || normalized === '.jfif') return 'image/jpeg';
  if (normalized === '.png' || normalized === '.apng') return 'image/png';
  if (normalized === '.webp') return 'image/webp';
  if (normalized === '.gif') return 'image/gif';
  if (normalized === '.bmp') return 'image/bmp';
  if (normalized === '.tif' || normalized === '.tiff') return 'image/tiff';
  if (normalized === '.svg') return 'image/svg+xml';
  if (normalized === '.avif') return 'image/avif';
  if (normalized === '.ico') return 'image/x-icon';
  if (normalized === '.heic' || normalized === '.heif') return 'image/heic';
  return '';
}

function contentTypeForFile(filePath) {
  const fromName = mimeFromExtension(path.extname(filePath));
  if (fromName) return fromName;
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    return sniffImage(buf)?.mime || '';
  } catch {
    return '';
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function repairStoredImages(db) {
  const dir = getUploadDir();
  const names = fs.readdirSync(dir);
  const replacements = [];
  for (const name of names) {
    if (extensionFromName(name)) continue;
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isFile()) continue;
    let fd;
    let sniffed = null;
    try {
      fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(16);
      fs.readSync(fd, buf, 0, 16, 0);
      sniffed = sniffImage(buf);
    } catch {
      continue;
    } finally {
      if (fd != null) fs.closeSync(fd);
    }
    if (!sniffed) continue;
    const stem = name.endsWith('.') ? name.slice(0, -1) : name;
    const nextName = `${stem}${sniffed.ext}`;
    const nextPath = path.join(dir, nextName);
    if (nextName === name || fs.existsSync(nextPath)) continue;
    fs.renameSync(full, nextPath);
    replacements.push({
      from: `/uploads/blog/${name}`,
      to: `/uploads/blog/${nextName}`,
    });
  }
  if (db && replacements.length) {
    const updateCover = db.prepare('UPDATE posts SET cover_image = REPLACE(cover_image, ?, ?) WHERE cover_image LIKE ?');
    const updateHtml = db.prepare('UPDATE posts SET content_html = REPLACE(content_html, ?, ?) WHERE content_html LIKE ?');
    const updateImages = db.prepare('UPDATE post_images SET url = REPLACE(url, ?, ?) WHERE url LIKE ?');
    const tx = db.transaction(() => {
      for (const { from, to } of replacements) {
        updateCover.run(from, to, `%${from}%`);
        updateHtml.run(from, to, `%${from}%`);
        updateImages.run(from, to, `%${from}%`);
      }
    });
    tx();
  }
  return replacements;
}

module.exports = {
  upload,
  get getUploadDir() { return getUploadDir(); },
  get getMaxMb() { return getMaxMb(); },
  getAllowedFormats,
  isImageFile,
  contentTypeForFile,
  extensionFromName,
  repairStoredImages,
};