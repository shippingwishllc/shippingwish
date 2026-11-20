const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { storeDocumentBuffer, readDocumentBuffer } = require('../utils/cloud-storage');
const { ensureUnifiedSchema } = require('../utils/load-lifecycle');

const router = express.Router();

async function userCanAccessDocument(req, doc) {
  const role = req.user.role;
  if (['admin', 'super_admin', 'dispatcher', 'sales_rep'].includes(role)) return true;
  if (role === 'carrier' || role === 'carrier_admin') {
    if (doc.carrier_id === req.user.id) return true;
    if (doc.load_id) {
      const lr = await pool.query('SELECT carrier_id FROM loads WHERE id = $1', [doc.load_id]);
      if (lr.rows.length && lr.rows[0].carrier_id === req.user.id) return true;
    }
    return false;
  }
  if (role === 'driver') {
    if (doc.uploaded_by === req.user.id) return true;
    if (doc.load_id) {
      const dr = await pool.query(
        `SELECT id FROM drivers WHERE user_id = $1 OR (email IS NOT NULL AND lower(email) = lower($2))`,
        [req.user.id, req.user.email || '']
      );
      const ids = dr.rows.map((r) => r.id);
      const lr = await pool.query('SELECT driver_id FROM loads WHERE id = $1', [doc.load_id]);
      if (lr.rows.length && ids.includes(lr.rows[0].driver_id)) return true;
    }
    return false;
  }
  return false;
}

const os = require('os');
const UPLOADS_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, '..', 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.warn('[WARN] Could not create uploads directory:', e.message);
}

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max file size
});

