/**
 * utils/social-engine.js
 * 
 * 4-Brand Autonomous AI Social Media & 24/7 MCP Community Manager Engine
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
    defaultSocialUrls: {
      facebook: 'https://facebook.com/shippingwish',
      linkedin: 'https://linkedin.com/company/shippingwish',
      instagram: 'https://instagram.com/shippingwish',
      twitter: 'https://x.com/shippingwish'
    },
    categories: [
      'market_conditions',
      'fmcsa_compliance',
      'profit_optimization',
      'ratecon_protection',
      'industry_news',
      'dispatch_promotional',
      'driver_lifestyle'
    ],
    visualScenes: [
      {
        key: 'cinematic_mountain_pass',
        label: 'Cinematic Highway Photography (Leica 85mm)',
        prompt: 'Authentic National Geographic / Leica SL2 documentary photograph of a gleaming modern American long-nose Peterbilt 389 semi-truck hauling a clean white 53ft trailer through a scenic Rocky Mountain interstate pass at golden hour sunrise, crisp asphalt, dramatic natural clouds, shallow depth of field, zero text overlays, zero logos, photorealistic editorial quality.'
      },
      {
        key: 'command_center_ops',
        label: 'Executive Dispatch Operations Center',
        prompt: 'High-end architectural editorial photograph inside a modern glass-walled American freight logistics command center at twilight, warm ambient lighting, multiple ultra-wide curved monitors displaying live US interstate GPS route maps and freight telemetry charts, a focused senior dispatcher with headset reviewing a route, shot on Sony A7R V 35mm lens, zero text overlays, photorealistic.'
      },
      {
        key: 'driver_sunrise_inspection',
        label: 'Owner-Operator Pre-Trip at Dawn',
        prompt: 'Authentic editorial portrait photograph of a confident experienced American owner-operator truck driver in a clean work jacket doing a morning walk-around inspection beside a polished Kenworth W990 at a modern travel plaza at dawn, warm golden morning sunbeams, steam rising from a coffee thermos, Leica documentary realism, zero text overlays.'
      },
      {
        key: 'intermodal_port_aerial',
        label: 'Aerial Drone Supply Chain Hub',
        prompt: 'Breathtaking high-altitude DJI Inspire 3 aerial drone photograph of a massive modern American logistics distribution hub and highway interchange at sunset, rows of pristine white 53ft dry van and reefer trailers, glowing highway light trails, ultra-sharp architectural composition, zero text overlays.'
      },
      {
        key: 'cab_windshield_perspective',
        label: 'Inside-the-Cab Open Road View',
        prompt: 'First-person editorial photograph taken from inside the leather-trimmed cab of a modern Freightliner Cascadia looking out through the clean windshield onto a wide open American desert interstate in Arizona at sunset, glowing dashboard telemetry, crisp highway horizon, warm cinematic color grading, zero text overlays.'
      },
      {
        key: 'flatbed_industrial_haul',
        label: 'Heavy Industrial Flatbed Haul',
        prompt: 'Editorial commercial photograph of a heavy-duty American flatbed semi-truck securely strapped with industrial steel coils pulling out of a modern American steel mill at golden hour, dramatic rim lighting, crisp detail on chains and chrome, shot on medium format Hasselblad camera, zero text overlays.'
      }
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
    defaultSocialUrls: {
      facebook: 'https://facebook.com/1297152946819472',
      linkedin: 'https://linkedin.com/company/loadsnexus',
      instagram: 'https://instagram.com/loadsnexus',
      twitter: 'https://x.com/loadsnexus'
    },
    categories: [
      'broker_credit_check',
      'spot_market_rates',
      'capacity_matching',
      'loadboard_transparency',
      'free_load_posting'
    ],
    visualScenes: [
      {
        key: 'brokerage_trading_floor',
        label: 'Modern Freight Brokerage Trading Floor',
        prompt: 'Editorial architectural photograph of a sleek modern Chicago freight brokerage headquarters, analysts and freight brokers collaborating around glass desks with ultra-wide screens showing US freight lane heatmaps and capacity charts, natural daylight through floor-to-ceiling windows, Bloomberg Businessweek photography style, zero text overlays.'
      },
      {
        key: 'interstate_corridor_drone',
        label: 'US Freight Corridor Aerial Shot',
        prompt: 'Stunning aerial drone photograph of a major US interstate highway bridge over a river at blue hour, several modern semi-trucks moving smoothly across the bridge with warm headlights, vibrant sky, high-end logistics technology editorial look, zero text overlays.'
      },
      {
        key: 'carrier_tablet_booking',
        label: 'Owner-Operator Booking Spot Load on Tablet',
        prompt: 'Close-up over-the-shoulder editorial photograph of a truck driver sitting in a modern truck cab holding an iPad Pro displaying a clean dark-mode freight load map with glowing route lines across the USA, natural window light, shallow depth of field, zero text overlays.'
      },
      {
        key: 'warehouse_loading_dock',
        label: 'High-Tech Distribution Center Bays',
        prompt: 'Crisp wide-angle architectural photograph of a state-of-the-art automated logistics fulfillment warehouse with clean concrete floors, electric forklifts loading pallets into 53ft trailers at bright loading bays, Fortune-500 supply chain photography, zero text overlays.'
      }
    ]
  },
  nyclimowish: {
    name: 'NYC Limo Wish',
    tagline: 'Premier Executive Chauffeur & Luxury Limousine Service',
    website: 'https://www.nyclimowish.com',
    phone: '+1 (917) 737-0021',
    industry: 'Executive Ground Transportation & Black Car Fleet',
    targetAudience: 'Corporate Executives, VIP Travelers, Wedding Parties, Tourists visiting NYC/Tri-State',
    valueProp: 'JFK, EWR, LGA Airport transfers with flight monitoring, sanitized Mercedes-Maybach & Cadillac Escalade ESV luxury fleet, TLC-licensed professional chauffeurs, fixed transparent upfront pricing, 24/7 dispatch.',
    defaultHashtags: '#NYCLimo #JFKAirport #EWR #LaGuardia #ExecutiveChauffeur #LuxuryTravel #NYCBlackCar #WallStreetTravel',
    defaultSocialUrls: {
      facebook: 'https://facebook.com/102796912575296',
      linkedin: 'https://linkedin.com/company/nyclimowish',
      instagram: 'https://instagram.com/nyclimowish',
      twitter: 'https://x.com/nyclimowish'
    },
    categories: [
      'airport_transfer_tips',
      'corporate_travel',
      'manhattan_luxury',
      'vip_events_weddings',
      'chauffeur_hospitality'
    ],
    visualScenes: [
      {
        key: 'manhattan_twilight_escalade',
        label: 'Manhattan Twilight Cadillac Escalade ESV',
        prompt: 'Ultra-luxury Conde Nast Traveler editorial photograph of a pristine black 2026 Cadillac Escalade ESV parked outside a prestigious glass skyscraper on Park Avenue in Midtown Manhattan at twilight, warm golden hotel portico lights reflecting off black paint, a white-gloved chauffeur in a tailored charcoal suit holding the rear door open, Leica 50mm f/1.2, zero text overlays.'
      },
      {
        key: 'jfk_private_tarmac',
        label: 'Private Jet & Executive Black Car Transfer',
        prompt: 'Luxury aviation & executive travel editorial photograph of a sleek black Mercedes-Benz S-Class sedan waiting on a wet private aviation tarmac at sunset beside a Gulfstream business jet, warm sunset reflections, cinematic depth of field, zero text overlays.'
      },
      {
        key: 'first_class_rear_cabin',
        label: 'First-Class Leather Cabin Interior',
        prompt: 'Interior luxury lifestyle photograph inside the rear executive cabin of a black Mercedes-Maybach S580 driving across the Brooklyn Bridge at night, quilted cognac leather reclining seats, soft ambient cabin lighting, blurred Manhattan skyline lights through the panoramic glass, zero text overlays.'
      },
      {
        key: 'vip_gala_arrival',
        label: 'Fifth Avenue VIP Evening Arrival',
        prompt: 'Sophisticated editorial photograph of a luxury black executive SUV arriving at a historic Fifth Avenue landmark hotel in New York City during a soft evening rain, warm streetlamp bokeh reflections on cobblestones, timeless Vogue / Robb Report aesthetic, zero text overlays.'
      }
    ]
  },
  buywish: {
    name: 'BuyWish Online',
    tagline: 'Curated Smart Living & Everyday Viral Essentials',
    website: 'https://www.buywishonline.com',
    phone: '+1 (917) 737-0021',
    industry: 'Modern Consumer E-Commerce & Lifestyle Catalog',
    targetAudience: 'Online Shoppers, Home Owners, Gadget Lovers looking for high-quality tested essentials',
    valueProp: 'Direct fast US fulfillment, strict quality vetting, 30-day money-back guarantee, secure Stripe checkout, trending smart home, wellness, kitchen, and tech essentials.',
    defaultHashtags: '#BuyWishOnline #SmartHome #ModernLiving #TechEssentials #HomeUpgrade #CuratedFinds #EverydayLuxury',
    defaultSocialUrls: {
      facebook: 'https://facebook.com/110487588698183',
      linkedin: 'https://linkedin.com/company/buywishonline',
      instagram: 'https://instagram.com/buywishonline',
      twitter: 'https://x.com/buywishonline'
    },
    categories: [
      'product_spotlight',
      'lifestyle_hacks',
      'seasonal_discounts',
      'customer_reviews',
      'smart_gadget_review'
    ],
    visualScenes: [
      {
        key: 'minimalist_smart_home_studio',
        label: 'Apple / Architectural Digest Smart Home Flatlay',
        prompt: 'High-end Architectural Digest / Kinfolk magazine lifestyle studio photograph of a sunlit minimalist modern home desk and countertop featuring sleek wireless smart tech accessories, warm oak wood, matte ceramic coffee cup, soft natural morning shadows through linen curtains, shot on Hasselblad medium format, zero text overlays.'
      },
      {
        key: 'modern_kitchen_wellness',
        label: 'Modern Culinary & Wellness Countertop',
        prompt: 'Bright, airy editorial lifestyle photograph of a luxury marble kitchen island with modern minimalist smart kitchen gadgets, fresh organic greens, warm morning sunlight, crisp studio depth of field, Crate & Barrel / Williams Sonoma editorial style, zero text overlays.'
      },
      {
        key: 'cozy_ambient_living',
        label: 'Scandinavian Smart Ambient Living Room',
        prompt: 'Warm inviting interior design photograph of a modern Scandinavian living room at dusk illuminated by sleek minimalist smart LED ambient lighting, plush boucle sofa, curated coffee table accessories, ultra-clean aesthetic, zero text overlays.'
      },
      {
        key: 'unboxing_premium_package',
        label: 'Premium Curated E-Commerce Unboxing',
        prompt: 'Editorial overhead lifestyle photograph of hands opening a crisp minimalist matte-black and warm kraft luxury e-commerce gift box on a clean travertine stone table, revealing sleek modern lifestyle gadgets wrapped in tissue paper, natural studio lighting, zero text overlays.'
      }
    ]
  }
};

/**
 * Ensure database tables for Social Media & 24/7 Autonomous Auto-Responder
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
      facebook_url TEXT,
      linkedin_url TEXT,
      instagram_url TEXT,
      twitter_url TEXT,
      autopilot_enabled BOOLEAN DEFAULT FALSE,
      autopilot_time VARCHAR(10) DEFAULT '10:00',
      last_posted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS facebook_url TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS instagram_url TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS twitter_url TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS tiktok_access_token TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS tiktok_open_id VARCHAR(120);
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS tiktok_client_key VARCHAR(100);
    ALTER TABLE social_brand_credentials ADD COLUMN IF NOT EXISTS tiktok_client_secret TEXT;

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
      status VARCHAR(30) DEFAULT 'draft',
      error_message TEXT,
      likes_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE social_posts_log ADD COLUMN IF NOT EXISTS visual_style VARCHAR(80);
    ALTER TABLE social_posts_log ADD COLUMN IF NOT EXISTS image_prompt TEXT;
    ALTER TABLE social_posts_log ADD COLUMN IF NOT EXISTS image_url TEXT;
    ALTER TABLE social_posts_log ADD COLUMN IF NOT EXISTS external_post_id VARCHAR(150);
    ALTER TABLE social_posts_log ADD COLUMN IF NOT EXISTS error_message TEXT;
    ALTER TABLE social_posts_log ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS social_generated_images (
      id SERIAL PRIMARY KEY,
      image_id VARCHAR(100) UNIQUE NOT NULL,
      mime_type VARCHAR(50) DEFAULT 'image/png',
      data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS social_auto_replies_log (
      id SERIAL PRIMARY KEY,
      brand VARCHAR(50) NOT NULL,
      platform VARCHAR(40) NOT NULL,
      interaction_type VARCHAR(30) NOT NULL DEFAULT 'comment',
      external_object_id VARCHAR(180) UNIQUE NOT NULL,
      parent_post_id VARCHAR(180),
      sender_name TEXT,
      sender_id VARCHAR(120),
      incoming_text TEXT NOT NULL,
      ai_reply_text TEXT NOT NULL,
      reply_external_id VARCHAR(180),
      status VARCHAR(30) DEFAULT 'replied',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `).catch(err => console.warn('ensureSocialSchema warning:', err.message));

  // Clean up any diagnostic schema check rows
  await pool.query(`DELETE FROM social_posts_log WHERE platform = 'schema_check_only'`).catch(() => {});
}

/**
 * Format & clean social copy: strip markdown asterisks, clean links, ensure double spacing
 */
