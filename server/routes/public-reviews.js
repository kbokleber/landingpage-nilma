const express = require('express');
const { readPublic } = require('../lib/storage');

const router = express.Router();

/**
 * GET /api/public/reviews
 * Lista depoimentos já publicados no site (sem autenticação).
 */
router.get('/reviews', (_req, res) => {
  try {
    const data = readPublic();
    const items = Array.isArray(data.items) ? data.items : [];
    res.json({
      total: items.length,
      rating: data.rating ?? null,
      totalReviews: data.totalReviews ?? items.length,
      updatedAt: data.updatedAt || null,
      googleMapsUrl: data.googleMapsUrl || '',
      items,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Falha ao ler reviews.' });
  }
});

module.exports = router;
