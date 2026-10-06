const jwt = require('jsonwebtoken');
const { jwtVerifyKey } = require('../utils/jwtKey');
const pool = require('../config/database');
const { isTokenDenied } = require('../utils/security');
const { noteDriverFeatures } = require('../utils/driverFeatures');
const { noteDriverSeen } = require('../utils/driverPresence');

// 🔐 X-01: 401 فقط لأسباب مصادقة حقيقية (توكن مفقود/غير صالح/منتهي/مسجَّل خروجه، أو حساب غير موجود/معطّل/محظور).
// أي عطل مؤقت (قاعدة البيانات/Redis/شبكة) → 503 حتى لا تمسح التطبيقات الجلسة وتُخرج المستخدم.
const JWT_ERRORS = new Set(['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError']);
const unauthorized = (res, message, code) => res.status(401).json({ success: false, message, code });
const unavailable = (res) => {
  res.set('Retry-After', '3');
  return res.status(503).json({ success: false, message: 'الخدمة غير متاحة مؤقتاً، حاول مرة أخرى بعد لحظات', code: 'TEMPORARY_UNAVAILABLE', retry: true });
};

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return unauthorized(res, 'No token', 'NO_TOKEN');

  let decoded;
  try {
    decoded = jwt.verify(token, jwtVerifyKey());
  } catch (e) {
    if (e && JWT_ERRORS.has(e.name)) return unauthorized(res, 'Invalid token', e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
    console.error('[auth] verify error:', e && e.message);
    return unavailable(res);
  }

  let rows;
  try {
    // 🔒 توكن سُجّل خروجه (POST /auth/logout) → مرفوض حتى انتهاء صلاحيته
    if (await isTokenDenied(token)) return unauthorized(res, 'Invalid token', 'TOKEN_REVOKED');
    ({ rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND is_active=true AND is_blocked=false', [decoded.id]));
  } catch (e) {
    console.error('[auth] lookup error (→503, not 401):', e && e.message);
    return unavailable(res);
  }
  if (!rows[0]) return unauthorized(res, 'User not found', 'USER_INACTIVE');

  req.user = rows[0];
  req.token = token;
  req.tokenDecoded = decoded;
  if (rows[0].role === 'driver') {
    // 🧺 تطبيق السائق الجديد يعلن دعم الطلب المجمّع (كتابة مخنوقة: مرة/10 دقائق لكل سائق) — لا ترمي أبداً
    if (req.headers['x-wasaly-features']) await noteDriverFeatures(rows[0].id, req.headers['x-wasaly-features']);
    // 🫀 D-07: آخر نشاط للسائق (مخنوق) — السائق الذي انتهت جلسته يُطفأ تلقائياً بعد مدة خمول طويلة
    noteDriverSeen(rows[0].id).catch(() => {});
  }
  next();
};

// مصادقة اختيارية للمسارات العامة: تضبط req.user إن وُجد توكن صالح، ولا ترفض أبداً
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, jwtVerifyKey());
      if (!(await isTokenDenied(token))) {
        const { rows } = await pool.query('SELECT * FROM users WHERE id=$1 AND is_active=true AND is_blocked=false', [decoded.id]);
        if (rows[0]) req.user = rows[0];
      }
    }
  } catch { /* توكن غير صالح → نكمل كزائر */ }
  next();
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });
  next();
};

const restaurantOnly = (req, res, next) => {
  if (!['restaurant', 'restaurant_owner', 'admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Restaurant only' });
  next();
};

const driverOnly = (req, res, next) => {
  if (!['driver', 'admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Driver only' });
  next();
};

module.exports = { auth, optionalAuth, adminOnly, restaurantOnly, driverOnly };
