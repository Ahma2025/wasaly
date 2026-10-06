const router = require('express').Router();
const pool = require('../config/database');
const { auth, optionalAuth, adminOnly, restaurantOnly } = require('../middleware/auth');
const { saveNotification, sendFCM, getUserTokens, notifyUser } = require('../utils/notifications');
const cache = require('../utils/cache');
const { serverError, intParam, clampInt, strParam } = require('../utils/http');
const { hebronRange } = require('../utils/time');
const storeTypes = require('../utils/storeTypes');
const { statusLabel } = require('../utils/orderService');

// ⏱️ مدد الكاش (ms) — قابلة للضبط بمتغيّرات البيئة
const LIST_TTL = Number(process.env.CACHE_RESTAURANTS_TTL_MS) || 45000;
const DETAIL_TTL = Number(process.env.CACHE_RESTAURANT_DETAIL_TTL_MS) || 45000;
const POPULAR_TTL = Number(process.env.CACHE_POPULAR_TTL_MS) || 10 * 60 * 1000;
const REST_ORDERS_TTL = Number(process.env.CACHE_RESTAURANT_ORDERS_TTL_MS) || 5000;

const round2s = (n) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2); // نفس شكل round(numeric,2) من Postgres (نص)
function haversine(aLat, aLng, bLat, bLng) { // نفس معادلة SQL القديمة
  const rad = Math.PI / 180;
  const s1 = Math.sin((bLat - aLat) * rad / 2), s2 = Math.sin((bLng - aLng) * rad / 2);
  return 6371 * 2 * Math.asin(Math.sqrt(s1 * s1 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * s2 * s2));
}
const getZones = () => cache.wrapVersioned(cache.V.catalog, 'zones', LIST_TTL, async () =>
  (await pool.query('SELECT min_km, max_km, price FROM delivery_zones WHERE is_active=true ORDER BY min_km')).rows);

// 🔒 الحقول الداخلية لا تظهر للعامة (إلا للإدارة أو صاحب المطعم نفسه)
const PRIVATE_FIELDS = ['owner_id', 'commission_rate', 'email'];
function publicView(row, user) {
  if (!row) return row;
  if (user && (user.role === 'admin' || String(row.owner_id) === String(user.id))) return row;
  const out = { ...row };
  for (const f of PRIVATE_FIELDS) delete out[f];
  return out;
}

