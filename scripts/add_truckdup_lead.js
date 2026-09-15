require('dotenv').config();
const pool = require('../db');

async function main() {
  const check = await pool.query("SELECT id, company_name, email FROM crm_leads WHERE email = $1", ['truckdup.operations@gmail.com']);
  if (check.rows.length > 0) {
    console.log('Lead already exists:', check.rows[0]);
    process.exit(0);
  }

  const result = await pool.query(
    `INSERT INTO crm_leads (
      company_name, owner_name, phone, email, status, notes, last_contacted_at, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, NOW(), NOW()
    ) RETURNING *`,
    [
      "Truck'd Up",
      "Sam Altman",
      "+1 215 669 3038",
      "truckdup.operations@gmail.com",
      "packet_sent",
      "Dispatch Fulfillment Partner Agreement signed at 4% base rate on 09-15-2026. Operations Manager: Sam Altman."
    ]
  );
  console.log('Successfully inserted lead:', result.rows[0]);
  process.exit(0);
}

main().catch(err => {
  console.error('Error inserting lead:', err);
  process.exit(1);
});