function cleanSocialCopy(text) {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$1: $2')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/^(🔥\s*)?100%\s+Unique\s+AI\s+Post[^\n]*\n+/i, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Fetch recent post history for a brand so AI NEVER repeats topics, hooks, or visual scenes
 */
async function getRecentBrandPostHistory(brandKey, limit = 12) {
  try {
    await ensureSocialSchema();
    const { rows } = await pool.query(
      `SELECT category, title, visual_style, left(content, 160) AS hook_snippet, image_prompt, created_at
       FROM social_posts_log
       WHERE brand = $1 AND status = 'published'
       ORDER BY created_at DESC
       LIMIT $2`,
      [brandKey, limit]
    );
    return rows;
  } catch (_) {
    return [];
  }
}

/**
 * Pick the next non-repeating visual scene for a brand
 */
function pickNextVisualScene(brandKey, requestedStyleKey, recentRows = []) {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const scenes = brand.visualScenes || BRANDS.shippingwish.visualScenes;
  if (requestedStyleKey && requestedStyleKey !== 'auto') {
    const found = scenes.find(s => s.key === requestedStyleKey);
    if (found) return found;
  }
  const usedStyles = new Set(recentRows.slice(0, scenes.length - 1).map(r => r.visual_style).filter(Boolean));
  const freshScenes = scenes.filter(s => !usedStyles.has(s.key));
  const poolList = freshScenes.length ? freshScenes : scenes;
  const idx = Math.floor(Date.now() / 1000) % poolList.length;
  return poolList[idx];
}

/**
 * Pick the next non-repeating category for a brand
 */
function pickNextCategory(brandKey, recentRows = []) {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const cats = brand.categories || ['market_conditions'];
  const usedCats = new Set(recentRows.slice(0, Math.max(1, cats.length - 1)).map(r => r.category).filter(Boolean));
  const freshCats = cats.filter(c => !usedCats.has(c));
  const poolList = freshCats.length ? freshCats : cats;
  const idx = Math.floor(Date.now() / 1000) % poolList.length;
  return poolList[idx];
}

/**
 * Generate a high-resolution 1024x1024 Editorial Photography Image using gpt-image-1.5
 * Strictly forbids repetitive flyer text boxes or cheap promotional badges
 */
async function generateAiSocialImage(brandKey, imagePrompt, visualScene) {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const key = getOpenAiKey();
  if (!key) return null;

  try {
    const sceneDirection = visualScene?.prompt || imagePrompt;
    const refinedPrompt = [
      `Award-winning editorial & commercial photography for "${brand.name}" (${brand.industry}).`,
      `Scene Direction: ${sceneDirection}`,
      imagePrompt ? `Specific Topic Nuance: ${imagePrompt}` : '',
      `CRITICAL ART DIRECTION RULES (STRICTLY ENFORCED):`,
      `1. Pure, ultra-realistic Leica / Hasselblad / ARRI editorial photography ONLY.`,
      `2. ZERO text overlays, ZERO pricing boxes, ZERO promotional banners ("$149/week", "7-Day Trial", "24/7 Support"), ZERO words or typography rendered inside the image.`,
      `3. Do NOT generate a crowded poster, flyer, or collage. Do NOT put airplanes flying over trucks.`,
      `4. Capture one clean, authentic, high-trust Fortune-500 visual moment with natural lighting, realistic textures, and cinematic depth of field.`
    ].filter(Boolean).join('\n');

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1.5',
        prompt: refinedPrompt,
        n: 1,
        size: '1024x1024'
      })
    });

    const data = await res.json();
    if (data.data && data.data[0] && data.data[0].b64_json) {
      const buffer = Buffer.from(data.data[0].b64_json, 'base64');
      const imageId = `post_${brandKey}_${Date.now()}`;
      await pool.query(
        'INSERT INTO social_generated_images (image_id, mime_type, data) VALUES ($1, $2, $3)',
        [imageId, 'image/png', buffer]
      );
      return `https://www.shippingwish.com/api/social/image/${imageId}.png`;
    }
  } catch (err) {
    console.warn('generateAiSocialImage error:', err.message);
  }
  return null;
}

