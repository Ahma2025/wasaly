const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { saveNotification, notifyUser, Notify, sendFCM, getUserTokens } = require('../utils/notifications');
const { sendWebPush } = require('./webpush');
const S = require('../utils/orderService');
const { round2, num, HttpError } = S;
const cache = require('../utils/cache');
const driverLoc = require('../utils/driverLocation');
const { serverError, clampInt, strParam } = require('../utils/http');

const LAHZA_ENABLED = () => !!process.env.LAHZA_SECRET_KEY;

const sendError = (res, e, tag) => {
  if (e instanceof HttpError) return res.status(e.status).json({ success: false, message: e.message, ...e.extra });
  return serverError(res, e, tag);
};

async function setOrderNumber(client, id) {
  const { rows } = await client.query(
    `UPDATE orders SET order_number = 'WSL' || LPAD(id::text, 6, '0') WHERE id=$1 RETURNING *`, [id]);
  return rows[0];
}

// ═══════════════════════════════════════════════════════════════
//  🧍📦 التوصيل الشخصي (راكب / طرد)
// ═══════════════════════════════════════════════════════════════
async function getPersonalConfig() {
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='personal_delivery'");
    return rows[0] ? JSON.parse(rows[0].value) : null;
  } catch (e) { return null; }
}

router.get('/personal/config', auth, async (req, res) => {
  const cfg = await getPersonalConfig();
  res.json({ success: true, data: cfg || { enabled: false } });
});

router.post('/personal/quote', auth, async (req, res) => {
  try {
    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng } = req.body;
    const cfg = await getPersonalConfig();
    if (!cfg || !cfg.enabled) return res.status(400).json({ success: false, message: 'الخدمة غير متاحة حالياً' });
    if (!S.validCoord(pickup_lat, pickup_lng) || !S.validCoord(dropoff_lat, dropoff_lng)) {
      return res.status(400).json({ success: false, message: 'حدّد نقطة الاستلام والتسليم' });
    }
    const km = S.haversineKm(+pickup_lat, +pickup_lng, +dropoff_lat, +dropoff_lng);
    const fare = await S.getZoneFee(pool, km);
    res.json({ success: true, data: { distance_km: round2(km), fare } });
  } catch (e) { sendError(res, e, 'personal quote'); }
});

