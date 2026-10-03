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

function getExt(filename) {
  return path.extname(String(filename || '')).toLowerCase().replace(/[^.]/g, '');
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
    const ext = getExt(file.originalname) || '.jpg';
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

module.exports = {
  upload,
  get getUploadDir() { return getUploadDir(); },
  get getMaxMb() { return getMaxMb(); },
  getAllowedFormats,
  isImageFile,
};