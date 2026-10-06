// مفتاح JWT كـ KeyObject (يُنشأ مرة واحدة).
// jsonwebtoken v9 مع سرّ نصّي يحاول createPublicKey ويرمي استثناءً في *كل* تحقق (~0.8ms CPU)؛
// مع KeyObject جاهز ينخفض التحقق إلى ~0.02ms — نفس الخوارزميات والنتيجة تماماً.
const crypto = require('crypto');
let _key = null;
function jwtVerifyKey() {
  if (!_key) _key = crypto.createSecretKey(Buffer.from(String(process.env.JWT_SECRET || '')));
  return _key;
}

// D-07: تجديد منزلق — توكن بقي على انتهائه أقل من REFRESH_WINDOW → نُصدر توكناً جديداً (التطبيق الجديد يخزّنه، القديم يتجاهله)
const REFRESH_WINDOW_S = Number(process.env.JWT_REFRESH_WINDOW_S) || 20 * 24 * 3600;
function signToken(user) {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });
}
function maybeRefreshToken(user, decoded, { force = false } = {}) {
  if (!user || !decoded) return null;
  const left = (decoded.exp || 0) - Math.floor(Date.now() / 1000);
  if (!force && left > REFRESH_WINDOW_S) return null;
  return signToken(user);
}
module.exports = { jwtVerifyKey, signToken, maybeRefreshToken };
