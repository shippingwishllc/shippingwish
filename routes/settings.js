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
  youtube_url: 'https://youtube.com/@shippingwish',
  gtm_container_id: 'GTM-55MF65H2',
  ga_measurement_id: 'G-X8LW2ZYJ63',
  facebook_pixel_id: ''
};

function gtmContainerId(value) {
  const id = String(value || '').trim().toUpperCase();
  return /^GTM-[A-Z0-9]+$/.test(id) ? id : '';
}

function gaMeasurementId(value) {
  const id = String(value || '').trim().toUpperCase();
  return /^G-[A-Z0-9]{4,20}$/.test(id) ? id : '';
}

function facebookPixelId(value) {
  const id = String(value || '').replace(/\s/g, '');
  return /^\d{6,20}$/.test(id) ? id : '';
}

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
    if (!gtmContainerId(memorySettings.gtm_container_id)) {
      memorySettings.gtm_container_id = DEFAULT_SETTINGS.gtm_container_id;
    }
    const storedGa = gaMeasurementId(memorySettings.ga_measurement_id);
    if (!storedGa || storedGa === 'G-LW66Y70PFE') {
      memorySettings.ga_measurement_id = DEFAULT_SETTINGS.ga_measurement_id;
    }
    if (memorySettings.facebook_pixel_id == null) memorySettings.facebook_pixel_id = '';
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
      if (typeof val !== 'string') continue;
      let stored = val;
      if (key === 'gtm_container_id') {
        stored = gtmContainerId(val);
        if (val.trim() && !stored) {
          return res.status(400).json({ error: 'Google Tag Manager ID must look like GTM-XXXXXXX.' });
        }
        if (!stored) stored = DEFAULT_SETTINGS.gtm_container_id;
      }
      if (key === 'ga_measurement_id') {
        stored = gaMeasurementId(val);
        if (val.trim() && !stored) {
          return res.status(400).json({ error: 'Google Analytics Measurement ID must look like G-XXXXXXXX.' });
        }
        if (!stored || stored === 'G-LW66Y70PFE') stored = DEFAULT_SETTINGS.ga_measurement_id;
      }
      if (key === 'facebook_pixel_id') {
        stored = facebookPixelId(val);
        if (val.trim() && !stored) {
          return res.status(400).json({ error: 'Facebook Pixel ID must be the number from Events Manager.' });
        }
      }
      memorySettings[key] = stored;
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, stored]
      );
    }

    res.json({ success: true, message: 'Website settings updated successfully.', settings: memorySettings });
  } catch (err) {
    console.error('Error updating site settings:', err);
    res.json({ success: true, message: 'Settings updated in-memory.', settings: memorySettings });
  }
});

function maskSecret(val) {
  if (!val || typeof val !== 'string') return '';
  const s = val.trim();
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

// GET /api/settings/integrations (Admin & SuperAdmin only)
router.get('/integrations', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    await loadSettingsFromDB();
    const gmapsKey = memorySettings.google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || '';
    const twilioSid = memorySettings.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID || '';
    const twilioToken = memorySettings.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN || '';
    const twilioFrom = memorySettings.twilio_from_number || process.env.TWILIO_FROM_NUMBER || '+16094696004';
    const twilioMsgSid = memorySettings.twilio_messaging_service_sid || process.env.TWILIO_MESSAGING_SERVICE_SID || '';
    const whatsappFrom = memorySettings.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM || '';
    const voipProvider = memorySettings.voip_provider || process.env.VOIP_PROVIDER || 'Vapi';
    const vapiApiKey = memorySettings.vapi_api_key || process.env.VAPI_API_KEY || '';
    const vapiPhoneId = memorySettings.vapi_phone_number_id || process.env.VAPI_PHONE_NUMBER_ID || '';
    const transferNumber = memorySettings.mightycall_transfer_number || process.env.MIGHTYCALL_TRANSFER_NUMBER || '';
    const openaiKey = memorySettings.openai_api_key || process.env.OPENAI_API_KEY || '';
    const resendKey = memorySettings.resend_api_key || process.env.RESEND_API_KEY || '';
    const emailFrom = memorySettings.email_from_address || process.env.EMAIL_FROM || 'dispatch@shippingwish.com';
    const emailFromName = memorySettings.email_from_name || 'Shipping Wish Dispatch';

    res.json({
      ok: true,
      integrations: {
        google_maps_api_key: maskSecret(gmapsKey),
        google_maps_has_key: Boolean(gmapsKey),
        twilio_account_sid: maskSecret(twilioSid),
        twilio_has_sid: Boolean(twilioSid),
        twilio_auth_token: maskSecret(twilioToken),
        twilio_has_token: Boolean(twilioToken),
        twilio_from_number: twilioFrom,
        twilio_messaging_service_sid: twilioMsgSid,
        twilio_whatsapp_from: whatsappFrom,
        voip_provider: voipProvider,
        vapi_api_key: maskSecret(vapiApiKey),
        vapi_has_key: Boolean(vapiApiKey),
        vapi_phone_number_id: vapiPhoneId,
        mightycall_transfer_number: transferNumber,
        openai_api_key: maskSecret(openaiKey),
        openai_has_key: Boolean(openaiKey),
        resend_api_key: maskSecret(resendKey),
        resend_has_key: Boolean(resendKey),
        email_from_address: emailFrom,
        email_from_name: emailFromName
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not load integrations.' });
  }
});

// PUT /api/settings/integrations (Admin & SuperAdmin only)
router.put('/integrations', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const body = req.body || {};
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const allowed = [
      'google_maps_api_key',
      'twilio_account_sid',
      'twilio_auth_token',
      'twilio_from_number',
      'twilio_messaging_service_sid',
      'twilio_whatsapp_from',
      'voip_provider',
      'vapi_api_key',
      'vapi_phone_number_id',
      'mightycall_transfer_number',
      'openai_api_key',
      'resend_api_key',
      'email_from_address',
      'email_from_name'
    ];

    for (const key of allowed) {
      if (body[key] === undefined) continue;
      const val = String(body[key] || '').trim();
      // Don't overwrite with mask dots
      if (val.includes('••••••••')) continue;
      memorySettings[key] = val;
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, val]
      );
    }

    res.json({ ok: true, message: 'API and Integration settings saved successfully.' });
  } catch (err) {
    console.error('Error saving integration settings:', err);
    res.status(500).json({ error: 'Could not save integration settings.' });
  }
});

function getAppSetting(key, fallback = '') {
  if (memorySettings && memorySettings[key] !== undefined && memorySettings[key] !== '') {
    return memorySettings[key];
  }
  const envKey = String(key || '').toUpperCase();
  if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
    return process.env[envKey];
  }
  return fallback;
}

module.exports = router;
module.exports.getAppSetting = getAppSetting;
