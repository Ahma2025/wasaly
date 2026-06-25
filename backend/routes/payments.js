const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

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
