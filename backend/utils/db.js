// utils/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './database/ticketar.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) { console.error('Error abriendo DB:', err); process.exit(1); }
  console.log('✅ Base de datos conectada:', dbPath);
});

db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');

// Promisify helpers
const dbGet = (sql, params = []) =>
  new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));

const dbAll = (sql, params = []) =>
  new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));

const dbRun = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function(e) { e ? rej(e) : res({ lastID: this.lastID, changes: this.changes }); })
  );

module.exports = { db, dbGet, dbAll, dbRun };
