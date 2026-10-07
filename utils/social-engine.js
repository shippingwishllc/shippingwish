/**
 * utils/social-engine.js
 * 
 * 4-Brand Autonomous AI Social Media & Content Marketing Engine
 * Supported Brands:
 * 1. Shipping Wish LLC (Freight Dispatch, Fleet Ops, 0% Commission)
 * 2. LoadsNexus™ (Capacity Exchange, $19/mo Solo Pass, Verified Spot Loads)
 * 3. NYC Limo Wish (Executive Chauffeur, Airport Transfers, NYC Black Car)
 * 4. BuyWish Online (Curated E-Commerce, Smart Tech, Lifestyle Deals)
 */

const pool = require('../db');

function getOpenAiKey() {
  return (process.env.OPENAI_API_KEY || '').trim();
}

const BRANDS = {
  shippingwish: {
    name: 'Shipping Wish LLC',
    tagline: 'Dedicated Fleet Operations & 0% Commission Freight Dispatch',
    website: 'https://www.shippingwish.com',
    phone: '+1 (917) 737-0021',
    smsPhone: '+1 (609) 469-6004',
    industry: 'Freight Dispatch & Motor Carrier Operations',
    targetAudience: 'Independent Owner-Operators, Fleet Owners, CDL-A Truck Drivers (Dry Van, Reefer, Flatbed, Box Trucks)',
    valueProp: 'Flat $149/wk per truck instead of 8-10% commission. 7-Day $0 Risk-Free Trial. Instant 10-second carrier packet submission, RateCon OCR audit protection ($50/hr detention, $250 TONU), and 24/7 dedicated American dispatch team.',
    defaultHashtags: '#Trucking #OwnerOperator #FreightDispatch #TruckDrivers #Logistics #ShippingWish #CDLA #Flatbed #Reefer #DryVan',
    categories: [
      'market_conditions',
      'fmcsa_compliance',
      'profit_optimization',
      'ratecon_protection',
      'industry_news',
      'dispatch_promotional',
      'driver_lifestyle'
    ]
  },
  loadsnexus: {
    name: 'LoadsNexus™',
    tagline: 'Spot Freight Capacity Exchange & Load Board',
    website: 'https://www.loadsnexus.com',
    phone: '+1 (917) 737-0021',
    industry: 'Digital Freight Load Board & Broker Directory',
    targetAudience: 'Freight Brokers, 3PL Logistics Providers, and Motor Carriers',
    valueProp: '$19/month Solo Pass for motor carriers with 100% unmasked broker phone and email. 100% FREE spot load posting for licensed brokers with instant credit scores & Days-to-Pay rating.',
    defaultHashtags: '#LoadsNexus #FreightBrokers #LoadBoard #SpotFreight #LogisticsTech #TruckingLoads #CapacityExchange',
    categories: [
      'broker_credit_check',
      'spot_market_rates',
      'capacity_matching',
      'loadboard_transparency',
      'free_load_posting'
    ]
  },
  nyclimowish: {
    name: 'NYC Limo Wish',
    tagline: 'Premier Executive Chauffeur & Luxury Limousine Service',
    website: 'https://www.shippingwish.com/nyclimo',
    phone: '+1 (917) 737-0021',
    industry: 'Executive Ground Transportation & Black Car Fleet',
    targetAudience: 'Corporate Executives, VIP Travelers, Wedding Parties, Tourists visiting NYC/Tri-State',
    valueProp: 'JFK, EWR, LGA Airport transfers with flight monitoring, sanitized Mercedes & Cadillac luxury SUVs, licensed professional chauffeurs, fixed transparent upfront pricing, 24/7 dispatch.',
    defaultHashtags: '#NYCLimo #JFKAirport #EWR #LaGuardia #ExecutiveChauffeur #LuxuryTravel #NYCBlackCar #WallStreetTravel',
    categories: [
      'airport_transfer_tips',
      'corporate_travel',
      'manhattan_luxury',
      'vip_events_weddings',
      'chauffeur_hospitality'
    ]
  },
  buywish: {
    name: 'BuyWish Online',
    tagline: 'Curated Smart Living & Everyday Viral Essentials',
    website: 'https://www.buywishonline.com',
    phone: '+1 (917) 737-0021',
    industry: 'Modern Consumer E-Commerce & Dropshipping Catalog',
    targetAudience: 'Online Shoppers, Home Owners, Gadget Lovers looking for high-quality tested essentials',
    valueProp: 'Direct fast US fulfillment, strict quality vetting, 30-day money-back guarantee, secure Stripe checkout, trending seasonal lifestyle items at wholesale direct pricing.',
    defaultHashtags: '#BuyWish #OnlineShopping #SmartHome #TrendingGadgets #HomeEssentials #DailyDeals #ECommerce',
    categories: [
      'product_spotlight',
      'lifestyle_hacks',
      'seasonal_discounts',
      'customer_reviews',
      'smart_gadget_review'
    ]
  }
};

