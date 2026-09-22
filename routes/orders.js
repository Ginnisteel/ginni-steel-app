// routes/orders.js
const express = require('express');
const db = require('../db/init');
const { requireCustomer, requireStaff } = require('../middleware/auth');

const router = express.Router();
const STATUS_VALUES = ['new', 'processing', 'fulfilled'];

function nextOrderCode() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM orders").get();
  return `GS-${1000 + row.n + 1}`;
}

// Customer: submit a new order for themselves only.
router.post('/', requireCustomer, (req, res) => {
  const { items, note } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Order must include at least one item.' });
  }

  const insertOrder = db.prepare(
    'INSERT INTO orders (order_code, customer_id, note, status) VALUES (?, ?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO order_items (order_id, product_id, product_name, size_label, pcs_per_bundle, bundles) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const getSize = db.prepare('SELECT * FROM product_sizes WHERE product_id = ? AND label = ?');

  const orderCode = nextOrderCode();

  const tx = db.transaction(() => {
    const info = insertOrder.run(orderCode, req.session.user.id, note || null, 'new');
    const orderId = info.lastInsertRowid;

    for (const item of items) {
      const product = getProduct.get(item.productId);
      if (!product) throw new Error(`Unknown product: ${item.productId}`);
      const size = getSize.get(item.productId, item.size);
      const bundles = Math.max(1, parseInt(item.bundles, 10) || 1);
      insertItem.run(orderId, product.id, product.name, item.size, size ? size.pcs_per_bundle : null, bundles);
    }
    return orderId;
  });

  try {
    const orderId = tx();
    res.status(201).json({ id: orderId, orderCode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Customer: see their own order history.
router.get('/mine', requireCustomer, (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC'
  ).all(req.session.user.id);
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json(orders.map((o) => ({ ...o, items: itemStmt.all(o.id) })));
});

// Staff: see every order.
router.get('/', requireStaff, (req, res) => {
  const orders = db.prepare(`
    SELECT orders.*, customers.name AS customer_name, customers.phone AS customer_phone
    FROM orders JOIN customers ON customers.id = orders.customer_id
    ORDER BY orders.created_at DESC
  `).all();
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  res.json(orders.map((o) => ({ ...o, items: itemStmt.all(o.id) })));
});

// Staff: move an order through New -> Processing -> Fulfilled.
router.patch('/:id/status', requireStaff, (req, res) => {
  const { status } = req.body || {};
  if (!STATUS_VALUES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${STATUS_VALUES.join(', ')}` });
  }
  const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Order not found.' });
  res.json({ ok: true });
});

module.exports = router;
