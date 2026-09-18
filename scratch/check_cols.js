require('dotenv').config();
const pool = require('../db');

async function main() {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'load_status_history'");
  console.log('load_status_history cols:', r.rows.map(x => x.column_name));
  process.exit(0);
}
main();
