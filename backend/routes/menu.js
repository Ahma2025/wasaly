const router = require('express').Router();
const pool = require('../config/database');
const { auth, restaurantOnly } = require('../middleware/auth');

// 🔒 فحص الملكية — يتأكد أن المورد يخص مطعم المستخدم الحالي (أو أنه إدارة)
async function owns(req, kind, id) {
  if (req.user && req.user.role === 'admin') return true;
  const sql = {
    restaurant: 'SELECT 1 FROM restaurants WHERE id=$1 AND owner_id=$2',
    category:   'SELECT 1 FROM menu_categories c JOIN restaurants r ON c.restaurant_id=r.id WHERE c.id=$1 AND r.owner_id=$2',
    item:       'SELECT 1 FROM menu_items i JOIN restaurants r ON i.restaurant_id=r.id WHERE i.id=$1 AND r.owner_id=$2',
    option:     'SELECT 1 FROM item_options o JOIN menu_items i ON o.item_id=i.id JOIN restaurants r ON i.restaurant_id=r.id WHERE o.id=$1 AND r.owner_id=$2',
  }[kind];
  if (!sql || id == null) return false;
  const { rows } = await pool.query(sql, [id, req.user.id]);
  return rows.length > 0;
}
const deny = (res) => res.status(403).json({ success: false, message: 'غير مصرح — هذا المطعم ليس لك' });

// Add menu category
router.post('/categories', auth, restaurantOnly, async (req, res) => {
  try {
    const { restaurant_id, name_ar, name_en, sort_order } = req.body;
    if (!(await owns(req, 'restaurant', restaurant_id))) return deny(res);
    const { rows } = await pool.query(
      'INSERT INTO menu_categories (restaurant_id, name_ar, name_en, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [restaurant_id, name_ar, name_en, sort_order]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Update menu category
router.put('/categories/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'category', req.params.id))) return deny(res);
    const { name_ar, name_en, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      'UPDATE menu_categories SET name_ar=$1, name_en=$2, sort_order=$3, is_active=$4 WHERE id=$5 RETURNING *',
      [name_ar, name_en, sort_order, is_active, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Delete category
router.delete('/categories/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'category', req.params.id))) return deny(res);
    await pool.query('DELETE FROM menu_items WHERE category_id=$1', [req.params.id]);
    await pool.query('DELETE FROM menu_categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Add menu item
router.post('/items', auth, restaurantOnly, async (req, res) => {
  try {
    const { restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time } = req.body;
    if (!(await owns(req, 'restaurant', restaurant_id))) return deny(res);
    const { rows } = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        restaurant_id, category_id, name_ar, name_en || null,
        description_ar || null, description_en || null,
        image || null, parseFloat(price) || 0,
        discount_price ? parseFloat(discount_price) : null,
        calories ? parseInt(calories) : null,
        is_spicy ? true : false, is_vegetarian ? true : false, is_vegan ? true : false,
        parseInt(preparation_time) || 15
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Update menu item
router.put('/items/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    const fields = ['name_ar','name_en','description_ar','description_en','image','price','discount_price','calories','is_available','is_featured','is_spicy','is_vegetarian','is_vegan','sort_order','category_id'];
    const updates = []; const values = []; let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f}=$${idx++}`); values.push(req.body[f]); }
    }
    if (!updates.length) return res.status(400).json({ success: false, message: 'لا يوجد ما يُحدَّث' });
    values.push(req.params.id);
    const { rows } = await pool.query(`UPDATE menu_items SET ${updates.join(',')} WHERE id=$${idx} RETURNING *`, values);
    res.json({ success: true, data: rows[0] });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Toggle item availability
router.patch('/items/:id/toggle', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    const { rows } = await pool.query('UPDATE menu_items SET is_available = NOT is_available WHERE id=$1 RETURNING is_available', [req.params.id]);
    res.json({ success: true, is_available: rows[0].is_available });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Delete item
router.delete('/items/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    await pool.query('DELETE FROM menu_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Add item option
router.post('/items/:id/options', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    const { name_ar, name_en, type, is_required, max_selections, values } = req.body;
    const { rows: option } = await pool.query(
      'INSERT INTO item_options (item_id, name_ar, name_en, type, is_required, max_selections) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id, name_ar || '', name_en || null, type || 'single', is_required ? true : false, max_selections || 1]
    );
    for (const v of (values || [])) {
      await pool.query(
        'INSERT INTO item_option_values (option_id, name_ar, name_en, extra_price) VALUES ($1,$2,$3,$4)',
        [option[0].id, v.name_ar || '', v.name_en || null, parseFloat(v.extra_price) || 0]
      );
    }
    res.status(201).json({ success: true, data: option[0] });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Get item options
router.get('/items/:id/options', auth, async (req, res) => {
  try {
    const { rows: options } = await pool.query('SELECT * FROM item_options WHERE item_id=$1', [req.params.id]);
    for (const opt of options) {
      const { rows: vals } = await pool.query('SELECT * FROM item_option_values WHERE option_id=$1', [opt.id]);
      opt.values = vals;
    }
    res.json({ success: true, data: options });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

// Delete item option
router.delete('/options/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'option', req.params.id))) return deny(res);
    await pool.query('DELETE FROM item_option_values WHERE option_id=$1', [req.params.id]);
    await pool.query('DELETE FROM item_options WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { console.error(e.message); res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' }); }
});

module.exports = router;
