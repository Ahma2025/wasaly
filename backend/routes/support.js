const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

router.post('/tickets', auth, async (req, res) => {
  const { subject, order_id, message } = req.body;
  const { rows } = await pool.query('INSERT INTO support_tickets (user_id, order_id, subject) VALUES ($1,$2,$3) RETURNING *', [req.user.id, order_id, subject]);
  await pool.query('INSERT INTO support_messages (ticket_id, sender_id, message) VALUES ($1,$2,$3)', [rows[0].id, req.user.id, message]);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/tickets', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json({ success: true, data: rows });
});

router.get('/tickets/:id/messages', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT sm.*, u.name FROM support_messages sm JOIN users u ON sm.sender_id=u.id WHERE sm.ticket_id=$1 ORDER BY sm.created_at', [req.params.id]);
  res.json({ success: true, data: rows });
});

router.post('/tickets/:id/messages', auth, async (req, res) => {
  const { message } = req.body;
  const { rows } = await pool.query('INSERT INTO support_messages (ticket_id, sender_id, message, is_admin) VALUES ($1,$2,$3,$4) RETURNING *', [req.params.id, req.user.id, message, req.user.role === 'admin']);
  res.status(201).json({ success: true, data: rows[0] });
});

router.get('/admin/tickets', auth, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT st.*, u.name, u.phone FROM support_tickets st JOIN users u ON st.user_id=u.id ORDER BY created_at DESC LIMIT 50');
  res.json({ success: true, data: rows });
});

module.exports = router;
