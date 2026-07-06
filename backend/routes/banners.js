const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

// عام — فقط النشطة
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM banners WHERE is_active=true AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW()) ORDER BY sort_order`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// للإدمن — كل الإعلانات
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM banners ORDER BY sort_order, created_at DESC`);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// إضافة إعلان
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { title_ar, title_en, image, link_type, link_value, sort_order, starts_at, ends_at, is_active } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO banners (title_ar, title_en, image, link_type, link_value, sort_order, starts_at, ends_at, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title_ar, title_en, image, link_type, link_value, sort_order ?? 0, starts_at, ends_at, is_active ?? true]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// تفعيل/إيقاف
router.patch('/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_active FROM banners WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'not found' });
    const newVal = !rows[0].is_active;
    await pool.query('UPDATE banners SET is_active=$1 WHERE id=$2', [newVal, req.params.id]);
    res.json({ success: true, is_active: newVal });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// حذف
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM banners WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
