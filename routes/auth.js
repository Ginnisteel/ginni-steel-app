// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/init');
const { requireAnyUser } = require('../middleware/auth');

const router = express.Router();

// Log in as either a customer (by phone number) or staff (by email).
// The frontend just sends whatever the person typed in "username" —
// we try staff first (email has an @), then customers (10-digit phone).
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const clean = String(username).trim();

  if (clean.includes('@')) {
    const staff = db.prepare('SELECT * FROM staff WHERE email = ?').get(clean.toLowerCase());
    if (staff && bcrypt.compareSync(password, staff.password_hash)) {
      req.session.user = { type: 'staff', id: staff.id, name: staff.name, role: staff.role };
      return res.json({ type: 'staff', name: staff.name, mustChangePassword: !!staff.must_change_password });
    }
  } else {
    const phone = clean.replace(/\D/g, '');
    const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
    if (customer && bcrypt.compareSync(password, customer.password_hash)) {
      req.session.user = { type: 'customer', id: customer.id, name: customer.name };
      return res.json({ type: 'customer', name: customer.name, mustChangePassword: !!customer.must_change_password });
    }
  }

  return res.status(401).json({ error: 'Incorrect username or password.' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  res.json({ user: req.session.user });
});

router.post('/change-password', requireAnyUser, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  const { type, id } = req.session.user;
  if (type === 'customer') {
    db.prepare('UPDATE customers SET password_hash = ?, must_change_password = 0, password_is_default = 0 WHERE id = ?').run(hash, id);
  } else {
    db.prepare('UPDATE staff SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, id);
  }
  res.json({ ok: true });
});

module.exports = router;
