const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

// Save FCM token for push notifications
router.post('/fcm-token', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'token required' });
    await pool.query('UPDATE users SET fcm_token=$1 WHERE id=$2', [token, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get profile
router.get('/profile', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT id,name,email,phone,avatar,wallet_balance,loyalty_points,loyalty_tier,referral_code FROM users WHERE id=$1', [req.user.id]);
  res.json({ success: true, data: rows[0] });
});

// Update profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, email, avatar } = req.body;
    const { rows } = await pool.query('UPDATE users SET name=$1, email=$2, avatar=$3, updated_at=NOW() WHERE id=$4 RETURNING id,name,email,phone,avatar', [name, email, avatar, req.user.id]);
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Get addresses
router.get('/addresses', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY is_default DESC', [req.user.id]);
  res.json({ success: true, data: rows });
});

// Add address
router.post('/addresses', auth, async (req, res) => {
  try {
    const { label, title, address, lat, lng, floor, notes } = req.body;
    if (req.body.is_default) {
      await pool.query('UPDATE addresses SET is_default=0 WHERE user_id=$1', [req.user.id]);
    }
    const { rows } = await pool.query(
      `INSERT INTO addresses (user_id, label, title, address, lat, lng, floor, notes, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.id, label || 'منزل', title || address, address, lat || null, lng || null, floor || null, notes || null, req.body.is_default ? 1 : 0]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Update address
router.put('/addresses/:id', auth, async (req, res) => {
  try {
    const { label, title, address, lat, lng, floor, notes, is_default } = req.body;
    if (is_default) await pool.query('UPDATE addresses SET is_default=0 WHERE user_id=$1', [req.user.id]);
    const { rows } = await pool.query(
      `UPDATE addresses SET label=$1, title=$2, address=$3, lat=$4, lng=$5, floor=$6, notes=$7, is_default=$8
       WHERE id=$9 AND user_id=$10 RETURNING *`,
      [label, title, address, lat, lng, floor, notes, is_default ? 1 : 0, req.params.id, req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Delete address
router.delete('/addresses/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ success: true });
});

// Favorites
router.get('/favorites', auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.* FROM favorites f JOIN restaurants r ON f.restaurant_id=r.id WHERE f.user_id=$1`, [req.user.id]
  );
  res.json({ success: true, data: rows });
});

router.post('/favorites/:restaurantId', auth, async (req, res) => {
  try {
    await pool.query('INSERT INTO favorites (user_id, restaurant_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.restaurantId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/favorites/:restaurantId', auth, async (req, res) => {
  await pool.query('DELETE FROM favorites WHERE user_id=$1 AND restaurant_id=$2', [req.user.id, req.params.restaurantId]);
  res.json({ success: true });
});

// Loyalty
router.get('/loyalty', auth, async (req, res) => {
  const { rows: transactions } = await pool.query(
    'SELECT * FROM loyalty_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]
  );
  const { rows: user } = await pool.query('SELECT loyalty_points, loyalty_tier FROM users WHERE id=$1', [req.user.id]);
  res.json({ success: true, data: { ...user[0], transactions } });
});

module.exports = router;
