// ═══════════════════════════════════════════════════════════════
//  🫀 D-07: حضور السائق — آخر نشاط (last_seen_at) + إطفاء تلقائي للسائقين "المتصلين" الخاملين
//  • كل طلب HTTP مصادَق لسائق / اتصال سوكِت / موقع → noteDriverSeen (كتابة ≤ مرة كل 3 دقائق لكل سائق)
//  • التوزيع يتجاهل السائق الذي لم يظهر منذ DRIVER_STALE_HOURS (افتراضي 12 ساعة) — مثلاً انتهى توكنه أو خرج إجبارياً
//    (العتبة طويلة عمداً: تطبيق السائق بالخلفية يعتمد على FCM ولا يرسل موقعاً)
//  • مسح دوري يضبط is_online=false لهؤلاء (إن لم يكن لديهم توصيلة نشطة)
// ═══════════════════════════════════════════════════════════════
const pool = require('../config/database');
const { getRedis } = require('./redis');

const redis = getRedis();
const THROTTLE_MS = Number(process.env.DRIVER_SEEN_THROTTLE_MS) || 3 * 60 * 1000;
const STALE_HOURS = Math.max(1, Number(process.env.DRIVER_STALE_HOURS) || 12);
const OP_TIMEOUT = 250;
const _mem = new Map();

function withTimeout(p) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), OP_TIMEOUT); if (t.unref) t.unref(); })])
    .finally(() => clearTimeout(t));
}

async function claim(userId) {
  const key = `drvseen:${userId}`;
  if (redis && redis.status === 'ready') {
    try { return (await withTimeout(redis.set(key, '1', 'PX', THROTTLE_MS, 'NX'))) === 'OK'; } catch { /* fallback ↓ */ }
  }
  const now = Date.now();
  if (now - (_mem.get(String(userId)) || 0) < THROTTLE_MS) return false;
  _mem.set(String(userId), now);
  if (_mem.size > 50000) _mem.clear();
  return true;
}

/** لا يرمي أبداً */
async function noteDriverSeen(userId, { force = false } = {}) {
  try {
    if (!userId || pool.isSqlite) return false;
    if (!force && !(await claim(userId))) return false;
    await pool.query('UPDATE drivers SET last_seen_at=NOW() WHERE user_id=$1', [userId]);
    return true;
  } catch (e) { console.error('driver seen:', e.message); return false; }
}

// شرط SQL لاستبعاد السائقين الخاملين من التوزيع (العمود موجود عبر migrations)
const FRESH_SQL = `(last_seen_at IS NULL OR last_seen_at > NOW() - INTERVAL '${STALE_HOURS} hours')`;

async function sweepStaleDrivers() {
  try {
    const { rows } = await pool.query(
      `UPDATE drivers d SET is_online=false
       WHERE d.is_online=true AND COALESCE(d.is_busy,false)=false
         AND d.last_seen_at IS NOT NULL AND d.last_seen_at < NOW() - INTERVAL '${STALE_HOURS} hours'
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.driver_id=d.user_id AND o.driver_assigned_at IS NOT NULL
                           AND o.status IN ('confirmed','preparing','ready','on_the_way'))
         AND NOT EXISTS (SELECT 1 FROM order_groups g WHERE g.driver_id=d.user_id AND g.driver_assigned_at IS NOT NULL
                           AND g.status IN ('picking_up','on_the_way'))
       RETURNING d.user_id`);
    if (rows.length) console.log(`🫀 auto-offline: ${rows.length} stale driver(s)`);
    return rows.map(r => r.user_id);
  } catch (e) { console.error('stale driver sweep:', e.message); return []; }
}

/** D-08/A-08: هل للسائق توصيلة مُسندة نشطة (طلب عادي/شخصي أو طلب مجمّع)؟ */
async function hasActiveAssignment(driverId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM orders WHERE driver_id=$1 AND driver_assigned_at IS NOT NULL AND status IN ('confirmed','preparing','ready','on_the_way')
     UNION ALL
     SELECT 1 FROM order_groups WHERE driver_id=$1 AND driver_assigned_at IS NOT NULL AND status IN ('picking_up','on_the_way')
     LIMIT 1`, [driverId]);
  return rows.length > 0;
}

/** عروض قائمة (لم تُقبل) لهذا السائق → تُسحب ويُعاد توزيعها (عند الخروج/الحذف/الإطفاء) */
async function releaseDriverOffers(io, driverId) {
  try {
    const S = require('./orderService');
    const G = require('./groupService');
    const { rows: o } = await pool.query(
      `UPDATE orders SET driver_id=NULL, driver_offer_expires_at=NULL
       WHERE driver_id=$1 AND driver_assigned_at IS NULL AND status IN ('confirmed','preparing','ready') RETURNING id, restaurant_id`, [driverId]);
    const { rows: g } = await pool.query(
      `UPDATE order_groups SET driver_id=NULL, driver_offer_expires_at=NULL
       WHERE driver_id=$1 AND driver_assigned_at IS NULL AND status='confirmed' RETURNING id`, [driverId]);
    for (const r of o) { require('./cache').invalidateRestaurantOrders(r.restaurant_id); S.dispatchOrder(io, r.id, driverId).catch(() => {}); }
    for (const r of g) G.dispatchGroup(io, r.id, driverId).catch(() => {});
    return o.length + g.length;
  } catch (e) { console.error('release driver offers:', e.message); return 0; }
}

module.exports = { noteDriverSeen, sweepStaleDrivers, hasActiveAssignment, releaseDriverOffers, FRESH_SQL, STALE_HOURS };
