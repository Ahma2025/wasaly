require('dotenv').config();
require('./utils/asyncShim'); // ⚠️ أولاً: أي خطأ async في أي route يذهب لمعالج الأخطاء (لا طلبات معلّقة)
process.on('unhandledRejection', (err) => { console.error('UnhandledRejection:', err?.message || err); });
process.on('uncaughtException', (err) => { console.error('UncaughtException:', err?.message || err); });

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set — refusing to start');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const pool = require('./config/database');
const { runMigrations } = require('./config/migrations');

const app = express();
app.set('trust proxy', 1); // خلف بروكسي Railway — نقرأ IP العميل الحقيقي من X-Forwarded-For
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ⚡️ توزيع الوقت الحقيقي على عدّة نسخ عبر Redis (عند ضبط REDIS_URL)
const { isRedisEnabled, getRedis, newConnection } = require('./utils/redis');
if (isRedisEnabled) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    io.adapter(createAdapter(newConnection(), newConnection()));
    console.log('✅ Socket.io Redis adapter enabled — horizontal scaling ON');
  } catch (e) { console.error('[Socket adapter] ', e.message); }
}

// Middleware
app.use(compression());
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🛡️ حدّ معدّل الطلبات لكل IP
// Redis: عدّاد ذرّي (MULTI: SET NX PX + INCR) — لا مفتاح بلا انتهاء صلاحية حتى لو انقطع الاتصال بين الأمرين
const RL_MAX = Number(process.env.RL_MAX) || 300, RL_WINDOW = 60 * 1000;
const _rl = new Map();
const _redisRL = getRedis();
app.use(async (req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || 'unknown';
  if (_redisRL && _redisRL.status === 'ready') { // Redis غير جاهز → عدّاد الذاكرة (لا ننتظر اتصالاً معلّقاً)
    try {
      const key = `rl:${ip}`;
      const results = await _redisRL.multi().set(key, 0, 'PX', RL_WINDOW, 'NX').incr(key).exec();
      const n = Number(results?.[1]?.[1]) || 0;
      if (n > RL_MAX) return res.status(429).json({ success: false, message: 'طلبات كثيرة، انتظر قليلاً' });
      return next();
    } catch { /* Redis معطّل → نكمل بعدّاد الذاكرة */ }
  }
  const now = Date.now();
  let r = _rl.get(ip);
  if (!r || now > r.reset) { r = { count: 0, reset: now + RL_WINDOW }; _rl.set(ip, r); }
  r.count++;
  if (r.count > RL_MAX) {
    res.set('Retry-After', String(Math.ceil((r.reset - now) / 1000)));
    return res.status(429).json({ success: false, message: 'طلبات كثيرة، انتظر قليلاً' });
  }
  next();
});
const _rlCleanup = setInterval(() => { const now = Date.now(); for (const [k, v] of _rl) if (now > v.reset) _rl.delete(k); }, 2 * 60 * 1000);
if (_rlCleanup.unref) _rlCleanup.unref();

// Socket.io
require('./utils/socket')(io);

app.use((req, res, next) => { req.io = io; next(); });

// 🛡️ حاجز أمني مركزي على كل ردود JSON:
//  1) لا يُرجَع password_hash أبداً (حتى لو نسيه أي RETURNING * أو SELECT *)
//  2) بالإنتاج: لا تسريب لتفاصيل أخطاء 5xx
function stripSecrets(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 6) return v;
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(x => stripSecrets(x, depth + 1));
  let out = null;
  for (const k of Object.keys(v)) {
    if (k === 'password_hash') { out = out || { ...v }; delete out[k]; continue; }
    const val = v[k];
    if (val && typeof val === 'object' && !(val instanceof Date)) {
      const s = stripSecrets(val, depth + 1);
      if (s !== val) { out = out || { ...v }; out[k] = s; }
    }
  }
  return out || v;
}
app.use((req, res, next) => {
  const _json = res.json.bind(res);
  res.json = (body) => {
    body = stripSecrets(body);
    if (process.env.NODE_ENV === 'production' && res.statusCode >= 500 && body && typeof body === 'object' && 'message' in body) {
      body = { ...body, message: 'حدث خطأ في الخادم' };
    }
    return _json(body);
  };
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/restaurants', require('./routes/restaurants'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/store-types', require('./routes/store-types'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/support', require('./routes/support'));
app.use('/api/group-orders', require('./routes/group-orders'));
app.use('/api/search', require('./routes/search'));
app.use('/api/upload', require('./routes/upload'));
const paymentsRouter = require('./routes/payments');
app.use('/api/payments', paymentsRouter);
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/delivery-zones', require('./routes/delivery-zones'));
app.use('/api/webpush', require('./routes/webpush').router);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Debug push logs — الإدارة فقط (كتابةً وقراءةً)
const debugLogs = [];
function addDebugLog(msg) {
  debugLogs.push({ time: new Date().toISOString(), msg: String(msg || '').slice(0, 500) });
  if (debugLogs.length > 50) debugLogs.shift();
}
const { auth: _auth, adminOnly: _adminOnly } = require('./middleware/auth');
app.post('/api/debug-push', _auth, _adminOnly, (req, res) => { addDebugLog(req.body?.msg); res.json({ ok: true }); });
app.get('/api/debug-logs', _auth, _adminOnly, (req, res) => res.json({ logs: debugLogs.slice(-20).reverse() }));

// Serve restaurant portal frontend
const portalDist = path.join(__dirname, '../restaurant-portal/dist');
app.use('/portal', express.static(portalDist));
app.use('/portal/sw.js', express.static(path.join(portalDist, 'sw.js')));
app.get('/portal/*', (req, res) => res.sendFile(path.join(portalDist, 'index.html')));

// 404 للـ API
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'المسار غير موجود' }));

const { isInputError } = require('./utils/http');
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // مدخلات غير صالحة تصل Postgres (مثلاً نص لعمود رقمي) → 400 وليس 500
  if (isInputError(err)) return res.status(400).json({ success: false, message: 'قيمة غير صالحة في الطلب' });
  const status = err.status || err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl.split('?')[0]}]`, err.stack || err.message);
  const message = status < 500 ? (err.expose === false ? 'خطأ في الطلب' : (err.message || 'خطأ في الطلب')) : 'حدث خطأ في الخادم';
  res.status(status).json({ success: false, message });
});

// ─── الإقلاع: جداول → migrations → استماع → استعادة التوزيع ───
const PORT = process.env.PORT || 5000;
(async () => {
  try {
    await pool.ready;
    if (!pool.isSqlite) await runMigrations(pool);
  } catch (e) {
    console.error('⚠️ boot DB step failed:', e.message);
  }
  server.listen(PORT, () => console.log(`🚀 Wasaly API running on port ${PORT}`));
  if (!pool.isSqlite) {
    const { recoverDispatch } = require('./utils/orderService');
    recoverDispatch(io);
    const sweep = setInterval(() => paymentsRouter.sweepPendingCardOrders(io), 60 * 1000);
    if (sweep.unref) sweep.unref();
    // 🫀 D-07: سائقون "متصلون" بلا أي نشاط منذ ساعات طويلة (توكن منتهٍ/خروج إجباري) → offline
    const { sweepStaleDrivers } = require('./utils/driverPresence');
    const staleSweep = setInterval(() => sweepStaleDrivers(), 5 * 60 * 1000);
    if (staleSweep.unref) staleSweep.unref();
  }
})();
