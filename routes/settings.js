const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Default fallback settings if database has not seeded settings yet
const DEFAULT_SETTINGS = {
  company_name: 'Shipping Wish LLC',
  info_email: 'info@shippingwish.com',
  support_email: 'support@shippingwish.com',
  dispatch_email: 'dispatch@shippingwish.com',
  phone_number: '+1 (917) 737-0021',
  address: '19266 Coastal Hwy, Rehoboth Beach, DE 19971',
  linkedin_url: 'https://linkedin.com/company/shippingwish',
  facebook_url: 'https://facebook.com/shippingwish',
  twitter_url: 'https://x.com/shippingwish',
  instagram_url: 'https://instagram.com/shippingwish',
  youtube_url: 'https://youtube.com/@shippingwish'
};

// Ensure settings table exists and load
let memorySettings = { ...DEFAULT_SETTINGS };

async function loadSettingsFromDB() {
  try {
    const res = await pool.query('SELECT key, value FROM site_settings');
    if (res.rows.length > 0) {
      res.rows.forEach(row => {
        memorySettings[row.key] = row.value;
      });
    }
  } catch (err) {
    // If table doesn't exist yet, fallback to memorySettings
  }
}
loadSettingsFromDB();

// GET /api/settings - Public access to website contact & social media settings
router.get('/', async (req, res) => {
  try {
    await loadSettingsFromDB();
    res.json({ success: true, settings: memorySettings });
  } catch (err) {
    res.json({ success: true, settings: memorySettings });
  }
});

// PUT /api/settings - Admin only: Update website contact info & social links
router.put('/', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const updates = req.body; // e.g. { info_email: "...", phone_number: "..." }

  try {
    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === 'string') {
        memorySettings[key] = val;
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, val]
        );
      }
    }

    res.json({ success: true, message: 'Website settings updated successfully.', settings: memorySettings });
  } catch (err) {
    console.error('Error updating site settings:', err);
    res.json({ success: true, message: 'Settings updated in-memory.', settings: memorySettings });
  }
});

module.exports = router;
