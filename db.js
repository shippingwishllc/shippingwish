const { Pool } = require('pg');

function findConnectionString() {
  const envKeys = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL_NON_POOLING',
    'DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL',
    'NEON_POSTGRES_URL',
    'STORAGE_POSTGRES_URL',
    'STORAGE_URL'
  ];

  for (const k of envKeys) {
    if (process.env[k] && typeof process.env[k] === 'string' && process.env[k].trim()) {
      return process.env[k].trim();
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (value && typeof value === 'string') {
      const val = value.trim();
      if (val.startsWith('postgres://') || val.startsWith('postgresql://')) {
        console.log(`[DB] Auto-detected Postgres connection string in env variable: ${key}`);
        return val;
      }
    }
  }
  return null;
}

const rawConnStr = findConnectionString();

let pool;
if (global._pgPool) {
  pool = global._pgPool;
} else {
  if (rawConnStr) {
    const cleanConnStr = rawConnStr.replace(/[?&]sslmode=[^&]*/gi, '');
    const isLocal = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');

    pool = new Pool({
      connectionString: cleanConnStr,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  } else {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'shippingwish'
    });
  }
  
  global._pgPool = pool;
}

pool.on('error', (err) => {
  console.error('Unexpected Postgres error:', err);
});

module.exports = pool;
