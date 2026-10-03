const express = require('express');
const settings = require('../lib/settings');

const router = express.Router();

function parseList(raw, fallback) {
  if (!raw) return fallback;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : fallback;
  } catch {
    return fallback;
  }
}

router.get('/editor/config', (_req, res) => {
  try {
    const fonts = parseList(settings.get('EDITOR_FONTS'), []);
    const sizes = parseList(settings.get('EDITOR_FONT_SIZES'), []);
    const textColors = parseList(settings.get('EDITOR_TEXT_COLORS'), []);
    const bgColors = parseList(settings.get('EDITOR_BG_COLORS'), []);
    res.json({
      fonts,
      fontDefault: settings.get('EDITOR_FONT_DEFAULT') || 'Poppins',
      sizes,
      sizeDefault: settings.get('EDITOR_FONT_SIZE_DEFAULT') || '16',
      textColors,
      bgColors,
      textColorDefault: settings.get('EDITOR_TEXT_COLOR_DEFAULT') || '#333333',
      bgColorDefault: settings.get('EDITOR_BG_COLOR_DEFAULT') || 'transparent',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;