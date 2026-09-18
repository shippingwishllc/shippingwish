require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const pool = require('../db');

async function check() {
  try {
    const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'brokers'");
    console.log(r.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();
