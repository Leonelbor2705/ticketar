// routes/orders.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth } = require('../middleware/auth');
const { sendTicketEmail } = require('../utils/mailer');

// POST /api/orders — Público: crear orden
router.post('/', async (req, res) => {
  try {
    const { event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, items, payment_method } = req.body;

    if (!event_id || !buyer_name || !buyer_lastname || !buyer_email || !items?.length)
      return res.status(400).json({ error: 'Datos incompletos' });

    const event = await dbGet('SELECT * FROM events WHERE id = ? AND active = 1', [event_id]);
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

    // Validate stock and calculate total
    let total = 0;
    const validatedItems = [];
    for (const item of items) {
      const stage = await dbGet(
        'SELECT * FROM ticket_stages WHERE id = ? AND event_id = ? AND active = 1',
        [item.stage_id, event_id]
      );
      if (!stage) return res.status(400).json({ error: `Etapa ${item.stage_id} no válida` });
      const avail = stage.quantity - stage.sold;
      if (item.qty < 1 || item.qty > avail)
        return res.status(400).json({ error: `Stock insuficiente para "${stage.name}": disponible ${avail}` });
      if (item.qty > 10)
        return res.status(400).json({ error: 'Máximo 10 entradas por etapa por orden' });
      total += stage.price * item.qty;
      validatedItems.push({ ...item, stage, price: stage.price });
    }

    const orderId = 'ORD-' + uuidv4().substring(0, 8).toUpperCase();
    await dbRun(
      `INSERT INTO orders (id, event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, total, payment_method, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone || null, total, payment_method || 'mp',
       payment_method === 'transfer' ? 'pending' : 'pending']
    );

    // Create tickets
    const tickets = [];
    for (const item of validatedItems) {
      for (let i = 0; i < item.qty; i++) {
        const code = 'TK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const qrData = JSON.stringify({
          code, order: orderId,
          buyer: `${buyer_name} ${buyer_lastname}`,
          event: event.title, stage: item.stage.name,
          date: event.date, venue: event.venue
        });
        const qrImage = await QRCode.toDataURL(qrData, { errorCorrectionLevel: 'H', width: 300 });

        await dbRun(
          `INSERT INTO tickets (order_id, stage_id, stage_name, code, buyer_name, buyer_lastname,
           event_title, event_date, event_venue, price, qr_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.stage_id, item.stage.name, code, buyer_name, buyer_lastname,
           event.title, event.date, event.venue, item.price, qrImage]
        );

        // Update sold count
        await dbRun('UPDATE ticket_stages SET sold = sold + 1 WHERE id = ?', [item.stage_id]);
        tickets.push({ code, stage: item.stage.name, price: item.price, qr_image: qrImage });
      }
    }

    const order = { id: orderId, total, tickets, event, buyer: `${buyer_name} ${buyer_lastname}` };

    // Send email async (don't block response)
    sendTicketEmail({ order, tickets, event, buyer_email, buyer_name, buyer_lastname }).catch(console.error);

    res.status(201).json({
      order_id: orderId,
      total,
      tickets,
      message: 'Orden creada. Te enviamos las entradas por email.'
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/orders — Admin: listar órdenes
router.get('/', auth, async (req, res) => {
  try {
    const { event_id, status, search, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];

    if (event_id) { where.push('o.event_id = ?'); params.push(event_id); }
    if (status) { where.push('o.payment_status = ?'); params.push(status); }
    if (search) {
      where.push('(o.buyer_name LIKE ? OR o.buyer_lastname LIKE ? OR o.buyer_email LIKE ? OR o.id LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const orders = await dbAll(
      `SELECT o.*, e.title as event_title, e.emoji, e.date as event_date
       FROM orders o JOIN events e ON e.id = o.event_id
       ${whereStr} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const totalRow = await dbGet(`SELECT COUNT(*) as total FROM orders o ${whereStr}`, params);
    res.json({ orders, total: totalRow.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/orders/:id — Admin o comprador: detalle de orden
router.get('/:id', async (req, res) => {
  try {
    const order = await dbGet(
      `SELECT o.*, e.title as event_title, e.emoji, e.date as event_date, e.venue
       FROM orders o JOIN events e ON e.id = o.event_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    order.tickets = await dbAll('SELECT * FROM tickets WHERE order_id = ?', [order.id]);
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/orders/:id/confirm — Admin: confirmar pago manual
router.post('/:id/confirm', auth, async (req, res) => {
  await dbRun(
    `UPDATE orders SET payment_status='paid', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [req.params.id]
  );
  res.json({ success: true });
});

module.exports = router;
