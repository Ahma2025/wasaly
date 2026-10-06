// ═══════════════════════════════════════════════════════════════
//  🧺 الطلب المجمّع (طلب من عدة مطاعم — دفعة واحدة — سائق واحد)
//  • order_groups يحمل مال الزبون/السائق (رسوم، خصومات، نقاط، محفظة، بقشيش، الإجمالي)
//  • لكل مطعم طلب ابن عادي في orders (group_id) — لوحات المطاعم والمحاسبة تبقى كما هي
//  • "الابن الحامل" (أصغر id غير ملغى) يحمل driver_fee + tip + loyalty_points_earned للمجموعة
//    حتى تبقى استعلامات أرباح السائق/المحاسبة/مستوى الولاء صحيحة بلا تعديل (الباقي = 0)
//  • التسعير يعيد استخدام دوال orderService (priceItems / evaluateCoupon / applyPayments …) — لا قواعد مكرّرة
// ═══════════════════════════════════════════════════════════════
const pool = require('../config/database');
const { saveNotification, notifyUser, notify, Notify } = require('./notifications');
const cache = require('./cache');
const driverLoc = require('./driverLocation');
const S = require('./orderService');
const { round2, num, truthy, isIntId, HttpError } = S;

const DEFAULT_CFG = { enabled: true, max_restaurants: 3, max_distance_km: 3, extra_stop_fee: 3 };
const MAX_CARTS = 10;
const GROUP_STATUS_LABELS = {
  pending: 'بانتظار المطاعم', confirmed: 'نبحث عن سائق', picking_up: 'السائق يجمع الطلبات',
  on_the_way: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي',
};
const ACTIVE_GROUP = ['pending', 'confirmed', 'picking_up', 'on_the_way'];
const gkey = (id) => `g${id}`;

// ─── الإعدادات ───────────────────────────────────────────────────
function cleanConfig(raw) {
  const c = { ...DEFAULT_CFG, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    enabled: c.enabled === undefined ? true : truthy(c.enabled),
    max_restaurants: Math.min(10, Math.max(2, parseInt(c.max_restaurants) || DEFAULT_CFG.max_restaurants)),
    max_distance_km: round2(Math.max(0.1, num(c.max_distance_km) || DEFAULT_CFG.max_distance_km)),
    extra_stop_fee: round2(Math.max(0, Number.isFinite(parseFloat(c.extra_stop_fee)) ? parseFloat(c.extra_stop_fee) : DEFAULT_CFG.extra_stop_fee)),
  };
}
async function getMultiConfig(db = pool) {
  try {
    const { rows } = await db.query("SELECT value FROM app_settings WHERE key='multi_restaurant'");
    return cleanConfig(rows[0] ? JSON.parse(rows[0].value) : null);
  } catch { return cleanConfig(null); }
}
/** تحديث جزئي مع تحقق — يرمي HttpError 400 برسالة عربية */
async function saveMultiConfig(patch) {
  const cur = await getMultiConfig();
  const b = patch || {};
  const next = { ...cur };
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') throw new HttpError(400, 'قيمة التفعيل يجب أن تكون true أو false');
    next.enabled = b.enabled;
  }
  if (b.max_restaurants !== undefined) {
    const v = Number(b.max_restaurants);
    if (!Number.isInteger(v) || v < 2 || v > 10) throw new HttpError(400, 'أقصى عدد مطاعم يجب أن يكون عدداً صحيحاً بين 2 و 10');
    next.max_restaurants = v;
  }
  if (b.max_distance_km !== undefined) {
    const v = Number(b.max_distance_km);
    if (!Number.isFinite(v) || v < 0.1 || v > 50) throw new HttpError(400, 'أقصى مسافة بين المطاعم يجب أن تكون بين 0.1 و 50 كم');
    next.max_distance_km = round2(v);
  }
  if (b.extra_stop_fee !== undefined) {
    const v = Number(b.extra_stop_fee);
    if (!Number.isFinite(v) || v < 0 || v > 100) throw new HttpError(400, 'رسوم المطعم الإضافي يجب أن تكون بين 0 و 100 ₪');
    next.extra_stop_fee = round2(v);
  }
  await pool.query(
    `INSERT INTO app_settings(key, value, updated_at) VALUES ('multi_restaurant', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [JSON.stringify(next)]);
  return next;
}

// ═══════════════════════════════════════════════════════════════
//  💰 التسعير المجمّع
// ═══════════════════════════════════════════════════════════════
/**
 * @returns { errors:[{code,message,restaurant_id?}], cfg, carts:[...], point, coupon, ...الإجماليات }
 * أخطاء العمل لا تُرمى بل تُجمع في errors (لعرض السعر)؛ أخطاء غير متوقعة فقط تُرمى.
 */
async function priceGroup(db, userId, body, opts = {}) {
  const b = body || {};
  const cfg = opts.cfg || await getMultiConfig(db);
  const errors = [];
  const addErr = (code, message, extra = {}) => {
    if (!errors.some(e => e.code === code && e.message === message)) errors.push({ code, message, ...extra });
  };

  if (!cfg.enabled) addErr('disabled', 'الطلب من أكثر من مطعم غير متاح حالياً');
  const orderType = b.order_type === undefined || b.order_type === null || b.order_type === '' ? 'delivery' : String(b.order_type);
  if (orderType !== 'delivery') addErr('pickup_not_allowed', 'الطلب المجمّع متاح للتوصيل فقط (لا يمكن الاستلام من المطاعم)');
  const pm = b.payment_method === undefined || b.payment_method === null || b.payment_method === '' ? 'cash' : String(b.payment_method);
  if (pm !== 'cash') addErr('card_not_allowed', 'الدفع بالبطاقة غير متاح للطلب المجمّع حالياً — اختر كاش عند الاستلام (ويمكنك استخدام رصيد محفظة وصلّي)');

  const rawCarts = Array.isArray(b.carts) ? b.carts : (Array.isArray(b.restaurants) ? b.restaurants : []);
  const n = rawCarts.length;
  if (n < 2) addErr('too_few_restaurants', 'الطلب المجمّع يحتاج مطعمين على الأقل — للطلب من مطعم واحد استخدم الطلب العادي');
  if (n > cfg.max_restaurants) addErr('too_many_restaurants', `يمكنك الطلب من ${cfg.max_restaurants} مطاعم كحد أقصى في الطلب الواحد`);

  // ── موقع التوصيل (مرة واحدة) ──
  let point = null;
  try { point = await S.resolveDeliveryPoint(db, userId, b); }
  catch (e) { if (!(e instanceof HttpError)) throw e; addErr('location_required', e.message); }

  // ── أسماء/حالة المطاعم (لرسائل أوضح) ──
  const ids = [...new Set(rawCarts.slice(0, MAX_CARTS).map(c => c && c.restaurant_id).filter(isIntId).map(x => parseInt(x)))];
  const { rows: rr } = ids.length
    ? await db.query('SELECT id, name_ar, logo, is_active, is_open, lat, lng FROM restaurants WHERE id = ANY($1::int[])', [ids])
    : { rows: [] };
  const rmap = new Map(rr.map(r => [String(r.id), r]));

  const carts = [];
  const seen = new Set();
  for (const c of rawCarts.slice(0, MAX_CARTS)) {
    const rid = c && c.restaurant_id;
    if (!isIntId(rid)) { addErr('restaurant_unavailable', 'مطعم غير صحيح في الطلب'); continue; }
    const key = String(parseInt(rid));
    if (seen.has(key)) { addErr('duplicate_restaurant', 'نفس المطعم مكرر في الطلب — اجمع أصنافه في سلة واحدة', { restaurant_id: parseInt(rid) }); continue; }
    seen.add(key);
    const r = rmap.get(key);
    const name = r ? (r.name_ar || `#${r.id}`) : null;
    if (!r || !truthy(r.is_active)) { addErr('restaurant_unavailable', name ? `المطعم "${name}" غير متاح حالياً` : 'أحد المطاعم غير متاح حالياً', { restaurant_id: parseInt(rid) }); continue; }
    if (!truthy(r.is_open)) { addErr('restaurant_closed', `"${name}" مغلق حالياً، احذفه من السلة أو اطلب لاحقاً`, { restaurant_id: r.id }); continue; }
    try {
      const p = await S.priceItems(db, rid, c.items);
      let distance = null;
      if (point && S.validCoord(p.restaurant.lat, p.restaurant.lng)) {
        distance = round2(S.haversineKm(num(p.restaurant.lat), num(p.restaurant.lng), point.deliveryLat, point.deliveryLng));
      }
      carts.push({
        restaurant: p.restaurant, lines: p.lines, subtotal: p.subtotal, min_order: p.minOrder, meets_min_order: p.meetsMinOrder,
        distance_km: distance, notes: String((c && c.notes) || '').slice(0, 1000),
      });
      if (!p.meetsMinOrder) addErr('min_order', `الحد الأدنى للطلب من "${name}" هو ${p.minOrder}₪`, { restaurant_id: r.id });
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      addErr('cart_invalid', `"${name}": ${e.message}`, { restaurant_id: r.id });
    }
  }

  // ── المسافة بين كل مطعمين ≤ الحد ──
  for (const c of carts) {
    if (!S.validCoord(c.restaurant.lat, c.restaurant.lng)) {
      addErr('restaurant_location', `موقع "${c.restaurant.name_ar}" غير محدد — لا يمكن ضمّه لطلب مجمّع`, { restaurant_id: c.restaurant.id });
    }
  }
  const located = carts.filter(c => S.validCoord(c.restaurant.lat, c.restaurant.lng));
  const pair = (a, b2) => S.haversineKm(num(a.restaurant.lat), num(a.restaurant.lng), num(b2.restaurant.lat), num(b2.restaurant.lng));
  const sumDist = new Map(located.map(a => [a, located.reduce((s, x) => s + (x === a ? 0 : pair(a, x)), 0)]));
  const reportedFar = new Set();
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length; j++) {
      const d = round2(pair(located[i], located[j]));
      if (d > cfg.max_distance_km) {
        // "البعيد" = الأبعد عن بقية المطاعم (مجموع المسافات)
        const far = sumDist.get(located[i]) > sumDist.get(located[j]) ? located[i] : located[j];
        const other = far === located[i] ? located[j] : located[i];
        if (reportedFar.has(far.restaurant.id)) continue;
        reportedFar.add(far.restaurant.id);
        addErr('too_far', `مطعم "${far.restaurant.name_ar}" بعيد عن "${other.restaurant.name_ar}" (${d} كم) — يجب ألا تزيد المسافة بين المطاعم في الطلب الواحد عن ${cfg.max_distance_km} كم`,
          { restaurant_id: far.restaurant.id, distance_km: d, max_distance_km: cfg.max_distance_km });
      }
    }
  }

  // ── ترتيب المحطات المبدئي: الأبعد عن الزبون أولاً (يُعاد حسابه من موقع السائق عند القبول) ──
  carts.sort((a, b2) => (b2.distance_km ?? Infinity) - (a.distance_km ?? Infinity));
  carts.forEach((c, i) => { c.sequence = i + 1; });

  // ── المال ──
  const subtotal = round2(carts.reduce((s, c) => s + c.subtotal, 0));
  const stops = carts.length;
  const anyUnknown = carts.some(c => c.distance_km === null);
  const farthest = !carts.length || anyUnknown ? null : Math.max(...carts.map(c => c.distance_km));
  const baseFee = carts.length ? await S.getZoneFee(db, farthest) : 0;
  const extraUnit = cfg.extra_stop_fee;
  const extraStopsFee = round2(extraUnit * Math.max(0, stops - 1));

  const cp = await S.evaluateCoupon(db, userId, b.coupon_code, subtotal, 'delivery');
  const firstOrderDiscount = await S.firstOrderDiscountFor(db, userId, subtotal);
  const discount = round2(Math.min(subtotal, cp.couponDiscount + firstOrderDiscount));
  // التوصيل المجاني (الحد أو الكوبون) يُسقط الرسوم الأساسية فقط — لا رسوم المحطات الإضافية
  const freeDelivery = subtotal >= S.FREE_DELIVERY_THRESHOLD || cp.couponFreeDelivery;
  const deliveryFee = freeDelivery ? 0 : baseFee;
  const pay = await S.applyPayments(db, userId, {
    subtotal, fees: round2(deliveryFee + extraStopsFee), discount, tip: b.tip, redeem_points: b.redeem_points, use_wallet: b.use_wallet, userRow: opts.userRow,
  });

  return {
    errors, cfg, carts, point, coupon: cp.coupon,
    delivery_address: b.delivery_address || point?.addressRow?.address || null,
    subtotal, base_fee: baseFee, delivery_fee: deliveryFee, extra_stops_fee: extraStopsFee, extra_stop_unit: extraUnit,
    driver_fee: round2(baseFee + extraStopsFee), free_delivery: freeDelivery,
    discount, coupon_discount: cp.couponDiscount, coupon_error: cp.couponError, first_order_discount: firstOrderDiscount,
    points_value: pay.points_value, points_redeemed: pay.points_redeemed, tip: pay.tip, wallet_used: pay.wallet_used, total: pay.total,
    points_earned: pay.points_earned, cashback: pay.cashback, distance_km: farthest,
  };
}

