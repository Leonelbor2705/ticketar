// utils/initDb.js
// Crea/actualiza el esquema (todo con IF NOT EXISTS / ON CONFLICT, así que es
// seguro correrlo en cada arranque del server, no solo la primera vez) y
// siembra el admin + eventos demo. server.js llama a ensureSchema() al bootear,
// así una columna nueva (ej. congregacion_required) queda aplicada en el
// próximo deploy sin tener que correr nada a mano contra Supabase.
// También se puede correr suelto con: node utils/initDb.js
const bcrypt = require('bcryptjs');

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'vendedor' CHECK(role IN ('admin','vendedor')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- event_id NULL = admin global (sin restricción); con valor = atado a ese evento.
-- Se agrega por separado (no en el CREATE TABLE) porque events todavía no existe
-- en este punto del script y hay una referencia circular users<->events.
ALTER TABLE users ADD COLUMN IF NOT EXISTS event_id INTEGER;

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '🎪',
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '20:00',
  venue TEXT NOT NULL,
  city TEXT NOT NULL,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Si el evento pide congregación en el checkout y en la inscripción manual (ej. Congreso de Hombres)
ALTER TABLE events ADD COLUMN IF NOT EXISTS congregacion_required INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ticket_stages (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  buyer_name TEXT NOT NULL,
  buyer_lastname TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  congregacion TEXT,
  total REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'mp',
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','failed','refunded')),
  mp_payment_id TEXT,
  mp_preference_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  stage_id INTEGER NOT NULL REFERENCES ticket_stages(id),
  stage_name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_lastname TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_venue TEXT NOT NULL,
  price REAL NOT NULL,
  qr_data TEXT,
  validated INTEGER NOT NULL DEFAULT 0,
  validated_at TIMESTAMP,
  validated_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mp_webhooks (
  id SERIAL PRIMARY KEY,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'received',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets(code);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_stages_event ON ticket_stages(event_id);
CREATE INDEX IF NOT EXISTS idx_users_event ON users(event_id);
`;

async function ensureSchema(pool) {
  await pool.query(schema);
  console.log('✅ Tablas creadas correctamente');

  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(adminPass, 12);
  const adminResult = await pool.query(
    `INSERT INTO users (username, password, name, email, role)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT (username) DO NOTHING`,
    [
      process.env.ADMIN_USERNAME || 'admin',
      hash,
      process.env.ADMIN_NAME || 'Administrador',
      process.env.ADMIN_EMAIL || 'admin@ticketar.com'
    ]
  );
  console.log(adminResult.rowCount > 0 ? '✅ Usuario admin creado' : 'ℹ️  Usuario admin ya existe');

  const ev1 = await pool.query(
    `INSERT INTO events (id, title, description, emoji, date, time, venue, city) VALUES
     (1, 'Festival de Música Electrónica', 'La noche más esperada del año con los mejores DJs.', '🎵', '2025-08-14', '22:00', 'Centro Cultural Konex', 'Buenos Aires')
     ON CONFLICT (id) DO NOTHING`
  );
  if (ev1.rowCount > 0) {
    await pool.query(
      `INSERT INTO ticket_stages (event_id, name, price, quantity, sold, active, sort_order) VALUES
       (1, 'Early Bird', 3500, 100, 87, 1, 1),
       (1, 'Preventa', 5500, 200, 142, 1, 2),
       (1, 'General', 7500, 300, 0, 0, 3)`
    );
  }

  const ev2 = await pool.query(
    `INSERT INTO events (id, title, description, emoji, date, time, venue, city) VALUES
     (2, 'Obra: La Gaviota', 'Clásico de Chéjov interpretado por el elenco del Teatro San Martín.', '🎭', '2025-07-22', '20:30', 'Teatro San Martín', 'CABA')
     ON CONFLICT (id) DO NOTHING`
  );
  if (ev2.rowCount > 0) {
    await pool.query(
      `INSERT INTO ticket_stages (event_id, name, price, quantity, sold, active, sort_order) VALUES
       (2, 'Preventa', 4000, 80, 60, 1, 1),
       (2, 'General', 6000, 120, 30, 1, 2)`
    );
  }

  // Los IDs de eventos se insertaron a mano (1, 2) — hay que sincronizar la
  // secuencia del SERIAL para que el próximo evento creado por la app no choque.
  await pool.query(`SELECT setval('events_id_seq', (SELECT MAX(id) FROM events))`);

  console.log('✅ Base de datos inicializada');
}

module.exports = { ensureSchema };

// Permite seguir corriéndolo suelto: node utils/initDb.js
if (require.main === module) {
  require('dotenv').config();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  ensureSchema(pool)
    .then(() => pool.end())
    .catch((err) => { console.error('Error inicializando la base de datos:', err); process.exit(1); });
}
