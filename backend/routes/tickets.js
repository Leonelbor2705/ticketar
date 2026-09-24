// routes/tickets.js
const express = require('express');
const router = express.Router();
const { dbGet, dbRun } = require('../utils/db');
const { auth, isGlobalAdmin } = require('../middleware/auth');

// POST /api/tickets/validate — Validar entrada por código
router.post('/validate', auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Código requerido' });

    const ticket = await dbGet(
      `SELECT t.*, o.payment_status, o.buyer_email, s.event_id
       FROM tickets t
       JOIN orders o ON o.id=t.order_id
       JOIN ticket_stages s ON s.id=t.stage_id
       WHERE t.code=?`,
      [code.trim().toUpperCase()]
    );

    if (!ticket) return res.json({ valid: false, reason: 'Código no encontrado' });
    if (!isGlobalAdmin(req.user) && String(ticket.event_id) !== String(req.user.event_id))
      return res.json({ valid: false, reason: 'Esta entrada no pertenece a tu evento' });
    if (ticket.payment_status !== 'paid') return res.json({ valid: false, reason: 'Pago pendiente o rechazado' });
    if (ticket.validated) {
      return res.json({
        valid: false, already_used: true,
        reason: 'Entrada ya utilizada',
        validated_at: ticket.validated_at,
        ticket: {
          code: ticket.code, buyer: `${ticket.buyer_name} ${ticket.buyer_lastname}`,
          event: ticket.event_title, stage: ticket.stage_name
        }
      });
    }

    // Mark as used
    await dbRun(
      'UPDATE tickets SET validated=1, validated_at=CURRENT_TIMESTAMP, validated_by=? WHERE code=?',
      [req.user.id, ticket.code]
    );

    res.json({
      valid: true,
      ticket: {
        code: ticket.code,
        buyer: `${ticket.buyer_name} ${ticket.buyer_lastname}`,
        event: ticket.event_title,
        stage: ticket.stage_name,
        date: ticket.event_date,
        venue: ticket.event_venue,
        price: ticket.price
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/tickets/order/:orderId — Obtener entradas de una orden
router.get('/order/:orderId', async (req, res) => {
  try {
    const order = await dbGet('SELECT * FROM orders WHERE id=?', [req.params.orderId]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    const tickets = await dbGet('SELECT * FROM tickets WHERE order_id=?', [req.params.orderId]);
    res.json(tickets);
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/tickets/:code — Obtener datos de un ticket
router.get('/:code', async (req, res) => {
  const ticket = await dbGet(
    `SELECT t.*, o.payment_status FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.code=?`,
    [req.params.code.toUpperCase()]
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
  // Don't expose sensitive data publicly - hide QR if not paid
  if (ticket.payment_status !== 'paid') ticket.qr_data = null;
  res.json(ticket);
});

module.exports = router;