function publicConfig(cfg) {
  return { ...cfg, free_delivery_threshold: S.FREE_DELIVERY_THRESHOLD, payment_methods: ['cash'] };
}

function groupQuoteView(p) {
  return {
    valid: p.errors.length === 0,
    errors: p.errors,
    config: publicConfig(p.cfg),
    stops_count: p.carts.length,
    restaurants: p.carts.map(c => ({
      restaurant_id: c.restaurant.id, name: c.restaurant.name_ar, logo: c.restaurant.logo || null,
      lat: num(c.restaurant.lat), lng: num(c.restaurant.lng), sequence: c.sequence,
      subtotal: c.subtotal, min_order: c.min_order, meets_min_order: c.meets_min_order, distance_km: c.distance_km,
      items_count: c.lines.reduce((s, l) => s + l.quantity, 0),
      items: c.lines.map(l => ({ item_id: l.menu_item.id, name: l.menu_item.name_ar, quantity: l.quantity, unit_price: l.unit_price, subtotal: l.subtotal, options: l.options })),
    })),
    subtotal: p.subtotal, base_fee: p.base_fee, delivery_fee: p.delivery_fee, extra_stops_fee: p.extra_stops_fee,
    extra_stop_fee: p.extra_stop_unit, driver_fee: p.driver_fee, free_delivery: p.free_delivery,
    discount: p.discount, coupon_discount: p.coupon_discount, coupon_error: p.coupon_error, first_order_discount: p.first_order_discount,
    points_value: p.points_value, points_redeemed: p.points_redeemed, tip: p.tip, wallet_used: p.wallet_used, total: p.total,
    distance_km: p.distance_km, points_earned: p.points_earned,
  };
}