/**
 * Generate a 100% Unique, Fortune-500 Executive Social Post with Anti-Repetition Memory
 */
async function generateAiSocialPost(brandKey = 'shippingwish', category = '', customAngle = '', visualStyleKey = 'auto') {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const key = getOpenAiKey();
  if (!key) {
    throw new Error('OPENAI_API_KEY is not configured in .env');
  }

  const recentHistory = await getRecentBrandPostHistory(brandKey, 12);
  const chosenCategory = category || pickNextCategory(brandKey, recentHistory);
  const chosenScene = pickNextVisualScene(brandKey, visualStyleKey, recentHistory);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const historyBlock = recentHistory.length
    ? `RECENTLY PUBLISHED POSTS FOR ${brand.name.toUpperCase()} (STRICTLY FORBIDDEN TO REPEAT THESE HOOKS, ANGLES, OR SCENES):\n` +
      recentHistory.map((r, i) => `${i + 1}. [${r.category}] "${r.title}" — ${String(r.hook_snippet || '').replace(/\n/g, ' ')}`).join('\n')
    : 'No recent posts logged yet.';

  const isPromoCategory = chosenCategory.includes('promotional') || chosenCategory.includes('free_load') || chosenCategory.includes('discount');

  const prompt = `
You are the Chief Communications Officer & Executive Editorial Director for "${brand.name}".
Website: ${brand.website}
Phone: ${brand.phone}
Industry: ${brand.industry}
Target Audience: ${brand.targetAudience}
Brand Background Context: ${brand.valueProp}
Content Pillar / Topic Category: ${chosenCategory}
Selected Photography Direction: ${chosenScene.label} (${chosenScene.prompt})
Current Date: ${currentDate}
${customAngle ? `Specific Executive Angle / Focus: ${customAngle}` : ''}

${historyBlock}

Write an authoritative, Fortune-500 caliber social media publication for ${brand.name} suitable for LinkedIn, Facebook, and Instagram.

CRITICAL EDITORIAL & ANTI-REPETITION RULES:
1. NO CHEAP FLYER LANGUAGE: Never start with generic phrases like "Ready to transform your trucking operations?", "100% Unique AI Post", or "Attention truckers!". Write like an insider executive analyst (think FreightWaves, Bloomberg Supply Chain, Maersk, Conde Nast Traveler, or Apple editorial).
2. DO NOT REPEAT THE SAME PITCH EVERY POST:
   ${isPromoCategory
     ? `- Since this category is "${chosenCategory}", highlight ${brand.name}'s signature offering naturally with executive authority.`
     : `- Because this post is an industry/editorial insight under "${chosenCategory}", focus 85% of the post on genuine, specific, high-value market intelligence, operational strategy, or client advice. Only mention ${brand.name} smoothly in the closing takeaway and Call-to-Action. Do NOT turn this into a repetitive pricing flyer.`}
