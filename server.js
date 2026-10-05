require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = process.env.DB_PATH || "./data/logistics.db";
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== ".") fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_number TEXT NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  package_description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id) ON DELETE CASCADE
);
`);

const adminUser = process.env.ADMIN_USERNAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "change-this-immediately";
const existingAdmin = db.prepare("SELECT id FROM admins WHERE username = ?").get(adminUser);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(adminUser, hash);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false
});

function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.status(401).json({ error: "Authentication required." });
  next();
}

function generateTrackingNumber() {
  let value;
  do {
    value = "LOG-" + new Date().getFullYear() + "-" +
      crypto.randomBytes(4).toString("hex").toUpperCase();
  } while (db.prepare("SELECT 1 FROM shipments WHERE tracking_number = ?").get(value));
  return value;
}

const STATUSES = ["Shipment created", "In transit", "Out for delivery", "Delivered"];

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });

  const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }

  req.session.adminId = admin.id;
  res.json({ ok: true });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ authenticated: Boolean(req.session.adminId) });
});

app.get("/api/admin/shipments", requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT id, tracking_number, recipient_name, destination, package_description,
           status, created_at, updated_at
    FROM shipments
    ORDER BY created_at DESC
  `).all();
  res.json(rows);
});

app.post("/api/admin/shipments", requireAdmin, (req, res) => {
  const { recipientName, destination, packageDescription, status, note } = req.body || {};
  if (!recipientName || !destination || !packageDescription) {
    return res.status(400).json({ error: "Recipient, destination, and package description are required." });
  }
  const initialStatus = STATUSES.includes(status) ? status : "Shipment created";
  const trackingNumber = generateTrackingNumber();

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO shipments
      (tracking_number, recipient_name, destination, package_description, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(trackingNumber, recipientName.trim(), destination.trim(), packageDescription.trim(), initialStatus);

    db.prepare(`
      INSERT INTO tracking_events (shipment_id, status, note)
      VALUES (?, ?, ?)
    `).run(result.lastInsertRowid, initialStatus, (note || "").trim());

    return result.lastInsertRowid;
  });

  const id = create();
  res.status(201).json(
    db.prepare("SELECT * FROM shipments WHERE id = ?").get(id)
  );
});

app.patch("/api/admin/shipments/:id/status", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Invalid status." });

  const shipment = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id);
  if (!shipment) return res.status(404).json({ error: "Shipment not found." });

  db.transaction(() => {
    db.prepare(`
      UPDATE shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);
    db.prepare(`
      INSERT INTO tracking_events (shipment_id, status, note) VALUES (?, ?, ?)
    `).run(id, status, (note || "").trim());
  })();

  res.json(db.prepare("SELECT * FROM shipments WHERE id = ?").get(id));
});

app.delete("/api/admin/shipments/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const shipment = db.prepare("SELECT * FROM shipments WHERE id = ?").get(id);
  if (!shipment) return res.status(404).json({ error: "Shipment not found." });
  db.prepare("DELETE FROM shipments WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/track/:trackingNumber", (req, res) => {
  const trackingNumber = String(req.params.trackingNumber || "").trim().toUpperCase();
  const shipment = db.prepare(`
    SELECT id, tracking_number, recipient_name, destination,
           package_description, status, created_at, updated_at
    FROM shipments WHERE tracking_number = ?
  `).get(trackingNumber);

  if (!shipment) return res.status(404).json({ error: "Tracking number not found." });

  const events = db.prepare(`
    SELECT status, note, created_at
    FROM tracking_events
    WHERE shipment_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(shipment.id);

  // Public response intentionally omits internal database ID.
  res.json({ ...shipment, events });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Logistics portal running on http://localhost:${PORT}`);
});