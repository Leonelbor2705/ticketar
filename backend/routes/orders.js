// routes/orders.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, adminOnly, isGlobalAdmin, canAccessEvent } = require('../middleware/auth');
const { sendTicketEmail } = require('../utils/mailer');

// Lógica compartida: valida stock, crea la orden y emite los tickets.
// Usada tanto por el checkout público (pago pendiente) como por la inscripción
// manual de admin/vendedor (se marca pagada al instante).
async function createOrderAndTickets({ event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, congregacion, items, payment_method, payment_status }) {
  const event = await dbGet('SELECT * FROM events WHERE id = ? AND active = 1', [event_id]);
  if (!event) { const err = new Error('Evento no encontrado'); err.status = 404; throw err; }

  let total = 0;
  const validatedItems = [];
  for (const item of items) {
    const stage = await dbGet(
      'SELECT * FROM ticket_stages WHERE id = ? AND event_id = ? AND active = 1',
      [item.stage_id, event_id]
    );
    if (!stage) { const err = new Error(`Etapa ${item.stage_id} no válida`); err.status = 400; throw err; }
    const avail = stage.quantity - stage.sold;
    if (item.qty < 1 || item.qty > avail) { const err = new Error(`Stock insuficiente para "${stage.name}": disponible ${avail}`); err.status = 400; throw err; }
    if (item.qty > 10) { const err = new Error('Máximo 10 entradas por etapa por orden'); err.status = 400; throw err; }
    total += stage.price * item.qty;
    validatedItems.push({ ...item, stage, price: stage.price });
  }

  const orderId = 'ORD-' + uuidv4().substring(0, 8).toUpperCase();
  await dbRun(
    `INSERT INTO orders (id, event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, congregacion, total, payment_method, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone || null, congregacion || null, total, payment_method, payment_status]
  );

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

      await dbRun('UPDATE ticket_stages SET sold = sold + 1 WHERE id = ?', [item.stage_id]);
      tickets.push({ code, stage: item.stage.name, price: item.price, qr_image: qrImage });
    }
  }

  return { orderId, total, tickets, event };
}

// POST /api/orders — Público: crear orden (pago pendiente hasta confirmarse)
router.post('/', async (req, res) => {
  try {
    const { event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, items, payment_method, congregacion } = req.body;

    if (!event_id || !buyer_name || !buyer_lastname || !buyer_email || !items?.length)
      return res.status(400).json({ error: 'Datos incompletos' });

    const { orderId, total, tickets, event } = await createOrderAndTickets({
      event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, congregacion, items,
      payment_method: payment_method || 'mp', payment_status: 'pending'
    });

    // Send email async (don't block response)
    sendTicketEmail({ order: { id: orderId, total, tickets, event, buyer: `${buyer_name} ${buyer_lastname}` }, tickets, event, buyer_email, buyer_name, buyer_lastname }).catch(console.error);

    res.status(201).json({
      order_id: orderId,
      total,
      tickets,
      message: 'Orden creada. Te enviamos las entradas por email.'
    });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
});

// POST /api/orders/manual — Admin/vendedor: inscripción manual (efectivo, en persona), queda pagada al instante
router.post('/manual', auth, async (req, res) => {
  try {
    if (!['admin', 'vendedor'].includes(req.user.role))
      return res.status(403).json({ error: 'No tenés permiso para registrar inscripciones' });

    let { event_id } = req.body;
    const { buyer_name, buyer_lastname, buyer_email, buyer_phone, items, congregacion } = req.body;

    // Admin/vendedor de evento solo puede inscribir gente para su propio evento
    if (!isGlobalAdmin(req.user)) event_id = req.user.event_id;

    if (!event_id || !buyer_name || !buyer_lastname || !buyer_email || !items?.length)
      return res.status(400).json({ error: 'Datos incompletos' });
    if (!canAccessEvent(req.user, event_id))
      return res.status(403).json({ error: 'No tenés permiso sobre este evento' });

    const { orderId, total, tickets, event } = await createOrderAndTickets({
      event_id, buyer_name, buyer_lastname, buyer_email, buyer_phone, congregacion, items,
      payment_method: 'manual', payment_status: 'paid'
    });

    sendTicketEmail({ order: { id: orderId, total, tickets, event, buyer: `${buyer_name} ${buyer_lastname}` }, tickets, event, buyer_email, buyer_name, buyer_lastname }).catch(console.error);

    res.status(201).json({
      order_id: orderId,
      total,
      tickets,
      message: 'Inscripción registrada y marcada como pagada.'
    });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
});

// GET /api/orders — Admin: listar órdenes
router.get('/', auth, async (req, res) => {
  try {
    const { event_id, status, search, page = 1, limit = 50 } = req.query;
    let where = [];
    let params = [];

    if (!isGlobalAdmin(req.user)) {
      // Admin/vendedor de evento solo ve sus propias órdenes, sin importar qué pida event_id
      where.push('o.event_id = ?'); params.push(req.user.event_id);
    } else if (event_id) {
      where.push('o.event_id = ?'); params.push(event_id);
    }
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

// GET /api/orders/export — Admin: exportar las ventas pagadas a un .xlsx real (una fila por entrada)
// ?period= 1m | 3m | 6m | 1y | all (default all)
const EXPORT_PERIOD_DAYS = { '1m': 30, '3m': 90, '6m': 182, '1y': 365, all: null };
router.get('/export', auth, adminOnly, async (req, res) => {
  try {
    const days = EXPORT_PERIOD_DAYS[req.query.period] !== undefined ? EXPORT_PERIOD_DAYS[req.query.period] : null;
    let where = [`o.payment_status = 'paid'`];
    let params = [];
    if (!isGlobalAdmin(req.user)) { where.push('o.event_id = ?'); params.push(req.user.event_id); }
    if (days) where.push(`o.created_at >= CURRENT_DATE - INTERVAL '${days} days'`);

    const rows = await dbAll(`
      SELECT t.code, t.buyer_name, t.buyer_lastname, o.buyer_email, o.buyer_phone, o.congregacion,
        e.title as event_title, t.stage_name, t.price, o.payment_method, o.payment_status,
        t.validated, o.id as order_id, o.created_at
      FROM tickets t
      JOIN orders o ON o.id = t.order_id
      JOIN events e ON e.id = o.event_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.created_at DESC
    `, params);

    const PAYMENT_METHOD_LABEL = { mp: 'MP QR', card: 'Tarjeta', transfer: 'Transferencia', manual: 'Manual' };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');
    sheet.columns = [
      { header: 'Código', key: 'code', width: 14 },
      { header: 'Nombre', key: 'buyer_name', width: 16 },
      { header: 'Apellido', key: 'buyer_lastname', width: 16 },
      { header: 'Email', key: 'buyer_email', width: 24 },
      { header: 'Teléfono', key: 'buyer_phone', width: 16 },
      { header: 'Congregación', key: 'congregacion', width: 22 },
      { header: 'Evento', key: 'event_title', width: 22 },
      { header: 'Etapa', key: 'stage_name', width: 16 },
      { header: 'Precio', key: 'price', width: 12 },
      { header: 'Método de pago', key: 'payment_method', width: 15 },
      { header: 'Validado', key: 'validated', width: 10 },
      { header: 'Orden', key: 'order_id', width: 14 },
      { header: 'Fecha', key: 'created_at', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow({
        code: r.code, buyer_name: r.buyer_name, buyer_lastname: r.buyer_lastname,
        buyer_email: r.buyer_email, buyer_phone: r.buyer_phone || '', congregacion: r.congregacion || '',
        event_title: r.event_title, stage_name: r.stage_name, price: r.price,
        payment_method: PAYMENT_METHOD_LABEL[r.payment_method] || r.payment_method,
        validated: r.validated ? 'Sí' : 'No', order_id: r.order_id,
        created_at: r.created_at ? new Date(r.created_at) : ''
      });
    }
    sheet.getColumn('price').numFmt = '#,##0.00';
    sheet.getColumn('created_at').numFmt = 'dd/mm/yyyy hh:mm';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ventas-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
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
  const order = await dbGet('SELECT event_id FROM orders WHERE id=?', [req.params.id]);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!canAccessEvent(req.user, order.event_id))
    return res.status(403).json({ error: 'No tenés permiso sobre esta orden' });

  await dbRun(
    `UPDATE orders SET payment_status='paid', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [req.params.id]
  );
  res.json({ success: true });
});

