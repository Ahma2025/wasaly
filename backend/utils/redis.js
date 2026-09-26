// ═══════════════════════════════════════════════════════════════
//  Redis مشترك — يفعّل التوسّع الأفقي (عدّة نسخ سيرفر) + الطوابير + حدّ المعدّل
//  يعمل فقط إذا ضُبط REDIS_URL بمتغيّرات البيئة، وإلا يبقى النظام على وضع النسخة الواحدة بأمان.
// ═══════════════════════════════════════════════════════════════
let IORedis = null;
try { IORedis = require('ioredis'); } catch { /* not installed */ }

const URL = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || '';
const ENABLED = !!(URL && IORedis);

let _client = null;
function getRedis() {
  if (!ENABLED) return null;
  if (_client) return _client;
  _client = new IORedis(URL, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: false });
  _client.on('error', (e) => console.error('[Redis] error:', e.message));
  _client.on('connect', () => console.log('✅ Redis connected'));
  return _client;
}

// عميل جديد (للـ pub/sub — يحتاج اتصالات منفصلة)
function newConnection() {
  if (!ENABLED) return null;
  const c = new IORedis(URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  c.on('error', (e) => console.error('[Redis pub/sub] error:', e.message)); // بدونه أي خطأ يوقّع العملية
  return c;
}

module.exports = { isRedisEnabled: ENABLED, getRedis, newConnection };
