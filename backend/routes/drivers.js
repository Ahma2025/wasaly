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
const { noteDriverSeen, hasActiveAssignment, releaseDriverOffers } = require('../utils/driverPresence');
const { maybeRefreshToken } = require('../utils/jwtKey');
const { canonicalPhone } = require('../utils/phone');

const stripUser = (u) => { if (!u) return u; const { password_hash, ...rest } = u; return rest; };

// Driver goes online/offline
router.patch('/status', auth, driverOnly, async (req, res) => {
  try {
    const { is_online, lat, lng } = req.body;
    const hasLoc = validCoord(lat, lng);
    // 🛑 D-08: لا يمكن الخروج من الاستقبال/تسجيل الخروج وعليه توصيلة مُسندة (يبقى الطلب معلّقاً عليه ويتوقف التتبع)
    if (!is_online && await hasActiveAssignment(req.user.id)) {
      return res.status(409).json({ success: false, code: 'ACTIVE_DELIVERY', message: 'لا يمكنك إيقاف الاستقبال أو تسجيل الخروج وعندك طلب قيد التوصيل — سلّمه أولاً' });
    }
    const { rowCount } = await pool.query(
      `UPDATE drivers SET is_online=$1,
         current_lat=COALESCE($2, current_lat), current_lng=COALESCE($3, current_lng),
         lat=COALESCE($2, lat), lng=COALESCE($3, lng) WHERE user_id=$4`,
      [!!is_online, hasLoc ? +lat : null, hasLoc ? +lng : null, req.user.id]
    );
    if (!rowCount) return res.status(404).json({ success: false, message: 'ملف السائق غير موجود — تواصل مع الإدارة' });
    if (hasLoc) await driverLoc.setLocation(req.user.id, +lat, +lng, { dbWritten: true }).catch(() => {});
    if (is_online) await noteDriverSeen(req.user.id, { force: true });
    else await releaseDriverOffers(req.io, req.user.id); // عرض قائم لم يُقبل → لسائق آخر فوراً بدل انتظار 45ث
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
      if (active.group_id) payload.group_id = active.group_id;
      notifyUser(req.io, active.customer_id, 'driver:location', payload);
      const owners = new Set([...(active.owner_ids || []), active.owner_id].filter(Boolean).map(String));
      for (const ow of owners) notifyUser(req.io, ow, 'driver:location', payload);
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
      active = { ...active, tip, cash_to_collect: (!active.group_id && active.payment_method !== 'card' && active.payment_status !== 'paid') ? round2(num(active.total)) : 0 };
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
    // 🧺 طلب مجمّع حالي (عرض أو مهمة) — التطبيق الجديد يعتمد عليه؛ active_order يبقى للتوافق
    let activeGroup = null;
    try { activeGroup = await require('../utils/groupService').activeGroupForDriver(req.user.id); } catch (e) { console.error('active group:', e.message); }
    if (active && active.group_id) { active.is_group = true; }
    if (active && active.is_offer && active.expires_at) { active.offer_id = `${active.id}|${active.expires_at}`; }
    if (active) delete active.payment_ref_history;
    // D-07: تجديد منزلق للتوكن (اختياري للتطبيق: يخزّن refreshed_token إن وُجد)
    const refreshed = maybeRefreshToken(req.user, req.tokenDecoded);
    res.json({ success: true, server_now: new Date().toISOString(), ...(refreshed ? { refreshed_token: refreshed } : {}),
      data: { ...drivers[0], active_order: active, active_group: activeGroup } });
  } catch (e) {
    console.error('driver me:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Driver earnings — period: today (Asia/Hebron calendar day) | week (last 7 days) | month (current calendar month)
const EARN = `COALESCE(driver_fee, delivery_fee, 0) + COALESCE(tip, 0)`;
const LOCAL = `(delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron')`;
// رحلة واحدة لكل طلب مجمّع (أبناؤه = توصيلة واحدة؛ المال على "الابن الحامل" فقط)
const TRIP = `COALESCE(-group_id, id)`;
router.get('/earnings', auth, driverOnly, async (req, res) => {
  try {
    const period = ['today', 'week', 'month'].includes(req.query.period) ? req.query.period : 'today';
    // نطاقات نصف مفتوحة بتوقيت فلسطين (تستخدم الفهرس بدل تحويل كل صف)
    const range = period === 'week' ? null : hebronRange(period === 'month' ? 'month' : 'day');
    const where = range ? `delivered_at >= $2::timestamp AND delivered_at < $3::timestamp` : `delivered_at > NOW() - INTERVAL '7 days'`;
    const { rows: stats } = await pool.query(
      `SELECT COUNT(DISTINCT ${TRIP}) as deliveries, COALESCE(SUM(${EARN}),0) as earnings, COALESCE(SUM(COALESCE(tip,0)),0) as tips
       FROM orders WHERE driver_id=$1 AND status='delivered' AND ${where}`, range ? [req.user.id, range.start, range.end] : [req.user.id]);
    const { rows: daily } = await pool.query(
      `SELECT TO_CHAR(${LOCAL}, 'YYYY-MM-DD') as date, COUNT(DISTINCT ${TRIP}) as count, COALESCE(SUM(${EARN}),0) as earnings
       FROM orders WHERE driver_id=$1 AND status='delivered' AND delivered_at > NOW() - INTERVAL '31 days'
       GROUP BY 1 ORDER BY date DESC`, [req.user.id]);
    const { rows: driver } = await pool.query('SELECT wallet_balance, total_deliveries FROM drivers WHERE user_id=$1', [req.user.id]);
    const s = stats[0] || {};
    // D-09: أيام متصلة (بتوقيت فلسطين) بأصفار للأيام بلا توصيل — حتى يصدق عنوان "آخر N يوم" (فارغة إن لا توصيل إطلاقاً)
    const byDate = new Map(daily.map(d => [d.date, d]));
    const contDaily = [];
    if (daily.length) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const base = Date.parse(`${today}T12:00:00Z`); // حساب تقويمي بحت (لا يتأثر بالتوقيت الصيفي)
      for (let i = 0; i < 31; i++) {
        const key = new Date(base - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const hit = byDate.get(key);
        contDaily.push(hit ? { ...hit, earnings: round2(num(hit.earnings)) } : { date: key, count: '0', earnings: 0 });
      }
    }
    res.json({ success: true, data: {
      period,
      period_label: period === 'week' ? 'آخر 7 أيام' : period === 'month' ? 'هذا الشهر' : 'اليوم',
      stats: { deliveries: s.deliveries || '0', earnings: round2(num(s.earnings)), tips: round2(num(s.tips)) },
      daily: contDaily,
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
              (COALESCE(o.driver_fee, o.delivery_fee, 0) + COALESCE(o.tip, 0)) AS driver_earning,
              g.group_number, g.status AS group_status, g.stops_total AS group_stops_count,
              (COALESCE(g.driver_fee, 0) + COALESCE(g.tip, 0)) AS group_driver_earning, (o.group_id IS NOT NULL) AS is_group
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.customer_id=u.id
       LEFT JOIN order_groups g ON g.id = o.group_id
       WHERE o.driver_id=$1 AND (o.driver_assigned_at IS NOT NULL OR o.status='delivered')
       ORDER BY o.created_at DESC, o.id DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    // D-24/D-35: كل ابن يحمل ربح المجموعة/عدد محطاتها (لا 0.00₪ لو انقسمت المجموعة بين صفحتين) وحالة المجموعة (picking_up)
    res.json({ success: true, data: rows.map(o => {
      const x = { ...o };
      delete x.payment_ref_history;
      if (o.group_id) {
        x.group_driver_earning = round2(num(o.group_driver_earning));
        x.display_status = ['picking_up', 'on_the_way', 'delivered', 'cancelled'].includes(o.group_status) && o.status !== 'cancelled' ? o.group_status : o.status;
      } else { x.group_driver_earning = null; x.display_status = o.status; }
      return x;
    }) });
  } catch (e) {
    console.error('driver orders:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get all drivers (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.name, u.phone, u.avatar, u.is_blocked, u.is_active,
              (SELECT COUNT(DISTINCT COALESCE(-group_id, id)) FROM orders WHERE driver_id=d.user_id AND status='delivered') as total_orders,
              (SELECT COUNT(DISTINCT COALESCE(-group_id, id)) FROM orders WHERE driver_id=d.user_id AND status='delivered') as total_trips,
              EXISTS (SELECT 1 FROM orders WHERE driver_id=d.user_id AND driver_assigned_at IS NOT NULL AND status IN ('confirmed','preparing','ready','on_the_way')) AS has_active_delivery,
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
    const { name, password, vehicle_type, vehicle_plate } = req.body;
    const phone = canonicalPhone(req.body.phone);
    if (!name || !phone) return res.status(400).json({ success: false, message: 'الاسم ورقم الهاتف مطلوبان' });
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور مطلوبة (6 أحرف على الأقل)' });
    const { rows: existing } = await pool.query('SELECT id, is_active FROM users WHERE phone=$1', [phone]);
    if (existing[0]) {
      // A-07: حساب معطّل بنفس الرقم → رسالة واضحة + معرّفه لإعادة التفعيل (PATCH /admin/users/:id/reactivate)
      if (existing[0].is_active === false) return res.status(409).json({ success: false, code: 'INACTIVE_ACCOUNT', user_id: existing[0].id, message: 'هذا الرقم لحساب معطّل — أعد تفعيله بدل إنشاء حساب جديد' });
      return res.status(400).json({ success: false, code: 'PHONE_EXISTS', message: 'رقم الهاتف مسجل مسبقاً' });
    }
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

// ✏️ A-02: تعديل مركبة السائق (الإدارة) — :id = user_id (كما في GET /drivers). PUT و PATCH بنفس السلوك (تحديث جزئي)
async function updateDriver(req, res) {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'السائق غير موجود' });
    const b = req.body || {};
    const sets = [], vals = [];
    for (const k of ['vehicle_type', 'vehicle_plate', 'vehicle_number', 'national_id', 'license_number']) {
      if (b[k] === undefined) continue;
      const v = b[k] === null ? null : String(b[k]).trim().slice(0, 60);
      vals.push(v); sets.push(`${k}=$${vals.length}`);
    }
    if (b.vehicle_type !== undefined && !String(b.vehicle_type || '').trim()) return res.status(400).json({ success: false, message: 'اختر نوع المركبة' });
    if (!sets.length && b.name === undefined) return res.status(400).json({ success: false, message: 'لا يوجد ما يُحدَّث' });
    let row = null;
    if (sets.length) {
      vals.push(req.params.id);
      const { rows } = await pool.query(`UPDATE drivers SET ${sets.join(', ')} WHERE user_id=$${vals.length} RETURNING *`, vals);
      if (!rows[0]) return res.status(404).json({ success: false, message: 'السائق غير موجود' });
      row = rows[0];
    }
    if (b.name !== undefined && String(b.name).trim()) {
      await pool.query("UPDATE users SET name=$1 WHERE id=$2 AND role='driver'", [String(b.name).trim().slice(0, 100), req.params.id]);
    }
    if (!row) { const { rows } = await pool.query('SELECT * FROM drivers WHERE user_id=$1', [req.params.id]); row = rows[0]; }
    if (!row) return res.status(404).json({ success: false, message: 'السائق غير موجود' });
    res.json({ success: true, data: row });
  } catch (e) { serverError(res, e); }
}
router.put('/:id', auth, adminOnly, updateDriver);
router.patch('/:id', auth, adminOnly, updateDriver);

// Delete driver (admin) — A-08: مرفوض وعليه توصيلة نشطة (الطلب كان يعلق)؛ العروض غير المقبولة تُسحب ويُعاد توزيعها
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'السائق غير موجود' });
    if (await hasActiveAssignment(req.params.id)) {
      return res.status(409).json({ success: false, code: 'ACTIVE_DELIVERY', message: 'لا يمكن حذف السائق وهو يوصّل طلباً الآن — انتظر حتى يسلّمه أو ألغِ الطلب' });
    }
    await pool.query('UPDATE drivers SET is_online=false WHERE user_id=$1', [req.params.id]);
    await releaseDriverOffers(req.io, req.params.id);
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