router.post('/personal', auth, async (req, res) => {
  try {
    const {
      service_type = 'parcel', pickup_lat, pickup_lng, pickup_address,
      dropoff_lat, dropoff_lng, delivery_address,
      recipient_name, recipient_phone, parcel_desc, parcel_size, parcel_photo, passengers, notes,
    } = req.body;
    const cfg = await getPersonalConfig();
    if (!cfg || !cfg.enabled) return res.status(400).json({ success: false, message: 'الخدمة غير متاحة حالياً' });
    if (!S.validCoord(pickup_lat, pickup_lng) || !S.validCoord(dropoff_lat, dropoff_lng)) {
      return res.status(400).json({ success: false, message: 'حدّد نقطة الاستلام والتسليم' });
    }
    if (!['ride', 'parcel'].includes(service_type)) return res.status(400).json({ success: false, message: 'نوع الخدمة غير صحيح' });
    const pax = Math.min(8, Math.max(1, parseInt(passengers) || 1));
    const km = S.haversineKm(+pickup_lat, +pickup_lng, +dropoff_lat, +dropoff_lng);
    const fare = await S.getZoneFee(pool, km);

    const order = await S.withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO orders (order_number, customer_id, restaurant_id, delivery_address, delivery_lat, delivery_lng,
          subtotal, delivery_fee, driver_fee, tip, discount, total, payment_method, payment_status, notes, order_type, status,
          service_type, vehicle, pickup_lat, pickup_lng, pickup_address, recipient_name, recipient_phone,
          parcel_desc, parcel_size, parcel_photo, passengers, distance_km, loyalty_points_earned)
         VALUES ('', $1, NULL, $2, $3, $4, 0, $5::float8, $5::float8, 0, 0, $5::float8, 'cash', 'pending', $6, 'personal', 'confirmed',
          $7, NULL, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0) RETURNING id`,
        [req.user.id, String(delivery_address || '').slice(0, 500), +dropoff_lat, +dropoff_lng, fare, String(notes || '').slice(0, 1000),
         service_type, +pickup_lat, +pickup_lng, String(pickup_address || '').slice(0, 500),
         String(recipient_name || '').slice(0, 100), String(recipient_phone || '').slice(0, 30), String(parcel_desc || '').slice(0, 500),
         String(parcel_size || '').slice(0, 20), parcel_photo || '', pax, round2(km)]);
      return setOrderNumber(client, rows[0].id);
    });

    S.dispatchOrder(req.io, order.id).catch(() => {});
    res.json({ success: true, data: order });
  } catch (e) { sendError(res, e, 'personal order'); }
});

// ═══════════════════════════════════════════════════════════════
//  🧾 عرض سعر (نفس جسم POST /orders) — نفس دالة التسعير بالضبط
// ═══════════════════════════════════════════════════════════════
router.post('/quote', auth, async (req, res) => {
  try {
    const p = await S.priceOrder(pool, req.user.id, req.body, { quote: true });
    res.json({ success: true, data: S.quoteView(p) });
  } catch (e) { sendError(res, e, 'quote'); }
});

// ═══════════════════════════════════════════════════════════════
//  🛒 إنشاء طلب — معاملة واحدة: قفل المستخدم + تسعير + خصم محفظة/نقاط ذرّي + كوبون + إدراج
// ═══════════════════════════════════════════════════════════════
router.post('/', auth, async (req, res) => {
  try {
    const body = req.body || {};
    let paymentMethod = ['cash', 'card'].includes(body.payment_method) ? body.payment_method : 'cash';
    // البطاقة غير مفعّلة → التطبيق يخبر الزبون أن الطلب محفوظ للدفع عند الاستلام
    if (paymentMethod === 'card' && !LAHZA_ENABLED()) paymentMethod = 'cash';

    const { order, priced } = await S.withTransaction(async (client) => {
      const { rows: ur } = await client.query('SELECT id, wallet_balance, loyalty_points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
      const p = await S.priceOrder(client, req.user.id, body, { userRow: ur[0] || {} });
      const useCoupon = p.coupon && !p.coupon_error;
      const paymentStatus = p.total <= 0 ? 'paid' : 'pending';
      const commissionPct = p.restaurant.commission_rate !== null && p.restaurant.commission_rate !== undefined ? num(p.restaurant.commission_rate) : 15;
      const eta = new Date(Date.now() + (parseInt(p.restaurant.delivery_time_max) || 45) * 60 * 1000).toISOString();
      const orderType = body.order_type === 'pickup' ? 'pickup' : 'delivery';

      const { rows } = await client.query(
        `INSERT INTO orders (order_number, customer_id, restaurant_id, address_id, delivery_address, delivery_lat, delivery_lng,
           payment_method, payment_status, subtotal, delivery_fee, driver_fee, discount, coupon_discount, first_order_discount,
           points_value, free_delivery, tip, total, notes, coupon_code, estimated_delivery_time, loyalty_points_earned,
           order_type, status, wallet_used, points_redeemed, cashback_given, commission_pct, distance_km)
         VALUES ('', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'pending',$24,$25,0,$26,$27)
         RETURNING id`,
        [req.user.id, p.restaurant.id, orderType === 'delivery' && p.addressRow ? p.addressRow.id : null,
         orderType === 'delivery' ? (p.delivery_address || '') : null,
         p.delivery_lat, p.delivery_lng, paymentMethod, paymentStatus,
         p.subtotal, p.delivery_fee, p.driver_fee, p.discount, useCoupon ? p.coupon_discount : 0, p.first_order_discount,
         p.points_value, p.free_delivery, p.tip, p.total, String(body.notes || '').slice(0, 1000),
         useCoupon ? p.coupon.code : null, eta, p.points_earned, orderType,
         p.wallet_used, p.points_redeemed, commissionPct, p.distance_km]);
      const orderId = rows[0].id;
      const ord = await setOrderNumber(client, orderId);

      // أصناف الطلب (السعر = سعر الوحدة شامل الإضافات من قاعدة البيانات)
      for (const l of p.lines) {
        await client.query(
          `INSERT INTO order_items (order_id, item_id, menu_item_id, name_ar, name_en, price, quantity, subtotal, options, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [orderId, l.menu_item.id, l.menu_item.id, l.menu_item.name_ar, l.menu_item.name_en || null,
           l.unit_price, l.quantity, l.subtotal, JSON.stringify(l.options), l.notes]);
      }

      // 🏆 خصم النقاط ذرّياً
      if (p.points_redeemed > 0) {
        const { rows: pr } = await client.query(
          'UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id=$2 AND loyalty_points >= $1 RETURNING id', [p.points_redeemed, req.user.id]);
        if (!pr[0]) throw new HttpError(409, 'رصيد النقاط غير كافٍ');
        await S.optionalQuery(client, `INSERT INTO loyalty_transactions (user_id, points, type, description, order_id) VALUES ($1,$2,'redeemed',$3,$4)`,
          [req.user.id, p.points_redeemed, `استبدال نقاط طلب #${ord.order_number}`, orderId]);
      }
      // 💳 خصم المحفظة ذرّياً (لا يسمح بالسحب على المكشوف)
      if (p.wallet_used > 0) {
        const { rows: wr } = await client.query(
          `UPDATE users SET wallet_balance = ROUND((wallet_balance::numeric - $1::numeric), 2)
           WHERE id=$2 AND ROUND(COALESCE(wallet_balance,0)::numeric, 2) >= $1::numeric RETURNING id`, [p.wallet_used, req.user.id]);
        if (!wr[0]) throw new HttpError(409, 'رصيد المحفظة غير كافٍ');
        await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'debit',$2,$3)`,
          [req.user.id, p.wallet_used, `دفع طلب #${ord.order_number}`]);
      }
      // 🎟️ الكوبون: عدّاد عام ذرّي + سجل استخدام للمستخدم
      if (useCoupon) {
        const { rows: cr } = await client.query(
          `UPDATE coupons SET usage_count = COALESCE(usage_count,0) + 1
           WHERE id=$1 AND (usage_limit IS NULL OR COALESCE(usage_count,0) < usage_limit) RETURNING id`, [p.coupon.id]);
        if (!cr[0]) throw new HttpError(409, 'انتهى عدد استخدامات الكوبون');
        await client.query('INSERT INTO coupon_usage (coupon_id, user_id, order_id) VALUES ($1,$2,$3)', [p.coupon.id, req.user.id, orderId]);
      }
      return { order: ord, priced: p };
    });

    await cache.invalidateRestaurantOrders(order.restaurant_id);
    // 🔔 المطعم يُبلَّغ الآن — إلا طلبات البطاقة غير المدفوعة (تُطلق بعد التحقق من Lahza)
    if (!S.isAwaitingCardPayment(order)) S.notifyRestaurantNewOrder(req.io, order).catch(() => {});

    res.status(201).json({ success: true, data: { ...order, coupon_error: priced.coupon_error || undefined } });
  } catch (e) { sendError(res, e, 'POST /orders'); }
});

