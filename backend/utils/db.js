// utils/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => console.log('✅ Base de datos conectada (Postgres)'));
pool.on('error', (err) => console.error('Error inesperado en el pool de Postgres:', err));

// Las rutas escriben SQL con placeholders `?` (estilo sqlite). Postgres usa $1, $2...
// — se convierten acá para no tener que reescribir cada query de routes/*.js.
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

const dbGet = async (sql, params = []) => {
  const { rows } = await pool.query(toPgSql(sql), params);
  return rows[0];
};

const dbAll = async (sql, params = []) => {
  const { rows } = await pool.query(toPgSql(sql), params);
  return rows;
};

// Las rutas leen result.lastID tras un INSERT (patrón sqlite3). Como todas las
// tablas tienen columna `id`, se agrega RETURNING id automáticamente para
// emularlo sin tener que tocar cada INSERT de routes/*.js.
const dbRun = async (sql, params = []) => {
  const isInsert = /^\s*insert/i.test(sql);
  let pgSql = toPgSql(sql);
  if (isInsert && !/returning/i.test(pgSql)) pgSql += ' RETURNING id';
  const result = await pool.query(pgSql, params);
  return {
    lastID: isInsert ? result.rows[0]?.id : undefined,
    changes: result.rowCount
  };
};

module.exports = { pool, dbGet, dbAll, dbRun };
