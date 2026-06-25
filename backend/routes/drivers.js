const router = require('express').Router();
const pool = require('../config/database');
const { auth, driverOnly, adminOnly } = require('../middleware/auth');
const { notifyUser, saveNotification } = require('../utils/notifications');

// Get available drivers near location
router.get('/available', auth, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const { rows } = await pool.query(
      `SELECT d.*, u.name, u.phone, u.avatar FROM drivers d
       JOIN users u ON d.user_id=u.id
       WHERE d.is_online=true AND d.is_busy=false
       ORDER BY (point(d.current_lng, d.current_lat) <@> point($2::float, $1::float)) ASC LIMIT 10`,
      [lat, lng]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver goes online/offline
router.patch('/status', auth, driverOnly, async (req, res) => {
  try {
    const { is_online, lat, lng } = req.body;
    await pool.query(
      'UPDATE drivers SET is_online=$1, current_lat=$2, current_lng=$3 WHERE user_id=$4',
      [is_online, lat, lng, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update driver location
router.patch('/location', auth, driverOnly, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await pool.query('UPDATE drivers SET current_lat=$1, current_lng=$2 WHERE user_id=$3', [lat, lng, req.user.id]);
    // Get active order and notify customer
    const { rows: orders } = await pool.query(
      `SELECT customer_id FROM orders WHERE driver_id=$1 AND status='on_the_way'`, [req.user.id]
    );
    if (orders[0] && req.io) {
      notifyUser(req.io, orders[0].customer_id, 'driver:location', { lat, lng });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Accept order (driver)
router.post('/orders/:orderId/accept', auth, driverOnly, async (req, res) => {
  try {
    const { rows: orders } = await pool.query(
      `SELECT * FROM orders WHERE id=$1 AND status='confirmed' AND driver_id IS NULL`, [req.params.orderId]
    );
    if (!orders[0]) return res.status(400).json({ success: false, message: 'Order not available' });

    await pool.query(
      `UPDATE orders SET driver_id=$1, driver_assigned_at=NOW(), status='ready' WHERE id=$2`,
      [req.user.id, req.params.orderId]
    );
    await pool.query('UPDATE drivers SET is_busy=true WHERE user_id=$1', [req.user.id]);
    notifyUser(req.io, orders[0].customer_id, 'driver_assigned', { driver_id: req.user.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver earnings
router.get('/earnings', auth, driverOnly, async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const intervals = { today: '1 day', week: '7 days', month: '30 days' };
    const interval = intervals[period] || '1 day';

    const { rows: stats } = await pool.query(
      `SELECT COUNT(*) as deliveries, SUM(delivery_fee) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered' AND delivered_at > NOW()-INTERVAL '${interval}'`,
      [req.user.id]
    );
    const { rows: daily } = await pool.query(
      `SELECT DATE(delivered_at) as date, COUNT(*) as count, SUM(delivery_fee) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered' AND delivered_at > NOW()-INTERVAL '30 days'
       GROUP BY DATE(delivered_at) ORDER BY date DESC`,
      [req.user.id]
    );
    const { rows: driver } = await pool.query('SELECT wallet_balance FROM drivers WHERE user_id=$1', [req.user.id]);

    res.json({ success: true, data: { stats: stats[0], daily, wallet_balance: driver[0]?.wallet_balance || 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver orders history
router.get('/orders', auth, driverOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.*, r.name_ar as restaurant_name, u.name as customer_name FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id=r.id LEFT JOIN users u ON o.customer_id=u.id
       WHERE o.driver_id=$1 ORDER BY o.created_at DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Register as driver
router.post('/register', auth, async (req, res) => {
  try {
    const { vehicle_type, vehicle_plate, national_id, license_number } = req.body;
    await pool.query(`UPDATE users SET role='driver' WHERE id=$1`, [req.user.id]);
    const { rows } = await pool.query(
      `INSERT INTO drivers (user_id, vehicle_type, vehicle_plate, national_id, license_number)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET vehicle_type=$2, vehicle_plate=$3 RETURNING *`,
      [req.user.id, vehicle_type, vehicle_plate, national_id, license_number]
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
