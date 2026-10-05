const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');


const generateToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

// ─── حماية ضد التخمين (brute-force) — عدّاد محاولات فاشلة في الذاكرة ───
const _failMap = new Map(); // key → { count, first }
function _tooMany(key, max, windowMs) {
  const rec = _failMap.get(key);
  if (!rec || Date.now() - rec.first > windowMs) return false;
  return rec.count >= max;
}
function _recordFail(key, windowMs) {
  const rec = _failMap.get(key);
  if (!rec || Date.now() - rec.first > windowMs) _failMap.set(key, { count: 1, first: Date.now() });
  else rec.count++;
}
function _clearFail(key) { _failMap.delete(key); }
// تنظيف دوري لمنع تضخّم الذاكرة
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _failMap) if (now - v.first > 30 * 60 * 1000) _failMap.delete(k);
}, 15 * 60 * 1000);
if (_cleanupTimer.unref) _cleanupTimer.unref();

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

    // Rate limiting: منع إرسال OTP أكثر من مرة في 60 ثانية
    const { rows: recent } = await pool.query(
      "SELECT id FROM otp_codes WHERE phone=$1 AND created_at > NOW() - INTERVAL '60 seconds'",
      [phone]
    );
    if (recent.length > 0) {
      return res.status(429).json({ success: false, message: 'انتظر دقيقة قبل طلب رمز جديد' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query('DELETE FROM otp_codes WHERE phone=$1', [phone]);
    await pool.query('INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,$2,$3)', [phone, code, expiresAt]);

    // ⚠️ لا يوجد مزوّد SMS بعد — الرمز لا يُطبع بالسجلات ولا يُرجَع بالرد إلا عند OTP_DEBUG=true صراحةً (تطوير فقط، ليس بالإنتاج)
    const otpDebug = process.env.OTP_DEBUG === 'true' && process.env.NODE_ENV !== 'production';
    if (otpDebug) console.log(`[OTP_DEBUG] OTP for ${phone}: ${code}`);

    res.json({ success: true, message: 'OTP sent', ...(otpDebug && { code }) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Verify OTP & Login/Register
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name } = req.body;

    const otpKey = 'otp:' + phone;
    if (_tooMany(otpKey, 6, 10 * 60 * 1000)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة، انتظر 10 دقائق ثم حاول مجدداً' });
    }

    const { rows: otpRows } = await pool.query(
      'SELECT * FROM otp_codes WHERE phone=$1 AND code=$2 AND used=false AND expires_at > NOW()',
      [phone, code]
    );
    if (!otpRows[0]) {
      _recordFail(otpKey, 10 * 60 * 1000);
      return res.status(400).json({ success: false, message: 'رمز غير صحيح أو منتهي الصلاحية' });
    }
    _clearFail(otpKey);

    await pool.query('UPDATE otp_codes SET used=true WHERE id=$1', [otpRows[0].id]);

    let { rows: users } = await pool.query('SELECT * FROM users WHERE phone=$1', [phone]);
    let user = users[0];

    if (!user) {
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { rows: newUsers } = await pool.query(
        `INSERT INTO users (name, phone, is_verified, referral_code, role) VALUES ($1,$2,true,$3,'customer') RETURNING *`,
        [name || 'مستخدم جديد', phone, referralCode]
      );
      user = newUsers[0];
    } else {
      await pool.query('UPDATE users SET is_verified=true WHERE id=$1', [user.id]);
      user.is_verified = true;
    }

    res.json({ success: true, token: generateToken(user), user: sanitizeUser(user), isNew: !users[0] });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Register with email/password
router.post('/register', async (req, res) => {
  try {
    let { name, email, phone, password, city, referred_by } = req.body;
    // تطبيع + تحقّق صارم من الحقول (يمنع إنشاء حساب ناقص)
    name = (name || '').trim();
    city = (city || '').trim();
    if (phone) phone = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    if (!name) return res.status(400).json({ success: false, message: 'الرجاء إدخال الاسم', field: 'name' });
    if (!phone || phone.length < 9) return res.status(400).json({ success: false, message: 'رقم هاتف غير صحيح', field: 'phone' });
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور 6 أحرف على الأقل', field: 'password' });

    const existing = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing.rows[0]) return res.status(409).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً', code: 'PHONE_EXISTS' });

    const hash = await bcrypt.hash(password, 12);
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    let rows;
    try {
      ({ rows } = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, referral_code, role, city, is_verified) VALUES ($1,$2,$3,$4,$5,'customer',$6,true) RETURNING *`,
        [name, email || null, phone, hash, referralCode, city || null]
      ));
    } catch (insErr) {
      if (insErr.code === '23505') return res.status(409).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً', code: 'PHONE_EXISTS' }); // سباق/ضغط مزدوج
      throw insErr;
    }
    const user = rows[0];

    // 🎁 الدعوة: نخزّن الداعي فقط — المكافأة (10₪ لكل طرف + حركة محفظة) تُصرف عند *تسليم* أول طلب للمدعو
    if (referred_by) {
      try {
        const { rows: refRows } = await pool.query('SELECT id FROM users WHERE UPPER(referral_code)=UPPER($1) AND is_active=true', [String(referred_by).trim()]);
        if (refRows[0] && String(refRows[0].id) !== String(user.id)) {
          await pool.query('UPDATE users SET referred_by=$1 WHERE id=$2 AND referred_by IS NULL', [refRows[0].id, user.id]);
        }
      } catch (e) { console.error('referral store error:', e.message); }
    }
    res.status(201).json({ success: true, token: generateToken(user), user: sanitizeUser(user) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Login with phone/password (for customer & driver apps)
router.post('/login-password', async (req, res) => {
  try {
    let { phone, password, role } = req.body;
    // Normalize phone: remove all non-digit chars, convert Arabic-Indic numerals
    if (phone) phone = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    if (!phone || !password) return res.status(400).json({ success: false, message: 'أدخل رقم الهاتف وكلمة المرور' });
    const pwKey = 'pw:' + phone;
    const ipKey = 'ip:' + (req.ip || 'unknown');
    if (_tooMany(pwKey, 8, 10 * 60 * 1000) || _tooMany(ipKey, 30, 10 * 60 * 1000)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة، انتظر 10 دقائق ثم حاول مجدداً' });
    }
    // Match by phone only — role check removed so any account can login to any app
    const { rows } = await pool.query('SELECT * FROM users WHERE phone=$1 AND is_active=true', [phone]);
    const user = rows[0];
    if (!user || !user.password_hash) { _recordFail(pwKey, 10 * 60 * 1000); _recordFail(ipKey, 10 * 60 * 1000); return res.status(401).json({ success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة' }); }
    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) { _recordFail(pwKey, 10 * 60 * 1000); _recordFail(ipKey, 10 * 60 * 1000); return res.status(401).json({ success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة' }); }
    if (user.is_blocked) return res.status(403).json({ success: false, message: 'الحساب محظور' });
    _clearFail(pwKey);
    res.json({ success: true, token: generateToken(user), user: sanitizeUser(user) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Login with email/password
router.post('/login', async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    let identifier = String(email || phone || '').trim();
    if (!email && identifier) identifier = identifier.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'أدخل بيانات الدخول' });
    // نفس حماية /login-password ضد التخمين (كان /login بلا أي حد)
    const pwKey = 'pw:' + identifier.toLowerCase();
    const ipKey = 'ip:' + (req.ip || 'unknown');
    if (_tooMany(pwKey, 8, 10 * 60 * 1000) || _tooMany(ipKey, 30, 10 * 60 * 1000)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة، انتظر 10 دقائق ثم حاول مجدداً' });
    }
    const { rows } = await pool.query('SELECT * FROM users WHERE (email=$1 OR phone=$1) AND is_active=true', [identifier]);
    const user = rows[0];
    if (!user || !user.password_hash) { _recordFail(pwKey, 10 * 60 * 1000); _recordFail(ipKey, 10 * 60 * 1000); return res.status(401).json({ success: false, message: 'Invalid credentials' }); }

    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) { _recordFail(pwKey, 10 * 60 * 1000); _recordFail(ipKey, 10 * 60 * 1000); return res.status(401).json({ success: false, message: 'Invalid credentials' }); }
    if (user.is_blocked) return res.status(403).json({ success: false, message: 'Account blocked' });
    _clearFail(pwKey);

    res.json({ success: true, token: generateToken(user), user: sanitizeUser(user) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Social login — معطّل: لم يكن هناك أي تحقق من توكن Google/Apple (كان يسمح بانتحال أي حساب بالإيميل فقط)
router.post('/social', (req, res) => {
  res.status(410).json({ success: false, message: 'تسجيل الدخول عبر الحسابات الاجتماعية غير متاح حالياً، استخدم رقم الهاتف وكلمة المرور' });
});

// Admin: Create driver or restaurant account
router.post('/admin/create-user', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'غير مصرح' });
    const { name, phone, password, role, city, vehicle_type, vehicle_plate } = req.body;
    if (!name || !phone || !password || !role) return res.status(400).json({ success: false, message: 'أدخل جميع البيانات' });
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور 6 أحرف على الأقل' });
    if (!['customer', 'driver', 'restaurant_owner', 'restaurant', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'دور غير صحيح' });
    const existing = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing.rows[0]) return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    const hash = await bcrypt.hash(String(password), 12);
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, city, referral_code, is_verified) VALUES ($1,$2,$3,$4,$5,$6, true) RETURNING *`,
      [name, phone, hash, role, city || null, referralCode]
    );
    if (role === 'driver') {
      // بدون صف drivers لا يستطيع السائق الاتصال ولا يظهر في /drivers/me
      await pool.query('INSERT INTO drivers (user_id, vehicle_type, vehicle_plate) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING',
        [rows[0].id, vehicle_type || 'دراجة', vehicle_plate || '']);
    }
    res.status(201).json({ success: true, user: sanitizeUser(rows[0]) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Get current user
router.get('/me', auth, (req, res) => {
  res.json({ success: true, user: sanitizeUser(req.user) });
});

// Update FCM token
router.put('/fcm', auth, async (req, res) => {
  const { fcm_token } = req.body;
  if (fcm_token) await pool.query('UPDATE users SET fcm_token=NULL WHERE fcm_token=$1 AND id<>$2', [fcm_token, req.user.id]);
  await pool.query('UPDATE users SET fcm_token=$1 WHERE id=$2', [fcm_token || null, req.user.id]);
  res.json({ success: true });
});

// Logout
router.post('/logout', auth, async (req, res) => {
  await pool.query('UPDATE users SET fcm_token=NULL WHERE id=$1', [req.user.id]);
  res.json({ success: true, message: 'Logged out' });
});

const sanitizeUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone,
  avatar: u.avatar, role: u.role, is_verified: u.is_verified,
  wallet_balance: u.wallet_balance, loyalty_points: u.loyalty_points,
  loyalty_tier: u.loyalty_tier, referral_code: u.referral_code
});

module.exports = router;
