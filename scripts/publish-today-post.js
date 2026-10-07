require('dotenv').config();
const pool = require('../db');
const { generateAiSocialPost, publishToFacebook } = require('../utils/social-engine');

async function main() {
  const brand = process.argv[2] || 'shippingwish';
  const category = process.argv[3] || 'market_conditions';

  console.log(`[1] Fetching credentials for brand: ${brand}...`);
  const { rows } = await pool.query('SELECT facebook_page_id, facebook_access_token FROM social_brand_credentials WHERE brand = $1', [brand]);
  if (!rows.length) throw new Error('No credentials found for brand ' + brand);
  const creds = rows[0];

  console.log(`[2] Generating high-converting AI post for ${brand} (${category})...`);
  const post = await generateAiSocialPost(brand, category);
  console.log('--- GENERATED POST TITLE ---');
  console.log(post.title);
  console.log('--- GENERATED CONTENT ---');
  console.log(post.content);

  console.log(`[3] Publishing live to Facebook Page (${creds.facebook_page_id})...`);
  const fbRes = await publishToFacebook(creds.facebook_page_id, creds.facebook_access_token, post.content);
  console.log('✅ LIVE PUBLISH SUCCESSFUL! Facebook Post ID:', fbRes.id);

  console.log('[4] Logging post in database...');
  await pool.query(
    `INSERT INTO social_posts_log (brand, category, platform, title, content, external_post_id, status, published_at)
     VALUES ($1, $2, 'facebook', $3, $4, $5, 'published', now())`,
    [brand, category, post.title, post.content, fbRes.id]
  );
  await pool.query('UPDATE social_brand_credentials SET last_posted_at = now() WHERE brand = $1', [brand]);
  console.log('✅ Logged successfully in database social_posts_log!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