// ═══════════════════════════════════════════════════════════════
//  🛒 الإنشاء — معاملة واحدة: قفل المستخدم + تسعير + مجموعة + أبناء + نقاط/محفظة/كوبون ذرّية
// ═══════════════════════════════════════════════════════════════
async function createGroup(io, userId, body, { clientRef = null } = {}) {
  const { group, children } = await S.withTransaction(async (client) => {
    const { rows: ur } = await client.query('SELECT id, wallet_balance, loyalty_points FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const p = await priceGroup(client, userId, body, { userRow: ur[0] || {} });
    if (p.errors.length) throw new HttpError(400, p.errors[0].message, { errors: p.errors });
    const useCoupon = !!(p.coupon && !p.coupon_error);
    const paymentStatus = p.total <= 0 ? 'paid' : 'pending';
    const b = body || {};

    const { rows: gr } = await client.query(
      `INSERT INTO order_groups (group_number, customer_id, status, subtotal, base_fee, delivery_fee, extra_stops_fee, extra_stop_unit, driver_fee,
         free_delivery, discount, coupon_code, coupon_discount, first_order_discount, points_value, points_redeemed, wallet_used, tip, total,
         loyalty_points_earned, payment_method, payment_status, delivery_address, delivery_lat, delivery_lng, address_id, distance_km, notes,
         stops_total, picked_count, client_ref)
       VALUES ('', $1, 'pending', $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'cash',$19,$20,$21,$22,$23,$24,$25,$26,0,$27)
       RETURNING id`,
      [userId, p.subtotal, p.base_fee, p.delivery_fee, p.extra_stops_fee, p.extra_stop_unit, p.driver_fee,
       p.free_delivery, p.discount, useCoupon ? p.coupon.code : null, useCoupon ? p.coupon_discount : 0, p.first_order_discount,
       p.points_value, p.points_redeemed, p.wallet_used, p.tip, p.total, p.points_earned, paymentStatus,
       String(p.delivery_address || '').slice(0, 500), p.point.deliveryLat, p.point.deliveryLng, p.point.addressRow ? p.point.addressRow.id : null,
       p.distance_km, String(b.notes || '').slice(0, 1000), p.carts.length, clientRef]);
    const groupId = gr[0].id;
    const { rows: gn } = await client.query(
      `UPDATE order_groups SET group_number = 'WSG' || LPAD(id::text, 6, '0') WHERE id=$1 RETURNING *`, [groupId]);
    const g = gn[0];

    const maxEta = Math.max(...p.carts.map(c => parseInt(c.restaurant.delivery_time_max) || 45));
    const eta = new Date(Date.now() + maxEta * 60 * 1000).toISOString();
    const kids = [];
    for (const [idx, c] of p.carts.entries()) {
      const carrier = idx === 0; // الأول إدراجاً = أصغر id → "الابن الحامل"
      const commissionPct = c.restaurant.commission_rate !== null && c.restaurant.commission_rate !== undefined ? num(c.restaurant.commission_rate) : 15;
      const { rows } = await client.query(
        `INSERT INTO orders (order_number, customer_id, restaurant_id, address_id, delivery_address, delivery_lat, delivery_lng,
           payment_method, payment_status, subtotal, delivery_fee, driver_fee, discount, coupon_discount, first_order_discount,
           points_value, free_delivery, tip, total, notes, coupon_code, estimated_delivery_time, loyalty_points_earned,
           order_type, status, wallet_used, points_redeemed, cashback_given, commission_pct, distance_km, group_id, stop_sequence)
         VALUES ('', $1,$2,$3,$4,$5,$6,'cash',$7,$8,0,$9,0,0,0,0,false,$10,$8,$11,NULL,$12,$13,'delivery','pending',0,0,0,$14,$15,$16,$17)
         RETURNING id`,
        [userId, c.restaurant.id, g.address_id, g.delivery_address, g.delivery_lat, g.delivery_lng, paymentStatus,
         c.subtotal, carrier ? p.driver_fee : 0, carrier ? p.tip : 0, c.notes || String(b.notes || '').slice(0, 1000),
         eta, carrier ? p.points_earned : 0, commissionPct, c.distance_km, groupId, c.sequence]);
      const { rows: on } = await client.query(
        `UPDATE orders SET order_number = 'WSL' || LPAD(id::text, 6, '0') WHERE id=$1 RETURNING *`, [rows[0].id]);
      const child = on[0];
      for (const l of c.lines) {
        await client.query(
          `INSERT INTO order_items (order_id, item_id, menu_item_id, name_ar, name_en, price, quantity, subtotal, options, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [child.id, l.menu_item.id, l.menu_item.id, l.menu_item.name_ar, l.menu_item.name_en || null,
           l.unit_price, l.quantity, l.subtotal, JSON.stringify(l.options), l.notes]);
      }
      kids.push(child);
    }
    const carrierId = kids[0].id;

    // 🏆 خصم النقاط ذرّياً
    if (p.points_redeemed > 0) {
      const { rows: pr } = await client.query(
        'UPDATE users SET loyalty_points = loyalty_points - $1 WHERE id=$2 AND loyalty_points >= $1 RETURNING id', [p.points_redeemed, userId]);
      if (!pr[0]) throw new HttpError(409, 'رصيد النقاط غير كافٍ');
      await S.optionalQuery(client, `INSERT INTO loyalty_transactions (user_id, points, type, description, order_id) VALUES ($1,$2,'redeemed',$3,$4)`,
        [userId, p.points_redeemed, `استبدال نقاط طلب مجمّع #${g.group_number}`, carrierId]);
    }
    // 💳 خصم المحفظة ذرّياً
    if (p.wallet_used > 0) {
      const { rows: wr } = await client.query(
        `UPDATE users SET wallet_balance = ROUND((wallet_balance::numeric - $1::numeric), 2)
         WHERE id=$2 AND ROUND(COALESCE(wallet_balance,0)::numeric, 2) >= $1::numeric RETURNING id`, [p.wallet_used, userId]);
      if (!wr[0]) throw new HttpError(409, 'رصيد المحفظة غير كافٍ');
      await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'debit',$2,$3)`,
        [userId, p.wallet_used, `دفع طلب مجمّع #${g.group_number}`]);
    }
    // 🎟️ الكوبون: مرة واحدة على مستوى المجموعة
    if (useCoupon) {
      const { rows: cr } = await client.query(
        `UPDATE coupons SET usage_count = COALESCE(usage_count,0) + 1
         WHERE id=$1 AND (usage_limit IS NULL OR COALESCE(usage_count,0) < usage_limit) RETURNING id`, [p.coupon.id]);
      if (!cr[0]) throw new HttpError(409, 'انتهى عدد استخدامات الكوبون');
      await client.query('INSERT INTO coupon_usage (coupon_id, user_id, order_id, group_id) VALUES ($1,$2,$3,$4)', [p.coupon.id, userId, carrierId, groupId]);
    }
    return { group: { ...g, coupon_error: p.coupon_error }, children: kids };
  });

  const ginfo = { group_id: group.id, group_number: group.group_number, stops_count: children.length };
  for (const child of children) S.notifyRestaurantNewOrder(io, child, ginfo).catch(() => {});
  return { group, children };
}

// ═══════════════════════════════════════════════════════════════
//  📡 الأحداث
// ═══════════════════════════════════════════════════════════════
async function getParties(groupId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.restaurant_id, o.status, r.owner_id, r.name_ar
     FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id WHERE o.group_id=$1 ORDER BY o.stop_sequence NULLS LAST, o.id`, [groupId]);
  return {
    children: rows,
    owners: [...new Set(rows.filter(r => r.status !== 'cancelled' && r.owner_id).map(r => String(r.owner_id)))],
    allOwners: [...new Set(rows.filter(r => r.owner_id).map(r => String(r.owner_id)))],
  };
}

function touchGroup(g, parties) {
  if (g && g.driver_id) driverLoc.invalidateActiveRelay(g.driver_id);
  for (const c of (parties?.children || [])) cache.invalidateRestaurantOrders(c.restaurant_id);
}

async function emitGroupStatus(io, g, parties) {
  parties = parties || await getParties(g.id);
  touchGroup(g, parties);
  if (!io) return;
  const live = parties.children.filter(c => c.status !== 'cancelled');
  const payload = {
    group_id: g.id, group_number: g.group_number, status: g.status, status_label: GROUP_STATUS_LABELS[g.status] || g.status,
    picked_count: parseInt(g.picked_count) || 0, stops_total: live.length,
  };
  const targets = new Set([g.customer_id, g.driver_id, ...parties.allOwners].filter(Boolean).map(String));
  for (const uid of targets) notifyUser(io, uid, 'group_status', payload);
}

function emitTo(io, ids, event, payload) {
  if (!io) return;
  for (const uid of new Set(ids.filter(Boolean).map(String))) notifyUser(io, uid, event, payload);
}

// ═══════════════════════════════════════════════════════════════
//  ✅ تأكيد المطاعم → توزيع المجموعة
// ═══════════════════════════════════════════════════════════════
// تُستدعى بعد تأكيد أي ابن (أو إلغاء ابن): لو كل الأبناء غير الملغاة تجاوزت pending → المجموعة confirmed + توزيع
async function maybeConfirmGroup(io, groupId) {
  const { rows } = await pool.query(
    `UPDATE order_groups g SET status='confirmed', updated_at=NOW()
     WHERE g.id=$1 AND g.status='pending'
       AND EXISTS (SELECT 1 FROM orders o WHERE o.group_id=g.id AND o.status <> 'cancelled')
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.group_id=g.id AND o.status = 'pending')
     RETURNING *`, [groupId]);
  const g = rows[0];
  if (!g) return null;
  await emitGroupStatus(io, g);
  try {
    await notify(io, g.customer_id, '✅ كل المطاعم قبلت طلبك', 'نبحث الآن عن سائق يجمع طلبك من كل المطاعم', 'group_confirmed', { group_id: String(g.id) });
  } catch (e) { console.error('group confirm notify:', e.message); }
  await dispatchGroup(io, g.id);
  return g;
}

// ═══════════════════════════════════════════════════════════════
//  🛵 توزيع المجموعة على سائق واحد (نفس دلالات العرض 45ث/الرفض/الانتهاء/الاستعادة)
// ═══════════════════════════════════════════════════════════════
const { triedDrivers, offerTimers, retryTimers, clearTimer } = S._dispatchState;
const stopGroupDispatch = (groupId) => S.stopDispatch(gkey(groupId));

function scheduleGroupRetry(io, groupId, ms) {
  const key = gkey(groupId);
  if (retryTimers.has(key)) return;
  const t = setTimeout(() => { retryTimers.delete(key); dispatchGroup(io, groupId).catch(() => {}); }, ms);
  if (t.unref) t.unref();
  retryTimers.set(key, t);
}

async function loadStops(groupId, db = pool) {
  const { rows } = await db.query(
    `SELECT o.id AS order_id, o.order_number, o.restaurant_id, o.status, o.stop_sequence, o.picked_up_at, o.subtotal,
            r.name_ar AS name, r.lat, r.lng, r.phone, r.address, r.logo, r.owner_id
     FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id
     WHERE o.group_id=$1 AND o.status <> 'cancelled' ORDER BY o.stop_sequence NULLS LAST, o.id`, [groupId]);
  return rows.map(r => ({
    order_id: r.order_id, order_number: r.order_number, restaurant_id: r.restaurant_id, name: r.name,
    lat: r.lat === null ? null : num(r.lat), lng: r.lng === null ? null : num(r.lng), phone: r.phone || null, address: r.address || null, logo: r.logo || null,
    sequence: r.stop_sequence, status: r.status, picked: !!r.picked_up_at, picked_up_at: r.picked_up_at, subtotal: round2(num(r.subtotal)), owner_id: r.owner_id,
  }));
}

const cashToCollect = (g) => (g.payment_method !== 'card' && g.payment_status !== 'paid') ? round2(num(g.total)) : 0;

function offerPayload(g, stops, expiresAt, { updated = false } = {}) {
  const first = stops[0] || {};
  const offerSeconds = updated ? Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000)) : S.OFFER_SECONDS;
  return {
    group_id: g.id, is_group: true, group_number: g.group_number,
    order_id: first.order_id || null,                       // توافق: أول ابن
    restaurant_lat: first.lat ?? null, restaurant_lng: first.lng ?? null,
    stops: stops.map(s => ({ order_id: s.order_id, order_number: s.order_number, restaurant_id: s.restaurant_id, name: s.name, lat: s.lat, lng: s.lng, sequence: s.sequence })),
    stops_count: stops.length,
    dropoff: { lat: num(g.delivery_lat), lng: num(g.delivery_lng), address: g.delivery_address || '' },
    driver_fee: round2(num(g.driver_fee)), tip: round2(num(g.tip)), driver_earning: round2(num(g.driver_fee) + num(g.tip)),
    cash_to_collect: cashToCollect(g), payment_method: g.payment_method,
    offer_seconds: offerSeconds, expires_at: expiresAt,
    // D-01/D-02: معرّف فريد لكل عرض + وقت السيرفر
    offer_id: `g${g.id}|${expiresAt}`, server_now: new Date().toISOString(),
    ...(updated ? { updated: true } : {}),
  };
}

async function dispatchGroup(io, groupId, excludeDriverId = null) {
  const key = gkey(groupId);
  try {
    if (!triedDrivers.has(key)) triedDrivers.set(key, new Set());
    const tried = triedDrivers.get(key);
    if (excludeDriverId != null) tried.add(String(excludeDriverId));

    const { rows } = await pool.query('SELECT * FROM order_groups WHERE id=$1', [groupId]);
    const g = rows[0];
    if (!g || g.status !== 'confirmed' || g.driver_assigned_at) { stopGroupDispatch(groupId); return null; }
    if (g.driver_id) return null; // عرض قائم

    const stops = await loadStops(groupId);
    if (!stops.length) { stopGroupDispatch(groupId); return null; }
    let lat = stops[0].lat, lng = stops[0].lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { lat = 31.9; lng = 35.2; }

    const best = await S.findNearestDriver(lat, lng, 0, tried, g.id);
    if (!best) {
      if (tried.size) { tried.clear(); scheduleGroupRetry(io, groupId, 12000); }
      else scheduleGroupRetry(io, groupId, 20000);
      return null;
    }
    const driverId = best.user_id;
    const { rows: off } = await pool.query(
      `UPDATE order_groups SET driver_id=$1, driver_offer_expires_at = NOW() + INTERVAL '${S.OFFER_SECONDS} seconds', updated_at=NOW()
       WHERE id=$2 AND driver_id IS NULL AND driver_assigned_at IS NULL AND status='confirmed' RETURNING *`, [driverId, groupId]);
    if (!off[0]) return null;

    const expiresAt = new Date(off[0].driver_offer_expires_at || Date.now() + S.OFFER_SECONDS * 1000).toISOString();
    // D-18: ترتيب المحطات في العرض = أقرب جار من موقع هذا السائق (نفس خوارزمية القبول) — لا يتغيّر الترتيب بعد القبول
    let offerStops = stops;
    // (بدون حفظ: ترتيب الإنشاء يبقى مرجع اختيار السائق التالي إن رُفض العرض)
    try { const r = await recomputeRoute(groupId, driverId, pool, { persist: false }); if (r && r.length) offerStops = r; } catch (e) { console.error('offer route:', e.message); }
    const payload = offerPayload(off[0], offerStops, expiresAt);
    notifyUser(io, driverId, 'new_order_request', payload);
    S.pushTo(driverId, '🛵 طلب مجمّع جديد!', `${S.arCount(offerStops.length, S.AR.restaurants)} — سائق واحد. اقبل الآن!`,
      { type: 'new_order_request', is_group: 'true', group_id: String(g.id), order_id: String(payload.order_id || ''),
        offer_seconds: String(S.OFFER_SECONDS), expires_at: expiresAt, offer_id: payload.offer_id }, 'com.wasaly.driver');

    clearTimer(offerTimers, key);
    const t = setTimeout(async () => {
      offerTimers.delete(key);
      try {
        const { rows: exp } = await pool.query(
          `UPDATE order_groups SET driver_id=NULL, driver_offer_expires_at=NULL
           WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NULL RETURNING id`, [groupId, driverId]);
        if (exp[0]) dispatchGroup(io, groupId, driverId).catch(() => {});
      } catch (e) { console.error('group dispatch timeout error:', e.message); }
    }, S.OFFER_SECONDS * 1000);
    if (t.unref) t.unref();
    offerTimers.set(key, t);
    return { user_id: driverId };
  } catch (e) { console.error('dispatchGroup error:', e.message); return null; }
}

async function recoverGroupDispatch(io) {
  await pool.query(
    `UPDATE order_groups SET driver_id=NULL, driver_offer_expires_at=NULL
     WHERE driver_assigned_at IS NULL AND driver_id IS NOT NULL AND status='confirmed'`);
  // مجموعات pending كل أبنائها مؤكّدة (انقطاع بين تأكيد الابن وتحديث المجموعة)
  const { rows: pend } = await pool.query(
    `SELECT g.id FROM order_groups g WHERE g.status='pending' AND g.created_at > NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.group_id=g.id AND o.status='pending')`);
  for (const r of pend) await maybeConfirmGroup(io, r.id).catch(() => {});
  const { rows } = await pool.query(
    `SELECT id FROM order_groups WHERE status='confirmed' AND driver_assigned_at IS NULL
       AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at`);
  rows.forEach((r, i) => { const t = setTimeout(() => dispatchGroup(io, r.id).catch(() => {}), 700 + i * 300); if (t.unref) t.unref(); });
  console.log(`🧺 Group dispatch recovery: ${rows.length} group(s) re-queued`);
}

// ─── مسار الاستلام: أقرب جار من موقع السائق عبر المحطات غير المستلمة ───
async function recomputeRoute(groupId, driverId, db = pool, { persist = true } = {}) {
  const stops = await loadStops(groupId, db);
  if (!stops.length) return stops;
  let start = driverId ? await driverLoc.getLocation(driverId) : null;
  if (!start && driverId) {
    const { rows } = await db.query('SELECT current_lat, current_lng FROM drivers WHERE user_id=$1', [driverId]);
    if (rows[0] && S.validCoord(rows[0].current_lat, rows[0].current_lng)) start = { lat: num(rows[0].current_lat), lng: num(rows[0].current_lng) };
  }
  const picked = stops.filter(s => s.picked).sort((a, b) => new Date(a.picked_up_at) - new Date(b.picked_up_at));
  let rest = stops.filter(s => !s.picked);
  const ordered = [...picked];
  if (start) {
    let cur = start;
    while (rest.length) {
      let bi = 0, bd = Infinity;
      rest.forEach((s, i) => {
        const d = Number.isFinite(s.lat) && Number.isFinite(s.lng) ? S.haversineKm(cur.lat, cur.lng, s.lat, s.lng) : Infinity;
        if (d < bd) { bd = d; bi = i; }
      });
      const nx = rest.splice(bi, 1)[0];
      ordered.push(nx);
      if (Number.isFinite(nx.lat) && Number.isFinite(nx.lng)) cur = { lat: nx.lat, lng: nx.lng };
    }
  } else ordered.push(...rest); // بلا موقع للسائق → نُبقي الترتيب الحالي
  ordered.forEach((s, i) => { s.sequence = i + 1; });
  if (!persist) return ordered;
  await db.query(
    `UPDATE orders o SET stop_sequence = v.seq FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS seq) v WHERE o.id = v.id`,
    [ordered.map(s => s.order_id), ordered.map(s => s.sequence)]);
  return ordered;
}

// ═══════════════════════════════════════════════════════════════
//  🛵 قبول / رفض / استلام / تسليم
// ═══════════════════════════════════════════════════════════════
async function acceptGroup(io, groupId, driverId) {
  const out = await S.withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE order_groups SET driver_assigned_at=NOW(), driver_offer_expires_at=NULL, status='picking_up', updated_at=NOW()
       WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NULL AND status='confirmed' RETURNING *`, [groupId, driverId]);
    const g = rows[0];
    if (!g) return { g: null };
    const { rows: kids } = await client.query(
      `UPDATE orders SET driver_id=$2, driver_assigned_at=NOW(), driver_offer_expires_at=NULL, updated_at=NOW(),
              status = CASE WHEN status='confirmed' THEN 'preparing' ELSE status END
       WHERE group_id=$1 AND status NOT IN ('cancelled','delivered') RETURNING *`, [groupId, driverId]);
    await client.query('UPDATE drivers SET is_busy=true WHERE user_id=$1', [driverId]);
    return { g, kids };
  });
  if (!out.g) {
    const { rows: mine } = await pool.query(
      `SELECT id FROM order_groups WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NOT NULL AND status IN ('picking_up','on_the_way')`, [groupId, driverId]);
    if (mine[0]) return { already: true, group_id: mine[0].id, stops: (await loadStops(groupId)).map(stopView) };
    throw new HttpError(400, 'الطلب غير متاح');
  }
  stopGroupDispatch(groupId);
  const stops = await recomputeRoute(groupId, driverId);
  try {
    for (const k of out.kids) await S.emitOrderStatus(io, k, k.status);
    await emitGroupStatus(io, out.g);
    const firstId = stops[0]?.order_id || out.kids[0]?.id;
    notifyUser(io, out.g.customer_id, 'driver_assigned', { order_id: firstId, group_id: out.g.id, driver_id: driverId });
    const { rows: di } = await pool.query('SELECT name FROM users WHERE id=$1', [driverId]);
    await notify(io, out.g.customer_id, '🛵 السائق في طريقه',
      `${di[0]?.name || 'السائق'} سيجمع طلبك من ${S.arCount(stops.length, S.AR.restaurants)} ثم يوصله إليك`, 'driver_assigned', { group_id: String(out.g.id), order_id: String(firstId || '') });
  } catch (e) { console.error('group accept notify (non-fatal):', e.message); }
  return { group_id: out.g.id, stops: stops.map(stopView) };
}