/**
 * Ensure database tables for Social Media
 */
async function ensureSocialSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_brand_credentials (
      id SERIAL PRIMARY KEY,
      brand VARCHAR(50) UNIQUE NOT NULL,
      facebook_page_id VARCHAR(100),
      facebook_access_token TEXT,
      instagram_account_id VARCHAR(100),
      instagram_access_token TEXT,
      linkedin_org_urn VARCHAR(100),
      linkedin_access_token TEXT,
      x_api_key VARCHAR(100),
      x_api_secret TEXT,
      x_access_token TEXT,
      x_access_secret TEXT,
      autopilot_enabled BOOLEAN DEFAULT FALSE,
      autopilot_time VARCHAR(10) DEFAULT '10:00',
      last_posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS social_posts_log (
      id SERIAL PRIMARY KEY,
      brand VARCHAR(50) NOT NULL,
      category VARCHAR(60) NOT NULL,
      platform VARCHAR(50) NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      image_prompt TEXT,
      image_url TEXT,
      external_post_id VARCHAR(150),
      status VARCHAR(30) DEFAULT 'draft', -- draft, published, failed, scheduled
      error_message TEXT,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `).catch(err => console.warn('ensureSocialSchema warning:', err.message));
}

/**
 * Generate a 100% Unique, High-Converting Social Post using OpenAI GPT-4o
 */
async function generateAiSocialPost(brandKey = 'shippingwish', category = 'market_conditions', customAngle = '') {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const key = getOpenAiKey();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured in .env');
  }

  const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `
You are the Chief Social Media & Brand Director for "${brand.name}".
Website: ${brand.website}
Phone: ${brand.phone}
Target Audience: ${brand.targetAudience}
Core Value Proposition: ${brand.valueProp}
Category: ${category}
Current Date: ${currentDate}
${customAngle ? `Specific Angle / Focus: ${customAngle}` : ''}

Generate a viral, high-authority, and highly engaging social media post suitable for LinkedIn, Facebook, and Instagram.

STRICT CONTENT CRITERIA:
1. DO NOT sound like generic marketing spam. Provide genuine, actionable, high-value industry insight first.
2. Structure the post:
   - Hook: Provocative question, surprising stat, or bold industry truth.
   - Meat: 3-4 structured bullet points with real numbers, actionable tips, or insider knowledge.
   - Value/Takeaway: Clear benefit to the reader.
   - Call to Action (CTA): Natural invitation to check out ${brand.name} (${brand.website}) or call ${brand.phone}.
   - Hashtags: 5-8 relevant, high-traffic hashtags.
3. Keep the tone authoritative, modern, confident, and professional.
4. Also create a detailed visual design concept (Image Prompt) describing what graphic banner or photography should accompany this post.

RETURN STRICT JSON ONLY:
{
  "title": "Short catchy title / internal reference (max 60 chars)",
  "hook": "Opening 1-line hook",
  "content": "Full formatted post text including bullets, emojis, CTA, and hashtags",
  "image_prompt": "Photorealistic or clean graphic banner description with company branding",
  "category_label": "Human friendly category name"
}
`;

  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an elite B2B social media marketing director for logistics and luxury enterprises. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85,
      response_format: { type: 'json_object' }
    })
  });

  const aiData = await aiRes.json();
  if (aiData.error) {
    throw new Error(`OpenAI API error: ${aiData.error.message}`);
  }

  const parsed = JSON.parse(aiData.choices[0].message.content);
  return {
    brand: brandKey,
    brand_name: brand.name,
    category,
    title: parsed.title || `${brand.name} Update`,
    content: parsed.content || '',
    image_prompt: parsed.image_prompt || '',
    category_label: parsed.category_label || category,
    created_at: new Date().toISOString()
  };
}

/**
 * Publish Post to Facebook Page using Official Graph API
 */
async function publishToFacebook(pageId, pageAccessToken, message, imageUrl = null) {
  if (!pageId || !pageAccessToken) throw new Error('Facebook Page ID and Page Access Token are required');
  
  let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  let body = {
    message,
    access_token: pageAccessToken
  };

  if (imageUrl) {
    endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
    body = {
      caption: message,
      url: imageUrl,
      access_token: pageAccessToken
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (data.error) throw new Error(`Facebook API Error: ${data.error.message}`);
  return { platform: 'facebook', id: data.id || data.post_id };
}

/**
 * Publish Post to Instagram Business using Official Graph API
 */
async function publishToInstagram(igUserId, accessToken, caption, imageUrl) {
  if (!igUserId || !accessToken) throw new Error('Instagram User ID and Access Token are required');
  if (!imageUrl) throw new Error('Instagram requires an image or video URL to publish a post');

  // Step 1: Create media container
  const containerRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken
    })
  });
  const containerData = await containerRes.json();
  if (containerData.error) throw new Error(`Instagram Media Error: ${containerData.error.message}`);

  const creationId = containerData.id;

  // Step 2: Publish media container
  const publishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: accessToken
    })
  });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`Instagram Publish Error: ${publishData.error.message}`);
  return { platform: 'instagram', id: publishData.id };
}

/**
 * Publish Post to LinkedIn Company Page using Official API
 */
async function publishToLinkedIn(orgUrn, accessToken, text) {
  if (!orgUrn || !accessToken) throw new Error('LinkedIn Org URN and Access Token are required');
  
  const formattedUrn = orgUrn.startsWith('urn:li:organization:') ? orgUrn : `urn:li:organization:${orgUrn}`;

  const payload = {
    author: formattedUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE'
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.status && data.status >= 400) {
    throw new Error(`LinkedIn API Error: ${data.message || JSON.stringify(data)}`);
  }
  return { platform: 'linkedin', id: data.id };
}

/**
 * AI Auto-Responder for Inbound Comments & DMs (100% Policy Compliant)
 */
async function generateAiCommentReply(brandKey, incomingUserComment, postContext = '') {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const key = getOpenAiKey();
  if (!key) return `Thank you for your message! Please reach out to our team at ${brand.phone} or visit ${brand.website}.`;

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are the friendly official social media community manager for "${brand.name}".
Industry: ${brand.industry}
Website: ${brand.website}
Phone: ${brand.phone}
Target Audience: ${brand.targetAudience}
Core Value Proposition: ${brand.valueProp}

A prospective client, customer, driver, or traveler just left a comment or sent a question on our official social channel.
STRICT BRAND RULES:
1. Respond warmly, concisely, and helpfully in 1 to 2 sentences.
2. Address their question strictly based on ${brand.name}'s specific services: "${brand.valueProp}".
3. Always invite them to contact us at ${brand.phone} or visit ${brand.website}.
4. Sound human, conversational, and respectful. Never mention any other company, industry, or service outside ${brand.name}.`
          },
          {
            role: 'user',
            content: `Post Context: ${postContext}\nUser's Message/Comment: "${incomingUserComment}"`
          }
        ],
        temperature: 0.7,
        max_tokens: 120
      })
    });
    const aiData = await aiRes.json();
    return (aiData.choices && aiData.choices[0]?.message?.content?.trim()) || `Thank you for reaching out to ${brand.name}! Feel free to call us at ${brand.phone}.`;
  } catch (_) {
    return `Thank you for reaching out to ${brand.name}! Call our team at ${brand.phone} or visit ${brand.website}.`;
  }
}

module.exports = {
  BRANDS,
  ensureSocialSchema,
  generateAiSocialPost,
  publishToFacebook,
  publishToInstagram,
  publishToLinkedIn,
  generateAiCommentReply
};
