const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DRAFT_PATH = path.join(ROOT, 'data', 'reviews-draft.json');
const PUBLIC_PATH = path.join(ROOT, 'assets', 'reviews.json');
const OAUTH_PATH = path.join(ROOT, 'data', 'oauth-tokens.json');
const GBP_SETTINGS_PATH = path.join(ROOT, 'data', 'gbp-settings.json');
const IG_TOKENS_PATH = path.join(ROOT, 'data', 'instagram-tokens.json');
const IG_SYNC_META_PATH = path.join(ROOT, 'data', 'instagram-sync.json');

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

function readOAuthTokens() {
  return readJson(OAUTH_PATH, null);
}

function writeOAuthTokens(tokens) {
  writeJson(OAUTH_PATH, tokens);
}

function readGbpSettings() {
  return readJson(GBP_SETTINGS_PATH, { locationName: null });
}

function writeGbpSettings(settings) {
  writeJson(GBP_SETTINGS_PATH, settings);
  return settings;
}

function readInstagramTokens() {
  return readJson(IG_TOKENS_PATH, null);
}

function writeInstagramTokens(tokens) {
  writeJson(IG_TOKENS_PATH, tokens);
  return tokens;
}

function clearInstagramTokens() {
  try {
    fs.unlinkSync(IG_TOKENS_PATH);
  } catch {}
}

function readInstagramSyncMeta() {
  return readJson(IG_SYNC_META_PATH, {
    lastSyncAt: null,
    lastResult: null,
    pageId: null,
    igUserId: null,
  });
}

function writeInstagramSyncMeta(meta) {
  writeJson(IG_SYNC_META_PATH, meta);
  return meta;
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
  readOAuthTokens,
  writeOAuthTokens,
  readGbpSettings,
  writeGbpSettings,
  readInstagramTokens,
  writeInstagramTokens,
  clearInstagramTokens,
  readInstagramSyncMeta,
  writeInstagramSyncMeta,
  newId,
};
