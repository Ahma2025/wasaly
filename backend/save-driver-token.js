const pool = require('./config/database');
const token = 'fgemusVpQJ2C4KPXOJE7rf:APA91bE_HQH4EEWzsZZHz78GRuw85mh5Xdnmy3cDEEd2rvY8ItNw2yXb5HgOjPNPtPilvNWaqfNwbZ2Vq5QD_CHV5p4-Q66wZwS2m8AWoPk5bYPemjGqhIA';
pool.query('UPDATE users SET fcm_token=$1 WHERE id=3', [token]).then(() => {
  console.log('Driver FCM token saved!');
  return pool.query('SELECT id, name, fcm_token FROM users WHERE id=3');
}).then(r => {
  console.log('Verified:', r.rows[0].name, '- token:', r.rows[0].fcm_token ? r.rows[0].fcm_token.substring(0,30)+'...' : 'MISSING');
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
