// routes/products.js
const express = require('express');
const db = require('../db/init');
const { requireAnyUser } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAnyUser, (req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY sort_order').all();
  const sizeStmt = db.prepare('SELECT label, pcs_per_bundle AS pcs, weight_kg AS weightKg, rate_per_kg AS ratePerKg FROM product_sizes WHERE product_id = ? ORDER BY id');

  const result = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    image: `/images/${p.image}`,
    sizes: sizeStmt.all(p.id),
  }));

  res.json(result);
});

module.exports = router;