// Get all restaurants (with filters)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const lat = strParam(req.query.lat), lng = strParam(req.query.lng);
    const search = strParam(req.query.search), sort = strParam(req.query.sort), city = strParam(req.query.city);
    const stFilter = storeTypes.parseFilter(strParam(req.query.store_type));
    // قسم غير معروف → قائمة فارغة (نفس سلوك التطابق التام القديم، بلا 400 للتطبيقات المنشورة)
    if (stFilter && stFilter.invalid) return res.json({ success: true, data: [] });
    const store_type = stFilter ? [...stFilter.values].sort().join(',') + (stFilter.includeNull ? '+null' : '') : '';
    const owner_id = intParam(req.query.owner_id), category_id = intParam(req.query.category_id);
    if (owner_id === null || category_id === null) return res.status(400).json({ success: false, message: 'قيمة غير صالحة في الطلب' });
    const safeLimit = clampInt(req.query.limit, 20, 1, 100);
    const safeOffset = clampInt(req.query.offset, 0, 0, 100000);
    const pLat = lat ? parseFloat(lat) : null;
    const pLng = lng ? parseFloat(lng) : null;
    const exactLat = Number.isFinite(pLat) && Math.abs(pLat) <= 90 ? pLat : null;
    const exactLng = Number.isFinite(pLng) && Math.abs(pLng) <= 180 ? pLng : null;
    const hasLoc = exactLat !== null && exactLng !== null;
    // ⚡️ كاش 45ث مفتاحه الاستعلام المطبَّع (الموقع مقرّب لخانتين ≈ 1كم). المسافة والرسوم تُعاد حسابها بالإحداثيات الدقيقة.
    const userLat = hasLoc ? Math.round(exactLat * 100) / 100 : null;
    const userLng = hasLoc ? Math.round(exactLng * 100) / 100 : null;
    const cacheKey = 'rlist:' + JSON.stringify([userLat, userLng, owner_id ?? '', category_id ?? '', city || '', search || '',
      store_type || '', sort || '', safeLimit, safeOffset]);
    const rows = await cache.wrapVersioned(cache.V.catalog, cacheKey, LIST_TTL, async () => {

    let query = `
      SELECT r.*, c.name_ar as category_name, c.icon as category_icon,
        CASE WHEN $1::float IS NOT NULL AND $2::float IS NOT NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL
          THEN round(CAST(
            6371 * 2 * ASIN(SQRT(
              POWER(SIN((RADIANS(r.lat) - RADIANS($1::float)) / 2), 2) +
              COS(RADIANS($1::float)) * COS(RADIANS(r.lat)) *
              POWER(SIN((RADIANS(r.lng) - RADIANS($2::float)) / 2), 2)
            ))
          AS numeric), 2)
          ELSE NULL END as distance_km,
        (SELECT array_agg(mc.name_ar) FROM menu_categories mc WHERE mc.restaurant_id = r.id) as menu_cats
      FROM restaurants r
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.is_active=true
    `;
    const params = [userLat, userLng];
    let paramIdx = 3;
    if (owner_id !== undefined) { query += ` AND r.owner_id = $${paramIdx++}`; params.push(owner_id); }
    if (category_id !== undefined) { query += ` AND r.category_id = $${paramIdx++}`; params.push(category_id); }
    if (city) { query += ` AND r.city = $${paramIdx++}`; params.push(city); }
    if (search) { query += ` AND (r.name_ar ILIKE $${paramIdx} OR r.name_en ILIKE $${paramIdx})`; params.push(`%${search}%`); paramIdx++; }
    if (stFilter) {
      query += ` AND (r.store_type = ANY($${paramIdx++}::text[])${stFilter.includeNull ? ' OR r.store_type IS NULL' : ''})`;
      params.push(stFilter.values);
    }
    else if (owner_id === undefined) { query += ` AND (r.store_type = 'restaurant' OR r.store_type IS NULL)`; }

    const orderMap = { rating: 'r.rating DESC', fastest: 'r.delivery_time_min ASC', nearest: 'distance_km ASC NULLS LAST', newest: 'r.created_at DESC' };
    query += ` ORDER BY r.is_featured DESC, ${orderMap[sort] || 'r.rating DESC'}`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(safeLimit, safeOffset);

      return (await pool.query(query, params)).rows;
    });
    // نسخة لكل طلب (لا نعدّل كائنات الكاش المشتركة) + مسافة دقيقة من موقع الزبون الفعلي
    const out = rows.map(r => {
      const o = { ...r };
      // القسم المطبَّع + market_type للتطبيقات القديمة (تصنّف شاشة الماركت به قبل التخمين من الاسم)
      const st = storeTypes.normalize(r.store_type) || 'restaurant';
      o.store_type = st;
      if (st !== 'restaurant' && !o.market_type) o.market_type = st === 'sweets' ? 'bakery' : st;
      if (hasLoc && r.lat !== null && r.lat !== undefined && r.lng !== null && r.lng !== undefined) {
        o.distance_km = round2s(haversine(exactLat, exactLng, parseFloat(r.lat), parseFloat(r.lng)));
      }
      return o;
    });
    if (hasLoc && sort === 'nearest') {
      out.sort((a, b) => (b.is_featured === true) - (a.is_featured === true)
        || ((a.distance_km == null) - (b.distance_km == null)) || (parseFloat(a.distance_km) - parseFloat(b.distance_km)));
    }
    // رسوم التوصيل المعروضة = نفس رسوم المنطقة التي يُحاسَب بها فعلاً (حين يرسل التطبيق موقع الزبون)
    if (hasLoc) {
      const zones = await getZones();
      if (zones.length) {
        const maxPrice = Math.max(...zones.map(z => parseFloat(z.price) || 0));
        for (const r of out) {
          if (r.distance_km === null || r.distance_km === undefined) continue;
          const d = parseFloat(r.distance_km);
          const z = zones.find(x => parseFloat(x.min_km) <= d && d < parseFloat(x.max_km));
          r.restaurant_delivery_fee = r.delivery_fee;
          r.delivery_fee = z ? (parseFloat(z.price) || 0) : maxPrice;
        }
      }
    }
    res.json({ success: true, data: out.map(r => publicView(r, req.user)) });
  } catch (e) { serverError(res, e, 'GET /restaurants'); }
});

