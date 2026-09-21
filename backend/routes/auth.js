// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, adminOnly } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const user = await dbGet(
      'SELECT * FROM users WHERE username = ? AND active = 1', [username]
    );
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const user = await dbGet('SELECT id, username, name, email, role FROM users WHERE id = ?', [req.user.id]);
  res.json(user);
});

// GET /api/auth/users — Admin: listar usuarios
router.get('/users', auth, adminOnly, async (req, res) => {
  const users = await dbAll('SELECT id, username, name, email, role, active, created_at FROM users ORDER BY id');
  res.json(users);
});

// POST /api/auth/users — Admin: crear usuario
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;
    if (!username || !password || !name || !role)
      return res.status(400).json({ error: 'username, password, name y role son requeridos' });
    if (!['admin', 'vendedor'].includes(role))
      return res.status(400).json({ error: 'Role debe ser admin o vendedor' });

    const exists = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (exists) return res.status(409).json({ error: 'El nombre de usuario ya existe' });

    const hash = await bcrypt.hash(password, 12);
    const result = await dbRun(
      'INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)',
      [username, hash, name, email || null, role]
    );
    res.status(201).json({ id: result.lastID, username, name, email, role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/auth/users/:id — Admin: editar usuario
router.put('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role, password, active } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let newPassword = user.password;
    if (password) newPassword = await bcrypt.hash(password, 12);

    await dbRun(
      'UPDATE users SET name=?, email=?, role=?, password=?, active=? WHERE id=?',
      [name || user.name, email || user.email, role || user.role, newPassword, active !== undefined ? active : user.active, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// DELETE /api/auth/users/:id — Admin: eliminar usuario
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
  await dbRun('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
