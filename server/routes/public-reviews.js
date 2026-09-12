const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const PUBLIC_PATH = path.join(__dirname, '..', '..', 'assets', 'reviews.json');

/**
 * GET /api/public/reviews
 * Lista depoimentos ja publicados no site (sem autenticacao).
 */
router.get('/reviews', (_req, res) => {
  try {
    if (!fs.existsSync(PUBLIC_PATH)) {
      return res.json({ total: 0, items: [] });
    }
    const raw = fs.readFileSync(PUBLIC_PATH, 'utf8');
    const data = JSON.parse(raw);
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
