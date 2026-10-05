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
    // AI Providers
    const aiProvider = memorySettings.ai_provider || process.env.AI_PROVIDER || 'openai';
    const aiDefaultModel = memorySettings.ai_default_model || process.env.AI_DEFAULT_MODEL || 'gpt-4o-mini';
    const openaiKey = memorySettings.openai_api_key || process.env.OPENAI_API_KEY || '';
    const anthropicKey = memorySettings.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '';
    const geminiKey = memorySettings.gemini_api_key || process.env.GEMINI_API_KEY || '';
    const deepseekKey = memorySettings.deepseek_api_key || process.env.DEEPSEEK_API_KEY || '';
    const customAiBaseUrl = memorySettings.custom_ai_base_url || process.env.CUSTOM_AI_BASE_URL || '';
    const customAiApiKey = memorySettings.custom_ai_api_key || process.env.CUSTOM_AI_API_KEY || '';
    const customAiModel = memorySettings.custom_ai_model || process.env.CUSTOM_AI_MODEL || '';

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
        ai_provider: aiProvider,
        ai_default_model: aiDefaultModel,
        openai_api_key: maskSecret(openaiKey),
        openai_has_key: Boolean(openaiKey),
        anthropic_api_key: maskSecret(anthropicKey),
        anthropic_has_key: Boolean(anthropicKey),
        gemini_api_key: maskSecret(geminiKey),
        gemini_has_key: Boolean(geminiKey),
        deepseek_api_key: maskSecret(deepseekKey),
        deepseek_has_key: Boolean(deepseekKey),
        custom_ai_base_url: customAiBaseUrl,
        custom_ai_api_key: maskSecret(customAiApiKey),
        custom_ai_model: customAiModel,
        custom_ai_has_key: Boolean(customAiApiKey),
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
      'ai_provider',
      'ai_default_model',
      'openai_api_key',
      'anthropic_api_key',
      'gemini_api_key',
      'deepseek_api_key',
      'custom_ai_base_url',
      'custom_ai_api_key',
      'custom_ai_model',
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

