const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM categories WHERE is_active=true ORDER BY sort_order');
  res.json({ success: true, data: rows });
});

router.post('/', auth, adminOnly, async (req, res) => {
  const { name_ar, name_en, icon, image, sort_order } = req.body;
  const { rows } = await pool.query('INSERT INTO categories (name_ar, name_en, icon, image, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name_ar, name_en, icon, image, sort_order]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const { name_ar, name_en, icon, image, sort_order, is_active } = req.body;
  const { rows } = await pool.query('UPDATE categories SET name_ar=$1,name_en=$2,icon=$3,image=$4,sort_order=$5,is_active=$6 WHERE id=$7 RETURNING *', [name_ar, name_en, icon, image, sort_order, is_active, req.params.id]);
  res.json({ success: true, data: rows[0] });
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  await pool.query('UPDATE categories SET is_active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
