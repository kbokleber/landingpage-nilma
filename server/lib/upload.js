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
  return Number(configured || 5);
}

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.]/g, '') || '.jpg';
    const base = sanitizeName(path.basename(file.originalname, path.extname(file.originalname || '')));
    const id = crypto.randomBytes(6).toString('hex');
    cb(null, `${Date.now()}-${base}-${id}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    return cb(new Error('Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

function getUploadDir() {
  if (!UPLOAD_DIR) { UPLOAD_DIR = resolveUploadDir(); ensureDir(); }
  return UPLOAD_DIR;
}

function getMaxMb() {
  if (!MAX_MB) MAX_MB = resolveMaxMb();
  return MAX_MB;
}

module.exports = {
  upload,
  get getUploadDir() { return getUploadDir(); },
  get getMaxMb() { return getMaxMb(); },
};
