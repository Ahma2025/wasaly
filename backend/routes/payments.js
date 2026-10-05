const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const axios = require('axios');
const { releaseCardOrder, round2, num } = require('../utils/orderService');

// ===== Lahza (بوابة الدفع بالبطاقة) =====
const LAHZA_BASE = 'https://api.lahza.io';
const lahzaSecret = () => process.env.LAHZA_SECRET_KEY;
// الرابط الذي ترجع له Lahza بعد الدفع — من البيئة، وإلا من مضيف الطلب نفسه (لا رابط ثابت بالكود)
const publicApiUrl = (req) => process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}/api`;

const lahza = () => axios.create({
  baseURL: LAHZA_BASE,
  headers: { Authorization: `Bearer ${lahzaSecret()}`, 'Content-Type': 'application/json' },
  timeout: 20000,
});

// بدء عملية دفع — يرجّع رابط دفع آمن يفتح داخل التطبيق
router.post('/lahza/init', auth, async (req, res) => {
  let order_id = null;
  try {
    if (!/^\d+$/.test(String(req.body.order_id || ''))) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [req.body.order_id, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    order_id = order.id;
    if (!lahzaSecret()) {
      await releaseCardOrder(req.io, order.id, { paid: false }).catch(() => {});
      return res.status(503).json({ success: false, message: 'الدفع بالبطاقة غير مفعّل بعد' });
    }
    if (order.payment_status === 'paid') return res.status(400).json({ success: false, message: 'الطلب مدفوع مسبقاً' });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, message: 'الطلب ملغى' });

    const u = await pool.query('SELECT email, phone FROM users WHERE id=$1', [req.user.id]);
    const user = u.rows[0] || {};
    const email = user.email || `${user.phone || 'user' + req.user.id}@wasaly.ps`;
    const amount = Math.round(round2(num(order.total)) * 100); // بالأغورة (ILS × 100)
    const { data } = await lahza().post('/transaction/initialize', {
      email, mobile: user.phone || '', amount, currency: 'ILS',
      callback_url: `${publicApiUrl(req)}/payments/lahza/callback`,
      metadata: { order_id: order.id, user_id: req.user.id },
    });
    const d = data?.data || {};
    if (!d.authorization_url) {
      await releaseCardOrder(req.io, order.id, { paid: false }).catch(() => {});
      return res.status(502).json({ success: false, message: 'تعذّر بدء الدفع' });
    }
    if (d.reference) {
      await pool.query('UPDATE orders SET payment_reference=$1 WHERE id=$2', [d.reference, order.id]);
      require('../utils/cache').invalidateRestaurantOrders(order.restaurant_id);
    }
    res.json({ success: true, authorization_url: d.authorization_url, reference: d.reference });
  } catch (e) {
    // التطبيق يخبر الزبون أن الطلب محفوظ للدفع عند الاستلام → نطلقه كطلب نقدي
    if (order_id) await releaseCardOrder(req.io, order_id, { paid: false }).catch(() => {});
    res.status(500).json({ success: false, message: e.response?.data?.message || 'تعذّر بدء الدفع' });
  }
});

// التحقّق من الدفع — عند النجاح: الطلب مدفوع ويُرسل للمطعم الآن. عند الفشل: يتحوّل لنقدي (كما يَعِد التطبيق)
router.get('/lahza/verify/:reference', auth, async (req, res) => {
  try {
    if (!lahzaSecret()) return res.status(503).json({ success: false, message: 'الدفع بالبطاقة غير مفعّل بعد' });
    const { data } = await lahza().get(`/transaction/verify/${encodeURIComponent(req.params.reference)}`);
    const t = data?.data || {};
    const orderId = t.metadata?.order_id;
    if (!orderId) return res.status(400).json({ success: false, message: 'مرجع دفع غير صالح' });
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [orderId, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    const expected = Math.round(round2(num(order.total)) * 100);
    const amountOk = t.amount === undefined || Number(t.amount) >= expected;
    const currencyOk = !t.currency || String(t.currency).toUpperCase() === 'ILS';
    const paid = t.status === 'success' && amountOk && currencyOk;
    if (paid) await releaseCardOrder(req.io, order.id, { paid: true, reference: req.params.reference });
    else if (['failed', 'abandoned', 'reversed'].includes(String(t.status || '').toLowerCase()) || (t.status === 'success' && !amountOk)) {
      await releaseCardOrder(req.io, order.id, { paid: false });
    }
    res.json({ success: true, paid, order_id: orderId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.response?.data?.message || 'تعذّر التحقّق من الدفع' });
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

// Stripe — غير مفعّل (لا يوجد عمود/webhook صالح). يرد 503 بدل خطأ 500.
router.post('/intent', auth, (req, res) => res.status(503).json({ success: false, message: 'الدفع عبر Stripe غير مفعّل' }));
router.post('/webhook', (req, res) => res.status(503).json({ success: false, message: 'غير مفعّل' }));

// Wallet transactions
router.get('/wallet/transactions', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json({ success: true, data: rows });
});

// 🔄 مسح دوري: طلبات بطاقة عالقة بانتظار الدفع > 10 دقائق → نتحقق من Lahza (لو فيه مرجع)، وإلا تتحول لنقدي وتُرسل للمطعم
async function sweepPendingCardOrders(io) {
  try {
    const { rows } = await pool.query(
      `SELECT id, payment_reference, total FROM orders
       WHERE payment_method='card' AND COALESCE(payment_status,'pending') <> 'paid' AND status='pending'
         AND COALESCE(total,0) > 0 AND created_at < NOW() - INTERVAL '10 minutes' AND created_at > NOW() - INTERVAL '2 days'
       LIMIT 50`);
    for (const o of rows) {
      let paid = false;
      if (o.payment_reference && lahzaSecret()) {
        try {
          const { data } = await lahza().get(`/transaction/verify/${encodeURIComponent(o.payment_reference)}`);
          const t = data?.data || {};
          paid = t.status === 'success' && String(t.metadata?.order_id) === String(o.id)
            && (t.amount === undefined || Number(t.amount) >= Math.round(round2(num(o.total)) * 100));
        } catch { /* Lahza غير متاح — نحاول لاحقاً */ continue; }
      }
      await releaseCardOrder(io, o.id, paid ? { paid: true, reference: o.payment_reference } : { paid: false });
    }
  } catch (e) { console.error('card sweep error:', e.message); }
}

module.exports = router;
module.exports.sweepPendingCardOrders = sweepPendingCardOrders;
