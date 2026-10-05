// Wasaly weighted-mix load test.
// Modes via __ENV.MODE: smoke | load | stress | soak  (or pass VUS + DUR to override)
// BASE defaults to local load-test backend. NEVER point this at production.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE = __ENV.BASE || 'http://127.0.0.1:5070';
const data = JSON.parse(open('./tokens.json'));
const CUST = data.customers, DRIVERS = data.drivers, OWNERS = data.owners, ADMIN = data.admin;

// per-group latency trends
const T = {
  browse: new Trend('t_browse', true),
  restDetail: new Trend('t_restaurant_detail', true),
  search: new Trend('t_search', true),
  tracking: new Trend('t_order_tracking', true),
  quote: new Trend('t_order_quote', true),
  create: new Trend('t_order_create', true),
  driverLoc: new Trend('t_driver_location', true),
  driverMe: new Trend('t_driver_me', true),
  restOrders: new Trend('t_restaurant_orders', true),
  admin: new Trend('t_admin', true),
};
const errByGroup = new Counter('errors_by_group');
const okRate = new Rate('ok_rate');

function modeStages(mode) {
  switch (mode) {
    case 'smoke': return { stages: [{ duration: '30s', target: 5 }], };
    case 'load': return { stages: [
      { duration: '1m', target: 100 }, { duration: '3m', target: 300 }, { duration: '1m', target: 0 }] };
    case 'stress': return { stages: [
      { duration: '1m', target: 200 }, { duration: '1m', target: 400 },
      { duration: '1m', target: 700 }, { duration: '1m', target: 1000 },
      { duration: '1m', target: 1400 }, { duration: '30s', target: 0 }] };
    case 'soak': return { stages: [
      { duration: '1m', target: 400 }, { duration: '10m', target: 400 }, { duration: '1m', target: 0 }] };
    default: return { stages: [
      { duration: '30s', target: Number(__ENV.VUS) || 50 },
      { duration: __ENV.DUR || '2m', target: Number(__ENV.VUS) || 50 },
      { duration: '20s', target: 0 }] };
  }
}

export const options = Object.assign({
  discardResponseBodies: false,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}, modeStages(__ENV.MODE));

function tag(name) { return { tags: { group: name } }; }
function rec(trend, groupName, res) {
  trend.add(res.timings.duration);
  const ok = res.status >= 200 && res.status < 300;
  okRate.add(ok);
  if (!ok) errByGroup.add(1, { group: groupName });
  return ok;
}

const CITIES = [[31.90,35.20],[32.22,35.26],[31.53,35.10],[32.46,35.30],[31.70,35.20]];
function coord() { const c = randomItem(CITIES); return [c[0]+(Math.random()-0.5)*0.05, c[1]+(Math.random()-0.5)*0.05]; }

function browse() {
  const c = randomItem(CUST);
  const h = { headers: { Authorization: `Bearer ${c.token}` } };
  const [lat, lng] = coord();
  let res = http.get(`${BASE}/api/restaurants?lat=${lat}&lng=${lng}&limit=20`, Object.assign({}, h, tag('browse_list')));
  rec(T.browse, 'browse_list', res);
  http.get(`${BASE}/api/categories`, tag('categories'));
  http.get(`${BASE}/api/banners`, tag('banners'));
  const rid = 1 + Math.floor(Math.random() * 1000);
  res = http.get(`${BASE}/api/restaurants/${rid}`, Object.assign({}, h, tag('restaurant_detail')));
  rec(T.restDetail, 'restaurant_detail', res);
  if (Math.random() < 0.4) {
    res = http.get(`${BASE}/api/search?q=${encodeURIComponent('مطعم')}`, tag('search'));
    rec(T.search, 'search', res);
  }
}

function tracking() {
  const c = randomItem(CUST);
  const h = { headers: { Authorization: `Bearer ${c.token}` } };
  let res = http.get(`${BASE}/api/orders/my?limit=10`, Object.assign({}, h, tag('orders_my')));
  rec(T.tracking, 'orders_my', res);
  try {
    const body = res.json();
    if (body && body.data && body.data.length) {
      const oid = randomItem(body.data).id;
      res = http.get(`${BASE}/api/orders/${oid}`, Object.assign({}, h, tag('order_detail')));
      rec(T.tracking, 'order_detail', res);
    }
  } catch (e) { /* ignore */ }
}

function checkout() {
  const c = randomItem(CUST);
  const h = { headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' } };
  const r = 1 + Math.floor(Math.random() * 1000);
  const x1 = (r - 1) * 48 + 1, x2 = (r - 1) * 48 + 2;
  const v1 = (x1 - 1) * 3 + 1, v2 = (x2 - 1) * 3 + 1;
  const [lat, lng] = coord();
  const payload = JSON.stringify({
    restaurant_id: r, order_type: 'delivery', delivery_lat: lat, delivery_lng: lng,
    items: [{ id: x1, quantity: 3, options: [{ id: v1 }] }, { id: x2, quantity: 2, options: [{ id: v2 }] }],
  });
  let res = http.post(`${BASE}/api/orders/quote`, payload, Object.assign({}, h, tag('order_quote')));
  rec(T.quote, 'order_quote', res);
  if (res.status === 200) {
    res = http.post(`${BASE}/api/orders`, payload, Object.assign({}, h, tag('order_create')));
    rec(T.create, 'order_create', res);
  }
}

function driver() {
  const d = randomItem(DRIVERS);
  const h = { headers: { Authorization: `Bearer ${d.token}`, 'Content-Type': 'application/json' } };
  const [lat, lng] = coord();
  let res = http.patch(`${BASE}/api/drivers/location`, JSON.stringify({ lat, lng }), Object.assign({}, h, tag('driver_location')));
  rec(T.driverLoc, 'driver_location', res);
  if (Math.random() < 0.3) {
    res = http.get(`${BASE}/api/drivers/me`, Object.assign({}, h, tag('driver_me')));
    rec(T.driverMe, 'driver_me', res);
  }
}

function restaurant() {
  const o = randomItem(OWNERS);
  const h = { headers: { Authorization: `Bearer ${o.token}` } };
  const res = http.get(`${BASE}/api/restaurants/${o.restaurant_id}/orders?status=pending,confirmed,preparing&limit=20`,
    Object.assign({}, h, tag('restaurant_orders')));
  rec(T.restOrders, 'restaurant_orders', res);
}

function admin() {
  const h = { headers: { Authorization: `Bearer ${ADMIN.token}` } };
  const res = Math.random() < 0.5
    ? http.get(`${BASE}/api/admin/dashboard`, Object.assign({}, h, tag('admin_dashboard')))
    : http.get(`${BASE}/api/admin/live-ops`, Object.assign({}, h, tag('admin_live_ops')));
  rec(T.admin, 'admin', res);
}

export default function () {
  const x = Math.random();
  if (x < 0.55) browse();
  else if (x < 0.70) tracking();
  else if (x < 0.80) checkout();
  else if (x < 0.92) driver();
  else if (x < 0.98) restaurant();
  else admin();
  sleep(Math.random() * 1 + 0.3);
}
