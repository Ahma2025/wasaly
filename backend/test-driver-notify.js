const pool = require('./config/database');
const fs = require('fs'), path = require('path'), crypto = require('crypto');

async function main() {
  const sa = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-service-account.json'), 'utf8'));
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
  const jwt = `${toSign}.${sign.sign(sa.private_key, 'base64url')}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const { access_token } = await tokenRes.json();

  const { rows } = await pool.query('SELECT fcm_token FROM users WHERE id=3');
  const token = rows[0]?.fcm_token;
  if (!token) { console.log('No token!'); process.exit(1); }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({ message: {
      token,
      notification: { title: '🛵 طلب توصيل جديد!', body: 'يوجد طلب جديد بانتظارك، اقبل الآن!' },
      data: { type: 'new_order_request', order_id: '99' },
      android: { priority: 'HIGH', notification: { channel_id: 'wasaly_default', notification_priority: 'PRIORITY_MAX' } }
    }})
  });
  const result = await res.json();
  console.log(result.name ? '✅ Sent!' : '❌ Failed:', JSON.stringify(result));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
