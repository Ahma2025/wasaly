const router = require('express').Router();
const pool = require('../config/database');
const { auth, restaurantOnly } = require('../middleware/auth');
const cache = require('../utils/cache');
const { serverError } = require('../utils/http');

// ⚡️ أي تعديل ناجح على المنيو/الأقسام/الإضافات يُبطل كاش قائمة المطاعم وتفاصيلها فوراً
router.use(cache.invalidateOnWrite());

const isId = (v) => v !== undefined && v !== null && /^\d{1,10}$/.test(String(v));

// 🔒 فحص الملكية — يتأكد أن المورد يخص مطعم المستخدم الحالي (أو أنه إدارة)
async function owns(req, kind, id) {
  if (req.user && req.user.role === 'admin') return true;
  const sql = {
    restaurant: 'SELECT 1 FROM restaurants WHERE id=$1 AND owner_id=$2',
    category: 'SELECT 1 FROM menu_categories c JOIN restaurants r ON c.restaurant_id=r.id WHERE c.id=$1 AND r.owner_id=$2',
    item: 'SELECT 1 FROM menu_items i JOIN restaurants r ON i.restaurant_id=r.id WHERE i.id=$1 AND r.owner_id=$2',
    option: 'SELECT 1 FROM item_options o JOIN menu_items i ON o.item_id=i.id JOIN restaurants r ON i.restaurant_id=r.id WHERE o.id=$1 AND r.owner_id=$2',
    value: `SELECT 1 FROM item_option_values v JOIN item_options o ON v.option_id=o.id JOIN menu_items i ON o.item_id=i.id
            JOIN restaurants r ON i.restaurant_id=r.id WHERE v.id=$1 AND r.owner_id=$2`,
  }[kind];
  if (!sql || !isId(id)) return false;
  const { rows } = await pool.query(sql, [id, req.user.id]);
  return rows.length > 0;
}
const deny = (res) => res.status(403).json({ success: false, message: 'غير مصرح — هذا المطعم ليس لك' });
const fail = (res, e) => serverError(res, e);

// التحقق من الأسعار: غير سالبة، وسعر العرض أقل من السعر الأصلي
function validatePrices(price, discount) {
  if (price !== undefined && price !== null && price !== '') {
    const p = parseFloat(price);
    if (!Number.isFinite(p) || p < 0) return 'السعر غير صحيح';
  }
  if (discount !== undefined && discount !== null && discount !== '') {
    const d = parseFloat(discount);
    if (!Number.isFinite(d) || d < 0) return 'سعر العرض غير صحيح';
    if (price !== undefined && price !== null && price !== '' && d >= parseFloat(price)) return 'سعر العرض يجب أن يكون أقل من السعر الأصلي';
  }
  return null;
}
async function categoryBelongs(categoryId, restaurantId) {
  if (categoryId === undefined || categoryId === null || categoryId === '') return true;
  if (!isId(categoryId)) return false;
  const { rows } = await pool.query('SELECT 1 FROM menu_categories WHERE id=$1 AND restaurant_id=$2', [categoryId, restaurantId]);
  return rows.length > 0;
}
const isMultiType = (t) => ['multiple', 'multi', 'checkbox'].includes(String(t || '').toLowerCase());
function normalizeMax(type, maxSel, valuesCount) {
  const m = parseInt(maxSel);
  if (isMultiType(type)) return m > 1 ? m : Math.max(2, valuesCount || 2);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

// 📋 القائمة الكاملة لإدارة المطعم (تشمل الأصناف غير المتاحة والأقسام غير النشطة)
router.get('/restaurant/:id/manage', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'restaurant', req.params.id))) return deny(res);
    const rid = req.params.id;
    const { rows: cats } = await pool.query('SELECT * FROM menu_categories WHERE restaurant_id=$1 ORDER BY sort_order, id', [rid]);
    const { rows: items } = await pool.query('SELECT * FROM menu_items WHERE restaurant_id=$1 ORDER BY sort_order, id', [rid]);
    const itemIds = items.map(i => i.id);
    const { rows: opts } = itemIds.length ? await pool.query('SELECT * FROM item_options WHERE item_id = ANY($1::int[]) ORDER BY id', [itemIds]) : { rows: [] };
    const optIds = opts.map(o => o.id);
    const { rows: vals } = optIds.length ? await pool.query('SELECT * FROM item_option_values WHERE option_id = ANY($1::int[]) ORDER BY id', [optIds]) : { rows: [] };
    for (const o of opts) o.values = vals.filter(v => String(v.option_id) === String(o.id));
    for (const i of items) i.options = opts.filter(o => String(o.item_id) === String(i.id));
    const data = cats.map(c => ({ ...c, items: items.filter(i => String(i.category_id) === String(c.id)) }));
    const orphan = items.filter(i => !cats.some(c => String(c.id) === String(i.category_id)));
    // R-24: is_orphan + key ثابت — ليس قسماً حقيقياً (لا تعديل/حذف/إضافة عليه)
    if (orphan.length) data.push({ id: null, key: 'orphan', is_orphan: true, restaurant_id: Number(rid), name_ar: 'بدون قسم', name_en: 'Uncategorized', is_active: true, items: orphan });
    res.json({ success: true, data });
  } catch (e) { fail(res, e); }
});

