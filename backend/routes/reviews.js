const router = require('express').Router();
const pool = require('../config/database');
const { serverError } = require('../utils/http');
const { auth, adminOnly, driverOnly } = require('../middleware/auth');

// D-26/R-30: ملخص كل التقييمات (لا آخر 100 فقط): المعدل + العدد + توزيع النجوم 1..5
async function summary(col, whereCol, id) {
  const { rows } = await pool.query(
    `SELECT ${col} AS stars, COUNT(*)::int AS c FROM reviews WHERE ${whereCol}=$1 AND ${col} BETWEEN 1 AND 5 GROUP BY 1`, [id]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0, sum = 0;
  for (const r of rows) { distribution[r.stars] = r.c; count += r.c; sum += r.stars * r.c; }
  return { distribution, count, avg_rating: count ? Math.round((sum / count) * 100) / 100 : 0 };
}

// تقييمات مطعم معيّن (تُستخدم في التطبيق وبوابة المطعم) — data = آخر 100 (كما كانت) + summary لكل التقييمات
router.get('/restaurant/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'المطعم غير موجود' });
    const { rows } = await pool.query(
      `SELECT r.id, r.restaurant_rating, r.driver_rating, r.comment, r.images, r.created_at,
              u.name as customer_name, u.avatar
       FROM reviews r JOIN users u ON r.customer_id = u.id
       WHERE r.restaurant_id = $1 AND r.restaurant_rating IS NOT NULL
       ORDER BY r.created_at DESC LIMIT 100`,
      [req.params.id]
    );
    const s = await summary('restaurant_rating', 'restaurant_id', req.params.id);
    res.json({ success: true, data: rows, summary: s, avg_rating: s.avg_rating, count: s.count, distribution: s.distribution });
  } catch (e) { serverError(res, e); }
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
    const s = await summary('driver_rating', 'driver_id', req.user.id);
    res.json({ success: true, data: rows, avg_rating: s.avg_rating, count: s.count, distribution: s.distribution, summary: s });
  } catch (e) { serverError(res, e); }
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
  } catch (e) { serverError(res, e); }
});

module.exports = router;
