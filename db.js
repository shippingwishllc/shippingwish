const { Pool } = require('pg');

// Uses either a single DATABASE_URL, or individual PG* env vars.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'shippingwish'
    });

pool.on('error', (err) => {
  console.error('Unexpected Postgres error:', err);
});

module.exports = pool;