// Add menu category
router.post('/categories', auth, restaurantOnly, async (req, res) => {
  try {
    const { restaurant_id, name_ar, name_en, sort_order } = req.body;
    if (!(await owns(req, 'restaurant', restaurant_id))) return deny(res);
    if (!name_ar) return res.status(400).json({ success: false, message: 'اسم القسم مطلوب' });
    const { rows } = await pool.query(
      'INSERT INTO menu_categories (restaurant_id, name_ar, name_en, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [restaurant_id, name_ar, name_en || null, parseInt(sort_order) || 0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { fail(res, e); }
});

// Update menu category (partial)
router.put('/categories/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'category', req.params.id))) return deny(res);
    const { name_ar, name_en, sort_order, is_active } = req.body;
    const { rows } = await pool.query(
      `UPDATE menu_categories SET name_ar=COALESCE($1,name_ar), name_en=COALESCE($2,name_en),
         sort_order=COALESCE($3,sort_order), is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *`,
      [name_ar ?? null, name_en ?? null, sort_order ?? null, is_active === undefined ? null : !!is_active, req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (e) { fail(res, e); }
});

// Delete category (and its items + their options)
router.delete('/categories/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'category', req.params.id))) return deny(res);
    await pool.query(`DELETE FROM item_option_values WHERE option_id IN (SELECT o.id FROM item_options o JOIN menu_items i ON o.item_id=i.id WHERE i.category_id=$1)`, [req.params.id]);
    await pool.query(`DELETE FROM item_options WHERE item_id IN (SELECT id FROM menu_items WHERE category_id=$1)`, [req.params.id]);
    await pool.query('DELETE FROM menu_items WHERE category_id=$1', [req.params.id]);
    await pool.query('DELETE FROM menu_categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

// Add menu item
router.post('/items', auth, restaurantOnly, async (req, res) => {
  try {
    const { restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time } = req.body;
    if (!(await owns(req, 'restaurant', restaurant_id))) return deny(res);
    if (!name_ar) return res.status(400).json({ success: false, message: 'اسم الصنف مطلوب' });
    const pErr = validatePrices(price ?? 0, discount_price);
    if (pErr) return res.status(400).json({ success: false, message: pErr });
    if (!(await categoryBelongs(category_id, restaurant_id))) return res.status(400).json({ success: false, message: 'القسم لا يتبع هذا المطعم' });
    const { rows } = await pool.query(
      `INSERT INTO menu_items (restaurant_id, category_id, name_ar, name_en, description_ar, description_en, image, price, discount_price, calories, is_spicy, is_vegetarian, is_vegan, preparation_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [restaurant_id, category_id || null, name_ar, name_en || null, description_ar || null, description_en || null,
       image || null, parseFloat(price) || 0, discount_price ? parseFloat(discount_price) : null,
       calories ? parseInt(calories) : null, !!is_spicy, !!is_vegetarian, !!is_vegan, parseInt(preparation_time) || 15]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { fail(res, e); }
});

// Update menu item
router.put('/items/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    const { rows: cur } = await pool.query('SELECT restaurant_id, price, discount_price FROM menu_items WHERE id=$1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ success: false, message: 'الصنف غير موجود' });
    const newPrice = req.body.price !== undefined ? req.body.price : cur[0].price;
    const newDisc = req.body.discount_price !== undefined ? req.body.discount_price : cur[0].discount_price;
    const pErr = validatePrices(newPrice, newDisc);
    if (pErr) return res.status(400).json({ success: false, message: pErr });
    if (req.body.category_id !== undefined && !(await categoryBelongs(req.body.category_id, cur[0].restaurant_id))) {
      return res.status(400).json({ success: false, message: 'القسم لا يتبع هذا المطعم' });
    }
    const fields = ['name_ar', 'name_en', 'description_ar', 'description_en', 'image', 'price', 'discount_price', 'calories', 'is_available', 'is_featured', 'is_spicy', 'is_vegetarian', 'is_vegan', 'sort_order', 'category_id'];
    const updates = []; const values = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        let v = req.body[f];
        if (f === 'discount_price' && (v === '' || v === 0 || v === '0')) v = null;
        values.push(v); updates.push(`${f}=$${values.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ success: false, message: 'لا يوجد ما يُحدَّث' });
    values.push(req.params.id);
    const { rows } = await pool.query(`UPDATE menu_items SET ${updates.join(',')} WHERE id=$${values.length} RETURNING *`, values);
    res.json({ success: true, data: rows[0] });
  } catch (e) { fail(res, e); }
});

// Toggle item availability
router.patch('/items/:id/toggle', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    const { rows } = await pool.query('UPDATE menu_items SET is_available = NOT is_available WHERE id=$1 RETURNING is_available', [req.params.id]);
    res.json({ success: true, is_available: rows[0].is_available });
  } catch (e) { fail(res, e); }
});

// Delete item
router.delete('/items/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    await pool.query('DELETE FROM item_option_values WHERE option_id IN (SELECT id FROM item_options WHERE item_id=$1)', [req.params.id]);
    await pool.query('DELETE FROM item_options WHERE item_id=$1', [req.params.id]);
    await pool.query('DELETE FROM menu_items WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

function cleanValues(values) {
  return (Array.isArray(values) ? values : [])
    .filter(v => v && String(v.name_ar || v.name || '').trim())
    .map(v => ({ id: isId(v.id) ? v.id : null, name_ar: String(v.name_ar || v.name).trim(), name_en: v.name_en || null, extra_price: Math.max(0, parseFloat(v.extra_price ?? v.price) || 0) }));
}

// Add item option group (+ values)
router.post('/items/:id/options', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'item', req.params.id))) return deny(res);
    const { name_ar, name_en, type, is_required, max_selections } = req.body;
    if (!name_ar) return res.status(400).json({ success: false, message: 'اسم مجموعة الإضافات مطلوب' });
    const values = cleanValues(req.body.values);
    const t = type || 'single';
    const { rows: option } = await pool.query(
      'INSERT INTO item_options (item_id, name_ar, name_en, type, is_required, max_selections) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id, name_ar, name_en || null, t, !!is_required, normalizeMax(t, max_selections, values.length)]);
    for (const v of values) {
      await pool.query('INSERT INTO item_option_values (option_id, name_ar, name_en, extra_price) VALUES ($1,$2,$3,$4)',
        [option[0].id, v.name_ar, v.name_en, v.extra_price]);
    }
    res.status(201).json({ success: true, data: option[0] });
  } catch (e) { fail(res, e); }
});

// Get item options
router.get('/items/:id/options', auth, async (req, res) => {
  try {
    const { rows: options } = await pool.query('SELECT * FROM item_options WHERE item_id=$1 ORDER BY id', [req.params.id]);
    for (const opt of options) {
      const { rows: vals } = await pool.query('SELECT * FROM item_option_values WHERE option_id=$1 ORDER BY id', [opt.id]);
      opt.values = vals;
    }
    res.json({ success: true, data: options });
  } catch (e) { fail(res, e); }
});

// Update option group (name/type/is_required/max_selections) + replace values if `values` sent
router.put('/options/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'option', req.params.id))) return deny(res);
    const { rows: cur } = await pool.query('SELECT * FROM item_options WHERE id=$1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ success: false, message: 'غير موجود' });
    const b = req.body;
    const newType = b.type !== undefined ? b.type : cur[0].type;
    const values = b.values !== undefined ? cleanValues(b.values) : null;
    const { rows: cnt } = await pool.query('SELECT COUNT(*)::int AS c FROM item_option_values WHERE option_id=$1', [req.params.id]);
    const valuesCount = values ? values.length : cnt[0].c;
    const maxSel = normalizeMax(newType, b.max_selections !== undefined ? b.max_selections : cur[0].max_selections, valuesCount);
    const { rows } = await pool.query(
      `UPDATE item_options SET name_ar=$1, name_en=$2, type=$3, is_required=$4, max_selections=$5 WHERE id=$6 RETURNING *`,
      [b.name_ar !== undefined ? b.name_ar : cur[0].name_ar, b.name_en !== undefined ? b.name_en : cur[0].name_en, newType,
       b.is_required !== undefined ? !!b.is_required : cur[0].is_required, maxSel, req.params.id]);
    if (values) {
      // نحدّث القيم الموجودة بمعرّفها (حتى تبقى معرّفات سلّات الزبائن صالحة)، ونضيف الجديدة، ونحذف المحذوفة
      const { rows: existing } = await pool.query('SELECT id FROM item_option_values WHERE option_id=$1', [req.params.id]);
      const keep = new Set();
      for (const v of values) {
        if (v.id && existing.some(x => String(x.id) === String(v.id))) {
          await pool.query('UPDATE item_option_values SET name_ar=$1, name_en=$2, extra_price=$3 WHERE id=$4', [v.name_ar, v.name_en, v.extra_price, v.id]);
          keep.add(String(v.id));
        } else {
          const { rows: ins } = await pool.query('INSERT INTO item_option_values (option_id, name_ar, name_en, extra_price) VALUES ($1,$2,$3,$4) RETURNING id',
            [req.params.id, v.name_ar, v.name_en, v.extra_price]);
          keep.add(String(ins[0].id));
        }
      }
      for (const x of existing) if (!keep.has(String(x.id))) await pool.query('DELETE FROM item_option_values WHERE id=$1', [x.id]);
    }
    const { rows: vals } = await pool.query('SELECT * FROM item_option_values WHERE option_id=$1 ORDER BY id', [req.params.id]);
    res.json({ success: true, data: { ...rows[0], values: vals } });
  } catch (e) { fail(res, e); }
});

// Delete item option group
router.delete('/options/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'option', req.params.id))) return deny(res);
    await pool.query('DELETE FROM item_option_values WHERE option_id=$1', [req.params.id]);
    await pool.query('DELETE FROM item_options WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

// Delete a single option value
router.delete('/option-values/:id', auth, restaurantOnly, async (req, res) => {
  try {
    if (!(await owns(req, 'value', req.params.id))) return deny(res);
    await pool.query('DELETE FROM item_option_values WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

module.exports = router;