3. ZERO MARKDOWN: Do NOT use asterisks (**bold**) or markdown links ([text](url)).
4. CLEAN MOBILE READABILITY:
   - Open with a sharp, original 1-sentence executive hook or concrete industry observation.
   - Leave a blank line.
   - Provide 3 distinct, insightful bullet points (using tasteful emojis like 📊, 🛡️, ⚡, 📍, 💡, ✨) with specific operational details, real-world numbers, or actionable advice that you have NOT used in the recent history list above.
   - Leave a blank line.
   - Closing Executive Takeaway: 1 crisp sentence positioning ${brand.name} as the gold standard.
   - Leave a blank line.
   - Clean Call to Action:
     🌐 ${brand.website}
     📞 ${brand.phone}
   - Leave a blank line.
   - 5-6 curated hashtags on the final line.
5. VISUAL SCENE DESCRIPTION: Describe a pure, text-free, photorealistic editorial photograph matching "${chosenScene.label}" (${chosenScene.prompt}) tailored to this post's specific topic. Strictly NO text, NO banners, NO pricing badges in the image prompt.

RETURN STRICT JSON ONLY:
{
  "title": "Specific editorial headline for internal log (max 65 chars, never generic)",
  "content": "Full formatted post text with double line breaks and zero markdown asterisks",
  "image_prompt": "Pure photorealistic Leica/Hasselblad editorial photograph description with ZERO text or banners",
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
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an elite Fortune-500 Chief Communications Officer and editorial strategist. You never repeat hooks or templates. Output valid JSON only.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      response_format: { type: 'json_object' }
    })
  });

  const aiData = await aiRes.json();
  if (aiData.error) {
    throw new Error(`OpenAI API error: ${aiData.error.message}`);
  }

  const parsed = JSON.parse(aiData.choices[0].message.content);
  const cleanedContent = cleanSocialCopy(parsed.content || '');

  // Generate high-end editorial photograph
  let imageUrl = null;
  if (parsed.image_prompt || chosenScene) {
    imageUrl = await generateAiSocialImage(brandKey, parsed.image_prompt || '', chosenScene).catch(() => null);
  }

  return {
    brand: brandKey,
    brand_name: brand.name,
    category: chosenCategory,
    visual_style: chosenScene.key,
    visual_style_label: chosenScene.label,
    title: parsed.title || `${brand.name} Executive Update`,
    content: cleanedContent,
    image_prompt: parsed.image_prompt || chosenScene.prompt,
    image_url: imageUrl,
    category_label: parsed.category_label || chosenCategory,
    created_at: new Date().toISOString()
  };
}

/**
 * Auto-detect linked Instagram Business Account from a Facebook Page
 * Checks instagram_business_account, connected_instagram_account, instagram_accounts, and page_backed_instagram_accounts
 */
