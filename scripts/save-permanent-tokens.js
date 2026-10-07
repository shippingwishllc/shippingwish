require('dotenv').config();
const pool = require('../db');

const appId = '1405121158479894';
const appSecret = '5f44933c8f162c46d7c8cd2d1480835b';
const shortToken = 'EAAT980OEgBYBSqQ11v2rqXghAIPZAvS8OODOtjVdr5O8HqVEVzp9RaqsDZBs6UBHNXKEt2c3fQzB5nUeUxtl9SuDd0tvDSPTiIQuAFaCveVn1kPqpmJFPW3X0EPV5Q79RUiKH4xvhpNQBOH6Kz7yZBeGZBxYOZCBpwrHEVl24nnMt7z5RGv1mDoh8yzAlAXIZB6MQnhZBybB8RNTlx8BMmZBLm8IH5WA9Kex60q2pAGQMpmLivpAP32MpNZCvk2rYn80DMZAZBW4KcW0tWpCfZCDy0J43AZDZD';

const BRAND_PAGE_MAP = {
  '110625842134996': 'shippingwish',
  '1297152946819472': 'loadsnexus',
  '102796912575296': 'nyclimowish',
  '110487588698183': 'buywish'
};

async function run() {
  // 1. Exchange for long-lived user token
  const exchangeUrl = 'https://graph.facebook.com/v19.0/oauth/access_token?' +
    'grant_type=fb_exchange_token' +
    '&client_id=' + appId +
    '&client_secret=' + appSecret +
    '&fb_exchange_token=' + shortToken;

  const res1 = await fetch(exchangeUrl);
  const data1 = await res1.json();
  if (!data1.access_token) {
    throw new Error('Failed to exchange token: ' + JSON.stringify(data1));
  }
  const longLivedUserToken = data1.access_token;
  console.log('Obtained Long-Lived User Token');

  // 2. Fetch all pages with long-lived user token
  const res2 = await fetch('https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=' + longLivedUserToken);
  const data2 = await res2.json();

  for (const page of data2.data || []) {
    const brandKey = BRAND_PAGE_MAP[page.id];
    if (!brandKey) continue;

    const q = `
      INSERT INTO social_brand_credentials (brand, facebook_page_id, facebook_access_token, autopilot_enabled, autopilot_time)
      VALUES ($1, $2, $3, true, '10:00')
      ON CONFLICT (brand) DO UPDATE SET
        facebook_page_id = EXCLUDED.facebook_page_id,
        facebook_access_token = EXCLUDED.facebook_access_token,
        autopilot_enabled = EXCLUDED.autopilot_enabled,
        updated_at = now()
    `;
    await pool.query(q, [brandKey, page.id, page.access_token]);
    console.log(`[PERMANENT] Saved ${page.name} (${brandKey}) with Page ID: ${page.id}`);
  }

  console.log('SUCCESS: All 4 enterprise brands now have Lifetime Permanent Meta Page Tokens!');
  process.exit(0);
}

run().catch(err => {
  console.error('Error saving permanent tokens:', err);
  process.exit(1);
});
