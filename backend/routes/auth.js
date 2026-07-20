const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');


const generateToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });

// TEMP DEBUG: echo back what was received
const lastAttempts = [];
router.post('/debug-login', (req, res) => {
  const entry = { time: new Date().toISOString(), body: req.body, chars: {} };
  if (req.body.phone) {
    entry.chars = [...req.body.phone].map(c => ({ char: c, code: c.charCodeAt(0) }));
  }
  lastAttempts.unshift(entry);
  if (lastAttempts.length > 5) lastAttempts.pop();
  res.json({ received: req.body, charCodes: entry.chars });
});
router.get('/debug-login', (req, res) => res.json({ lastAttempts }));
router.get('/debug-users', async (req, res) => {
  const { rows } = await pool.query("SELECT id, phone, role, is_active, is_blocked FROM users WHERE phone LIKE '0599039%'");
  res.json(rows);
});

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

    // Send via Twilio in production
    console.log(`OTP for ${phone}: ${code}`);

    res.json({ success: true, message: 'OTP sent', ...(process.env.NODE_ENV !== 'production' && { code }) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Verify OTP & Login/Register
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code, name } = req.body;

    const { rows: otpRows } = await pool.query(
      'SELECT * FROM otp_codes WHERE phone=$1 AND code=$2 AND used=false AND expires_at > NOW()',
      [phone, code]
    );
    if (!otpRows[0]) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

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
    if (phone) phone = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    const existing = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing.rows[0]) return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });

    const hash = await bcrypt.hash(password, 12);
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, referral_code, role, city, is_verified) VALUES ($1,$2,$3,$4,$5,'customer',$6,true) RETURNING *`,
      [name, email || null, phone, hash, referralCode, city || null]
    );
    const user = rows[0];

    // 🎁 مكافأة الدعوة — إذا سجّل بكود صديق، الاثنين ياخدوا 10₪ محفظة
    if (referred_by) {
      try {
        const { rows: refRows } = await pool.query('SELECT id FROM users WHERE referral_code=$1', [String(referred_by).toUpperCase()]);
        if (refRows[0] && refRows[0].id !== user.id) {
          const REWARD = 10;
          // كافئ الداعي والمدعوّ (10₪ محفظة لكل طرف)
          await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + $1 WHERE id=$2', [REWARD, refRows[0].id]);
          await pool.query('UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + $1 WHERE id=$2', [REWARD, user.id]);
          user.wallet_balance = (parseFloat(user.wallet_balance) || 0) + REWARD;
        }
      } catch (e) { console.error('referral reward error:', e.message); }
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
    console.log('[LOGIN] raw phone:', JSON.stringify(phone), 'role:', role);
    // Normalize phone: remove all non-digit chars, convert Arabic-Indic numerals
    if (phone) phone = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    console.log('[LOGIN] normalized phone:', phone);
    // Match by phone only — role check removed so any account can login to any app
    const { rows } = await pool.query('SELECT * FROM users WHERE phone=$1 AND is_active=true', [phone]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    if (user.is_blocked) return res.status(403).json({ success: false, message: 'الحساب محظور' });
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
    const identifier = email || phone;
    const { rows } = await pool.query('SELECT * FROM users WHERE (email=$1 OR phone=$1) AND is_active=true', [identifier]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (user.is_blocked) return res.status(403).json({ success: false, message: 'Account blocked' });

    res.json({ success: true, token: generateToken(user), user: sanitizeUser(user) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Social login (Google/Apple/Facebook)
router.post('/social', async (req, res) => {
  try {
    const { provider, provider_id, email, name, avatar } = req.body;
    let { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    let user = rows[0];

    if (!user) {
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { rows: newUser } = await pool.query(
        `INSERT INTO users (name, email, avatar, is_verified, referral_code, role) VALUES ($1,$2,$3,true,$4,'customer') RETURNING *`,
        [name, email, avatar, referralCode]
      );
      user = newUser[0];
    }

    res.json({ success: true, token: generateToken(user), user: sanitizeUser(user) });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
  }
});

// Admin: Create driver or restaurant account
router.post('/admin/create-user', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'غير مصرح' });
    const { name, phone, password, role, city } = req.body;
    if (!name || !phone || !password || !role) return res.status(400).json({ success: false, message: 'أدخل جميع البيانات' });
    const existing = await pool.query('SELECT id FROM users WHERE phone=$1', [phone]);
    if (existing.rows[0]) return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    const hash = await bcrypt.hash(password, 10);
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, city, referral_code, is_verified) VALUES ($1,$2,$3,$4,$5,$6, true) RETURNING *`,
      [name, phone, hash, role, city || null, referralCode]
    );
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
  await pool.query('UPDATE users SET fcm_token=$1 WHERE id=$2', [fcm_token, req.user.id]);
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