async function rejectGroup(io, groupId, driverId) {
  const { rows } = await pool.query(
    `UPDATE order_groups SET driver_id=NULL, driver_offer_expires_at=NULL
     WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NULL RETURNING id`, [groupId, driverId]);
  if (!rows[0]) throw new HttpError(400, 'لا يمكن رفض هذا الطلب');
  dispatchGroup(io, groupId, driverId).catch(() => {});
  return true;
}

async function assertAssignedDriver(groupId, driverId) {
  const { rows } = await pool.query('SELECT * FROM order_groups WHERE id=$1', [groupId]);
  const g = rows[0];
  if (!g) throw new HttpError(404, 'الطلب غير موجود');
  if (!g.driver_id || String(g.driver_id) !== String(driverId) || !g.driver_assigned_at) throw new HttpError(403, 'هذا الطلب ليس مسنداً إليك');
  return g;
}

async function pickupChild(io, groupId, driverId, orderId) {
  if (!isIntId(orderId)) throw new HttpError(400, 'حدّد الطلب الذي استلمته من المطعم (order_id)');
  const g0 = await assertAssignedDriver(groupId, driverId);
  if (!['picking_up', 'on_the_way'].includes(g0.status)) throw new HttpError(400, `لا يمكن الاستلام والطلب في حالة "${GROUP_STATUS_LABELS[g0.status] || g0.status}"`);
  const res = await S.withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE orders SET status='on_the_way', picked_up_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND group_id=$2 AND status IN ('confirmed','preparing','ready') AND picked_up_at IS NULL RETURNING *`, [orderId, groupId]);
    const child = rows[0];
    if (!child) return { child: null };
    const { rows: gr } = await client.query(
      `UPDATE order_groups g SET
         picked_count = (SELECT COUNT(*) FROM orders o WHERE o.group_id=g.id AND o.status <> 'cancelled' AND o.picked_up_at IS NOT NULL),
         status = CASE WHEN NOT EXISTS (SELECT 1 FROM orders o WHERE o.group_id=g.id AND o.status <> 'cancelled' AND o.picked_up_at IS NULL)
                       THEN 'on_the_way' ELSE g.status END,
         updated_at = NOW()
       WHERE g.id=$1 AND g.status IN ('picking_up','on_the_way') RETURNING *`, [groupId]);
    return { child, g: gr[0] };
  });
  if (!res.child) {
    const { rows } = await pool.query('SELECT id, status, picked_up_at, group_id FROM orders WHERE id=$1', [orderId]);
    const c = rows[0];
    if (!c || String(c.group_id) !== String(groupId)) throw new HttpError(404, 'هذا الطلب ليس ضمن الطلب المجمّع');
    if (c.picked_up_at && c.status !== 'cancelled') return { already: true, ...(await pickupSummary(groupId)) };
    if (c.status === 'cancelled') throw new HttpError(400, 'هذا المطعم ألغى طلبه — لا حاجة للاستلام منه');
    throw new HttpError(400, 'لا يمكن استلام هذا الطلب الآن');
  }
  const g = res.g;
  await S.emitOrderStatus(io, res.child, 'on_the_way');
  await emitGroupStatus(io, g);
  if (g.status === 'on_the_way' && g0.status !== 'on_the_way') {
    try { await Notify.orderOnTheWay(io, g.customer_id, res.child.id); } catch (e) { console.error('group on_the_way notify:', e.message); }
  }
  return pickupSummary(groupId, g);
}

async function pickupSummary(groupId, g) {
  if (!g) { const { rows } = await pool.query('SELECT * FROM order_groups WHERE id=$1', [groupId]); g = rows[0]; }
  const stops = await loadStops(groupId);
  const next = stops.find(s => !s.picked) || null;
  return {
    group_id: g.id, status: g.status, picked_count: parseInt(g.picked_count) || 0, stops_total: stops.length,
    next_stop: next ? stopView(next) : null, all_picked: !next,
  };
}

async function deliverGroup(io, groupId, driverId) {
  const res = await S.withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE order_groups SET status='delivered', delivered_at=NOW(), updated_at=NOW(),
              payment_status = CASE WHEN payment_method='card' THEN payment_status ELSE 'paid' END
       WHERE id=$1 AND driver_id=$2 AND driver_assigned_at IS NOT NULL AND status='on_the_way' RETURNING *`, [groupId, driverId]);
    const g = rows[0];
    if (!g) return { g: null };
    const { rows: kids } = await client.query(
      `UPDATE orders SET status='delivered', delivered_at=NOW(), actual_delivery_time=NOW(), updated_at=NOW(),
              payment_status = CASE WHEN payment_method='card' THEN payment_status ELSE 'paid' END, points_credited=true
       WHERE group_id=$1 AND status='on_the_way' RETURNING *`, [groupId]);
    const carrier = kids.reduce((m, k) => (!m || k.id < m.id ? k : m), null);
    // 💰 التسوية مرة واحدة على مستوى المجموعة (الأبناء لا يُسوَّون — markDelivered يستثنيهم)
    const s = await S.settleDelivery(client, {
      driverId: g.driver_id, driverEarning: round2(num(g.driver_fee) + num(g.tip)), customerId: g.customer_id,
      cashbackBase: num(g.subtotal), label: `طلب مجمّع #${g.group_number}`,
      points: g.loyalty_points_earned, pointsAlreadyCredited: truthy(g.points_credited), loyaltyOrderId: carrier ? carrier.id : null,
    });
    await client.query(
      `UPDATE order_groups SET cashback_given=$2, points_credited = points_credited OR $3, referral_processed = referral_processed OR $4 WHERE id=$1`,
      [g.id, s.cashback, s.pointsCredited, s.referral]);
    return { g: { ...g, cashback_given: s.cashback }, kids, driverEarning: round2(num(g.driver_fee) + num(g.tip)) };
  });
  if (!res.g) {
    const { rows } = await pool.query('SELECT id, status, driver_id, driver_assigned_at FROM order_groups WHERE id=$1', [groupId]);
    const g = rows[0];
    if (!g) throw new HttpError(404, 'الطلب غير موجود');
    if (!g.driver_id || String(g.driver_id) !== String(driverId) || !g.driver_assigned_at) throw new HttpError(403, 'هذا الطلب ليس مسنداً إليك');
    if (g.status === 'delivered') return { already: true, group_id: g.id };
    throw new HttpError(400, 'لا يمكن تسليم الطلب قبل استلامه من كل المطاعم');
  }
  stopGroupDispatch(groupId);
  for (const k of res.kids) await S.emitOrderStatus(io, k, 'delivered');
  await emitGroupStatus(io, res.g);
  try { await Notify.orderDelivered(io, res.g.customer_id, res.kids[0]?.id); } catch (e) { console.error('group delivered notify:', e.message); }
  return { group_id: res.g.id, driver_earning: res.driverEarning };
}

