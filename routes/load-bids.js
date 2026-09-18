const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');
const { sendPushToUsers } = require('./mobile-push');
const { auditLog, getClientIp } = require('../utils/audit');

const router = express.Router();

let migrated = false;
async function ensureTable() {
  if (migrated) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS load_bids (
        id SERIAL PRIMARY KEY,
        load_id INT REFERENCES loads(id) ON DELETE CASCADE,
        carrier_id INT REFERENCES users(id) ON DELETE SET NULL,
        bid_type VARCHAR(20) DEFAULT 'counter_offer',
        offered_rate NUMERIC(10, 2) NOT NULL,
        driver_name VARCHAR(100),
        truck_unit VARCHAR(50),
        ready_time VARCHAR(100),
        notes TEXT,
        status VARCHAR(30) DEFAULT 'submitted',
        counter_amount NUMERIC(10, 2),
        counter_notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_load_bids_load_id ON load_bids(load_id);
      CREATE INDEX IF NOT EXISTS idx_load_bids_carrier_id ON load_bids(carrier_id);
      CREATE INDEX IF NOT EXISTS idx_load_bids_status ON load_bids(status);
    `);
    migrated = true;
  } catch (err) {
    console.error('[Load Bids] Migration error:', err.message);
  }
}
ensureTable();

// POST /api/bids/submit — Carrier submits Book-Now or Counter-Offer
router.post('/submit', requireAuth, async (req, res) => {
  await ensureTable();
  const {
    load_id,
    bid_type = 'counter_offer',
    offered_rate,
    driver_name = '',
    truck_unit = '',
    ready_time = 'Available Immediately',
    notes = ''
  } = req.body;

  const loadId = parseInt(load_id, 10);
  const rate = parseFloat(offered_rate);

  if (isNaN(loadId)) return res.status(400).json({ error: 'Valid load_id is required.' });
  if (isNaN(rate) || rate <= 0) return res.status(400).json({ error: 'Valid offered_rate is required.' });

  try {
    const loadCheck = await pool.query(
      `SELECT id, load_number, rate, status, pickup_location, delivery_location, dispatcher_id 
       FROM loads WHERE id = $1`,
      [loadId]
    );
    if (loadCheck.rows.length === 0) return res.status(404).json({ error: 'Load not found.' });
    const load = loadCheck.rows[0];

    const insertRes = await pool.query(`
      INSERT INTO load_bids (load_id, carrier_id, bid_type, offered_rate, driver_name, truck_unit, ready_time, notes, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', now(), now())
      RETURNING *
    `, [loadId, req.user.id, bid_type, rate, driver_name, truck_unit, ready_time, notes]);

    const bid = insertRes.rows[0];

    // Notify broker / dispatcher
    const recipientId = load.dispatcher_id;
    const title = bid_type === 'book_now'
      ? `⚡ Instant Book Request: Load #${load.load_number || load.id}`
      : `🤝 Counter Offer ($${rate.toLocaleString()}): Load #${load.load_number || load.id}`;
    const body = `${req.user.name || 'Carrier Partner'} offered $${rate.toLocaleString()} (Posted: $${Number(load.rate || 0).toLocaleString()}). Unit: ${truck_unit || 'N/A'}`;

    if (recipientId && recipientId !== req.user.id) {
      createNotification(recipientId, title, body, 'info', `/admin-loadnexus.html`).catch(() => {});
      sendPushToUsers(recipientId, {
        title,
        body,
        data: { load_id: loadId, bid_id: bid.id, type: 'new_bid' }
      }).catch(() => {});
    }

    auditLog(req.user.id, 'BID_SUBMITTED', 'load_bids', bid.id, { loadId, bid_type, rate }, getClientIp(req));

    res.json({
      ok: true,
      message: bid_type === 'book_now' ? 'Instant booking request submitted to broker!' : 'Counter offer submitted successfully!',
      bid
    });
  } catch (err) {
    console.error('[Bid Submit] Error:', err);
    res.status(500).json({ error: 'Could not submit bid.' });
  }
});

