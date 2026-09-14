const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { buildPublicFromDraft } = require('./merge');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const DRAFT_PATH = path.join(DATA_DIR, 'reviews-draft.json');
/** Cópia persistente no volume Docker (/app/data) */
const PUBLIC_DATA_PATH = path.join(DATA_DIR, 'reviews.json');
/** Espelho para assets estáticos / builds locais */
const PUBLIC_ASSETS_PATH = path.join(ROOT, 'assets', 'reviews.json');

function emptyDraft() {
  return {
    updatedAt: null,
    rating: null,
    totalReviews: null,
    googleMapsUrl: '',
    editedFields: [],
    items: [],
  };
}

function emptyPublic() {
  return {
    updatedAt: null,
    rating: null,
    totalReviews: null,
    googleMapsUrl: '',
    items: [],
  };
}

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
  return readJson(DRAFT_PATH, emptyDraft());
}

function writeDraft(draft) {
  draft.updatedAt = new Date().toISOString();
  writeJson(DRAFT_PATH, draft);
  return draft;
}

/**
 * Lê o JSON público: prioriza o volume persistente, depois assets da imagem.
 */
function readPublic() {
  if (fs.existsSync(PUBLIC_DATA_PATH)) {
    return readJson(PUBLIC_DATA_PATH, emptyPublic());
  }
  return readJson(PUBLIC_ASSETS_PATH, emptyPublic());
}

function writePublic(publicData) {
  publicData.updatedAt = new Date().toISOString();
  writeJson(PUBLIC_DATA_PATH, publicData);
  writeJson(PUBLIC_ASSETS_PATH, publicData);
  return publicData;
}

function newId() {
  return crypto.randomUUID();
}

function publicItemToDraft(item, order) {
  const author = String(item.author || item.authorName || '').trim();
  const text = String(item.text || '').trim();
  const publishedAt = item.publishedAt || item.date || new Date().toISOString().split('T')[0];
  return {
    id: item.id || newId(),
    source: item.source || 'manual',
    author,
    authorUrl: item.authorUrl || '',
    rating: Number(item.rating) || 5,
    text,
    textOriginal: text,
    area: item.area || '',
    publishedAt,
    visible: true,
    siteStatus: 'published',
    order,
    editedFields: [],
    status: 'active',
  };
}

/**
 * Reconcilia draft (admin) com o JSON público (site).
 * - Importa itens publicados que sumiram do draft (ex.: volume Docker vazio).
 * - Regenera o público a partir do draft (fonte da verdade do admin).
 */
function ensureReviewsSynced() {
  const draft = readDraft();
  if (!Array.isArray(draft.items)) draft.items = [];

  const publicData = readPublic();
  const publicItems = Array.isArray(publicData.items) ? publicData.items : [];
  const draftIds = new Set(draft.items.map((i) => i.id).filter(Boolean));

  let imported = 0;
  let maxOrder = draft.items.reduce((max, item) => Math.max(max, Number(item.order) || 0), 0);

  for (const item of publicItems) {
    if (item.id && draftIds.has(item.id)) continue;
    // Evita duplicar se o id público sumiu mas o texto/autor já estão no draft
    const author = String(item.author || item.authorName || '').trim().toLowerCase();
    const text = String(item.text || '').trim().toLowerCase();
    const dup = draft.items.some(
      (d) =>
        String(d.author || '').trim().toLowerCase() === author
        && String(d.text || '').trim().toLowerCase() === text
    );
    if (dup) continue;

    maxOrder += 1;
    const restored = publicItemToDraft(item, maxOrder);
    draft.items.push(restored);
    draftIds.add(restored.id);
    imported += 1;
  }

  if (imported > 0) {
    if (publicData.googleMapsUrl && !draft.googleMapsUrl) {
      draft.googleMapsUrl = publicData.googleMapsUrl;
    }
    if (publicData.rating != null && draft.rating == null) draft.rating = publicData.rating;
    if (publicData.totalReviews != null && draft.totalReviews == null) {
      draft.totalReviews = publicData.totalReviews;
    }
    writeDraft(draft);
    console.log(`[reviews] Restaurados ${imported} depoimento(s) publicados no admin.`);
  }

  writePublic(buildPublicFromDraft(draft));
  return draft;
}

module.exports = {
  DRAFT_PATH,
  PUBLIC_PATH: PUBLIC_DATA_PATH,
  PUBLIC_ASSETS_PATH,
  readDraft,
  writeDraft,
  readPublic,
  writePublic,
  ensureReviewsSynced,
  newId,
};
