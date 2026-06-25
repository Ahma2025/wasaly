const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM banners WHERE is_active=true AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW()) ORDER BY sort_order`);
  res.json({ success: true, data: rows });
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { title_ar, title_en, image, link_type, link_value, sort_order, starts_at, ends_at } = req.body;
  const { rows } = await pool.query('INSERT INTO banners (title_ar, title_en, image, link_type, link_value, sort_order, starts_at, ends_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [title_ar, title_en, image, link_type, link_value, sort_order, starts_at, ends_at]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  await pool.query('DELETE FROM banners WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
