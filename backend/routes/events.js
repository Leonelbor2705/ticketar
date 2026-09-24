// routes/events.js
const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, adminOnly, isGlobalAdmin, canAccessEvent } = require('../middleware/auth');

// GET /api/events — Público: listar eventos activos
router.get('/', async (req, res) => {
  try {
    const events = await dbAll(`
      SELECT e.*,
        MIN(s.price) as min_price,
        COUNT(DISTINCT s.id) as stage_count,
        SUM(s.sold) as total_sold,
        SUM(s.quantity) as total_qty
      FROM events e
      LEFT JOIN ticket_stages s ON s.event_id = e.id AND s.active = 1
      WHERE e.active = 1
      GROUP BY e.id
      ORDER BY e.date ASC
    `);

    for (const ev of events) {
      ev.stages = await dbAll(
        'SELECT * FROM ticket_stages WHERE event_id = ? ORDER BY sort_order ASC',
        [ev.id]
      );
    }
    res.json(events);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/events/all — Admin/vendedor: eventos (el admin global ve todos, el resto solo el suyo)
router.get('/all', auth, async (req, res) => {
  try {
    const scoped = !isGlobalAdmin(req.user);
    const events = await dbAll(`
      SELECT e.*,
        SUM(s.sold) as total_sold,
        SUM(s.quantity) as total_qty
      FROM events e
      LEFT JOIN ticket_stages s ON s.event_id = e.id
      ${scoped ? 'WHERE e.id = ?' : ''}
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `, scoped ? [req.user.event_id] : []);
    for (const ev of events) {
      ev.stages = await dbAll('SELECT * FROM ticket_stages WHERE event_id = ? ORDER BY sort_order', [ev.id]);
    }
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/events/:id — Público: detalle de evento
router.get('/:id', async (req, res) => {
  try {
    const event = await dbGet('SELECT * FROM events WHERE id = ? AND active = 1', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    event.stages = await dbAll(
      'SELECT * FROM ticket_stages WHERE event_id = ? ORDER BY sort_order',
      [event.id]
    );
    res.json(event);
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/events — Solo el admin global crea eventos nuevos
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    if (!isGlobalAdmin(req.user))
      return res.status(403).json({ error: 'Solo el administrador general puede crear eventos' });

    const { title, description, emoji, date, time, venue, city, image_url, stages } = req.body;
    if (!title || !date || !venue || !city)
      return res.status(400).json({ error: 'title, date, venue y city son requeridos' });

    const result = await dbRun(
      `INSERT INTO events (title, description, emoji, date, time, venue, city, image_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description || '', emoji || '🎪', date, time || '20:00', venue, city, image_url || null, req.user.id]
    );
    const eventId = result.lastID;

    if (stages && stages.length > 0) {
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i];
        await dbRun(
          `INSERT INTO ticket_stages (event_id, name, price, quantity, active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [eventId, s.name, s.price, s.quantity, s.active !== false ? 1 : 0, i]
        );
      }
    }

    const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);
    event.stages = await dbAll('SELECT * FROM ticket_stages WHERE event_id = ?', [eventId]);
    res.status(201).json(event);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/events/:id — Admin global, o admin del propio evento
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!canAccessEvent(req.user, req.params.id))
      return res.status(403).json({ error: 'No tenés permiso sobre este evento' });

    const { title, description, emoji, date, time, venue, city, image_url, active } = req.body;
    const event = await dbGet('SELECT * FROM events WHERE id = ?', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

    await dbRun(
      `UPDATE events SET title=?, description=?, emoji=?, date=?, time=?, venue=?, city=?, image_url=?, active=?
       WHERE id=?`,
      [
        title || event.title, description ?? event.description, emoji || event.emoji,
        date || event.date, time || event.time, venue || event.venue, city || event.city,
        image_url ?? event.image_url, active !== undefined ? active : event.active,
        req.params.id
      ]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// DELETE /api/events/:id — Admin global, o admin del propio evento (activar/desactivar)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  if (!canAccessEvent(req.user, req.params.id))
    return res.status(403).json({ error: 'No tenés permiso sobre este evento' });
  await dbRun('UPDATE events SET active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// POST /api/events/:id/stages — Admin global, o admin del propio evento
router.post('/:id/stages', auth, adminOnly, async (req, res) => {
  try {
    if (!canAccessEvent(req.user, req.params.id))
      return res.status(403).json({ error: 'No tenés permiso sobre este evento' });

    const { name, price, quantity, active, sort_order } = req.body;
    if (!name || !price || !quantity)
      return res.status(400).json({ error: 'name, price y quantity son requeridos' });

    const maxOrder = await dbGet(
      'SELECT MAX(sort_order) as maxOrder FROM ticket_stages WHERE event_id = ?', [req.params.id]
    );
    const result = await dbRun(
      `INSERT INTO ticket_stages (event_id, name, price, quantity, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, name, price, quantity, active !== false ? 1 : 0, sort_order ?? (maxOrder?.maxOrder ?? 0) + 1]
    );
    res.status(201).json({ id: result.lastID, name, price, quantity, active: active !== false, sold: 0 });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/events/:id/stages/:stageId — Admin global, o admin del propio evento
router.put('/:id/stages/:stageId', auth, adminOnly, async (req, res) => {
  try {
    if (!canAccessEvent(req.user, req.params.id))
      return res.status(403).json({ error: 'No tenés permiso sobre este evento' });

    const { name, price, quantity, active } = req.body;
    const stage = await dbGet('SELECT * FROM ticket_stages WHERE id = ? AND event_id = ?', [req.params.stageId, req.params.id]);
    if (!stage) return res.status(404).json({ error: 'Etapa no encontrada' });

    await dbRun(
      'UPDATE ticket_stages SET name=?, price=?, quantity=?, active=? WHERE id=?',
      [name || stage.name, price || stage.price, quantity || stage.quantity, active !== undefined ? active : stage.active, req.params.stageId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
