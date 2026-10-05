const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { round2, num } = require('../utils/orderService');

const stripUser = (u) => { if (!u) return u; const { password_hash, ...rest } = u; return rest; };
const ROLES = ['customer', 'driver', 'restaurant_owner', 'restaurant', 'admin'];
// "اليوم" بتوقيت فلسطين (Asia/Hebron) — الأعمدة TIMESTAMP مخزّنة بتوقيت UTC
const LOCAL_DAY = (col) => `((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron')::date = (NOW() AT TIME ZONE 'Asia/Hebron')::date`;
const DRIVER_EARN = `COALESCE(o.driver_fee, o.delivery_fee, 0) + COALESCE(o.tip, 0)`;

// Dashboard stats
router.get('/dashboard', auth, adminOnly, async (req, res) => {
  try {
    const [users, restaurants, activeDrivers, ordersToday, revenueToday, pendingOrders] = await Promise.all([
      pool.query("SELECT COUNT(*) as count FROM users WHERE role='customer' AND is_active=true"),
      pool.query("SELECT COUNT(*) as count FROM restaurants WHERE is_active=true"),
      pool.query("SELECT COUNT(*) as count FROM drivers WHERE is_online=true"),
      pool.query(`SELECT COUNT(*) as count FROM orders WHERE ${LOCAL_DAY('created_at')}`),
      pool.query(`SELECT COALESCE(SUM(total),0) as total FROM orders WHERE status='delivered' AND ${LOCAL_DAY('created_at')}`),
      pool.query("SELECT COUNT(*) as count FROM orders WHERE status='pending'"),
    ]);
    const { rows: weeklyRevenue } = await pool.query(
      `SELECT TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') as date, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
       FROM orders WHERE status='delivered' AND created_at > NOW() - INTERVAL '7 days'
       GROUP BY 1 ORDER BY date`);
    const { rows: ordersByStatus } = await pool.query(
      `SELECT status, COUNT(*) as count FROM orders WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY status`);
    res.json({ success: true, data: {
      totalUsers: users.rows[0].count || 0,
      totalRestaurants: restaurants.rows[0].count || 0,
      activeDrivers: activeDrivers.rows[0].count || 0,
      ordersToday: ordersToday.rows[0].count || 0,
      revenueToday: round2(num(revenueToday.rows[0].total)),
      pendingOrders: pendingOrders.rows[0].count || 0,
      weeklyRevenue, ordersByStatus,
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Users list — role=restaurant يشمل restaurant_owner
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { role, search } = req.query;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    let where = ' WHERE 1=1';
    const params = [];
    if (role) {
      const roles = role === 'restaurant' || role === 'restaurant_owner' ? ['restaurant', 'restaurant_owner'] : [role];
      params.push(roles); where += ` AND role = ANY($${params.length}::text[])`;
    }
    if (search) { params.push(`%${search}%`); where += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length})`; }
    const { rows } = await pool.query(
      `SELECT id,name,email,phone,role,is_active,is_blocked,created_at,wallet_balance,loyalty_points FROM users${where}
       ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const { rows: total } = await pool.query(`SELECT COUNT(*) as count FROM users${where}`, params);
    res.json({ success: true, data: rows, total: total[0].count });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Create user (admin) — كلمة مرور إلزامية، دور من قائمة معروفة، وصف drivers للسائق
router.post('/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, phone, password, role = 'customer', vehicle_type, vehicle_plate } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور مطلوبة (6 أحرف على الأقل)' });
    if (!ROLES.includes(role)) return res.status(400).json({ success: false, message: 'دور غير صحيح' });
    const { rows: ex } = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (ex[0]) return res.status(409).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    const hash = await bcrypt.hash(String(password), 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,$4,true) RETURNING *`, [name, phone, hash, role]);
    if (role === 'driver') {
      await pool.query('INSERT INTO drivers (user_id, vehicle_type, vehicle_plate) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING',
        [rows[0].id, vehicle_type || 'دراجة', vehicle_plate || '']);
    }
    res.status(201).json({ success: true, data: stripUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    res.status(500).json({ success: false, message: e.message });
  }
});

// Block/unblock user
router.patch('/users/:id/block', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_blocked FROM users WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const newVal = !rows[0].is_blocked;
    await pool.query('UPDATE users SET is_blocked=$1 WHERE id=$2', [newVal, req.params.id]);
    res.json({ success: true, is_blocked: newVal });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Delete user (soft)
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query("UPDATE users SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// All orders
router.get('/orders', auth, adminOnly, async (req, res) => {
  try {
    const { status, search } = req.query;
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    let q = `SELECT o.*, r.name_ar as restaurant_name, u.name as customer_name, d.name as driver_name FROM orders o
             LEFT JOIN restaurants r ON o.restaurant_id=r.id
             LEFT JOIN users u ON o.customer_id=u.id
             LEFT JOIN users d ON o.driver_id=d.id WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND o.status=$${params.length}`; }
    if (search) { params.push(`%${search}%`); q += ` AND (o.order_number ILIKE $${params.length} OR u.name ILIKE $${params.length})`; }
    q += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const { rows } = await pool.query(q, [...params, limit, offset]);
    const { rows: total } = await pool.query('SELECT COUNT(*) as count FROM orders');
    res.json({ success: true, data: rows, total: total[0].count });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// All restaurants — limit حتى 1000
router.get('/restaurants', auth, adminOnly, async (req, res) => {
  try {
    const { search } = req.query;
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    let q = `SELECT r.*, u.name as owner_name, u.phone as owner_phone,
             (SELECT COUNT(*) FROM orders WHERE restaurant_id=r.id AND status='delivered') as total_orders,
             (SELECT COALESCE(SUM(total),0) FROM orders WHERE restaurant_id=r.id AND status='delivered') as total_revenue
             FROM restaurants r LEFT JOIN users u ON r.owner_id=u.id WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); q += ` AND (r.name_ar ILIKE $${params.length} OR u.phone ILIKE $${params.length})`; }
    q += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const { rows } = await pool.query(q, [...params, limit, offset]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Create restaurant (admin) — رقم مالك مستخدم مسبقاً → 409 (لا ترقية صامتة لأي حساب)
router.post('/restaurants', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, description_ar, category_id, city, address, lat, lng,
      phone, email, min_order, delivery_fee, delivery_time_min, delivery_time_max,
      owner_phone, owner_password, owner_name, store_type } = req.body;
    if (!name_ar) return res.status(400).json({ success: false, message: 'اسم المطعم مطلوب' });

    let owner_id = null;
    if (owner_phone) {
      if (!owner_password || String(owner_password).length < 6) {
        return res.status(400).json({ success: false, message: 'كلمة مرور صاحب المطعم مطلوبة (6 أحرف على الأقل)' });
      }
      const { rows: existing } = await pool.query('SELECT id FROM users WHERE phone=$1', [owner_phone]);
      if (existing[0]) return res.status(409).json({ success: false, message: 'رقم هاتف صاحب المطعم مسجّل مسبقاً لمستخدم آخر' });
      const hash = await bcrypt.hash(String(owner_password), 12);
      try {
        const { rows: newUser } = await pool.query(
          `INSERT INTO users (name, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,'restaurant_owner',true) RETURNING id`,
          [owner_name || name_ar, owner_phone, hash]);
        owner_id = newUser[0].id;
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ success: false, message: 'رقم هاتف صاحب المطعم مسجّل مسبقاً لمستخدم آخر' });
        throw e;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO restaurants (name_ar, description_ar, category_id, city, address, lat, lng,
        phone, email, min_order, delivery_fee, delivery_time_min, delivery_time_max, owner_id, is_active, is_verified, store_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,true,$15) RETURNING *`,
      [name_ar, description_ar, category_id || null, city, address, lat || 31.9, lng || 35.2,
       phone, email, min_order || 10, delivery_fee || 5, delivery_time_min || 20, delivery_time_max || 40, owner_id,
       store_type || 'restaurant']);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Update restaurant (admin) — تحديث جزئي (لا يمسح الحقول غير المرسلة)
router.put('/restaurants/:id', auth, adminOnly, async (req, res) => {
  try {
    const allowed = ['name_ar', 'name_en', 'description_ar', 'category_id', 'city', 'address', 'lat', 'lng', 'phone', 'email',
      'delivery_fee', 'min_order', 'delivery_time_min', 'delivery_time_max', 'store_type', 'logo', 'cover_image', 'opens_at', 'closes_at'];
    const sets = []; const vals = [];
    for (const k of allowed) if (req.body[k] !== undefined) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
    if (!sets.length) return res.status(400).json({ success: false, message: 'لا يوجد ما يُحدَّث' });
    vals.push(req.params.id);
    await pool.query(`UPDATE restaurants SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length}`, vals);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Delete restaurant (soft)
router.delete('/restaurants/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query("UPDATE restaurants SET is_active=false WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Toggle restaurant flags
router.patch('/restaurants/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { field } = req.body;
    const allowed = ['is_active', 'is_featured', 'is_verified', 'is_open'];
    if (!allowed.includes(field)) return res.status(400).json({ success: false });
    const { rows } = await pool.query(`SELECT ${field} FROM restaurants WHERE id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'المطعم غير موجود' });
    const newVal = !rows[0][field];
    await pool.query(`UPDATE restaurants SET ${field}=$1 WHERE id=$2`, [newVal, req.params.id]);
    res.json({ success: true, value: newVal });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Driver stats (earnings = driver_fee + tip)
