const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { createApiKey, listApiKeys, deleteApiKey, revealApiKey } = require('../lib/apiKey');

const router = express.Router();
router.use(authMiddleware);

router.get('/api-keys', (req, res) => {
  res.json({ items: listApiKeys() });
});

router.post('/api-keys', (req, res) => {
  const { name } = req.body || {};
  const result = createApiKey(name);
  res.status(201).json(result);
});

router.post('/api-keys/:id/reveal', (req, res) => {
  const { password } = req.body || {};
  const result = revealApiKey(Number(req.params.id), password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.json({ id: result.id, name: result.name, prefix: result.prefix, key: result.key });
});

router.delete('/api-keys/:id', (req, res) => {
  const ok = deleteApiKey(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'API Key não encontrada.' });
  res.json({ ok: true });
});

module.exports = router;