// Upload document (linked to loadId or carrierId) — Permanent Cloud/DB Storage (Never vanishes on Vercel!)
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  await ensureUnifiedSchema();
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No file was uploaded.' });
  
  let { loadId, carrierId, category } = req.body;
  const isCarrier = ['carrier', 'carrier_admin'].includes(req.user.role);
  const isDriver = req.user.role === 'driver';

  // If carrier, enforce carrierId = req.user.id and verify load belongs to them
  if (isCarrier) {
    carrierId = req.user.id;
    if (loadId) {
      const checkLoad = await pool.query('SELECT id FROM loads WHERE id = $1 AND carrier_id = $2', [loadId, req.user.id]);
      if (!checkLoad.rows.length) {
        return res.status(403).json({ error: 'You cannot upload documents for a load not assigned to you.' });
      }
    }
  }

  // If driver, verify load is assigned to them
  if (isDriver && loadId) {
    const dr = await pool.query(
      `SELECT id FROM drivers WHERE user_id = $1 OR (email IS NOT NULL AND lower(email) = lower($2))`,
      [req.user.id, req.user.email || '']
    );
    const ids = dr.rows.map((r) => r.id);
    const checkLoad = await pool.query('SELECT id, driver_id, carrier_id FROM loads WHERE id = $1', [loadId]);
    if (!checkLoad.rows.length || !ids.includes(checkLoad.rows[0].driver_id)) {
      return res.status(403).json({ error: 'You cannot upload documents for a load not assigned to you.' });
    }
    if (!carrierId) carrierId = checkLoad.rows[0].carrier_id;
  }

  const validCategories = ['rate_confirmation', 'bol', 'pod', 'carrier_packet', 'insurance', 'w9', 'mc_certificate', 'invoice', 'fuel_receipt', 'lumper_receipt', 'other'];
  const cat = validCategories.includes(category) ? category : 'other';

  try {
    const stored = await storeDocumentBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      folder: `tms/${cat}`,
      mimeType: req.file.mimetype || 'application/octet-stream',
      localDir: UPLOADS_DIR
    });

    const result = await pool.query(
      `INSERT INTO documents (load_id, carrier_id, category, filename, original_name, filepath, file_size, uploaded_by, cloud_url, mime_type, file_data_b64, storage_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, load_id, carrier_id, category, filename, original_name, filepath, file_size, uploaded_by, cloud_url, mime_type, storage_provider, uploaded_at`,
      [
        loadId ? parseInt(loadId, 10) : null,
        carrierId ? parseInt(carrierId, 10) : null,
        cat,
        path.basename(stored.filepath || req.file.originalname),
        req.file.originalname,
        stored.filepath,
        stored.file_size,
        req.user.id,
        stored.cloud_url,
        req.file.mimetype || 'application/octet-stream',
        stored.file_data_b64,
        stored.storage_provider
      ]
    );

    // If category is POD, advance load lifecycle automatically
    if (loadId && cat === 'pod') {
      await pool.query(`UPDATE loads SET status = 'pod_uploaded', updated_at = now() WHERE id = $1`, [loadId]);
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'pod_uploaded', $2, 'POD document uploaded to permanent cloud vault')`,
        [loadId, req.user.id]
      );
    }

    res.json({ ok: true, document: result.rows[0] });
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: err.message || 'Could not save document record.' });
  }
});

// Upload base64 document (ideal for Mobile Driver App Camera POD / BOL / Fuel Receipt Scanner)
router.post('/upload-base64', requireAuth, async (req, res) => {
  await ensureUnifiedSchema();
  let { loadId, carrierId, category = 'pod', originalName = 'mobile-scan.jpg', mimeType = 'image/jpeg', base64Data } = req.body || {};
  if (!base64Data || typeof base64Data !== 'string') {
    return res.status(400).json({ error: 'base64Data is required.' });
  }
  const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanB64, 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid or oversized document (max 10MB).' });
  }

  const isCarrier = ['carrier', 'carrier_admin'].includes(req.user.role);
  if (isCarrier) {
    carrierId = req.user.id;
    if (loadId) {
      const checkLoad = await pool.query('SELECT id FROM loads WHERE id = $1 AND carrier_id = $2', [loadId, req.user.id]);
      if (!checkLoad.rows.length) {
        return res.status(403).json({ error: 'You cannot upload documents for a load not assigned to you.' });
      }
    }
  }

  const validCategories = ['rate_confirmation', 'bol', 'pod', 'carrier_packet', 'insurance', 'w9', 'mc_certificate', 'invoice', 'fuel_receipt', 'lumper_receipt', 'other'];
  const cat = validCategories.includes(category) ? category : 'other';

  try {
    const stored = await storeDocumentBuffer({
      buffer,
      filename: originalName,
      folder: `tms/${cat}`,
      mimeType,
      localDir: UPLOADS_DIR
    });

    const result = await pool.query(
      `INSERT INTO documents (load_id, carrier_id, category, filename, original_name, filepath, file_size, uploaded_by, cloud_url, mime_type, file_data_b64, storage_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, load_id, carrier_id, category, filename, original_name, filepath, file_size, uploaded_by, cloud_url, mime_type, storage_provider, uploaded_at`,
      [
        loadId ? parseInt(loadId, 10) : null,
        carrierId ? parseInt(carrierId, 10) : null,
        cat,
        path.basename(stored.filepath || originalName),
        originalName,
        stored.filepath,
        stored.file_size,
        req.user.id,
        stored.cloud_url,
        mimeType,
        stored.file_data_b64,
        stored.storage_provider
      ]
    );

    if (loadId && cat === 'pod') {
      await pool.query(`UPDATE loads SET status = 'pod_uploaded', updated_at = now() WHERE id = $1`, [loadId]);
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'pod_uploaded', $2, 'Mobile POD scan uploaded to permanent vault')`,
        [loadId, req.user.id]
      );
    }

    res.json({ ok: true, document: result.rows[0] });
  } catch (err) {
    console.error('Upload base64 document error:', err);
    res.status(500).json({ error: err.message || 'Could not upload scanned document.' });
  }
});

