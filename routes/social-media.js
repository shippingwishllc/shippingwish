/**
 * routes/social-media.js
 * 
 * 4-Brand Social Media Command Center & AI Auto-Pilot API
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const {
  BRANDS,
  ensureSocialSchema,
  generateAiSocialPost,
  publishToFacebook,
  publishToInstagram,
  publishToLinkedIn,
  generateAiCommentReply
} = require('../utils/social-engine');

// Require staff/admin permissions
function staffOnly(req, res, next) {
  const role = req.user && req.user.role;
  if (role === 'carrier' || role === 'carrier_admin' || role === 'driver') {
    return res.status(403).json({ error: 'Staff access only' });
  }
  next();
}

/**
 * GET /api/social/brands
 * Return brands, metadata, and connection status
 */
router.get('/brands', requireAuth, staffOnly, async (req, res) => {
  try {
    await ensureSocialSchema();
    const { rows: creds } = await pool.query('SELECT * FROM social_brand_credentials');
    const credMap = {};
    for (const c of creds) {
      credMap[c.brand] = {
        facebook_connected: Boolean(c.facebook_page_id && c.facebook_access_token),
        instagram_connected: Boolean(c.instagram_account_id && c.instagram_access_token),
        linkedin_connected: Boolean(c.linkedin_org_urn && c.linkedin_access_token),
        x_connected: Boolean(c.x_api_key && c.x_access_token),
        autopilot_enabled: Boolean(c.autopilot_enabled),
        autopilot_time: c.autopilot_time || '10:00',
        last_posted_at: c.last_posted_at
      };
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
        status: credMap[key] || {
          facebook_connected: false,
          instagram_connected: false,
          linkedin_connected: false,
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
router.get('/credentials/:brand', requireAuth, staffOnly, async (req, res) => {
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
      autopilot_enabled: Boolean(c.autopilot_enabled),
      autopilot_time: c.autopilot_time || '10:00',
      last_posted_at: c.last_posted_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/credentials/:brand
 * Save API credentials and Auto-Pilot settings
 */
router.post('/credentials/:brand', requireAuth, staffOnly, async (req, res) => {
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
      x_api_key,
      x_api_secret,
      x_access_token,
      x_access_secret,
      autopilot_enabled,
      autopilot_time
    } = req.body;

    const existing = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = $1', [brand]);

    if (!existing.rows.length) {
      await pool.query(`
        INSERT INTO social_brand_credentials (
          brand, facebook_page_id, facebook_access_token,
          instagram_account_id, instagram_access_token,
          linkedin_org_urn, linkedin_access_token,
          x_api_key, x_api_secret, x_access_token, x_access_secret,
          autopilot_enabled, autopilot_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        brand,
        facebook_page_id || null,
        facebook_access_token || null,
        instagram_account_id || null,
        instagram_access_token || null,
        linkedin_org_urn || null,
        linkedin_access_token || null,
        x_api_key || null,
        x_api_secret || null,
        x_access_token || null,
        x_access_secret || null,
        Boolean(autopilot_enabled),
        autopilot_time || '10:00'
      ]);
    } else {
      const cur = existing.rows[0];
      await pool.query(`
        UPDATE social_brand_credentials SET
          facebook_page_id = COALESCE(NULLIF($2, ''), facebook_page_id),
          facebook_access_token = COALESCE(NULLIF($3, ''), facebook_access_token),
          instagram_account_id = COALESCE(NULLIF($4, ''), instagram_account_id),
          instagram_access_token = COALESCE(NULLIF($5, ''), instagram_access_token),
          linkedin_org_urn = COALESCE(NULLIF($6, ''), linkedin_org_urn),
          linkedin_access_token = COALESCE(NULLIF($7, ''), linkedin_access_token),
          x_api_key = COALESCE(NULLIF($8, ''), x_api_key),
          x_api_secret = COALESCE(NULLIF($9, ''), x_api_secret),
          x_access_token = COALESCE(NULLIF($10, ''), x_access_token),
          x_access_secret = COALESCE(NULLIF($11, ''), x_access_secret),
          autopilot_enabled = $12,
          autopilot_time = COALESCE(NULLIF($13, ''), autopilot_time),
          updated_at = now()
        WHERE brand = $1
      `, [
        brand,
        facebook_page_id,
        facebook_access_token,
        instagram_account_id,
        instagram_access_token,
        linkedin_org_urn,
        linkedin_access_token,
        x_api_key,
        x_api_secret,
        x_access_token,
        x_access_secret,
        Boolean(autopilot_enabled),
        autopilot_time
      ]);
    }

    res.json({ ok: true, message: `Social API credentials updated successfully for ${brand}!` });
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
  const clientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
  const redirectUri = (process.env.LINKEDIN_REDIRECT_URI || 'https://www.shippingwish.com/api/social/callback/linkedin').trim();
  const scope = encodeURIComponent('openid profile email w_member_social');
  
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(brand)}&scope=${scope}`;
  res.redirect(authUrl);
});

/**
 * GET /api/social/callback/linkedin
 * Handle LinkedIn OAuth callback and save token in DB
 */
router.get('/callback/linkedin', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const brand = state || 'shippingwish';

  if (error) {
    console.error('LinkedIn OAuth Error:', error, error_description);
    return res.redirect(`/social-media-hub.html?brand=${brand}&linkedin_error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`/social-media-hub.html?brand=${brand}&linkedin_error=missing_code`);
  }

  try {
    const clientId = (process.env.LINKEDIN_CLIENT_ID || '').trim();
    const clientSecret = (process.env.LINKEDIN_CLIENT_SECRET || '').trim();
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
    let authorUrn = '';

    // Fetch user profile (OpenID)
    try {
      const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const userData = await userRes.json();
      if (userData.sub) {
        authorUrn = `urn:li:person:${userData.sub}`;
      }
    } catch (uErr) {
      console.warn('Could not fetch LinkedIn userinfo:', uErr.message);
    }

    // Try fetching company organization ACLs
    try {
      const aclRes = await fetch('https://api.linkedin.com/v2/organizationalAcls?q=roleAssignee', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      const aclData = await aclRes.json();
      if (aclData.elements && aclData.elements.length > 0) {
        const orgEl = aclData.elements[0];
        if (orgEl.organization) {
          authorUrn = orgEl.organization;
        }
      }
    } catch (oErr) {
      console.warn('Could not fetch LinkedIn organization ACLs:', oErr.message);
    }

    await ensureSocialSchema();
    await pool.query(`
      INSERT INTO social_brand_credentials (brand, linkedin_access_token, linkedin_org_urn, autopilot_enabled, autopilot_time)
      VALUES ($1, $2, $3, true, '10:00')
      ON CONFLICT (brand) DO UPDATE SET
        linkedin_access_token = EXCLUDED.linkedin_access_token,
        linkedin_org_urn = COALESCE(EXCLUDED.linkedin_org_urn, social_brand_credentials.linkedin_org_urn),
        autopilot_enabled = EXCLUDED.autopilot_enabled,
        updated_at = now()
    `, [brand, accessToken, authorUrn || null]);

    res.redirect(`/social-media-hub.html?brand=${brand}&linkedin_connected=success`);
  } catch (err) {
    console.error('LinkedIn Callback Error:', err);
    res.redirect(`/social-media-hub.html?brand=${brand}&linkedin_error=${encodeURIComponent(err.message)}`);
  }
});


/**
 * POST /api/social/generate
 * Generate a fresh, unique AI social media post
 */
router.post('/generate', requireAuth, staffOnly, async (req, res) => {
  try {
    const { brand = 'shippingwish', category = 'market_conditions', custom_angle = '' } = req.body;
    const post = await generateAiSocialPost(brand, category, custom_angle);
    res.json({ ok: true, post });
  } catch (err) {
    console.error('Social generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/social/publish
 * Publish or schedule a post across selected platforms
 */
router.post('/publish', requireAuth, staffOnly, async (req, res) => {
  try {
    await ensureSocialSchema();
    const {
      brand = 'shippingwish',
      category = 'market_conditions',
      title = 'Social Post',
      content = '',
      image_url = null,
      platforms = ['facebook', 'linkedin']
    } = req.body;

    if (!content.trim()) {
      return res.status(400).json({ error: 'Post content cannot be empty' });
    }

    const { rows: credRows } = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = $1', [brand]);
    const creds = credRows[0] || {};

    const results = [];

    for (const p of platforms) {
      let extId = null;
      let status = 'published';
      let error = null;

      try {
        if (p === 'facebook') {
          if (creds.facebook_page_id && creds.facebook_access_token) {
            const fbRes = await publishToFacebook(creds.facebook_page_id, creds.facebook_access_token, content, image_url);
            extId = fbRes.id;
          } else {
            status = 'saved_draft';
            error = 'Facebook API credentials not connected. Saved to database archive.';
          }
        } else if (p === 'instagram') {
          if (creds.instagram_account_id && creds.instagram_access_token && image_url) {
            const igRes = await publishToInstagram(creds.instagram_account_id, creds.instagram_access_token, content, image_url);
            extId = igRes.id;
          } else {
            status = 'saved_draft';
            error = 'Instagram requires verified media URL and connected token. Saved to archive.';
          }
        } else if (p === 'linkedin') {
          if (creds.linkedin_org_urn && creds.linkedin_access_token) {
            const liRes = await publishToLinkedIn(creds.linkedin_org_urn, creds.linkedin_access_token, content);
            extId = liRes.id;
          } else {
            status = 'saved_draft';
            error = 'LinkedIn Org URN & token not connected. Saved to database archive.';
          }
        } else {
          status = 'saved_draft';
        }
      } catch (err) {
        status = 'failed';
        error = err.message;
      }

      // Log into database
      const insRes = await pool.query(`
        INSERT INTO social_posts_log (
          brand, category, platform, title, content, image_url, external_post_id, status, error_message, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        brand,
        category,
        p,
        title,
        content,
        image_url,
        extId,
        status,
        error,
        status === 'published' ? new Date() : null
      ]);

      results.push({ platform: p, status, external_id: extId, log_id: insRes.rows[0].id, error });
    }

    // Update last_posted_at
    await pool.query('UPDATE social_brand_credentials SET last_posted_at = now() WHERE brand = $1', [brand]).catch(() => {});

    res.json({ ok: true, results, message: `Processed post distribution for ${brand} across ${platforms.length} platform(s)` });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/social/posts
 * Fetch past social media logs and analytics
 */
router.get('/posts', requireAuth, staffOnly, async (req, res) => {
  try {
    await ensureSocialSchema();
    const brand = req.query.brand || '';
    let query = 'SELECT * FROM social_posts_log';
    const params = [];
    if (brand) {
      query += ' WHERE brand = $1';
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
router.post('/auto-reply-test', requireAuth, staffOnly, async (req, res) => {
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

module.exports = router;
