require('dotenv').config();
process.on('unhandledRejection', (err) => { console.error('UnhandledRejection:', err?.message || err); });
process.on('uncaughtException', (err) => { console.error('UncaughtException:', err?.message || err); });

// Auto migrations — تضاف عند كل إقلاع بأمان
async function runMigrations() {
  const pool = require('./config/database');
  const migrations = [
    `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS store_type VARCHAR(20) DEFAULT 'restaurant'`,
    `ALTER TABLE banners ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
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

// Socket.io
require('./utils/socket')(io);

// Make io accessible in routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Test login page for diagnosing iPhone login issues
app.get('/test-login', (req, res) => {
  res.send(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اختبار تسجيل الدخول</title>
<style>body{font-family:sans-serif;padding:20px;background:#f5f5f5}input{width:100%;padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box}button{width:100%;padding:14px;background:#FF6B00;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer}#result{margin-top:20px;padding:15px;background:white;border-radius:8px;white-space:pre-wrap;word-break:break-all}</style></head>
<body>
<h2>اختبار الاتصال بالسيرفر</h2>
<input id="phone" type="tel" placeholder="رقم الهاتف" value="0599039707">
<input id="pass" type="text" placeholder="كلمة المرور" value="123456">
<select id="role" style="width:100%;padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:8px;font-size:16px"><option value="customer">customer</option><option value="driver">driver</option><option value="restaurant">restaurant</option><option value="admin">admin</option></select>
<button onclick="testLogin()">اختبر الدخول</button>
<div id="result">النتيجة ستظهر هنا...</div>
<script>
async function testLogin(){
  const phone=document.getElementById('phone').value;
  const pass=document.getElementById('pass').value;
  const role=document.getElementById('role').value;
  document.getElementById('result').textContent='جاري الاتصال...';
  try{
    const r=await fetch('/api/auth/login-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password:pass,role})});
    const d=await r.json();
    document.getElementById('result').textContent='الحالة: '+r.status+'\n\n'+JSON.stringify(d,null,2);
  }catch(e){document.getElementById('result').textContent='خطأ: '+e.message;}
}
</script></body></html>`);
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
app.use('/api/search', require('./routes/search'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/delivery-zones', require('./routes/delivery-zones'));
app.use('/api/webpush', require('./routes/webpush').router);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Debug push notifications from restaurant portal
const debugLogs = [];
function addDebugLog(msg) {
  debugLogs.push({ time: new Date().toISOString(), msg });
  if (debugLogs.length > 50) debugLogs.shift();
  console.log('[DEBUG-PUSH]', msg);
}
app.post('/debug-push', (req, res) => { addDebugLog(req.body?.msg); res.json({ ok: true }); });
app.post('/api/debug-push', (req, res) => { addDebugLog(req.body?.msg); res.json({ ok: true }); });
app.get('/debug-logs', (req, res) => res.json({ logs: debugLogs.slice(-20).reverse() }));
app.get('/api/debug-logs', (req, res) => res.json({ logs: debugLogs.slice(-20).reverse() }));

// Debug: test push notification to a user
app.get('/test-push/:userId', async (req, res) => {
  try {
    const pool = require('./config/database');
    const { sendFCM, getUserTokens } = require('./utils/notifications');
    const { rows } = await pool.query('SELECT id,name,role,fcm_token,LEFT(fcm_token,20) as tok_preview FROM users WHERE id=$1', [req.params.userId]);
    if (!rows[0]) return res.json({ error: 'User not found' });
    const user = rows[0];
    const bundleMap = { driver:'com.wasaly.driver', restaurant_owner:'com.wasaly.restaurant', admin:'com.wasaly.admin' };
    const bundleId = bundleMap[user.role] || 'com.wasaly.customer';
    const tokens = await getUserTokens(user.id);
    if (!tokens.length) return res.json({ error: 'No token saved', user: { id:user.id, name:user.name, role:user.role } });
    await sendFCM(tokens, '🔔 اختبار إشعار', `مرحبا ${user.name}! الإشعارات تعمل ✅`, { type:'test' }, bundleId);
    res.json({ success:true, user:{ id:user.id, name:user.name, role:user.role }, token_preview: user.tok_preview, token_len: user.fcm_token?.length, bundle_id: bundleId });
  } catch(e) { res.json({ error: e.message }); }
});

// Serve restaurant portal frontend
const portalDist = path.join(__dirname, '../restaurant-portal/dist');
app.use('/portal', express.static(portalDist));
app.use('/portal/sw.js', express.static(path.join(portalDist, 'sw.js')));
app.get('/portal/*', (req, res) => res.sendFile(path.join(portalDist, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Server Error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Wasaly API running on port ${PORT}`));
