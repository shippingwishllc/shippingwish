const { Pool } = require('pg');

function findConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  if (process.env.POSTGRES_PRISMA_URL) return process.env.POSTGRES_PRISMA_URL;
  if (process.env.POSTGRES_URL_NON_POOLING) return process.env.POSTGRES_URL_NON_POOLING;
  
  for (const [key, value] of Object.entries(process.env)) {
    if (value && typeof value === 'string' && (value.startsWith('postgres://') || value.startsWith('postgresql://'))) {
      console.log(`[DB] Auto-detected Postgres connection string in env variable: ${key}`);
      return value;
    }
  }
  return null;
}

const connectionString = findConnectionString();

const pool = connectionString
  ? new Pool({ 
      connectionString,
      ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
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
