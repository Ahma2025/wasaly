const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly, restaurantOnly } = require('../middleware/auth');

// Get all restaurants (with filters)
router.get('/', async (req, res) => {
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
          ELSE NULL END as distance_km
      FROM restaurants r
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE r.is_active=true
    `;
    const params = [userLat, userLng];
    let paramIdx = 3;

    if (owner_id) { query += ` AND r.owner_id = $${paramIdx++}`; params.push(owner_id); }
    if (category_id) { query += ` AND r.category_id = $${paramIdx++}`; params.push(category_id); }
    if (city) { query += ` AND r.city = $${paramIdx++}`; params.push(city); }
    if (search) { query += ` AND (r.name_ar ILIKE $${paramIdx} OR r.name_en ILIKE $${paramIdx})`; params.push(`%${search}%`); paramIdx++; }
    // فلتر نوع المنشأة: مطاعم أو ماركت
    const { store_type } = req.query;
    if (store_type) { query += ` AND r.store_type = $${paramIdx++}`; params.push(store_type); }
    else if (!owner_id) { query += ` AND (r.store_type = 'restaurant' OR r.store_type IS NULL)`; }

    const orderMap = {
      rating: 'r.rating DESC',
      fastest: 'r.delivery_time_min ASC',
      nearest: 'distance_km ASC NULLS LAST',
      newest: 'r.created_at DESC'
    };
    query += ` ORDER BY r.is_featured DESC, ${orderMap[sort] || 'r.rating DESC'}`;
    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(safeLimit, safeOffset);

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get single restaurant
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, c.name_ar as category_name FROM restaurants r
       LEFT JOIN categories c ON r.category_id = c.id WHERE r.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const { rows: hours } = await pool.query('SELECT * FROM restaurant_hours WHERE restaurant_id=$1 ORDER BY day_of_week', [req.params.id]);
    const { rows: menuCategories } = await pool.query(
      'SELECT * FROM menu_categories WHERE restaurant_id=$1 AND is_active=true ORDER BY sort_order', [req.params.id]
    );

    for (const cat of menuCategories) {
      const { rows: items } = await pool.query(
        'SELECT * FROM menu_items WHERE category_id=$1 AND is_available=true ORDER BY sort_order', [cat.id]
      );
      for (const item of items) {
        const { rows: options } = await pool.query(
          `SELECT o.*, json_agg(v.*) as values FROM item_options o
           LEFT JOIN item_option_values v ON v.option_id = o.id
           WHERE o.item_id=$1 GROUP BY o.id`, [item.id]
        );
        item.options = options;
      }
      cat.items = items;
    }

    // 🔥 الأكثر طلباً — نعلّم أعلى 3 أصناف مبيعاً (غير قاتل لو فشل)
    try {
      const { rows: top } = await pool.query(
        `SELECT oi.menu_item_id AS id, SUM(oi.quantity) AS q
         FROM order_items oi JOIN orders o ON oi.order_id = o.id
         WHERE o.restaurant_id = $1 AND oi.menu_item_id IS NOT NULL
         GROUP BY oi.menu_item_id ORDER BY q DESC LIMIT 3`,
        [req.params.id]
      );
      const topIds = new Set(top.map(t => String(t.id)));
      for (const cat of menuCategories) {
        for (const item of (cat.items || [])) {
          if (topIds.has(String(item.id))) item.is_popular = true;
        }
      }
    } catch (e) { /* non-fatal */ }

    res.json({ success: true, data: { ...rows[0], hours, menu: menuCategories } });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get featured restaurants
router.get('/featured/list', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE is_featured=true AND is_active=true LIMIT 10');
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get top rated
router.get('/top/rated', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE is_active=true ORDER BY rating DESC LIMIT 20');
    res.json({ success: true, data: rows });
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
      [name_ar, name_en, description_ar, category_id, phone, email, address, lat, lng, city, owner_id, min_order, delivery_fee, delivery_time_min, delivery_time_max]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Update restaurant
router.put('/:id', auth, restaurantOnly, async (req, res) => {
  try {
    // Ownership check (admin can update any restaurant)
    if (req.user.role !== 'admin') {
      const { rows: own } = await pool.query('SELECT id FROM restaurants WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
      if (!own[0]) return res.status(403).json({ success: false, message: 'غير مصرح' });
    }
    const allowed = ['name_ar','name_en','description_ar','description_en','phone','address','min_order','delivery_fee','delivery_time_min','delivery_time_max','is_open','opens_at','closes_at','tags','lat','lng','logo'];
    const updates = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key}=$${idx++}`);
        values.push(req.body[key]);
      }
    }
    updates.push(`updated_at=NOW()`);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE restaurants SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, values
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Toggle restaurant open/close
router.patch('/:id/toggle', auth, restaurantOnly, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const { rows: own } = await pool.query('SELECT id FROM restaurants WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
      if (!own[0]) return res.status(403).json({ success: false, message: 'غير مصرح' });
    }
    const { rows } = await pool.query(
      'UPDATE restaurants SET is_open = NOT is_open WHERE id=$1 RETURNING is_open', [req.params.id]
    );
    res.json({ success: true, is_open: rows[0].is_open });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get restaurant orders (for restaurant owner)
router.get('/:id/orders', auth, restaurantOnly, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const { rows: own } = await pool.query('SELECT id FROM restaurants WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.id]);
      if (!own[0]) return res.status(403).json({ success: false, message: 'غير مصرح' });
    }
    const { status } = req.query;
    const safeLimit = Math.min(parseInt(req.query.limit) || 20, 100);
    const safeOffset = Math.max(parseInt(req.query.offset) || 0, 0);
    let q = `SELECT o.*, u.name as customer_name, u.phone as customer_phone FROM orders o
             LEFT JOIN users u ON o.customer_id = u.id WHERE o.restaurant_id=$1`;
    const params = [req.params.id];
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        q += ` AND o.status=$${params.length+1}`; params.push(statuses[0]);
      } else if (statuses.length > 1) {
        const placeholders = statuses.map((_, i) => `$${params.length + 1 + i}`).join(',');
        q += ` AND o.status IN (${placeholders})`; params.push(...statuses);
      }
    }
    q += ` ORDER BY o.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(safeLimit, safeOffset);

    const { rows } = await pool.query(q, params);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Restaurant stats
router.get('/:id/stats', auth, restaurantOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const [sales, topItems, orders] = await Promise.all([
      pool.query(`SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as count
                  FROM orders WHERE restaurant_id=$1 AND status='delivered' AND created_at > NOW()-INTERVAL '30 days'
                  GROUP BY DATE(created_at) ORDER BY date`, [id]),
      pool.query(`SELECT oi.name_ar, SUM(oi.quantity) as sold FROM order_items oi
                  JOIN orders o ON oi.order_id=o.id WHERE o.restaurant_id=$1 AND o.status='delivered'
                  GROUP BY oi.name_ar ORDER BY sold DESC LIMIT 5`, [id]),
      pool.query(`SELECT status, COUNT(*) FROM orders WHERE restaurant_id=$1 GROUP BY status`, [id])
    ]);
    res.json({ success: true, data: { sales: sales.rows, topItems: topItems.rows, ordersByStatus: orders.rows } });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

module.exports = router;
