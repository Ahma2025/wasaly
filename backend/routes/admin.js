const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

// Dashboard stats
router.get('/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const [users, restaurants, activeDrivers, ordersToday, revenueToday, pendingOrders] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM users WHERE role='customer' AND is_active=true"),
      pool.query("SELECT COUNT(*) as count FROM restaurants WHERE is_active=true"),
      pool.query("SELECT COUNT(*) as count FROM drivers WHERE is_online=true"),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE TO_CHAR(created_at, 'YYYY-MM-DD')=TO_CHAR(NOW(), 'YYYY-MM-DD')"),
      pool.query("SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status='delivered' AND TO_CHAR(created_at, 'YYYY-MM-DD')=TO_CHAR(NOW(), 'YYYY-MM-DD')"),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status='pending'"),
    ]);

    const { rows: weeklyRevenue } = await pool.query(
      `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
       FROM orders WHERE status='delivered' AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD') ORDER BY date`
    );

    const { rows: ordersByStatus } = await pool.query(
      `SELECT status, COUNT(*) as count FROM orders WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY status`
    );

    res.json({
      success: true,
      data: {
        totalUsers: users.rows[0].count || 0,
        totalRestaurants: restaurants.rows[0].count || 0,
        activeDrivers: activeDrivers.rows[0].count || 0,
        ordersToday: ordersToday.rows[0].count || 0,
        revenueToday: revenueToday.rows[0].total || 0,
        pendingOrders: pendingOrders.rows[0].count || 0,
        weeklyRevenue,
        ordersByStatus
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Users list
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { role, search, limit = 30, offset = 0 } = req.query;
    let q = `SELECT id,name,email,phone,role,is_active,is_blocked,created_at,wallet_balance,loyalty_points FROM users WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (role) { q += ` AND role=$${idx++}`; params.push(role); }
    if (search) { q += ` AND (name LIKE $${idx} OR phone LIKE $${idx})`; params.push(`%${search}%`); idx++; }
    q += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    const { rows: total } = await pool.query('SELECT COUNT(*) as count FROM users');
    res.json({ success: true, data: rows, total: total[0].count });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Create user (admin)
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, phone, password, role = 'customer' } = req.body;
    const bcrypt = require('bcryptjs');
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, phone, bcrypt.hashSync(password || '123456', 10), role]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Block/unblock user
router.patch('/users/:id/block', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT is_blocked FROM users WHERE id=$1', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const newVal = !rows[0].is_blocked;
    await pool.query('UPDATE users SET is_blocked=$1 WHERE id=$2', [newVal, req.params.id]);
    res.json({ success: true, is_blocked: newVal });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete user
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query("UPDATE users SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// All orders
router.get('/orders', auth, adminOnly, async (req, res) => {
  try {
    const { status, limit = 30, offset = 0, search } = req.query;
    let q = `SELECT o.*, r.name_ar as restaurant_name, u.name as customer_name,
             d.name as driver_name FROM orders o
             LEFT JOIN restaurants r ON o.restaurant_id=r.id
             LEFT JOIN users u ON o.customer_id=u.id
             LEFT JOIN users d ON o.driver_id=d.id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (status) { q += ` AND o.status=$${idx++}`; params.push(status); }
    if (search) { q += ` AND (o.order_number LIKE $${idx} OR u.name LIKE $${idx})`; params.push(`%${search}%`); idx++; }
    q += ` ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    const { rows: total } = await pool.query('SELECT COUNT(*) as count FROM orders');
    res.json({ success: true, data: rows, total: total[0].count });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// All restaurants
router.get('/restaurants', auth, adminOnly, async (req, res) => {
  try {
    const { search, limit = 30, offset = 0 } = req.query;
    let q = `SELECT r.*, u.name as owner_name, u.phone as owner_phone,
             (SELECT COUNT(*) FROM orders WHERE restaurant_id=r.id AND status='delivered') as total_orders,
             (SELECT COALESCE(SUM(total),0) FROM orders WHERE restaurant_id=r.id AND status='delivered') as total_revenue
             FROM restaurants r LEFT JOIN users u ON r.owner_id=u.id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (search) { q += ` AND (r.name_ar LIKE $${idx} OR u.phone LIKE $${idx})`; params.push(`%${search}%`); idx++; }
    q += ` ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);
    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Create restaurant (admin)
router.post('/restaurants', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, description_ar, category_id, city, address, lat, lng,
            phone, email, min_order, delivery_fee, delivery_time_min, delivery_time_max,
            owner_phone, owner_password, store_type } = req.body;

    let owner_id = null;
    if (owner_phone) {
      const bcrypt = require('bcryptjs');
      const { rows: existing } = await pool.query('SELECT id FROM users WHERE phone=$1', [owner_phone]);
      if (existing[0]) {
        owner_id = existing[0].id;
        await pool.query("UPDATE users SET role='restaurant_owner' WHERE id=$1", [owner_id]);
      } else {
        const { rows: newUser } = await pool.query(
          `INSERT INTO users (name, phone, password_hash, role) VALUES ($1,$2,$3,'restaurant_owner') RETURNING *`,
          [name_ar, owner_phone, bcrypt.hashSync(owner_password || 'rest123', 10)]
        );
        owner_id = newUser[0].id;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO restaurants (name_ar, description_ar, category_id, city, address, lat, lng,
        phone, email, min_order, delivery_fee, delivery_time_min, delivery_time_max, owner_id, is_active, is_verified, store_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,true,$15) RETURNING *`,
      [name_ar, description_ar, category_id, city, address, lat || 31.9, lng || 35.2,
       phone, email, min_order || 10, delivery_fee || 5, delivery_time_min || 20, delivery_time_max || 40, owner_id,
       store_type || 'restaurant']
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update restaurant (admin)
router.put('/restaurants/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, description_ar, category_id, city, address, lat, lng,
            phone, delivery_fee, min_order, delivery_time_min, delivery_time_max } = req.body;
    await pool.query(
      `UPDATE restaurants SET name_ar=$1, description_ar=$2, category_id=$3, city=$4,
       address=$5, lat=$6, lng=$7, phone=$8, delivery_fee=$9, min_order=$10,
       delivery_time_min=$11, delivery_time_max=$12 WHERE id=$13`,
      [name_ar, description_ar, category_id, city, address, lat, lng, phone,
       delivery_fee, min_order, delivery_time_min, delivery_time_max, req.params.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete restaurant (admin)
router.delete('/restaurants/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query("UPDATE restaurants SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Toggle restaurant active/verified
router.patch('/restaurants/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { field } = req.body; // 'is_active' or 'is_featured' or 'is_verified'
    const allowed = ['is_active', 'is_featured', 'is_verified', 'is_open'];
    if (!allowed.includes(field)) return res.status(400).json({ success: false });
    const { rows } = await pool.query(`SELECT ${field} FROM restaurants WHERE id=$1`, [req.params.id]);
    const newVal = !rows[0]?.[field];
    await pool.query(`UPDATE restaurants SET ${field}=$1 WHERE id=$2`, [newVal, req.params.id]);
    res.json({ success: true, value: newVal });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Driver stats for admin
router.get('/driver-stats/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows: stats } = await pool.query(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(delivery_fee),0) as total_earnings,
              COALESCE(AVG(delivery_fee),0) as avg_per_delivery
       FROM orders WHERE driver_id=$1 AND status='delivered'`,
      [req.params.id]
    );
    const { rows: weekly } = await pool.query(
      `SELECT TO_CHAR(delivered_at, 'YYYY-MM-DD') as date, COUNT(*) as orders, COALESCE(SUM(delivery_fee),0) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered' AND delivered_at > NOW() - INTERVAL '7 days'
       GROUP BY TO_CHAR(delivered_at, 'YYYY-MM-DD') ORDER BY date DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...stats[0], weekly } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Analytics
router.get('/analytics', auth, adminOnly, async (req, res) => {
  try {
    const [topRestaurants, topDrivers, monthlyRevenue, ordersByStatus] = await Promise.all([
      pool.query(`SELECT r.name_ar, COUNT(o.id) as orders, COALESCE(SUM(o.total),0) as revenue
                  FROM restaurants r LEFT JOIN orders o ON r.id=o.restaurant_id AND o.status='delivered'
                  GROUP BY r.id, r.name_ar ORDER BY orders DESC LIMIT 10`),
      pool.query(`SELECT u.name, u.phone, COUNT(o.id) as orders, COALESCE(SUM(o.delivery_fee),0) as earnings
                  FROM users u LEFT JOIN orders o ON u.id=o.driver_id AND o.status='delivered'
                  WHERE u.role='driver' GROUP BY u.id, u.name, u.phone ORDER BY orders DESC LIMIT 10`),
      pool.query(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
                  FROM orders WHERE status='delivered' AND created_at > NOW() - INTERVAL '6 months'
                  GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month`),
      pool.query(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`)
    ]);

    res.json({ success: true, data: {
      topRestaurants: topRestaurants.rows,
      topDrivers: topDrivers.rows,
      monthlyRevenue: monthlyRevenue.rows,
      ordersByStatus: ordersByStatus.rows
    }});
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Categories management
router.get('/categories', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY sort_order');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/categories', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, name_en, icon } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO categories (name_ar, name_en, icon) VALUES ($1,$2,$3) RETURNING *',
      [name_ar, name_en, icon]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Broadcast push notification to users
router.post('/notifications/broadcast', auth, adminOnly, async (req, res) => {
  try {
    const { title, body, target, role } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'العنوان والمحتوى مطلوبان' });

    let query = 'SELECT id, fcm_token FROM users WHERE fcm_token IS NOT NULL AND is_active=true';
    const params = [];
    if (target === 'role' && role) {
      query += ' AND role=$1';
      params.push(role);
    }
    const { rows: users } = await pool.query(query, params);

    // Save notifications in DB
    for (const user of users) {
      await pool.query(
        'INSERT INTO notifications (user_id, title, body, type) VALUES ($1,$2,$3,$4)',
        [user.id, title, body, 'broadcast']
      );
    }

    const { sendFCM } = require('../utils/notifications');
    const bundleMap = { customer: 'com.wasaly.customer', driver: 'com.wasaly.driver', restaurant: 'com.wasaly.restaurant' };
    const bundleId = (target === 'role' && role) ? (bundleMap[role] || 'com.wasaly.customer') : 'com.wasaly.customer';
    const tokens = users.map(u => u.fcm_token).filter(Boolean);
    if (tokens.length > 0) {
      const chunks = [];
      for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));
      for (const chunk of chunks) await sendFCM(chunk, title, body, { type: 'broadcast' }, bundleId);
    }
    res.json({ success: true, recipients: users.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
