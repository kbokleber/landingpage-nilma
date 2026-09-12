const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DRAFT_PATH = path.join(ROOT, 'data', 'reviews-draft.json');
const PUBLIC_PATH = path.join(ROOT, 'assets', 'reviews.json');

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function readDraft() {
  return readJson(DRAFT_PATH, {
    updatedAt: null,
    rating: null,
    totalReviews: null,
    googleMapsUrl: '',
    editedFields: [],
    items: [],
  });
}

function writeDraft(draft) {
  draft.updatedAt = new Date().toISOString();
  writeJson(DRAFT_PATH, draft);
  return draft;
}

function writePublic(publicData) {
  publicData.updatedAt = new Date().toISOString();
  writeJson(PUBLIC_PATH, publicData);
  return publicData;
}

function newId() {
  return crypto.randomUUID();
}

module.exports = {
  DRAFT_PATH,
  PUBLIC_PATH,
  readDraft,
  writeDraft,
  writePublic,
  newId,
};
