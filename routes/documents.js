const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

// Delete document
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const doc = result.rows[0];

    if (fs.existsSync(doc.filepath)) {
      fs.unlinkSync(doc.filepath);
    }

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete document.' });
  }
});

module.exports = router;
