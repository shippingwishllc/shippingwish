const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// Initial High-SEO Sample Articles
const INITIAL_BLOGS = [
  {
    id: 1,
    title: 'How Owner-Operators Can Average $3.20+ Per Mile in 2026: The Ultimate Freight Dispatch Playbook',
    slug: 'owner-operator-freight-dispatch-playbook-2026',
    category: 'Freight Dispatch',
    author: 'Shipping Wish Editorial Desk',
    read_time: '6 min read',
    image_url: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80',
    summary: 'Discover proven lane optimization strategies, rate negotiation tactics, and circuity formulas used by top-tier dispatchers to maximize RPM across 53ft Dry Vans, Reefers, and Flatbeds.',
    content: `
      <h2>The 2026 Freight Rate Blueprint for Independent Truckers</h2>
      <p>Operating an independent trucking business in 2026 requires more than just holding a valid CDL-A and a clean MVR. With diesel prices hovering around $3.85/gallon and insurance premiums remaining high, booking low-rate loads ($1.80–$2.10/mile) is a direct path to operating at a financial loss.</p>

      <p>To achieve profitability, owner-operators must maintain an <strong>All-In Rate Per Mile (RPM) of $3.20 or higher</strong> across total miles (loaded miles + deadhead miles). At <a href="/services.html#dispatch" style="color:#f59e0b;font-weight:bold;">Shipping Wish LLC</a>, our dedicated dispatch team handles rate negotiations and lane planning to ensure our partner carriers stay in high-volume headhaul lanes.</p>

      <h3>1. Calculate Your Exact Operating Cost Per Mile (CPM)</h3>
      <p>Before accepting any Rate Confirmation, you must calculate your baseline fixed and variable costs. Typical CPM breakdown:</p>
      <ul>
        <li><strong>Fixed Costs:</strong> Truck/Trailer payment, Commercial Truck Insurance ($1,200/mo), IFTA, ELD telematics ($45/mo), MCS-150 filings ($0.45/mile average).</li>
        <li><strong>Variable Costs:</strong> Fuel ($0.59/mile @ 6.5 MPG), maintenance reserve ($0.15/mile), tires, tolls, and driver pay.</li>
      </ul>

      <h3>2. Leverage High-Demand Triangular Lanes (Avoid Deadhead)</h3>
      <p>Never take a load into a "dead zone" (e.g. Florida or West Texas) without factoring in high outbound deadhead miles. Instead, dispatchers build <strong>Triangular Routes</strong>:</p>
      <div style="background:#1e293b;padding:16px;border-radius:8px;border-left:4px solid #f59e0b;margin:16px 0;color:#fff;">
        <strong>Example 3-Leg Circuit:</strong><br>
        • Leg 1: Chicago, IL ➔ Atlanta, GA ($3.40/mile)<br>
        • Leg 2: Atlanta, GA ➔ Harrisburg, PA ($3.15/mile)<br>
        • Leg 3: Harrisburg, PA ➔ Chicago, IL ($2.95/mile)<br>
        <em>Result: 1,840 total miles @ $3.16 average RPM with zero unpaid deadhead!</em>
      </div>

      <h3>3. Perform Live Broker Credit Checks Before Signing Rate Confirms</h3>
      <p>High rates mean nothing if the freight broker delays payment or files for bankruptcy. Always verify broker MC authority and credit score before loading. Use our free tool: <a href="/contact.html#broker-credit" style="color:#f59e0b;font-weight:bold;">Shipping Wish Broker Credit Checker</a>.</p>

      <h3>4. Fast Cash Flow with 1-Day Factoring Setup</h3>
      <p>Don't wait 30 to 60 days to collect invoice payouts. Partnering with <a href="/factoring.html" style="color:#f59e0b;font-weight:bold;">Shipping Wish 1-Day Factoring Setup</a> provides same-day funding for BOLs with 0.99% low rates and 0% advance fees.</p>

      <div style="background:linear-gradient(135deg, #0f172a, #1e293b);padding:24px;border-radius:12px;color:#fff;margin-top:24px;border:1px solid rgba(245,158,11,0.3);">
        <h4 style="margin-top:0;color:#f59e0b;">Ready to Boost Your Fleet's Weekly Revenue?</h4>
        <p>Partner with Shipping Wish LLC. Dedicated 24/7 dispatcher, no monthly fees, 5-10% low commission. <a href="/contact.html" style="color:#38bdf8;font-weight:bold;">Call Dispatch Desk: (917) 737-0021</a> or <a href="/signup.html" style="color:#34d399;font-weight:bold;">Start Onboarding Now →</a></p>
      </div>
    `,
    is_published: true,
    created_at: new Date('2026-08-20')
  },
  {
    id: 2,
    title: 'Avoid Non-Paying Brokers: How to Perform Live FMCSA & Surety Bond Credit Checks Before Loading',
    slug: 'fmcsa-broker-credit-check-guide',
    category: 'Broker Credit',
    author: 'Shipping Wish Compliance Team',
    read_time: '5 min read',
    image_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80',
    summary: 'Protect your carrier business from double-brokered freight, slow-pay brokers, and invalid $75,000 BMC-84 surety bonds. Essential credit check guide for truckers.',
    content: `
      <h2>Why Broker Credit Ratings Are Critical for Carrier Survival</h2>
      <p>Freight broker defaults and freight fraud have increased across the United States. Accepting a high-paying load from a broker with an "F" credit rating or active bond cancellation risk can result in thousands of dollars in uncollected freight claims.</p>

      <h3>Key Indicators of a Safe Freight Broker:</h3>
      <ol>
        <li><strong>Active FMCSA Authority:</strong> Broker must maintain active Property Broker authority for at least 6 consecutive months.</li>
        <li><strong>$75,000 BMC-84 Surety Bond Status:</strong> Verify that the broker's trust fund or surety bond is active and has no pending claims.</li>
        <li><strong>Days to Pay (DTP):</strong> Top brokers pay within 21 to 28 days. Any broker averaging 60+ DTP poses high insolvency risks.</li>
        <li><strong>Credit Score Rating:</strong> Only accept loads from brokers holding an A+, A, or B credit grade.</li>
      </ol>

      <p>At <a href="/services.html#load-booking" style="color:#f59e0b;font-weight:bold;">Shipping Wish LLC</a>, our dispatchers perform live FMCSA background and credit checks on every broker before submitting carrier packets or signing Rate Confirmations.</p>

      <p>Test any Broker MC Number or USDOT Number right now: <a href="/contact.html#broker-credit" style="color:#f59e0b;font-weight:bold;">Instant Broker Credit Checker Tool →</a></p>
    `,
    is_published: true,
    created_at: new Date('2026-08-18')
  },
  {
    id: 3,
    title: 'Factoring vs. QuickPay: How to Maximize Cash Flow Without Paying High Fees',
    slug: 'factoring-vs-quickpay-cash-flow-strategy',
    category: 'Factoring & Cash Flow',
    author: 'Shipping Wish Financial Desk',
    read_time: '4 min read',
    image_url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80',
    summary: 'Compare same-day freight factoring against broker QuickPay options. Learn how non-recourse factoring protects your fleet while keeping 100% of broker payouts.',
    content: `
      <h2>Factoring vs. Broker QuickPay: Which Is Right For Your Trucking Business?</h2>
      <p>When you deliver a load, waiting 30 to 45 days for broker checks can stall your fuel purchasing power and driver payroll. Two primary solutions exist: <strong>Broker QuickPay</strong> and <strong>Freight Factoring</strong>.</p>

      <h3>Broker QuickPay:</h3>
      <p>Brokers deduct 2% to 5% off the gross rate confirmation to send direct deposit in 2 to 5 days. However, QuickPay is offered per broker and does not provide credit insurance if the broker goes under.</p>

      <h3>Freight Factoring:</h3>
      <p>Factoring companies buy your invoices instantly upon BOL submission. With <a href="/factoring.html" style="color:#f59e0b;font-weight:bold;">Shipping Wish 1-Day Factoring Setup</a> (partnered with RTS Financial, Apex Capital, and TriumphPay), carriers get:</p>
      <ul>
        <li>Same-day payout via wire or ACH.</li>
        <li>Factoring rates as low as <strong>0.99%</strong>.</li>
        <li><strong>Non-Recourse Protection:</strong> If the broker defaults, you keep your money!</li>
        <li>Same-Day Fuel Advances up to 50% upon pickup confirmation.</li>
      </ul>

      <p>Apply for setup in less than 5 minutes: <a href="/factoring.html" style="color:#f59e0b;font-weight:bold;">1-Day Factoring Setup Application →</a></p>
    `,
    is_published: true,
    created_at: new Date('2026-08-15')
  }
];

