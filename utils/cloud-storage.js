// utils/cloud-storage.js
// Permanent serverless-safe file storage for Shipping Wish & Loads Nexus.
// Priority:
//   1. Vercel Blob (when BLOB_READ_WRITE_TOKEN is set — native fetch, zero extra deps)
//   2. PostgreSQL durable base64 storage (documents.file_data_b64 — survives Vercel /tmp wipes)
//   3. Local filesystem (for local non-Vercel dev)

const fs = require('fs');
const path = require('path');

const MAX_DB_FALLBACK_BYTES = 8 * 1024 * 1024; // 8 MB safe inline cap for Postgres fallback

function sanitizeFileName(name) {
  return String(name || 'document.bin')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 140);
}

/**
 * Upload a Buffer to permanent storage.
 * Returns { storage_provider, cloud_url, file_data_b64, filepath, file_size }.
 */
async function storeDocumentBuffer({
  buffer,
  filename,
  folder = 'documents',
  mimeType = 'application/octet-stream',
  localDir = null
}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('storeDocumentBuffer requires a Buffer');
  }

  const safeName = `${Date.now()}-${Math.round(Math.random() * 1e6)}-${sanitizeFileName(filename)}`;
  const blobToken = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();

  // 1. Vercel Blob API (permanent CDN object storage)
  if (blobToken) {
    try {
      const pathname = `${folder}/${safeName}`;
      const uploadUrl = `https://blob.vercel-storage.com/${encodeURIComponent(pathname).replace(/%2F/g, '/')}`;
      const resp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${blobToken}`,
          'Content-Type': mimeType,
          'x-api-version': '7',
          'x-add-random-suffix': '0',
          'x-vercel-blob-access': 'private'
        },
        body: buffer
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => ({}));
        if (data && data.url) {
          return {
            storage_provider: 'vercel_blob',
            cloud_url: data.url,
            file_data_b64: null,
            filepath: data.url,
            file_size: buffer.length
          };
        }
      } else {
        console.warn('[CloudStorage] Vercel Blob upload returned', resp.status, '— falling back to Postgres durable storage.');
      }
    } catch (err) {
      console.warn('[CloudStorage] Vercel Blob error:', err.message, '— falling back to Postgres durable storage.');
    }
  }

  // 2. Local dev filesystem (persists locally) + Postgres durable base64 on Vercel
  let localPath = null;
  if (!process.env.VERCEL && localDir) {
    try {
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
      localPath = path.join(localDir, safeName);
      fs.writeFileSync(localPath, buffer);
    } catch (err) {
      console.warn('[CloudStorage] Local write warning:', err.message);
      localPath = null;
    }
  }

  // Store durable base64 in Postgres when on Vercel or when local write is unavailable
  if (process.env.VERCEL || !localPath) {
    if (buffer.length > MAX_DB_FALLBACK_BYTES) {
      throw new Error('File exceeds 8MB serverless fallback limit. Configure BLOB_READ_WRITE_TOKEN for larger files.');
    }
    return {
      storage_provider: 'postgres_b64',
      cloud_url: null,
      file_data_b64: buffer.toString('base64'),
      filepath: `db://${folder}/${safeName}`,
      file_size: buffer.length
    };
  }

  return {
    storage_provider: 'local',
    cloud_url: null,
    file_data_b64: buffer.length <= 2 * 1024 * 1024 ? buffer.toString('base64') : null,
    filepath: localPath,
    file_size: buffer.length
  };
}

/**
 * Retrieve a stored document as a Buffer (works across Vercel Blob, Postgres durable fallback, or local disk).
 */
async function readDocumentBuffer(docRow) {
  if (!docRow) return null;

  // 1. Cloud URL (Vercel Blob Private or Public HTTPS)
  if (docRow.cloud_url && /^https?:\/\//i.test(docRow.cloud_url)) {
    const blobToken = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
    const isVercelBlob = docRow.cloud_url.includes('blob.vercel-storage.com');
    const headers = (isVercelBlob && blobToken) ? { Authorization: `Bearer ${blobToken}` } : {};
    const resp = await fetch(docRow.cloud_url, { headers });
    if (resp.ok) {
      const arrBuf = await resp.arrayBuffer();
      return Buffer.from(arrBuf);
    }
  }

  // 2. Postgres durable base64
  if (docRow.file_data_b64) {
    return Buffer.from(docRow.file_data_b64, 'base64');
  }

  // 3. Local filesystem fallback
  if (docRow.filepath && !docRow.filepath.startsWith('db://') && !/^https?:\/\//i.test(docRow.filepath)) {
    if (fs.existsSync(docRow.filepath)) {
      return fs.readFileSync(docRow.filepath);
    }
  }

  return null;
}

module.exports = {
  storeDocumentBuffer,
  readDocumentBuffer,
  sanitizeFileName
};
