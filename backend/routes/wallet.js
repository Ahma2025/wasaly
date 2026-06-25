const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

router.get('/balance', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT wallet_balance FROM users WHERE id=$1', [req.user.id]);
  res.json({ success: true, balance: rows[0].wallet_balance });
});

router.get('/transactions', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json({ success: true, data: rows });
});

module.exports = router;
