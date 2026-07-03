const pool = require('../config/database');
const nodeFetch = (() => { try { return require('node-fetch'); } catch { return null; } })();
const fetchFn = typeof fetch !== 'undefined' ? fetch : nodeFetch;
const fs = require('fs');
const path = require('path');

// ─── APNs token detection ─────────────────────────────────────────────────
// APNs tokens are exactly 64-char hex strings; FCM tokens are much longer with special chars
function isApnsToken(token) {
  return token && /^[0-9a-f]{64}$/i.test(token);
}

// ─── APNs direct send ─────────────────────────────────────────────────────
let _apnsProvider = null;

function getApnsProvider() {
  if (_apnsProvider) return _apnsProvider;

  const keyId  = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID || 'RTYG6CS9G2';
  if (!keyId) return null;

  // Prefer env var (base64) → then local file
  let keyContent = null;
  const keyBase64 = process.env.APNS_KEY_BASE64;
  const keyPath   = path.join(__dirname, '../apns-key.p8');

  if (keyBase64) {
    keyContent = Buffer.from(keyBase64, 'base64').toString('utf8');
  } else if (fs.existsSync(keyPath)) {
    keyContent = fs.readFileSync(keyPath, 'utf8');
  }

  if (!keyContent) return null;

  try {
    const apn = require('@parse/node-apn');
    _apnsProvider = new apn.Provider({
      token: {
        key: keyContent,
        keyId,
        teamId,
      },
      production: true,
    });
    console.log('[APNs] Provider initialized ✅');
    return _apnsProvider;
  } catch (e) {
    console.error('[APNs] Provider init error:', e.message);
    return null;
  }
}

const BUNDLE_IDS = {
  customer:   'com.wasaly.customer',
  driver:     'com.wasaly.driver',
  restaurant: 'com.wasaly.restaurant',
  admin:      'com.wasaly.admin',
};

async function sendApns(tokens, title, body, data = {}, bundleId = 'com.wasaly.customer') {
  const provider = getApnsProvider();
  if (!provider) {
    console.warn('[APNs] No provider — set APNS_KEY_ID env var and place apns-key.p8 in backend/');
    return;
  }

  const apn = require('@parse/node-apn');
  const validTokens = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  if (!validTokens.length) return;

  const note = new apn.Notification();
  note.expiry       = Math.floor(Date.now() / 1000) + 3600;
  note.badge        = 1;
  note.sound        = 'default';
  note.alert        = { title, body };
  note.topic        = bundleId;
  note.payload      = { data };
  note.priority     = 10;
  note.pushType     = 'alert';

  for (const token of validTokens) {
    try {
      const result = await provider.send(note, token);
      if (result.failed.length) {
        console.warn('[APNs] Failed:', JSON.stringify(result.failed[0]));
      }
    } catch (e) {
      console.error('[APNs] send error:', e.message);
    }
  }
}

// ─── FCM v1 API via Service Account ──────────────────────────────────────
let _fcmAccessToken = null;
let _fcmTokenExpiry = 0;

function signJWT(serviceAccount) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
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
    const res  = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json();
    if (data.access_token) {
      _fcmAccessToken = data.access_token;
      _fcmTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return data.access_token;
    }
    console.error('[FCM] token error:', data);
    return null;
  } catch (e) {
    console.error('[FCM] getFCMAccessToken error:', e.message);
    return null;
  }
}

async function sendFcmToken(token, title, body, data = {}) {
  const accessToken = await getFCMAccessToken();
  if (!accessToken) return;

  const saPath = path.join(__dirname, '../firebase-service-account.json');
  if (!fs.existsSync(saPath)) return;
  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

  const dataPayload = Object.fromEntries(
    Object.entries({ type: '', order_id: '', ...data }).map(([k, v]) => [k, String(v)])
  );

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
          visibility: 'PUBLIC',
        },
      },
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
            'mutable-content': 1,
          },
        },
      },
    },
  };

  try {
    const res = await fetchFn(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      }
    );
    const result = await res.json();
    if (!result.name) console.warn('[FCM] send issue:', JSON.stringify(result));
  } catch (e) {
    console.error('[FCM] send error:', e.message);
  }
}

// ─── Unified send: auto-routes iOS → APNs, Android → FCM ─────────────────
const sendFCM = async (tokens, title, body, data = {}, bundleId = 'com.wasaly.customer') => {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  const apnsTokens = list.filter(isApnsToken);
  const fcmTokens  = list.filter(t => !isApnsToken(t));

  const promises = [];
  if (apnsTokens.length) promises.push(sendApns(apnsTokens, title, body, data, bundleId));
  for (const t of fcmTokens) promises.push(sendFcmToken(t, title, body, data));
  await Promise.allSettled(promises);
};

// ─── Save notification to DB ───────────────────────────────────────────────
const saveNotification = async (userId, title, type, data = {}) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title_ar, body_ar, type, data) VALUES ($1,$2,$3,$4,$5)',
      [userId, title, '', type, JSON.stringify(data)]
    );
  } catch (e) { console.error('saveNotification error:', e.message); }
};

// ─── Get tokens for a user ────────────────────────────────────────────────
// Returns plain token strings (backward-compatible)
const getUserTokens = async (userId) => {
  try {
    const { rows } = await pool.query(
      'SELECT fcm_token FROM users WHERE id=$1 AND fcm_token IS NOT NULL',
      [userId]
    );
    return rows.map(r => r.fcm_token).filter(Boolean);
  } catch { return []; }
};

// Internal: get tokens + role for bundle ID routing
async function getUserTokensWithRole(userId) {
  try {
    const { rows } = await pool.query(
      'SELECT fcm_token, role FROM users WHERE id=$1 AND fcm_token IS NOT NULL',
      [userId]
    );
    return rows.filter(r => r.fcm_token);
  } catch { return []; }
}

function bundleForRole(role) {
  if (role === 'driver')           return BUNDLE_IDS.driver;
  if (role === 'restaurant_owner') return BUNDLE_IDS.restaurant;
  if (role === 'admin')            return BUNDLE_IDS.admin;
  return BUNDLE_IDS.customer;
}

// ─── Full notify: save to DB + send push + emit socket ────────────────────
const notify = async (io, userId, title, body, type, data = {}) => {
  await saveNotification(userId, title, type, data);
  const rows = await getUserTokensWithRole(userId);
  if (rows.length) {
    const bundleId = bundleForRole(rows[0].role);
    const tokens   = rows.map(r => r.fcm_token);
    await sendFCM(tokens, title, body, { type, ...data }, bundleId);
  }
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

  newOrderForDriver: (io, driverId, orderNumber, orderId) =>
    notify(io, driverId, '📦 طلب توصيل جديد!', `طلب #${orderNumber} ينتظر قبولك`, 'new_order_driver', { order_id: String(orderId) }),
};

module.exports = { saveNotification, sendFCM, getUserTokens, notify, notifyUser, Notify };
