const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const axios = require('axios');
const { releaseCardOrder, round2, num, paymentRefs, statusLabel } = require('../utils/orderService');

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

const expectedAmount = (order) => Math.round(round2(num(order.total)) * 100); // بالأغورة (ILS × 100)

/** يتحقق من مرجع واحد لدى Lahza لهذا الطلب. يرمي عند تعذّر الاتصال. */
async function verifyRef(order, reference) {
  const { data } = await lahza().get(`/transaction/verify/${encodeURIComponent(reference)}`);
  const t = data?.data || {};
  const sameOrder = !t.metadata || t.metadata.order_id === undefined || String(t.metadata.order_id) === String(order.id);
  const amountOk = t.amount === undefined || Number(t.amount) >= expectedAmount(order);
  const currencyOk = !t.currency || String(t.currency).toUpperCase() === 'ILS';
  return { paid: t.status === 'success' && sameOrder && amountOk && currencyOk, status: String(t.status || '').toLowerCase(), t };
}

/** C-04: يفحص كل مراجع الطلب (الحالي + السابقة). { paid, reference } — يرمي عند تعذّر الاتصال بـ Lahza */
async function findPaidRef(order, max = 4) {
  for (const ref of paymentRefs(order).slice(0, max)) {
    const v = await verifyRef(order, ref);
    if (v.paid) return { paid: true, reference: ref };
  }
  return { paid: false };
}

const orderState = (o) => o ? ({
  order_id: o.id, payment_method: o.payment_method, payment_status: o.payment_status, status: o.status, status_label: statusLabel(o),
}) : {};

// بدء عملية دفع — يرجّع رابط دفع آمن يفتح داخل التطبيق
router.post('/lahza/init', auth, async (req, res) => {
  let order_id = null;
  try {
    if (!/^\d+$/.test(String(req.body.order_id || ''))) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [req.body.order_id, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (order.payment_status === 'paid') return res.status(400).json({ success: false, message: 'الطلب مدفوع مسبقاً', code: 'ALREADY_PAID', ...orderState(order) });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, message: 'الطلب ملغى', code: 'CANCELLED', ...orderState(order) });
    // 🛑 C-03: طلب حُوّل لنقدي (أو أُنشئ نقدياً) لا يُفتح له دفع بطاقة — وإلا يدفع الزبون بالبطاقة ويحصّل السائق كاشاً
    if (order.payment_method !== 'card') {
      return res.status(409).json({ success: false, code: 'NOT_CARD', message: 'طلبك محوّل للدفع كاش عند الاستلام — لا حاجة للدفع بالبطاقة', ...orderState(order) });
    }
    if (!lahzaSecret()) {
      const rel = await releaseCardOrder(req.io, order.id, { paid: false }).catch(() => null);
      return res.status(503).json({ success: false, message: 'الدفع بالبطاقة غير مفعّل بعد — طلبك محفوظ للدفع كاش عند الاستلام', released_to_cash: true, ...orderState(rel || { ...order, payment_method: 'cash' }) });
    }
    order_id = order.id;

    // 🔁 C-04: قبل فتح عملية جديدة نتحقق من المراجع السابقة — لا نكتب فوق دفعة ناجحة
    if (paymentRefs(order).length) {
      let prev;
      try { prev = await findPaidRef(order); }
      catch (e) {
        order_id = null; // لا نحوّل لنقدي بسبب تعذّر التحقق
        return res.status(503).json({ success: false, code: 'VERIFY_FAILED', retryable: true, message: 'تعذّر التحقق من دفعتك السابقة، حاول مرة أخرى بعد لحظات' });
      }
      if (prev.paid) {
        const rel = await releaseCardOrder(req.io, order.id, { paid: true, reference: prev.reference });
        return res.json({ success: true, already_paid: true, paid: true, reference: prev.reference, ...orderState(rel || { ...order, payment_status: 'paid' }) });
      }
    }

    const u = await pool.query('SELECT email, phone FROM users WHERE id=$1', [req.user.id]);
    const user = u.rows[0] || {};
    const email = user.email || `${user.phone || 'user' + req.user.id}@wasaly.ps`;
    const { data } = await lahza().post('/transaction/initialize', {
      email, mobile: user.phone || '', amount: expectedAmount(order), currency: 'ILS',
      callback_url: `${publicApiUrl(req)}/payments/lahza/callback`,
      metadata: { order_id: order.id, user_id: req.user.id },
    });
    const d = data?.data || {};
    if (!d.authorization_url) {
      const rel = await releaseCardOrder(req.io, order.id, { paid: false }).catch(() => null);
      return res.status(502).json({ success: false, message: 'تعذّر بدء الدفع — طلبك محفوظ للدفع كاش عند الاستلام', released_to_cash: !!rel, ...orderState(rel || order) });
    }
    if (d.reference) {
      // المرجع السابق يُحفظ في السجل (لا يضيع) — المسح الدوري والتحقق يفحصان كل المراجع
      await pool.query(
        `UPDATE orders SET payment_ref_history = CASE WHEN payment_reference IS NULL OR payment_reference = $1 THEN payment_ref_history
                 ELSE concat_ws(',', NULLIF(payment_ref_history,''), payment_reference) END,
               payment_reference=$1 WHERE id=$2`, [d.reference, order.id]);
      require('../utils/cache').invalidateRestaurantOrders(order.restaurant_id);
    }
    res.json({ success: true, authorization_url: d.authorization_url, reference: d.reference });
  } catch (e) {
    // التطبيق يخبر الزبون أن الطلب محفوظ للدفع عند الاستلام → نطلقه كطلب نقدي (ونخبره بذلك صراحةً)
    let rel = null;
    if (order_id) rel = await releaseCardOrder(req.io, order_id, { paid: false }).catch(() => null);
    res.status(500).json({ success: false, message: e.response?.data?.message || 'تعذّر بدء الدفع', released_to_cash: !!rel, ...(rel ? orderState(rel) : {}) });
  }
});