// List documents (by loadId, carrierId, or all for admin)
router.get('/', requireAuth, async (req, res) => {
  const { loadId, carrierId, category } = req.query;
  const isCarrier = ['carrier', 'carrier_admin'].includes(req.user.role);
  try {
    let query = `
      SELECT d.*, u.name AS uploader_name
      FROM documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE 1=1`;
    let params = [];

    if (isCarrier) {
      params.push(req.user.id);
      query += ` AND (d.carrier_id = $${params.length} OR d.load_id IN (SELECT id FROM loads WHERE carrier_id = $${params.length}))`;
    } else if (carrierId) {
      params.push(parseInt(carrierId, 10));
      query += ` AND d.carrier_id = $${params.length}`;
    }

    if (loadId) {
      params.push(parseInt(loadId, 10));
      query += ` AND d.load_id = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND d.category = $${params.length}`;
    }

    query += ` ORDER BY d.uploaded_at DESC`;
    const result = await pool.query(query, params);
    res.json({ documents: result.rows });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Could not load documents.' });
  }
});

// View document inline in browser (reads permanently from Cloud URL, Postgres durable b64, or local disk)
router.get('/:id/view', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = result.rows[0];
    if (!await userCanAccessDocument(req, doc)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const buf = await readDocumentBuffer(doc);
    if (!buf) {
      return res.status(404).json({ error: 'Document file not found in cloud or local storage.' });
    }

    const ext = path.extname(doc.original_name || '').toLowerCase();
    const mimeTypes = {
      '.pdf':  'application/pdf',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.txt':  'text/plain'
    };
    const contentType = doc.mime_type || mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Could not view document.' });
  }
});

// Download document (reads permanently from Cloud URL, Postgres durable b64, or local disk)
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = result.rows[0];
    if (!await userCanAccessDocument(req, doc)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const buf = await readDocumentBuffer(doc);
    if (!buf) {
      return res.status(404).json({ error: 'Document file not found in cloud or local storage.' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'Could not download document.' });
  }
});

// ============================================================
// DOCUMENT REPLACEMENT / EDIT WORKFLOW WITH ADMIN APPROVAL
// ============================================================

// GET /api/documents/pending-approvals — List document replacement requests (Admin)
router.get('/pending-approvals', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const result = await pool.query(`
      SELECT d.*, u.name AS requested_by_name, u.email AS requested_by_email
      FROM documents d
      LEFT JOIN users u ON u.id = d.edit_requested_by
      WHERE d.approval_status = 'pending_approval'
      ORDER BY d.uploaded_at DESC
    `);
    res.json({ requests: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch pending document approvals.' });
  }
});

