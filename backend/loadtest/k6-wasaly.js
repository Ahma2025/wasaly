// ═══════════════════════════════════════════════════════════════
//  اختبار حِمل وصلّي باستخدام k6
//  التشغيل:  k6 run -e BASE=https://staging-api... -e PHONE=05.. -e PASS=.. k6-wasaly.js
//  ⚠️ لا تشغّله على سيرفر الإنتاج الحيّ — استخدم بيئة اختبار (نسخة منفصلة + قاعدة بيانات اختبار)
// ═══════════════════════════════════════════════════════════════
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:5000';
const PHONE = __ENV.PHONE || '0591111111';
const PASS = __ENV.PASS || '123456';

const errRate = new Rate('errors');
const browseT = new Trend('browse_ms');

export const options = {
  scenarios: {
    // تصاعد تدريجي حتى 500 مستخدم متزامن يتصفّحون
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 300 },
        { duration: '2m', target: 500 },
        { duration: '2m', target: 500 },
        { duration: '1m', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'], // 95% من الطلبات أقل من 800ms
    errors: ['rate<0.02'],            // أقل من 2% أخطاء
  },
};

function login() {
  const r = http.post(`${BASE}/api/auth/login-password`,
    JSON.stringify({ phone: PHONE, password: PASS }),
    { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'login ok': (x) => x.status === 200 });
  try { return r.json('token'); } catch { return null; }
}

export default function () {
  const token = login();
  const headers = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  // تصفّح المطاعم
  let t0 = Date.now();
  const rests = http.get(`${BASE}/api/restaurants?limit=60`, headers);
  browseT.add(Date.now() - t0);
  check(rests, { 'restaurants 200': (x) => x.status === 200 }) || errRate.add(1);

  // التصنيفات + البانرات + الطلبات
  http.get(`${BASE}/api/categories`, headers);
  http.get(`${BASE}/api/banners`, headers);
  http.get(`${BASE}/api/orders/my`, headers);

  sleep(Math.random() * 3 + 1); // سلوك مستخدم واقعي
}
