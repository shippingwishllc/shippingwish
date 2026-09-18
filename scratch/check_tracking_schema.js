require('dotenv').config();
const pool = require('../db');

async function main() {
  try {
    const res = await pool.query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tracking_events'
    `);
    console.log('tracking_events columns:', res.rows);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
