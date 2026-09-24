// server.js — TicketAR Backend
// DB en Postgres (Supabase) vía DATABASE_URL — persiste independiente del contenedor/deploy.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== SECURITY ====================
app.use(helmet({
  contentSecurityPolicy: false, // Disable for serving frontend
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.BASE_URL, /\.ticketar\.com$/]
    : '*',
  credentials: true
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { error: 'Demasiadas solicitudes, intentá más tarde' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Demasiados intentos de login' }
});

// ==================== MIDDLEWARE ====================
// Webhook needs raw body BEFORE json middleware
app.use('/api/payments/mp/webhook', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== STATIC FILES ====================
// Serve frontend from ./public. no-cache = the browser always revalidates with
// the server (ETag) before using a cached copy, so a redeploy is picked up on
// the next load instead of being silently served stale for hours.
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath, {
  index: false,
  setHeaders: (res, filePath) => {
    if (/\.(css|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// ==================== API ROUTES ====================
app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/tickets', require('./routes/tickets'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// ==================== SPA FALLBACK ====================
// All non-API routes serve the frontend index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ==================== ERROR HANDLER ====================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ==================== START ====================
// Aplica el esquema (tablas/columnas nuevas) antes de aceptar tráfico, así un
// deploy que agrega una columna no requiere correr una migración a mano.
const { pool } = require('./utils/db');
const { ensureSchema } = require('./utils/initDb');

ensureSchema(pool)
  .catch((err) => console.error('⚠️  Error aplicando el esquema de la base de datos:', err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════╗
  ║      TicketAR Backend v1.0       ║
  ║  http://localhost:${PORT}           ║
  ╚══════════════════════════════════╝
  Entorno: ${process.env.NODE_ENV || 'development'}
  DB: Postgres (${process.env.DATABASE_URL ? 'conectada' : '⚠️  DATABASE_URL no configurada'})
      `);
    });
  });

module.exports = app;
