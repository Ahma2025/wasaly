const pool = require('../config/database');
const nodeFetch = (() => { try { return require('node-fetch'); } catch { return null; } })();
const fetchFn = typeof fetch !== 'undefined' ? fetch : nodeFetch;
const fs = require('fs');
const path = require('path');
const https = require('https');

// ─── FCM v1 API via Service Account ───────────────────────────────────────
let _fcmAccessToken = null;
let _fcmTokenExpiry = 0;

function signJWT(serviceAccount) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })).toString('base64url');
  const toSign = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const sig = sign.sign(serviceAccount.private_key, 'base64url');
  return `${toSign}.${sig}`;
}

async function getFCMAccessToken() {
  if (_fcmAccessToken && Date.now() < _fcmTokenExpiry) return _fcmAccessToken;

  const saPath = path.join(__dirname, '../firebase-service-account.json');
  if (!fs.existsSync(saPath)) return null;

  try {
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    const jwt = signJWT(sa);
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

    const res = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await res.json();
    if (data.access_token) {
      _fcmAccessToken = data.access_token;
      _fcmTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return data.access_token;
    }
    console.error('FCM token error:', data);
    return null;
  } catch (e) {
    console.error('getFCMAccessToken error:', e.message);
    return null;
  }
}

// ─── Save notification to DB ───────────────────────────────────────────────
const saveNotification = async (userId, title, type, data = {}) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title_ar, body_ar, type, data) VALUES ($1,$2,$3,$4,$5)',
      [userId, title, '', type, JSON.stringify(data)]
    );
  } catch (e) { console.error('saveNotification error:', e.message); }
};

// ─── Send FCM push via v1 API ──────────────────────────────────────────────
const sendFCM = async (tokens, title, body, data = {}) => {
  const accessToken = await getFCMAccessToken();
  if (!accessToken) return; // silently skip if not configured

  const saPath = path.join(__dirname, '../firebase-service-account.json');
  if (!fs.existsSync(saPath)) return;
  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

  const validTokens = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  if (!validTokens.length) return;

  const dataPayload = Object.fromEntries(
    Object.entries({ type: '', order_id: '', ...data }).map(([k, v]) => [k, String(v)])
  );

  for (const token of validTokens) {
    try {
      const payload = {
        message: {
          token,
          notification: { title, body },
          data: dataPayload,
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'wasaly_default',
              sound: 'default',
              default_vibrate_timings: true,
              notification_priority: 'PRIORITY_MAX',
              visibility: 'PUBLIC'
            }
          }
        }
      };

      const res = await fetchFn(
        `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify(payload)
        }
      );
      const result = await res.json();
      if (!result.name) console.warn('FCM send issue for token:', result);
    } catch (e) {
      console.error('FCM send error:', e.message);
    }
  }
};

// ─── Get FCM token(s) for a user ──────────────────────────────────────────
const getUserTokens = async (userId) => {
  try {
    const { rows } = await pool.query('SELECT fcm_token FROM users WHERE id=$1 AND fcm_token IS NOT NULL', [userId]);
    return rows.map(r => r.fcm_token).filter(Boolean);
  } catch { return []; }
};

// ─── Full notify: save to DB + send push + emit socket ──────────────────
const notify = async (io, userId, title, body, type, data = {}) => {
  await saveNotification(userId, title, type, data);
  const tokens = await getUserTokens(userId);
  if (tokens.length) await sendFCM(tokens, title, body, { type, ...data });
  if (io) io.to(`user:${userId}`).emit('notification', { title, body, type, data });
};

// ─── Socket-only emit (no push, no DB) ────────────────────────────────────
const notifyUser = (io, userId, event, data) => {
  if (io) io.to(`user:${userId}`).emit(event, data);
};

// ─── Shortcut helpers ─────────────────────────────────────────────────────
const Notify = {
  orderPlaced: (io, restaurantOwnerId, orderNumber, orderId) =>
    notify(io, restaurantOwnerId, '🛎️ طلب جديد!', `طلب #${orderNumber} ينتظر موافقتك`, 'new_order', { order_id: String(orderId) }),

  orderConfirmed: (io, customerId, orderId) =>
    notify(io, customerId, '✅ تم قبول طلبك', 'المطعم قبل طلبك وبدأ التحضير', 'order_confirmed', { order_id: String(orderId) }),

  driverAssigned: (io, customerId, driverName, orderId) =>
    notify(io, customerId, '🛵 السائق في طريقه', `${driverName} توجّه للمطعم لاستلام طلبك`, 'driver_assigned', { order_id: String(orderId) }),

  orderOnTheWay: (io, customerId, orderId) =>
    notify(io, customerId, '🚀 طلبك في الطريق!', 'السائق التقط طلبك وهو في طريقه إليك', 'on_the_way', { order_id: String(orderId) }),

  orderDelivered: (io, customerId, orderId) =>
    notify(io, customerId, '🎉 وصل طلبك!', 'استمتع بوجبتك. بالهناء والشفاء!', 'delivered', { order_id: String(orderId) }),

  orderCancelled: (io, customerId, orderId) =>
    notify(io, customerId, '❌ تم إلغاء الطلب', 'تم إلغاء طلبك. اتصل بنا للمساعدة', 'cancelled', { order_id: String(orderId) }),
};

module.exports = { saveNotification, sendFCM, getUserTokens, notify, notifyUser, Notify };