// Get user orders
router.get('/my', auth, async (req, res) => {
  try {
    const status = strParam(req.query.status);
    const safeLimit = clampInt(req.query.limit, 20, 1, 100);
    const safeOffset = clampInt(req.query.offset, 0, 0, 1000000);
    let q = `SELECT o.*, r.name_ar as restaurant_name, r.logo as restaurant_logo,
             (SELECT COUNT(*) FROM order_items WHERE order_id=o.id) as items_count
             FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
             WHERE o.customer_id=$1`;
    const params = [req.user.id];
    if (status === 'active') q += ` AND o.status NOT IN ('delivered','cancelled')`;
    else if (status === 'past') q += ` AND o.status IN ('delivered','cancelled')`;
    else if (status) { q += ` AND o.status=$2`; params.push(status); }
    q += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(safeLimit, safeOffset);
    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows.map(r => ({ ...r, status_label: S.STATUS_LABELS[r.status] || r.status })) });
  } catch (e) { sendError(res, e, 'GET /orders/my'); }
});

// Get order detail
router.get('/:id', auth, async (req, res) => {
  try {
    if (!S.isIntId(req.params.id)) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows: orders } = await pool.query(
      `SELECT o.*, r.name_ar as restaurant_name, r.logo, r.lat as restaurant_lat, r.lng as restaurant_lng,
              r.phone as restaurant_phone, r.owner_id as restaurant_owner_id, u.name as driver_name, u.phone as driver_phone,
              d.current_lat as driver_lat, d.current_lng as driver_lng, d.vehicle_type, d.vehicle_plate,
              cu.phone as customer_phone, cu.name as customer_name
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       LEFT JOIN users u ON o.driver_id=u.id LEFT JOIN drivers d ON d.user_id=o.driver_id
       LEFT JOIN users cu ON o.customer_id=cu.id
       WHERE o.id=$1`, [req.params.id]);
    const o = orders[0];
    if (!o) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const uid = String(req.user.id);
    const isDriver = o.driver_id && String(o.driver_id) === uid;
    const authorized = req.user.role === 'admin' || String(o.customer_id) === uid || isDriver
      || (o.restaurant_owner_id && String(o.restaurant_owner_id) === uid);
    if (!authorized) return res.status(403).json({ success: false, message: 'غير مصرح بعرض هذا الطلب' });
    const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id', [req.params.id]);
    // موقع السائق الأحدث (Redis) — القاعدة تُحدَّث كل 15 ثانية فقط
    if (o.driver_id && o.driver_assigned_at) {
      const f = await driverLoc.getLocation(o.driver_id);
      if (f) { o.driver_lat = f.lat; o.driver_lng = f.lng; }
    }

    const extra = {
      tip: round2(num(o.tip)),
      status_label: S.STATUS_LABELS[o.status] || o.status,
      cash_to_collect: (o.payment_method !== 'card' && o.payment_status !== 'paid') ? round2(num(o.total)) : 0,
    };
    if (isDriver && !o.driver_assigned_at && o.driver_offer_expires_at) {
      const exp = new Date(o.driver_offer_expires_at);
      extra.offer_seconds = Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000));
      extra.expires_at = exp.toISOString();
    }
    res.json({ success: true, data: { ...o, ...extra, items } });
  } catch (e) { sendError(res, e, 'GET /orders/:id'); }
});