// ═══════════════════════════════════════════════════════════════
//  ❌ الإلغاء + الاسترجاع
// ═══════════════════════════════════════════════════════════════
async function refundGroupBenefits(client, groupId) {
  const { rows } = await client.query(
    'UPDATE order_groups SET benefits_refunded=true WHERE id=$1 AND COALESCE(benefits_refunded,false)=false RETURNING *', [groupId]);
  const g = rows[0];
  if (!g) return null;
  const walletUsed = round2(num(g.wallet_used));
  const pts = parseInt(g.points_redeemed) || 0;
  if (walletUsed > 0) {
    await client.query('UPDATE users SET wallet_balance = ROUND((COALESCE(wallet_balance,0)::numeric + $1::numeric), 2) WHERE id=$2', [walletUsed, g.customer_id]);
    await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'credit',$2,$3)`,
      [g.customer_id, walletUsed, `استرجاع إلغاء طلب مجمّع #${g.group_number}`]);
  }
  if (pts > 0) {
    await client.query('UPDATE users SET loyalty_points = COALESCE(loyalty_points,0) + $1 WHERE id=$2', [pts, g.customer_id]);
    await S.optionalQuery(client, `INSERT INTO loyalty_transactions (user_id, points, type, description, order_id) VALUES ($1,$2,'bonus',$3,NULL)`,
      [g.customer_id, pts, `استرجاع نقاط طلب مجمّع #${g.group_number}`]);
  }
  const cashback = round2(num(g.cashback_given));
  if (cashback > 0) {
    await client.query('UPDATE users SET wallet_balance = GREATEST(0, ROUND((COALESCE(wallet_balance,0)::numeric - $1::numeric), 2)) WHERE id=$2', [cashback, g.customer_id]);
  }
  if (g.coupon_code) await releaseGroupCoupon(client, g);
  return { wallet: walletUsed, points: pts };
}

async function releaseGroupCoupon(client, g) {
  const { rows: cu } = await client.query('DELETE FROM coupon_usage WHERE group_id=$1 RETURNING coupon_id', [g.id]);
  for (const u of cu) await client.query('UPDATE coupons SET usage_count = GREATEST(0, COALESCE(usage_count,0) - 1) WHERE id=$1', [u.coupon_id]);
}

/**
 * إلغاء المجموعة كاملة. actor = { id, role } ؛ الزبون فقط قبل أن يبدأ أي مطعم بالتحضير.
 */
