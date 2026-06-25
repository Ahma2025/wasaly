const router = require('express').Router();
const pool = require('../config/database');
const { auth, restaurantOnly } = require('../middleware/auth');

// Add menu category
router.post('/categories', auth, restaurantOnly, async (req, res) => {
  try {
    const { restaurant_id, name_ar, name_en, sort_order } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO menu_categories (restaurant_id, name_ar, name_en, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [restaurant_id, name_ar, name_en, sort_order]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Update menu category
router.put('/categories/:id', auth, restaurantOnly, async (req, res) => {
  try {
    const { name_ar, name_en, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      'UPDATE menu_categories SET name_ar=$1, name_en=$2, sort_order=$3, is_active=$4 WHERE id=$5 RETURNING *',
      [name_ar, name_en, sort_order, is_active, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Add menu item
router.post('/items', auth, restaurantOnly, async (req, res) => {
  try {
    const { restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Update menu item
router.put('/items/:id', auth, restaurantOnly, async (req, res) => {
  try {
    const fields = ['name_ar','name_en','description_ar','description_en','image','price','discount_price','calories','is_available','is_featured','is_spicy','is_vegetarian','is_vegan','sort_order','category_id'];
    const updates = []; const values = []; let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${idx++}`); values.push(req.body[f]); }
    }
    values.push(req.params.id);
    const { rows } = await pool.query(`UPDATE menu_items SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, values);
    res.json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Toggle item availability
router.patch('/items/:id/toggle', auth, restaurantOnly, async (req, res) => {
  const { rows } = await pool.query('UPDATE menu_items SET is_available = NOT is_available WHERE id=$1 RETURNING is_available', [req.params.id]);
  res.json({ success: true, is_available: rows[0].is_available });
});

// Delete item
router.delete('/items/:id', auth, restaurantOnly, async (req, res) => {
  await pool.query('DELETE FROM menu_items WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

// Add item option
router.post('/items/:id/options', auth, restaurantOnly, async (req, res) => {
  try {
    const { name_ar, name_en, type, is_required, max_selections, values } = req.body;
    const { rows: option } = await pool.query(
      'INSERT INTO item_options (item_id, name_ar, name_en, type, is_required, max_selections) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id, name_ar, name_en, type, is_required, max_selections]
    );
    for (const v of (values || [])) {
      await pool.query('INSERT INTO item_option_values (option_id, name_ar, name_en, extra_price) VALUES ($1,$2,$3,$4)', [option[0].id, v.name_ar, v.name_en, v.extra_price]);
    }
    res.status(201).json({ success: true, data: option[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