async function detectInstagramAccount(pageId, pageAccessToken, returnDebug = false) {
  if (!pageId || !pageAccessToken) return returnDebug ? { igId: null, reason: 'missing_page_or_token' } : null;
  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,instagram_business_account{id,username,name},connected_instagram_account{id,username,name},instagram_accounts{id,username}&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url);
    const data = await res.json();

    const igId =
      data?.instagram_business_account?.id ||
      data?.connected_instagram_account?.id ||
      data?.instagram_accounts?.data?.[0]?.id ||
      null;

    if (returnDebug) {
      let tokenDebug = null;
      try {
        const permRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`);
        tokenDebug = await permRes.json();
      } catch (_) {}
      return {
        igId: igId ? String(igId) : null,
        username:
          data?.instagram_business_account?.username ||
          data?.connected_instagram_account?.username ||
          data?.instagram_accounts?.data?.[0]?.username ||
          null,
        raw: data,
        tokenDebug
      };
    }

    return igId ? String(igId) : null;
  } catch (err) {
    return returnDebug ? { igId: null, error: err.message } : null;
  }
}

/**
 * Publish Post to Facebook Page using Official Graph API
 */
async function publishToFacebook(pageId, pageAccessToken, message, imageUrl = null) {
  if (!pageId || !pageAccessToken) throw new Error('Facebook Page ID and Page Access Token are required');
  
  let endpoint = `https://graph.facebook.com/v21.0/${pageId}/feed`;
  let body = {
    message,
    access_token: pageAccessToken
  };

  if (imageUrl) {
    const imgMatch = String(imageUrl).match(/\/api\/social\/image\/([a-zA-Z0-9_-]+)/);
    if (imgMatch) {
      try {
        const imgId = imgMatch[1];
        const { rows } = await pool.query('SELECT data, mime_type FROM social_generated_images WHERE image_id = $1', [imgId]);
        if (rows.length && rows[0].data) {
          const formData = new FormData();
          const blob = new Blob([rows[0].data], { type: rows[0].mime_type || 'image/png' });
          formData.append('source', blob, `${imgId}.png`);
          formData.append('caption', message);
          formData.append('access_token', pageAccessToken);
          const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: 'POST', body: formData });
          const data = await res.json();
          if (data.error) throw new Error(`Facebook API Error: ${data.error.message}`);
          return { platform: 'facebook', id: data.post_id || data.id };
        }
      } catch (err) {
        console.warn('Binary FB photo upload fallback to URL:', err.message);
      }
    }

    endpoint = `https://graph.facebook.com/v21.0/${pageId}/photos`;
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
  return { platform: 'facebook', id: data.post_id || data.id };
}

/**
 * Publish Post to Instagram Business using Official Graph API
 * Waits for container processing (FINISHED) before calling media_publish
 */
async function publishToInstagram(igUserId, accessToken, caption, imageUrl) {
  if (!igUserId || !accessToken) throw new Error('Instagram User ID and Access Token are required');
  if (!imageUrl) throw new Error('Instagram requires an image URL to publish a post');

  // Step 1: Create media container
  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media`, {
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

  // Step 2: Poll container status until FINISHED (up to 12 seconds)
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const statusRes = await fetch(
        `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === 'FINISHED') break;
      if (statusData.status_code === 'ERROR') {
        throw new Error('Instagram rejected the media container format.');
      }
    } catch (_) {}
  }

  // Step 3: Publish media container
  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
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
 * Helper to publish a LinkedIn UGC post for a given author URN (Organization or Person)
 */
async function executeLinkedInUgcPost(authorUrn, accessToken, text, imageBuffer) {
  let mediaCategory = 'NONE';
  let mediaArr = [];

  if (imageBuffer) {
    try {
      const regRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: authorUrn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }]
          }
        })
      });
      const regData = await regRes.json();
      const uploadUrl = regData.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
      const asset = regData.value?.asset;

      if (uploadUrl && asset) {
        await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'image/png',
            'Authorization': `Bearer ${accessToken}`
          },
          body: imageBuffer
        });

        mediaCategory = 'IMAGE';
        mediaArr = [{
          status: 'READY',
          description: { text: text.slice(0, 100) },
          media: asset,
          title: { text: 'Executive Update' }
        }];
      }
    } catch (liImgErr) {
      console.warn('LinkedIn image upload fallback to text:', liImgErr.message);
    }
  }

  const payload = {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: mediaCategory,
        ...(mediaArr.length ? { media: mediaArr } : {})
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
  return { status: res.status, data };
}

/**
 * Publish Post to LinkedIn Company Page or Executive Profile using Official API
 * Automatically falls back to authenticated member URN if company org scope is pending
 */
async function publishToLinkedIn(orgUrn, accessToken, text, imageUrl = null) {
  if (!accessToken) throw new Error('LinkedIn Access Token is not connected. Click "1-Click Connect LinkedIn" to authorize.');

  let formattedUrn = String(orgUrn || '').trim();
  const digits = formattedUrn.match(/(\d{5,12})/);
  if (formattedUrn && !formattedUrn.startsWith('urn:li:') && digits) {
    formattedUrn = `urn:li:organization:${digits[1]}`;
  } else if (formattedUrn && !formattedUrn.startsWith('urn:li:')) {
    formattedUrn = `urn:li:organization:${formattedUrn}`;
  }

  let imageBuffer = null;
  if (imageUrl) {
    try {
      const imgMatch = String(imageUrl).match(/\/api\/social\/image\/([a-zA-Z0-9_-]+)/);
      if (imgMatch) {
        const { rows } = await pool.query('SELECT data FROM social_generated_images WHERE image_id = $1', [imgMatch[1]]);
        if (rows.length && rows[0].data) imageBuffer = rows[0].data;
      }
      if (!imageBuffer) {
        const imgFetch = await fetch(imageUrl);
        imageBuffer = Buffer.from(await imgFetch.arrayBuffer());
      }
    } catch (_) {}
  }

  // Try organization URN first if provided
  if (formattedUrn) {
    const attempt = await executeLinkedInUgcPost(formattedUrn, accessToken, text, imageBuffer);
    if (attempt.status < 400 && attempt.data && attempt.data.id) {
      return { platform: 'linkedin', id: attempt.data.id, author: formattedUrn };
    }
  }

  // Fallback to authenticated member profile (urn:li:person:...) via OpenID /v2/userinfo
  const userRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const userData = await userRes.json();
  if (userData && userData.sub) {
    const personUrn = `urn:li:person:${userData.sub}`;
    const fallbackAttempt = await executeLinkedInUgcPost(personUrn, accessToken, text, imageBuffer);
    if (fallbackAttempt.status < 400 && fallbackAttempt.data && fallbackAttempt.data.id) {
      return { platform: 'linkedin', id: fallbackAttempt.data.id, author: personUrn };
    }
    throw new Error(`LinkedIn API Error: ${fallbackAttempt.data?.message || JSON.stringify(fallbackAttempt.data)}`);
  }

  throw new Error('LinkedIn token expired or lacks permission. Please re-connect via 1-Click Connect LinkedIn.');
}

/**
 * Publish Video to TikTok Creator Account using Official Content Posting API v2
 */