async function cancelGroup(io, groupId, actor, reason) {
  const isAdmin = actor.role === 'admin';
  const { rows: cur } = await pool.query('SELECT * FROM order_groups WHERE id=$1', [groupId]);
  const g0 = cur[0];
  if (!g0 || (!isAdmin && String(g0.customer_id) !== String(actor.id))) throw new HttpError(404, 'الطلب غير موجود');
  const by = isAdmin ? 'admin' : 'customer';
  const allowed = isAdmin ? ACTIVE_GROUP : ['pending', 'confirmed'];
  const blockedChild = isAdmin ? [] : ['preparing', 'ready', 'on_the_way', 'delivered'];
  const msg = 'لا يمكن إلغاء الطلب بعد أن بدأ أحد المطاعم بتحضيره أو قَبِله سائق';

  const res = await S.withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE order_groups g SET status='cancelled', cancelled_at=NOW(), updated_at=NOW(), driver_offer_expires_at=NULL,
              cancel_reason=COALESCE(NULLIF($2,''), cancel_reason), cancelled_by=$3
       WHERE g.id=$1 AND g.status = ANY($4::text[])
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.group_id=g.id AND o.status = ANY($5::text[]))
       RETURNING *`, [groupId, String(reason || '').slice(0, 500), by, allowed, blockedChild]);
    const g = rows[0];
    if (!g) return { g: null };
    const { rows: kids } = await client.query(
      `UPDATE orders SET status='cancelled', cancel_reason=COALESCE(NULLIF($2,''), cancel_reason), cancelled_at=NOW(), updated_at=NOW(),
              driver_offer_expires_at=NULL, benefits_refunded=true
       WHERE group_id=$1 AND status NOT IN ('cancelled','delivered') RETURNING *`, [groupId, String(reason || '').slice(0, 500)]);
    const refund = await refundGroupBenefits(client, groupId);
    if (g.driver_id && g.driver_assigned_at) await client.query('UPDATE drivers SET is_busy=false WHERE user_id=$1', [g.driver_id]);
    return { g, kids, refund };
  });
  if (!res.g) throw new HttpError(400, ['delivered', 'cancelled'].includes(g0.status) ? 'لا يمكن إلغاء الطلب في هذه المرحلة' : msg);
  await afterGroupCancelled(io, res.g, res.kids, by, reason);
  return { group_id: res.g.id, refunded_wallet: res.refund?.wallet || 0, refunded_points: res.refund?.points || 0 };
}

async function afterGroupCancelled(io, g, kids, by, reason) {
  stopGroupDispatch(g.id);
  const parties = await getParties(g.id);
  touchGroup(g, parties);
  for (const k of kids) {
    await S.emitOrderStatus(io, k, 'cancelled');
    const owner = parties.children.find(c => c.id === k.id)?.owner_id;
    emitTo(io, [owner, g.driver_id], 'order_cancelled', { order_id: k.id, order_number: k.order_number, by, group_id: g.id, reason: reason || null });
  }
  await emitGroupStatus(io, g, parties);
  emitTo(io, [g.customer_id, g.driver_id, ...parties.allOwners], 'group_cancelled', { group_id: g.id, group_number: g.group_number, by, reason: reason || null });
  try {
    for (const k of kids) {
      const owner = parties.children.find(c => c.id === k.id)?.owner_id;
      if (!owner || by === 'restaurant') continue;
      const m = `❌ الطلب #${k.order_number} أُلغي${by === 'customer' ? ' من الزبون' : by === 'admin' ? ' من الإدارة' : ''}`;
      saveNotification(owner, m, 'order_cancelled', { order_id: k.id, group_id: g.id });
      S.pushTo(owner, '❌ تم إلغاء طلب', m, { type: 'order_cancelled', order_id: String(k.id), group_id: String(g.id) }, 'com.wasaly.restaurant');
    }
    if (g.driver_id) {
      const m = `❌ الطلب المجمّع #${g.group_number} أُلغي`;
      saveNotification(g.driver_id, m, 'order_cancelled', { group_id: g.id });
      S.pushTo(g.driver_id, '❌ تم إلغاء الطلب', m, { type: 'order_cancelled', group_id: String(g.id), is_group: 'true' }, 'com.wasaly.driver');
    }
    if (by !== 'customer') {
      await notify(io, g.customer_id, '❌ تم إلغاء طلبك المجمّع',
        by === 'restaurant' ? 'اعتذرت كل المطاعم عن طلبك — تم استرجاع ما دفعته من المحفظة والنقاط' : 'تم إلغاء طلبك. اتصل بنا للمساعدة',
        'cancelled', { group_id: String(g.id) });
    }
  } catch (e) { console.error('group cancel notify:', e.message); }
}

// ─── الابن الحامل: أصغر id غير ملغى يحمل driver_fee/tip/loyalty_points_earned للمجموعة ───
async function syncCarrier(client, g) {
  await client.query(
    `WITH c AS (SELECT MIN(id) AS id FROM orders WHERE group_id=$1 AND status <> 'cancelled')
     UPDATE orders o SET
       driver_fee = CASE WHEN o.id = c.id THEN $2::float8 ELSE 0 END,
       tip = CASE WHEN o.id = c.id THEN $3::float8 ELSE 0 END,
       loyalty_points_earned = CASE WHEN o.id = c.id THEN $4::int ELSE 0 END
     FROM c WHERE o.group_id=$1`,
    [g.id, round2(num(g.driver_fee)), round2(num(g.tip)), parseInt(g.loyalty_points_earned) || 0]);
}

/**
 * مطعم ألغى/رفض طلبه الابن (قبل الاستلام) → إعادة حساب المجموعة واسترجاع الفرق، أو إلغاء المجموعة لو لم يبقَ أحد.
 */
