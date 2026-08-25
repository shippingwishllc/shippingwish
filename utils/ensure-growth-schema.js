const fs = require('fs');
const path = require('path');
const pool = require('../db');

let ran = false;

async function ensureGrowthSchema() {
  if (ran) return;
  ran = true;
  const file = path.join(__dirname, '..', 'sql', 'migrations', 'v3_growth_engine.sql');
  try {
    const sql = fs.readFileSync(file, 'utf8');
    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('--'));
    let ok = 0;
    let failed = 0;
    for (const stmt of statements) {
      try {
        await pool.query(stmt.endsWith(';') ? stmt : stmt + ';');
        ok += 1;
      } catch (err) {
        failed += 1;
        console.warn('[GROWTH] statement skipped:', err.message);
      }
    }
    console.log(`[GROWTH] Schema v3 applied (${ok} ok, ${failed} skipped)`);
  } catch (err) {
    console.warn('[GROWTH] Schema apply skipped:', err.message);
  }
}

module.exports = { ensureGrowthSchema };