// ═══════════════════════════════════════════════════════════════
//  حالة الطلب — آلة حالات بملكية وانتقالات صالحة فقط
// ═══════════════════════════════════════════════════════════════
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'],
  preparing: ['ready', 'on_the_way', 'delivered', 'cancelled'],
  ready: ['on_the_way', 'delivered', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
function transitionError(order, to) {
  const L = S.STATUS_LABELS;
  return new HttpError(400, `لا يمكن تغيير حالة الطلب من "${L[order.status] || order.status}" إلى "${L[to] || to}"`);
}
function validTransition(order, to) {
  if (!(TRANSITIONS[order.status] || []).includes(to)) return false;
  const pickup = order.order_type === 'pickup';
  if (to === 'on_the_way' && pickup) return false;
  if (to === 'delivered' && !pickup && order.status !== 'on_the_way') return false;
  return true;
}

async function loadOrderForUpdate(id) {
  if (!S.isIntId(id)) return null;
  const { rows } = await pool.query(
    `SELECT o.*, r.owner_id AS restaurant_owner_id FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id WHERE o.id=$1`, [id]);
  return rows[0] || null;
}
const isRestaurantRole = (role) => role === 'restaurant' || role === 'restaurant_owner';

async function confirmOrder(io, order) {
  if (S.isAwaitingCardPayment(order)) throw new HttpError(400, 'الطلب بانتظار تأكيد الدفع الإلكتروني');
  const { rows } = await pool.query(
    `UPDATE orders SET status='confirmed', restaurant_accepted_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING *`, [order.id]);
  const updated = rows[0];
  if (!updated) throw transitionError(order, 'confirmed');
  if (updated.order_type !== 'pickup') await S.dispatchOrder(io, updated.id);
  await S.emitOrderStatus(io, updated, 'confirmed');
  try { await Notify.orderConfirmed(io, updated.customer_id, updated.id); } catch (e) { console.error('notify confirm err:', e.message); }
  return updated;
}

// Restaurant confirms order → find driver
router.patch('/:id/confirm', auth, async (req, res) => {
  try {
    const order = await loadOrderForUpdate(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (req.user.role !== 'admin' && !(order.restaurant_owner_id && String(order.restaurant_owner_id) === String(req.user.id))) {
      return res.status(403).json({ success: false, message: 'غير مصرح' });
    }
    if (order.status !== 'pending') throw transitionError(order, 'confirmed');
    await confirmOrder(req.io, order);
    res.json({ success: true });
  } catch (e) { sendError(res, e, 'confirm'); }
});

router.patch('/:id/status', auth, async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, status) || status === 'pending') {
      return res.status(400).json({ success: false, message: 'حالة غير صحيحة' });
    }
    const order = await loadOrderForUpdate(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    const role = req.user.role;
    const uid = String(req.user.id);
    let by = 'admin';
    if (role === 'driver') {
      by = 'driver';
      if (!order.driver_id || String(order.driver_id) !== uid || !order.driver_assigned_at) {
        return res.status(403).json({ success: false, message: 'هذا الطلب ليس مسنداً إليك' });
      }
      if (!['on_the_way', 'delivered'].includes(status)) {
        return res.status(403).json({ success: false, message: 'غير مصرح لك بتغيير الحالة إلى هذه القيمة' });
      }
    } else if (isRestaurantRole(role)) {
      by = 'restaurant';
      if (!order.restaurant_owner_id || String(order.restaurant_owner_id) !== uid) {
        return res.status(403).json({ success: false, message: 'غير مصرح — هذا الطلب ليس لمطعمك' });
      }
      const allowed = ['confirmed', 'preparing', 'ready', 'cancelled'];
      if (order.order_type === 'pickup') allowed.push('delivered');
      if (!allowed.includes(status)) return res.status(403).json({ success: false, message: 'غير مصرح لك بتغيير الحالة إلى هذه القيمة' });
      if (status === 'cancelled' && order.status === 'on_the_way') throw transitionError(order, status);
    } else if (role !== 'admin') {
      return res.status(403).json({ success: false, message: 'غير مصرح' });
    }

    if (status === 'delivered' && order.status === 'delivered') return res.json({ success: true, already: true });
    if (!validTransition(order, status)) throw transitionError(order, status);

    if (status === 'confirmed') {
      await confirmOrder(req.io, order);
      return res.json({ success: true });
    }
    if (status === 'delivered') {
      const r = await S.markDelivered(req.io, order.id, [order.status]);
      if (!r.order) return res.status(409).json({ success: false, message: 'تغيّرت حالة الطلب، حدّث الصفحة' });
      return res.json({ success: true });
    }
    if (status === 'cancelled') {
      const c = await S.cancelOrder(req.io, order, by === 'restaurant' ? 'restaurant' : 'admin', req.body.reason, [order.status]);
      if (!c) return res.status(409).json({ success: false, message: 'تغيّرت حالة الطلب، حدّث الصفحة' });
      return res.json({ success: true });
    }

    const stamp = status === 'on_the_way' ? ', picked_up_at=NOW()' : '';
    const { rows } = await pool.query(
      `UPDATE orders SET status=$1, updated_at=NOW()${stamp} WHERE id=$2 AND status=$3 RETURNING *`, [status, order.id, order.status]);
    const updated = rows[0];
    if (!updated) return res.status(409).json({ success: false, message: 'تغيّرت حالة الطلب، حدّث الصفحة' });

    await S.emitOrderStatus(req.io, updated, status);
    const nctx = { personal: updated.order_type === 'personal', service: updated.service_type };
    try {
      if (status === 'on_the_way') await Notify.orderOnTheWay(req.io, updated.customer_id, updated.id, nctx);
      else if (status === 'preparing') saveNotification(updated.customer_id, 'جاري تحضير طلبك 🍳', 'order_status', { order_id: updated.id });
      else if (status === 'ready') {
        saveNotification(updated.customer_id, updated.order_type === 'pickup' ? 'طلبك جاهز للاستلام 🛍️' : 'طلبك جاهز وبانتظار السائق ✅', 'order_status', { order_id: updated.id });
        if (updated.driver_id && updated.driver_assigned_at) {
          S.pushTo(updated.driver_id, '✅ الطلب جاهز', `الطلب #${updated.order_number} جاهز للاستلام من المطعم`, { type: 'order_ready', order_id: String(updated.id) }, 'com.wasaly.driver');
        }
      }
    } catch (e) { console.error('notify status err:', e.message); }
    res.json({ success: true });
  } catch (e) { sendError(res, e, 'status'); }
});

