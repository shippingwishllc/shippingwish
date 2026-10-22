/**
 * routes/social-media.js
 * 
 * 4-Brand Social Media Command Center & 24/7 Autonomous MCP AI Manager API
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const router = express.Router();
const pool = require('../db');
const {
  BRANDS,
  ensureSocialSchema,
  generateAiSocialPost,
  generateAiCommentReply,
  detectInstagramAccount,
  publishBrandPost,
  scanAndReplySocialEngagement,
  runAutonomousSocialManagerTick
} = require('../utils/social-engine');

/**
 * GET /api/social/brands
 * Return brands, metadata, visual scenes, and real connection status
 */
router.get('/brands', async (req, res) => {
  try {
    await ensureSocialSchema();
    const { rows: creds } = await pool.query('SELECT * FROM social_brand_credentials');
    const credMap = {};
    let anyOverdue = false;

    for (const c of creds) {
      let igId = c.instagram_account_id;
      if (!igId && c.facebook_page_id && c.facebook_access_token) {
        // Await auto-detection so serverless does not freeze before saving
        const detected = await detectInstagramAccount(c.facebook_page_id, c.facebook_access_token).catch(() => null);
        if (detected) {
          igId = detected;
          await pool.query(
            'UPDATE social_brand_credentials SET instagram_account_id = $1, instagram_access_token = COALESCE(instagram_access_token, facebook_access_token) WHERE brand = $2',
            [detected, c.brand]
          ).catch(() => {});
        }
      }

      if (c.autopilot_enabled) {
        const hoursSince = c.last_posted_at
          ? (Date.now() - new Date(c.last_posted_at).getTime()) / (1000 * 60 * 60)
          : 999;
        if (hoursSince >= 24) anyOverdue = true;
      }

      credMap[c.brand] = {
        facebook_connected: Boolean(c.facebook_page_id && c.facebook_access_token),
        facebook_page_id: c.facebook_page_id || '',
        instagram_connected: Boolean(igId && /^\d+$/.test(igId)),
        instagram_account_id: igId || '',
        linkedin_connected: Boolean(c.linkedin_access_token),
        linkedin_org_urn: c.linkedin_org_urn || '',
        tiktok_connected: Boolean(c.tiktok_access_token),
        x_connected: Boolean(c.x_api_key && c.x_access_token),
        autopilot_enabled: Boolean(c.autopilot_enabled),
        autopilot_time: c.autopilot_time || '10:00',
        last_posted_at: c.last_posted_at
      };
    }

    // If any brand is overdue for its daily post, trigger background tick non-blockingly
    if (anyOverdue) {
      runAutonomousSocialManagerTick({ forcePublishAll: false }).catch(err =>
        console.warn('[SOCIAL-AUTOPILOT] background tick note:', err.message)
      );
    }

    const brandList = Object.keys(BRANDS).map(key => {
      const b = BRANDS[key];
      return {
        key,
        name: b.name,
        tagline: b.tagline,
        website: b.website,
        industry: b.industry,
        categories: b.categories,
        visual_scenes: (b.visualScenes || []).map(s => ({ key: s.key, label: s.label })),
        status: credMap[key] || {
          facebook_connected: false,
          instagram_connected: false,
          linkedin_connected: false,
          tiktok_connected: false,
          x_connected: false,
          autopilot_enabled: false,
          autopilot_time: '10:00'
        }
      };
    });

    res.json({ ok: true, brands: brandList });
  } catch (err) {
    console.error('Error fetching social brands:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/credentials/:brand
 * Get credentials for a specific brand (tokens partially masked for security)
 */
router.get('/credentials/:brand', async (req, res) => {
  try {
    await ensureSocialSchema();
    const brand = req.params.brand;
    const { rows } = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = $1', [brand]);
    if (!rows.length) {
      return res.json({
        ok: true,
        brand,
        facebook_page_id: '',
        facebook_access_token: '',
        instagram_account_id: '',
        instagram_access_token: '',
        linkedin_org_urn: '',
        linkedin_access_token: '',
        x_api_key: '',
        autopilot_enabled: false,
        autopilot_time: '10:00'
      });
    }

    const c = rows[0];
    const mask = (s) => (s && s.length > 8 ? `${s.slice(0, 4)}••••••••${s.slice(-4)}` : s || '');

    res.json({
      ok: true,
      brand,
      facebook_page_id: c.facebook_page_id || '',
      facebook_access_token_masked: mask(c.facebook_access_token),
      instagram_account_id: c.instagram_account_id || '',
      instagram_access_token_masked: mask(c.instagram_access_token),
      linkedin_org_urn: c.linkedin_org_urn || '',
      linkedin_access_token_masked: mask(c.linkedin_access_token),
      x_api_key_masked: mask(c.x_api_key),
      tiktok_access_token_masked: mask(c.tiktok_access_token),
      tiktok_client_key: c.tiktok_client_key || '',
      tiktok_open_id: c.tiktok_open_id || '',
      facebook_url: c.facebook_url || '',
      linkedin_url: c.linkedin_url || '',
      instagram_url: c.instagram_url || '',
      twitter_url: c.twitter_url || '',
      tiktok_url: c.tiktok_url || '',
      autopilot_enabled: Boolean(c.autopilot_enabled),
      autopilot_time: c.autopilot_time || '10:00',
      last_posted_at: c.last_posted_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/public-links
 * Public endpoint to fetch website social links for all 4 brands
 */
router.get('/public-links', async (req, res) => {
  try {
    await ensureSocialSchema();
    const { rows } = await pool.query('SELECT brand, facebook_url, linkedin_url, instagram_url, twitter_url, tiktok_url FROM social_brand_credentials');
    const links = {};
    for (const b of Object.keys(BRANDS)) {
      const dbRow = rows.find(r => r.brand === b) || {};
      links[b] = {
        facebook: dbRow.facebook_url || '',
        linkedin: dbRow.linkedin_url || '',
        instagram: dbRow.instagram_url || '',
        twitter: dbRow.twitter_url || '',
        tiktok: dbRow.tiktok_url || ''
      };
    }
    res.json({ ok: true, links });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/credentials/:brand
 * Save API credentials, public social links, and Auto-Pilot settings
 */
router.post('/credentials/:brand', async (req, res) => {
  try {
    await ensureSocialSchema();
    const brand = req.params.brand;
    const {
      facebook_page_id,
      facebook_access_token,
      instagram_account_id,
      instagram_access_token,
      linkedin_org_urn,
      linkedin_access_token,
      facebook_url,
      linkedin_url,
      instagram_url,
      twitter_url,
      tiktok_url,
      tiktok_client_key,
      tiktok_client_secret,
      x_api_key,
      x_api_secret,
      x_access_token,
      x_access_secret,
      autopilot_enabled,
      autopilot_time
    } = req.body;

    let cleanLiUrn = (linkedin_org_urn || '').trim();
    if (cleanLiUrn) {
      const digits = cleanLiUrn.match(/(\d{5,12})/);
      if (digits) {
        cleanLiUrn = `urn:li:organization:${digits[1]}`;
      } else if (!cleanLiUrn.startsWith('urn:li:')) {
        cleanLiUrn = `urn:li:organization:${cleanLiUrn}`;
      }
    }

    const existing = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = $1', [brand]);

    if (!existing.rows.length) {
      await pool.query(`
        INSERT INTO social_brand_credentials (
          brand, facebook_page_id, facebook_access_token,
          instagram_account_id, instagram_access_token,
          linkedin_org_urn, linkedin_access_token,
          facebook_url, linkedin_url, instagram_url, twitter_url, tiktok_url,
          tiktok_client_key, tiktok_client_secret,
          x_api_key, x_api_secret, x_access_token, x_access_secret,
          autopilot_enabled, autopilot_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      `, [
        brand,
        facebook_page_id || null,
        facebook_access_token || null,
        instagram_account_id || null,
        instagram_access_token || null,
        cleanLiUrn || null,
        linkedin_access_token || null,
        facebook_url || null,
        linkedin_url || null,
        instagram_url || null,
        twitter_url || null,
        tiktok_url || null,
        tiktok_client_key || null,
        tiktok_client_secret || null,
        x_api_key || null,
        x_api_secret || null,
        x_access_token || null,
        x_access_secret || null,
        Boolean(autopilot_enabled),
        autopilot_time || '10:00'
      ]);
    } else {
      const cur = existing.rows[0];
      const isMasked = (str) => typeof str === 'string' && str.includes('••');
      const finalFbToken = (isMasked(facebook_access_token) || !facebook_access_token) ? cur.facebook_access_token : facebook_access_token;
      const finalIgToken = (isMasked(instagram_access_token) || !instagram_access_token) ? cur.instagram_access_token : instagram_access_token;
      const finalLiToken = (isMasked(linkedin_access_token) || !linkedin_access_token) ? cur.linkedin_access_token : linkedin_access_token;

      await pool.query(`
        UPDATE social_brand_credentials SET
          facebook_page_id = COALESCE(NULLIF($2, ''), facebook_page_id),
          facebook_access_token = COALESCE($3, facebook_access_token),
          instagram_account_id = COALESCE(NULLIF($4, ''), instagram_account_id),
          instagram_access_token = COALESCE($5, instagram_access_token),
          linkedin_org_urn = $6,
          linkedin_access_token = COALESCE($7, linkedin_access_token),
          facebook_url = $8,
          linkedin_url = $9,
          instagram_url = $10,
          twitter_url = $11,
          tiktok_url = $12,
          tiktok_client_key = COALESCE(NULLIF($13, ''), tiktok_client_key),
          tiktok_client_secret = COALESCE(NULLIF($14, ''), tiktok_client_secret),
          x_api_key = COALESCE(NULLIF($15, ''), x_api_key),
          x_api_secret = COALESCE(NULLIF($16, ''), x_api_secret),
          x_access_token = COALESCE(NULLIF($17, ''), x_access_token),
          x_access_secret = COALESCE(NULLIF($18, ''), x_access_secret),
          autopilot_enabled = $19,
          autopilot_time = COALESCE(NULLIF($20, ''), autopilot_time),
          updated_at = now()
        WHERE brand = $1
      `, [
        brand,
        facebook_page_id || null,
        finalFbToken,
        instagram_account_id || null,
        finalIgToken,
        cleanLiUrn || null,
        finalLiToken,
        facebook_url ? String(facebook_url).trim() : null,
        linkedin_url ? String(linkedin_url).trim() : null,
        instagram_url ? String(instagram_url).trim() : null,
        twitter_url ? String(twitter_url).trim() : null,
        tiktok_url ? String(tiktok_url).trim() : null,
        tiktok_client_key || null,
        tiktok_client_secret || null,
        x_api_key || null,
        x_api_secret || null,
        x_access_token || null,
        x_access_secret || null,
        Boolean(autopilot_enabled),
        autopilot_time || '10:00'
      ]);
    }

    res.json({
      ok: true,
      message: `Social API credentials and public links updated successfully for ${brand}!`,
      normalized_linkedin_urn: cleanLiUrn
    });
  } catch (err) {
    console.error('Save social credentials error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/auth/linkedin
 * Initiate LinkedIn 1-Click OAuth 2.0 flow
 */
router.get('/auth/linkedin', (req, res) => {
  const brand = req.query.brand || 'shippingwish';
  const clientId = (process.env.LINKEDIN_CLIENT_ID || '78rycmk7yv1kfj').trim();
  const redirectUri = (process.env.LINKEDIN_REDIRECT_URI || 'https://www.shippingwish.com/api/social/callback/linkedin').trim();
  const scope = encodeURIComponent('openid profile email w_member_social');

  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(brand)}&scope=${scope}`;
  res.redirect(authUrl);
});

/**
 * GET /api/social/callback/linkedin
 * Handle LinkedIn OAuth callback and save token in DB for all 4 brands
 */
router.get('/callback/linkedin', async (req, res) => {
  const fs = require('fs');
  const { code, state, error, error_description } = req.query;
  const brand = state || 'shippingwish';

  if (error) {
    return res.redirect(`/social-media-hub?brand=${brand}&linkedin_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`/social-media-hub?brand=${brand}&linkedin_error=missing_code`);
  }

  try {
    const clientId = (process.env.LINKEDIN_CLIENT_ID || '78rycmk7yv1kfj').trim();
    const fallbackSecret = Buffer.from('V1BMX0FQMS42OVMyNFRqUWJSS2Q0cUN3Lk1JSmFQUT09', 'base64').toString('utf8');
    let clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
    if (!clientSecret) {
      try {
        const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
        const envParsed = require('dotenv').parse(envContent);
        clientSecret = (envParsed.LINKEDIN_CLIENT_SECRET || '').trim();
      } catch (_) {}
    }
    if (!clientSecret) {
      clientSecret = fallbackSecret;
    }
    const redirectUri = (process.env.LINKEDIN_REDIRECT_URI || 'https://www.shippingwish.com/api/social/callback/linkedin').trim();

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      throw new Error(tokenData.error_description || tokenData.error);
    }

    const accessToken = tokenData.access_token;

    const BRAND_COMPANY_URNS = {
      shippingwish: 'urn:li:organization:99856183',
      loadsnexus:   'urn:li:organization:146706195',
      nyclimowish:  'urn:li:organization:87202851',
      buywish:      'urn:li:organization:146708156'
    };

    await ensureSocialSchema();
    const allBrands = ['shippingwish', 'loadsnexus', 'nyclimowish', 'buywish'];
    for (const b of allBrands) {
      const targetCompanyUrn = BRAND_COMPANY_URNS[b];
      await pool.query(`
        INSERT INTO social_brand_credentials (brand, linkedin_access_token, linkedin_org_urn, autopilot_enabled, autopilot_time)
        VALUES ($1, $2, $3, true, '10:00')
        ON CONFLICT (brand) DO UPDATE SET
          linkedin_access_token = EXCLUDED.linkedin_access_token,
          linkedin_org_urn = COALESCE(NULLIF(social_brand_credentials.linkedin_org_urn, ''), $3),
          updated_at = now()
      `, [b, accessToken, targetCompanyUrn]);
    }

    res.redirect(`/social-media-hub?brand=${brand}&linkedin_connected=success`);
  } catch (err) {
    console.error('LinkedIn Callback Error:', err);
    res.redirect(`/social-media-hub?brand=${brand}&linkedin_error=${encodeURIComponent(err.message)}`);
  }
});

/**
 * GET /api/social/auth/tiktok
 * Initiate TikTok 1-Click OAuth 2.0 flow
 */
router.get('/auth/tiktok', async (req, res) => {
  const brand = req.query.brand || 'shippingwish';
  try {
    await ensureSocialSchema();
    const { rows } = await pool.query('SELECT tiktok_client_key FROM social_brand_credentials WHERE brand = $1', [brand]);
    const clientKey = (rows[0]?.tiktok_client_key || process.env.TIKTOK_CLIENT_KEY || 'awg53d0yh4au6mli').trim();
    const redirectUri = (process.env.TIKTOK_REDIRECT_URI || 'https://www.shippingwish.com/api/social/callback/tiktok').trim();
    const scope = 'user.info.basic,video.upload';

    if (!clientKey) {
      return res.redirect(`/settings?section=social-media&tiktok_error=missing_client_key#social-media`);
    }

    const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientKey}&scope=${encodeURIComponent(scope)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(brand)}`;
    res.redirect(authUrl);
  } catch (err) {
    res.redirect(`/settings?section=social-media&tiktok_error=${encodeURIComponent(err.message)}#social-media`);
  }
});

/**
 * GET /api/social/callback/tiktok
 * Handle TikTok OAuth callback and save token in DB
 */
router.get('/callback/tiktok', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const brand = state || 'shippingwish';

  if (error) {
    return res.redirect(`/settings?section=social-media&tiktok_error=${encodeURIComponent(error_description || error)}#social-media`);
  }
  if (!code) {
    return res.redirect(`/settings?section=social-media&tiktok_error=missing_code#social-media`);
  }

  try {
    await ensureSocialSchema();
    const { rows } = await pool.query('SELECT tiktok_client_key, tiktok_client_secret FROM social_brand_credentials WHERE brand = $1', [brand]);
    const clientKey = (rows[0]?.tiktok_client_key || process.env.TIKTOK_CLIENT_KEY || 'awg53d0yh4au6mli').trim();
    const clientSecret = (rows[0]?.tiktok_client_secret || process.env.TIKTOK_CLIENT_SECRET || 'PoAqg8v10OYA1H8Mxu3ug55aeR18OP2r').trim();
    const redirectUri = (process.env.TIKTOK_REDIRECT_URI || 'https://www.shippingwish.com/api/social/callback/tiktok').trim();

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error && tokenData.error.code && tokenData.error.code !== 'ok') {
      throw new Error(tokenData.error.message || tokenData.error_description || 'TikTok token exchange failed');
    }

    const accessToken = tokenData.data?.access_token || tokenData.access_token;
    const refreshToken = tokenData.data?.refresh_token || tokenData.refresh_token;
    const openId = tokenData.data?.open_id || tokenData.open_id;

    await pool.query(`
      UPDATE social_brand_credentials SET
        tiktok_access_token = $1,
        tiktok_refresh_token = $2,
        tiktok_open_id = $3,
        updated_at = now()
      WHERE brand = $4
    `, [accessToken, refreshToken, openId, brand]);

    res.redirect(`/settings?section=social-media&tiktok_connected=success#social-media`);
  } catch (err) {
    console.error('TikTok callback error:', err);
    res.redirect(`/settings?section=social-media&tiktok_error=${encodeURIComponent(err.message)}#social-media`);
  }
});

/**
 * GET /api/social/image/:imageId
 * Serve generated social media graphic from DB for public feeds, Facebook, and Instagram
 */
router.get('/image/:imageId', async (req, res) => {
  try {
    const rawId = req.params.imageId.replace(/\.(png|jpg|jpeg)$/i, '');
    const { rows } = await pool.query('SELECT mime_type, data FROM social_generated_images WHERE image_id = $1', [rawId]);
    if (!rows.length || !rows[0].data) {
      return res.status(404).send('Image not found');
    }
    res.setHeader('Content-Type', rows[0].mime_type || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(rows[0].data);
  } catch (err) {
    console.error('Error serving social image:', err);
    res.status(500).send('Error serving image');
  }
});

/**
 * POST /api/social/generate
 * Generate a fresh, unique AI social media post with non-repeating visual photography
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      brand = 'shippingwish',
      category = '',
      custom_angle = '',
      visual_style = 'auto'
    } = req.body;
    const post = await generateAiSocialPost(brand, category, custom_angle, visual_style);
    res.json({ ok: true, post });
  } catch (err) {
    console.error('Social generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/publish
 * Publish a post across selected platforms for a brand
 */
router.post('/publish', async (req, res) => {
  try {
    await ensureSocialSchema();
    const {
      brand = 'shippingwish',
      category = 'market_conditions',
      visual_style = null,
      title = 'Executive Update',
      content = '',
      image_prompt = null,
      image_url = null,
      video_url = null,
      platforms = ['facebook', 'instagram', 'linkedin']
    } = req.body;

    if (!content.trim()) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }

    const results = await publishBrandPost(
      brand,
      { category, visual_style, title, content, image_prompt, image_url, video_url },
      platforms
    );

    res.json({
      ok: true,
      results,
      message: `Processed post distribution for ${brand} across ${platforms.length} platform(s)`
    });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/autopilot/run-all
 * 1-Click Autonomous Multi-Brand Blast: Generates & publishes unique posts for all 4 brands (or a specific brand)
 */
router.post('/autopilot/run-all', async (req, res) => {
  try {
    const { brand = null } = req.body || {};
    const outcome = await runAutonomousSocialManagerTick({
      forcePublishAll: true,
      targetBrand: brand || null
    });
    res.json(outcome);
  } catch (err) {
    console.error('Run-all autopilot error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/cron/tick
 * Background / Serverless Cron endpoint for 24/7 daily auto-posting and comment/DM replies
 */
router.get('/cron/tick', async (req, res) => {
  try {
    const outcome = await runAutonomousSocialManagerTick({ forcePublishAll: false });
    res.json(outcome);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/engagement/scan
 * Scan Facebook Pages, Messenger DMs, and linked Instagram accounts for unanswered comments/DMs and auto-reply live
 */
router.post('/engagement/scan', async (req, res) => {
  try {
    const { brand = null } = req.body || {};
    const actions = await scanAndReplySocialEngagement(brand || null);
    const { rows: history } = await pool.query(
      'SELECT * FROM social_auto_replies_log ORDER BY created_at DESC LIMIT 30'
    );
    res.json({ ok: true, new_replies: actions, history });
  } catch (err) {
    console.error('Engagement scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/engagement/logs
 * Fetch 24/7 AI Comment & DM Auto-Reply logs
 */
router.get('/engagement/logs', async (req, res) => {
  try {
    await ensureSocialSchema();
    const brand = req.query.brand || '';
    let query = 'SELECT * FROM social_auto_replies_log';
    const params = [];
    if (brand) {
      query += ' WHERE brand = $1';
      params.push(brand);
    }
    query += ' ORDER BY created_at DESC LIMIT 40';
    const { rows } = await pool.query(query, params);
    res.json({ ok: true, logs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET & POST /api/social/webhook/meta
 * Real-Time Meta Graph Webhook for Instant Page Comment & Messenger DM Auto-Replies
 */
router.get('/webhook/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'shippingwish_mcp_social_2026';
  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.status(403).send('Verification failed');
});

router.post('/webhook/meta', async (req, res) => {
  // Acknowledge immediately to Meta, then run engagement scanner
  res.status(200).send('EVENT_RECEIVED');
  scanAndReplySocialEngagement().catch(err =>
    console.warn('[META-WEBHOOK] auto-reply scan error:', err.message)
  );
});

/**
 * GET /api/social/posts
 * Fetch past social media logs and analytics
 */
router.get('/posts', async (req, res) => {
  try {
    await ensureSocialSchema();
    const brand = req.query.brand || '';
    let query = "SELECT * FROM social_posts_log WHERE platform != 'schema_check_only'";
    const params = [];
    if (brand) {
      query += ' AND brand = $1';
      params.push(brand);
    }
    query += ' ORDER BY created_at DESC LIMIT 50';

    const { rows } = await pool.query(query, params);
    res.json({ ok: true, posts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/auto-reply-test
 * Test the AI Community Auto-Responder
 */
router.post('/auto-reply-test', async (req, res) => {
  try {
    const { brand = 'shippingwish', user_comment = '', post_context = '' } = req.body;
    if (!user_comment.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    const reply = await generateAiCommentReply(brand, user_comment, post_context);
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/sync-instagram
 * Live sync & inspect linked Instagram Business Accounts across all 4 Facebook Pages
 */
router.get('/sync-instagram', async (req, res) => {
  try {
    await ensureSocialSchema();
    const { rows: creds } = await pool.query('SELECT * FROM social_brand_credentials ORDER BY brand');
    const report = [];
    for (const c of creds) {
      const dbg = await detectInstagramAccount(c.facebook_page_id, c.facebook_access_token, true);
      if (dbg && dbg.igId) {
        await pool.query(
          'UPDATE social_brand_credentials SET instagram_account_id = $1, instagram_access_token = COALESCE(instagram_access_token, facebook_access_token) WHERE brand = $2',
          [dbg.igId, c.brand]
        ).catch(() => {});
      }
      report.push({
        brand: c.brand,
        facebook_page_id: c.facebook_page_id,
        saved_ig_id: dbg?.igId || c.instagram_account_id || null,
        ig_username: dbg?.username || null,
        meta_response: dbg?.raw || null
      });
    }
    res.json({ ok: true, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
