const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { auth, driverOnly, adminOnly } = require('../middleware/auth');
const { notifyUser } = require('../utils/notifications');
const { validCoord, num, round2 } = require('../utils/orderService');
const driverLoc = require('../utils/driverLocation');
const { hebronRange } = require('../utils/time');
const { serverError, clampInt } = require('../utils/http');
const { invalidateSocketAuth } = require('../utils/socket');

const stripUser = (u) => { if (!u) return u; const { password_hash, ...rest } = u; return rest; };

// Driver goes online/offline
router.patch('/status', auth, driverOnly, async (req, res) => {
  try {
    const { is_online, lat, lng } = req.body;
    const hasLoc = validCoord(lat, lng);
    const { rowCount } = await pool.query(
      `UPDATE drivers SET is_online=$1,
         current_lat=COALESCE($2, current_lat), current_lng=COALESCE($3, current_lng),
         lat=COALESCE($2, lat), lng=COALESCE($3, lng) WHERE user_id=$4`,
      [!!is_online, hasLoc ? +lat : null, hasLoc ? +lng : null, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'ملف السائق غير موجود — تواصل مع الإدارة' });
    if (hasLoc) await driverLoc.setLocation(req.user.id, +lat, +lng, { dbWritten: true }).catch(() => {});
    res.json({ success: true });
  } catch (e) {
    console.error('driver status:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Update driver location — relay to customer + restaurant owner of the driver's accepted active order (incl. personal)
router.patch('/location', auth, driverOnly, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!validCoord(lat, lng)) return res.status(400).json({ success: false, message: 'إحداثيات غير صحيحة' });
    // ⚡️ آخر موقع → Redis فوراً، والقاعدة مرة كل 15 ثانية كحد أقصى لكل سائق
    await driverLoc.setLocation(req.user.id, +lat, +lng);
    // المستلمون من كاش الطلب النشط (يُبطَل عند أي تغيير حالة/قبول/إلغاء)
    const active = await driverLoc.getActiveRelay(req.user.id);
    if (active && !active.none && req.io) {
      const payload = { lat: +lat, lng: +lng, order_id: active.order_id, orderId: active.order_id };
      notifyUser(req.io, active.customer_id, 'driver:location', payload);
      if (active.owner_id) notifyUser(req.io, active.owner_id, 'driver:location', payload);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('driver location:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get driver profile + current order
router.get('/me', auth, driverOnly, async (req, res) => {
  try {
    const { rows: drivers } = await pool.query(
      `SELECT d.*, u.name, u.phone, u.avatar FROM drivers d JOIN users u ON d.user_id=u.id WHERE d.user_id=$1`, [req.user.id]);
    if (!drivers[0]) return res.status(404).json({ success: false, message: 'Driver not found' });
    const fresh = await driverLoc.getLocation(req.user.id);
    if (fresh) { drivers[0].current_lat = fresh.lat; drivers[0].current_lng = fresh.lng; }
    const { rows: activeOrders } = await pool.query(
      `SELECT o.*, r.name_ar as restaurant_name, r.lat as restaurant_lat, r.lng as restaurant_lng,
              r.phone as restaurant_phone, u.name as customer_name, u.phone as customer_phone
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.customer_id=u.id
       WHERE o.driver_id=$1 AND o.status NOT IN ('delivered','cancelled')
       ORDER BY (o.driver_assigned_at IS NULL) ASC, o.created_at DESC LIMIT 1`,
      [req.user.id]
    );
    let active = activeOrders[0] || null;
    if (active) {
      const tip = round2(num(active.tip));
      active = { ...active, tip, cash_to_collect: (active.payment_method !== 'card' && active.payment_status !== 'paid') ? round2(num(active.total)) : 0 };
      if (!active.driver_assigned_at) {
        // عرض لم يُقبل بعد (قد تكون حالته confirmed أو preparing أو ready)
        active.is_offer = true;
        if (active.driver_offer_expires_at) {
          const exp = new Date(active.driver_offer_expires_at);
          active.offer_seconds = Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000));
          active.expires_at = exp.toISOString();
        }
      }
    }
    res.json({ success: true, data: { ...drivers[0], active_order: active } });
  } catch (e) {
    console.error('driver me:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Driver earnings — period: today (Asia/Hebron calendar day) | week (last 7 days) | month (current calendar month)
const EARN = `COALESCE(driver_fee, delivery_fee, 0) + COALESCE(tip, 0)`;
const LOCAL = `(delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron')`;
router.get('/earnings', auth, driverOnly, async (req, res) => {
  try {
    const period = ['today', 'week', 'month'].includes(req.query.period) ? req.query.period : 'today';
    // نطاقات نصف مفتوحة بتوقيت فلسطين (تستخدم الفهرس بدل تحويل كل صف)
    const range = period === 'week' ? null : hebronRange(period === 'month' ? 'month' : 'day');
    const where = range ? `delivered_at >= $2::timestamp AND delivered_at < $3::timestamp` : `delivered_at > NOW() - INTERVAL '7 days'`;
    const { rows: stats } = await pool.query(
      `SELECT COUNT(*) as deliveries, COALESCE(SUM(${EARN}),0) as earnings, COALESCE(SUM(COALESCE(tip,0)),0) as tips
       FROM orders WHERE driver_id=$1 AND status='delivered' AND ${where}`, range ? [req.user.id, range.start, range.end] : [req.user.id]);
    const { rows: daily } = await pool.query(
      `SELECT TO_CHAR(${LOCAL}, 'YYYY-MM-DD') as date, COUNT(*) as count, COALESCE(SUM(${EARN}),0) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered' AND delivered_at > NOW() - INTERVAL '31 days'
       GROUP BY 1 ORDER BY date DESC`, [req.user.id]);
    const { rows: driver } = await pool.query('SELECT wallet_balance, total_deliveries FROM drivers WHERE user_id=$1', [req.user.id]);
    const s = stats[0] || {};
    res.json({ success: true, data: {
      period,
      stats: { deliveries: s.deliveries || '0', earnings: round2(num(s.earnings)), tips: round2(num(s.tips)) },
      daily: daily.map(d => ({ ...d, earnings: round2(num(d.earnings)) })),
      wallet_balance: round2(num(driver[0]?.wallet_balance)),
      total_deliveries: driver[0]?.total_deliveries || 0,
    } });
  } catch (e) {
    console.error('driver earnings:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Driver orders history (includes status / order_type / service_type)
router.get('/orders', auth, driverOnly, async (req, res) => {
  try {
    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 20, 1, 100);
    const offset = (page - 1) * limit;
    const { rows } = await pool.query(
      `SELECT o.*, o.status, o.order_type, o.service_type, r.name_ar as restaurant_name, u.name as customer_name,
              (COALESCE(o.driver_fee, o.delivery_fee, 0) + COALESCE(o.tip, 0)) AS driver_earning
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.customer_id=u.id
       WHERE o.driver_id=$1 AND (o.driver_assigned_at IS NOT NULL OR o.status='delivered')
       ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('driver orders:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get all drivers (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.name, u.phone, u.avatar, u.is_blocked,
              (SELECT COUNT(*) FROM orders WHERE driver_id=d.user_id AND status='delivered') as total_orders,
              (SELECT COALESCE(SUM(COALESCE(driver_fee, delivery_fee, 0) + COALESCE(tip,0)),0) FROM orders WHERE driver_id=d.user_id AND status='delivered') as total_earnings
       FROM drivers d JOIN users u ON d.user_id=u.id
       ORDER BY d.is_online DESC, total_orders DESC`
    );
    res.json({ success: true, data: rows });
  } catch (e) { serverError(res, e); }
});

// Add driver (admin) — كلمة المرور مطلوبة (6+)، لا كلمات افتراضية
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, phone, password, vehicle_type, vehicle_plate } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور مطلوبة (6 أحرف على الأقل)' });
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing[0]) return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    const hash = await bcrypt.hash(String(password), 12);
    const { rows: users } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, is_verified) VALUES ($1,$2,$3,'driver',true) RETURNING *`, [name, phone, hash]);
    const user = users[0];
    await pool.query(
      `INSERT INTO drivers (user_id, vehicle_type, vehicle_plate) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, vehicle_type || 'دراجة', vehicle_plate || '']);
    res.status(201).json({ success: true, data: stripUser(user) });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    serverError(res, e);
  }
});

// Delete driver (admin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE user_id=$1', [req.params.id]);
    await pool.query("UPDATE users SET is_active=false, role='customer' WHERE id=$1 AND role='driver'", [req.params.id]);
    invalidateSocketAuth(req.params.id);
    res.json({ success: true });
  } catch (e) { serverError(res, e); }
});

// Register a user as driver — إدارة فقط (كان أي مستخدم يحوّل نفسه لسائق بلا موافقة)
router.post('/register', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, vehicle_type, vehicle_plate, national_id, license_number } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id مطلوب' });
    const { rows: u } = await pool.query('SELECT id, role FROM users WHERE id=$1', [user_id]);
    if (!u[0]) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    if (u[0].role === 'admin') return res.status(400).json({ success: false, message: 'لا يمكن تحويل حساب إدارة إلى سائق' });
    await pool.query("UPDATE users SET role='driver' WHERE id=$1", [user_id]);
    invalidateSocketAuth(user_id);
    await pool.query(
      `INSERT INTO drivers (user_id, vehicle_type, vehicle_plate, national_id, license_number)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO NOTHING`,
      [user_id, vehicle_type || null, vehicle_plate || null, national_id || null, license_number || null]);
    res.json({ success: true });
  } catch (e) { serverError(res, e); }
});

module.exports = router;
