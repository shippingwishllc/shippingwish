require('dotenv').config();
const pool = require('../db');

async function run() {
  await pool.query(`
    UPDATE social_brand_credentials SET 
      linkedin_org_urn = 'urn:li:organization:99856183',
      linkedin_url = 'https://www.linkedin.com/company/99856183/',
      facebook_url = 'https://facebook.com/shippingwish',
      instagram_url = 'https://instagram.com/shippingwish',
      twitter_url = NULL
    WHERE brand = 'shippingwish';

    UPDATE social_brand_credentials SET 
      linkedin_org_urn = 'urn:li:organization:146706195',
      linkedin_url = 'https://www.linkedin.com/company/146706195/',
      facebook_url = 'https://facebook.com/1297152946819472',
      twitter_url = NULL
    WHERE brand = 'loadsnexus';

    UPDATE social_brand_credentials SET 
      linkedin_org_urn = 'urn:li:organization:87202851',
      linkedin_url = 'https://www.linkedin.com/company/87202851/',
      facebook_url = 'https://facebook.com/102796912575296',
      twitter_url = NULL
    WHERE brand = 'nyclimowish';

    UPDATE social_brand_credentials SET 
      linkedin_org_urn = 'urn:li:organization:146708156',
      linkedin_url = 'https://www.linkedin.com/company/146708156/',
      facebook_url = 'https://facebook.com/110487588698183',
      twitter_url = NULL
    WHERE brand = 'buywish';
  `);

  const { rows } = await pool.query('SELECT brand, linkedin_org_urn, linkedin_url, facebook_url, instagram_url, twitter_url FROM social_brand_credentials ORDER BY brand');
  console.log('UPDATED ROWS:');
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