async function publishToTikTok(accessToken, videoUrl, title, privacyLevel = 'PUBLIC_TO_EVERYONE') {
  if (!accessToken) throw new Error('TikTok Access Token is required');
  if (!videoUrl) throw new Error('TikTok requires a valid video URL (MP4 format) to publish');

  const endpoint = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
  const body = {
    post_info: {
      title: String(title || '').slice(0, 2200),
      privacy_level: privacyLevel,
      disable_duet: false,
      disable_stitch: false,
      disable_comment: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
      source: 'PULL_FROM_URL',
      video_url: videoUrl
    }
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (data.error && data.error.code && data.error.code !== 'ok') {
    throw new Error(`TikTok API Error: ${data.error.message || JSON.stringify(data.error)}`);
  }
  return { platform: 'tiktok', id: (data.data && data.data.publish_id) || 'tt_' + Date.now() };
}

/**
 * AI Auto-Responder for Inbound Comments & DMs (100% Policy Compliant, GPT-4o Powered)
 */
async function generateAiCommentReply(brandKey, incomingUserComment, postContext = '') {
  const brand = BRANDS[brandKey] || BRANDS.shippingwish;
  const key = getOpenAiKey();
  if (!key) return `Thank you for reaching out to ${brand.name}! Feel free to contact our 24/7 team at ${brand.phone} or visit ${brand.website}.`;

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are the official 24/7 Executive Community & Client Relations Manager for "${brand.name}".
Industry: ${brand.industry}
Website: ${brand.website}
Phone: ${brand.phone}
Target Audience: ${brand.targetAudience}
Core Value Proposition: ${brand.valueProp}

A prospective client, carrier, broker, or customer just commented or sent a direct message on our official social media page.
STRICT BRAND & QUALITY RULES:
1. Respond warmly, intelligently, and directly to their exact question or comment in 1 to 3 concise sentences.
2. Address their inquiry strictly using ${brand.name}'s real services and facts: "${brand.valueProp}".
3. Include a natural, polite invitation to call/text us at ${brand.phone} or visit ${brand.website}.
4. Sound 100% like a sharp, helpful human executive — never robotic, never repetitive, and never use markdown asterisks.`
          },
          {
            role: 'user',
            content: `Post Context: ${postContext || 'General page inquiry'}\nUser's Message/Comment: "${incomingUserComment}"`
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      })
    });
    const aiData = await aiRes.json();
    return cleanSocialCopy(aiData.choices?.[0]?.message?.content?.trim()) || `Thank you for reaching out to ${brand.name}! Please call or text our team anytime at ${brand.phone}.`;
  } catch (_) {
    return `Thank you for reaching out to ${brand.name}! Call our team at ${brand.phone} or visit ${brand.website}.`;
  }
}

/**
 * Publish a generated post across all active/selected platforms for a single brand
 */
