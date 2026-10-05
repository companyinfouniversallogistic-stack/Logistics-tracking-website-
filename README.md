# Logistics Tracking Portal — Online Version

A small production-oriented starter app with:

- Admin login
- Server-side tracking-number generation
- SQLite database
- Shipment creation
- Shipment status updates + tracking history
- Public customer tracking page at `/`
- Admin dashboard at `/admin`
- Password hashing with bcrypt
- Secure HTTP headers with Helmet
- Login rate limiting
- HTTP-only session cookie
- Docker support

## 1. Run locally

Install Node.js 20+.

```bash
npm install
cp .env.example .env
```

Edit `.env` and set a strong `SESSION_SECRET` and a strong `ADMIN_PASSWORD`.

Then:

```bash
npm start
```

Open:

- Customer tracking: `http://localhost:3000/`
- Admin dashboard: `http://localhost:3000/admin`

## 2. Database

The default database is SQLite at `./data/logistics.db`.

For an online deployment, put the SQLite database on persistent storage/volume. If your host does not provide persistent storage, migrate the database layer to PostgreSQL before launch.

## 3. Deployment

This app can be deployed to a Node-compatible host such as Render, Railway, Fly.io, or a VPS.

Typical settings:

- Build command: `npm install`
- Start command: `npm start`
- Node: 20+
- Environment variables:
  - `NODE_ENV=production`
  - `SESSION_SECRET=<long random secret>`
  - `ADMIN_USERNAME=<your admin username>`
  - `ADMIN_PASSWORD=<strong unique password>`
  - `DB_PATH=./data/logistics.db`

**Important:** SQLite must be stored on persistent disk/volume. Do not rely on ephemeral filesystem storage for a live database.

## 4. Before real customer use

- Put the site behind HTTPS.
- Change the default admin credentials.
- Use a persistent database.
- Back up the database.
- Add staff roles if multiple employees need access.
- Add an audit log for sensitive changes.
- Consider PostgreSQL for multiple staff/users or higher traffic.
- Add a proper email/SMS notification provider only if you actually operate that notification workflow.
- Review privacy requirements for storing recipient information.
- Do not create a tracking record unless it corresponds to a genuine shipment.

## 5. Tracking workflow

1. Staff signs in at `/admin`.
2. Staff creates a real shipment record.
3. Server generates a unique tracking number.
4. Staff gives that tracking number to the customer.
5. Staff updates status as the shipment genuinely progresses.
6. Customer enters the tracking number at `/`.

The public API is:

`GET /api/track/<TRACKING_NUMBER>`

It returns the shipment's current status and tracking history.

## Security note

This starter is suitable as a foundation, not a substitute for a security review. For a business handling identity documents or other sensitive information, do not store ID-card images in this basic app. Use a dedicated secure document/identity-verification provider or a properly secured private storage system with strict access controls and retention rules.
