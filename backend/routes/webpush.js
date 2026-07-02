const router = require('express').Router();
const webpush = require('web-push');
const pool = require('../config/database');
const { auth } = require('../middleware/auth');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:engahmadjamall00@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Return public VAPID key to frontend
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// Save subscription from restaurant portal
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, restaurant_id } = req.body;
    if (!subscription || !restaurant_id) return res.status(400).json({ success: false });

    const subStr = JSON.stringify(subscription);
    // Upsert: delete old then insert
    pool.query('DELETE FROM web_push_subscriptions WHERE restaurant_id=$1', [restaurant_id]);
    pool.query('INSERT INTO web_push_subscriptions (restaurant_id, subscription) VALUES ($1, $2)', [restaurant_id, subStr]);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Send web push to a restaurant
async function sendWebPush(restaurantId, title, body, data = {}) {
  try {
    const { rows } = await pool.query(
      'SELECT subscription FROM web_push_subscriptions WHERE restaurant_id=$1',
      [restaurantId]
    );
    for (const row of rows) {
      const sub = JSON.parse(row.subscription);
      await webpush.sendNotification(sub, JSON.stringify({ title, body, data })).catch(() => {
        // Remove invalid subscription
        pool.query('DELETE FROM web_push_subscriptions WHERE restaurant_id=$1', [restaurantId]);
      });
    }
  } catch (e) {
    console.error('Web push error:', e.message);
  }
}

module.exports = { router, sendWebPush };
