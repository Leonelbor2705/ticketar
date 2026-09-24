// utils/initDb.js
// Ejecutar con: node utils/initDb.js
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbDir = path.dirname(process.env.DB_PATH || './database/ticketar.db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(process.env.DB_PATH || './database/ticketar.db');

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'vendedor' CHECK(role IN ('admin','vendedor')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '🎪',
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '20:00',
  venue TEXT NOT NULL,
  city TEXT NOT NULL,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ticket_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  stage_id INTEGER NOT NULL,
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
  validated_at DATETIME,
  validated_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (stage_id) REFERENCES ticket_stages(id)
);

CREATE TABLE IF NOT EXISTS mp_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'received',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_code ON tickets(code);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_stages_event ON ticket_stages(event_id);
`;

db.serialize(async () => {
  // Create tables
  db.exec(schema, async (err) => {
    if (err) { console.error('Error creando tablas:', err); process.exit(1); }
    console.log('✅ Tablas creadas correctamente');

    // Create admin user
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = await bcrypt.hash(adminPass, 12);
    
    db.run(
      `INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, 'admin')`,
      [
        process.env.ADMIN_USERNAME || 'admin',
        hash,
        process.env.ADMIN_NAME || 'Administrador',
        process.env.ADMIN_EMAIL || 'admin@ticketar.com'
      ],
      function(err) {
        if (err) console.error('Error creando admin:', err);
        else if (this.changes > 0) console.log('✅ Usuario admin creado:', process.env.ADMIN_USERNAME || 'admin');
        else console.log('ℹ️  Usuario admin ya existe');
      }
    );

    // Insert demo events
    db.run(`INSERT OR IGNORE INTO events (id, title, description, emoji, date, time, venue, city) VALUES
      (1, 'Festival de Música Electrónica', 'La noche más esperada del año con los mejores DJs.', '🎵', '2025-08-14', '22:00', 'Centro Cultural Konex', 'Buenos Aires')`,
      function(err) {
        if (!err && this.changes > 0) {
          db.run(`INSERT OR IGNORE INTO ticket_stages (event_id, name, price, quantity, sold, active, sort_order) VALUES
            (1, 'Early Bird', 3500, 100, 87, 1, 1),
            (1, 'Preventa', 5500, 200, 142, 1, 2),
            (1, 'General', 7500, 300, 0, 0, 3)`);
        }
      }
    );

    db.run(`INSERT OR IGNORE INTO events (id, title, description, emoji, date, time, venue, city) VALUES
      (2, 'Obra: La Gaviota', 'Clásico de Chéjov interpretado por el elenco del Teatro San Martín.', '🎭', '2025-07-22', '20:30', 'Teatro San Martín', 'CABA')`,
      function(err) {
        if (!err && this.changes > 0) {
          db.run(`INSERT OR IGNORE INTO ticket_stages (event_id, name, price, quantity, sold, active, sort_order) VALUES
            (2, 'Preventa', 4000, 80, 60, 1, 1),
            (2, 'General', 6000, 120, 30, 1, 2)`);
        }
      }
    );

    setTimeout(() => {
      db.close();
      console.log('✅ Base de datos inicializada. Ya podés ejecutar: npm start');
    }, 500);
  });
});
