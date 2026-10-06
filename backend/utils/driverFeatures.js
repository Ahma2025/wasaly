// ═══════════════════════════════════════════════════════════════
//  قدرات تطبيق السائق — الإصدارات الجديدة ترسل `X-Wasaly-Features: groups` (HTTP)
//  أو `auth.features = 'groups'` (مصافحة السوكِت). نسجّل drivers.supports_groups=true
//  مرة كل 10 دقائق كحد أقصى لكل سائق (Redis SET NX PX، وإلا ذاكرة العملية).
//  التوزيع المجمّع لا يعرض إلا على السائقين supports_groups=true.
// ═══════════════════════════════════════════════════════════════
const pool = require('../config/database');
const { getRedis } = require('./redis');

const redis = getRedis();
const THROTTLE_MS = Number(process.env.DRIVER_FEATURES_THROTTLE_MS) || 10 * 60 * 1000;
const OP_TIMEOUT = 250;
const _mem = new Map(); // userId → ts آخر كتابة

function withTimeout(p) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('redis timeout')), OP_TIMEOUT); if (t.unref) t.unref(); })])
    .finally(() => clearTimeout(t));
}

/** هل القيمة (نص مفصول بفواصل/مسافات أو مصفوفة) تتضمن الميزة groups */
function hasGroups(v) {
  if (!v) return false;
  const list = Array.isArray(v) ? v : String(v).split(/[\s,;]+/);
  return list.some(x => String(x).trim().toLowerCase() === 'groups');
}

async function claimWrite(userId) {
  const key = `drvfeat:groups:${userId}`;
  if (redis && redis.status === 'ready') {
    try { return (await withTimeout(redis.set(key, '1', 'PX', THROTTLE_MS, 'NX'))) === 'OK'; } catch { /* fallback ↓ */ }
  }
  const now = Date.now();
  if (now - (_mem.get(String(userId)) || 0) < THROTTLE_MS) return false;
  _mem.set(String(userId), now);
  if (_mem.size > 50000) _mem.clear();
  return true;
}
async function releaseClaim(userId) {
  _mem.delete(String(userId));
  if (redis && redis.status === 'ready') { try { await withTimeout(redis.del(`drvfeat:groups:${userId}`)); } catch { /* ignore */ } }
}

/**
 * يُستدعى لكل طلب مصادَق لسائق — رخيص: لا شيء إن لم تُرسل الميزة، وكتابة قاعدة واحدة كل 10 دقائق كحد أقصى.
 * لا يرمي أبداً.
 */
async function noteDriverFeatures(userId, features) {
  try {
    if (!userId || !hasGroups(features)) return false;
    if (!(await claimWrite(userId))) return false;
    try {
      await pool.query('UPDATE drivers SET supports_groups=true WHERE user_id=$1 AND supports_groups IS DISTINCT FROM true', [userId]);
    } catch (e) { await releaseClaim(userId); throw e; }
    return true;
  } catch (e) { console.error('driver features:', e.message); return false; }
}

module.exports = { noteDriverFeatures, hasGroups };
