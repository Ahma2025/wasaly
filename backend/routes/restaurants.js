const router = require('express').Router();
const pool = require('../config/database');
const { auth, optionalAuth, adminOnly, restaurantOnly } = require('../middleware/auth');
const { saveNotification, sendFCM, getUserTokens, notifyUser } = require('../utils/notifications');

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
    const { lat, lng, category_id, search, sort, city, owner_id } = req.query;
    const safeLimit = Math.min(parseInt(req.query.limit) || 20, 100);
    const safeOffset = Math.max(parseInt(req.query.offset) || 0, 0);
    const userLat = lat ? parseFloat(lat) : null;
    const userLng = lng ? parseFloat(lng) : null;

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
    const params = [Number.isFinite(userLat) ? userLat : null, Number.isFinite(userLng) ? userLng : null];
    let paramIdx = 3;
    if (owner_id) { query += ` AND r.owner_id = $${paramIdx++}`; params.push(owner_id); }
    if (category_id) { query += ` AND r.category_id = $${paramIdx++}`; params.push(category_id); }
    if (city) { query += ` AND r.city = $${paramIdx++}`; params.push(city); }
    if (search) { query += ` AND (r.name_ar ILIKE $${paramIdx} OR r.name_en ILIKE $${paramIdx})`; params.push(`%${search}%`); paramIdx++; }
    const { store_type } = req.query;
    if (store_type) { query += ` AND r.store_type = $${paramIdx++}`; params.push(store_type); }
    else if (!owner_id) { query += ` AND (r.store_type = 'restaurant' OR r.store_type IS NULL)`; }

    const orderMap = { rating: 'r.rating DESC', fastest: 'r.delivery_time_min ASC', nearest: 'distance_km ASC NULLS LAST', newest: 'r.created_at DESC' };
    query += ` ORDER BY r.is_featured DESC, ${orderMap[sort] || 'r.rating DESC'}`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(safeLimit, safeOffset);

    const { rows } = await pool.query(query, params);
    // رسوم التوصيل المعروضة = نفس رسوم المنطقة التي يُحاسَب بها فعلاً (حين يرسل التطبيق موقع الزبون)
    if (params[0] !== null && params[1] !== null) {
      const { rows: zones } = await pool.query('SELECT min_km, max_km, price FROM delivery_zones WHERE is_active=true ORDER BY min_km');
      if (zones.length) {
        const maxPrice = Math.max(...zones.map(z => parseFloat(z.price) || 0));
        for (const r of rows) {
          if (r.distance_km === null || r.distance_km === undefined) continue;
          const d = parseFloat(r.distance_km);
          const z = zones.find(x => parseFloat(x.min_km) <= d && d < parseFloat(x.max_km));
          r.restaurant_delivery_fee = r.delivery_fee;
          r.delivery_fee = z ? (parseFloat(z.price) || 0) : maxPrice;
        }
      }
    }
    res.json({ success: true, data: rows.map(r => publicView(r, req.user)) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// ⚠️ المسارات الثابتة قبل /:id (كانت محجوبة وترجع 500)
router.get('/featured/list', optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE is_featured=true AND is_active=true LIMIT 10');
    res.json({ success: true, data: rows.map(r => publicView(r, req.user)) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

router.get('/top/rated', optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE is_active=true ORDER BY rating DESC LIMIT 20');
    res.json({ success: true, data: rows.map(r => publicView(r, req.user)) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get single restaurant (public menu: active categories + available items only)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'Restaurant not found' });
    const { rows } = await pool.query(
      `SELECT r.*, c.name_ar as category_name FROM restaurants r
       LEFT JOIN categories c ON r.category_id = c.id WHERE r.id=$1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const { rows: hours } = await pool.query('SELECT * FROM restaurant_hours WHERE restaurant_id=$1 ORDER BY day_of_week', [req.params.id]);
    const { rows: menuCategories } = await pool.query(
      'SELECT * FROM menu_categories WHERE restaurant_id=$1 AND is_active=true ORDER BY sort_order, id', [req.params.id]);
    const { rows: items } = await pool.query(
      'SELECT * FROM menu_items WHERE restaurant_id=$1 AND is_available=true ORDER BY sort_order, id', [req.params.id]);
    const itemIds = items.map(i => i.id);
    const { rows: options } = itemIds.length
      ? await pool.query('SELECT * FROM item_options WHERE item_id = ANY($1::int[]) ORDER BY id', [itemIds]) : { rows: [] };
    const optIds = options.map(o => o.id);
    const { rows: values } = optIds.length
      ? await pool.query('SELECT * FROM item_option_values WHERE option_id = ANY($1::int[]) ORDER BY id', [optIds]) : { rows: [] };
    for (const o of options) o.values = values.filter(v => String(v.option_id) === String(o.id));
    for (const it of items) it.options = options.filter(o => String(o.item_id) === String(it.id));
    for (const cat of menuCategories) cat.items = items.filter(i => String(i.category_id) === String(cat.id));

    try {
      const { rows: top } = await pool.query(
        `SELECT oi.menu_item_id AS id, SUM(oi.quantity) AS q
         FROM order_items oi JOIN orders o ON oi.order_id = o.id
         WHERE o.restaurant_id = $1 AND oi.menu_item_id IS NOT NULL
         GROUP BY oi.menu_item_id ORDER BY q DESC LIMIT 3`, [req.params.id]);
      const topIds = new Set(top.map(t => String(t.id)));
      for (const it of items) if (topIds.has(String(it.id))) it.is_popular = true;
    } catch (e) { /* non-fatal */ }

    res.json({ success: true, data: { ...publicView(rows[0], req.user), hours, menu: menuCategories } });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Create restaurant (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO restaurants (name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
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
        if (['min_order', 'delivery_fee'].includes(key) && (isNaN(parseFloat(req.body[key])) || parseFloat(req.body[key]) < 0)) {
          return res.status(400).json({ success: false, message: 'قيمة غير صحيحة' });
        }
        values.push(req.body[key]); updates.push(`${key}=$${values.length}`);
      }
    }
    updates.push('updated_at=NOW()');
    values.push(req.params.id);
    const { rows } = await pool.query(`UPDATE restaurants SET ${updates.join(',')} WHERE id=$${values.length} RETURNING *`, values);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Toggle restaurant open/close
router.patch('/:id/toggle', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const { rows } = await pool.query('UPDATE restaurants SET is_open = NOT is_open WHERE id=$1 RETURNING is_open', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'المطعم غير موجود' });
    res.json({ success: true, is_open: rows[0].is_open });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get restaurant orders (owner) — طلبات البطاقة غير المدفوعة لا تظهر حتى يتأكد الدفع
router.get('/:id/orders', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const { status } = req.query;
    const safeLimit = Math.min(parseInt(req.query.limit) || 20, 100);
    const safeOffset = Math.max(parseInt(req.query.offset) || 0, 0);
    let q = `SELECT o.*, u.name as customer_name, u.phone as customer_phone FROM orders o
             LEFT JOIN users u ON o.customer_id = u.id WHERE o.restaurant_id=$1
             AND NOT (o.payment_method='card' AND COALESCE(o.payment_status,'pending') <> 'paid' AND o.status='pending' AND COALESCE(o.total,0) > 0)`;
    const params = [req.params.id];
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length) { params.push(statuses); q += ` AND o.status = ANY($${params.length}::text[])`; }
    }
    q += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(safeLimit, safeOffset);
    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Restaurant stats — ملكية إلزامية؛ الإيراد = subtotal (بدون رسوم التوصيل/البقشيش)؛ "اليوم" بتوقيت فلسطين
router.get('/:id/stats', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    const id = req.params.id;
    const LOCAL = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Hebron')`;
    const [sales, topItems, orders, today] = await Promise.all([
      pool.query(`SELECT to_char(${LOCAL}, 'YYYY-MM-DD') as date, SUM(subtotal) as revenue, COUNT(*) as count
                  FROM orders WHERE restaurant_id=$1 AND status='delivered' AND created_at > NOW()-INTERVAL '30 days'
                  GROUP BY 1 ORDER BY date`, [id]),
      pool.query(`SELECT oi.name_ar, SUM(oi.quantity) as sold FROM order_items oi
                  JOIN orders o ON oi.order_id=o.id WHERE o.restaurant_id=$1 AND o.status='delivered'
                  GROUP BY oi.name_ar ORDER BY sold DESC LIMIT 5`, [id]),
      pool.query(`SELECT status, COUNT(*) FROM orders WHERE restaurant_id=$1 GROUP BY status`, [id]),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status <> 'cancelled') AS today_orders,
                         COALESCE(SUM(subtotal) FILTER (WHERE status <> 'cancelled'), 0) AS today_revenue
                  FROM orders WHERE restaurant_id=$1 AND ${LOCAL}::date = (NOW() AT TIME ZONE 'Asia/Hebron')::date`, [id]),
    ]);
    res.json({ success: true, data: {
      sales: sales.rows, topItems: topItems.rows, ordersByStatus: orders.rows,
      today_orders: parseInt(today.rows[0]?.today_orders || 0),
      today_revenue: Math.round(parseFloat(today.rows[0]?.today_revenue || 0) * 100) / 100,
    } });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
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
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
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
      try { const t = await getUserTokens(customer_id); if (t.length) await sendFCM(t, '🌟 زبون مميز!', msg, { type: 'vip' }, 'com.wasaly.customer'); } catch { /* ignore */ }
    } catch (e) { console.error('vip notify:', e.message); }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id/vip/:customerId', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await ownsRestaurant(req))) return deny(res);
    await pool.query('DELETE FROM vip_customers WHERE restaurant_id=$1 AND customer_id=$2', [String(req.params.id), String(req.params.customerId)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
