const pool = require('../db');

let schemaReady = false;

async function ensureCensusDirectorySchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS census_directories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      equipment TEXT[] NOT NULL DEFAULT '{}',
      state TEXT,
      filters JSONB NOT NULL DEFAULT '{}',
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS census_directory_members (
      id SERIAL PRIMARY KEY,
      directory_id INTEGER NOT NULL REFERENCES census_directories(id) ON DELETE CASCADE,
      dot_number TEXT,
      mc_number TEXT,
      company_name TEXT NOT NULL,
      owner_name TEXT,
      email TEXT,
      phone TEXT,
      city TEXT,
      state TEXT,
      equipment_type TEXT,
      cargo_carried TEXT,
      power_units INTEGER,
      source TEXT NOT NULL DEFAULT 'fmcsa_census',
      crm_lead_id INTEGER,
      email_sent_at TIMESTAMPTZ,
      sms_sent_at TIMESTAMPTZ,
      sms_blocked_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS census_directory_members_dot_idx
      ON census_directory_members (directory_id, dot_number)
      WHERE dot_number IS NOT NULL AND dot_number <> '';
    CREATE INDEX IF NOT EXISTS census_directories_created_idx ON census_directories (created_at DESC);
    CREATE INDEX IF NOT EXISTS census_directory_members_dir_idx ON census_directory_members (directory_id);
  `);
  schemaReady = true;
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 80);
}

async function createDirectory({ name, equipment, state, filters, createdBy, members }) {
  await ensureCensusDirectorySchema();
  const title = cleanName(name);
  if (title.length < 2) {
    const err = new Error('Name this directory (for example TX-Reefer-Small-Fleet).');
    err.status = 400;
    throw err;
  }
  const dir = await pool.query(
    `INSERT INTO census_directories (name, equipment, state, filters, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5)
     RETURNING *`,
    [title, Array.isArray(equipment) ? equipment : [], state || null, JSON.stringify(filters || {}), createdBy || null]
  );
  const inserted = await addMembers(dir.rows[0].id, members);
  return { directory: dir.rows[0], added: inserted.added, skipped: inserted.skipped };
}

async function listDirectories() {
  await ensureCensusDirectorySchema();
  const { rows } = await pool.query(`
    SELECT d.*,
      COUNT(m.id)::int AS member_count,
      COUNT(m.email) FILTER (WHERE m.email IS NOT NULL AND m.email <> '')::int AS with_email,
      COUNT(m.phone) FILTER (WHERE m.phone IS NOT NULL AND m.phone <> '')::int AS with_phone
    FROM census_directories d
    LEFT JOIN census_directory_members m ON m.directory_id = d.id
    GROUP BY d.id
    ORDER BY d.created_at DESC
    LIMIT 80
  `);
  return rows;
}

async function getDirectory(id) {
  await ensureCensusDirectorySchema();
  const dirId = Number(id);
  if (!dirId) return null;
  const dir = await pool.query('SELECT * FROM census_directories WHERE id = $1', [dirId]);
  if (!dir.rows.length) return null;
  const members = await pool.query(
    `SELECT * FROM census_directory_members WHERE directory_id = $1 ORDER BY company_name ASC LIMIT 500`,
    [dirId]
  );
  return { directory: dir.rows[0], members: members.rows };
}

async function addMembers(directoryId, members) {
  await ensureCensusDirectorySchema();
  const list = Array.isArray(members) ? members : [];
  let added = 0;
  let skipped = 0;
  for (const raw of list.slice(0, 200)) {
    const company = String(raw.company_name || '').trim().slice(0, 160);
    if (!company) {
      skipped += 1;
      continue;
    }
    const ins = await pool.query(
      `INSERT INTO census_directory_members (
         directory_id, dot_number, mc_number, company_name, owner_name, email, phone,
         city, state, equipment_type, cargo_carried, power_units, source
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        directoryId,
        String(raw.dot_number || '').slice(0, 16) || null,
        String(raw.mc_number || '').slice(0, 20) || null,
        company,
        String(raw.owner_name || raw.officer_name || '').slice(0, 120) || null,
        String(raw.email || '').slice(0, 160) || null,
        String(raw.phone || '').slice(0, 30) || null,
        String(raw.phy_city || raw.city || '').slice(0, 80) || null,
        String(raw.phy_state || raw.state || '').slice(0, 4) || null,
        String(raw.equipment_type || '').slice(0, 80) || null,
        String(raw.cargo_carried || '').slice(0, 240) || null,
        parseInt(raw.num_trucks || raw.power_units, 10) || null,
        String(raw.source || 'fmcsa_census').slice(0, 40)
      ]
    );
    if (ins.rows.length) added += 1;
    else skipped += 1;
  }
  return { added, skipped };
}

async function deleteDirectory(id) {
  await ensureCensusDirectorySchema();
  const { rowCount } = await pool.query('DELETE FROM census_directories WHERE id = $1', [Number(id)]);
  return rowCount > 0;
}

async function markMember(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${i}`);
    vals.push(value);
    i += 1;
  }
  if (!sets.length) return;
  vals.push(id);
  await pool.query(
    `UPDATE census_directory_members SET ${sets.join(', ')} WHERE id = $${i}`,
    vals
  );
}

function toCsv(members) {
  const header = ['company_name', 'mc_number', 'dot_number', 'equipment_type', 'power_units', 'city', 'state', 'phone', 'email', 'cargo_carried'];
  const lines = [header.join(',')];
  for (const row of members) {
    lines.push(header.map((key) => {
      const val = String(row[key] == null ? '' : row[key]).replace(/"/g, '""');
      return `"${val}"`;
    }).join(','));
  }
  return lines.join('\n');
}

module.exports = {
  ensureCensusDirectorySchema,
  createDirectory,
  listDirectories,
  getDirectory,
  addMembers,
  deleteDirectory,
  markMember,
  toCsv
};
