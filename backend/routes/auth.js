const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { canonicalPhone, isMobile, phoneCandidates } = require('../utils/phone');
const { maybeRefreshToken } = require('../utils/jwtKey');


const generateToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

// ─── حماية ضد التخمين (brute-force) — عدّادات في Redis (مشتركة بين كل النسخ) وإلا بالذاكرة ───
const { tooMany: _tooMany, recordFail: _recordFail, clearFail: _clearFail, acquireOnce, denyToken } = require('../utils/security');
const WIN10 = 10 * 60 * 1000;

// أول مستخدم تطابق كلمة مروره (عادةً صف واحد؛ حتى 3 عند وجود حسابات قديمة بصيغ رقم مختلفة)
async function pickByPassword(rows, password) {
  for (const u of rows || []) {
    if (u && u.password_hash && await bcrypt.compare(String(password), u.password_hash)) return u;
  }
  return null;
}

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const phone = req.body.phone ? canonicalPhone(req.body.phone) : ''; // C-22
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });

    // Rate limiting: رمز واحد لكل رقم كل 60 ثانية (قفل ذرّي مشترك) + حد لكل IP
    const ipKey = 'otpsend-ip:' + (req.ip || 'unknown');
    if (await _tooMany(ipKey, 20, WIN10)) return res.status(429).json({ success: false, message: 'طلبات كثيرة، انتظر قليلاً' });
    if (!(await acquireOnce('otpsend:' + String(phone), 60 * 1000))) {
      return res.status(429).json({ success: false, message: 'انتظر دقيقة قبل طلب رمز جديد' });
    }
    await _recordFail(ipKey, WIN10);
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
    const { code, name } = req.body;
    const phone = canonicalPhone(req.body.phone); // C-22

    const otpKey = 'otp:' + phone;
    if (await _tooMany(otpKey, 6, WIN10)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة، انتظر 10 دقائق ثم حاول مجدداً' });
    }

    const { rows: otpRows } = await pool.query(
      'SELECT * FROM otp_codes WHERE phone=$1 AND code=$2 AND used=false AND expires_at > NOW()',
      [phone, code]
    );
    if (!otpRows[0]) {
      await _recordFail(otpKey, WIN10);
      return res.status(400).json({ success: false, message: 'رمز غير صحيح أو منتهي الصلاحية' });
    }
    await _clearFail(otpKey);

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
    // C-22: رقم موحّد 05XXXXXXXX (00970/+970/972/5XXXXXXXX → 05…) — نفس الشخص لا يفتح حسابين
    phone = canonicalPhone(phone);
    if (!name) return res.status(400).json({ success: false, message: 'الرجاء إدخال الاسم', field: 'name' });
    if (!isMobile(phone)) return res.status(400).json({ success: false, message: 'رقم الجوال غير صحيح — اكتبه بالشكل 05XXXXXXXX', field: 'phone' });
    if (!password || String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور 6 أحرف على الأقل', field: 'password' });

    const existing = await pool.query('SELECT id FROM users WHERE phone = ANY($1::text[])', [phoneCandidates(req.body.phone)]);
    if (existing.rows[0]) return res.status(409).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً', code: 'PHONE_EXISTS' });

    // 🎁 C-29: كود دعوة غلط → خطأ واضح بدل البلع الصامت (الزبون كان ينتظر هدية لن تصل)
    let referrerId = null;
    const refCode = String(referred_by || '').trim();
    if (refCode) {
      const { rows: refRows } = await pool.query('SELECT id FROM users WHERE UPPER(referral_code)=UPPER($1) AND is_active=true', [refCode]);
      if (!refRows[0]) return res.status(400).json({ success: false, field: 'referral', code: 'INVALID_REFERRAL', message: 'كود الدعوة غير صحيح' });
      referrerId = refRows[0].id;
    }

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
    if (referrerId && String(referrerId) !== String(user.id)) {
      try {
        await pool.query('UPDATE users SET referred_by=$1 WHERE id=$2 AND referred_by IS NULL', [referrerId, user.id]);
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
    let { password } = req.body;
    const rawPhone = req.body.phone;
    // C-22: رقم موحّد (أرقام عربية، +970/00970/972، 5XXXXXXXX) + بحث بالرقم الخام للحسابات القديمة غير الموحّدة
    const phone = canonicalPhone(rawPhone);
    if (!phone || !password) return res.status(400).json({ success: false, message: 'أدخل رقم الهاتف وكلمة المرور' });
    const pwKey = 'pw:' + phone;
    const ipKey = 'ip:' + (req.ip || 'unknown');
    if (await _tooMany(pwKey, 8, WIN10) || await _tooMany(ipKey, 30, WIN10)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة، انتظر 10 دقائق ثم حاول مجدداً' });
    }
    // Match by phone only — role check removed so any account can login to any app
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE phone = ANY($1::text[]) AND is_active=true ORDER BY (phone = $2) DESC, id LIMIT 3', [phoneCandidates(rawPhone), phone]);
    // حسابان قديمان لنفس الرقم بصيغتين (لم يُوحَّدا لتعارض) → الحساب الذي تطابق كلمة مروره
    const user = await pickByPassword(rows, password);
    if (!user) { await _recordFail(pwKey, WIN10); await _recordFail(ipKey, WIN10); return res.status(401).json({ success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة' }); }
    if (user.is_blocked) return res.status(403).json({ success: false, message: 'الحساب محظور' });
    await _clearFail(pwKey);
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
    // لا "@" → رقم جوال (موحّد) — حتى لو أُرسل في حقل email
    const isPhoneId = identifier && !identifier.includes('@');
    const ids = isPhoneId ? phoneCandidates(identifier) : [identifier];
    if (isPhoneId) identifier = canonicalPhone(identifier);
    if (!identifier || !password) return res.status(400).json({ success: false, message: 'أدخل بيانات الدخول' });
    // نفس حماية /login-password ضد التخمين (كان /login بلا أي حد)
    const pwKey = 'pw:' + identifier.toLowerCase();
    const ipKey = 'ip:' + (req.ip || 'unknown');
    if (await _tooMany(pwKey, 8, WIN10) || await _tooMany(ipKey, 30, WIN10)) {
      return res.status(429).json({ success: false, message: 'محاولات كثيرة، انتظر 10 دقائق ثم حاول مجدداً' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE (email = ANY($1::text[]) OR phone = ANY($1::text[])) AND is_active=true ORDER BY (phone = $2) DESC, id LIMIT 3', [ids, identifier]);
    const user = await pickByPassword(rows, password);
    if (!user) { await _recordFail(pwKey, WIN10); await _recordFail(ipKey, WIN10); return res.status(401).json({ success: false, message: 'Invalid credentials' }); }

    if (user.is_blocked) return res.status(403).json({ success: false, message: 'Account blocked' });
    await _clearFail(pwKey);

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
    const { name, password, role, city, vehicle_type, vehicle_plate } = req.body;
    const phone = canonicalPhone(req.body.phone); // C-22
    if (!name || !phone || !password || !role) return res.status(400).json({ success: false, message: 'أدخل جميع البيانات' });
    if (String(password).length < 6) return res.status(400).json({ success: false, message: 'كلمة المرور 6 أحرف على الأقل' });
    if (!['customer', 'driver', 'restaurant_owner', 'restaurant', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'دور غير صحيح' });
    const existing = await pool.query('SELECT id, is_active FROM users WHERE phone=$1', [phone]);
    if (existing.rows[0]) {
      if (existing.rows[0].is_active === false) return res.status(409).json({ success: false, code: 'INACTIVE_ACCOUNT', user_id: existing.rows[0].id, message: 'هذا الرقم لحساب معطّل — أعد تفعيله بدل إنشاء حساب جديد' });
      return res.status(400).json({ success: false, code: 'PHONE_EXISTS', message: 'رقم الهاتف مسجل مسبقاً' });
    }
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
  // D-07: تجديد منزلق (التطبيقات الجديدة تخزّن refreshed_token إن وُجد؛ القديمة تتجاهله)
  const refreshed = maybeRefreshToken(req.user, req.tokenDecoded);
  res.json({ success: true, user: sanitizeUser(req.user), ...(refreshed ? { refreshed_token: refreshed } : {}) });
});

// D-07: تجديد صريح للتوكن (قبل انتهاء الـ 30 يوماً) — نفس المستخدم/الدور
router.post('/refresh', auth, (req, res) => {
  res.json({ success: true, token: maybeRefreshToken(req.user, req.tokenDecoded, { force: true }), user: sanitizeUser(req.user) });
});

// D-07: خروج جهاز بلا توكن (التوكن انتهى/أُبطل): يمسح FCM هذا الجهاز، والسائق بلا توصيلة نشطة يصبح offline
// لا يكشف شيئاً ولا يرجع بيانات — نفس الرد دائماً
router.post('/device-logout', async (req, res) => {
  try {
    const t = String((req.body || {}).fcm_token || '').trim();
    const ipKey = 'devlogout-ip:' + (req.ip || 'unknown');
    if (await _tooMany(ipKey, 30, WIN10)) return res.status(429).json({ success: false, message: 'طلبات كثيرة، انتظر قليلاً' });
    await _recordFail(ipKey, WIN10);
    if (t.length >= 20) {
      const { rows } = await pool.query('UPDATE users SET fcm_token=NULL WHERE fcm_token=$1 RETURNING id, role', [t]);
      const { hasActiveAssignment, releaseDriverOffers } = require('../utils/driverPresence');
      for (const u of rows) {
        if (u.role === 'driver' && !(await hasActiveAssignment(u.id))) {
          await pool.query('UPDATE drivers SET is_online=false WHERE user_id=$1', [u.id]);
          await releaseDriverOffers(req.io, u.id);
        }
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error('device-logout:', e.message);
    res.json({ success: true });
  }
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
  if (req.user.role === 'driver') {
    const { hasActiveAssignment, releaseDriverOffers } = require('../utils/driverPresence');
    // D-08: سائق عليه توصيلة → لا خروج (يبقى يستقبل إشعاراتها)
    if (await hasActiveAssignment(req.user.id)) {
      return res.status(409).json({ success: false, code: 'ACTIVE_DELIVERY', message: 'لا يمكنك تسجيل الخروج وعندك طلب قيد التوصيل — سلّمه أولاً' });
    }
    await pool.query('UPDATE drivers SET is_online=false WHERE user_id=$1', [req.user.id]);
    await releaseDriverOffers(req.io, req.user.id);
  }
  await pool.query('UPDATE users SET fcm_token=NULL WHERE id=$1', [req.user.id]);
  // 🔒 التوكن الحالي يُحظر حتى انتهاء صلاحيته (Redis مشترك؛ بدون Redis: هذه النسخة فقط)
  await denyToken(req.token, req.tokenDecoded);
  res.json({ success: true, message: 'Logged out' });
});

const sanitizeUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone,
  avatar: u.avatar, role: u.role, is_verified: u.is_verified,
  wallet_balance: u.wallet_balance, loyalty_points: u.loyalty_points,
  loyalty_tier: u.loyalty_tier, referral_code: u.referral_code
});

module.exports = router;
