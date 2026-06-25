const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json({ success: true, data: rows });
});

router.patch('/read-all', auth, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
  res.json({ success: true });
});

router.patch('/:id/read', auth, async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ success: true });
});

router.get('/unread-count', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false', [req.user.id]);
  res.json({ success: true, count: parseInt(rows[0].count) });
});

module.exports = router;
