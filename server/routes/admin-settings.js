const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { getAll, setMany, revealSecret } = require('../lib/settings');

const router = express.Router();
router.use(authMiddleware);

router.get('/settings', (req, res) => {
  res.json({ items: getAll() });
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (!updates.length) return res.status(400).json({ error: 'Nenhuma alteração enviada.' });
  setMany(updates);
  res.json({ ok: true, items: getAll() });
});

router.post('/settings/:key/reveal', (req, res) => {
  const { password } = req.body || {};
  const result = revealSecret(req.params.key, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json({ key: result.key, value: result.value });
});

module.exports = router;
