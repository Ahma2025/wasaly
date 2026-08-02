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
const path = require('path');

const app = express();
app.set('trust proxy', 1); // خلف بروكسي Railway — نقرأ IP العميل الحقيقي من X-Forwarded-For
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🛡️ حدّ معدّل الطلبات لكل IP — حماية ضد الإغراق (DoS) والسحب والتخمين الآلي
const _rl = new Map(); // ip → { count, reset }
const RL_MAX = 300, RL_WINDOW = 60 * 1000; // 300 طلب/دقيقة — أكثر بكثير من أي استخدام طبيعي
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || 'unknown';
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
