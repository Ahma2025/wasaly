const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

// Dashboard stats
router.get('/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const [users, restaurants, orders, revenue, drivers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role=$1', ['customer']),
      pool.query('SELECT COUNT(*) FROM restaurants WHERE is_active=true'),
      pool.query(`SELECT COUNT(*), status FROM orders WHERE created_at > NOW()-INTERVAL '30 days' GROUP BY status`),
      pool.query(`SELECT SUM(total) as total, SUM(total*commission_rate/100) as commission
                  FROM orders o JOIN restaurants r ON o.restaurant_id=r.id WHERE o.status='delivered' AND o.created_at > NOW()-INTERVAL '30 days'`),
      pool.query('SELECT COUNT(*) FROM drivers WHERE is_online=true')
    ]);

    const dailyRevenue = await pool.query(
      `SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders
       FROM orders WHERE status='delivered' AND created_at > NOW()-INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date`
    );

    res.json({
      success: true,
      data: {
        totalUsers: parseInt(users.rows[0].count),
        totalRestaurants: parseInt(restaurants.rows[0].count),
        activeDrivers: parseInt(drivers.rows[0].count),
        orders: orders.rows,
        revenue: revenue.rows[0],
        dailyRevenue: dailyRevenue.rows
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Users management
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { role, search, limit = 20, offset = 0 } = req.query;
    let q = 'SELECT id,name,email,phone,role,is_active,is_blocked,created_at,loyalty_points,wallet_balance FROM users WHERE 1=1';
    const params = [];
    let idx = 1;
    if (role) { q += ` AND role=$${idx++}`; params.push(role); }
    if (search) { q += ` AND (name ILIKE $${idx} OR phone ILIKE $${idx} OR email ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    q += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    const { rows: total } = await pool.query('SELECT COUNT(*) FROM users');
    res.json({ success: true, data: rows, total: total[0].count });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Block/unblock user
router.patch('/users/:id/block', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE users SET is_blocked = NOT is_blocked WHERE id=$1 RETURNING is_blocked', [req.params.id]);
    res.json({ success: true, is_blocked: rows[0].is_blocked });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// All orders
router.get('/orders', auth, adminOnly, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0, from, to } = req.query;
    let q = `SELECT o.*, r.name_ar as restaurant_name, u.name as customer_name, d.name as driver_name
             FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
             LEFT JOIN users u ON o.customer_id=u.id LEFT JOIN users d ON o.driver_id=d.id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (status) { q += ` AND o.status=$${idx++}`; params.push(status); }
    if (from) { q += ` AND o.created_at >= $${idx++}`; params.push(from); }
    if (to) { q += ` AND o.created_at <= $${idx++}`; params.push(to); }
    q += ` ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Approve/reject restaurant
router.patch('/restaurants/:id/verify', auth, adminOnly, async (req, res) => {
  try {
    const { verified } = req.body;
    await pool.query('UPDATE restaurants SET is_verified=$1, is_active=$1 WHERE id=$2', [verified, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Feature restaurant
router.patch('/restaurants/:id/feature', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE restaurants SET is_featured = NOT is_featured WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Send push to all users
router.post('/notifications/broadcast', auth, adminOnly, async (req, res) => {
  try {
    const { title_ar, body_ar, title_en, body_en, role } = req.body;
    let q = 'SELECT id FROM users WHERE is_active=true';
    const params = [];
    if (role) { q += ' AND role=$1'; params.push(role); }
    const { rows: users } = await pool.query(q, params);

    for (const user of users) {
      await pool.query(
        'INSERT INTO notifications (user_id, title_ar, title_en, body_ar, body_en, type) VALUES ($1,$2,$3,$4,$5,$6)',
        [user.id, title_ar, title_en, body_ar, body_en, 'broadcast']
      );
    }
    res.json({ success: true, sent: users.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Analytics
router.get('/analytics', auth, adminOnly, async (req, res) => {
  try {
    const [topRestaurants, topCustomers, cityStats] = await Promise.all([
      pool.query(`SELECT r.name_ar, COUNT(o.id) as orders, SUM(o.total) as revenue
                  FROM restaurants r LEFT JOIN orders o ON r.id=o.restaurant_id AND o.status='delivered'
                  GROUP BY r.id ORDER BY revenue DESC LIMIT 10`),
      pool.query(`SELECT u.name, u.phone, COUNT(o.id) as orders, SUM(o.total) as spent
                  FROM users u LEFT JOIN orders o ON u.id=o.customer_id AND o.status='delivered'
                  WHERE u.role='customer' GROUP BY u.id ORDER BY spent DESC LIMIT 10`),
      pool.query(`SELECT city, COUNT(*) as restaurants FROM restaurants WHERE is_active=true GROUP BY city ORDER BY restaurants DESC`)
    ]);
    res.json({ success: true, data: { topRestaurants: topRestaurants.rows, topCustomers: topCustomers.rows, cityStats: cityStats.rows } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
