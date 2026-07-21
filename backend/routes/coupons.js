const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

// Validate coupon
router.post('/validate', auth, async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    const { rows } = await pool.query(
      `SELECT * FROM coupons WHERE code=$1 AND is_active=true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (usage_limit IS NULL OR usage_count < usage_limit)
       AND min_order <= $2`,
      [code, subtotal || 0]
    );
    if (!rows[0]) return res.status(400).json({ success: false, message: 'الكوبون غير صالح أو منتهي' });

    const used = await pool.query('SELECT COUNT(*) as c FROM coupon_usage WHERE coupon_id=$1 AND user_id=$2', [rows[0].id, req.user.id]);
    if (parseInt(used.rows[0].c) >= 1) {
      return res.status(400).json({ success: false, message: 'استخدمت هذا الكوبون مسبقاً' });
    }

    const coupon = rows[0];
    let discount = 0;
    if (coupon.type === 'percentage') discount = Math.min(subtotal * coupon.value / 100, coupon.max_discount || subtotal);
    else discount = Math.min(coupon.value, subtotal);

    res.json({ success: true, data: { ...coupon, discount } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Create coupon (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { code, type = 'percentage', value, min_order, max_discount, max_uses, usage_limit, expires_at } = req.body;
    const usesRaw = max_uses ?? usage_limit;
    const uses = (usesRaw !== undefined && usesRaw !== null && usesRaw !== '') ? parseInt(usesRaw) : null;
    // أعمدة موجودة في سكيمتَي الإنتاج (Postgres) والمحلي (SQLite) معاً
    const { rows } = await pool.query(
      `INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        String(code).trim().toUpperCase(),
        type,
        value ? parseFloat(value) : 0,
        min_order ? parseFloat(min_order) : 0,
        max_discount ? parseFloat(max_discount) : null,
        uses,
        expires_at ? expires_at : null,
      ]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get all coupons (admin)
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM coupons ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete coupon
router.delete('/:id', auth, adminOnly, async (req, res) => {
  await pool.query('UPDATE coupons SET is_active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