let memoryBlogs = [...INITIAL_BLOGS];

// Load from DB if present
async function loadBlogsFromDB() {
  try {
    const res = await pool.query('SELECT * FROM blog_posts ORDER BY created_at DESC');
    if (res.rows.length > 0) {
      memoryBlogs = res.rows;
    }
  } catch (err) {
    // Fallback to memoryBlogs
  }
}
loadBlogsFromDB();

// GET /api/blog - Public access to published blog articles
router.get('/', async (req, res) => {
  try {
    await loadBlogsFromDB();
    const { category, search } = req.query;
    let posts = memoryBlogs.filter(p => p.is_published !== false);

    if (category && category !== 'All') {
      posts = posts.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      posts = posts.filter(p => p.title.toLowerCase().includes(q) || p.summary.toLowerCase().includes(q));
    }

    res.json({ success: true, count: posts.length, posts });
  } catch (err) {
    res.json({ success: true, count: memoryBlogs.length, posts: memoryBlogs });
  }
});

// GET /api/blog/:slug - Fetch single post detail
router.get('/:slug', async (req, res) => {
  try {
    await loadBlogsFromDB();
    const post = memoryBlogs.find(p => p.slug === req.params.slug || String(p.id) === req.params.slug);
    if (!post) {
      return res.status(404).json({ error: 'Blog post not found.' });
    }
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch article.' });
  }
});