// Driver accepts order
router.post('/:id/accept', auth, async (req, res) => {
  try {
    if (!S.isIntId(req.params.id)) return res.status(400).json({ success: false, message: 'الطلب غير متاح' });
    const { rows } = await pool.query(
      `UPDATE orders SET driver_assigned_at=NOW(), updated_at=NOW(), driver_offer_expires_at=NULL,
              status = CASE WHEN status='confirmed' THEN 'preparing' ELSE status END
       WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NULL AND status IN ('confirmed','preparing','ready')
       RETURNING *`, [req.params.id, req.user.id]);
    const order = rows[0];
    if (!order) {
      // إعادة محاولة من نفس السائق بعد قبول ناجح → نجاح (idempotent)
      const { rows: mine } = await pool.query(
        `SELECT id FROM orders WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NOT NULL AND status IN ('confirmed','preparing','ready','on_the_way')`,
        [req.params.id, req.user.id]);
      if (mine[0]) return res.json({ success: true, order_id: mine[0].id, already: true });
      return res.status(400).json({ success: false, message: 'الطلب غير متاح' });
    }
    S.stopDispatch(order.id);
    await pool.query('UPDATE drivers SET is_busy=true WHERE user_id=$1', [req.user.id]);

    try {
      notifyUser(req.io, order.customer_id, 'driver_assigned', { order_id: order.id, driver_id: req.user.id });
      await S.emitOrderStatus(req.io, order, order.status);
      const { rows: di } = await pool.query('SELECT u.name FROM users u WHERE u.id=$1', [req.user.id]);
      await Notify.driverAssigned(req.io, order.customer_id, di[0]?.name || 'السائق', order.id, { personal: order.order_type === 'personal', service: order.service_type });
    } catch (notifErr) { console.error('accept notification error (non-fatal):', notifErr.message); }

    res.json({ success: true, order_id: order.id });
  } catch (e) { sendError(res, e, 'accept'); }
});

