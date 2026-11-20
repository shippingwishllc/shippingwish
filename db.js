const { Pool } = require('pg');

function findConnectionString() {
  const keys = [
    'POSTGRES_URL',
    'DATABASE_URL',
    'POSTGRES_PRISMA_URL',
    'POSTGRES_URL_NON_POOLING',
    'DATABASE_URL_UNPOOLED',
    'NEON_DATABASE_URL',
    'NEON_POSTGRES_URL',
    'STORAGE_POSTGRES_URL',
    'STORAGE_URL'
  ];

  for (const k of keys) {
    if (process.env[k] && typeof process.env[k] === 'string' && process.env[k].trim()) {
      return process.env[k].trim();
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (value && typeof value === 'string') {
      const val = value.trim();
      if (val.startsWith('postgres://') || val.startsWith('postgresql://')) {
        console.log(`[DB] Auto-detected Postgres URL in env var: ${key}`);
        return val;
      }
    }
  }
  return null;
}

const rawConnStr = findConnectionString();

// SSL for hosted Postgres. Certificate validation is ON by default.
//   DB_SSL_MODE=disable              -> no SSL (local/dev only)
//   DB_SSL_CA=<PEM text>             -> validate against a custom CA (use \n for newlines)
//   DB_SSL_REJECT_UNAUTHORIZED=false -> explicit, logged opt-out (temporary workaround only)
function buildSslConfig() {
  if ((process.env.DB_SSL_MODE || '').toLowerCase() === 'disable') return false;
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn('[DB] SSL certificate validation is DISABLED via DB_SSL_REJECT_UNAUTHORIZED=false');
    return { rejectUnauthorized: false };
  }
  const ca = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

let pool;
if (global._pgPool) {
  pool = global._pgPool;
} else {
  if (rawConnStr) {
    const cleanConnStr = rawConnStr.replace(/[?&]sslmode=[^&]*/gi, '');
    const isLocal = cleanConnStr.includes('localhost') || cleanConnStr.includes('127.0.0.1');

    pool = new Pool({
      connectionString: cleanConnStr,
      ssl: isLocal ? false : buildSslConfig(),
      // Serverless-friendly pool: few connections per instance, short idle time,
      // and query timeouts that fail fast instead of hanging until Vercel kills the request at 60s.
      max: Number(process.env.DB_POOL_MAX) || 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 25000,
      query_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 25000
    });
  } else {
    pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'shippingwish',
      connectionTimeoutMillis: 2000
    });
  }

  global._pgPool = pool;
}

pool.on('error', (err) => {
  // Neon closes idle pooled connections; pg drops the dead client and opens a new one on demand.
  console.error('Unexpected Postgres error:', err && err.message ? err.message : err);
});

module.exports = pool;
