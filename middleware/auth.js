// middleware/auth.js
// Simple session-based guards. req.session.user is set at login time by
// routes/auth.js and looks like: { type: 'customer'|'staff', id, name, role? }

function requireCustomer(req, res, next) {
  if (!req.session.user || req.session.user.type !== 'customer') {
    return res.status(401).json({ error: 'Please log in as a customer.' });
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user || req.session.user.type !== 'staff') {
    return res.status(401).json({ error: 'Please log in as staff.' });
  }
  next();
}

function requireAnyUser(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Please log in.' });
  }
  next();
}

module.exports = { requireCustomer, requireStaff, requireAnyUser };