// Driver rejects order — فقط أثناء العرض وقبل القبول
router.post('/:id/reject', auth, async (req, res) => {
  try {
    if (!S.isIntId(req.params.id)) return res.status(400).json({ success: false, message: 'الطلب غير موجود' });
    const { rows } = await pool.query(
      `UPDATE orders SET driver_id=NULL, driver_offer_expires_at=NULL
       WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NULL RETURNING id, restaurant_id`, [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(400).json({ success: false, message: 'لا يمكن رفض هذا الطلب' });
    await cache.invalidateRestaurantOrders(rows[0].restaurant_id);
    S.dispatchOrder(req.io, rows[0].id, req.user.id).catch(() => {});
    res.json({ success: true });
  } catch (e) { sendError(res, e, 'reject'); }
});

// Cancel order (customer)
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    if (!S.isIntId(req.params.id)) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [req.params.id, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب في هذه المرحلة' });
    }
    const c = await S.cancelOrder(req.io, order, 'customer', req.body.reason, ['pending', 'confirmed']);
    if (!c) return res.status(400).json({ success: false, message: 'لا يمكن إلغاء الطلب في هذه المرحلة' });
    res.json({ success: true });
  } catch (e) { sendError(res, e, 'cancel'); }
});

// Rate order
router.post('/:id/rate', auth, async (req, res) => {
  try {
    const { comment, images } = req.body;
    const clamp = (v) => { const n = parseInt(v); return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : null; };
    const restaurantRating = clamp(req.body.restaurant_rating);
    const driverRating = clamp(req.body.driver_rating);
    const safeComment = comment ? String(comment).slice(0, 1000) : null;
    if (!S.isIntId(req.params.id)) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows: orders } = await pool.query(
      "SELECT * FROM orders WHERE id=$1 AND customer_id=$2 AND status='delivered'", [req.params.id, req.user.id]);
    if (!orders[0]) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const order = orders[0];

    const { rows: ins } = await pool.query(
      `INSERT INTO reviews (order_id, customer_id, restaurant_id, driver_id, restaurant_rating, driver_rating, comment, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (order_id) DO NOTHING RETURNING id`,
      [order.id, req.user.id, order.restaurant_id, order.driver_id, order.restaurant_id ? restaurantRating : null,
       order.driver_id ? driverRating : null, safeComment, JSON.stringify(Array.isArray(images) ? images.slice(0, 5) : [])]);
    if (!ins[0]) return res.json({ success: true, already: true }); // تقييم واحد فقط — لا إشعارات مكرّرة

    await pool.query('UPDATE orders SET rating_restaurant=$1, rating_driver=$2, review_text=$3 WHERE id=$4',
      [restaurantRating, driverRating, safeComment, order.id]);
    cache.invalidateRestaurantOrders(order.restaurant_id);
    if (order.restaurant_id) {
      await pool.query(
        `UPDATE restaurants SET
          rating = COALESCE((SELECT ROUND(AVG(restaurant_rating)::numeric, 2) FROM reviews WHERE restaurant_id=$1 AND restaurant_rating BETWEEN 1 AND 5), 0),
          total_reviews = (SELECT COUNT(*) FROM reviews WHERE restaurant_id=$1 AND restaurant_rating IS NOT NULL) WHERE id=$1`,
        [order.restaurant_id]);
    }
    if (order.driver_id) {
      await pool.query(
        `UPDATE drivers SET rating = COALESCE((SELECT ROUND(AVG(driver_rating)::numeric, 2) FROM reviews WHERE driver_id=$1 AND driver_rating BETWEEN 1 AND 5), 0)
         WHERE user_id=$1`, [order.driver_id]);
    }

    const stars = (n) => '⭐'.repeat(Math.max(0, Math.min(5, parseInt(n) || 0)));
    try {
      const ownerId = await S.getOwnerId(order.restaurant_id);
      if (ownerId && restaurantRating) {
        const msg = `قيّمك زبون: ${stars(restaurantRating)} (${restaurantRating}/5)${safeComment ? ' — ' + safeComment : ''}`;
        saveNotification(ownerId, msg, 'review', { order_id: order.id, rating: restaurantRating });
        notifyUser(req.io, ownerId, 'new_review', { order_id: order.id, rating: restaurantRating, comment: safeComment });
        try { const t = await getUserTokens(ownerId); if (t.length) await sendFCM(t, '⭐ تقييم جديد', msg, { type: 'review' }, 'com.wasaly.restaurant'); } catch { /* ignore */ }
        sendWebPush(order.restaurant_id, '⭐ تقييم جديد', msg, { order_id: order.id }).catch(() => {});
      }
    } catch (e) { console.error('review notify (restaurant):', e.message); }
    try {
      if (order.driver_id && driverRating) {
        const msg = `قيّمك زبون: ${stars(driverRating)} (${driverRating}/5)${safeComment ? ' — ' + safeComment : ''}`;
        saveNotification(order.driver_id, msg, 'review', { order_id: order.id, rating: driverRating });
        notifyUser(req.io, order.driver_id, 'new_review', { order_id: order.id, rating: driverRating, comment: safeComment });
        try { const t = await getUserTokens(order.driver_id); if (t.length) await sendFCM(t, '⭐ تقييم جديد', msg, { type: 'review' }, 'com.wasaly.driver'); } catch { /* ignore */ }
      }
    } catch (e) { console.error('review notify (driver):', e.message); }

    res.json({ success: true });
  } catch (e) { sendError(res, e, 'rate'); }
});

module.exports = router;
