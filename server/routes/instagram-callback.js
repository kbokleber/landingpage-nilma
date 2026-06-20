const express = require('express');
const instagram = require('../lib/instagram');

const router = express.Router();

// Callback público (não autenticado) — processa code e redireciona para /admin
router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    return res.redirect(`/admin/?instagram=error&msg=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect('/admin/?instagram=error&msg=missing_code');
  }
  try {
    await instagram.handleOAuthCallback(code);
    res.redirect('/admin/?instagram=connected');
  } catch (err) {
    console.error('instagram callback error:', err);
    res.redirect(`/admin/?instagram=error&msg=${encodeURIComponent(err.message)}`);
  }
});

module.exports = router;