async function publishBrandPost(brandKey, postObj, requestedPlatforms = ['facebook', 'instagram', 'linkedin']) {
  await ensureSocialSchema();
  const { rows: credRows } = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = $1', [brandKey]);
  const creds = credRows[0] || {};
  const results = [];

  for (const p of requestedPlatforms) {
    let extId = null;
    let status = 'published';
    let error = null;

    try {
      if (p === 'facebook') {
        if (creds.facebook_page_id && creds.facebook_access_token) {
          const fbRes = await publishToFacebook(creds.facebook_page_id, creds.facebook_access_token, postObj.content, postObj.image_url);
          extId = fbRes.id;
        } else {
          status = 'saved_draft';
          error = 'Facebook Page token not configured.';
        }
      } else if (p === 'instagram') {
        let igId = creds.instagram_account_id;
        const igToken = creds.instagram_access_token || creds.facebook_access_token;

        if ((!igId || !/^\d+$/.test(igId)) && creds.facebook_page_id && creds.facebook_access_token) {
          const detectedIg = await detectInstagramAccount(creds.facebook_page_id, creds.facebook_access_token);
          if (detectedIg) {
            igId = detectedIg;
            await pool.query(
              'UPDATE social_brand_credentials SET instagram_account_id = $1, instagram_access_token = $2 WHERE brand = $3',
              [igId, igToken, brandKey]
            ).catch(() => {});
          }
        }

        if (igId && /^\d+$/.test(igId) && igToken && postObj.image_url) {
          const igRes = await publishToInstagram(igId, igToken, postObj.content, postObj.image_url);
          extId = igRes.id;
        } else if (!postObj.image_url) {
          status = 'saved_draft';
          error = 'Instagram requires an image URL.';
        } else {
          status = 'saved_draft';
          error = 'Instagram Business account is not linked to this Facebook Page yet (Link in Facebook Page Settings -> Linked Accounts -> Instagram).';
        }
      } else if (p === 'linkedin') {
        if (creds.linkedin_access_token) {
          const liRes = await publishToLinkedIn(creds.linkedin_org_urn, creds.linkedin_access_token, postObj.content, postObj.image_url);
          extId = liRes.id;
        } else {
          status = 'saved_draft';
          error = 'LinkedIn OAuth token not connected yet. Click "1-Click Connect LinkedIn" in Studio or Settings.';
        }
      } else if (p === 'tiktok') {
        const mediaUrl = postObj.video_url || postObj.image_url;
        if (creds.tiktok_access_token && postObj.video_url) {
          const ttRes = await publishToTikTok(creds.tiktok_access_token, mediaUrl, postObj.content);
          extId = ttRes.id;
        } else {
          status = 'saved_draft';
          error = !creds.tiktok_access_token
            ? 'TikTok account not connected.'
            : 'TikTok requires an MP4 video URL.';
        }
      } else {
        status = 'saved_draft';
      }
    } catch (err) {
      status = 'failed';
      error = err.message;
    }

    try {
      const insRes = await pool.query(`
        INSERT INTO social_posts_log (
          brand, category, visual_style, platform, title, content, image_prompt, image_url, external_post_id, status, error_message, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        brandKey,
        postObj.category || 'market_conditions',
        postObj.visual_style || null,
        p,
        postObj.title || 'Executive Update',
        postObj.content,
        postObj.image_prompt || null,
        postObj.image_url || null,
        extId,
        status,
        error,
        status === 'published' ? new Date() : null
      ]);
      results.push({ brand: brandKey, platform: p, status, external_id: extId, log_id: insRes.rows[0]?.id, error });
    } catch (dbErr) {
      results.push({ brand: brandKey, platform: p, status, external_id: extId, error: error || dbErr.message });
    }
  }

  if (results.some(r => r.status === 'published')) {
    await pool.query('UPDATE social_brand_credentials SET last_posted_at = now() WHERE brand = $1', [brandKey]).catch(() => {});
  }

  return results;
}

/**
 * 24/7 Autonomous Comment & Messenger DM Scanner + Live Auto-Responder
 * Scans Facebook Pages & linked Instagram Business accounts for unanswered comments and DMs,
 * crafts context-aware AI replies, posts them live via Meta Graph API, and logs every reply.
 */
async function scanAndReplySocialEngagement(targetBrand = null) {
  await ensureSocialSchema();
  const brandKeys = targetBrand ? [targetBrand] : Object.keys(BRANDS);
  const { rows: credsList } = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = ANY($1)', [brandKeys]);

  const actions = [];

  for (const creds of credsList) {
    const brandKey = creds.brand;
    const pageId = creds.facebook_page_id;
    const token = creds.facebook_access_token;
    if (!pageId || !token) continue;

    // 1. Scan Facebook Page Posts & Unanswered Comments
    try {
      const feedUrl = `https://graph.facebook.com/v21.0/${pageId}/published_posts?fields=id,message,comments.limit(20){id,message,from,created_time,comments.limit(10){from,message}}&limit=8&access_token=${encodeURIComponent(token)}`;
      const feedRes = await fetch(feedUrl);
      const feedData = await feedRes.json();
      const posts = Array.isArray(feedData?.data) ? feedData.data : [];

      for (const post of posts) {
        const postContext = String(post.message || '').slice(0, 300);
        const comments = Array.isArray(post.comments?.data) ? post.comments.data : [];

        for (const c of comments) {
          const commentId = c.id;
          const commentText = String(c.message || '').trim();
          const senderId = c.from?.id || '';
          const senderName = c.from?.name || 'Valued Visitor';

          if (!commentId || !commentText) continue;
          // Never reply to the Page's own comments
          if (senderId && String(senderId) === String(pageId)) continue;

          // Check if Page already replied in sub-comments
          const subComments = Array.isArray(c.comments?.data) ? c.comments.data : [];
          const alreadyRepliedOnFb = subComments.some(sc => String(sc.from?.id || '') === String(pageId));
          if (alreadyRepliedOnFb) continue;

          // Check if already logged in social_auto_replies_log
          const existing = await pool.query(
            'SELECT id FROM social_auto_replies_log WHERE external_object_id = $1',
            [`fb_comment_${commentId}`]
          );
          if (existing.rows.length > 0) continue;

          // Generate AI reply & post live to Facebook comment thread
          const aiReply = await generateAiCommentReply(brandKey, commentText, postContext);
          const replyRes = await fetch(`https://graph.facebook.com/v21.0/${commentId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: aiReply,
              access_token: token
            })
          });
          const replyData = await replyRes.json();
          const replyStatus = replyData.error ? 'failed' : 'replied';
          const replyError = replyData.error ? replyData.error.message : null;

          await pool.query(`
            INSERT INTO social_auto_replies_log (
              brand, platform, interaction_type, external_object_id, parent_post_id,
              sender_name, sender_id, incoming_text, ai_reply_text, reply_external_id, status, error_message
            ) VALUES ($1, 'facebook', 'comment', $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (external_object_id) DO NOTHING
          `, [
            brandKey,
            `fb_comment_${commentId}`,
            post.id,
            senderName,
            senderId,
            commentText,
            aiReply,
            replyData.id || null,
            replyStatus,
            replyError
          ]);

          actions.push({
            brand: brandKey,
            platform: 'facebook',
            type: 'comment',
            sender: senderName,
            incoming: commentText,
            reply: aiReply,
            status: replyStatus,
            error: replyError
          });
        }
      }
    } catch (fbScanErr) {
      console.warn(`[SOCIAL-MCP] FB comment scan note (${brandKey}):`, fbScanErr.message);
    }

    // 2. Scan Facebook Page Messenger Conversations (DMs)
    try {
      const convUrl = `https://graph.facebook.com/v21.0/${pageId}/conversations?fields=id,updated_time,messages.limit(3){id,message,from,created_time}&limit=8&access_token=${encodeURIComponent(token)}`;
      const convRes = await fetch(convUrl);
      const convData = await convRes.json();
      const convs = Array.isArray(convData?.data) ? convData.data : [];

      for (const conv of convs) {
        const msgs = Array.isArray(conv.messages?.data) ? conv.messages.data : [];
        if (!msgs.length) continue;
        const latestMsg = msgs[0]; // Most recent message in thread
        const msgId = latestMsg.id;
        const msgText = String(latestMsg.message || '').trim();
        const senderId = latestMsg.from?.id || '';
        const senderName = latestMsg.from?.name || 'Messenger User';

        if (!msgId || !msgText || !senderId) continue;
        // If the most recent message in the thread was sent by our Page, we already answered!
        if (String(senderId) === String(pageId)) continue;

        const existing = await pool.query(
          'SELECT id FROM social_auto_replies_log WHERE external_object_id = $1',
          [`fb_dm_${msgId}`]
        );
        if (existing.rows.length > 0) continue;

        const aiReply = await generateAiCommentReply(brandKey, msgText, 'Direct Message Inquiry');
        const dmRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: senderId },
            message: { text: aiReply },
            messaging_type: 'RESPONSE',
            access_token: token
          })
        });
        const dmData = await dmRes.json();
        const dmStatus = dmData.error ? 'failed' : 'replied';
        const dmError = dmData.error ? dmData.error.message : null;

        await pool.query(`
          INSERT INTO social_auto_replies_log (
            brand, platform, interaction_type, external_object_id, parent_post_id,
            sender_name, sender_id, incoming_text, ai_reply_text, reply_external_id, status, error_message
          ) VALUES ($1, 'facebook', 'dm', $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (external_object_id) DO NOTHING
        `, [
          brandKey,
          `fb_dm_${msgId}`,
          conv.id,
          senderName,
          senderId,
          msgText,
          aiReply,
          dmData.message_id || null,
          dmStatus,
          dmError
        ]);

        actions.push({
          brand: brandKey,
          platform: 'facebook',
          type: 'dm',
          sender: senderName,
          incoming: msgText,
          reply: aiReply,
          status: dmStatus,
          error: dmError
        });
      }
    } catch (dmScanErr) {
      console.warn(`[SOCIAL-MCP] FB DM scan note (${brandKey}):`, dmScanErr.message);
    }

    // 3. Scan Linked Instagram Business Account Comments (if linked)
    const igId = creds.instagram_account_id;
    const igToken = creds.instagram_access_token || token;
    if (igId && /^\d+$/.test(igId) && igToken) {
      try {
        const igMediaUrl = `https://graph.facebook.com/v21.0/${igId}/media?fields=id,caption,comments.limit(20){id,text,username,timestamp,replies{username,text}}&limit=6&access_token=${encodeURIComponent(igToken)}`;
        const igRes = await fetch(igMediaUrl);
        const igData = await igRes.json();
        const mediaItems = Array.isArray(igData?.data) ? igData.data : [];

        for (const item of mediaItems) {
          const captionContext = String(item.caption || '').slice(0, 300);
          const comments = Array.isArray(item.comments?.data) ? item.comments.data : [];

          for (const c of comments) {
            const commentId = c.id;
            const commentText = String(c.text || '').trim();
            const username = c.username || 'ig_user';
            if (!commentId || !commentText) continue;

            const replies = Array.isArray(c.replies?.data) ? c.replies.data : [];
            if (replies.length > 0) continue;

            const existing = await pool.query(
              'SELECT id FROM social_auto_replies_log WHERE external_object_id = $1',
              [`ig_comment_${commentId}`]
            );
            if (existing.rows.length > 0) continue;

            const aiReply = await generateAiCommentReply(brandKey, commentText, captionContext);
            const repRes = await fetch(`https://graph.facebook.com/v21.0/${commentId}/replies`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: aiReply,
                access_token: igToken
              })
            });
            const repData = await repRes.json();
            const repStatus = repData.error ? 'failed' : 'replied';
            const repError = repData.error ? repData.error.message : null;

            await pool.query(`
              INSERT INTO social_auto_replies_log (
                brand, platform, interaction_type, external_object_id, parent_post_id,
                sender_name, sender_id, incoming_text, ai_reply_text, reply_external_id, status, error_message
              ) VALUES ($1, 'instagram', 'comment', $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (external_object_id) DO NOTHING
            `, [
              brandKey,
              `ig_comment_${commentId}`,
              item.id,
              `@${username}`,
              username,
              commentText,
              aiReply,
              repData.id || null,
              repStatus,
              repError
            ]);

            actions.push({
              brand: brandKey,
              platform: 'instagram',
              type: 'comment',
              sender: `@${username}`,
              incoming: commentText,
              reply: aiReply,
              status: repStatus,
              error: repError
            });
          }
        }
      } catch (igScanErr) {
        console.warn(`[SOCIAL-MCP] IG comment scan note (${brandKey}):`, igScanErr.message);
      }
    }
  }

  return actions;
}