// ⚠️ المسارات الثابتة قبل /:id (كانت محجوبة وترجع 500)
router.get('/featured/list', optionalAuth, async (req, res) => {
  try {
    const rows = await cache.wrapVersioned(cache.V.catalog, 'rfeatured', LIST_TTL, async () =>
      (await pool.query('SELECT * FROM restaurants WHERE is_featured=true AND is_active=true LIMIT 10')).rows);
    res.json({ success: true, data: rows.map(r => publicView(r, req.user)) });
  } catch (e) { serverError(res, e); }
});

router.get('/top/rated', optionalAuth, async (req, res) => {
  try {
    const rows = await cache.wrapVersioned(cache.V.catalog, 'rtop', LIST_TTL, async () =>
      (await pool.query('SELECT * FROM restaurants WHERE is_active=true ORDER BY rating DESC LIMIT 20')).rows);
    res.json({ success: true, data: rows.map(r => publicView(r, req.user)) });
  } catch (e) { serverError(res, e); }
});

// Get single restaurant (public menu: active categories + available items only)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    const data = await cache.wrapVersioned(cache.V.catalog, `rdetail:${req.params.id}`, DETAIL_TTL, () => loadRestaurantDetail(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    // C-07: حالة المفضلة لكل مستخدم — خارج الكاش المشترك (null للزائر)
    let isFavorite = null;
    if (req.user) {
      try {
        const { rows: fv } = await pool.query('SELECT 1 FROM favorites WHERE user_id=$1 AND restaurant_id=$2 LIMIT 1', [req.user.id, req.params.id]);
        isFavorite = fv.length > 0;
      } catch { isFavorite = null; }
    }
    res.json({ success: true, data: { ...publicView(data.restaurant, req.user), is_favorite: isFavorite, hours: data.hours, menu: data.menu } });
  } catch (e) { serverError(res, e, 'GET /restaurants/:id'); }
});

// الأصناف الأكثر طلباً — تجميعة مكلفة نسبياً → كاش طويل (10 دقائق) مستقل عن كاش المنيو
async function popularItemIds(restaurantId) {
  try {
    const ids = await cache.wrap(`rpopular:${restaurantId}`, POPULAR_TTL, async () => {
      const { rows: top } = await pool.query(
        `SELECT oi.menu_item_id AS id, SUM(oi.quantity) AS q
         FROM order_items oi JOIN orders o ON oi.order_id = o.id
         WHERE o.restaurant_id = $1 AND oi.menu_item_id IS NOT NULL
         GROUP BY oi.menu_item_id ORDER BY q DESC LIMIT 3`, [restaurantId]);
      return top.map(t => String(t.id));
    });
    return new Set(ids || []);
  } catch { return new Set(); } // non-fatal
}

