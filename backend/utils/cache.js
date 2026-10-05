// ═══════════════════════════════════════════════════════════════
//  كاش مشترك: Redis (عند ضبط REDIS_URL) وإلا ذاكرة العملية — ويسقط بأمان على قاعدة البيانات
//  • لا ينتظر Redis أبداً إن لم يكن جاهزاً (status !== 'ready') ولا أكثر من OP_TIMEOUT
//  • single-flight: طلبات متزامنة لنفس المفتاح تنتظر استعلاماً واحداً فقط
//  • الإبطال عبر "نسخ" (versions): INCR على مفتاح النسخة يُبطل كل المفاتيح المبنيّة عليها فوراً (لكل النسخ/الـ replicas)
// ═══════════════════════════════════════════════════════════════
const { getRedis } = require('./redis');

const redis = getRedis();
const OP_TIMEOUT = Number(process.env.CACHE_OP_TIMEOUT_MS) || 250;
const PREFIX = 'wc:';

const ready = () => !!(redis && redis.status === 'ready');

function withTimeout(p) {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('cache timeout')), OP_TIMEOUT); if (t.unref) t.unref(); }),
  ]).finally(() => clearTimeout(t));
}

// ─── ذاكرة محلية (fallback) ───
const mem = new Map(); // key → { exp, val }
const versions = new Map(); // نسخ الإبطال (وضع الذاكرة) — لا تُخلى أبداً
const MEM_MAX = Number(process.env.CACHE_MEM_MAX) || 5000;
function memGet(key) {
  const e = mem.get(key);
  if (!e) return undefined;
  if (e.exp && e.exp < Date.now()) { mem.delete(key); return undefined; }
  return e.val;
}
function memSet(key, val, ttlMs) {
  if (mem.size >= MEM_MAX) {
    // إخلاء بسيط: المنتهي أولاً ثم الأقدم إدراجاً
    const now = Date.now();
    for (const [k, v] of mem) if (v.exp && v.exp < now) mem.delete(k);
    if (mem.size >= MEM_MAX) { const first = mem.keys().next().value; mem.delete(first); }
  }
  mem.set(key, { exp: ttlMs ? Date.now() + ttlMs : 0, val });
}
const _sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of mem) if (v.exp && v.exp < now) mem.delete(k); }, 60 * 1000);
if (_sweep.unref) _sweep.unref();

// ─── واجهة عامة ───
async function get(key) {
  const k = PREFIX + key;
  if (ready()) {
    try {
      const s = await withTimeout(redis.get(k));
      return s == null ? undefined : JSON.parse(s);
    } catch { return undefined; }
  }
  if (redis) return undefined; // Redis مضبوط لكنه معطّل → لا نستخدم ذاكرة محلية (قد تكون قديمة بين النسخ)
  return memGet(k);
}

async function set(key, val, ttlMs) {
  const k = PREFIX + key;
  if (ready()) {
    try { await withTimeout(redis.set(k, JSON.stringify(val), 'PX', Math.max(1, Math.round(ttlMs)))); } catch { /* ignore */ }
    return;
  }
  if (!redis) memSet(k, val, ttlMs);
}

async function del(...keys) {
  const ks = keys.filter(Boolean).map(k => PREFIX + k);
  if (!ks.length) return;
  for (const k of ks) mem.delete(k);
  if (ready()) { try { await withTimeout(redis.del(...ks)); } catch { /* ignore */ } }
}

// نسخة مفتاح — للإبطال الجماعي. ترجع رقماً (0 إن لم توجد)
async function getVersion(name) {
  const k = PREFIX + 'v:' + name;
  if (ready()) {
    try { return Number(await withTimeout(redis.get(k))) || 0; } catch { return null; } // null = لا تستخدم الكاش
  }
  if (redis) return null;
  return versions.get(k) || 0;
}
async function bumpVersion(name) {
  const k = PREFIX + 'v:' + name;
  versions.set(k, (versions.get(k) || 0) + 1);
  if (redis) {
    // الإبطال مهم للصحة: نحاول حتى لو لم يكن جاهزاً بعد (ioredis يصفّ الأمر) لكن لا ننتظر أكثر من المهلة
    try { await withTimeout(redis.multi().incr(k).pexpire(k, 7 * 24 * 3600 * 1000).exec()); } catch { /* ignore */ }
  }
}

const inflight = new Map();
/**
 * يرجّع القيمة من الكاش أو يحسبها بـ fn() ويخزّنها ttlMs.
 * @param key  مفتاح نهائي (يشمل النسخة إن وُجدت)
 */
async function wrap(key, ttlMs, fn) {
  const hit = await get(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const val = await fn();
      if (val !== undefined) await set(key, val, ttlMs);
      return val;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

// wrap مع نسخة: لو تعذّر قراءة النسخة (Redis معطّل) → نحسب مباشرة من القاعدة بلا كاش
async function wrapVersioned(versionName, key, ttlMs, fn) {
  const v = await getVersion(versionName);
  if (v === null) return fn();
  return wrap(`${key}:v${v}`, ttlMs, fn);
}

// ─── أسماء النسخ المستخدمة بالمشروع ───
const V = {
  catalog: 'catalog',                          // قائمة المطاعم + تفاصيل المطعم/المنيو + المناطق
  restOrders: (rid) => `ro:${rid}`,            // طلبات مطعم معيّن (لوحة المطعم)
};

// إبطال كاش المطاعم/المنيو العام (أي تعديل مطعم/منيو/تصنيف/إضافات/مناطق)
function invalidateCatalog() { return bumpVersion(V.catalog).catch(() => {}); }
// إبطال قائمة طلبات مطعم
function invalidateRestaurantOrders(restaurantId) {
  if (restaurantId === null || restaurantId === undefined || restaurantId === '') return Promise.resolve();
  return bumpVersion(V.restOrders(restaurantId)).catch(() => {});
}

/**
 * Middleware: لأي طلب كتابة (غير GET/HEAD) ينجح (< 400) نُبطل الكاش *قبل* إرسال الرد
 * (حتى لا يرى العميل نسخة قديمة لو طلب القراءة فور نجاح التعديل).
 * @param shouldInvalidate (req) => bool  — فلتر اختياري للمسارات
 * @param invalidate       () => Promise   — الافتراضي: كاش المطاعم/المنيو
 */
function invalidateOnWrite(shouldInvalidate = () => true, invalidate = invalidateCatalog) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || !shouldInvalidate(req)) return next();
    const _json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) return _json(body);
      Promise.resolve(invalidate(req)).catch(() => {}).then(() => _json(body));
      return res;
    };
    next();
  };
}

module.exports = {
  invalidateOnWrite,
  get, set, del, wrap, wrapVersioned, getVersion, bumpVersion, isReady: ready,
  V, invalidateCatalog, invalidateRestaurantOrders,
  _mem: mem,
};