// PUT /api/orders/:id — Admin/vendedor: editar datos del comprador y/o estado de una orden
// (ABM completo: corregir errores de carga, cancelar/reactivar liberando o reservando stock)
router.put('/:id', auth, async (req, res) => {
  try {
    const order = await dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
    if (!canAccessEvent(req.user, order.event_id))
      return res.status(403).json({ error: 'No tenés permiso sobre esta orden' });

    const { buyer_name, buyer_lastname, buyer_email, buyer_phone, congregacion, payment_status } = req.body;
    if (payment_status && !['pending', 'paid', 'failed', 'refunded'].includes(payment_status))
      return res.status(400).json({ error: 'Estado inválido' });

    const newStatus = payment_status || order.payment_status;
    const stageCounts = await dbAll(
      'SELECT stage_id, COUNT(*) as c FROM tickets WHERE order_id = ? GROUP BY stage_id', [order.id]
    );

    if (order.payment_status === 'paid' && newStatus !== 'paid') {
      // Libera el stock que esta orden tenía reservado/vendido
      for (const s of stageCounts) await dbRun('UPDATE ticket_stages SET sold = sold - ? WHERE id = ?', [s.c, s.stage_id]);
    } else if (order.payment_status !== 'paid' && newStatus === 'paid') {
      // Reactivar una orden cancelada: verificar que siga habiendo stock antes de reservarlo
      for (const s of stageCounts) {
        const stage = await dbGet('SELECT quantity, sold FROM ticket_stages WHERE id = ?', [s.stage_id]);
        if (stage && (stage.quantity - stage.sold) < s.c) {
          const err = new Error('No hay stock suficiente para reactivar esta orden');
          err.status = 400; throw err;
        }
      }
      for (const s of stageCounts) await dbRun('UPDATE ticket_stages SET sold = sold + ? WHERE id = ?', [s.c, s.stage_id]);
    }

    const newName = buyer_name || order.buyer_name;
    const newLastname = buyer_lastname || order.buyer_lastname;
    await dbRun(
      `UPDATE orders SET buyer_name=?, buyer_lastname=?, buyer_email=?, buyer_phone=?, congregacion=?, payment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [newName, newLastname, buyer_email || order.buyer_email, buyer_phone ?? order.buyer_phone,
       congregacion ?? order.congregacion, newStatus, order.id]
    );
    await dbRun('UPDATE tickets SET buyer_name=?, buyer_lastname=? WHERE order_id=?', [newName, newLastname, order.id]);

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Error del servidor' });
  }
});

module.exports = router;
