/**
 * routes/driver-assistant.js
 * 
 * Dispatcher API for Autonomous Driver Assistant & Fleet Lifecycle Automation
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const driverAssistant = require('../utils/driver-assistant');

const staffOnly = requireRole('admin', 'super_admin', 'dispatcher');

// GET /api/driver-assistant/events — View recent automated driver events
router.get('/events', requireAuth, staffOnly, async (req, res) => {
  try {
    await driverAssistant.ensureDriverAssistantSchema();
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const { rows } = await pool.query(`
      SELECT e.*, 
             d.name AS driver_name,
             c.company_name AS carrier_company,
             l.load_number
      FROM driver_automation_events e
      LEFT JOIN drivers d ON d.id = e.driver_id
      LEFT JOIN users c ON c.id = e.carrier_id
      LEFT JOIN loads l ON l.id = e.load_id
      ORDER BY e.created_at DESC
      LIMIT $1
    `, [limit]);

    res.json({ ok: true, events: rows });
  } catch (err) {
    console.error('Driver assistant events error:', err);
    res.status(500).json({ error: 'Could not load automation events.' });
  }
});

// POST /api/driver-assistant/run-morning — Trigger morning check-in sweep immediately
router.post('/run-morning', requireAuth, staffOnly, async (req, res) => {
  try {
    const results = await driverAssistant.runMorningDriverCheckins();
    res.json({
      ok: true,
      message: `Morning sweep completed. Sent to ${results.length} eligible driver(s) / carrier(s).`,
      results
    });
  } catch (err) {
    console.error('Run morning check-in error:', err);
    res.status(500).json({ error: 'Morning sweep failed: ' + err.message });
  }
});

// POST /api/driver-assistant/test-message — Send test automation scenario to a phone
router.post('/test-message', requireAuth, staffOnly, async (req, res) => {
  const { phone, scenario, load_id, driver_id, name } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  try {
    let result;
    if (scenario === 'booked' && load_id) {
      result = await driverAssistant.onLoadBooked(load_id);
    } else if (scenario === 'in_transit' && load_id) {
      result = await driverAssistant.onLoadInTransit(load_id);
    } else if (scenario === 'delivered' && load_id) {
      result = await driverAssistant.onLoadDelivered(load_id);
    } else {
      // Default sample greeting test
      const sampleBody = `🚛 *SHIPPING WISH DISPATCH | MORNING TEST GREETING*

Good morning, ${name || 'Driver'}! Have a safe and smooth drive today.

*Active Load:* #SW-4821
*Destination:* D'Iberville, MS
*Delivery Window:* Today 3:00 PM

Our dispatch desk is already monitoring market rates and finding top reloads near your destination. Safe travels!
Dispatch Hotline: (917) 737-0021
Shipping Wish Operations`;

      result = await driverAssistant.sendAssistantMessage({
        phone,
        body: sampleBody,
        eventType: 'test_greeting',
        driverId: driver_id || null,
        metadata: { manual_test: true, user: req.user.email }
      });
    }

    res.json({ ok: true, message: 'Test message dispatched.', result });
  } catch (err) {
    console.error('Test message error:', err);
    res.status(500).json({ error: 'Failed to send test: ' + err.message });
  }
});

// POST /api/driver-assistant/test-vapi-call — Test Vapi AI voice check-call
router.post('/test-vapi-call', requireAuth, staffOnly, async (req, res) => {
  const { phone, driver_name } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

  try {
    const callRes = await driverAssistant.triggerVapiCall({
      phone,
      driverName: driver_name || 'Driver',
      scenario: 'morning_checkin'
    });
    res.json({ ok: true, result: callRes });
  } catch (err) {
    res.status(500).json({ error: 'Vapi call trigger failed: ' + err.message });
  }
});

module.exports = router;
