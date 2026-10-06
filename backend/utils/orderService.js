// ═══════════════════════════════════════════════════════════════
//  منطق الطلبات المشترك: التسعير (quote + create)، التوزيع على السائقين،
//  تسوية التسليم، الإلغاء والاسترجاع، وأحداث الوقت الحقيقي.
//  كل المبالغ تُقرّب لخانتين (round2) — الأعمدة القديمة REAL لم تُحوَّل لـ NUMERIC عمداً.
// ═══════════════════════════════════════════════════════════════
const pool = require('../config/database');
const { saveNotification, notifyUser, Notify, sendFCM, getUserTokens } = require('./notifications');
const { sendWebPush } = require('../routes/webpush');
const cache = require('./cache');
const driverLoc = require('./driverLocation');
const { FRESH_SQL } = require('./driverPresence');

// ─── أدوات عامة ─────────────────────────────────────────────────
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const truthy = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
const isIntId = (v) => v !== null && v !== undefined && /^\d{1,10}$/.test(String(v).trim());
const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const OFFER_SECONDS = 45;
const FREE_DELIVERY_THRESHOLD = Number(process.env.FREE_DELIVERY_THRESHOLD) || 50;
const POINT_VALUE = 0.05;           // 100 نقطة = 5₪
const CASHBACK_RATE = 0.02;         // 2% تُضاف للمحفظة عند التسليم
const REFERRAL_REWARD = 10;         // ₪ لكل طرف عند تسليم أول طلب للمدعو
const FIRST_ORDER_RATE = 0.15, FIRST_ORDER_MAX = 10;
const MAX_TIP = 200;
const DISPATCH_STATUSES = ['confirmed', 'preparing', 'ready'];
const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'];
const STATUS_LABELS = {
  pending: 'بانتظار المطعم', confirmed: 'مؤكد', preparing: 'قيد التحضير', ready: 'جاهز',
  on_the_way: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي',
};

/**
 * عنوان الحالة حسب نوع الطلب (نفس الحالة الخام `status` لا تتغيّر — للتوافق مع التطبيقات المنشورة):
 *  • C-02: بطاقة غير مدفوعة (مخفي عن المطعم) → "بانتظار إتمام الدفع" بدل "بانتظار المطعم"
 *  • C-05: توصيل شخصي بعد قبول السائق (preparing/ready) → "السائق بالطريق للاستلام"
 *  • X-10: استلام من المحل → "جاهز للاستلام" / "تم الاستلام"
 */
function statusLabel(o) {
  if (!o) return '';
  const st = o.status;
  if (st === 'pending' && isAwaitingCardPayment(o)) return 'بانتظار إتمام الدفع';
  if (o.order_type === 'personal') {
    if (['preparing', 'ready'].includes(st) || (st === 'confirmed' && o.driver_assigned_at)) return 'السائق بالطريق للاستلام';
    if (st === 'confirmed') return 'نبحث عن سائق';
  }
  if (o.order_type === 'pickup') {
    if (st === 'ready') return 'جاهز للاستلام';
    if (st === 'delivered') return 'تم الاستلام';
  }
  return STATUS_LABELS[st] || st;
}