async function loadRestaurantDetail(id) {
  const { rows } = await pool.query(
    `SELECT r.*, c.name_ar as category_name FROM restaurants r
     LEFT JOIN categories c ON r.category_id = c.id WHERE r.id=$1`, [id]);
  if (!rows[0]) return null;
  const [{ rows: hours }, { rows: menuCategories }, { rows: items }, topIds] = await Promise.all([
    pool.query('SELECT * FROM restaurant_hours WHERE restaurant_id=$1 ORDER BY day_of_week', [id]),
    pool.query('SELECT * FROM menu_categories WHERE restaurant_id=$1 AND is_active=true ORDER BY sort_order, id', [id]),
    pool.query('SELECT * FROM menu_items WHERE restaurant_id=$1 AND is_available=true ORDER BY sort_order, id', [id]),
    popularItemIds(id),
  ]);
  const itemIds = items.map(i => i.id);
  const { rows: options } = itemIds.length
    ? await pool.query('SELECT * FROM item_options WHERE item_id = ANY($1::int[]) ORDER BY id', [itemIds]) : { rows: [] };
  const optIds = options.map(o => o.id);
  const { rows: values } = optIds.length
    ? await pool.query('SELECT * FROM item_option_values WHERE option_id = ANY($1::int[]) ORDER BY id', [optIds]) : { rows: [] };
  // تجميع O(n) بالخرائط بدل filter داخل حلقة
  const valsByOpt = new Map(), optsByItem = new Map(), itemsByCat = new Map();
  for (const v of values) { const k = String(v.option_id); if (!valsByOpt.has(k)) valsByOpt.set(k, []); valsByOpt.get(k).push(v); }
  for (const o of options) { o.values = valsByOpt.get(String(o.id)) || []; const k = String(o.item_id); if (!optsByItem.has(k)) optsByItem.set(k, []); optsByItem.get(k).push(o); }
  for (const it of items) {
    it.options = optsByItem.get(String(it.id)) || [];
    if (topIds.has(String(it.id))) it.is_popular = true;
    const k = String(it.category_id); if (!itemsByCat.has(k)) itemsByCat.set(k, []); itemsByCat.get(k).push(it);
  }
  for (const cat of menuCategories) cat.items = itemsByCat.get(String(cat.id)) || [];
  return { restaurant: rows[0], hours, menu: menuCategories };
}

// Create restaurant (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO restaurants (name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max]);
    await cache.invalidateCatalog();
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { serverError(res, e); }
});

async function ownsRestaurant(req) {
  if (req.user.role === 'admin') return true;
  const { rows } = await pool.query('SELECT id FROM restaurants WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
  return !!rows[0];
}
const deny = (res) => res.status(403).json({ success: false, message: 'غير مصرح' });

// Update restaurant
router.put('/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const allowed = ['name_ar', 'name_en', 'description_ar', 'description_en', 'phone', 'address', 'min_order', 'delivery_fee', 'delivery_time_min', 'delivery_time_max', 'is_open', 'opens_at', 'closes_at', 'tags', 'lat', 'lng', 'logo', 'cover_image'];
    const updates = []; const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let v = req.body[key];
        if (['min_order', 'delivery_fee'].includes(key)) {
          // R-07: حقل فارغ ("بدون حد أدنى") = 0 بدل رفض كل الإعدادات
          if (v === null || v === '') v = 0;
          if (isNaN(parseFloat(v)) || parseFloat(v) < 0) {
            return res.status(400).json({ success: false, field: key, message: key === 'min_order' ? 'الحد الأدنى للطلب غير صحيح' : 'رسوم التوصيل غير صحيحة' });
          }
          v = parseFloat(v);
        }
        values.push(v); updates.push(`${key}=$${values.length}`);
      }
    }
    updates.push('updated_at=NOW()');
    values.push(req.params.id);
    const { rows } = await pool.query(`UPDATE restaurants SET ${updates.join(',')} WHERE id=$${values.length} RETURNING *`, values);
    await cache.invalidateCatalog();
    res.json({ success: true, data: rows[0] });
  } catch (e) { serverError(res, e); }
});

// Toggle restaurant open/close
router.patch('/:id/toggle', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const { rows } = await pool.query('UPDATE restaurants SET is_open = NOT is_open WHERE id=$1 RETURNING is_open', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'المطعم غير موجود' });
    await cache.invalidateCatalog();
    res.json({ success: true, is_open: rows[0].is_open });
  } catch (e) { serverError(res, e); }
});