async function onChildCancelled(io, child, by) {
  const groupId = child.group_id;
  const res = await S.withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM order_groups WHERE id=$1 FOR UPDATE', [groupId]);
    const g = rows[0];
    if (!g || ['delivered', 'cancelled'].includes(g.status)) return { type: 'noop' };
    const { rows: remaining } = await client.query(
      `SELECT id, subtotal, distance_km, picked_up_at FROM orders WHERE group_id=$1 AND status <> 'cancelled'`, [groupId]);

    if (!remaining.length) {
      const { rows: cg } = await client.query(
        `UPDATE order_groups SET status='cancelled', cancelled_at=NOW(), updated_at=NOW(), driver_offer_expires_at=NULL,
                cancel_reason='اعتذرت كل المطاعم عن الطلب', cancelled_by=$2, stops_total=0
         WHERE id=$1 RETURNING *`, [groupId, by]);
      const refund = await refundGroupBenefits(client, groupId);
      if (g.driver_id && g.driver_assigned_at) await client.query('UPDATE drivers SET is_busy=false WHERE user_id=$1', [g.driver_id]);
      return { type: 'cancelled', g: cg[0], refund };
    }

    // ── إعادة الحساب على ما تبقّى (أسعار الأصناف ثابتة كما سُعّرت عند الإنشاء) ──
    const n = remaining.length;
    const subtotal = round2(remaining.reduce((s, r) => s + num(r.subtotal), 0));
    const anyUnknown = remaining.some(r => r.distance_km === null || r.distance_km === undefined);
    const farthest = anyUnknown ? null : Math.max(...remaining.map(r => num(r.distance_km)));
    const baseFee = await S.getZoneFee(client, farthest);
    const unit = round2(num(g.extra_stop_unit));
    const extraStopsFee = round2(unit * Math.max(0, n - 1));

    let couponDiscount = 0, couponFree = false, couponCode = g.coupon_code, couponDropped = false;
    if (g.coupon_code) {
      const { rows: cr } = await client.query('SELECT * FROM coupons WHERE LOWER(code)=LOWER($1) ORDER BY id DESC LIMIT 1', [g.coupon_code]);
      const c = cr[0];
      if (c && subtotal >= num(c.min_order)) {
        const v = S.couponValueFor(c, subtotal);
        couponDiscount = v.discount; couponFree = v.freeDelivery;
      } else {
        couponDropped = true; couponCode = null;
        await releaseGroupCoupon(client, g);
      }
    }
    const firstOrderDiscount = num(g.first_order_discount) > 0 ? round2(Math.min(S.FIRST_ORDER_MAX, subtotal * S.FIRST_ORDER_RATE)) : 0;
    const discount = round2(Math.min(subtotal, couponDiscount + firstOrderDiscount));
    const freeDelivery = subtotal >= S.FREE_DELIVERY_THRESHOLD || couponFree;
    const deliveryFee = freeDelivery ? 0 : baseFee;
    const fees = round2(deliveryFee + extraStopsFee);

    const oldPts = parseInt(g.points_redeemed) || 0;
    const maxValue = Math.max(0, subtotal + fees - discount);
    const newPts = Math.min(oldPts, Math.floor(maxValue / S.POINT_VALUE + 1e-9));
    const pointsValue = round2(newPts * S.POINT_VALUE);
    const tip = round2(num(g.tip));
    const due = round2(Math.max(0, subtotal + fees - discount - pointsValue) + tip);
    const oldWallet = round2(num(g.wallet_used));
    const newWallet = round2(Math.min(oldWallet, due));
    const total = round2(Math.max(0, due - newWallet));
    const refundWallet = round2(oldWallet - newWallet);
    const refundPoints = oldPts - newPts;

    if (refundWallet > 0) {
      await client.query('UPDATE users SET wallet_balance = ROUND((COALESCE(wallet_balance,0)::numeric + $1::numeric), 2) WHERE id=$2', [refundWallet, g.customer_id]);
      await client.query(`INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES ($1,'credit',$2,$3)`,
        [g.customer_id, refundWallet, `استرجاع فرق طلب مجمّع #${g.group_number}`]);
    }
    if (refundPoints > 0) {
      await client.query('UPDATE users SET loyalty_points = COALESCE(loyalty_points,0) + $1 WHERE id=$2', [refundPoints, g.customer_id]);
      await S.optionalQuery(client, `INSERT INTO loyalty_transactions (user_id, points, type, description, order_id) VALUES ($1,$2,'bonus',$3,NULL)`,
        [g.customer_id, refundPoints, `استرجاع نقاط فرق طلب مجمّع #${g.group_number}`]);
    }
    const picked = remaining.filter(r => r.picked_up_at).length;
    // 🔢 X-05: إعادة ترقيم المحطات الباقية 1..n (لا "مطعم 3 من 2" بعد انسحاب مطعم قبل قبول السائق)
    await client.query(
      `UPDATE orders o SET stop_sequence = v.rn FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY stop_sequence NULLS LAST, id) AS rn
         FROM orders WHERE group_id=$1 AND status <> 'cancelled') v
       WHERE o.id = v.id AND o.stop_sequence IS DISTINCT FROM v.rn`, [groupId]);
    const { rows: ug } = await client.query(
      `UPDATE order_groups SET subtotal=$2, base_fee=$3, delivery_fee=$4, extra_stops_fee=$5, driver_fee=$6, free_delivery=$7,
              discount=$8, coupon_code=$9, coupon_discount=$10, first_order_discount=$11, points_value=$12, points_redeemed=$13,
              wallet_used=$14, total=$15, loyalty_points_earned=$16, distance_km=$17, stops_total=$18, picked_count=$19,
              payment_status = CASE WHEN $15::float8 <= 0 THEN 'paid' ELSE payment_status END,
              status = CASE WHEN status='picking_up' AND $19::int >= $18::int THEN 'on_the_way' ELSE status END,
              updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [groupId, subtotal, baseFee, deliveryFee, extraStopsFee, round2(baseFee + extraStopsFee), freeDelivery,
       discount, couponCode, couponDiscount, firstOrderDiscount, pointsValue, newPts, newWallet, total,
       Math.max(0, Math.floor(subtotal - discount)), farthest, n, picked]);
    await syncCarrier(client, ug[0]);
    return { type: 'updated', g: ug[0], prevStatus: g.status, refund: { wallet: refundWallet, points: refundPoints }, couponDropped };
  });

  if (res.type === 'noop') return res;
  const { rows: rn } = await pool.query('SELECT name_ar FROM restaurants WHERE id=$1', [child.restaurant_id]);
  const rname = rn[0]?.name_ar || 'أحد المطاعم';
  if (res.type === 'cancelled') {
    await afterGroupCancelled(io, res.g, [], by === 'admin' ? 'admin' : 'restaurant', 'اعتذرت كل المطاعم عن الطلب');
    return res;
  }

  const g = res.g;
  const parties = await getParties(g.id);
  const payload = {
    group_id: g.id, group_number: g.group_number, reason: 'restaurant_cancelled',
    order_id: child.id, restaurant_id: child.restaurant_id, restaurant_name: rname, by,
    stops_total: g.stops_total, coupon_dropped: !!res.couponDropped,
    refunded_wallet: res.refund.wallet, refunded_points: res.refund.points,
    totals: {
      subtotal: round2(num(g.subtotal)), delivery_fee: round2(num(g.delivery_fee)), extra_stops_fee: round2(num(g.extra_stops_fee)),
      discount: round2(num(g.discount)), points_value: round2(num(g.points_value)), wallet_used: round2(num(g.wallet_used)),
      tip: round2(num(g.tip)), total: round2(num(g.total)), driver_fee: round2(num(g.driver_fee)),
    },
  };
  emitTo(io, [g.customer_id, g.driver_id, ...parties.owners], 'group_updated', payload);
  // 🛵 عرض قائم لم يُقبل بعد → نعيد إرسال العرض المحدَّث لنفس السائق بنفس expires_at (المؤقت لا يتغيّر)
  if (g.status === 'confirmed' && g.driver_id && !g.driver_assigned_at && g.driver_offer_expires_at) {
    const exp = new Date(g.driver_offer_expires_at);
    if (exp.getTime() > Date.now()) {
      let stops = await loadStops(g.id);
      try { const r = await recomputeRoute(g.id, g.driver_id, pool, { persist: false }); if (r && r.length) stops = r; } catch { /* ignore */ }
      notifyUser(io, g.driver_id, 'new_order_request', offerPayload(g, stops, exp.toISOString(), { updated: true }));
    }
  }
  try {
    await notify(io, g.customer_id, '🙏 تحديث على طلبك المجمّع', `مطعم ${rname} اعتذر، كمّلنا طلبك من باقي المطاعم`, 'group_updated',
      { group_id: String(g.id), order_id: String(child.id) });
    if (g.driver_id && g.driver_assigned_at) {
      S.pushTo(g.driver_id, '🔄 تحديث على الطلب المجمّع', `مطعم ${rname} ألغى طلبه — لا داعي للمرور عليه`,
        { type: 'group_updated', group_id: String(g.id), order_id: String(child.id) }, 'com.wasaly.driver');
    }
  } catch (e) { console.error('group update notify:', e.message); }

  if (g.driver_id && g.driver_assigned_at && ['picking_up', 'on_the_way'].includes(g.status)) {
    await recomputeRoute(g.id, g.driver_id).catch(() => {});
  }
  await emitGroupStatus(io, g, parties);
  if (g.status === 'on_the_way' && res.prevStatus === 'picking_up') {
    try { await Notify.orderOnTheWay(io, g.customer_id, parties.children.find(c => c.status !== 'cancelled')?.id); } catch { /* ignore */ }
  }
  if (g.status === 'pending') await maybeConfirmGroup(io, g.id);
  return res;
}

// ═══════════════════════════════════════════════════════════════
//  👀 العرض
// ═══════════════════════════════════════════════════════════════
function stopView(s) {
  return {
    order_id: s.order_id, order_number: s.order_number, restaurant_id: s.restaurant_id, name: s.name,
    lat: s.lat, lng: s.lng, phone: s.phone, address: s.address, logo: s.logo,
    sequence: s.sequence, status: s.status, status_label: S.STATUS_LABELS[s.status] || s.status, picked: s.picked,
  };
}

const MONEY_FIELDS = ['subtotal', 'base_fee', 'delivery_fee', 'extra_stops_fee', 'extra_stop_unit', 'driver_fee', 'discount', 'coupon_discount',
  'first_order_discount', 'points_value', 'wallet_used', 'tip', 'total', 'cashback_given', 'distance_km'];

/**
 * @param viewer { id, role } — صلاحيات: admin / الزبون / السائق (معروض عليه أو مُسند) / صاحب مطعم أحد الأبناء (عرض محدود)
 */
async function loadGroupView(groupId, viewer) {
  if (!isIntId(groupId)) throw new HttpError(404, 'الطلب غير موجود');
  const { rows } = await pool.query(
    `SELECT g.*, cu.name AS customer_name, cu.phone AS customer_phone,
            du.name AS driver_name, du.phone AS driver_phone, d.vehicle_type, d.vehicle_plate,
            d.current_lat AS driver_lat, d.current_lng AS driver_lng
     FROM order_groups g LEFT JOIN users cu ON cu.id=g.customer_id
     LEFT JOIN users du ON du.id=g.driver_id LEFT JOIN drivers d ON d.user_id=g.driver_id
     WHERE g.id=$1`, [groupId]);
  const g = rows[0];
  if (!g) throw new HttpError(404, 'الطلب غير موجود');
  const { rows: kids } = await pool.query(
    `SELECT o.id, o.order_number, o.restaurant_id, o.status, o.stop_sequence, o.subtotal, o.total, o.notes,
            o.restaurant_accepted_at, o.picked_up_at, o.delivered_at, o.cancelled_at, o.cancel_reason, o.created_at,
            o.rating_restaurant, o.rating_driver, (rv.id IS NOT NULL) AS is_rated,
            r.name_ar AS restaurant_name, r.logo AS restaurant_logo, r.lat AS restaurant_lat, r.lng AS restaurant_lng,
            r.phone AS restaurant_phone, r.address AS restaurant_address, r.owner_id AS restaurant_owner_id,
            COALESCE(r.store_type, 'restaurant') AS store_type
     FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id
     LEFT JOIN reviews rv ON rv.order_id = o.id
     WHERE o.group_id=$1 ORDER BY (o.status='cancelled'), o.stop_sequence NULLS LAST, o.id`, [groupId]);

  const uid = String(viewer.id);
  const isAdmin = viewer.role === 'admin';
  const isCustomer = String(g.customer_id) === uid;
  const isDriver = g.driver_id && String(g.driver_id) === uid;
  const ownedKids = kids.filter(k => k.restaurant_owner_id && String(k.restaurant_owner_id) === uid);
  if (!isAdmin && !isCustomer && !isDriver && !ownedKids.length) throw new HttpError(403, 'غير مصرح بعرض هذا الطلب');

  const fullAccess = isAdmin || isCustomer || isDriver;
  const visibleKids = fullAccess ? kids : ownedKids;
  const itemIds = visibleKids.map(k => k.id);
  const { rows: items } = itemIds.length
    ? await pool.query('SELECT * FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id', [itemIds])
    : { rows: [] };
  if (g.driver_id && g.driver_assigned_at) {
    const f = await driverLoc.getLocation(g.driver_id);
    if (f) { g.driver_lat = f.lat; g.driver_lng = f.lng; }
  }
  const live = kids.filter(k => k.status !== 'cancelled');
  const childView = (k) => ({
    id: k.id, order_id: k.id, order_number: k.order_number, restaurant_id: k.restaurant_id, restaurant_name: k.restaurant_name,
    restaurant_logo: k.restaurant_logo, restaurant_lat: k.restaurant_lat === null ? null : num(k.restaurant_lat),
    restaurant_lng: k.restaurant_lng === null ? null : num(k.restaurant_lng), restaurant_phone: k.restaurant_phone,
    restaurant_address: k.restaurant_address, status: k.status, status_label: S.STATUS_LABELS[k.status] || k.status,
    stop_sequence: k.stop_sequence, subtotal: round2(num(k.subtotal)), notes: k.notes,
    restaurant_accepted_at: k.restaurant_accepted_at, picked_up_at: k.picked_up_at, delivered_at: k.delivered_at,
    cancelled_at: k.cancelled_at, cancel_reason: k.cancel_reason,
    // A-24: انسحب هذا المطعم بنفسه (أُلغي قبل/بدون إلغاء المجموعة) ≠ أُلغي مع إلغاء المجموعة كاملة
    withdrawn: k.status === 'cancelled' && (g.status !== 'cancelled' || g.cancelled_by === 'restaurant' || !g.cancelled_at || !k.cancelled_at
      || Math.abs(new Date(k.cancelled_at) - new Date(g.cancelled_at)) >= 5000),
    // C-13/C-21: حالة التقييم + نوع المتجر (نصوص شاشة التقييم)
    store_type: k.store_type, rating_restaurant: k.rating_restaurant, rating_driver: k.rating_driver, is_rated: !!k.is_rated,
    items: items.filter(i => i.order_id === k.id),
  });

  const base = {
    id: g.id, group_id: g.id, group_number: g.group_number, status: g.status, status_label: GROUP_STATUS_LABELS[g.status] || g.status,
    is_group: true, stops_total: live.length, picked_count: parseInt(g.picked_count) || 0,
    created_at: g.created_at, updated_at: g.updated_at, delivered_at: g.delivered_at, cancelled_at: g.cancelled_at, cancel_reason: g.cancel_reason,
    driver_id: g.driver_assigned_at ? g.driver_id : (isDriver || isAdmin ? g.driver_id : null),
    driver_assigned_at: g.driver_assigned_at,
    driver_name: g.driver_assigned_at ? g.driver_name : null, driver_phone: g.driver_assigned_at ? g.driver_phone : null,
  };
  if (!fullAccess) {
    // صاحب مطعم: طلباته فقط + ملخص المحطات الأخرى (بدون مال الزبون/عنوانه)
    return {
      ...base, view: 'restaurant',
      orders: ownedKids.map(childView),
      other_stops: kids.filter(k => !ownedKids.includes(k)).map(k => ({ order_id: k.id, restaurant_name: k.restaurant_name, status: k.status, stop_sequence: k.stop_sequence })),
    };
  }
  const out = { ...g };
  for (const f of MONEY_FIELDS) if (out[f] !== null && out[f] !== undefined) out[f] = round2(num(out[f]));
  Object.assign(out, base, {
    view: isAdmin ? 'admin' : isCustomer ? 'customer' : 'driver',
    driver_lat: g.driver_assigned_at && g.driver_lat !== null ? num(g.driver_lat) : null,
    driver_lng: g.driver_assigned_at && g.driver_lng !== null ? num(g.driver_lng) : null,
    vehicle_type: g.driver_assigned_at ? g.vehicle_type : null, vehicle_plate: g.driver_assigned_at ? g.vehicle_plate : null,
    cash_to_collect: cashToCollect(g),
    driver_earning: round2(num(g.driver_fee) + num(g.tip)),
    // C-13: السائق يُقيَّم مرة واحدة لكل طلب مجمّع
    driver_rated: kids.some(k => k.rating_driver !== null && k.rating_driver !== undefined),
    orders: kids.map(childView),
    stops: kids.filter(k => k.status !== 'cancelled').map(k => ({
      order_id: k.id, order_number: k.order_number, restaurant_id: k.restaurant_id, name: k.restaurant_name,
      lat: k.restaurant_lat === null ? null : num(k.restaurant_lat), lng: k.restaurant_lng === null ? null : num(k.restaurant_lng),
      phone: k.restaurant_phone, address: k.restaurant_address, logo: k.restaurant_logo,
      sequence: k.stop_sequence, status: k.status, status_label: S.STATUS_LABELS[k.status] || k.status, picked: !!k.picked_up_at,
    })),
    dropoff: { lat: num(g.delivery_lat), lng: num(g.delivery_lng), address: g.delivery_address || '' },
  });
  if (isDriver && !g.driver_assigned_at && g.driver_offer_expires_at) {
    const exp = new Date(g.driver_offer_expires_at);
    out.is_offer = true;
    out.offer_seconds = Math.max(0, Math.round((exp.getTime() - Date.now()) / 1000));
    out.expires_at = exp.toISOString();
    out.offer_id = `g${g.id}|${out.expires_at}`;
    out.server_now = new Date().toISOString();
    // D-18: نفس ترتيب العرض (أقرب جار من موقع السائق) بدل ترتيب الإنشاء
    try {
      const r = await recomputeRoute(g.id, g.driver_id, pool, { persist: false });
      const seq = new Map((r || []).map(s => [String(s.order_id), s.sequence]));
      if (seq.size) {
        out.stops = out.stops.map(s => ({ ...s, sequence: seq.get(String(s.order_id)) ?? s.sequence }))
          .sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99));
      }
    } catch { /* ignore */ }
  }
  if (!isAdmin && !isDriver) { delete out.driver_offer_expires_at; delete out.driver_earning; }
  if (isDriver && !isAdmin) { delete out.cashback_given; delete out.points_redeemed; delete out.benefits_refunded; delete out.referral_processed; delete out.points_credited; }
  return out;
}

async function listMyGroups(userId, { status, limit = 20, offset = 0 } = {}) {
  let where = 'g.customer_id=$1';
  if (status === 'active') where += ` AND g.status IN ('pending','confirmed','picking_up','on_the_way')`;
  else if (status === 'past') where += ` AND g.status IN ('delivered','cancelled')`;
  const { rows } = await pool.query(
    `SELECT g.id, g.group_number, g.status, g.subtotal, g.delivery_fee, g.extra_stops_fee, g.discount, g.points_value, g.wallet_used,
            g.tip, g.total, g.payment_method, g.payment_status, g.picked_count, g.stops_total, g.driver_id, g.driver_assigned_at,
            g.created_at, g.delivered_at, g.cancelled_at, g.delivery_address,
            COALESCE((SELECT json_agg(json_build_object('order_id', o.id, 'order_number', o.order_number, 'restaurant_id', o.restaurant_id,
                       'restaurant_name', r.name_ar, 'restaurant_logo', r.logo, 'status', o.status, 'stop_sequence', o.stop_sequence,
                       'subtotal', o.subtotal) ORDER BY o.stop_sequence NULLS LAST, o.id)
                      FROM orders o LEFT JOIN restaurants r ON r.id=o.restaurant_id WHERE o.group_id=g.id), '[]'::json) AS orders
     FROM order_groups g WHERE ${where}
     ORDER BY g.created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
  return rows.map(r => {
    const o = { ...r, is_group: true, status_label: GROUP_STATUS_LABELS[r.status] || r.status };
    for (const f of MONEY_FIELDS) if (o[f] !== null && o[f] !== undefined) o[f] = round2(num(o[f]));
    o.orders = (r.orders || []).map(c => ({ ...c, subtotal: round2(num(c.subtotal)), status_label: S.STATUS_LABELS[c.status] || c.status }));
    if (!o.driver_assigned_at) o.driver_id = null;
    return o;
  });
}

// السائق: عرض/مهمة مجمّعة حالية (لـ /drivers/me)
async function activeGroupForDriver(driverId) {
  const { rows } = await pool.query(
    `SELECT id FROM order_groups WHERE driver_id=$1 AND status IN ('confirmed','picking_up','on_the_way')
     ORDER BY (driver_assigned_at IS NULL) ASC, created_at DESC LIMIT 1`, [driverId]);
  if (!rows[0]) return null;
  try { return await loadGroupView(rows[0].id, { id: driverId, role: 'driver' }); } catch { return null; }
}

module.exports = {
  DEFAULT_CFG, GROUP_STATUS_LABELS, getMultiConfig, saveMultiConfig, publicConfig,
  priceGroup, groupQuoteView, createGroup,
  maybeConfirmGroup, dispatchGroup, recoverGroupDispatch, stopGroupDispatch, recomputeRoute,
  acceptGroup, rejectGroup, pickupChild, deliverGroup, cancelGroup, onChildCancelled,
  loadGroupView, listMyGroups, activeGroupForDriver, emitGroupStatus,
};