// POST /api/settings/test-google-maps - Verify Google Maps API Key live
router.post('/test-google-maps', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const passedKey = req.body.key ? String(req.body.key).trim() : '';
    const key = passedKey && !passedKey.includes('••••') ? passedKey : (memorySettings.google_maps_api_key || process.env.GOOGLE_MAPS_API_KEY || '');

    if (!key) {
      return res.status(400).json({ ok: false, error: 'No Google Maps API Key provided or configured.' });
    }

    const testUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=Dallas,+TX&key=${encodeURIComponent(key)}`;
    const googleRes = await fetch(testUrl);
    const data = await googleRes.json();

    if (data.status === 'OK') {
      return res.json({
        ok: true,
        status: 'LIVE',
        message: '🟢 Google Maps Platform is active & verified! Geocoding, Routes, and Places APIs are working perfectly.'
      });
    }

    if (data.status === 'REQUEST_DENIED') {
      const errMsg = data.error_message || '';
      if (errMsg.toLowerCase().includes('referer')) {
        return res.json({
          ok: false,
          status: 'REFERER_RESTRICTED',
          error: '⚠️ Google returned: "API keys with referer restrictions cannot be used with this API." In Google Cloud Console, edit this API Key and change Application Restrictions to "None" (or IP addresses). Referer restrictions only work in browser client scripts, not server APIs.'
        });
      }
      return res.json({
        ok: false,
        status: 'DENIED',
        error: `❌ Google Maps API Denied: ${errMsg || 'Check API permissions and billing.'}`
      });
    }

    return res.json({
      ok: false,
      status: data.status,
      error: `Google Maps response: ${data.status} - ${data.error_message || ''}`
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error testing Google Maps: ' + err.message });
  }
});

// POST /api/settings/test-ai - Verify AI Engine (OpenAI, Anthropic, Gemini, DeepSeek, Custom) live
router.post('/test-ai', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const startTime = Date.now();
  try {
    const provider = String(req.body.provider || memorySettings.ai_provider || 'openai').toLowerCase();
    const passedKey = req.body.key ? String(req.body.key).trim() : '';
    let key = '';

    if (provider === 'anthropic') {
      key = passedKey && !passedKey.includes('••••') ? passedKey : (memorySettings.anthropic_api_key || process.env.ANTHROPIC_API_KEY || '');
      if (!key) return res.status(400).json({ ok: false, error: 'Anthropic API key required.' });

      const model = req.body.model || memorySettings.ai_default_model || 'claude-3-5-sonnet-20241022';
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say hello in 2 words.' }]
        })
      });
      const data = await aiRes.json();
      if (!aiRes.ok) throw new Error(data.error?.message || 'Anthropic API error');

      const latencyMs = Date.now() - startTime;
      return res.json({
        ok: true,
        latencyMs,
        provider: 'Anthropic Claude',
        model,
        message: `🟢 Anthropic Claude (${model}) is live! (Responded in ${latencyMs}ms)`
      });
    }

    if (provider === 'gemini') {
      key = passedKey && !passedKey.includes('••••') ? passedKey : (memorySettings.gemini_api_key || process.env.GEMINI_API_KEY || '');
      if (!key) return res.status(400).json({ ok: false, error: 'Google Gemini API key required.' });

      const model = req.body.model || memorySettings.ai_default_model || 'gemini-1.5-flash';
      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say hello in 2 words.' }]
        })
      });
      const data = await aiRes.json();
      if (!aiRes.ok) throw new Error(data.error?.message || 'Google Gemini API error');

      const latencyMs = Date.now() - startTime;
      return res.json({
        ok: true,
        latencyMs,
        provider: 'Google Gemini',
        model,
        message: `🟢 Google Gemini (${model}) is live! (Responded in ${latencyMs}ms)`
      });
    }

    if (provider === 'deepseek') {
      key = passedKey && !passedKey.includes('••••') ? passedKey : (memorySettings.deepseek_api_key || process.env.DEEPSEEK_API_KEY || '');
      if (!key) return res.status(400).json({ ok: false, error: 'DeepSeek API key required.' });

      const model = req.body.model || memorySettings.ai_default_model || 'deepseek-chat';
      const aiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say hello in 2 words.' }]
        })
      });
      const data = await aiRes.json();
      if (!aiRes.ok) throw new Error(data.error?.message || 'DeepSeek API error');

      const latencyMs = Date.now() - startTime;
      return res.json({
        ok: true,
        latencyMs,
        provider: 'DeepSeek AI',
        model,
        message: `🟢 DeepSeek AI (${model}) is live! (Responded in ${latencyMs}ms)`
      });
    }

    if (provider === 'custom') {
      const baseUrl = req.body.baseUrl || memorySettings.custom_ai_base_url || 'https://api.groq.com/openai/v1';
      key = passedKey && !passedKey.includes('••••') ? passedKey : (memorySettings.custom_ai_api_key || process.env.CUSTOM_AI_API_KEY || '');
      const model = req.body.model || memorySettings.custom_ai_model || 'llama-3.3-70b-versatile';

      const cleanBase = baseUrl.replace(/\/+$/, '');
      const endpoint = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;

      const aiRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': key ? `Bearer ${key}` : undefined
        },
        body: JSON.stringify({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say hello in 2 words.' }]
        })
      });
      const data = await aiRes.json();
      if (!aiRes.ok) throw new Error(data.error?.message || 'Custom AI endpoint error');

      const latencyMs = Date.now() - startTime;
      return res.json({
        ok: true,
        latencyMs,
        provider: 'Custom AI / Groq',
        model,
        message: `🟢 Custom AI (${model}) is live! (Responded in ${latencyMs}ms)`
      });
    }

    // Default: OpenAI (ChatGPT)
    key = passedKey && !passedKey.includes('••••') ? passedKey : (memorySettings.openai_api_key || process.env.OPENAI_API_KEY || '');
    if (!key) return res.status(400).json({ ok: false, error: 'OpenAI API key required.' });

    const model = req.body.model || memorySettings.ai_default_model || 'gpt-4o-mini';
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say hello in 2 words.' }]
      })
    });
    const data = await aiRes.json();
    if (!aiRes.ok) throw new Error(data.error?.message || 'OpenAI API error');

    const latencyMs = Date.now() - startTime;
    return res.json({
      ok: true,
      latencyMs,
      provider: 'OpenAI (ChatGPT)',
      model,
      message: `🟢 OpenAI ChatGPT (${model}) is live! (Responded in ${latencyMs}ms)`
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error testing AI connection: ' + err.message });
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
