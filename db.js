const { Pool } = require('pg');

const connectionString = 
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.NEON_POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_POSTGRES_URL ||
  process.env.STORAGE_URL;

const pool = connectionString
  ? new Pool({ 
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    })
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
