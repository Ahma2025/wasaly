const router = require('express').Router();
const pool = require('../config/database');
const { auth, driverOnly, adminOnly } = require('../middleware/auth');
const { notifyUser, saveNotification } = require('../utils/notifications');

// Driver goes online/offline
router.patch('/status', auth, driverOnly, async (req, res) => {
  try {
    const { is_online, lat, lng } = req.body;
    await pool.query(
      'UPDATE drivers SET is_online=$1, current_lat=$2, current_lng=$3, lat=$2, lng=$3 WHERE user_id=$4',
      [is_online ? 1 : 0, lat || null, lng || null, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update driver location (called frequently while on delivery)
router.patch('/location', auth, driverOnly, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await pool.query(
      'UPDATE drivers SET current_lat=$1, current_lng=$2, lat=$1, lng=$2 WHERE user_id=$3',
      [lat, lng, req.user.id]
    );
    // Notify customer AND restaurant owner if there's an active delivery
    const { rows: orders } = await pool.query(
      `SELECT o.customer_id, o.id as order_id, r.owner_id
       FROM orders o JOIN restaurants r ON o.restaurant_id=r.id
       WHERE o.driver_id=$1 AND o.status='on_the_way'`,
      [req.user.id]
    );
    if (orders[0] && req.io) {
      const payload = { lat, lng, order_id: orders[0].order_id };
      notifyUser(req.io, orders[0].customer_id, 'driver:location', payload);
      if (orders[0].owner_id) {
        notifyUser(req.io, orders[0].owner_id, 'driver:location', payload);
      }
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get driver profile + current order
router.get('/me', auth, driverOnly, async (req, res) => {
  try {
    const { rows: drivers } = await pool.query(
      `SELECT d.*, u.name, u.phone, u.avatar FROM drivers d
       JOIN users u ON d.user_id=u.id WHERE d.user_id=$1`,
      [req.user.id]
    );
    if (!drivers[0]) return res.status(404).json({ success: false, message: 'Driver not found' });

    const { rows: activeOrders } = await pool.query(
      `SELECT o.*, r.name_ar as restaurant_name, r.lat as restaurant_lat, r.lng as restaurant_lng,
              r.phone as restaurant_phone, u.name as customer_name, u.phone as customer_phone
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.customer_id=u.id
       WHERE o.driver_id=$1 AND o.status NOT IN ('delivered','cancelled')
       ORDER BY o.created_at DESC LIMIT 1`,
      [req.user.id]
    );

    res.json({ success: true, data: { ...drivers[0], active_order: activeOrders[0] || null } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver earnings
router.get('/earnings', auth, driverOnly, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const intervals = { today: '-1 day', week: '-7 days', month: '-30 days' };
    const interval = intervals[period] || '-1 day';

    const { rows: stats } = await pool.query(
      `SELECT COUNT(*) as deliveries, COALESCE(SUM(delivery_fee),0) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered'
       AND delivered_at > datetime('now', '${interval}')`,
      [req.user.id]
    );
    const { rows: daily } = await pool.query(
      `SELECT strftime('%Y-%m-%d', delivered_at) as date, COUNT(*) as count, COALESCE(SUM(delivery_fee),0) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered'
       AND delivered_at > datetime('now', '-30 days')
       GROUP BY strftime('%Y-%m-%d', delivered_at) ORDER BY date DESC`,
      [req.user.id]
    );
    const { rows: driver } = await pool.query(
      'SELECT wallet_balance, total_deliveries FROM drivers WHERE user_id=$1', [req.user.id]
    );

    res.json({ success: true, data: {
      stats: stats[0],
      daily,
      wallet_balance: driver[0]?.wallet_balance || 0,
      total_deliveries: driver[0]?.total_deliveries || 0
    }});
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver orders history
router.get('/orders', auth, driverOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT o.*, r.name_ar as restaurant_name, u.name as customer_name
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.customer_id=u.id
       WHERE o.driver_id=$1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get all drivers (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.name, u.phone, u.avatar, u.is_blocked,
              (SELECT COUNT(*) FROM orders WHERE driver_id=d.user_id AND status='delivered') as total_orders,
              (SELECT COALESCE(SUM(delivery_fee),0) FROM orders WHERE driver_id=d.user_id AND status='delivered') as total_earnings
       FROM drivers d JOIN users u ON d.user_id=u.id
       ORDER BY d.is_online DESC, total_orders DESC`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Add driver (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, phone, password, vehicle_type, vehicle_plate } = req.body;
    const bcrypt = require('bcryptjs');
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing[0]) return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });

    const { rows: users } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role) VALUES ($1,$2,$3,'driver') RETURNING *`,
      [name, phone, bcrypt.hashSync(password || '123456', 10)]
    );
    const user = users[0];
    await pool.query(
      `INSERT INTO drivers (user_id, vehicle_type, vehicle_plate) VALUES ($1,$2,$3)`,
      [user.id, vehicle_type || 'دراجة', vehicle_plate || '']
    );
    res.status(201).json({ success: true, data: user });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete driver (admin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE user_id=$1', [req.params.id]);
    await pool.query("UPDATE users SET is_active=0, role='customer' WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Register as driver (self-registration)
router.post('/register', auth, async (req, res) => {
  try {
    const { vehicle_type, vehicle_plate, national_id, license_number } = req.body;
    await pool.query("UPDATE users SET role='driver' WHERE id=$1", [req.user.id]);
    await pool.query(
      `INSERT INTO drivers (user_id, vehicle_type, vehicle_plate, national_id, license_number)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, vehicle_type, vehicle_plate, national_id, license_number]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
