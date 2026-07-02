const pool = require('./config/database');
const { getFCMAccessToken, sendFCM } = require('./utils/notifications');

// Patch sendFCM to log results
const fs = require('fs');
const path = require('path');
const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

async function main() {
  const r = await pool.query('SELECT id, name, fcm_token FROM users WHERE fcm_token IS NOT NULL ORDER BY id DESC LIMIT 10');
  console.log('Users with FCM tokens:');
  r.rows.forEach(u => console.log(` id=${u.id} name=${u.name} token=${u.fcm_token.substring(0, 40)}...`));

  // Find restaurant user specifically
  const restaurant = r.rows.find(u => u.name && u.name.includes('مطعم'));
  const target = restaurant || r.rows[0];
  console.log(`\nSending to: ${target.name} (id=${target.id})`);

  // Send via FCM v1 directly with logging
  const saPath = path.join(__dirname, 'firebase-service-account.json');
  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));

  // Get access token
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging'
  })).toString('base64url');
  const toSign = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(toSign);
  const sig = sign.sign(sa.private_key, 'base64url');
  const jwt = `${toSign}.${sig}`;

  const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    console.error('Failed to get access token:', tokenData);
    process.exit(1);
  }
  console.log('Got FCM access token ✓');

  const msgPayload = {
    message: {
      token: target.fcm_token,
      notification: { title: 'اختبار وصالي 🔔', body: 'إشعار تجريبي للمطعم - وصل بنجاح!' },
      data: { type: 'test', order_id: '0' },
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'wasaly_default',
          sound: 'default',
          notification_priority: 'PRIORITY_MAX',
          visibility: 'PUBLIC'
        }
      }
    }
  };

  const fcmRes = await fetchFn(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenData.access_token}` },
      body: JSON.stringify(msgPayload)
    }
  );
  const result = await fcmRes.json();
  console.log('\nFCM Response:', JSON.stringify(result, null, 2));

  if (result.name) {
    console.log('\n✅ Notification sent successfully!');
  } else {
    console.log('\n❌ Failed to send notification');
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
