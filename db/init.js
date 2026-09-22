// db/init.js
// Creates the SQLite schema on first run and seeds it with your product
// catalog and customer contact list. Safe to run every time the server
// starts — it only creates/seeds what's missing.

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'ginni.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    password_is_default INTEGER NOT NULL DEFAULT 1,
    default_password_source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'executive',
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    image TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS product_sizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL REFERENCES products(id),
    label TEXT NOT NULL,
    pcs_per_bundle INTEGER,
    weight_kg REAL,
    rate_per_kg REAL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_code TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    size_label TEXT NOT NULL,
    pcs_per_bundle INTEGER,
    bundles INTEGER NOT NULL,
    weight_kg REAL,
    rate_per_kg REAL,
    estimated_amount REAL
  );
`);

// --- Migrations: the live database on Render already exists with the
// older schema, so CREATE TABLE IF NOT EXISTS above won't add new columns
// to it. Add any columns that are missing, without touching existing data.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = cols.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Migrated: added ${table}.${column}`);
  }
}
ensureColumn('product_sizes', 'weight_kg', 'REAL');
ensureColumn('product_sizes', 'rate_per_kg', 'REAL');
ensureColumn('order_items', 'weight_kg', 'REAL');
ensureColumn('order_items', 'rate_per_kg', 'REAL');
ensureColumn('order_items', 'estimated_amount', 'REAL');
ensureColumn('customers', 'password_is_default', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('customers', 'default_password_source', 'TEXT');

function seedProducts() {
  // Always re-sync from catalog.json (not just on first run) so editing
  // that file and redeploying is enough to update products, sizes, pcs,
  // weight, and rate — orders already placed keep their own snapshot in
  // order_items, so this is safe to re-run on every deploy.
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'catalog.json'), 'utf8'));
  const insertProduct = db.prepare('INSERT OR REPLACE INTO products (id, name, category, image, sort_order) VALUES (?, ?, ?, ?, ?)');
  const insertSize = db.prepare('INSERT INTO product_sizes (product_id, label, pcs_per_bundle, weight_kg, rate_per_kg) VALUES (?, ?, ?, ?, ?)');
  const deleteSizesFor = db.prepare('DELETE FROM product_sizes WHERE product_id = ?');

  catalog.forEach((p, i) => {
    insertProduct.run(p.id, p.name, p.category, p.image, i);
    deleteSizesFor.run(p.id);
    p.sizes.forEach((s) => insertSize.run(
      p.id,
      s.label,
      s.pcs === null || s.pcs === undefined ? null : s.pcs,
      s.weightKg === null || s.weightKg === undefined ? null : s.weightKg,
      s.ratePerKg === null || s.ratePerKg === undefined ? null : s.ratePerKg
    ));
  });

  console.log(`Synced ${catalog.length} products from catalog.json.`);
}

// Derives a default password from a customer's business name: the first
// word, letters only, lowercase. "Aasirwal Bartan Store" -> "aasirwal".
function passwordFromName(name) {
  const firstToken = String(name).trim().split(/\s+/)[0] || '';
  const lettersOnly = firstToken.replace(/[^A-Za-z]/g, '').toLowerCase();
  return lettersOnly || (process.env.DEFAULT_CUSTOMER_PASSWORD || 'ginni123');
}

function seedCustomers() {
  const contacts = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'contacts.json'), 'utf8'));
  const getByPhone = db.prepare('SELECT id, password_is_default, default_password_source FROM customers WHERE phone = ?');
  const insert = db.prepare(
    'INSERT INTO customers (name, phone, password_hash, must_change_password, password_is_default, default_password_source) VALUES (?, ?, ?, 0, 1, ?)'
  );
  const updateDefault = db.prepare(
    'UPDATE customers SET password_hash = ?, must_change_password = 0, default_password_source = ? WHERE id = ?'
  );

  let created = 0;
  let refreshed = 0;
  contacts.forEach((c) => {
    const candidate = passwordFromName(c.name);
    const existing = getByPhone.get(c.phone);
    if (!existing) {
      insert.run(c.name, c.phone, bcrypt.hashSync(candidate, 8), candidate);
      created++;
    } else if (existing.password_is_default && existing.default_password_source !== candidate) {
      // Still on the auto-generated default, and the name-derived password
      // has actually changed (e.g. contact list corrected) — only then is
      // a fresh (slow) bcrypt hash worth doing. A customer who has
      // personally set their own password (password_is_default = 0) is
      // never touched here, and unchanged defaults are skipped entirely
      // so redeploys stay fast.
      updateDefault.run(bcrypt.hashSync(candidate, 8), candidate, existing.id);
      refreshed++;
    }
  });

  console.log(`Customers: ${created} newly added, ${refreshed} refreshed to a new name-based default password.`);
}

function seedStaff() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM staff').get().n;
  if (count > 0) return;

  const email = process.env.DEFAULT_STAFF_EMAIL || 'orders@ginnisteel.com';
  const password = process.env.DEFAULT_STAFF_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO staff (name, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)')
    .run('Order Desk Manager', email, hash, 'executive');

  console.log(`Seeded 1 staff login: ${email} / "${password}" (change this on first login).`);
}

seedProducts();
seedCustomers();
seedStaff();

module.exports = db;
