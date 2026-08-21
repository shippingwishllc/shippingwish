# Shipping Wish LLC — Website + Dispatch TMS Backend

Truck dispatch website + full TMS for **Shipping Wish LLC** (+1 917 737 0021 · info@shippingwish.com).

## What's included

- Marketing website (Home, Services, About, Request Service, Privacy Policy, Terms & Conditions)
- Carrier signup/login + carrier dashboard (view assigned loads, update status)
- Dispatcher dashboard (create loads, assign carriers, track status)
- IFTA quarterly mileage report (by state)
- Freight invoicing with PDF generation, paid/unpaid tracking
- Request Service form that emails your team via Resend

## Requires

- Node.js 18+
- PostgreSQL (already installed on this server)

---

## First-time setup (new server or first deploy of the TMS)

### 1. Create the database

Open **pgAdmin** (or `psql`) and create a new database:

```sql
CREATE DATABASE shippingwish;
```

### 2. Run the schema

From the project folder:

```
psql -U postgres -d shippingwish -f sql/schema.sql
```

(If `psql` isn't on your PATH, find it under your PostgreSQL install, e.g.
`"C:\Program Files\PostgreSQL\18\bin\psql.exe"` and use the full path.)

This creates all tables: `users`, `loads`, `load_status_history`, `load_state_miles`, `invoices`.

### 3. Set your `.env`

Copy `.env.example` to `.env` if you haven't already, and fill in the Postgres section:

```
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_real_postgres_password
PGDATABASE=shippingwish
```

Use whatever Postgres user/password you already set up on this server.

### 4. Install dependencies

```
npm install
```

This installs the two new packages this update adds: `pg` (Postgres client) and `pdfkit` (invoice PDFs).

### 5. Create your dispatcher accounts

Public sign-up (`/signup.html`) only creates **carrier** accounts. Dispatcher and admin accounts
are created from the command line (so they can't be self-registered by the public):

```
node scripts/create-user.js "Dispatcher Name" dispatcher@shippingwish.com SomePassword123 dispatcher
```

Run this once per dispatcher (you said 5+ to start — just repeat with different names/emails).
For your own admin account:

```
node scripts/create-user.js "Your Name" you@shippingwish.com SomePassword123 admin
```

### 6. Restart the site

```
& "C:\ats\tools\nssm.exe" restart ShippingWishWeb
```

(or whatever exact command you used before — same service, no Caddy changes needed here.)

---

## How the roles work

- **Carrier** — signs up publicly on `/signup.html`, logs in, lands on `/dashboard.html` — sees only their own loads, can update status and log mileage.
- **Dispatcher** — created via `scripts/create-user.js`, logs in at `/login.html`, lands on `/dispatcher-dashboard.html` — creates loads, assigns carriers, views all loads, generates invoices, runs IFTA reports.
- **Admin** — same access as dispatcher (for now).

## Load status flow

`Booked → Dispatched → At Pickup → Loaded → In Transit → At Delivery → Delivered → Invoiced → Paid`

Dispatchers can set any status. Carriers can update up through "Delivered" — invoicing status is
set automatically when a dispatcher generates the invoice.

## Project structure (new additions)

```
shippingwish/
├── db.js                    # Postgres connection pool
├── sql/schema.sql           # database tables
├── middleware/auth.js       # JWT auth + role checks
├── routes/
│   ├── auth.js               # signup, login, me, logout, carrier list
│   ├── loads.js              # load CRUD, status updates, mileage
│   ├── ifta.js                # quarterly IFTA report
│   └── invoices.js           # invoice generation, PDF, paid/unpaid
├── scripts/create-user.js   # CLI tool to create dispatcher/admin accounts
├── invoices_pdf/             # generated invoice PDFs are stored here
└── public/
    ├── dispatcher-dashboard.html
    ├── load-detail.html
    ├── ifta.html
    ├── invoices.html
    ├── dashboard.html         # now the carrier dashboard
    └── js/tms.js              # all TMS frontend logic
```

## Editing content

Page text lives in the `.html` files under `public/`. Colors/fonts are in `public/css/style.css`.
