// Create a dispatcher or admin account from the command line.
// Usage:
//   node scripts/create-user.js "Full Name" email@example.com password123 dispatcher
//   node scripts/create-user.js "Full Name" email@example.com password123 admin
//
// Role must be 'dispatcher' or 'admin'. (Carriers sign up themselves on /signup.html)

require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

async function main() {
  const [, , name, email, password, role] = process.argv;

  if (!name || !email || !password || !role) {
    console.log('Usage: node scripts/create-user.js "Full Name" email@example.com password123 dispatcher');
    process.exit(1);
  }
  if (!['dispatcher', 'admin'].includes(role)) {
    console.log('Role must be "dispatcher" or "admin".');
    process.exit(1);
  }

  const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email]);
  if (existing.rows.length) {
    console.log(`A user with email ${email} already exists (id ${existing.rows[0].id}).`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role`,
    [name, email, passwordHash, role]
  );

  console.log('Account created:');
  console.log(result.rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error creating user:', err);
  process.exit(1);
});
