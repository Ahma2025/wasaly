// ═══════════════════════════════════════════════════════════════
//  عدّادات الحماية (brute-force / OTP) + قائمة حظر التوكنات (logout)
//  Redis أولاً (مشترك بين كل النسخ/الـ replicas) — وإلا ذاكرة العملية.
//  كل العمليات ذرّية: MULTI (SET NX PX + INCR) فلا يبقى مفتاح بلا انتهاء صلاحية.
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');
const { getRedis } = require('./redis');

const redis = getRedis();
const OP_TIMEOUT = 300;
const ready = () => !!(redis && redis.status === 'ready');
function withTimeout(p) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), OP_TIMEOUT); if (t.unref) t.unref(); })])
    .finally(() => clearTimeout(t));
}

// ─── ذاكرة (fallback) ───
const _fail = new Map();   // key → { count, first, windowMs }
const _locks = new Map();  // key → expiresAt
const _deny = new Map();   // hash → expiresAt
const _cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _fail) if (now - v.first > v.windowMs) _fail.delete(k);
  for (const [k, exp] of _locks) if (exp < now) _locks.delete(k);
  for (const [k, exp] of _deny) if (exp < now) _deny.delete(k);
}, 5 * 60 * 1000);
if (_cleanup.unref) _cleanup.unref();

const rk = (key) => `bf:${key}`;

/** هل تجاوز المفتاح الحد؟ (النافذة تبدأ من أول محاولة فاشلة — نفس السلوك القديم) */
async function tooMany(key, max, windowMs) {
  if (ready()) {
    try { return (Number(await withTimeout(redis.get(rk(key)))) || 0) >= max; } catch { /* fallback ↓ */ }
  }
  const rec = _fail.get(key);
  if (!rec || Date.now() - rec.first > windowMs) return false;
  return rec.count >= max;
}

/** تسجيل محاولة فاشلة — يرجّع العدد الحالي */
async function recordFail(key, windowMs) {
  if (ready()) {
    try {
      const r = await withTimeout(redis.multi().set(rk(key), 0, 'PX', windowMs, 'NX').incr(rk(key)).exec());
      return Number(r?.[1]?.[1]) || 0;
    } catch { /* fallback ↓ */ }
  }
  const rec = _fail.get(key);
  if (!rec || Date.now() - rec.first > windowMs) { _fail.set(key, { count: 1, first: Date.now(), windowMs }); return 1; }
  rec.count++;
  return rec.count;
}

async function clearFail(key) {
  _fail.delete(key);
  if (ready()) { try { await withTimeout(redis.del(rk(key))); } catch { /* ignore */ } }
}

/** قفل لمرة واحدة خلال ttlMs (SET NX PX). يرجّع true إن حصلنا عليه (= مسموح) */
async function acquireOnce(key, ttlMs) {
  if (ready()) {
    try { return (await withTimeout(redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX'))) === 'OK'; } catch { /* fallback ↓ */ }
  }
  const now = Date.now();
  const exp = _locks.get(key);
  if (exp && exp > now) return false;
  _locks.set(key, now + ttlMs);
  return true;
}

// ─── قائمة حظر التوكنات (logout) ───
const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 40);

/** يضيف التوكن لقائمة الحظر حتى انتهاء صلاحيته (exp من الـ JWT) */
async function denyToken(token, decoded) {
  if (!token) return;
  const expMs = decoded && decoded.exp ? decoded.exp * 1000 : Date.now() + 30 * 24 * 3600 * 1000;
  const ttl = Math.max(1000, expMs - Date.now());
  const h = tokenHash(token);
  _deny.set(h, Date.now() + ttl);
  if (_deny.size > 100000) { const first = _deny.keys().next().value; _deny.delete(first); }
  if (redis) {
    try { await withTimeout(redis.set(`jwtdeny:${h}`, '1', 'PX', ttl)); } catch (e) { console.error('[denyToken]', e.message); }
  }
}

/** هل التوكن محظور؟ (Redis غير متاح → نعتمد على ذاكرة هذه النسخة فقط) */
async function isTokenDenied(token) {
  if (!token) return false;
  const h = tokenHash(token);
  const exp = _deny.get(h);
  if (exp && exp > Date.now()) return true;
  if (ready()) {
    try { return (await withTimeout(redis.exists(`jwtdeny:${h}`))) === 1; } catch { return false; }
  }
  return false;
}

module.exports = { tooMany, recordFail, clearFail, acquireOnce, denyToken, isTokenDenied, tokenHash };
