const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const cache = require('../utils/cache');
const { serverError } = require('../utils/http');
const { round2, num } = require('../utils/orderService');

router.use(cache.invalidateOnWrite()); // رسوم التوصيل المعروضة بقائمة المطاعم تعتمد على المناطق

// ═══════════════════════════════════════════════════════════════
//  A-03: قاعدة التسعير الوحيدة (orderService.getZoneFee) — والإدارة تعرضها كما هي:
//   • المسافة داخل منطقة نشطة [min_km, max_km) → سعر تلك المنطقة
//   • مسافة خارج كل المناطق (أو مسافة غير معروفة) → سعر أغلى منطقة نشطة  (fallback_rule = 'max_zone')
//   • لا مناطق نشطة إطلاقاً → 5₪                                         (fallback_rule = 'default')
//  القرار: نُبقي "أغلى منطقة" (المسافات خارج المناطق هي الأبعد عادةً؛ 5₪ كانت تخسّر المنصة) ونكشفها للإدارة.
// ═══════════════════════════════════════════════════════════════
const NO_ZONES_PRICE = 5;
function pricingMeta(rows) {
  const active = rows.filter(z => z.is_active !== false);
  if (!active.length) {
    return { fallback_rule: 'default', fallback_price: NO_ZONES_PRICE, fallback_text: `لا توجد مناطق مفعّلة — كل المسافات بسعر ثابت ${NO_ZONES_PRICE}₪` };
  }
  const maxZone = active.reduce((m, z) => (num(z.price) > num(m.price) ? z : m), active[0]);
  const price = round2(num(maxZone.price));
  // فجوات/ما بعد آخر منطقة (للتنبيه في الصفحة)
  const sorted = [...active].sort((a, b) => num(a.min_km) - num(b.min_km));
  const gaps = [];
  let cursor = 0;
  for (const z of sorted) {
    if (num(z.min_km) > cursor + 1e-9) gaps.push({ from_km: round2(cursor), to_km: round2(num(z.min_km)) });
    cursor = Math.max(cursor, num(z.max_km));
  }
  return {
    fallback_rule: 'max_zone', fallback_price: price, fallback_zone_id: maxZone.id, fallback_zone_name: maxZone.name || null,
    covered_until_km: round2(cursor), gaps,
    fallback_text: `أي مسافة خارج المناطق تُحسب بسعر أغلى منطقة (${price}₪)`,
  };
}

// Get all zones — data كما كانت (مصفوفة) + pricing لقاعدة السعر خارج المناطق
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM delivery_zones WHERE is_active=true ORDER BY min_km');
    res.json({ success: true, data: rows, pricing: pricingMeta(rows) });
  } catch (e) { serverError(res, e); }
});

// Calculate fee for a distance
router.get('/calculate', async (req, res) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.query;
    const { haversineKm, validCoord, getZoneFee } = require('../utils/orderService');
    if (!validCoord(lat1, lng1) || !validCoord(lat2, lng2)) {
      return res.status(400).json({ success: false, message: 'حدّد الموقعين على الخريطة' });
    }
    const distKm = haversineKm(+lat1, +lng1, +lat2, +lng2);
    const { rows } = await pool.query(
      'SELECT * FROM delivery_zones WHERE is_active=true AND min_km <= $1 AND max_km > $1 ORDER BY min_km LIMIT 1', [distKm]);
    // نفس قاعدة التسعير الفعلية: المنطقة المطابقة، وإلا أغلى منطقة، وإن لا مناطق → 5
    const fee = await getZoneFee(pool, distKm);
    res.json({ success: true, data: { fee, distance_km: distKm.toFixed(2), zone: rows[0], out_of_zones: !rows[0] } });
  } catch (e) { serverError(res, e); }
});

function validateZone(z) {
  const min = num(z.min_km), max = num(z.max_km), price = num(z.price);
  if (z.price !== undefined && z.price !== null && z.price !== '' && (!Number.isFinite(parseFloat(z.price)) || price < 0)) return 'السعر غير صحيح';
  if (min < 0) return 'بداية المسافة غير صحيحة';
  if (z.max_km !== undefined && z.max_km !== null && z.max_km !== '' && max <= min) return 'نهاية المسافة يجب أن تكون أكبر من بدايتها';
  return null;
}

// Update zone (admin) — تحديث جزئي (الحقول غير المرسلة تبقى كما هي)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!/^\d+$/.test(String(req.params.id))) return res.status(404).json({ success: false, message: 'المنطقة غير موجودة' });
    const { rows: cur } = await pool.query('SELECT * FROM delivery_zones WHERE id=$1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ success: false, message: 'المنطقة غير موجودة' });
    const b = req.body || {};
    const pick = (k) => (b[k] === undefined || b[k] === '' ? cur[0][k] : b[k]);
    const next = { price: pick('price'), name: b.name === undefined ? cur[0].name : b.name, min_km: pick('min_km'), max_km: pick('max_km'),
      is_active: typeof b.is_active === 'boolean' ? b.is_active : cur[0].is_active };
    const err = validateZone(next);
    if (err) return res.status(400).json({ success: false, message: err });
    await pool.query('UPDATE delivery_zones SET price=$1, name=$2, min_km=$3, max_km=$4, is_active=$5 WHERE id=$6',
      [next.price, next.name, next.min_km, next.max_km, next.is_active, req.params.id]);
    const { rows } = await pool.query('SELECT * FROM delivery_zones WHERE id=$1', [req.params.id]);
    const { rows: all } = await pool.query('SELECT * FROM delivery_zones WHERE is_active=true ORDER BY min_km');
    res.json({ success: true, data: rows[0], pricing: pricingMeta(all) });
  } catch (e) { serverError(res, e); }
});

// Create zone (admin)
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { price, name, min_km, max_km } = req.body;
    const err = validateZone({ price, min_km, max_km });
    if (err) return res.status(400).json({ success: false, message: err });
    const { rows } = await pool.query(
      'INSERT INTO delivery_zones (name, min_km, max_km, price) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, min_km, max_km, price]
    );
    const { rows: all } = await pool.query('SELECT * FROM delivery_zones WHERE is_active=true ORDER BY min_km');
    res.status(201).json({ success: true, data: rows[0], pricing: pricingMeta(all) });
  } catch (e) { serverError(res, e); }
});

// Delete zone (admin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM delivery_zones WHERE id=$1', [req.params.id]);
    const { rows: all } = await pool.query('SELECT * FROM delivery_zones WHERE is_active=true ORDER BY min_km');
    res.json({ success: true, pricing: pricingMeta(all) });
  } catch (e) { serverError(res, e); }
});

module.exports = router;
module.exports.pricingMeta = pricingMeta;
