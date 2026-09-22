// routes/customers.js
const express = require('express');
const db = require('../db/init');
const { requireStaff } = require('../middleware/auth');

const router = express.Router();

// Staff-only directory lookup. Never exposed to customers — this is the
// piece that keeps any one customer from seeing everyone else's details.
router.get('/', requireStaff, (req, res) => {
  const q = (req.query.search || '').trim();
  let rows;
  if (q) {
    rows = db.prepare('SELECT id, name, phone FROM customers WHERE name LIKE ? ORDER BY name LIMIT 200')
      .all(`%${q}%`);
  } else {
    rows = db.prepare('SELECT id, name, phone FROM customers ORDER BY name LIMIT 200').all();
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM customers').get().n;
  res.json({ total, results: rows });
});

module.exports = router;