router.get('/driver-stats/:id', auth, adminOnly, async (req, res) => {
  try {
    const { rows: stats } = await pool.query(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(${DRIVER_EARN}),0) as total_earnings,
              COALESCE(AVG(${DRIVER_EARN}),0) as avg_per_delivery
       FROM orders o WHERE o.driver_id=$1 AND o.status='delivered'`, [req.params.id]);
    const { rows: weekly } = await pool.query(
      `SELECT TO_CHAR(o.delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron', 'YYYY-MM-DD') as date, COUNT(*) as orders, COALESCE(SUM(${DRIVER_EARN}),0) as earnings
       FROM orders o WHERE o.driver_id=$1 AND o.status='delivered' AND o.delivered_at > NOW() - INTERVAL '7 days'
       GROUP BY 1 ORDER BY date DESC`, [req.params.id]);
    res.json({ success: true, data: { ...stats[0], weekly } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Analytics
router.get('/analytics', auth, adminOnly, async (req, res) => {
  try {
    const [topRestaurants, topDrivers, monthlyRevenue, ordersByStatus] = await Promise.all([
      pool.query(`SELECT r.name_ar, COUNT(o.id) as orders, COALESCE(SUM(o.total),0) as revenue
                  FROM restaurants r LEFT JOIN orders o ON r.id=o.restaurant_id AND o.status='delivered'
                  GROUP BY r.id, r.name_ar ORDER BY orders DESC LIMIT 10`),
      pool.query(`SELECT u.name, u.phone, COUNT(o.id) as orders, COALESCE(SUM(${DRIVER_EARN}),0) as earnings
                  FROM users u LEFT JOIN orders o ON u.id=o.driver_id AND o.status='delivered'
                  WHERE u.role='driver' GROUP BY u.id, u.name, u.phone ORDER BY orders DESC LIMIT 10`),
      pool.query(`SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COALESCE(SUM(total),0) as revenue, COUNT(*) as orders
                  FROM orders WHERE status='delivered' AND created_at > NOW() - INTERVAL '6 months'
                  GROUP BY TO_CHAR(created_at, 'YYYY-MM') ORDER BY month`),
      pool.query(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`),
    ]);
    res.json({ success: true, data: {
      topRestaurants: topRestaurants.rows, topDrivers: topDrivers.rows,
      monthlyRevenue: monthlyRevenue.rows, ordersByStatus: ordersByStatus.rows,
    } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Categories management
router.get('/categories', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories ORDER BY sort_order');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/categories', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, name_en, icon } = req.body;
    const { rows } = await pool.query('INSERT INTO categories (name_ar, name_en, icon) VALUES ($1,$2,$3) RETURNING *', [name_ar, name_en, icon]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/categories/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Broadcast — role=restaurant يستهدف restaurant + restaurant_owner
router.post('/notifications/broadcast', auth, adminOnly, async (req, res) => {
  try {
    const { title, body, target, role } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: 'العنوان والمحتوى مطلوبان' });

    let query = 'SELECT id, fcm_token, role FROM users WHERE fcm_token IS NOT NULL AND is_active=true';
    const params = [];
    if (target === 'role' && role) {
      const roles = role === 'restaurant' || role === 'restaurant_owner' ? ['restaurant', 'restaurant_owner'] : [role];
      query += ' AND role = ANY($1::text[])';
      params.push(roles);
    }
    const { rows: users } = await pool.query(query, params);

    const CHUNK = 500;
    for (let i = 0; i < users.length; i += CHUNK) {
      const slice = users.slice(i, i + CHUNK);
      const vals = [];
      const ph = slice.map((u, j) => {
        const b = j * 4;
        vals.push(u.id, title, body, 'broadcast');
        return `($${b + 1},$${b + 2},$${b + 2},$${b + 3},$${b + 3},$${b + 4})`;
      }).join(',');
      try { await pool.query(`INSERT INTO notifications (user_id, title, title_ar, body, body_ar, type) VALUES ${ph}`, vals); }
      catch (e) { console.error('broadcast insert chunk failed:', e.message); }
    }

    const { sendFCM } = require('../utils/notifications');
    const bundleMap = { customer: 'com.wasaly.customer', driver: 'com.wasaly.driver', restaurant: 'com.wasaly.restaurant', restaurant_owner: 'com.wasaly.restaurant', admin: 'com.wasaly.admin' };
    const byBundle = {};
    const seenTokens = new Set();
    for (const u of users) {
      if (!u.fcm_token || seenTokens.has(u.fcm_token)) continue;
      seenTokens.add(u.fcm_token);
      const b = bundleMap[u.role] || 'com.wasaly.customer';
      (byBundle[b] = byBundle[b] || []).push(u.fcm_token);
    }
    res.json({ success: true, recipients: users.length, queued: true });
    (async () => {
      for (const [bundleId, toks] of Object.entries(byBundle)) {
        for (let i = 0; i < toks.length; i += 500) {
          try { await sendFCM(toks.slice(i, i + 500), title, body, { type: 'broadcast' }, bundleId); } catch { /* ignore */ }
        }
      }
      console.log(`[broadcast] done: ${users.length} recipients`);
    })();
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// لوحة العمليات الحية
router.get('/live-ops', auth, adminOnly, async (req, res) => {
  try {
    const { rows: orders } = await pool.query(
      `SELECT o.id, o.order_number, o.status, o.total, o.order_type, o.driver_assigned_at,
              o.delivery_lat, o.delivery_lng, o.created_at,
              r.name_ar AS restaurant_name, r.lat AS restaurant_lat, r.lng AS restaurant_lng,
              cu.name AS customer_name, cu.phone AS customer_phone,
              dr.name AS driver_name, dr.phone AS driver_phone,
              d.current_lat AS driver_lat, d.current_lng AS driver_lng
       FROM orders o
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       LEFT JOIN users cu ON o.customer_id = cu.id
       LEFT JOIN users dr ON o.driver_id = dr.id
       LEFT JOIN drivers d ON d.user_id = o.driver_id
       WHERE o.status IN ('pending','confirmed','preparing','ready','on_the_way')
       ORDER BY o.created_at DESC LIMIT 200`);
    const { rows: drivers } = await pool.query(
      `SELECT u.name, u.phone, d.current_lat, d.current_lng, d.is_busy, d.rating
       FROM drivers d JOIN users u ON d.user_id = u.id
       WHERE d.is_online = true AND d.current_lat IS NOT NULL AND d.current_lng IS NOT NULL`);
    res.json({ success: true, orders, drivers });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// المحاسبة والعمولات — كل المطاعم النشطة (LEFT JOIN)، السائقون مجمّعون بالمعرّف
// العمولة = subtotal × نسبة العمولة المسجّلة على الطلب وقت إنشائه (commission_pct) وإلا نسبة المطعم الحالية للطلبات القديمة
router.get('/accounting', auth, adminOnly, async (req, res) => {
  try {
    const { rows: rests } = await pool.query(
      `SELECT r.id, r.name_ar AS name, COALESCE(r.commission_rate, 15) AS commission_rate,
              COUNT(o.id)::int AS orders,
              COALESCE(SUM(o.subtotal), 0) AS sales,
              COALESCE(SUM(o.subtotal * COALESCE(o.commission_pct, r.commission_rate, 15) / 100.0), 0) AS commission,
              COALESCE(SUM(o.discount), 0) AS discounts,
              COALESCE(SUM(o.tip), 0) AS tips,
              COALESCE(SUM(o.delivery_fee), 0) AS delivery_fees
       FROM restaurants r
       LEFT JOIN orders o ON o.restaurant_id = r.id AND o.status = 'delivered'
       WHERE r.is_active = true OR o.id IS NOT NULL
       GROUP BY r.id, r.name_ar, r.commission_rate
       ORDER BY sales DESC, r.name_ar`);
    const restaurants = rests.map(r => {
      const sales = round2(num(r.sales));
      const commission = round2(num(r.commission));
      return {
        id: r.id, name: r.name, orders: r.orders, sales, commission_rate: num(r.commission_rate), commission,
        net: round2(sales - commission), discounts: round2(num(r.discounts)), tips: round2(num(r.tips)), delivery_fees: round2(num(r.delivery_fees)),
      };
    });

    const { rows: drivers } = await pool.query(
      `SELECT u.id, u.name, COUNT(o.id)::int AS deliveries,
              COALESCE(SUM(${DRIVER_EARN}), 0) AS earnings, COALESCE(SUM(o.tip), 0) AS tips
       FROM orders o JOIN users u ON o.driver_id = u.id
       WHERE o.status = 'delivered' AND o.driver_id IS NOT NULL
       GROUP BY u.id, u.name ORDER BY earnings DESC`);
    const driversOut = drivers.map(d => ({ id: d.id, name: d.name, deliveries: d.deliveries, earnings: round2(num(d.earnings)), tips: round2(num(d.tips)) }));

    const { rows: tot } = await pool.query(
      `SELECT COALESCE(SUM(tip),0) AS tips, COALESCE(SUM(delivery_fee),0) AS delivery_fees,
              COALESCE(SUM(discount),0) + COALESCE(SUM(points_value),0) AS discounts,
              COALESCE(SUM(COALESCE(driver_fee, delivery_fee, 0)),0) AS driver_fees
       FROM orders WHERE status='delivered'`);
    const sum = (arr, k) => round2(arr.reduce((s, x) => s + x[k], 0));
    const totals = {
      sales: sum(restaurants, 'sales'),
      commission: sum(restaurants, 'commission'),
      restaurant_net: sum(restaurants, 'net'),
      driver_earnings: sum(driversOut, 'earnings'),
      orders: restaurants.reduce((s, r) => s + r.orders, 0),
      tips: round2(num(tot[0]?.tips)),
      delivery_fees: round2(num(tot[0]?.delivery_fees)),
      discounts: round2(num(tot[0]?.discounts)),
      // دعم التوصيل المجاني من المنصة = ما دُفع للسائقين من رسوم − ما دفعه الزبائن من رسوم
      delivery_subsidy: round2(num(tot[0]?.driver_fees) - num(tot[0]?.delivery_fees)),
    };
    res.json({ success: true, totals, restaurants, drivers: driversOut });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// تعديل نسبة عمولة مطعم
router.patch('/restaurants/:id/commission', auth, adminOnly, async (req, res) => {
  try {
    const rate = parseFloat(req.body.rate);
    if (isNaN(rate) || rate < 0 || rate > 100) return res.status(400).json({ success: false, message: 'نسبة غير صحيحة (0-100)' });
    await pool.query('UPDATE restaurants SET commission_rate=$1 WHERE id=$2', [rate, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ⚙️ إعدادات التوصيل الشخصي
router.get('/settings/personal-delivery', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='personal_delivery'");
    const val = rows[0] ? JSON.parse(rows[0].value) : { enabled: false };
    res.json({ success: true, data: val });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.put('/settings/personal-delivery', auth, adminOnly, async (req, res) => {
  try {
    const cfg = req.body || {};
    const clean = { enabled: !!cfg.enabled };
    await pool.query(
      `INSERT INTO app_settings(key, value, updated_at) VALUES ('personal_delivery', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [JSON.stringify(clean)]);
    res.json({ success: true, data: clean });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
