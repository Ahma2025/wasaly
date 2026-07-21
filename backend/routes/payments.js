const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const axios = require('axios');

// ===== Lahza (بوابة الدفع بالبطاقة) =====
const LAHZA_BASE = 'https://api.lahza.io';
const LAHZA_SECRET = process.env.LAHZA_SECRET_KEY;
// الرابط اللي بترجعلو Lahza بعد الدفع (نكتشفه داخل الـ WebView)
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://burger-app-production.up.railway.app/api';

const lahza = () => axios.create({
  baseURL: LAHZA_BASE,
  headers: { Authorization: `Bearer ${LAHZA_SECRET}`, 'Content-Type': 'application/json' },
  timeout: 20000,
});

// بدء عملية دفع — يرجّع رابط دفع آمن يفتح داخل التطبيق
router.post('/lahza/init', auth, async (req, res) => {
  try {
    if (!LAHZA_SECRET) return res.status(503).json({ success: false, message: 'الدفع بالبطاقة غير مفعّل بعد' });
    const { order_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [order_id, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    const u = await pool.query('SELECT email, phone FROM users WHERE id=$1', [req.user.id]);
    const user = u.rows[0] || {};
    const email = user.email || `${user.phone || 'user' + req.user.id}@wasaly.ps`;

    const amount = Math.round(parseFloat(order.total) * 100); // بالأغورة (ILS × 100)
    const { data } = await lahza().post('/transaction/initialize', {
      email,
      mobile: user.phone || '',
      amount,
      currency: 'ILS',
      callback_url: `${PUBLIC_API_URL}/payments/lahza/callback`,
      metadata: { order_id: order.id, user_id: req.user.id },
    });

    const d = data?.data || {};
    if (!d.authorization_url) return res.status(502).json({ success: false, message: 'تعذّر بدء الدفع' });
    res.json({ success: true, authorization_url: d.authorization_url, reference: d.reference });
  } catch (e) {
    res.status(500).json({ success: false, message: e.response?.data?.message || e.message });
  }
});

// التحقّق من الدفع بعد رجوع الزبون — يحدّث حالة الطلب
router.get('/lahza/verify/:reference', auth, async (req, res) => {
  try {
    if (!LAHZA_SECRET) return res.status(503).json({ success: false, message: 'الدفع بالبطاقة غير مفعّل بعد' });
    const { data } = await lahza().get(`/transaction/verify/${req.params.reference}`);
    const t = data?.data || {};
    const paid = t.status === 'success';
    const orderId = t.metadata?.order_id;
    if (paid && orderId) {
      await pool.query("UPDATE orders SET payment_status='paid' WHERE id=$1 AND customer_id=$2", [orderId, req.user.id]);
    }
    res.json({ success: true, paid, order_id: orderId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.response?.data?.message || e.message });
  }
});

// صفحة رجوع بسيطة يكتشفها الـ WebView
router.get('/lahza/callback', (req, res) => {
  res.send(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;text-align:center;padding-top:80px;background:#F8F9FA">
<div style="font-size:64px">✅</div>
<h2 style="color:#1A1A2E">تمت معالجة الدفع</h2>
<p style="color:#8E8E93">يمكنك العودة إلى التطبيق الآن…</p>
</body></html>`);
});

// Create payment intent (Stripe)
router.post('/intent', auth, async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { order_id } = req.body;
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [order_id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(rows[0].total * 100),
      currency: 'ils',
      metadata: { order_id, user_id: req.user.id }
    });

    await pool.query('UPDATE orders SET stripe_payment_intent=$1 WHERE id=$2', [paymentIntent.id, order_id]);
    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Stripe webhook
router.post('/webhook', async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'payment_intent.succeeded') {
      const { order_id } = event.data.object.metadata;
      await pool.query("UPDATE orders SET payment_status='paid' WHERE id=$1", [order_id]);
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// Add wallet balance
router.post('/wallet/topup', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    await pool.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id=$2', [amount, req.user.id]);
    await pool.query(
      `INSERT INTO wallet_transactions (user_id, type, amount, description_ar, description_en)
       VALUES ($1,'credit',$2,'شحن المحفظة','Wallet top-up')`,
      [req.user.id, amount]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Wallet transactions
router.get('/wallet/transactions', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]
  );
  res.json({ success: true, data: rows });
});

module.exports = router;
