const router = require('express').Router();
const pool = require('../config/database');
const { serverError } = require('../utils/http');
const storeTypes = require('../utils/storeTypes');

router.get('/', async (req, res) => {
  try {
    const { q, lat, lng, type = 'all' } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Query required' });

    const results = {};

    if (type === 'all' || type === 'restaurants') {
      const { rows } = await pool.query(
        // C-08: حالة الفتح، أقصى مدة، الغلاف ونوع المتجر (صيدلية/ماركت ليست "مطاعم") — المفتوحة أولاً
        `SELECT id, name_ar, name_en, logo, cover_image, rating, total_reviews, delivery_time_min, delivery_time_max, delivery_fee, is_open,
                COALESCE(store_type, 'restaurant') AS store_type, 'restaurant' as type FROM restaurants
         WHERE is_active=true AND (name_ar ILIKE $1 OR name_en ILIKE $1 OR tags::text ILIKE $1)
         ORDER BY is_open DESC, rating DESC NULLS LAST LIMIT 10`,
        [`%${q}%`]
      );
      results.restaurants = rows.map(r => ({ ...r, store_type: storeTypes.normalize(r.store_type) || 'restaurant', is_open: r.is_open === true }));
    }

    if (type === 'all' || type === 'items') {
      const { rows } = await pool.query(
        `SELECT mi.id, mi.name_ar, mi.name_en, mi.image, mi.price, mi.discount_price, mi.category_id, r.name_ar as restaurant_name, r.id as restaurant_id,
                r.logo AS restaurant_logo, r.is_open AS restaurant_is_open, COALESCE(r.store_type, 'restaurant') AS store_type, 'item' as type
         FROM menu_items mi JOIN restaurants r ON mi.restaurant_id=r.id
         WHERE mi.is_available=true AND r.is_active=true AND (mi.name_ar ILIKE $1 OR mi.name_en ILIKE $1)
         ORDER BY r.is_open DESC LIMIT 10`,
        [`%${q}%`]
      );
      results.items = rows.map(r => ({ ...r, store_type: storeTypes.normalize(r.store_type) || 'restaurant', restaurant_is_open: r.restaurant_is_open === true, is_open: r.restaurant_is_open === true }));
    }

    if (type === 'all' || type === 'categories') {
      const { rows } = await pool.query(
        'SELECT * FROM categories WHERE is_active=true AND (name_ar ILIKE $1 OR name_en ILIKE $1) LIMIT 5',
        [`%${q}%`]
      );
      results.categories = rows;
    }

    res.json({ success: true, data: results });
  } catch (e) {
    serverError(res, e);
  }
});

// Popular searches
router.get('/popular', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT name_ar, name_en FROM categories WHERE is_active=true ORDER BY RANDOM() LIMIT 8`
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    serverError(res, e);
  }
});

module.exports = router;
