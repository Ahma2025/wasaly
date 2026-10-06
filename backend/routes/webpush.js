const router = require('express').Router();
const webpush = require('web-push');
const pool = require('../config/database');
const { serverError } = require('../utils/http');
const { auth } = require('../middleware/auth');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:engahmadjamall00@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const MAX_SUBS_PER_RESTAURANT = 10;
const endpointOf = (s) => { try { return (typeof s === 'string' ? JSON.parse(s) : s)?.endpoint || null; } catch { return null; } };

// Return public VAPID key to frontend
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Save subscription from restaurant portal
// R-17: upsert حسب endpoint (كل متصفح/جهاز يحتفظ باشتراكه) بدل حذف كل اشتراكات المطعم — حد أقصى 10 لكل مطعم
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription, restaurant_id } = req.body;
    if (!subscription || !restaurant_id || !/^\d+$/.test(String(restaurant_id))) return res.status(400).json({ success: false });
    if (typeof subscription !== 'object' || !subscription.endpoint) return res.status(400).json({ success: false, message: 'اشتراك غير صالح' });
    // 🔒 فقط صاحب المطعم (أو الإدارة) يقدر يسجّل اشتراك إشعارات لمطعمه
    if (req.user.role !== 'admin') {
      const { rows } = await pool.query('SELECT 1 FROM restaurants WHERE id=$1 AND owner_id=$2', [restaurant_id, req.user.id]);
      if (!rows[0]) return res.status(403).json({ success: false, message: 'غير مصرح' });
    }
    const subStr = JSON.stringify(subscription);
    const { rows: existing } = await pool.query('SELECT id, subscription FROM web_push_subscriptions WHERE restaurant_id=$1 ORDER BY id', [restaurant_id]);
    const same = existing.filter(r => endpointOf(r.subscription) === subscription.endpoint);
    if (same.length) {
      await pool.query('UPDATE web_push_subscriptions SET subscription=$1 WHERE id=$2', [subStr, same[0].id]);
      for (const r of same.slice(1)) await pool.query('DELETE FROM web_push_subscriptions WHERE id=$1', [r.id]);
    } else {
      await pool.query('INSERT INTO web_push_subscriptions (restaurant_id, subscription) VALUES ($1, $2)', [restaurant_id, subStr]);
      const extra = existing.length + 1 - MAX_SUBS_PER_RESTAURANT;
      for (const r of existing.slice(0, Math.max(0, extra))) await pool.query('DELETE FROM web_push_subscriptions WHERE id=$1', [r.id]);
    }
    res.json({ success: true });
  } catch (e) {
    serverError(res, e);
  }
});

// Send web push to a restaurant — R-17: يُحذف فقط الاشتراك المنتهي (404/410)، لا كل اشتراكات المطعم
async function sendWebPush(restaurantId, title, body, data = {}) {
  try {
    const { rows } = await pool.query(
      'SELECT id, subscription FROM web_push_subscriptions WHERE restaurant_id=$1',
      [restaurantId]
    );
    for (const row of rows) {
      let sub;
      try { sub = JSON.parse(row.subscription); } catch { await pool.query('DELETE FROM web_push_subscriptions WHERE id=$1', [row.id]).catch(() => {}); continue; }
      await webpush.sendNotification(sub, JSON.stringify({ title, body, data })).catch((err) => {
        const code = err && err.statusCode;
        if (code === 404 || code === 410) pool.query('DELETE FROM web_push_subscriptions WHERE id=$1', [row.id]).catch(() => {});
      });
    }
  } catch (e) {
    console.error('Web push error:', e.message);
  }
}

module.exports = { router, sendWebPush };
