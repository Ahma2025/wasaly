// ═══════════════════════════════════════════════════════════════
//  موقع السائق الحي — آخر موقع في Redis (hash واحد: drvloc) وإلا بالذاكرة،
//  والكتابة في Postgres مرة كل 15 ثانية كحد أقصى لكل سائق (نفس منطق socket.js).
//  التوزيع/تتبع الطلب يقرأ الأحدث: Redis أولاً ثم القاعدة.
// ═══════════════════════════════════════════════════════════════
const pool = require('../config/database');
const { getRedis } = require('./redis');

const redis = getRedis();
const OP_TIMEOUT = 250;
const PERSIST_EVERY = Number(process.env.DRIVER_LOC_PERSIST_MS) || 15000;
const LOC_HASH = 'drvloc';
const MAX_AGE_MS = 6 * 3600 * 1000; // موقع أقدم من 6 ساعات لا يُعتبر "أحدث" من القاعدة

const ready = () => !!(redis && redis.status === 'ready');
function withTimeout(p) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), OP_TIMEOUT); if (t.unref) t.unref(); })])
    .finally(() => clearTimeout(t));
}

const _mem = new Map();          // userId → { lat, lng, at }
const _lastPersist = new Map();  // userId → ts (fallback بلا Redis)

const enc = (lat, lng, at) => `${lat},${lng},${at}`;
function dec(s) {
  if (!s) return null;
  const [a, b, c] = String(s).split(',');
  const lat = Number(a), lng = Number(b), at = Number(c);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (at && Date.now() - at > MAX_AGE_MS) return null;
  return { lat, lng, at };
}

async function shouldPersist(userId) {
  if (ready()) {
    try { return (await withTimeout(redis.set(`drvloc:p:${userId}`, '1', 'PX', PERSIST_EVERY, 'NX'))) === 'OK'; } catch { /* fallback ↓ */ }
  }
  const now = Date.now();
  if (now - (_lastPersist.get(String(userId)) || 0) < PERSIST_EVERY) return false;
  _lastPersist.set(String(userId), now);
  if (_lastPersist.size > 20000) _lastPersist.clear();
  return true;
}

/**
 * يحفظ آخر موقع للسائق. الكتابة للقاعدة مخنوقة (≤ مرة/15ث) إلا إن force=true.
 * @returns {Promise<boolean>} هل كُتب في القاعدة
 */
async function setLocation(userId, lat, lng, { force = false, dbWritten = false } = {}) {
  const uid = String(userId);
  const now = Date.now();
  _mem.set(uid, { lat, lng, at: now });
  if (_mem.size > 50000) _mem.clear();
  if (ready()) { try { await withTimeout(redis.hset(LOC_HASH, uid, enc(lat, lng, now))); } catch { /* ignore */ } }
  if (dbWritten) { await shouldPersist(uid); return true; } // كُتب بالقاعدة للتو (PATCH /drivers/status) → نبدأ نافذة الـ 15ث فقط
  if (force || await shouldPersist(uid)) {
    try {
      await pool.query('UPDATE drivers SET current_lat=$1, current_lng=$2, lat=$1, lng=$2 WHERE user_id=$3', [lat, lng, userId]);
      return true;
    } catch (e) { console.error('driver location persist:', e.message); }
  }
  return false;
}

/** أحدث المواقع لعدة سائقين: Map(userId → {lat,lng}) — المفقود يعني "استخدم القاعدة" */
async function getLocations(userIds) {
  const out = new Map();
  const ids = [...new Set((userIds || []).map(String))];
  if (!ids.length) return out;
  if (ready()) {
    try {
      const vals = await withTimeout(redis.hmget(LOC_HASH, ...ids));
      ids.forEach((id, i) => { const v = dec(vals[i]); if (v) out.set(id, v); });
      return out;
    } catch { /* fallback ↓ */ }
  }
  if (!redis) for (const id of ids) { const v = _mem.get(id); if (v && Date.now() - v.at < MAX_AGE_MS) out.set(id, v); }
  return out;
}

async function getLocation(userId) {
  if (userId === null || userId === undefined) return null;
  return (await getLocations([userId])).get(String(userId)) || null;
}

// ─── الطلب النشط المقبول للسائق → المستلمون (زبون + صاحب المطعم) — كاش قصير مع إبطال صريح ───
const cache = require('./cache');
const ACTIVE_TTL = 20000;
const activeKey = (driverId) => `drvact:${driverId}`;

async function getActiveRelay(driverId) {
  return cache.wrap(activeKey(driverId), ACTIVE_TTL, async () => {
    const { rows } = await pool.query(
      `SELECT o.customer_id, o.id as order_id, r.owner_id, o.group_id
       FROM orders o LEFT JOIN restaurants r ON o.restaurant_id=r.id
       WHERE o.driver_id=$1 AND o.driver_assigned_at IS NOT NULL
         AND o.status IN ('confirmed','preparing','ready','on_the_way')
       ORDER BY o.driver_assigned_at DESC, o.stop_sequence NULLS LAST, o.id LIMIT 1`, [driverId]);
    if (!rows[0]) return { none: true };
    const out = { order_id: rows[0].order_id, customer_id: rows[0].customer_id, owner_id: rows[0].owner_id };
    if (rows[0].group_id) {
      // 🧺 طلب مجمّع: الموقع للزبون + كل أصحاب المطاعم غير الملغاة
      const { rows: ow } = await pool.query(
        `SELECT DISTINCT r.owner_id FROM orders o JOIN restaurants r ON r.id=o.restaurant_id
         WHERE o.group_id=$1 AND o.status <> 'cancelled' AND r.owner_id IS NOT NULL`, [rows[0].group_id]);
      out.group_id = rows[0].group_id;
      out.owner_ids = ow.map(r => r.owner_id);
    }
    return out;
  });
}
function invalidateActiveRelay(driverId) {
  if (driverId === null || driverId === undefined) return Promise.resolve();
  return cache.del(activeKey(driverId)).catch(() => {});
}

module.exports = { setLocation, getLocations, getLocation, getActiveRelay, invalidateActiveRelay, PERSIST_EVERY };
