// routes/payments.js
const express = require('express');
const router = express.Router();
const { dbGet, dbAll, dbRun } = require('../utils/db');
const { auth, adminOnly, isGlobalAdmin } = require('../middleware/auth');

// Lazy-load MercadoPago to avoid crashing if credentials not set
let mpClient = null;
function getMP() {
  if (!mpClient && process.env.MP_ACCESS_TOKEN && process.env.MP_ACCESS_TOKEN !== 'APP_USR-tu-access-token-de-produccion') {
    try {
      const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
      mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    } catch(e) { console.warn('MercadoPago SDK no disponible:', e.message); }
  }
  return mpClient;
}

// POST /api/payments/mp/preference — Crear preferencia de pago MP
router.post('/mp/preference', async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await dbGet(
      `SELECT o.*, e.title as event_title FROM orders o JOIN events e ON e.id=o.event_id WHERE o.id=?`,
      [order_id]
    );
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const mp = getMP();
    if (!mp) {
      // Dev mode: return simulated preference
      return res.json({
        preference_id: 'DEMO-PREFERENCE-' + order_id,
        init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=DEMO`,
        sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=DEMO`,
        demo: true,
        message: 'Modo demo - configurá MP_ACCESS_TOKEN para pagos reales'
      });
    }

    const tickets = await dbAll('SELECT * FROM tickets WHERE order_id = ?', [order_id]);
    const { Preference } = require('mercadopago');
    const preference = new Preference(mp);

    const items = [];
    const stageGroups = {};
    tickets.forEach(t => {
      if (!stageGroups[t.stage_name]) stageGroups[t.stage_name] = { qty: 0, price: t.price };
      stageGroups[t.stage_name].qty++;
    });
    for (const [stage, data] of Object.entries(stageGroups)) {
      items.push({
        id: stage, title: `${order.event_title} - ${stage}`,
        quantity: data.qty, unit_price: data.price, currency_id: 'ARS'
      });
    }

    const result = await preference.create({
      body: {
        items,
        payer: { name: order.buyer_name, surname: order.buyer_lastname, email: order.buyer_email },
        external_reference: order_id,
        back_urls: {
          success: `${process.env.BASE_URL}/success?order=${order_id}`,
          failure: `${process.env.BASE_URL}/checkout?order=${order_id}&error=1`,
          pending: `${process.env.BASE_URL}/success?order=${order_id}&pending=1`
        },
        auto_return: 'approved',
        notification_url: `${process.env.BASE_URL}/api/payments/mp/webhook`,
        statement_descriptor: 'TICKETAR'
      }
    });

    await dbRun('UPDATE orders SET mp_preference_id=? WHERE id=?', [result.id, order_id]);

    res.json({
      preference_id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });
  } catch (e) {
    console.error('MP preference error:', e);
    res.status(500).json({ error: 'Error creando preferencia de pago', detail: e.message });
  }
});

// POST /api/payments/mp/webhook — Webhook de Mercado Pago
router.post('/mp/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    await dbRun('INSERT INTO mp_webhooks (payload, status) VALUES (?, ?)', [body, 'received']);

    const data = JSON.parse(body);
    if (data.type === 'payment' && data.data?.id) {
      const mp = getMP();
      if (mp) {
        try {
          const { Payment } = require('mercadopago');
          const payment = new Payment(mp);
          const paymentData = await payment.get({ id: data.data.id });

          if (paymentData.status === 'approved' && paymentData.external_reference) {
            await dbRun(
              `UPDATE orders SET payment_status='paid', mp_payment_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
              [String(data.data.id), paymentData.external_reference]
            );
            console.log(`✅ Pago aprobado: orden ${paymentData.external_reference}`);
          }
        } catch(e) { console.error('Error procesando webhook MP:', e); }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook error:', e);
    res.sendStatus(200); // Always 200 to MP
  }
});

// GET /api/payments/mp/status/:paymentId — Verificar estado de pago
router.get('/mp/status/:orderId', async (req, res) => {
  const order = await dbGet('SELECT payment_status, mp_payment_id, total FROM orders WHERE id=?', [req.params.orderId]);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(order);
});

// GET /api/payments/dashboard — Admin: resumen financiero (el admin de evento solo ve el suyo)
router.get('/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const scoped = !isGlobalAdmin(req.user);
    const evFilter = scoped ? 'WHERE event_id = ?' : '';
    const evFilterO = scoped ? 'WHERE o.event_id = ?' : '';
    const evParams = scoped ? [req.user.event_id] : [];

    const stats = await dbGet(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) as paid_orders,
        SUM(CASE WHEN payment_status='pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END) as total_revenue,
        SUM(CASE WHEN payment_status='paid' AND created_at::date = CURRENT_DATE THEN total ELSE 0 END) as today_revenue
      FROM orders ${evFilter}
    `, evParams);

    const ticketStats = await dbGet(`
      SELECT COUNT(*) as total_tickets,
        SUM(CASE WHEN validated=1 THEN 1 ELSE 0 END) as used_tickets
      FROM tickets t
      JOIN orders o ON o.id=t.order_id
      WHERE o.payment_status='paid' ${scoped ? 'AND o.event_id = ?' : ''}
    `, evParams);

    const byEvent = await dbAll(`
      SELECT e.title, e.emoji,
        COUNT(o.id) as orders,
        SUM(CASE WHEN o.payment_status='paid' THEN o.total ELSE 0 END) as revenue,
        SUM(CASE WHEN o.payment_status='paid' THEN 1 ELSE 0 END) as paid_count
      FROM events e
      LEFT JOIN orders o ON o.event_id=e.id
      ${scoped ? 'WHERE e.id = ?' : ''}
      GROUP BY e.id ORDER BY revenue DESC LIMIT 10
    `, evParams);

    const recentOrders = await dbAll(`
      SELECT o.id, o.buyer_name, o.buyer_lastname, o.total, o.payment_status, o.created_at, e.title as event_title
      FROM orders o JOIN events e ON e.id=o.event_id
      ${evFilterO}
      ORDER BY o.created_at DESC LIMIT 10
    `, evParams);

    res.json({ stats: { ...stats, ...ticketStats }, byEvent, recentOrders });
  } catch (e) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
