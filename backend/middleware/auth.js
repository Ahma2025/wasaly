const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND is_active=true AND is_blocked=false', [decoded.id]);
    if (!rows[0]) return res.status(401).json({ success: false, message: 'User not found' });

    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
};

const restaurantOnly = (req, res, next) => {
  if (!['restaurant', 'admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Restaurant only' });
  next();
};

const driverOnly = (req, res, next) => {
  if (!['driver', 'admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Driver only' });
  next();
};

module.exports = { auth, adminOnly, restaurantOnly, driverOnly };
