const router = require('express').Router();
const pool = require('../config/database');

router.get('/', async (req, res) => {
  try {
    const { q, lat, lng, type = 'all' } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Query required' });

    const results = {};

    if (type === 'all' || type === 'restaurants') {
      const { rows } = await pool.query(
        `SELECT id, name_ar, name_en, logo, rating, delivery_time_min, delivery_fee, 'restaurant' as type FROM restaurants
         WHERE is_active=true AND (name_ar ILIKE $1 OR name_en ILIKE $1 OR tags::text ILIKE $1) LIMIT 10`,
        [`%${q}%`]
      );
      results.restaurants = rows;
    }

    if (type === 'all' || type === 'items') {
      const { rows } = await pool.query(
        `SELECT mi.id, mi.name_ar, mi.name_en, mi.image, mi.price, mi.discount_price, r.name_ar as restaurant_name, r.id as restaurant_id, 'item' as type
         FROM menu_items mi JOIN restaurants r ON mi.restaurant_id=r.id
         WHERE mi.is_available=true AND r.is_active=true AND (mi.name_ar ILIKE $1 OR mi.name_en ILIKE $1) LIMIT 10`,
        [`%${q}%`]
      );
      results.items = rows;
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
    res.status(500).json({ success: false, message: e.message });
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
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
