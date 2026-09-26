require('dotenv').config();
process.on('unhandledRejection', (err) => { console.error('UnhandledRejection:', err?.message || err); });
process.on('uncaughtException', (err) => { console.error('UncaughtException:', err?.message || err); });

// Auto migrations — تضاف عند كل إقلاع بأمان
async function runMigrations() {
  const pool = require('./config/database');
  const migrations = [
    `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS store_type VARCHAR(20) DEFAULT 'restaurant'`,
    `ALTER TABLE banners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `CREATE TABLE IF NOT EXISTS vip_customers (id SERIAL PRIMARY KEY, restaurant_id TEXT, customer_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `ALTER TABLE vip_customers ALTER COLUMN restaurant_id TYPE TEXT USING restaurant_id::text`,
    `ALTER TABLE vip_customers ALTER COLUMN customer_id TYPE TEXT USING customer_id::text`,
    `CREATE UNIQUE INDEX IF NOT EXISTS vip_customers_uniq ON vip_customers(restaurant_id, customer_id)`,
    `CREATE TABLE IF NOT EXISTS support_chat (id SERIAL PRIMARY KEY, user_id TEXT, sender TEXT, message TEXT, is_read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS support_chat_user_idx ON support_chat(user_id)`,
    `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 15`,
    // 👥 الطلب الجماعي "كسر الحساب"
    `CREATE TABLE IF NOT EXISTS group_orders (id SERIAL PRIMARY KEY, code TEXT UNIQUE, host_id TEXT, restaurant_id TEXT, restaurant_name TEXT, status TEXT DEFAULT 'open', order_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS group_order_items (id SERIAL PRIMARY KEY, group_id INTEGER, user_id TEXT, user_name TEXT, menu_item_id TEXT, name TEXT, price NUMERIC DEFAULT 0, image TEXT, quantity INTEGER DEFAULT 1, options TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS group_order_items_group_idx ON group_order_items(group_id)`,

    // ⚡️ فهارس الأداء — ضرورية للتحمّل عند الكبر (بدونها الاستعلامات تفحص الجداول كاملة)
    // users
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
    `CREATE INDEX IF NOT EXISTS idx_users_fcm ON users(fcm_token) WHERE fcm_token IS NOT NULL`,
    // restaurants
    `CREATE INDEX IF NOT EXISTS idx_rest_owner ON restaurants(owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rest_category ON restaurants(category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_rest_active_open ON restaurants(is_active, is_open)`,
    // menu
    `CREATE INDEX IF NOT EXISTS idx_menucat_rest ON menu_categories(restaurant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_menuitem_rest ON menu_items(restaurant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_menuitem_cat ON menu_items(category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_itemopt_item ON item_options(item_id)`,
    `CREATE INDEX IF NOT EXISTS idx_itemoptval_opt ON item_option_values(option_id)`,
    // orders — الأهم (ملايين الصفوف متوقّعة)
    `CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_orderitems_order ON order_items(order_id)`,
    // notifications
    `CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read)`,
    // drivers
    `CREATE INDEX IF NOT EXISTS idx_drivers_online ON drivers(is_online, is_busy)`,
    // reviews / addresses / wallet / coupons / support
    `CREATE INDEX IF NOT EXISTS idx_reviews_rest ON reviews(restaurant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reviews_driver ON reviews(driver_id)`,
    `CREATE INDEX IF NOT EXISTS idx_addr_user ON addresses(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_couponusage_user ON coupon_usage(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number)`,
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch (e) { /* column already exists */ }
  }
}
runMigrations().catch(console.error);
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // خلف بروكسي Railway — نقرأ IP العميل الحقيقي من X-Forwarded-For
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ⚡️ توزيع الوقت الحقيقي على عدّة نسخ سيرفر عبر Redis (يفعّل تلقائيًا عند ضبط REDIS_URL)
const { isRedisEnabled, getRedis, newConnection } = require('./utils/redis');
if (isRedisEnabled) {
  try {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = newConnection();
    const subClient = newConnection();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis adapter enabled — horizontal scaling ON');
  } catch (e) { console.error('[Socket adapter] ', e.message); }
}

// Middleware
app.use(compression()); // ضغط gzip — يقلّص ردود JSON/الصور base64 بأكثر من 50%
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🛡️ حدّ معدّل الطلبات لكل IP — حماية ضد الإغراق (DoS)
// عند تفعيل Redis: عدّاد مشترك بين كل النسخ (صحيح مع التوسّع الأفقي). وإلا: بالذاكرة (نسخة واحدة).
const RL_MAX = Number(process.env.RL_MAX) || 300, RL_WINDOW = 60 * 1000;
const _rl = new Map();
const _redisRL = getRedis();
app.use(async (req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || 'unknown';
  if (_redisRL) {
    try {
      const key = `rl:${ip}`;
      const n = await _redisRL.incr(key);
      if (n === 1) await _redisRL.pexpire(key, RL_WINDOW);
      if (n > RL_MAX) return res.status(429).json({ success: false, message: 'طلبات كثيرة، انتظر قليلاً' });
      return next();
    } catch { return next(); } // لو Redis وقع لأي سبب، لا نمنع المستخدم
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

// Make io accessible in routes
app.use((req, res, next) => {
  req.io = io;
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
app.use('/api/banners', require('./routes/banners'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/support', require('./routes/support'));
app.use('/api/group-orders', require('./routes/group-orders'));
app.use('/api/search', require('./routes/search'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/delivery-zones', require('./routes/delivery-zones'));
app.use('/api/webpush', require('./routes/webpush').router);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Debug push notifications (admin-protected)
const debugLogs = [];
function addDebugLog(msg) {
  debugLogs.push({ time: new Date().toISOString(), msg });
  if (debugLogs.length > 50) debugLogs.shift();
}
const { auth: _auth, adminOnly: _adminOnly } = require('./middleware/auth');
app.post('/api/debug-push', _auth, (req, res) => { addDebugLog(req.body?.msg); res.json({ ok: true }); });
app.get('/api/debug-logs', _auth, _adminOnly, (req, res) => res.json({ logs: debugLogs.slice(-20).reverse() }));

// Serve restaurant portal frontend
const portalDist = path.join(__dirname, '../restaurant-portal/dist');
app.use('/portal', express.static(portalDist));
app.use('/portal/sw.js', express.static(path.join(portalDist, 'sw.js')));
app.get('/portal/*', (req, res) => res.sendFile(path.join(portalDist, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  // بالإنتاج لا نكشف تفاصيل الأخطاء الداخلية (5xx) للعميل
  const message = status < 500 ? (err.message || 'خطأ في الطلب') : 'حدث خطأ في الخادم';
  res.status(status).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Wasaly API running on port ${PORT}`));