// GET /api/bids/load/:loadId — Fetch bids for a specific load
router.get('/load/:loadId', requireAuth, async (req, res) => {
  await ensureTable();
  const loadId = parseInt(req.params.loadId, 10);
  if (isNaN(loadId)) return res.status(400).json({ error: 'Invalid load ID.' });

  try {
    let query = `
      SELECT b.*, 
             u.name as carrier_name, u.company_name as carrier_company, u.mc_number as carrier_mc, u.phone as carrier_phone, u.email as carrier_email
      FROM load_bids b
      LEFT JOIN users u ON u.id = b.carrier_id
      WHERE b.load_id = $1
    `;
    const params = [loadId];

    // Carriers only see their own bids
    if (['carrier', 'carrier_admin'].includes(req.user.role)) {
      query += ` AND b.carrier_id = $2`;
      params.push(req.user.id);
    }

    query += ` ORDER BY b.created_at DESC`;
    const result = await pool.query(query, params);

    res.json({
      ok: true,
      count: result.rows.length,
      bids: result.rows
    });
  } catch (err) {
    console.error('[Load Bids] Error:', err);
    res.status(500).json({ error: 'Could not fetch load bids.' });
  }
});

// GET /api/bids/my-bids — Carrier fetches all their active and historical bids
router.get('/my-bids', requireAuth, async (req, res) => {
  await ensureTable();
  try {
    const result = await pool.query(`
      SELECT b.*,
             l.load_number, l.pickup_location, l.delivery_location, l.rate as posted_rate, l.equipment_type, l.status as load_status
      FROM load_bids b
      JOIN loads l ON l.id = b.load_id
      WHERE b.carrier_id = $1
      ORDER BY b.created_at DESC
      LIMIT 100
    `, [req.user.id]);

    res.json({
      ok: true,
      count: result.rows.length,
      bids: result.rows
    });
  } catch (err) {
    console.error('[My Bids] Error:', err);
    res.status(500).json({ error: 'Could not fetch your bids.' });
  }
});