// Get restaurant orders (owner) — طلبات البطاقة غير المدفوعة لا تظهر حتى يتأكد الدفع
router.get('/:id/orders', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const status = strParam(req.query.status);
    const safeLimit = clampInt(req.query.limit, 20, 1, 100);
    const safeOffset = clampInt(req.query.offset, 0, 0, 100000);
    const statuses = status ? status.split(',').map(x => x.trim()).filter(Boolean).sort() : [];
    // R-18: ?sort=oldest → الأقدم أولاً (FIFO للوحة الطلبات النشطة)
    const asc = ['oldest', 'asc'].includes(String(req.query.sort || '').toLowerCase());
    // ⚡️ التطبيق يسأل كل 20 ثانية: كاش 5ث لكل مطعم+فلتر، ويُبطَل فوراً عند أي تغيير على طلبات هذا المطعم
    const rid = String(req.params.id);
    const key = `rorders:${rid}:${statuses.join(',')}:${safeLimit}:${safeOffset}:${asc ? 'a' : 'd'}`;
    const rows = await cache.wrapVersioned(cache.V.restOrders(rid), key, REST_ORDERS_TTL, async () => {
    // 🧺 ابن طلب مجمّع: group_id/stop_sequence (من o.*) + group_number + group_stops_count + is_group لتمييز البطاقة
    let q = `SELECT o.*, u.name as customer_name, u.phone as customer_phone,
             g.group_number, g.stops_total AS group_stops_count, (o.group_id IS NOT NULL) AS is_group FROM orders o
             LEFT JOIN users u ON o.customer_id = u.id
             LEFT JOIN order_groups g ON g.id = o.group_id WHERE o.restaurant_id=$1
             AND NOT (o.payment_method='card' AND COALESCE(o.payment_status,'pending') <> 'paid' AND o.status='pending' AND COALESCE(o.total,0) > 0)`;
    const params = [req.params.id];
    if (statuses.length) { params.push(statuses); q += ` AND o.status = ANY($${params.length}::text[])`; }
    q += ` ORDER BY o.created_at ${asc ? 'ASC' : 'DESC'}, o.id ${asc ? 'ASC' : 'DESC'} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(safeLimit, safeOffset);
      return (await pool.query(q, params)).rows;
    });
    // نسخ لكل طلب (لا نعدّل كائنات الكاش المشتركة)
    const isAdmin = req.user.role === 'admin';
    res.json({ success: true, data: rows.map((r) => {
      const o = { ...r };
      delete o.payment_ref_history;
      o.status_label = statusLabel(o);
      // X-03: سائق معروض عليه لم يقبل ≠ سائق الطلب
      o.driver_offer_pending = !o.driver_assigned_at && !!o.driver_id;
      if (!o.driver_assigned_at) o.driver_id = null;
      // X-06: ابن طلب مجمّع — إكرامية/أجرة السائق للمجموعة لا تظهر على فاتورة هذا المطعم؛ المجموع = أصنافه فقط
      if (o.group_id && !isAdmin) {
        o.tip = 0; o.driver_fee = 0; o.delivery_fee = 0;
        o.total = Math.round(parseFloat(o.subtotal || 0) * 100) / 100;
        o.group_payment_note = 'الدفع على الطلب المجمّع (يحصّله السائق)';
        o.total_label = 'قيمة أصناف هذا المطعم';
      }
      return o;
    }) });
  } catch (e) { serverError(res, e); }
});

// Restaurant stats — ملكية إلزامية؛ الإيراد = subtotal (بدون رسوم التوصيل/البقشيش)؛ "اليوم" بتوقيت فلسطين
router.get('/:id/stats', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const id = req.params.id;
    const LOCAL = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron')`;
    const today = hebronRange('day');
    const [sales, topItems, orders, todayQ] = await Promise.all([
      pool.query(`SELECT to_char(${LOCAL}, 'YYYY-MM-DD') as date, SUM(subtotal) as revenue, COUNT(*) as count
                  FROM orders WHERE restaurant_id=$1 AND status='delivered' AND created_at > NOW()-INTERVAL '30 days'
                  GROUP BY 1 ORDER BY date`, [id]),
      pool.query(`SELECT oi.name_ar, SUM(oi.quantity) as sold FROM order_items oi
                  JOIN orders o ON oi.order_id=o.id WHERE o.restaurant_id=$1 AND o.status='delivered'
                  GROUP BY oi.name_ar ORDER BY sold DESC LIMIT 5`, [id]),
      pool.query(`SELECT status, COUNT(*) FROM orders WHERE restaurant_id=$1 GROUP BY status`, [id]),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status <> 'cancelled') AS today_orders,
                         COALESCE(SUM(subtotal) FILTER (WHERE status <> 'cancelled'), 0) AS today_revenue,
                         COUNT(*) FILTER (WHERE status = 'delivered') AS today_delivered_orders,
                         COALESCE(SUM(subtotal) FILTER (WHERE status = 'delivered'), 0) AS today_delivered_revenue
                  FROM orders WHERE restaurant_id=$1 AND created_at >= $2::timestamp AND created_at < $3::timestamp`, [id, today.start, today.end]),
    ]);
    res.json({ success: true, data: {
      sales: sales.rows, topItems: topItems.rows, ordersByStatus: orders.rows,
      today_orders: parseInt(todayQ.rows[0]?.today_orders || 0),
      today_revenue: Math.round(parseFloat(todayQ.rows[0]?.today_revenue || 0) * 100) / 100,
      // R-20: today_* = كل الطلبات غير الملغاة (تشمل الجارية)؛ today_delivered_* = المُسلّمة فقط (مثل الرسمة والأسبوع)
      today_delivered_orders: parseInt(todayQ.rows[0]?.today_delivered_orders || 0),
      today_delivered_revenue: Math.round(parseFloat(todayQ.rows[0]?.today_delivered_revenue || 0) * 100) / 100,
      revenue_basis: 'subtotal',
    } });
  } catch (e) { serverError(res, e); }
});

// ===== الزبائن المميزون (VIP) =====
router.get('/:id/customers', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.phone, COUNT(o.id) AS orders,
              EXISTS(SELECT 1 FROM vip_customers v WHERE v.restaurant_id=$1::text AND v.customer_id=u.id::text) AS is_vip
       FROM orders o JOIN users u ON o.customer_id = u.id
       WHERE o.restaurant_id=$1
       GROUP BY u.id, u.name, u.phone
       ORDER BY orders DESC LIMIT 200`, [req.params.id]);
    res.json({ success: true, data: rows });
  } catch (e) { serverError(res, e); }
});

