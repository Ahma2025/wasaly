const router = require('express').Router();
const pool = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');
const { saveNotification, sendFCM, getUserTokens, notifyUser } = require('../utils/notifications');

// نوع المستخدم بالعربي (للإدارة)
const roleAr = (role) => ({ customer: 'زبون', driver: 'سائق', restaurant: 'صاحب مطعم', restaurant_owner: 'صاحب مطعم', admin: 'إدارة' }[role] || 'مستخدم');
// حزمة التطبيق حسب الدور (للإشعار)
const bundleFor = (role) => ({ driver: 'com.wasaly.driver', restaurant: 'com.wasaly.restaurant', restaurant_owner: 'com.wasaly.restaurant' }[role] || 'com.wasaly.customer');

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

// ===== شات الدعم مع الإدارة =====

// محادثتي (المستخدم: زبون/سائق/مطعم)
router.get('/chat', auth, async (req, res) => {
  try {
    const uid = String(req.user.id);
    const { rows } = await pool.query('SELECT id, sender, message, created_at FROM support_chat WHERE user_id=$1 ORDER BY created_at ASC', [uid]);
    await pool.query("UPDATE support_chat SET is_read=true WHERE user_id=$1 AND sender='admin'", [uid]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// إرسال رسالة (المستخدم) + إشعار الإدارة
router.post('/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
    const uid = String(req.user.id);
    const { rows } = await pool.query(
      "INSERT INTO support_chat (user_id, sender, message) VALUES ($1,'user',$2) RETURNING id, sender, message, created_at",
      [uid, String(message).trim()]
    );
    try {
      const { rows: me } = await pool.query('SELECT name, role FROM users WHERE id::text=$1', [uid]);
      const name = me[0]?.name || 'مستخدم';
      const note = `💬 رسالة جديدة من ${name} (${roleAr(me[0]?.role)})`;
      const { rows: admins } = await pool.query("SELECT id FROM users WHERE role='admin'");
      for (const a of admins) { saveNotification(a.id, note, 'support', { user_id: uid }); notifyUser(req.io, a.id, 'support_message', { user_id: uid }); }
    } catch (e) {}
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// قائمة المحادثات (الإدارة)
router.get('/chat/conversations', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.user_id, u.name, u.role, u.phone,
              (SELECT message FROM support_chat WHERE user_id=c.user_id ORDER BY created_at DESC LIMIT 1) AS last_message,
              MAX(c.created_at) AS last_at,
              COUNT(*) FILTER (WHERE c.sender='user' AND c.is_read=false) AS unread
       FROM support_chat c LEFT JOIN users u ON u.id::text = c.user_id
       GROUP BY c.user_id, u.name, u.role, u.phone
       ORDER BY last_at DESC`
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, role_ar: roleAr(r.role) })) });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// محادثة مستخدم معيّن (الإدارة) + تعليمها مقروءة
router.get('/chat/user/:userId', auth, adminOnly, async (req, res) => {
  try {
    const uid = String(req.params.userId);
    const { rows } = await pool.query('SELECT id, sender, message, created_at FROM support_chat WHERE user_id=$1 ORDER BY created_at ASC', [uid]);
    await pool.query("UPDATE support_chat SET is_read=true WHERE user_id=$1 AND sender='user'", [uid]);
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ردّ الإدارة على مستخدم + إشعاره
router.post('/chat/user/:userId', auth, adminOnly, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
    const uid = String(req.params.userId);
    const msg = String(message).trim();
    const { rows } = await pool.query(
      "INSERT INTO support_chat (user_id, sender, message) VALUES ($1,'admin',$2) RETURNING id, sender, message, created_at",
      [uid, msg]
    );
    try {
      const { rows: ur } = await pool.query('SELECT role FROM users WHERE id::text=$1', [uid]);
      const role = ur[0]?.role || 'customer';
      saveNotification(uid, `وصلي إدارة: ${msg}`, 'support', {});
      notifyUser(req.io, uid, 'support_message', {});
      try { const t = await getUserTokens(uid); if (t.length) await sendFCM(t, '💬 وصلي إدارة', msg, { type: 'support' }, bundleFor(role)); } catch {}
    } catch (e) {}
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
