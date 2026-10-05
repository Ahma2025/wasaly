// Measures bcrypt login capacity (cost=12). Hits POST /auth/login-password.
// Seeded customers: phone = '059030' + lpad(g,7) for g in 1..200000, password 'Test1234'.
import http from 'k6/http';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://127.0.0.1:5070';
const loginT = new Trend('t_login', true);
const okRate = new Rate('login_ok');

export const options = {
  scenarios: {
    login: {
      executor: 'ramping-arrival-rate',
      startRate: Number(__ENV.START || 5),
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 400,
      stages: [
        { duration: '30s', target: Number(__ENV.R1 || 10) },
        { duration: '30s', target: Number(__ENV.R2 || 25) },
        { duration: '30s', target: Number(__ENV.R3 || 50) },
        { duration: '30s', target: Number(__ENV.R4 || 80) },
      ],
    },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const g = 1 + Math.floor(Math.random() * 200000);
  const phone = '059030' + String(g).padStart(7, '0');
  const res = http.post(`${BASE}/api/auth/login-password`,
    JSON.stringify({ phone, password: 'Test1234' }),
    { headers: { 'Content-Type': 'application/json' } });
  loginT.add(res.timings.duration);
  okRate.add(res.status === 200);
}
