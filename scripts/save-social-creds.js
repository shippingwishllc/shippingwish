require('dotenv').config();
const pool = require('../db');

const creds = [
  {
    brand: 'shippingwish',
    pageId: '110625842134996',
    token: 'EAAT980OEgBYBSvZAF2bRmdSY82NOlLGftJptc2gZBSTbrLOUUKOv8QFIvSq9ZBzDrYQdoILIrPImlXFZB1ehSfij0uH9RoyTtMAwMXPZADjgCp0XpCNYrql4ptCAIuAMfrZBDZBPQ6tVCKUwwYUlUdvTcwS3sTRo72apOD065ff72opvtK81vl4NojZBrSDoONUjHhZBomuI5AGNhIZB0yi5hyOSwkUfpiNPpApWY7jmMZD'
  },
  {
    brand: 'loadsnexus',
    pageId: '1297152946819472',
    token: 'EAAT980OEgBYBSr6MnE9ZAAZCceW2TVegaLXtE4aggE2yZBiDJB4k78rKy5v5o3co7QOkyGKSWxVlNXgG9qCITUEsC1GVaOiUHKmOprTbwktjmPCZCBmfDEqoG9FnZANuorp5dtVmJb9WncdHco8XgWPuptGBBxO8MjZBEjki8oI1PxvE8lpTEEh8PzeYC3kSVGwxkIdL6YvKT5ZB85ob1S9o9jwZBWOrrtnPMwBuFwox'
  },
  {
    brand: 'nyclimowish',
    pageId: '102796912575296',
    token: 'EAAT980OEgBYBSotRiM2hQFLqYdnVHsjhm6ZBCYUlFI4ihK9YWkIRinIxJ8b6mV8zOmMmujsaAZAaQPMI4P8apJxdNw6UKiEHKzpKQSWOBjH63ePciZCnk2GCMxgPV6kHZCQdLiesq9sdAFkUi69lk6HkAO9t3TnNCR9A1VC0OCLCgEdRGvrgqRGg8hOC9dYwM62qZCiNWydERxwIxZBrRQlxZC20LgyzVjTHDEkDJEZD'
  },
  {
    brand: 'buywish',
    pageId: '110487588698183',
    token: 'EAAT980OEgBYBSu76lrF3ezZAeA762292HeAktZA2xUuffRkSFLMxm2Ddw3uj8W7vWyZB7Y8kZCtHPKZCUtLpgYXk1gjsjHZC5TlKuZAWvcoWeMH0PjHZCV3iiGhCMeA5R14OjZAAAiZCJeZCDj8cXLQiioEs8YoKFZCjGRflZBzNib5zDaFH3PikRxRD28t5ZACBLPbNWZCvYLekDzjZCGHc7PTIo6UXYZCTsi6ZAK1e2CjjUZB9qAZD'
  }
];

async function run() {
  for (const c of creds) {
    const q = `
      INSERT INTO social_brand_credentials (brand, facebook_page_id, facebook_access_token, autopilot_enabled, autopilot_time)
      VALUES ($1, $2, $3, true, '10:00')
      ON CONFLICT (brand) DO UPDATE SET
        facebook_page_id = EXCLUDED.facebook_page_id,
        facebook_access_token = EXCLUDED.facebook_access_token,
        autopilot_enabled = EXCLUDED.autopilot_enabled,
        updated_at = now()
    `;
    await pool.query(q, [c.brand, c.pageId, c.token]);
    console.log('Saved brand:', c.brand);
  }
  console.log('All 4 brands updated successfully in DB!');
  process.exit(0);
}

run().catch(err => {
  console.error('Error saving creds:', err);
  process.exit(1);
});
