const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const os = require('os');
const UPLOADS_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, '..', 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (e) {
  console.warn('[WARN] Could not create uploads directory:', e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max file size
});

// Upload document (linked to loadId or carrierId)
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
  
  const { loadId, carrierId, category } = req.body;
  const validCategories = ['rate_confirmation', 'bol', 'pod', 'carrier_packet', 'insurance', 'w9', 'mc_certificate', 'invoice', 'other'];
  const cat = validCategories.includes(category) ? category : 'other';

  try {
    const result = await pool.query(
      `INSERT INTO documents (load_id, carrier_id, category, filename, original_name, filepath, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [loadId ? parseInt(loadId, 10) : null, carrierId ? parseInt(carrierId, 10) : null, cat, req.file.filename, req.file.originalname, req.file.path, req.file.size, req.user.id]
    );

    // If category is POD or Rate Confirmation, update load status automatically
    if (loadId && cat === 'pod') {
      await pool.query(`UPDATE loads SET status = 'pod_uploaded', updated_at = now() WHERE id = $1`, [loadId]);
      await pool.query(
        `INSERT INTO load_status_history (load_id, status, changed_by, notes) VALUES ($1, 'pod_uploaded', $2, 'POD document uploaded')`,
        [loadId, req.user.id]
      );
    }

    res.json({ ok: true, document: result.rows[0] });
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Could not save document record.' });
  }
});

// List documents (by loadId, carrierId, or all for admin)
router.get('/', requireAuth, async (req, res) => {
  const { loadId, carrierId, category } = req.query;
  try {
    let query = `
      SELECT d.*, u.name AS uploader_name
      FROM documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE 1=1`;
    let params = [];

    if (loadId) {
      params.push(parseInt(loadId, 10));
      query += ` AND d.load_id = $${params.length}`;
    }
    if (carrierId) {
      params.push(parseInt(carrierId, 10));
      query += ` AND d.carrier_id = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND d.category = $${params.length}`;
    }

    if (req.user.role === 'carrier' && !loadId && !carrierId) {
      params.push(req.user.id);
      query += ` AND (d.carrier_id = $${params.length} OR d.load_id IN (SELECT id FROM loads WHERE carrier_id = $${params.length}))`;
    }

    query += ` ORDER BY d.uploaded_at DESC`;
    const result = await pool.query(query, params);
    res.json({ documents: result.rows });
  } catch (err) {
    console.error('List documents error:', err);
    res.status(500).json({ error: 'Could not load documents.' });
  }
});

// View document inline in browser (PDF or Image viewer)
router.get('/:id/view', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = result.rows[0];

    if (!fs.existsSync(doc.filepath)) {
      return res.status(404).json({ error: 'File on disk not found.' });
    }

    const ext = path.extname(doc.original_name).toLowerCase();
    const mimeTypes = {
      '.pdf':  'application/pdf',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.txt':  'text/plain'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.original_name}"`);
    fs.createReadStream(doc.filepath).pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Could not view document.' });
  }
});

// Download document
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = result.rows[0];

    if (!fs.existsSync(doc.filepath)) {
      return res.status(404).json({ error: 'File on disk not found.' });
    }

    res.download(doc.filepath, doc.original_name);
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
    if (!docResult.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = docResult.rows[0];

    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (isAdmin) {
      // Admin replaces file directly
      if (fs.existsSync(doc.filepath)) fs.unlinkSync(doc.filepath);

      const update = await pool.query(
        `UPDATE documents
         SET filename = $1, original_name = $2, filepath = $3, file_size = $4,
             approval_status = 'approved', edit_reason = $5, edit_requested_by = $6
         WHERE id = $7 RETURNING *`,
        [req.file.filename, req.file.originalname, req.file.path, req.file.size, reason, req.user.id, id]
      );

      return res.json({ ok: true, directApproved: true, message: 'Document replaced successfully.', document: update.rows[0] });
    }

    // Dispatcher / Carrier: Save as pending edit awaiting Admin Approval
    const update = await pool.query(
      `UPDATE documents
       SET approval_status = 'pending_approval', pending_filepath = $1,
           pending_filename = $2, pending_original_name = $3,
           edit_reason = $4, edit_requested_by = $5
       WHERE id = $6 RETURNING *`,
      [req.file.path, req.file.filename, req.file.originalname, reason, req.user.id, id]
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