// POST /api/documents/:id/replace — Upload replacement file with reason (Requires Admin Approval if Dispatcher/Carrier)
router.post('/:id/replace', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No replacement file was uploaded.' });
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for document replacement is required.' });
  }

  try {
    const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (!docResult.rows.length) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    const doc = docResult.rows[0];

    if (!await userCanAccessDocument(req, doc)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const stored = await storeDocumentBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      folder: `tms/${doc.category || 'other'}`,
      mimeType: req.file.mimetype || 'application/octet-stream',
      localDir: UPLOADS_DIR
    });
    const storedName = path.basename(stored.filepath || req.file.originalname);

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (isAdmin) {
      if (doc.filepath && !doc.filepath.startsWith('db://') && !/^https?:\/\//i.test(doc.filepath) && fs.existsSync(doc.filepath)) {
        try { fs.unlinkSync(doc.filepath); } catch (_) {}
      }

      const update = await pool.query(
        `UPDATE documents
         SET filename = $1, original_name = $2, filepath = $3, file_size = $4,
             cloud_url = $5, mime_type = $6, file_data_b64 = $7, storage_provider = $8,
             approval_status = 'approved', edit_reason = $9, edit_requested_by = $10
         WHERE id = $11
         RETURNING id, load_id, carrier_id, category, filename, original_name, filepath, file_size, cloud_url, storage_provider, approval_status`,
        [storedName, req.file.originalname, stored.filepath, stored.file_size, stored.cloud_url, req.file.mimetype || 'application/octet-stream', stored.file_data_b64, stored.storage_provider, reason, req.user.id, id]
      );

      return res.json({ ok: true, directApproved: true, message: 'Document replaced successfully.', document: update.rows[0] });
    }

    // Dispatcher / Carrier: Save as pending edit awaiting Admin Approval
    const update = await pool.query(
      `UPDATE documents
       SET approval_status = 'pending_approval', pending_filepath = $1,
           pending_filename = $2, pending_original_name = $3,
           edit_reason = $4, edit_requested_by = $5
       WHERE id = $6
       RETURNING id, load_id, carrier_id, category, original_name, pending_original_name, approval_status`,
      [stored.filepath, storedName, req.file.originalname, reason, req.user.id, id]
    );

    // Create Admin Notifications
    const { createNotification } = require('../utils/notifications');
    const admins = await pool.query(`SELECT id FROM users WHERE role IN ('admin', 'super_admin')`);
    for (const a of admins.rows) {
      await createNotification(
        a.id,
        `⚠️ Document Edit Requested: ${doc.category.toUpperCase().replace('_', ' ')}`,
        `User ${req.user.name} requested to replace "${doc.original_name}" with "${req.file.originalname}". Reason: ${reason}`,
        'warning',
        `/documents.html`
      );
    }

    res.json({
      ok: true,
      pendingApproval: true,
      message: 'Replacement document submitted. Awaiting Admin Approval.',
      document: update.rows[0]
    });
  } catch (err) {
    console.error('Replace document error:', err);
    res.status(500).json({ error: 'Could not process document replacement.' });
  }
});

// POST /api/documents/:id/approve-edit — Admin approves or rejects replacement
router.post('/:id/approve-edit', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  const { action } = req.body; // 'approve' | 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be "approve" or "reject".' });
  }

  try {
    const docResult = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (!docResult.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = docResult.rows[0];

    if (!doc.pending_filepath) {
      return res.status(400).json({ error: 'No pending edit file found for this document.' });
    }

    if (action === 'approve') {
      // Delete old file
      if (fs.existsSync(doc.filepath)) fs.unlinkSync(doc.filepath);

      // Move pending file to primary
      const update = await pool.query(
        `UPDATE documents
         SET filepath = pending_filepath, filename = pending_filename, original_name = pending_original_name,
             approval_status = 'approved', pending_filepath = NULL, pending_filename = NULL, pending_original_name = NULL
         WHERE id = $1 RETURNING *`,
        [id]
      );
      return res.json({ ok: true, message: 'Document edit APPROVED and updated.', document: update.rows[0] });
    } else {
      // Reject — delete pending file
      if (fs.existsSync(doc.pending_filepath)) fs.unlinkSync(doc.pending_filepath);

      const update = await pool.query(
        `UPDATE documents
         SET approval_status = 'approved', pending_filepath = NULL, pending_filename = NULL, pending_original_name = NULL
         WHERE id = $1 RETURNING *`,
        [id]
      );
      return res.json({ ok: true, message: 'Document edit REJECTED. Original document kept.', document: update.rows[0] });
    }
  } catch (err) {
    console.error('Approve doc edit error:', err);
    res.status(500).json({ error: 'Could not process document approval.' });
  }
});

// Delete document
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = result.rows[0];

    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const isOwner = doc.uploaded_by === req.user.id || (['carrier', 'carrier_admin'].includes(req.user.role) && doc.carrier_id === req.user.id);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Access denied. You cannot delete this document.' });
    }

    if (fs.existsSync(doc.filepath)) {
      fs.unlinkSync(doc.filepath);
    }
    if (doc.pending_filepath && fs.existsSync(doc.pending_filepath)) {
      fs.unlinkSync(doc.pending_filepath);
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete document.' });
  }
});

module.exports = router;