// POST /api/blog - Admin only: Create new blog post
router.post('/', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const { title, summary, content, category, author, read_time, image_url, is_published } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required.' });
  }

  const slug = req.body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const newPost = {
    id: memoryBlogs.length + 1,
    title,
    slug,
    summary: summary || title,
    content,
    category: category || 'Freight Dispatch',
    author: author || 'Shipping Wish Editorial Desk',
    read_time: read_time || '5 min read',
    image_url: image_url || 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80',
    is_published: is_published !== false,
    created_at: new Date()
  };

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'Freight Dispatch',
        author TEXT DEFAULT 'Shipping Wish Editorial Desk',
        read_time TEXT DEFAULT '5 min read',
        image_url TEXT,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    const dbRes = await pool.query(
      `INSERT INTO blog_posts (title, slug, summary, content, category, author, read_time, image_url, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [newPost.title, newPost.slug, newPost.summary, newPost.content, newPost.category, newPost.author, newPost.read_time, newPost.image_url, newPost.is_published]
    );

    memoryBlogs.unshift(dbRes.rows[0]);
    res.json({ success: true, message: 'Blog post published successfully.', post: dbRes.rows[0] });
  } catch (err) {
    memoryBlogs.unshift(newPost);
    res.json({ success: true, message: 'Blog post saved in memory.', post: newPost });
  }
});

// PUT /api/blog/:id - Admin only: Edit blog post
router.put('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, summary, content, category, author, read_time, image_url, is_published } = req.body;

  const idx = memoryBlogs.findIndex(p => p.id === id);
  if (idx !== -1) {
    if (title) memoryBlogs[idx].title = title;
    if (summary) memoryBlogs[idx].summary = summary;
    if (content) memoryBlogs[idx].content = content;
    if (category) memoryBlogs[idx].category = category;
    if (author) memoryBlogs[idx].author = author;
    if (read_time) memoryBlogs[idx].read_time = read_time;
    if (image_url) memoryBlogs[idx].image_url = image_url;
    if (is_published !== undefined) memoryBlogs[idx].is_published = is_published;
  }

  try {
    await pool.query(
      `UPDATE blog_posts SET title=$1, summary=$2, content=$3, category=$4, author=$5, read_time=$6, image_url=$7, is_published=$8, updated_at=now() WHERE id=$9`,
      [title, summary, content, category, author, read_time, image_url, is_published, id]
    );
  } catch (err) {}

  res.json({ success: true, message: 'Blog post updated.' });
});

// DELETE /api/blog/:id - Admin only: Delete blog post
router.delete('/:id', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  memoryBlogs = memoryBlogs.filter(p => p.id !== id);

  try {
    await pool.query('DELETE FROM blog_posts WHERE id = $1', [id]);
  } catch (err) {}

  res.json({ success: true, message: 'Blog post deleted.' });
});

module.exports = router;
