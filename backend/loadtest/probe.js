// READ-ONLY public GET probe. Safe for production per task safety rules:
//   <=25 VUs, <=40 req/s, <=3 min, abort if error rate >2% or p95 >3s.
// Used for (a) local baseline and (b) gentle Railway prod probe, same script → scaling factor.
// Set BASE to target. Only public GET endpoints are touched. No writes, no auth.
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE || 'http://127.0.0.1:5070';
const MAXID = Number(__ENV.MAXID || 1000);   // local=1000 restaurants; prod unknown → keep small
const IDS = (__ENV.IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);  // explicit valid ids (prod)
const RATE = Number(__ENV.RATE || 40);
const DUR = __ENV.DUR || '3m';

const tHealth = new Trend('p_health', true);
const tList = new Trend('p_restaurants_list', true);
const tDetail = new Trend('p_restaurant_detail', true);
const tCats = new Trend('p_categories', true);
const tBanners = new Trend('p_banners', true);
const tZones = new Trend('p_delivery_zones', true);
const tSearch = new Trend('p_search', true);
const okRate = new Rate('probe_ok');

export const options = {
  scenarios: {
    probe: {
      executor: 'constant-arrival-rate',
      rate: RATE, timeUnit: '1s',
      duration: DUR,
      preAllocatedVUs: 25, maxVUs: 25,   // hard cap 25 VUs
    },
  },
  thresholds: {
    // abortOnFail → stop immediately if prod struggles (safety rule)
    http_req_failed: [{ threshold: 'rate<0.02', abortOnFail: true, delayAbortEval: '10s' }],
    http_req_duration: [{ threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '10s' }],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  const r = Math.random();
  let res;
  if (r < 0.40) {
    res = http.get(`${BASE}/api/restaurants?limit=20`, { tags: { g: 'list' } });
    tList.add(res.timings.duration);
  } else if (r < 0.65) {
    const id = IDS.length ? IDS[Math.floor(Math.random() * IDS.length)] : (1 + Math.floor(Math.random() * MAXID));
    res = http.get(`${BASE}/api/restaurants/${id}`, { tags: { g: 'detail' } });
    tDetail.add(res.timings.duration);
  } else if (r < 0.78) {
    res = http.get(`${BASE}/api/categories`, { tags: { g: 'categories' } });
    tCats.add(res.timings.duration);
  } else if (r < 0.88) {
    res = http.get(`${BASE}/api/banners`, { tags: { g: 'banners' } });
    tBanners.add(res.timings.duration);
  } else if (r < 0.95) {
    res = http.get(`${BASE}/api/delivery-zones`, { tags: { g: 'zones' } });
    tZones.add(res.timings.duration);
  } else {
    res = http.get(`${BASE}/health`, { tags: { g: 'health' } });
    tHealth.add(res.timings.duration);
  }
  okRate.add(res.status >= 200 && res.status < 300);
}
