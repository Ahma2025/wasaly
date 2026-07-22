const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly, driverOnly } = require('../middleware/auth');

// تقييمات مطعم معيّن (تُستخدم في التطبيق وبوابة المطعم)
router.get('/restaurant/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.restaurant_rating, r.driver_rating, r.comment, r.images, r.created_at,
              u.name as customer_name, u.avatar
       FROM reviews r JOIN users u ON r.customer_id = u.id
       WHERE r.restaurant_id = $1 AND r.restaurant_rating IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// تقييمات السائق الحالي (تطبيق السائق)
router.get('/driver/me', auth, driverOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.driver_rating, r.comment, r.images, r.created_at,
              u.name as customer_name, rs.name_ar as restaurant_name
       FROM reviews r
       JOIN users u ON r.customer_id = u.id
       LEFT JOIN restaurants rs ON r.restaurant_id = rs.id
       WHERE r.driver_id = $1 AND r.driver_rating IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const { rows: agg } = await pool.query(
      `SELECT COALESCE(AVG(driver_rating),0) as avg_rating, COUNT(*) as count
       FROM reviews WHERE driver_id=$1 AND driver_rating IS NOT NULL`,
      [req.user.id]
    );
    res.json({ success: true, data: rows, avg_rating: parseFloat(agg[0]?.avg_rating || 0), count: parseInt(agg[0]?.count || 0) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// كل التقييمات (لوحة الإدارة)
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.restaurant_rating, r.driver_rating, r.comment, r.images, r.created_at,
              cu.name as customer_name,
              rs.name_ar as restaurant_name,
              dr.name as driver_name
       FROM reviews r
       JOIN users cu ON r.customer_id = cu.id
       LEFT JOIN restaurants rs ON r.restaurant_id = rs.id
       LEFT JOIN users dr ON r.driver_id = dr.id
       ORDER BY r.created_at DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