// POST /api/bids/:id/respond — Broker / Dispatcher responds (accept, reject, counter)
router.post('/:id/respond', requireAuth, async (req, res) => {
  await ensureTable();
  const bidId = parseInt(req.params.id, 10);
  const { action, counter_amount, counter_notes } = req.body;

  if (isNaN(bidId)) return res.status(400).json({ error: 'Invalid bid ID.' });
  if (!['accepted', 'rejected', 'counter'].includes(action)) {
    return res.status(400).json({ error: 'Action must be accepted, rejected, or counter.' });
  }

  try {
    const check = await pool.query(`
      SELECT b.*, l.load_number, l.rate as original_rate, l.pickup_location, l.delivery_location, l.dispatcher_id
      FROM load_bids b
      JOIN loads l ON l.id = b.load_id
      WHERE b.id = $1
    `, [bidId]);

    if (check.rows.length === 0) return res.status(404).json({ error: 'Bid not found.' });
    const bid = check.rows[0];

    if (action === 'accepted') {
      // 1. Mark this bid accepted
      const updatedBid = await pool.query(`
        UPDATE load_bids 
        SET status = 'accepted', updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [bidId]);

      // 2. Reject other pending bids for this load
      await pool.query(`
        UPDATE load_bids
        SET status = 'rejected', updated_at = now()
        WHERE load_id = $1 AND id != $2 AND status = 'submitted'
      `, [bid.load_id, bidId]);

      // 3. Award load to carrier and update rate
      await pool.query(`
        UPDATE loads
        SET carrier_id = $1, rate = $2, status = 'booked', updated_at = now()
        WHERE id = $3
      `, [bid.carrier_id, bid.offered_rate, bid.load_id]);

      // 4. Record in status history
      await pool.query(`
        INSERT INTO load_status_history (load_id, status, changed_by, notes)
        VALUES ($1, 'booked', $2, $3)
      `, [bid.load_id, req.user.id, `Bid #${bidId} accepted at $${Number(bid.offered_rate).toFixed(2)}. RateCon ready for e-signature.`]);

      // 5. Push notification to carrier
      if (bid.carrier_id) {
        const title = `🎉 Bid Accepted: Load #${bid.load_number || bid.load_id}`;
        const body = `Your offer of $${Number(bid.offered_rate).toLocaleString()} was ACCEPTED! Load has been awarded. RateCon is ready for signature.`;
        createNotification(bid.carrier_id, title, body, 'success', `/admin-loadnexus.html`).catch(() => {});
        sendPushToUsers(bid.carrier_id, {
          title,
          body,
          data: { load_id: bid.load_id, bid_id: bidId, type: 'bid_accepted' }
        }).catch(() => {});
      }

      auditLog(req.user.id, 'BID_ACCEPTED', 'load_bids', bidId, { load_id: bid.load_id, rate: bid.offered_rate }, getClientIp(req));

      return res.json({
        ok: true,
        message: `Bid #${bidId} accepted! Load #${bid.load_number} has been awarded to carrier at $${Number(bid.offered_rate).toLocaleString()}.`,
        bid: updatedBid.rows[0]
      });
    }

    if (action === 'rejected') {
      const updatedBid = await pool.query(`
        UPDATE load_bids 
        SET status = 'rejected', updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [bidId]);

      if (bid.carrier_id) {
        const title = `Offer Declined: Load #${bid.load_number || bid.load_id}`;
        const body = `Your offer of $${Number(bid.offered_rate).toLocaleString()} was not accepted by broker.`;
        createNotification(bid.carrier_id, title, body, 'warning', `/admin-loadnexus.html`).catch(() => {});
        sendPushToUsers(bid.carrier_id, {
          title,
          body,
          data: { load_id: bid.load_id, bid_id: bidId, type: 'bid_rejected' }
        }).catch(() => {});
      }

      auditLog(req.user.id, 'BID_REJECTED', 'load_bids', bidId, {}, getClientIp(req));

      return res.json({
        ok: true,
        message: `Bid #${bidId} rejected.`,
        bid: updatedBid.rows[0]
      });
    }

    if (action === 'counter') {
      const counterRate = parseFloat(counter_amount);
      if (isNaN(counterRate) || counterRate <= 0) {
        return res.status(400).json({ error: 'Valid counter_amount is required for counter action.' });
      }

      const updatedBid = await pool.query(`
        UPDATE load_bids 
        SET status = 'countered', counter_amount = $1, counter_notes = $2, updated_at = now()
        WHERE id = $3
        RETURNING *
      `, [counterRate, counter_notes || null, bidId]);

      if (bid.carrier_id) {
        const title = `Broker Counter-Offer: $${counterRate.toLocaleString()}`;
        const body = `Broker countered your offer on Load #${bid.load_number} with $${counterRate.toLocaleString()}. Notes: ${counter_notes || 'Pending carrier confirmation'}`;
        createNotification(bid.carrier_id, title, body, 'info', `/admin-loadnexus.html`).catch(() => {});
        sendPushToUsers(bid.carrier_id, {
          title,
          body,
          data: { load_id: bid.load_id, bid_id: bidId, type: 'broker_counter', counter_amount: counterRate }
        }).catch(() => {});
      }

      auditLog(req.user.id, 'BID_COUNTERED', 'load_bids', bidId, { counterRate }, getClientIp(req));

      return res.json({
        ok: true,
        message: `Counter offer of $${counterRate.toLocaleString()} sent to carrier.`,
        bid: updatedBid.rows[0]
      });
    }
  } catch (err) {
    console.error('[Bid Respond] Error:', err);
    res.status(500).json({ error: 'Could not process bid response.' });
  }
});

// GET /api/bids/stats/summary — Live Market Bidding Activity
router.get('/stats/summary', async (req, res) => {
  await ensureTable();
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_bids,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted_bids,
        COUNT(*) FILTER (WHERE status = 'submitted') as pending_bids,
        COUNT(*) FILTER (WHERE bid_type = 'book_now') as instant_bookings
      FROM load_bids
    `);
    res.json({
      ok: true,
      stats: stats.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch bidding stats.' });
  }
});

module.exports = router;
