// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, adminOnly, isGlobalAdmin } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

    const user = await dbGet(
      `SELECT u.*, e.title as event_title FROM users u LEFT JOIN events e ON e.id = u.event_id
       WHERE u.username = ? AND u.active = 1`, [username]
    );
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name, event_id: user.event_id ?? null },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email, event_id: user.event_id ?? null, event_title: user.event_title ?? null }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  const user = await dbGet(
    `SELECT u.id, u.username, u.name, u.email, u.role, u.event_id, e.title as event_title
     FROM users u LEFT JOIN events e ON e.id = u.event_id WHERE u.id = ?`, [req.user.id]);
  res.json(user);
});

// GET /api/auth/users — Admin: listar usuarios (global ve todos, de evento ve solo los de su evento)
router.get('/users', auth, adminOnly, async (req, res) => {
  const base = `SELECT u.id, u.username, u.name, u.email, u.role, u.active, u.event_id, e.title as event_title, u.created_at
                FROM users u LEFT JOIN events e ON e.id = u.event_id`;
  const users = isGlobalAdmin(req.user)
    ? await dbAll(`${base} ORDER BY u.id`)
    : await dbAll(`${base} WHERE u.event_id = ? ORDER BY u.id`, [req.user.event_id]);
  res.json(users);
});

// POST /api/auth/users — Admin: crear usuario (siempre atado a un evento, salvo el admin global creado por seed)
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;
    let { event_id } = req.body;
    if (!username || !password || !name || !role)
      return res.status(400).json({ error: 'username, password, name y role son requeridos' });
    if (!['admin', 'vendedor'].includes(role))
      return res.status(400).json({ error: 'Role debe ser admin o vendedor' });

    if (isGlobalAdmin(req.user)) {
      if (!event_id) return res.status(400).json({ error: 'Elegí a qué evento pertenece este usuario' });
      const event = await dbGet('SELECT id FROM events WHERE id = ?', [event_id]);
      if (!event) return res.status(400).json({ error: 'El evento seleccionado no existe' });
    } else {
      // Admin de evento: solo puede crear vendedores para su propio evento
      if (role !== 'vendedor') return res.status(403).json({ error: 'Solo podés crear usuarios vendedores' });
      event_id = req.user.event_id;
    }

    const exists = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (exists) return res.status(409).json({ error: 'El nombre de usuario ya existe' });

    const hash = await bcrypt.hash(password, 12);
    const result = await dbRun(
      'INSERT INTO users (username, password, name, email, role, event_id) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hash, name, email || null, role, event_id]
    );
    res.status(201).json({ id: result.lastID, username, name, email, role, event_id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/auth/users/:id — Admin: editar usuario
router.put('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, active } = req.body;
    let { role, event_id } = req.body;
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (!isGlobalAdmin(req.user)) {
      // Admin de evento: solo puede tocar vendedores de su propio evento, y no puede cambiarles el evento ni el rol
      if (user.event_id !== req.user.event_id || user.role !== 'vendedor')
        return res.status(403).json({ error: 'No podés editar este usuario' });
      role = 'vendedor';
      event_id = req.user.event_id;
    } else {
      role = role || user.role;
      event_id = event_id !== undefined ? event_id : user.event_id;
    }

    let newPassword = user.password;
    if (password) newPassword = await bcrypt.hash(password, 12);

    await dbRun(
      'UPDATE users SET name=?, email=?, role=?, event_id=?, password=?, active=? WHERE id=?',
      [name || user.name, email || user.email, role, event_id, newPassword, active !== undefined ? active : user.active, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// DELETE /api/auth/users/:id — Admin: desactivar usuario
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });

  if (!isGlobalAdmin(req.user)) {
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user || user.event_id !== req.user.event_id || user.role !== 'vendedor')
      return res.status(403).json({ error: 'No podés eliminar este usuario' });
  }

  await dbRun('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
