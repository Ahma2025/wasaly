// أقسام المتاجر العامة — GET /api/store-types → [{ key, name_ar, name_en, icon, emoji, sort, count }]
const router = require('express').Router();
const pool = require('../config/database');
const cache = require('../utils/cache');
const { serverError } = require('../utils/http');
const storeTypes = require('../utils/storeTypes');

const TTL = Number(process.env.CACHE_STORE_TYPES_TTL_MS) || 60000;

router.get('/', async (req, res) => {
  try {
    // مربوط بنسخة الكاتالوج → أي تعديل مطعم من الإدارة/المالك يُبطله فوراً، وإلا 60ث
    const data = await cache.wrapVersioned(cache.V.catalog, 'storetypes', TTL, async () => {
      const { rows } = await pool.query(
        `SELECT COALESCE(store_type, 'restaurant') AS t, COUNT(*)::int AS n
         FROM restaurants WHERE is_active=true GROUP BY 1`);
      const counts = {};
      for (const r of rows) {
        const k = storeTypes.normalize(r.t);
        if (k) counts[k] = (counts[k] || 0) + r.n;
      }
      return storeTypes.publicList().map(t => ({ ...t, count: counts[t.key] || 0 }));
    });
    res.json({ success: true, data });
  } catch (e) { serverError(res, e, 'GET /store-types'); }
});

module.exports = router;
