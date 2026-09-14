const express = require('express');
const { authMiddleware, invalidateUserSessions } = require('../lib/auth');
const users = require('../lib/users');

const router = express.Router();
router.use(authMiddleware);

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores.' });
  }
  next();
}

router.get('/users', requireAdmin, (_req, res) => {
  res.json({ items: users.listUsers() });
});

router.post('/users', requireAdmin, (req, res) => {
  try {
    const { username, password, name, role } = req.body || {};
    const user = users.createUser({ username, password, name, role });
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/me/password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const row = users.findById(req.user.id);
    if (!row) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!users.verifyPassword(currentPassword, row.password_hash)) {
      return res.status(400).json({ error: 'Senha atual incorreta.' });
    }
    users.updatePassword(req.user.id, newPassword);
    invalidateUserSessions(req.user.id);
    res.json({ ok: true, message: 'Senha alterada. Faça login novamente.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/:id/password', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { newPassword } = req.body || {};
    users.updatePassword(id, newPassword);
    invalidateUserSessions(id);
    res.json({ ok: true, message: 'Senha redefinida.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/users/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { active, name } = req.body || {};
    if (active !== undefined) {
      if (id === req.user.id && active === false) {
        return res.status(400).json({ error: 'Você não pode desativar a si mesmo.' });
      }
      users.setActive(id, Boolean(active));
    }
    if (name != null) {
      const db = require('../lib/db').getDb();
      db.prepare('UPDATE users SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(String(name).trim(), id);
    }
    res.json(users.toPublicUser(users.findById(id)));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir a si mesmo.' });
    }
    users.deleteUser(id);
    invalidateUserSessions(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
