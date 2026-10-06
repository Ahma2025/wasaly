const router = require('express').Router();
const pool = require('../config/database');
const { serverError } = require('../utils/http');
const { auth, adminOnly } = require('../middleware/auth');

// عام — فقط النشطة
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM banners WHERE is_active=true AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW()) ORDER BY sort_order`
    );
    res.json({ success: true, data: rows });
  } catch (e) { serverError(res, e); }
});

// للإدمن — كل الإعلانات
router.get('/all', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM banners ORDER BY sort_order, created_at DESC`);
    res.json({ success: true, data: rows });
  } catch (e) { serverError(res, e); }
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
  } catch (e) { serverError(res, e); }
});

// X-02: تعديل إعلان (رابط الضغط + فترة العرض) — تحديث جزئي
// link_type: none | store | restaurant | category | market | url  (link_value: id / store_type / رابط https)
const LINK_TYPES = ['none', 'store', 'restaurant', 'category', 'market', 'store_type', 'url', 'screen'];
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
    const b = req.body || {};
    if (b.link_type !== undefined && b.link_type !== null && !LINK_TYPES.includes(String(b.link_type))) {
      return res.status(400).json({ success: false, message: 'نوع الرابط غير معروف' });
    }
    const allowed = ['title_ar', 'title_en', 'image', 'link_type', 'link_value', 'sort_order', 'starts_at', 'ends_at', 'is_active'];
    const sets = [], vals = [];
    for (const k of allowed) if (b[k] !== undefined) { vals.push(b[k] === '' && ['starts_at', 'ends_at'].includes(k) ? null : b[k]); sets.push(`${k}=$${vals.length}`); }
    if (!sets.length) return res.status(400).json({ success: false, message: 'لا يوجد ما يُحدَّث' });
    vals.push(req.params.id);
    const { rows } = await pool.query(`UPDATE banners SET ${sets.join(', ')} WHERE id=$${vals.length} RETURNING *`, vals);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'الإعلان غير موجود' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { serverError(res, e); }
});

// تفعيل/إيقاف
router.patch('/:id/toggle', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT is_active FROM banners WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'not found' });
    // A-34: قيمة صريحة (value) تجعل النقر المزدوج idempotent
    const newVal = typeof (req.body || {}).value === 'boolean' ? req.body.value : !rows[0].is_active;
    await pool.query('UPDATE banners SET is_active=$1 WHERE id=$2', [newVal, req.params.id]);
    res.json({ success: true, is_active: newVal });
  } catch (e) { serverError(res, e); }
});

// حذف
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM banners WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { serverError(res, e); }
});

module.exports = router;