// التحقّق من الدفع — عند النجاح: الطلب مدفوع ويُرسل للمطعم الآن. عند الفشل النهائي: يتحوّل لنقدي (كما يَعِد التطبيق)
router.get('/lahza/verify/:reference', auth, async (req, res) => {
  try {
    if (!lahzaSecret()) return res.status(503).json({ success: false, message: 'الدفع بالبطاقة غير مفعّل بعد' });
    let t;
    try { ({ data: { data: t = {} } = {} } = await lahza().get(`/transaction/verify/${encodeURIComponent(req.params.reference)}`)); }
    catch (e) {
      // C-04: تعذّر التحقق (شبكة) ≠ فشل الدفع → أعد التحقق بنفس المرجع، لا تبدأ دفعاً جديداً
      return res.status(502).json({ success: false, code: 'VERIFY_FAILED', retryable: true, message: 'تعذّر التحقّق من الدفع — أعد المحاولة (لا تدفع مرة ثانية)' });
    }
    t = t || {};
    const orderId = t.metadata?.order_id;
    if (!orderId) return res.status(400).json({ success: false, message: 'مرجع دفع غير صالح' });
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [orderId, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

    const amountOk = t.amount === undefined || Number(t.amount) >= expectedAmount(order);
    const currencyOk = !t.currency || String(t.currency).toUpperCase() === 'ILS';
    const st = String(t.status || '').toLowerCase();
    const paid = st === 'success' && amountOk && currencyOk;
    let cur = order;
    if (paid) cur = (await releaseCardOrder(req.io, order.id, { paid: true, reference: req.params.reference })) || order;
    else if (['failed', 'abandoned', 'reversed'].includes(st) || (st === 'success' && !amountOk)) {
      cur = (await releaseCardOrder(req.io, order.id, { paid: false })) || order;
    }
    if (paid && cur.payment_status !== 'paid') cur = { ...cur, payment_status: 'paid' };
    // pending=true: العملية لم تنتهِ بعد لدى Lahza → أعد التحقق لاحقاً بنفس المرجع
    res.json({ success: true, paid, order_id: orderId, lahza_status: st || null, pending: !paid && !['failed', 'abandoned', 'reversed', 'success'].includes(st), ...orderState(cur) });
  } catch (e) {
    res.status(500).json({ success: false, code: 'VERIFY_FAILED', retryable: true, message: e.response?.data?.message || 'تعذّر التحقّق من الدفع' });
  }
});

// 💵 C-02: الزبون أوقف الدفع بالبطاقة أو اختار "الدفع كاش عند الاستلام" → نتأكد من Lahza أنه لم يدفع، ثم نحوّله لنقدي ونطلقه للمطعم فوراً
// الرد: { paid } لو تبيّن أنه مدفوع فعلاً، أو { released, payment_method:'cash' }
router.post('/lahza/abandon', auth, async (req, res) => {
  try {
    const id = (req.body || {}).order_id;
    if (!/^\d+$/.test(String(id || ''))) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    const { rows } = await pool.query('SELECT * FROM orders WHERE id=$1 AND customer_id=$2', [id, req.user.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (order.payment_status === 'paid') return res.json({ success: true, paid: true, released: false, ...orderState(order) });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, code: 'CANCELLED', message: 'الطلب ملغى', ...orderState(order) });
    if (order.payment_method !== 'card') return res.json({ success: true, paid: false, released: true, already: true, ...orderState(order) });

    if (lahzaSecret() && paymentRefs(order).length) {
      let found;
      try { found = await findPaidRef(order); }
      catch (e) {
        return res.status(503).json({ success: false, code: 'VERIFY_FAILED', retryable: true, message: 'تعذّر التأكد من حالة الدفع، حاول مرة أخرى بعد لحظات' });
      }
      if (found.paid) {
        const rel = await releaseCardOrder(req.io, order.id, { paid: true, reference: found.reference });
        return res.json({ success: true, paid: true, released: false, message: 'تم الدفع بالبطاقة بنجاح', ...orderState(rel || { ...order, payment_status: 'paid' }) });
      }
    }
    const rel = await releaseCardOrder(req.io, order.id, { paid: false });
    if (!rel) {
      const { rows: again } = await pool.query('SELECT * FROM orders WHERE id=$1', [order.id]);
      return res.json({ success: true, paid: again[0]?.payment_status === 'paid', released: again[0]?.payment_method === 'cash', ...orderState(again[0]) });
    }
    res.json({ success: true, paid: false, released: true, message: 'تم تحويل طلبك للدفع كاش عند الاستلام وإرساله للمطعم', ...orderState(rel) });
  } catch (e) {
    console.error('lahza abandon:', e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ، حاول مرة أخرى' });
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

// 🔄 مسح دوري:
//  1) طلبات بطاقة عالقة بانتظار الدفع > 10 دقائق → نتحقق من كل مراجعها لدى Lahza، وإلا تتحول لنقدي وتُرسل للمطعم
//  2) C-03/C-04: طلبات حُوّلت لنقدي ولها مرجع دفع (قد يكون الزبون أكمل الدفع لاحقاً) → إن ثبت الدفع: مدفوعة + تنبيه (لا يحصّل السائق كاشاً)
const _lateChecked = new Map(); // orderId → ts (فحص كل 5 دقائق كحد أقصى)
async function sweepPendingCardOrders(io) {
  try {
    const { rows } = await pool.query(
      `SELECT id, payment_reference, payment_ref_history, total FROM orders
       WHERE payment_method='card' AND COALESCE(payment_status,'pending') <> 'paid' AND status='pending'
         AND COALESCE(total,0) > 0 AND created_at < NOW() - INTERVAL '10 minutes' AND created_at > NOW() - INTERVAL '2 days'
       LIMIT 50`);
    for (const o of rows) {
      let found = { paid: false };
      if (paymentRefs(o).length && lahzaSecret()) {
        try { found = await findPaidRef(o); } catch { /* Lahza غير متاح — نحاول لاحقاً */ continue; }
      }
      await releaseCardOrder(io, o.id, found.paid ? { paid: true, reference: found.reference } : { paid: false });
    }
    if (!lahzaSecret()) return;
    const { rows: late } = await pool.query(
      `SELECT id, payment_reference, payment_ref_history, total FROM orders
       WHERE payment_method='cash' AND payment_reference IS NOT NULL AND COALESCE(payment_status,'pending') <> 'paid'
         AND status <> 'delivered' AND COALESCE(total,0) > 0 AND created_at > NOW() - INTERVAL '1 day'
       ORDER BY created_at DESC LIMIT 30`);
    const now = Date.now();
    for (const o of late) {
      if (now - (_lateChecked.get(String(o.id)) || 0) < 5 * 60 * 1000) continue;
      _lateChecked.set(String(o.id), now);
      try {
        const found = await findPaidRef(o);
        if (found.paid) await releaseCardOrder(io, o.id, { paid: true, reference: found.reference });
      } catch { /* لاحقاً */ }
    }
    if (_lateChecked.size > 5000) _lateChecked.clear();
  } catch (e) { console.error('card sweep error:', e.message); }
}

module.exports = router;
module.exports.sweepPendingCardOrders = sweepPendingCardOrders;
