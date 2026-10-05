// مفتاح JWT كـ KeyObject (يُنشأ مرة واحدة).
// jsonwebtoken v9 مع سرّ نصّي يحاول createPublicKey ويرمي استثناءً في *كل* تحقق (~0.8ms CPU)؛
// مع KeyObject جاهز ينخفض التحقق إلى ~0.02ms — نفس الخوارزميات والنتيجة تماماً.
const crypto = require('crypto');
let _key = null;
function jwtVerifyKey() {
  if (!_key) _key = crypto.createSecretKey(Buffer.from(String(process.env.JWT_SECRET || '')));
  return _key;
}
module.exports = { jwtVerifyKey };
