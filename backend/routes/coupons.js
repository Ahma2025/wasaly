const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

const TYPES = ['percentage', 'fixed', 'free_delivery'];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Validate coupon — نفس قواعد التسعير عند الطلب (case-insensitive، حد عام + لكل مستخدم)
router.post('/validate', auth, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim();
    const subtotal = Math.max(0, parseFloat(req.body.subtotal) || 0);
    if (!code) return res.status(400).json({ success: false, message: 'أدخل كود الكوبون' });
    const { rows } = await pool.query(
      `SELECT * FROM coupons WHERE LOWER(code)=LOWER($1) AND is_active=true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (usage_limit IS NULL OR COALESCE(usage_count,0) < usage_limit)
       ORDER BY id DESC LIMIT 1`, [code]);
    const coupon = rows[0];
    if (!coupon) return res.status(400).json({ success: false, message: 'الكوبون غير صالح أو منتهي' });
    if (subtotal < (parseFloat(coupon.min_order) || 0)) {
      return res.status(400).json({ success: false, message: `الحد الأدنى لاستخدام الكوبون ${r2(parseFloat(coupon.min_order) || 0)}₪` });
    }
    const used = await pool.query('SELECT COUNT(*)::int as c FROM coupon_usage WHERE coupon_id=$1 AND user_id=$2', [coupon.id, req.user.id]);
    if ((used.rows[0].c || 0) >= (parseInt(coupon.per_user_limit) || 1)) {
      return res.status(400).json({ success: false, message: 'استخدمت هذا الكوبون مسبقاً' });
    }
    const maxD = parseFloat(coupon.max_discount) || 0;
    let discount = 0;
    if (coupon.type === 'percentage') discount = subtotal * (parseFloat(coupon.value) || 0) / 100;
    else if (coupon.type === 'free_delivery') discount = 0;
    else discount = parseFloat(coupon.value) || 0;
    if (maxD > 0) discount = Math.min(discount, maxD);
    discount = r2(Math.min(discount, subtotal));
    res.json({ success: true, data: { ...coupon, discount, free_delivery: coupon.type === 'free_delivery' } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Create coupon (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { code, type = 'percentage', value, min_order, max_discount, max_uses, usage_limit, expires_at, per_user_limit } = req.body;
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) return res.status(400).json({ success: false, message: 'كود الكوبون مطلوب' });
    if (!TYPES.includes(type)) return res.status(400).json({ success: false, message: 'نوع الكوبون غير صحيح' });
    const v = parseFloat(value) || 0;
    if (type !== 'free_delivery' && v <= 0) return res.status(400).json({ success: false, message: 'قيمة الخصم مطلوبة' });
    if (type === 'percentage' && v > 100) return res.status(400).json({ success: false, message: 'النسبة يجب ألا تتجاوز 100%' });
    const { rows: dup } = await pool.query('SELECT id FROM coupons WHERE LOWER(code)=LOWER($1)', [cleanCode]);
    if (dup[0]) return res.status(409).json({ success: false, message: 'هذا الكود موجود مسبقاً' });
    const usesRaw = max_uses ?? usage_limit;
    const uses = (usesRaw !== undefined && usesRaw !== null && usesRaw !== '') ? parseInt(usesRaw) : null;
    const { rows } = await pool.query(
      `INSERT INTO coupons (code, type, value, min_order, max_discount, usage_limit, expires_at, per_user_limit, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
      [cleanCode, type, type === 'free_delivery' ? 0 : v, min_order ? parseFloat(min_order) : 0,
       max_discount ? parseFloat(max_discount) : null, uses, expires_at || null, Math.max(1, parseInt(per_user_limit) || 1)]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ success: false, message: 'هذا الكود موجود مسبقاً' });
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get coupons (admin) — المحذوفة (غير النشطة) مخفية إلا مع ?all=1
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    const { rows } = await pool.query(`SELECT * FROM coupons ${all ? '' : 'WHERE is_active=true'} ORDER BY id DESC`);
    res.json({ success: true, data: rows.map(c => ({ ...c, is_active: c.is_active === true || c.is_active === 1 })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Delete coupon (soft)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('UPDATE coupons SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