/**
 * 24/7 Autonomous Daily Multi-Brand Publisher & Engagement Tick
 * Automatically publishes 1 fresh, non-repeating post per brand per day when due,
 * and scans/replies to comments & DMs across all 4 brands.
 */
let autoPilotRunning = false;
async function runAutonomousSocialManagerTick(options = {}) {
  const { forcePublishAll = false, targetBrand = null } = options;
  if (autoPilotRunning && !forcePublishAll) {
    return { ok: true, skipped: 'already_running' };
  }
  autoPilotRunning = true;

  try {
    await ensureSocialSchema();
    const brandKeys = targetBrand ? [targetBrand] : Object.keys(BRANDS);
    const { rows: credsList } = await pool.query('SELECT * FROM social_brand_credentials WHERE brand = ANY($1)', [brandKeys]);

    const publishedSummary = await Promise.all(brandKeys.map(async (brandKey) => {
      const creds = credsList.find(c => c.brand === brandKey);
      if (!creds) return null;

      if (!forcePublishAll && !creds.autopilot_enabled) return null;

      // Check if already posted within the last 20 hours (unless forcePublishAll is true)
      if (!forcePublishAll && creds.last_posted_at) {
        const hoursSinceLast = (Date.now() - new Date(creds.last_posted_at).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLast < 20) return null;
      }

      try {
        const postObj = await generateAiSocialPost(brandKey, '', '', 'auto');
        const activePlatforms = ['facebook'];
        if (creds.instagram_account_id || creds.facebook_page_id) activePlatforms.push('instagram');
        if (creds.linkedin_access_token) activePlatforms.push('linkedin');

        const pubResults = await publishBrandPost(brandKey, postObj, activePlatforms);
        return {
          brand: brandKey,
          title: postObj.title,
          category: postObj.category,
          visual_style: postObj.visual_style_label,
          image_url: postObj.image_url,
          results: pubResults
        };
      } catch (brandErr) {
        return {
          brand: brandKey,
          error: brandErr.message
        };
      }
    }));

    // Also scan & auto-reply to new comments and DMs across all brands
    const engagementActions = await scanAndReplySocialEngagement(targetBrand).catch(() => []);

    return {
      ok: true,
      published: publishedSummary.filter(Boolean),
      engagement_replies: engagementActions
    };
  } finally {
    autoPilotRunning = false;
  }
}

module.exports = {
  BRANDS,
  ensureSocialSchema,
  generateAiSocialPost,
  publishToFacebook,
  publishToInstagram,
  publishToLinkedIn,
  publishToTikTok,
  generateAiCommentReply,
  detectInstagramAccount,
  publishBrandPost,
  scanAndReplySocialEngagement,
  runAutonomousSocialManagerTick
};
