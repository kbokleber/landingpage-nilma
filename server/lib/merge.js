const { newId } = require('./storage');

const STAR_MAP = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

function starRatingToNumber(starRating) {
  if (typeof starRating === 'number') return starRating;
  return STAR_MAP[starRating] || 0;
}

function mapGoogleReview(review) {
  const googleReviewId = review.name || review.reviewId;
  const text = review.comment || '';
  return {
    googleReviewId,
    source: 'google',
    author: review.reviewer?.displayName || 'Anônimo',
    authorUrl: review.reviewer?.profilePhotoUrl || '',
    rating: starRatingToNumber(review.starRating),
    text,
    textOriginal: text,
    publishedAt: review.createTime ? review.createTime.split('T')[0] : null,
    visible: true,
    editedFields: [],
    status: 'active',
    lastSyncedAt: new Date().toISOString(),
  };
}

function isEdited(item, field) {
  return Array.isArray(item.editedFields) && item.editedFields.includes(field);
}

function nextOrder(items) {
  if (!items.length) return 1;
  return Math.max(...items.map((i) => i.order || 0)) + 1;
}

function mergeGoogleReviews(draft, googlePayload) {
  const summary = {
    added: 0,
    updated: 0,
    preserved: 0,
    removedFromGoogle: 0,
  };

  const incoming = (googlePayload.reviews || []).map(mapGoogleReview);
  const incomingIds = new Set(incoming.map((r) => r.googleReviewId));
  const existingByGoogleId = new Map();

  draft.items.forEach((item) => {
    if (item.googleReviewId) {
      existingByGoogleId.set(item.googleReviewId, item);
    }
  });

  incoming.forEach((incomingItem) => {
    const existing = existingByGoogleId.get(incomingItem.googleReviewId);

    if (!existing) {
      draft.items.push({
        id: newId(),
        order: nextOrder(draft.items),
        ...incomingItem,
      });
      summary.added += 1;
      return;
    }

    if (existing.source === 'manual') return;

    let preservedThis = false;
    let updatedThis = false;

    if (!isEdited(existing, 'author')) {
      if (existing.author !== incomingItem.author) {
        existing.author = incomingItem.author;
        updatedThis = true;
      }
      existing.authorUrl = incomingItem.authorUrl;
    } else {
      preservedThis = true;
    }

    if (!isEdited(existing, 'text')) {
      if (existing.text !== incomingItem.text) {
        existing.text = incomingItem.text;
        updatedThis = true;
      }
      existing.textOriginal = incomingItem.textOriginal;
    } else {
      existing.textOriginal = incomingItem.textOriginal;
      preservedThis = true;
    }

    if (!isEdited(existing, 'rating') && existing.rating !== incomingItem.rating) {
      existing.rating = incomingItem.rating;
      updatedThis = true;
    }

    existing.publishedAt = incomingItem.publishedAt;
    existing.lastSyncedAt = incomingItem.lastSyncedAt;
    existing.status = 'active';

    if (preservedThis) summary.preserved += 1;
    else if (updatedThis) summary.updated += 1;
  });

  draft.items.forEach((item) => {
    if (item.source !== 'google' || !item.googleReviewId) return;
    if (incomingIds.has(item.googleReviewId)) return;
    if (item.status === 'removed_from_google') return;
    item.status = 'removed_from_google';
    summary.removedFromGoogle += 1;
  });

  if (googlePayload.averageRating != null) {
    draft.rating = googlePayload.averageRating;
  }
  if (googlePayload.totalReviewCount != null) {
    draft.totalReviews = googlePayload.totalReviewCount;
  }

  draft.lastSyncedAt = new Date().toISOString();
  return summary;
}

function markFieldEdited(item, field) {
  if (!item.editedFields) item.editedFields = [];
  if (!item.editedFields.includes(field)) {
    item.editedFields.push(field);
  }
}

function buildPublicFromDraft(draft) {
  const items = draft.items
    .filter((item) => item.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item) => ({
      author: item.author,
      authorUrl: item.authorUrl || '',
      rating: item.rating,
      text: item.text,
      publishedAt: item.publishedAt,
      source: item.source || 'google',
    }));

  return {
    updatedAt: new Date().toISOString(),
    rating: draft.rating,
    totalReviews: draft.totalReviews,
    googleMapsUrl: draft.googleMapsUrl || '',
    items,
  };
}

module.exports = {
  mapGoogleReview,
  mergeGoogleReviews,
  markFieldEdited,
  buildPublicFromDraft,
  starRatingToNumber,
};
