// 👥 الطلب الجماعي "كسر الحساب" — سلّة مشتركة برابط/كود، والمضيف يدفع
const router = require('express').Router();
const pool = require('../config/database');
const { auth } = require('../middleware/auth');
const { notifyUser } = require('../utils/notifications');

// كود قصير فريد (بدون أحرف ملتبسة)
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// إشعار لحظي لكل المشاركين + المضيف بأي تحديث على المجموعة
async function notifyGroup(io, groupId, extra = {}) {
  try {
    const { rows: g } = await pool.query('SELECT host_id, code FROM group_orders WHERE id=$1', [groupId]);
    if (!g[0]) return;
    const { rows: parts } = await pool.query('SELECT DISTINCT user_id FROM group_order_items WHERE group_id=$1', [groupId]);
    const ids = new Set([String(g[0].host_id), ...parts.map(p => String(p.user_id))]);
    for (const uid of ids) notifyUser(io, uid, 'group:updated', { group_id: groupId, code: g[0].code, ...extra });
  } catch (e) { console.error('notifyGroup:', e.message); }
}

// إنشاء مجموعة جديدة (المُنشئ = المضيف)
router.post('/', auth, async (req, res) => {
  try {
    const { restaurant_id, restaurant_name } = req.body;
    if (!restaurant_id) return res.status(400).json({ success: false, message: 'المطعم مطلوب' });
    let code;
    for (let tries = 0; tries < 8; tries++) {
      code = genCode();
      const { rows } = await pool.query('SELECT 1 FROM group_orders WHERE code=$1', [code]);
      if (!rows[0]) break;
    }
    const { rows } = await pool.query(
      `INSERT INTO group_orders (code, host_id, restaurant_id, restaurant_name, status)
       VALUES ($1,$2,$3,$4,'open') RETURNING *`,
      [code, String(req.user.id), String(restaurant_id), restaurant_name || '']
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// عرض مجموعة بالكود (المطعم + الأصناف + الإجمالي + عدد المشاركين)
router.get('/:code', auth, async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase();
    const { rows: g } = await pool.query('SELECT * FROM group_orders WHERE code=$1', [code]);
    if (!g[0]) return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    const group = g[0];
    const { rows: items } = await pool.query(
      'SELECT * FROM group_order_items WHERE group_id=$1 ORDER BY created_at', [group.id]
    );
    const parsed = items.map(it => {
      let options = [];
      try { options = JSON.parse(it.options || '[]'); } catch { options = []; }
      return {
        ...it,
        options,
        user_name: it.user_name || 'مشارك',
        is_mine: String(it.user_id) === String(req.user.id),
      };
    });
    const total = parsed.reduce((s, it) => {
      const addons = (it.options || []).reduce((a, o) => a + parseFloat(o.price || 0), 0);
      return s + (parseFloat(it.price || 0) + addons) * (parseInt(it.quantity) || 1);
    }, 0);
    res.json({
      success: true,
      data: {
        ...group,
        is_host: String(group.host_id) === String(req.user.id),
        items: parsed,
        total,
        participant_count: new Set(parsed.map(p => String(p.user_id))).size,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// إضافة صنف للمجموعة
router.post('/:id/items', auth, async (req, res) => {
  try {
    const { menu_item_id, name, price, image, quantity = 1, options, notes } = req.body;
    const { rows: g } = await pool.query('SELECT status FROM group_orders WHERE id=$1', [req.params.id]);
    if (!g[0]) return res.status(404).json({ success: false, message: 'المجموعة غير موجودة' });
    if (g[0].status !== 'open') return res.status(400).json({ success: false, message: 'المجموعة مقفلة، لا يمكن الإضافة' });
    const userName = req.user.name || 'مشارك';
    const { rows } = await pool.query(
      `INSERT INTO group_order_items (group_id, user_id, user_name, menu_item_id, name, price, image, quantity, options, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.params.id, String(req.user.id), userName, String(menu_item_id || ''), name || '',
       parseFloat(price) || 0, image || '', parseInt(quantity) || 1, JSON.stringify(options || []), notes || '']
    );
    await notifyGroup(req.io, req.params.id);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// حذف صنف (صاحبه أو المضيف)
router.delete('/:id/items/:itemId', auth, async (req, res) => {
  try {
    const { rows: g } = await pool.query('SELECT host_id FROM group_orders WHERE id=$1', [req.params.id]);
    if (!g[0]) return res.status(404).json({ success: false });
    const { rows: it } = await pool.query('SELECT user_id FROM group_order_items WHERE id=$1 AND group_id=$2', [req.params.itemId, req.params.id]);
    if (!it[0]) return res.status(404).json({ success: false });
    const isOwner = String(it[0].user_id) === String(req.user.id);
    const isHost = String(g[0].host_id) === String(req.user.id);
    if (!isOwner && !isHost) return res.status(403).json({ success: false, message: 'غير مصرح' });
    await pool.query('DELETE FROM group_order_items WHERE id=$1', [req.params.itemId]);
    await notifyGroup(req.io, req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// تعليم المجموعة "تم الطلب" أو "ملغاة" — المضيف فقط
router.post('/:id/close', auth, async (req, res) => {
  try {
    const { status = 'ordered', order_id } = req.body;
    const { rows: g } = await pool.query('SELECT host_id FROM group_orders WHERE id=$1', [req.params.id]);
    if (!g[0]) return res.status(404).json({ success: false });
    if (String(g[0].host_id) !== String(req.user.id)) return res.status(403).json({ success: false, message: 'المضيف فقط يقدر يقفل المجموعة' });
    await pool.query('UPDATE group_orders SET status=$1, order_id=$2 WHERE id=$3',
      [status, order_id ? String(order_id) : null, req.params.id]);
    await notifyGroup(req.io, req.params.id, { status });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
