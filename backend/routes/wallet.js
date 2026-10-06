const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { clampInt } = require('../utils/http');

router.get('/balance', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT wallet_balance FROM users WHERE id=$1', [req.user.id]);
  res.json({ success: true, balance: rows[0].wallet_balance });
});

// C-61: سجل المحفظة مع ترقيم صفحات (?limit=30&offset=0)
router.get('/transactions', auth, async (req, res) => {
  const limit = clampInt(req.query.limit, 30, 1, 100);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  const { rows } = await pool.query('SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3', [req.user.id, limit, offset]);
  res.json({ success: true, data: rows });
});

module.exports = router;