// إضافة زبون كمميز — يجب أن يكون زبوناً طلب من هذا المطعم فعلاً
router.post('/:id/vip', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const { customer_id } = req.body;
    if (!customer_id || !/^\d+$/.test(String(customer_id))) return res.status(400).json({ success: false, message: 'الزبون مطلوب' });
    const { rows: ok } = await pool.query(
      `SELECT 1 FROM orders o JOIN users u ON u.id=o.customer_id
       WHERE o.restaurant_id=$1 AND o.customer_id=$2 AND u.role='customer' LIMIT 1`, [req.params.id, customer_id]);
    if (!ok[0]) return res.status(400).json({ success: false, message: 'هذا المستخدم لم يطلب من مطعمك' });
    await pool.query(
      'INSERT INTO vip_customers (restaurant_id, customer_id) VALUES ($1,$2) ON CONFLICT (restaurant_id, customer_id) DO NOTHING',
      [String(req.params.id), String(customer_id)]);
    try {
      const { rows: rst } = await pool.query('SELECT name_ar FROM restaurants WHERE id=$1', [req.params.id]);
      const msg = `🌟 تمت إضافتك كزبون مميز في ${rst[0]?.name_ar || 'المطعم'}! استمتع بمعاملة خاصة.`;
      saveNotification(customer_id, msg, 'vip', { restaurant_id: req.params.id });
      notifyUser(req.io, customer_id, 'vip', { restaurant_id: req.params.id });
      try { const t = await getUserTokens(customer_id); if (t.length) await sendFCM(t, '🌟 زبون مميز!', msg, { type: 'vip', restaurant_id: String(req.params.id) }, 'com.wasaly.customer'); } catch { /* ignore */ }
    } catch (e) { console.error('vip notify:', e.message); }
    res.json({ success: true });
  } catch (e) { serverError(res, e); }
});

router.delete('/:id/vip/:customerId', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    await pool.query('DELETE FROM vip_customers WHERE restaurant_id=$1 AND customer_id=$2', [String(req.params.id), String(req.params.customerId)]);
    res.json({ success: true });
  } catch (e) { serverError(res, e); }
});

module.exports = router;
