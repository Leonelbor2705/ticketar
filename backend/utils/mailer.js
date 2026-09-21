// utils/mailer.js
const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'tu-email@gmail.com') {
    console.log('📧 Email no configurado - modo demo (no se envían emails)');
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendTicketEmail({ order, tickets, event, buyer_email, buyer_name, buyer_lastname }) {
  const transporter = getTransporter();
  if (!transporter) return;

  const ticketsHtml = tickets.map((t, i) => `
    <div style="border:2px solid #033091;border-radius:12px;overflow:hidden;margin-bottom:20px;font-family:Arial,sans-serif">
      <div style="background:#033091;color:#fff;padding:20px">
        <div style="font-size:14px;color:#aac4ff">ENTRADA ${i + 1} DE ${tickets.length}</div>
        <div style="font-size:22px;font-weight:bold;margin:6px 0">${t.stage.toUpperCase()}</div>
        <div style="font-size:16px">${event?.title || order.event_title}</div>
      </div>
      <div style="padding:20px;display:flex;gap:20px;align-items:center">
        <div style="flex:1">
          <table style="font-size:14px;width:100%">
            <tr><td style="color:#666;padding:4px 0">Titular</td><td style="font-weight:bold">${buyer_name} ${buyer_lastname}</td></tr>
            <tr><td style="color:#666;padding:4px 0">Código</td><td style="font-family:monospace;color:#ed373a;font-weight:bold;font-size:16px">${t.code}</td></tr>
            <tr><td style="color:#666;padding:4px 0">Precio</td><td>$${t.price?.toLocaleString('es-AR')}</td></tr>
            <tr><td style="color:#666;padding:4px 0">Fecha</td><td>${event?.date || ''}</td></tr>
            <tr><td style="color:#666;padding:4px 0">Lugar</td><td>${event?.venue || ''}</td></tr>
          </table>
        </div>
        ${t.qr_image ? `<img src="${t.qr_image}" width="100" height="100" alt="QR ${t.code}" style="border:1px solid #eee;border-radius:8px">` : ''}
      </div>
    </div>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="background:#f4f4f4;padding:20px;font-family:Arial,sans-serif">
      <div style="max-width:600px;margin:0 auto">
        <div style="background:#033091;border-radius:12px 12px 0 0;padding:30px;text-align:center">
          <div style="color:#fff;font-size:28px;font-weight:900">Ticket<span style="color:#ed373a">AR</span></div>
          <div style="color:#aac4ff;margin-top:8px">Tu compra fue exitosa</div>
        </div>
        <div style="background:#fff;padding:30px;border-radius:0 0 12px 12px">
          <h2 style="color:#033091;margin:0 0 8px">¡Hola, ${buyer_name}!</h2>
          <p style="color:#666">Gracias por tu compra. Encontrás tus entradas a continuación.</p>
          <div style="background:#f0f4ff;border-radius:8px;padding:15px;margin:20px 0">
            <div style="font-size:13px;color:#666">Orden</div>
            <div style="font-weight:bold;color:#033091">${order.id || order.order_id}</div>
            <div style="font-size:13px;color:#666;margin-top:8px">Total</div>
            <div style="font-weight:bold;font-size:20px;color:#ed373a">$${order.total?.toLocaleString('es-AR')}</div>
          </div>
          ${ticketsHtml}
          <p style="color:#999;font-size:12px;text-align:center;margin-top:20px">
            Presentá este email o el código QR en el ingreso.<br>
            TicketAR — soporte@ticketar.com
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'TicketAR <no-reply@ticketar.com>',
    to: buyer_email,
    subject: `🎟️ Tus entradas — ${event?.title || 'TicketAR'}`,
    html
  });

  console.log(`📧 Email enviado a ${buyer_email}`);
}

module.exports = { sendTicketEmail };