// X-07: العدد مع المعدود بالعربي الصحيح — forms = [مفرد، مثنى، جمع (3-10)، تمييز (11+)]
function arCount(n, forms) {
  const k = Math.abs(parseInt(n) || 0);
  const [one, two, few, many] = forms;
  if (k === 1) return one;
  if (k === 2) return two;
  if (k >= 3 && k <= 10) return `${k} ${few}`;
  return `${k} ${many || few}`;
}
const AR = {
  restaurants: ['مطعم واحد', 'مطعمين', 'مطاعم', 'مطعماً'],
  stops: ['محطة واحدة', 'محطتين', 'محطات', 'محطة'],
};

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
const validCoord = (lat, lng) => {
  const a = parseFloat(lat), b = parseFloat(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
};

// رسوم المنطقة حسب المسافة: المنطقة المطابقة؛ إن لم تطابق → أغلى منطقة (لا 5 صامتة)؛ إن لا مناطق إطلاقاً → 5
async function getZoneFee(db, km) {
  const { rows } = await db.query('SELECT min_km, max_km, price FROM delivery_zones WHERE is_active=true ORDER BY min_km');
  if (!rows.length) return 5;
  if (km != null && Number.isFinite(km)) {
    const z = rows.find(r => num(r.min_km) <= km && km < num(r.max_km));
    if (z && z.price !== null && z.price !== undefined) return round2(num(z.price));
  }
  return round2(Math.max(...rows.map(r => num(r.price))));
}

function loyaltyTierFor(lifetimePoints) {
  if (lifetimePoints < 500) return 'bronze';
  if (lifetimePoints < 2000) return 'silver';
  if (lifetimePoints < 5000) return 'gold';
  return 'platinum';
}

// إدراج اختياري داخل معاملة — لا يُفشل المعاملة كلها لو جدول قديم بسكيمة مختلفة بالإنتاج
async function optionalQuery(client, sql, params) {
  try {
    await client.query('SAVEPOINT opt_q');
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT opt_q');
  } catch (e) {
    try { await client.query('ROLLBACK TO SAVEPOINT opt_q'); } catch { /* ignore */ }
    console.error('optional query failed (non-fatal):', e.message);
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
//  💰 التسعير — دالة واحدة يستخدمها /quote و POST /orders
// ═══════════════════════════════════════════════════════════════
const isMultiType = (t) => ['multiple', 'multi', 'checkbox'].includes(String(t || '').toLowerCase());
function effectiveMax(opt, valuesCount) {
  const m = parseInt(opt.max_selections) || 1;
  if (isMultiType(opt.type)) return m > 1 ? m : Math.max(1, valuesCount);
  return Math.max(1, m);
}

/**
 * @param db      pool أو client معاملة
 * @param userId  الزبون
 * @param body    نفس جسم POST /orders
 * @param opts    { quote: bool, userRow: {wallet_balance, loyalty_points} }
 */
async function priceOrder(db, userId, body, opts = {}) {
  const quote = !!opts.quote;
  const {
    restaurant_id, items, coupon_code,
    order_type = 'delivery', tip = 0, redeem_points = 0, use_wallet = false,
  } = body || {};

  if (!['delivery', 'pickup'].includes(order_type)) throw new HttpError(400, 'نوع الطلب غير صحيح');
  const { restaurant, lines, subtotal, minOrder, meetsMinOrder } = await priceItems(db, restaurant_id, items);
  if (!meetsMinOrder && !quote) throw new HttpError(400, `الحد الأدنى للطلب ${minOrder}₪`);

  // ── موقع التوصيل: من العنوان المحفوظ (يجب أن يخص المستخدم) وإلا من إحداثيات العميل ──
  let deliveryLat = null, deliveryLng = null, addressRow = null, distanceKm = null, zoneFee = 0;
  if (order_type === 'delivery') {
    ({ deliveryLat, deliveryLng, addressRow } = await resolveDeliveryPoint(db, userId, body));
    if (validCoord(restaurant.lat, restaurant.lng)) {
      distanceKm = round2(haversineKm(num(restaurant.lat), num(restaurant.lng), deliveryLat, deliveryLng));
    }
    zoneFee = await getZoneFee(db, distanceKm);
  }

  // ── الكوبون + خصم أول طلب ──
  const { coupon, couponDiscount, couponError, couponFreeDelivery } = await evaluateCoupon(db, userId, coupon_code, subtotal, order_type);
  const firstOrderDiscount = await firstOrderDiscountFor(db, userId, subtotal);
  const discount = round2(Math.min(subtotal, couponDiscount + firstOrderDiscount));

  // ── رسوم التوصيل: الزبون قد يحصل على توصيل مجاني (≥ الحد أو كوبون) لكن السائق يأخذ رسوم المنطقة دائماً ──
  const freeDelivery = order_type === 'delivery' && (subtotal >= FREE_DELIVERY_THRESHOLD || couponFreeDelivery);
  const deliveryFee = order_type === 'delivery' ? (freeDelivery ? 0 : zoneFee) : 0;
  const driverFee = order_type === 'delivery' ? zoneFee : 0;

  const pay = await applyPayments(db, userId, { subtotal, fees: deliveryFee, discount, tip, redeem_points, use_wallet, userRow: opts.userRow });

  return {
    restaurant, lines, coupon, addressRow,
    delivery_lat: deliveryLat, delivery_lng: deliveryLng,
    delivery_address: body.delivery_address || addressRow?.address || null,
    subtotal, delivery_fee: deliveryFee, driver_fee: driverFee, free_delivery: freeDelivery,
    discount, first_order_discount: firstOrderDiscount, coupon_discount: couponDiscount, coupon_error: couponError,
    points_value: pay.points_value, points_redeemed: pay.points_redeemed, tip: pay.tip, wallet_used: pay.wallet_used,
    total: pay.total, min_order: minOrder, meets_min_order: meetsMinOrder, distance_km: distanceKm,
    points_earned: pay.points_earned, cashback: pay.cashback,
  };
}

/**
 * تسعير أصناف مطعم واحد من قاعدة البيانات (أسعار الإضافات، المجموعات الإجبارية، التوفّر، الحد الأدنى).
 * يُستخدم للطلب العادي وللطلب المجمّع (لكل مطعم).
 */
async function priceItems(db, restaurant_id, items) {
  if (!isIntId(restaurant_id)) throw new HttpError(400, 'المطعم غير متاح');
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'السلة فارغة');
  if (items.length > 50) throw new HttpError(400, 'عدد الأصناف كبير جداً');

  const { rows: rr } = await db.query('SELECT * FROM restaurants WHERE id=$1 AND is_active=true', [restaurant_id]);
  const restaurant = rr[0];
  if (!restaurant) throw new HttpError(400, 'المطعم غير متاح');
  if (!truthy(restaurant.is_open)) throw new HttpError(400, 'المطعم مغلق حالياً، لا يمكن الطلب الآن');

  // ── الأصناف + الإضافات من قاعدة البيانات ──
  const ids = [];
  for (const it of items) {
    if (!it || !isIntId(it.id)) throw new HttpError(400, 'صنف غير صحيح');
    ids.push(parseInt(it.id));
  }
  const uniqIds = [...new Set(ids)];
  const { rows: menuRows } = await db.query('SELECT * FROM menu_items WHERE id = ANY($1::int[])', [uniqIds]);
  const { rows: optRows } = await db.query('SELECT * FROM item_options WHERE item_id = ANY($1::int[]) ORDER BY id', [uniqIds]);
  const optIds = optRows.map(o => o.id);
  const { rows: valRows } = optIds.length
    ? await db.query('SELECT * FROM item_option_values WHERE option_id = ANY($1::int[]) ORDER BY id', [optIds])
    : { rows: [] };
  const menuMap = new Map(menuRows.map(m => [String(m.id), m]));

  let subtotal = 0;
  const lines = [];
  for (const it of items) {
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new HttpError(400, 'الكمية يجب أن تكون عدداً صحيحاً بين 1 و 99');
    const mi = menuMap.get(String(parseInt(it.id)));
    if (!mi) throw new HttpError(400, `الصنف ${it.id} غير متاح`);
    if (String(mi.restaurant_id) !== String(restaurant.id)) throw new HttpError(400, `الصنف "${mi.name_ar || mi.id}" لا يتبع هذا المطعم`);
    if (!truthy(mi.is_available)) throw new HttpError(400, `الصنف "${mi.name_ar || mi.id}" غير متاح حالياً`);

    const itemOpts = optRows.filter(o => String(o.item_id) === String(mi.id));
    const optById = new Map(itemOpts.map(o => [String(o.id), o]));
    const itemVals = valRows.filter(v => optById.has(String(v.option_id)));

    const chosen = [];
    const chosenIds = new Set();
    const requested = Array.isArray(it.options) ? it.options.slice(0, 40) : [];
    for (const o of requested) {
      if (!o || typeof o !== 'object') continue;
      let v = null;
      const vid = o.id ?? o.value_id ?? o.option_value_id;
      if (isIntId(vid)) v = itemVals.find(x => String(x.id) === String(vid)) || null;
      if (!v) {
        const vName = normName(o.name ?? o.name_ar ?? o.value);
        const gName = normName(o.group ?? o.option_name ?? o.group_name);
        let cands = itemVals.filter(x => vName && (normName(x.name_ar) === vName || normName(x.name_en) === vName));
        if (isIntId(o.option_id)) cands = cands.filter(x => String(x.option_id) === String(o.option_id));
        // نفس اسم الخيار بأكثر من مجموعة → نحسم باسم المجموعة (شكل تطبيق v2.3.0: {group, name, price})
        if (gName && cands.length > 1) {
          const byGroup = cands.filter(x => { const g = optById.get(String(x.option_id)); return g && (normName(g.name_ar) === gName || normName(g.name_en) === gName); });
          if (byGroup.length) cands = byGroup;
        }
        v = cands[0] || null;
      }
      if (!v) throw new HttpError(400, `الإضافة "${o.name || o.name_ar || o.id || ''}" غير متاحة لهذا الصنف`);
      if (chosenIds.has(String(v.id))) continue;
      chosenIds.add(String(v.id));
      chosen.push(v);
    }
    for (const opt of itemOpts) {
      const vals = itemVals.filter(v => String(v.option_id) === String(opt.id));
      const cnt = chosen.filter(v => String(v.option_id) === String(opt.id)).length;
      if (truthy(opt.is_required) && vals.length > 0 && cnt === 0) {
        throw new HttpError(400, `الرجاء اختيار "${opt.name_ar || opt.name_en || 'الإضافة المطلوبة'}" للصنف "${mi.name_ar || ''}"`);
      }
      const max = effectiveMax(opt, vals.length);
      if (cnt > max) throw new HttpError(400, `يمكن اختيار ${max} كحد أقصى من "${opt.name_ar || ''}"`);
    }

    const base = num(mi.discount_price) > 0 ? num(mi.discount_price) : num(mi.price);
    const addons = chosen.reduce((s, v) => s + num(v.extra_price), 0);
    const unit = round2(base + addons);
    const lineTotal = round2(unit * qty);
    subtotal = round2(subtotal + lineTotal);
    lines.push({
      menu_item: mi, quantity: qty, unit_price: unit, subtotal: lineTotal,
      notes: String(it.notes || '').slice(0, 500),
      options: chosen.map(v => {
        const g = optById.get(String(v.option_id));
        return { id: v.id, option_id: v.option_id, group: g ? (g.name_ar || g.name_en || '') : '', name: v.name_ar || v.name_en || '', price: round2(num(v.extra_price)) };
      }),
    });
  }

  const minOrder = round2(num(restaurant.min_order));
  const meetsMinOrder = subtotal >= minOrder;
  return { restaurant, lines, subtotal, minOrder, meetsMinOrder };
}

// موقع التوصيل: من العنوان المحفوظ (يجب أن يخص المستخدم) وإلا من إحداثيات العميل — إلزامي للتوصيل
async function resolveDeliveryPoint(db, userId, body) {
  const { address_id } = body || {};
  let deliveryLat = null, deliveryLng = null, addressRow = null;
  if (address_id !== undefined && address_id !== null && address_id !== '') {
    if (!isIntId(address_id)) throw new HttpError(400, 'العنوان غير صحيح');
    const { rows: ar } = await db.query('SELECT * FROM addresses WHERE id=$1 AND user_id=$2', [address_id, userId]);
    if (!ar[0]) throw new HttpError(400, 'العنوان غير موجود');
    addressRow = ar[0];
    if (validCoord(addressRow.lat, addressRow.lng)) { deliveryLat = num(addressRow.lat); deliveryLng = num(addressRow.lng); }
  }
  if (deliveryLat === null && validCoord(body?.delivery_lat, body?.delivery_lng)) {
    deliveryLat = num(body.delivery_lat); deliveryLng = num(body.delivery_lng);
  }
  if (deliveryLat === null) throw new HttpError(400, 'حدّد موقع التوصيل على الخريطة (الإحداثيات مطلوبة)');
  return { deliveryLat, deliveryLng, addressRow };
}

// خصم أول طلب: فقط إن لم يكن له أي طلب غير ملغى
async function firstOrderDiscountFor(db, userId, subtotal) {
  const { rows: prev } = await db.query("SELECT COUNT(*)::int AS c FROM orders WHERE customer_id=$1 AND status <> 'cancelled'", [userId]);
  return (prev[0]?.c || 0) === 0 ? round2(Math.min(FIRST_ORDER_MAX, subtotal * FIRST_ORDER_RATE)) : 0;
}

// قيمة خصم كوبون صالح على مجموع معيّن (بدون فحص الصلاحية/الاستخدام)
function couponValueFor(c, subtotal) {
  const type = String(c.type || 'fixed').toLowerCase();
  const maxD = num(c.max_discount);
  if (type === 'percentage' || type === 'percent') {
    let d = subtotal * num(c.value) / 100;
    if (maxD > 0) d = Math.min(d, maxD);
    return { discount: round2(Math.min(d, subtotal)), freeDelivery: false };
  }
  if (type === 'free_delivery') return { discount: 0, freeDelivery: true };
  let d = num(c.value);
  if (maxD > 0) d = Math.min(d, maxD);
  return { discount: round2(Math.min(d, subtotal)), freeDelivery: false };
}

/**
 * نقاط الولاء + البقشيش + المحفظة → الإجمالي. fees = ما يدفعه الزبون من رسوم توصيل (بعد التوصيل المجاني).
 */
async function applyPayments(db, userId, { subtotal, fees, discount, tip, redeem_points, use_wallet, userRow }) {
  if (!userRow) {
    const { rows: ur } = await db.query('SELECT wallet_balance, loyalty_points FROM users WHERE id=$1', [userId]);
    userRow = ur[0] || {};
  }
  let pointsRedeemed = 0, pointsValue = 0;
  const wantRedeem = Math.max(0, parseInt(redeem_points) || 0);
  if (wantRedeem > 0) {
    const available = Math.max(0, parseInt(userRow.loyalty_points) || 0);
    const maxValue = Math.max(0, subtotal + fees - discount);
    pointsRedeemed = Math.min(wantRedeem, available, Math.floor(maxValue / POINT_VALUE + 1e-9));
    pointsValue = round2(pointsRedeemed * POINT_VALUE);
  }
  const tipAmount = round2(Math.min(MAX_TIP, Math.max(0, num(tip))));
  const due = round2(Math.max(0, subtotal + fees - discount - pointsValue) + tipAmount);
  let walletUsed = 0;
  if (truthy(use_wallet)) {
    const bal = Math.max(0, round2(num(userRow.wallet_balance)));
    walletUsed = round2(Math.min(bal, due));
  }
  const total = round2(Math.max(0, due - walletUsed));
  return {
    points_redeemed: pointsRedeemed, points_value: pointsValue, tip: tipAmount, due, wallet_used: walletUsed, total,
    points_earned: Math.max(0, Math.floor(subtotal - discount)), cashback: round2(subtotal * CASHBACK_RATE),
  };
}

// ── الكوبون (case-insensitive + حد الاستخدام العام + لكل مستخدم) ──
async function evaluateCoupon(db, userId, coupon_code, subtotal, order_type) {
  let coupon = null, couponDiscount = 0, couponError = null, couponFreeDelivery = false;
  const code = String(coupon_code || '').trim();
  if (code) {
    const { rows: cr } = await db.query(
      `SELECT *, (expires_at IS NOT NULL AND expires_at <= NOW()) AS is_expired FROM coupons WHERE LOWER(code)=LOWER($1) ORDER BY id DESC LIMIT 1`, [code]);
    const c = cr[0];
    if (!c || !truthy(c.is_active)) couponError = 'الكوبون غير صالح';
    else if (truthy(c.is_expired)) couponError = 'الكوبون منتهي الصلاحية';
    else if (c.usage_limit !== null && c.usage_limit !== undefined && (parseInt(c.usage_count) || 0) >= parseInt(c.usage_limit)) couponError = 'انتهى عدد استخدامات الكوبون';
    else if (subtotal < num(c.min_order)) couponError = `الحد الأدنى لاستخدام الكوبون ${round2(num(c.min_order))}₪`;
    else {
      const { rows: used } = await db.query('SELECT COUNT(*)::int AS c FROM coupon_usage WHERE coupon_id=$1 AND user_id=$2', [c.id, userId]);
      const perUser = parseInt(c.per_user_limit) || 1;
      if ((used[0]?.c || 0) >= perUser) couponError = 'استخدمت هذا الكوبون مسبقاً';
    }
    if (!couponError) {
      const v = couponValueFor(c, subtotal);
      if (v.freeDelivery) {
        if (order_type !== 'delivery') couponError = 'كوبون التوصيل المجاني للطلبات بالتوصيل فقط';
        else couponFreeDelivery = true;
      } else couponDiscount = v.discount;
      if (!couponError) coupon = c;
    }
  }
  return { coupon, couponDiscount, couponError, couponFreeDelivery };
}

function quoteView(p) {
  return {
    subtotal: p.subtotal, delivery_fee: p.delivery_fee, driver_fee: p.driver_fee, free_delivery: p.free_delivery,
    discount: p.discount, first_order_discount: p.first_order_discount, coupon_discount: p.coupon_discount,
    coupon_error: p.coupon_error, points_value: p.points_value, points_redeemed: p.points_redeemed,
    tip: p.tip, wallet_used: p.wallet_used, total: p.total, min_order: p.min_order,
    meets_min_order: p.meets_min_order, distance_km: p.distance_km,
  };
}

// ═══════════════════════════════════════════════════════════════
//  📡 الأحداث والإشعارات
// ═══════════════════════════════════════════════════════════════
async function getOwnerId(restaurantId) {
  if (!restaurantId) return null;
  try {
    const { rows } = await pool.query('SELECT owner_id FROM restaurants WHERE id=$1', [restaurantId]);
    return rows[0]?.owner_id || null;
  } catch { return null; }
}

// order_status → الزبون + صاحب المطعم + السائق المكلّف/المعروض عليه
// إبطال كل الكاش المرتبط بطلب تغيّر (لوحة المطعم + خريطة الطلب النشط للسائق)
function touchOrder(order) {
  if (!order) return;
  cache.invalidateRestaurantOrders(order.restaurant_id);
  if (order.driver_id) driverLoc.invalidateActiveRelay(order.driver_id);
}

async function emitOrderStatus(io, order, status) {
  touchOrder(order);
  if (!io || !order) return;
  const payload = { order_id: order.id, status, order_type: order.order_type || 'delivery' };
  const ownerId = await getOwnerId(order.restaurant_id);
  const targets = new Set([order.customer_id, ownerId, order.driver_id].filter(Boolean).map(String));
  for (const uid of targets) notifyUser(io, uid, 'order_status', payload);
}

async function pushTo(userId, title, body, data, bundle) {
  try {
    const t = await getUserTokens(userId);
    if (t.length) await sendFCM(t, title, body, data, bundle);
  } catch (e) { console.error('push error:', e.message); }
}

// إرسال الطلب الجديد للمطعم (بعد الإنشاء، أو بعد تأكيد الدفع بالبطاقة)
// group (اختياري) = { group_id, group_number, stops_count } لطلب مجمّع — يُضاف للحدث والإشعارات حتى تُميّزه بطاقة المطعم
async function notifyRestaurantNewOrder(io, order, group = null) {
  try {
    await cache.invalidateRestaurantOrders(order.restaurant_id);
    const { rows } = await pool.query('SELECT id, owner_id FROM restaurants WHERE id=$1', [order.restaurant_id]);
    const restaurant = rows[0];
    if (!restaurant || !restaurant.owner_id) return;
    const ownerId = restaurant.owner_id;
    const g = group ? { group_id: group.group_id, group_number: group.group_number, stops_count: group.stops_count, is_group: true } : {};
    const gPush = group ? { group_id: String(group.group_id), group_number: String(group.group_number), stops_count: String(group.stops_count), is_group: 'true' } : {};
    const title = group ? '🛎️ طلب مجمّع جديد!' : '🛎️ طلب جديد!';
    const body = group
      ? `طلب #${order.order_number} (ضمن طلب مجمّع من ${arCount(group.stops_count, AR.restaurants)} — سائق واحد) ينتظر موافقتك`
      : `طلب #${order.order_number} ينتظر موافقتك`;
    notifyUser(io, ownerId, 'new_order', { order_id: order.id, order_number: order.order_number, restaurant_id: restaurant.id, ...g });
    saveNotification(ownerId, group ? `طلب مجمّع جديد #${order.order_number}` : `طلب جديد #${order.order_number}`, 'new_order', { order_id: order.id, ...g });
    pushTo(ownerId, title, body, { type: 'new_order', order_id: String(order.id), ...gPush }, 'com.wasaly.restaurant');
    sendWebPush(restaurant.id, title, body, { order_id: order.id, ...g }).catch(() => {});

    const { rows: vip } = await pool.query('SELECT 1 FROM vip_customers WHERE restaurant_id=$1 AND customer_id=$2', [String(restaurant.id), String(order.customer_id)]);
    if (vip[0]) {
      const { rows: cu } = await pool.query('SELECT name FROM users WHERE id=$1', [order.customer_id]);
      const msg = `⭐ زبونك المميز ${cu[0]?.name || 'زبونك'} طلب! جهّزله طلب مميز 🎁`;
      saveNotification(ownerId, msg, 'vip_order', { order_id: order.id });
      notifyUser(io, ownerId, 'vip_order', { order_id: order.id });
      pushTo(ownerId, '⭐ زبون مميز طلب!', msg, { type: 'vip_order', order_id: String(order.id) }, 'com.wasaly.restaurant');
      sendWebPush(restaurant.id, '⭐ زبون مميز طلب!', msg, { order_id: order.id }).catch(() => {});
    }
  } catch (e) { console.error('notifyRestaurantNewOrder:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
//  🛵 التوزيع على السائقين
// ═══════════════════════════════════════════════════════════════
const triedDrivers = new Map();   // orderId → Set(driver user ids)
const offerTimers = new Map();    // orderId → timeout
const retryTimers = new Map();    // orderId → timeout

function clearTimer(map, key) { const t = map.get(key); if (t) { clearTimeout(t); map.delete(key); } }
function stopDispatch(orderId) {
  const key = String(orderId);
  triedDrivers.delete(key);
  clearTimer(offerTimers, key);
  clearTimer(retryTimers, key);
}

function scheduleRetry(io, orderId, ms) {
  const key = String(orderId);
  if (retryTimers.has(key)) return;
  const t = setTimeout(() => { retryTimers.delete(key); dispatchOrder(io, orderId).catch(() => {}); }, ms);
  if (t.unref) t.unref();
  retryTimers.set(key, t);
}

const isAwaitingCardPayment = (o) => o.payment_method === 'card' && o.payment_status !== 'paid' && num(o.total) > 0;

// ─── أقرب سائق متاح ───
// 1) استعلام واحد لمجموعة السائقين الذين لديهم عرض قائم (فهرس جزئي صغير idx_orders_open_offers) بدل NOT EXISTS لكل مرشّح
// 2) مرشّحون داخل مربّع حول نقطة الاستلام يتّسع تدريجياً (5 → 15 → 50 كم ثم الكل)، بإحداثيات القاعدة (+ هامش لتقادمها ≤15ث)
// 3) المسافة بالإحداثيات الأحدث (Redis أولاً) مع تصحيح cos(lat)، والفرز في JS. نقبل الأفضل فقط إن كان داخل نصف القطر
//    (الدائرة داخل المربّع) حتى تبقى النتيجة "الأقرب فعلاً" مثل الاستعلام القديم. بلا إحداثيات → آخر القائمة.
const DISPATCH_RADII_KM = [5, 15, 50];
const BBOX_MARGIN_KM = 1;
async function findNearestDriver(lat, lng, orderId, tried, groupId = null) {
  // السائقون الذين لديهم عرض قائم (طلب عادي أو طلب مجمّع) لا يُعرض عليهم عرض آخر
  const { rows: offered } = await pool.query(
    `SELECT driver_id FROM orders
     WHERE driver_assigned_at IS NULL AND driver_id IS NOT NULL
       AND status IN ('confirmed','preparing','ready') AND id <> $1
     UNION
     SELECT driver_id FROM order_groups
     WHERE driver_assigned_at IS NULL AND driver_id IS NOT NULL AND status = 'confirmed' AND id <> $2`,
    [orderId || 0, groupId || 0]);
  const exclude = new Set([...tried].map(String));
  for (const r of offered) exclude.add(String(r.driver_id));

  const cosLat = Math.cos(lat * Math.PI / 180) || 1e-6;
  // السائقون أولاً (جدول صغير) ثم تحقق المستخدم بمفتاحه الأساسي (LATERAL = بحث PK لكل سائق) — يمنع خطة Merge Join تمسح كل جدول users
  // 🧺 الطلب المجمّع: فقط السائقون بتطبيق يدعمه (supports_groups) — وإلا يبقى confirmed ويُعاد المحاولة
  const groupsOnly = groupId ? 'AND supports_groups = true' : '';
  // 🫀 D-07: السائق الخامل منذ ساعات طويلة (توكن منتهٍ/خروج إجباري) لا تُحجز عليه العروض
  const q = (where) => `WITH d AS MATERIALIZED (
      SELECT user_id, current_lat, current_lng FROM drivers
      WHERE is_online = true AND COALESCE(is_busy, false) = false AND ${FRESH_SQL} ${groupsOnly} ${where})
    SELECT d.user_id, d.current_lat, d.current_lng FROM d
    CROSS JOIN LATERAL (SELECT 1 FROM users u WHERE u.id = d.user_id AND u.is_active = true
      AND COALESCE(u.is_blocked, false) = false AND u.role = 'driver' LIMIT 1) ok`;
  const pick = async (rows, radiusKm) => {
    const cands = rows.filter(r => !exclude.has(String(r.user_id)));
    if (!cands.length) return null;
    const fresh = await driverLoc.getLocations(cands.map(r => r.user_id));
    let best = null, bestD = Infinity;
    for (const r of cands) {
      const f = fresh.get(String(r.user_id));
      const la = f ? f.lat : (r.current_lat === null ? null : Number(r.current_lat));
      const ln = f ? f.lng : (r.current_lng === null ? null : Number(r.current_lng));
      let d2 = Infinity; // بلا إحداثيات → الأخير
      if (la !== null && ln !== null && Number.isFinite(la) && Number.isFinite(ln)) {
        const dy = la - lat, dx = (ln - lng) * cosLat;
        d2 = dy * dy + dx * dx;
      }
      if (best === null || d2 < bestD) { best = r; bestD = d2; }
    }
    if (radiusKm !== null) {
      const km = Math.sqrt(bestD) * 111.32;
      if (!(km <= radiusKm)) return null; // قد يوجد أقرب خارج المربّع → نوسّع
    }
    return best;
  };
  for (const R of DISPATCH_RADII_KM) {
    const dLat = (R + BBOX_MARGIN_KM) / 111.32;
    const dLng = dLat / cosLat;
    const { rows } = await pool.query(
      q('AND current_lat BETWEEN $1 AND $2 AND current_lng BETWEEN $3 AND $4'),
      [lat - dLat, lat + dLat, lng - dLng, lng + dLng]);
    const b = await pick(rows, R);
    if (b) return b;
  }
  const { rows: all } = await pool.query(q(''));
  return pick(all, null);
}

async function dispatchOrder(io, orderId, excludeDriverId = null) {
  const key = String(orderId);
  try {
    if (!triedDrivers.has(key)) triedDrivers.set(key, new Set());
    const tried = triedDrivers.get(key);
    if (excludeDriverId != null) tried.add(String(excludeDriverId));

    const { rows } = await pool.query(
      `SELECT o.id, o.status, o.order_type, o.driver_id, o.driver_assigned_at, o.payment_method, o.payment_status, o.total,
              o.pickup_lat, o.pickup_lng, o.group_id, r.lat AS r_lat, r.lng AS r_lng
       FROM orders o LEFT JOIN restaurants r ON r.id = o.restaurant_id WHERE o.id=$1`, [orderId]);
    const o = rows[0];
    // أبناء الطلب المجمّع يوزَّعون كمجموعة واحدة (groupService.dispatchGroup) — لا عرض فردي
    if (!o || o.group_id || !DISPATCH_STATUSES.includes(o.status) || o.order_type === 'pickup' || o.driver_assigned_at || isAwaitingCardPayment(o)) {
      stopDispatch(orderId); return null;
    }
    if (o.driver_id) return null; // عرض قائم بالفعل لسائق

    const personal = o.order_type === 'personal';
    let lat = parseFloat(personal ? o.pickup_lat : o.r_lat);
    let lng = parseFloat(personal ? o.pickup_lng : o.r_lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { lat = 31.9; lng = 35.2; }

    const best = await findNearestDriver(lat, lng, o.id, tried);
    if (!best) {
      if (tried.size) { tried.clear(); scheduleRetry(io, orderId, 12000); }
      else scheduleRetry(io, orderId, 20000);
      return null;
    }
    const driverId = best.user_id;

    const { rows: off } = await pool.query(
      `UPDATE orders SET driver_id=$1, driver_offer_expires_at = NOW() + INTERVAL '${OFFER_SECONDS} seconds'
       WHERE id=$2 AND driver_id IS NULL AND driver_assigned_at IS NULL AND status IN ('confirmed','preparing','ready')
       RETURNING id, restaurant_id, driver_offer_expires_at`, [driverId, orderId]);
    if (!off[0]) return null;
    cache.invalidateRestaurantOrders(off[0].restaurant_id);

    // نفس قيمة القاعدة بالضبط (GET /orders/:id و /drivers/me يرجعانها) → offer_id متطابق في كل القنوات
    const expiresAt = new Date(off[0].driver_offer_expires_at || Date.now() + OFFER_SECONDS * 1000).toISOString();
    // D-01/D-02: offer_id يميّز كل عرض (نفس الطلب قد يُعرض مجدداً بعد رفض/انتهاء) + server_now لتصحيح انحراف ساعة الجهاز
    const offerId = `${o.id}|${expiresAt}`;
    notifyUser(io, driverId, 'new_order_request', {
      order_id: o.id, restaurant_lat: lat, restaurant_lng: lng, offer_seconds: OFFER_SECONDS, expires_at: expiresAt,
      offer_id: offerId, server_now: new Date().toISOString(),
    });
    pushTo(driverId, '🛵 طلب توصيل جديد!', 'يوجد طلب جديد بانتظارك، اقبل الآن!',
      { type: 'new_order_request', order_id: String(o.id), offer_seconds: String(OFFER_SECONDS), expires_at: expiresAt, offer_id: offerId }, 'com.wasaly.driver');

    clearTimer(offerTimers, key);
    const t = setTimeout(async () => {
      offerTimers.delete(key);
      try {
        const { rows: exp } = await pool.query(
          `UPDATE orders SET driver_id=NULL, driver_offer_expires_at=NULL
           WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NULL RETURNING id, restaurant_id`, [orderId, driverId]);
        if (exp[0]) { cache.invalidateRestaurantOrders(exp[0].restaurant_id); dispatchOrder(io, orderId, driverId).catch(() => {}); }
      } catch (e) { console.error('dispatch timeout error:', e.message); }
    }, OFFER_SECONDS * 1000);
    if (t.unref) t.unref();
    offerTimers.set(key, t);
    return { user_id: driverId };
  } catch (e) { console.error('dispatchOrder error:', e.message); return null; }
}

// عند الإقلاع: نستعيد التوزيع لكل الطلبات المؤهلة (التوقيتات بالذاكرة ضاعت مع إعادة التشغيل)
async function recoverDispatch(io) {
  try {
    await pool.query(
      `UPDATE drivers d SET is_busy=false WHERE COALESCE(d.is_busy,false)=true AND NOT EXISTS (
         SELECT 1 FROM orders o WHERE o.driver_id=d.user_id AND o.driver_assigned_at IS NOT NULL
         AND o.status IN ('confirmed','preparing','ready','on_the_way'))`);
    await pool.query(
      `UPDATE orders SET driver_id=NULL, driver_offer_expires_at=NULL
       WHERE driver_assigned_at IS NULL AND driver_id IS NOT NULL AND status IN ('confirmed','preparing','ready')`);
    const { rows } = await pool.query(
      `SELECT id FROM orders
       WHERE status IN ('confirmed','preparing','ready') AND driver_assigned_at IS NULL
         AND COALESCE(order_type,'delivery') <> 'pickup' AND group_id IS NULL
         AND NOT (payment_method='card' AND COALESCE(payment_status,'pending') <> 'paid' AND COALESCE(total,0) > 0)
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at`);
    rows.forEach((r, i) => { const t = setTimeout(() => dispatchOrder(io, r.id).catch(() => {}), 500 + i * 300); if (t.unref) t.unref(); });
    console.log(`🛵 Dispatch recovery: ${rows.length} order(s) re-queued`);
  } catch (e) { console.error('recoverDispatch error:', e.message); }
  // 🧺 الطلبات المجمّعة: نفس الاستعادة (عروض معلّقة تُمسح ويُعاد التوزيع)
  try { await require('./groupService').recoverGroupDispatch(io); }
  catch (e) { console.error('recoverGroupDispatch error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
//  ✅ التسليم — ذرّي ومرة واحدة فقط (سائق: رسوم المنطقة + البقشيش؛ زبون: كاش باك + نقاط + الدعوة)
// ═══════════════════════════════════════════════════════════════
/**
 * تسوية مالية مشتركة للتسليم (داخل معاملة) — تُستدعى مرة واحدة لكل طلب عادي أو لكل طلب مجمّع (وليس لأبنائه):
 *  سائق: محفظة += driverEarning، is_busy=false، total_deliveries+1
 *  زبون: كاش باك 2% من cashbackBase، نقاط الولاء (إن لم تُضف سابقاً) + المستوى، مكافأة الدعوة لأول تسليم
 * @returns { cashback, pointsCredited, referral }
 */
async function settleDelivery(client, { driverId, driverEarning, customerId, cashbackBase, label, points, pointsAlreadyCredited, loyaltyOrderId }) {
  if (driverId) {
    await client.query(
      `UPDATE drivers SET wallet_balance = ROUND((COALESCE(wallet_balance,0)::numeric + $1::numeric), 2),
              is_busy=false, total_deliveries = COALESCE(total_deliveries,0) + 1
       WHERE user_id=$2`, [round2(driverEarning), driverId]);
  }

  // 💰 كاش باك عند التسليم (وليس عند الإنشاء)
  const cashback = round2(num(cashbackBase) * CASHBACK_RATE);
  if (cashback > 0) {
    await client.query('UPDATE users SET wallet_balance = ROUND((COALESCE(wallet_balance,0)::numeric + $1::numeric), 2) WHERE id=$2', [cashback, customerId]);
    await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'credit',$2,$3)`,
      [customerId, cashback, `كاش باك ${label}`]);
  }

  // 🏆 نقاط الولاء + تحديث المستوى (حسب مجموع النقاط المكتسبة مدى الحياة)
  const pts = parseInt(points) || 0;
  let pointsCredited = false;
  if (pts > 0 && !pointsAlreadyCredited) {
    await client.query('UPDATE users SET loyalty_points = COALESCE(loyalty_points,0) + $1 WHERE id=$2', [pts, customerId]);
    pointsCredited = true;
    await optionalQuery(client, `INSERT INTO loyalty_transactions (user_id, points, type, description, order_id) VALUES ($1,$2,'earned',$3,$4)`,
      [customerId, pts, `نقاط ${label}`, loyaltyOrderId || null]);
    const { rows: life } = await client.query(
      `SELECT COALESCE(SUM(loyalty_points_earned),0)::int AS p FROM orders WHERE customer_id=$1 AND status='delivered'`, [customerId]);
    await client.query('UPDATE users SET loyalty_tier=$1 WHERE id=$2', [loyaltyTierFor(life[0]?.p || 0), customerId]);
  }

  // 🎁 مكافأة الدعوة: عند تسليم أول طلب للمدعو فقط (مرة واحدة)
  let referral = false;
  const { rows: ref } = await client.query(
    `UPDATE users SET referral_rewarded=true WHERE id=$1 AND referred_by IS NOT NULL AND COALESCE(referral_rewarded,false)=false
     RETURNING referred_by`, [customerId]);
  if (ref[0] && ref[0].referred_by && String(ref[0].referred_by) !== String(customerId)) {
    for (const [uid, desc] of [[ref[0].referred_by, 'مكافأة دعوة صديق'], [customerId, 'مكافأة التسجيل بكود دعوة']]) {
      await client.query('UPDATE users SET wallet_balance = ROUND((COALESCE(wallet_balance,0)::numeric + $1::numeric), 2) WHERE id=$2', [REFERRAL_REWARD, uid]);
      await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'credit',$2,$3)`, [uid, REFERRAL_REWARD, desc]);
    }
    referral = true;
  }
  return { cashback, pointsCredited, referral };
}

async function markDelivered(io, orderId, fromStatuses) {
  const result = await withTransaction(async (client) => {
    const params = [orderId];
    let cond = `status NOT IN ('delivered','cancelled')`;
    if (fromStatuses && fromStatuses.length) { params.push(fromStatuses); cond = `status = ANY($2::text[])`; }
    // أبناء الطلب المجمّع لا يُسوَّون فردياً أبداً (التسوية مرة واحدة على مستوى المجموعة)
    const { rows } = await client.query(
      `UPDATE orders SET status='delivered', delivered_at=NOW(), actual_delivery_time=NOW(), updated_at=NOW(),
              payment_status = CASE WHEN payment_method='card' THEN payment_status ELSE 'paid' END
       WHERE id=$1 AND group_id IS NULL AND ${cond} RETURNING *`, params);
    const order = rows[0];
    if (!order) return { order: null };

    let driverEarning = 0;
    if (order.driver_id) {
      const fee = order.driver_fee !== null && order.driver_fee !== undefined ? num(order.driver_fee) : num(order.delivery_fee);
      driverEarning = round2(fee + num(order.tip));
    }
    const s = await settleDelivery(client, {
      driverId: order.driver_id, driverEarning, customerId: order.customer_id,
      cashbackBase: order.restaurant_id ? num(order.subtotal) : 0, label: `طلب #${order.order_number}`,
      points: order.loyalty_points_earned, pointsAlreadyCredited: truthy(order.points_credited), loyaltyOrderId: order.id,
    });
    if (s.cashback > 0) await client.query('UPDATE orders SET cashback_given=$1 WHERE id=$2', [s.cashback, order.id]);
    if (s.pointsCredited) await client.query('UPDATE orders SET points_credited=true WHERE id=$1', [order.id]);
    if (s.referral) await client.query('UPDATE orders SET referral_processed=true WHERE id=$1', [order.id]);
    return { order, driverEarning };
  });

  if (result.order) {
    stopDispatch(orderId);
    const o = result.order;
    emitOrderStatus(io, o, 'delivered');
    try { await Notify.orderDelivered(io, o.customer_id, o.id, { personal: o.order_type === 'personal', service: o.service_type }); }
    catch (e) { console.error('notify delivered err:', e.message); }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
//  ❌ الإلغاء + الاسترجاع الذرّي
// ═══════════════════════════════════════════════════════════════
async function refundOrderBenefits(orderId) {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        'UPDATE orders SET benefits_refunded=true WHERE id=$1 AND COALESCE(benefits_refunded,false)=false RETURNING *', [orderId]);
      const order = rows[0];
      if (!order) return false;
      const walletUsed = round2(num(order.wallet_used));
      const pointsRedeemed = parseInt(order.points_redeemed) || 0;
      const cashback = round2(num(order.cashback_given));
      if (walletUsed > 0) {
        await client.query('UPDATE users SET wallet_balance = ROUND((COALESCE(wallet_balance,0)::numeric + $1::numeric), 2) WHERE id=$2', [walletUsed, order.customer_id]);
        await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'credit',$2,$3)`,
          [order.customer_id, walletUsed, `استرجاع إلغاء طلب #${order.order_number}`]);
      }
      if (pointsRedeemed > 0) {
        await client.query('UPDATE users SET loyalty_points = COALESCE(loyalty_points,0) + $1 WHERE id=$2', [pointsRedeemed, order.customer_id]);
        await optionalQuery(client, `INSERT INTO loyalty_transactions (user_id, points, type, description, order_id) VALUES ($1,$2,'bonus',$3,$4)`,
          [order.customer_id, pointsRedeemed, `استرجاع نقاط طلب #${order.order_number}`, order.id]);
      }
      if (cashback > 0) {
        await client.query('UPDATE users SET wallet_balance = GREATEST(0, ROUND((COALESCE(wallet_balance,0)::numeric - $1::numeric), 2)) WHERE id=$2', [cashback, order.customer_id]);
      }
      if (order.coupon_code) {
        // بمعرّف الكوبون (لا بالنص: كود محذوف قد يُعاد استخدامه لكوبون جديد — A-20)
        const { rows: cu } = await client.query('DELETE FROM coupon_usage WHERE order_id=$1 RETURNING coupon_id', [order.id]);
        for (const u of cu) {
          await client.query('UPDATE coupons SET usage_count = GREATEST(0, COALESCE(usage_count,0) - 1) WHERE id=$1', [u.coupon_id]);
        }
      }
      if (order.payment_method === 'card' && order.payment_status === 'paid' && num(order.total) > 0) {
        // لا يوجد استرجاع آلي للبطاقة — ننبّه الإدارة لاسترجاع يدوي عبر Lahza
        const { rows: admins } = await client.query("SELECT id FROM users WHERE role='admin' AND is_active=true");
        for (const a of admins) saveNotification(a.id, `💳 طلب مدفوع بالبطاقة أُلغي #${order.order_number} — يلزم استرجاع ${round2(num(order.total))}₪ يدوياً`, 'refund_needed', { order_id: order.id });
      }
      return true;
    });
  } catch (e) { console.error('refundOrderBenefits error:', e.message); return false; }
}

/**
 * إلغاء موحّد (زبون / مطعم / إدارة). يرجّع الطلب المُلغى أو null لو تغيّرت الحالة.
 * @param by 'customer'|'restaurant'|'admin'
 */
async function cancelOrder(io, order, by, reason, allowedFrom) {
  // ابن طلب مجمّع: لا يُلغى بعد استلامه من المطعم (picked_up_at) — المال على مستوى المجموعة
  const { rows } = await pool.query(
    `UPDATE orders SET status='cancelled', cancel_reason=COALESCE(NULLIF($2,''), cancel_reason), cancelled_at=NOW(), updated_at=NOW(),
            driver_offer_expires_at=NULL
     WHERE id=$1 AND status = ANY($3::text[]) AND NOT (group_id IS NOT NULL AND picked_up_at IS NOT NULL) RETURNING *`,
    [order.id, String(reason || '').slice(0, 500), allowedFrom]);
  const cancelled = rows[0];
  if (!cancelled) return null;
  const grouped = !!cancelled.group_id;
  stopDispatch(order.id);
  if (cancelled.driver_id && !grouped) {
    await pool.query('UPDATE drivers SET is_busy=false WHERE user_id=$1', [cancelled.driver_id]).catch(() => {});
  }
  await refundOrderBenefits(order.id);

  // 📡 أحداث: order_status للجميع + order_cancelled للسائق وصاحب المطعم
  await emitOrderStatus(io, cancelled, 'cancelled');
  const ownerId = await getOwnerId(cancelled.restaurant_id);
  const gx = grouped ? { group_id: cancelled.group_id } : {};
  for (const uid of [cancelled.driver_id, ownerId].filter(Boolean)) {
    // R-12: رقم الطلب المعروف (#WSL…) + السبب في الحدث
    notifyUser(io, uid, 'order_cancelled', { order_id: cancelled.id, order_number: cancelled.order_number, by, reason: cancelled.cancel_reason || null, ...gx });
  }
  // 🧺 ابن طلب مجمّع → إعادة حساب المجموعة واسترجاع الفرق + إشعار الزبون (بدل "تم إلغاء طلبك")
  if (grouped) {
    try { await require('./groupService').onChildCancelled(io, cancelled, by); }
    catch (e) { console.error('group child cancel hook:', e.message); }
  }
  const nctx = { personal: cancelled.order_type === 'personal', service: cancelled.service_type };
  try {
    if (by !== 'customer' && !grouped) await Notify.orderCancelled(io, cancelled.customer_id, cancelled.id, nctx);
    if (ownerId && by !== 'restaurant') {
      const msg = `❌ الطلب #${cancelled.order_number} أُلغي${by === 'customer' ? ' من الزبون' : ' من الإدارة'}`;
      saveNotification(ownerId, msg, 'order_cancelled', { order_id: cancelled.id });
      pushTo(ownerId, '❌ تم إلغاء طلب', msg, { type: 'order_cancelled', order_id: String(cancelled.id) }, 'com.wasaly.restaurant');
    }
    if (cancelled.driver_id && !grouped) {
      const msg = `❌ الطلب #${cancelled.order_number} أُلغي`;
      saveNotification(cancelled.driver_id, msg, 'order_cancelled', { order_id: cancelled.id });
      pushTo(cancelled.driver_id, '❌ تم إلغاء الطلب', msg, { type: 'order_cancelled', order_id: String(cancelled.id) }, 'com.wasaly.driver');
    }
  } catch (e) { console.error('cancel notify err:', e.message); }
  return cancelled;
}

// ═══════════════════════════════════════════════════════════════
//  💳 الدفع بالبطاقة: إطلاق الطلب للمطعم بعد التحقق (أو تحويله لنقدي كما يعِد التطبيق)
// ═══════════════════════════════════════════════════════════════
async function alertAdmins(message, type, data = {}) {
  try {
    const { rows: admins } = await pool.query("SELECT id FROM users WHERE role='admin' AND is_active=true");
    for (const a of admins) saveNotification(a.id, message, type, data);
  } catch (e) { console.error('alertAdmins:', e.message); }
}

/**
 * C-03: دفعة بطاقة ناجحة تُسجَّل دائماً — حتى لو كان الطلب قد حُوّل لنقدي سابقاً (فشل التهيئة/المهلة/الزبون اختار كاش):
 *   payment_status='paid' + payment_method='card' → cash_to_collect=0 فلا يحصّل السائق كاشاً (لا دفع مرتين)،
 *   مع تنبيه الإدارة (وإشعار السائق المُسند) إن حدث ذلك بعد إطلاق الطلب نقداً، أو استرجاع يدوي إن كان ملغى.
 * الفرع غير المدفوع كما هو: بطاقة معلّقة → نقدي ويُرسل للمطعم.
 */
async function releaseCardOrder(io, orderId, { paid, reference } = {}) {
  if (paid) {
    const { rows } = await pool.query(
      `UPDATE orders o SET payment_status='paid', payment_method='card',
              payment_reference=COALESCE($2, o.payment_reference), updated_at=NOW()
       FROM orders old
       WHERE o.id=$1 AND old.id=o.id AND COALESCE(o.payment_status,'pending') <> 'paid'
       RETURNING o.*, old.payment_method AS prev_payment_method`, [orderId, reference || null]);
    const order = rows[0];
    if (!order) {
      // مدفوع مسبقاً بمرجع مختلف → دفعة مكرّرة محتملة (تنبيه للإدارة لاسترجاع يدوي)
      try {
        const { rows: cur } = await pool.query('SELECT id, order_number, payment_reference, total FROM orders WHERE id=$1', [orderId]);
        const c = cur[0];
        if (c && reference && c.payment_reference && String(c.payment_reference) !== String(reference)) {
          await alertAdmins(`💳 دفعة بطاقة مكرّرة محتملة للطلب #${c.order_number} (مرجع ${reference}) — تحقّق واسترجع يدوياً`, 'refund_needed', { order_id: c.id, reference });
        }
      } catch (e) { console.error('duplicate payment check:', e.message); }
      return null;
    }
    const prevMethod = order.prev_payment_method;
    delete order.prev_payment_method;
    touchOrder(order);
    if (prevMethod === 'card' && order.status === 'pending') {
      await notifyRestaurantNewOrder(io, order); // كان مخفياً بانتظار الدفع → يصل المطعم الآن
    } else {
      // الطلب أُطلق نقداً سابقاً (أو ملغى) ثم ثبت الدفع بالبطاقة
      await emitOrderStatus(io, order, order.status);
      if (order.status === 'cancelled') {
        await alertAdmins(`💳 دفعة بطاقة وصلت لطلب ملغى #${order.order_number} — يلزم استرجاع ${round2(num(order.total))}₪ يدوياً`, 'refund_needed', { order_id: order.id });
      } else {
        await alertAdmins(`💳 الطلب #${order.order_number} دُفع بالبطاقة بعد تحويله لنقدي — تأكّد أن السائق لا يحصّل كاشاً`, 'payment_after_cash', { order_id: order.id });
        if (order.driver_id && order.driver_assigned_at) {
          pushTo(order.driver_id, '💳 الطلب مدفوع بالبطاقة', `الطلب #${order.order_number} مدفوع إلكترونياً — لا تحصّل أي مبلغ من الزبون`,
            { type: 'order_paid', order_id: String(order.id) }, 'com.wasaly.driver');
        }
      }
    }
    return order;
  }
  // التطبيق يقول للزبون "طلبك محفوظ ويمكنك الدفع عند الاستلام" → نحوّله لنقدي ونطلقه
  const { rows } = await pool.query(
    `UPDATE orders SET payment_method='cash', updated_at=NOW()
     WHERE id=$1 AND payment_method='card' AND COALESCE(payment_status,'pending') <> 'paid' AND status='pending' RETURNING *`, [orderId]);
  const order = rows[0];
  if (order) {
    touchOrder(order);
    await emitOrderStatus(io, order, order.status); // الزبون: من "بانتظار إتمام الدفع" إلى "بانتظار المطعم"
    await notifyRestaurantNewOrder(io, order);
  }
  return order || null;
}

// C-04: كل مراجع الدفع للطلب (الحالي + السابقة) — الأحدث أولاً، بلا تكرار
function paymentRefs(order) {
  const out = [];
  const add = (r) => { const s = String(r || '').trim(); if (s && !out.includes(s)) out.push(s); };
  add(order && order.payment_reference);
  String((order && order.payment_ref_history) || '').split(',').reverse().forEach(add);
  return out;
}

// C-06: مفتاح منع التكرار (Idempotency-Key أو client_ref) — نص قصير آمن وإلا null
function clientRefFrom(req) {
  const raw = (req.headers && (req.headers['idempotency-key'] || req.headers['x-idempotency-key'])) || (req.body && req.body.client_ref);
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return /^[A-Za-z0-9._:-]{8,100}$/.test(s) ? s : null;
}

// 💵 مصدر "الإيراد" (ما دفعه الزبون لكل عملية دفع) — الطلبات العادية + الطلبات المجمّعة مرة واحدة
// (أبناء المجموعة مستثنَون؛ إجمالي المجموعة يشمل رسوم التوصيل + المحطات الإضافية − الخصومات/النقاط/المحفظة + البقشيش، تماماً كـ orders.total)
// الاستخدام: FROM ${REVENUE_SOURCE} x WHERE x.status='delivered' ...  (الأعمدة: created_at, total, status)
const REVENUE_SOURCE = `(SELECT created_at, total, status FROM orders WHERE group_id IS NULL
  UNION ALL SELECT created_at, total, status FROM order_groups)`;

module.exports = {
  round2, num, truthy, isIntId, HttpError, haversineKm, validCoord, getZoneFee, loyaltyTierFor,
  OFFER_SECONDS, DISPATCH_STATUSES, ACTIVE_STATUSES, STATUS_LABELS, FREE_DELIVERY_THRESHOLD,
  POINT_VALUE, CASHBACK_RATE, FIRST_ORDER_RATE, FIRST_ORDER_MAX, MAX_TIP,
  priceOrder, priceItems, resolveDeliveryPoint, evaluateCoupon, couponValueFor, firstOrderDiscountFor, applyPayments,
  quoteView, withTransaction, optionalQuery,
  emitOrderStatus, touchOrder, notifyRestaurantNewOrder, findNearestDriver, getOwnerId, pushTo,
  dispatchOrder, stopDispatch, recoverDispatch, isAwaitingCardPayment,
  settleDelivery, markDelivered, refundOrderBenefits, cancelOrder, releaseCardOrder,
  REVENUE_SOURCE, statusLabel, arCount, AR, alertAdmins, paymentRefs, clientRefFrom,
  // للتوزيع المجمّع (نفس خرائط المؤقتات بمفاتيح 'g<id>')
  _dispatchState: { triedDrivers, offerTimers, retryTimers, clearTimer },
};
