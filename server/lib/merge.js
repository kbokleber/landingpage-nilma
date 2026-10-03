function markFieldEdited(item, field) {
  if (!item.editedFields) item.editedFields = [];
  if (!item.editedFields.includes(field)) {
    item.editedFields.push(field);
  }
}

function normalizeSiteStatus(item) {
  if (item.siteStatus === 'draft' || item.siteStatus === 'published') return item.siteStatus;
  // Legado: visible false = rascunho; caso contrario publicado
  return item.visible === false ? 'draft' : 'published';
}

function buildPublicFromDraft(draft) {
  const items = draft.items
    .filter((item) => normalizeSiteStatus(item) === 'published' && item.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item) => ({
      id: item.id,
      author: item.author,
      authorName: item.author,
      authorUrl: item.authorUrl || '',
      rating: item.rating,
      text: item.text,
      area: item.area || '',
      publishedAt: item.publishedAt,
      date: item.publishedAt,
      source: item.source || 'manual',
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
  markFieldEdited,
  buildPublicFromDraft,
  normalizeSiteStatus,
};
