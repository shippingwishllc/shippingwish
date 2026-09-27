// Database Initialization & Migration Script
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function initDb() {
  console.log('Connecting to PostgreSQL to run schema migrations...');
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    await pool.query(schemaSql);
    console.log('Schema migration executed successfully.');

    // Ensure Super Admin accounts exist (up to 2 accounts as requested)
    const adminCheck = await pool.query("SELECT id, email, role FROM users WHERE role IN ('super_admin', 'admin')");
    const superPass = process.env.SUPER_ADMIN_PASSWORD;
    const adminEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    if (adminCheck.rows.length === 0 && superPass && adminEmail) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(superPass, 12);
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, company_name, phone)
         VALUES ($1, $2, $3, 'super_admin', 'Shipping Wish HQ', $4)`,
        ['Super Admin', adminEmail, hash, process.env.COMPANY_PHONE || '+1 917 737 0021']
      );
      console.log('Created super admin from SUPER_ADMIN_EMAIL.');
    } else if (adminCheck.rows.length === 0) {
      console.log('No admin user yet. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD, then run this script again.');
    } else {
      console.log(`Found ${adminCheck.rows.length} existing admin/super_admin user(s).`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error running DB migration:', err.message);
    process.exit(1);
  }
}

initDb();
