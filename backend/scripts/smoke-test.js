#!/usr/bin/env node
/* eslint-disable no-console */
// ═══════════════════════════════════════════════════════════════
//  اختبار دخان شامل لـ Wasaly backend — يعمل فقط ضد سيرفر محلي/اختباري (لا تشغّله على الإنتاج!)
//  التشغيل:
//    SMOKE_BASE=http://localhost:5055 ADMIN_PHONE=... ADMIN_PASSWORD=... node scripts/smoke-test.js
//  المتطلبات: سيرفر يعمل على قاعدة Postgres فارغة/اختبارية، وحساب أدمن مُنشأ عبر ADMIN_PHONE/ADMIN_PASSWORD.
//  اختياري: إن وُجد socket.io-client (NODE_PATH) تُختبر أحداث السوكِت أيضاً.
// ═══════════════════════════════════════════════════════════════
const crypto = require('crypto');

const BASE = (process.env.SMOKE_BASE || 'http://localhost:5055').replace(/\/$/, '');
const API = BASE + '/api';
const ADMIN_PHONE = process.env.ADMIN_PHONE;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PHONE || !ADMIN_PASSWORD) { console.error('Set ADMIN_PHONE and ADMIN_PASSWORD'); process.exit(2); }
if (/railway\.app|wasaly\.ps/i.test(BASE) && process.env.SMOKE_ALLOW_REMOTE !== '1') {
  console.error('Refusing to run against a remote/production host'); process.exit(2);
}

let ioClient = null;
try { ioClient = require('socket.io-client'); } catch { /* optional */ }

const results = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = () => crypto.randomBytes(4).readUInt32BE(0);
const phone = () => '059' + String(rnd() % 10000000).padStart(7, '0');
const pass = () => 'P' + crypto.randomBytes(8).toString('hex');
const close = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) < eps;
const RUN = crypto.randomBytes(3).toString('hex').toUpperCase(); // أكواد فريدة لكل تشغيل
const C_FIXED = 'S10' + RUN, C_FREE = 'FD' + RUN;

const GROUP_TOKENS = new Set(); // سائقون "بتطبيق جديد" يرسلون X-Wasaly-Features: groups
async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token && GROUP_TOKENS.has(token) ? { 'X-Wasaly-Features': 'groups' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function expectStatus(r, code, label) {
  assert(r.status === code, `${label || ''} expected HTTP ${code}, got ${r.status}: ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
}
function noSecrets(obj, label) {
  assert(!JSON.stringify(obj).includes('password_hash'), `${label}: response leaks password_hash`);
}
async function step(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`  ✅ ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`  ❌ ${name}\n       → ${e.message}`); }
}
function socketFor(token, features) {
  if (!ioClient) return null;
  const s = ioClient(BASE, { auth: { token, ...(features ? { features } : {}) }, transports: ['websocket'], reconnection: false });
  s.events = [];
  s.onAny((ev, payload) => s.events.push({ ev, payload }));
  return s;
}
async function waitEvent(sock, ev, pred = () => true, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = sock.events.find(e => e.ev === ev && pred(e.payload));
    if (hit) return hit.payload;
    await sleep(100);
  }
  throw new Error(`socket event ${ev} not received`);
}

(async () => {
  console.log(`\n🔎 Wasaly smoke test → ${BASE}  (socket tests: ${ioClient ? 'on' : 'off — socket.io-client not installed'})\n`);
  const S = {}; // shared state

  // ─── أساسيات وأمان عام ───
  await step('health', async () => { const r = await fetch(BASE + '/health'); assert(r.status === 200, 'health not 200'); });
  await step('admin login', async () => {
    const d = expectStatus(await call('POST', '/auth/login-password', { body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } }), 200);
    assert(d.user.role === 'admin', 'not admin'); noSecrets(d, 'login'); S.admin = d.token;
  });
  await step('/auth/social disabled → 410', async () => {
    expectStatus(await call('POST', '/auth/social', { body: { email: 'x@y.z', provider: 'google' } }), 410);
  });
  await step('webpush subscribe without auth → 401', async () => {
    expectStatus(await call('POST', '/webpush/subscribe', { body: { restaurant_id: 1, subscription: { endpoint: 'https://x' } } }), 401);
  });
  await step('stripe intent → 503 (graceful)', async () => {
    expectStatus(await call('POST', '/payments/intent', { token: S.admin, body: { order_id: 1 } }), 503);
  });
  await step('/auth/login rate limit (9th bad attempt → 429)', async () => {
    const p = phone(); let last;
    for (let i = 0; i < 9; i++) last = await call('POST', '/auth/login', { body: { phone: p, password: 'wrong-pass' } });
    expectStatus(last, 429);
  });

  // ─── مناطق التوصيل ───
  await step('admin creates delivery zone', async () => {
    expectStatus(await call('POST', '/delivery-zones', { token: S.admin, body: { name: 'smoke-far', min_km: 999, max_km: 5000, price: 20 } }), 201);
    const z = expectStatus(await call('GET', '/delivery-zones'), 200);
    assert(z.data.some(x => x.name === 'smoke-far'), 'zone missing');
  });

  // ─── المطاعم والملاك ───
  const R_LAT = 31.9000, R_LNG = 35.2000;
  S.ownerPhone = phone(); S.ownerPass = pass();
  S.owner2Phone = phone(); S.owner2Pass = pass();
  await step('admin create restaurant without owner password → 400', async () => {
    expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: { name_ar: 'x', owner_phone: phone() } }), 400);
  });
  await step('admin creates restaurant A + owner', async () => {
    const d = expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: {
      name_ar: 'مطعم الاختبار', lat: R_LAT, lng: R_LNG, min_order: 10, owner_phone: S.ownerPhone, owner_password: S.ownerPass } }), 201);
    S.restA = d.data.id;
  });
  await step('admin create restaurant with existing owner_phone → 409', async () => {
    expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: { name_ar: 'dup', owner_phone: S.ownerPhone, owner_password: pass() } }), 409);
  });
  await step('admin creates restaurant B + owner2', async () => {
    const d = expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: {
      name_ar: 'مطعم ب', lat: R_LAT, lng: R_LNG, owner_phone: S.owner2Phone, owner_password: S.owner2Pass } }), 201);
    S.restB = d.data.id;
  });
  await step('owners login', async () => {
    S.owner = expectStatus(await call('POST', '/auth/login-password', { body: { phone: S.ownerPhone, password: S.ownerPass } }), 200).token;
    S.owner2 = expectStatus(await call('POST', '/auth/login-password', { body: { phone: S.owner2Phone, password: S.owner2Pass } }), 200).token;
  });

  // ─── القائمة ───
  await step('owner adds category/items/option groups', async () => {
    const c = expectStatus(await call('POST', '/menu/categories', { token: S.owner, body: { restaurant_id: S.restA, name_ar: 'برغر' } }), 201);
    S.catA = c.data.id;
    const i1 = expectStatus(await call('POST', '/menu/items', { token: S.owner, body: { restaurant_id: S.restA, category_id: S.catA, name_ar: 'برغر كلاسيك', price: 20 } }), 201);
    const i2 = expectStatus(await call('POST', '/menu/items', { token: S.owner, body: { restaurant_id: S.restA, category_id: S.catA, name_ar: 'وجبة عائلية', price: 30 } }), 201);
    S.item1 = i1.data.id; S.item2 = i2.data.id;
    expectStatus(await call('POST', `/menu/items/${S.item1}/options`, { token: S.owner, body: {
      name_ar: 'الحجم', type: 'single', is_required: true, values: [{ name_ar: 'صغير', extra_price: 0 }, { name_ar: 'كبير', extra_price: 5 }] } }), 201);
    expectStatus(await call('POST', `/menu/items/${S.item1}/options`, { token: S.owner, body: {
      name_ar: 'إضافات', type: 'multiple', values: [{ name_ar: 'جبنة', extra_price: 2 }, { name_ar: 'صوص', extra_price: 1 }] } }), 201);
  });
  await step('menu item with discount_price >= price → 400', async () => {
    expectStatus(await call('POST', '/menu/items', { token: S.owner, body: { restaurant_id: S.restA, category_id: S.catA, name_ar: 'x', price: 10, discount_price: 12 } }), 400);
  });
  await step('item category from another restaurant → 400', async () => {
    expectStatus(await call('POST', '/menu/items', { token: S.owner2, body: { restaurant_id: S.restB, category_id: S.catA, name_ar: 'x', price: 10 } }), 400);
  });
  await step('GET /menu/restaurant/:id/manage (owner) + values ids', async () => {
    const d = expectStatus(await call('GET', `/menu/restaurant/${S.restA}/manage`, { token: S.owner }), 200);
    const item = d.data.flatMap(c => c.items).find(i => i.id === S.item1);
    assert(item && item.options.length === 2, 'options missing');
    const size = item.options.find(o => o.name_ar === 'الحجم');
    const extras = item.options.find(o => o.name_ar === 'إضافات');
    assert(extras.max_selections >= 2, 'multiple group max_selections not normalized');
    S.small = size.values.find(v => v.name_ar === 'صغير').id;
    S.large = size.values.find(v => v.name_ar === 'كبير').id;
    S.cheese = extras.values.find(v => v.name_ar === 'جبنة').id;
    S.sauce = extras.values.find(v => v.name_ar === 'صوص').id;
    S.sizeOpt = size.id;
  });
  await step('manage endpoint by other owner → 403', async () => {
    expectStatus(await call('GET', `/menu/restaurant/${S.restA}/manage`, { token: S.owner2 }), 403);
  });
  await step('PUT /menu/options/:id + DELETE /menu/option-values/:id', async () => {
    const tmp = expectStatus(await call('POST', `/menu/items/${S.item2}/options`, { token: S.owner, body: {
      name_ar: 'مشروب', type: 'single', values: [{ name_ar: 'كولا', extra_price: 3 }, { name_ar: 'ماء', extra_price: 1 }] } }), 201);
    const upd = expectStatus(await call('PUT', `/menu/options/${tmp.data.id}`, { token: S.owner, body: { name_ar: 'مشروب بارد', is_required: false } }), 200);
    assert(upd.data.name_ar === 'مشروب بارد' && upd.data.values.length === 2, 'option update failed');
    expectStatus(await call('DELETE', `/menu/option-values/${upd.data.values[1].id}`, { token: S.owner2 }), 403);
    expectStatus(await call('DELETE', `/menu/option-values/${upd.data.values[1].id}`, { token: S.owner }), 200);
    expectStatus(await call('DELETE', `/menu/options/${tmp.data.id}`, { token: S.owner }), 200);
  });
  await step('restaurant B item', async () => {
    const c = expectStatus(await call('POST', '/menu/categories', { token: S.owner2, body: { restaurant_id: S.restB, name_ar: 'عام' } }), 201);
    const i = expectStatus(await call('POST', '/menu/items', { token: S.owner2, body: { restaurant_id: S.restB, category_id: c.data.id, name_ar: 'صنف ب', price: 15 } }), 201);
    S.itemB = i.data.id;
  });

  // ─── السائقون ───
  S.d1Phone = phone(); S.d1Pass = pass(); S.d2Phone = phone(); S.d2Pass = pass();
  await step('POST /drivers without password → 400', async () => {
    expectStatus(await call('POST', '/drivers', { token: S.admin, body: { name: 'x', phone: phone() } }), 400);
  });
  await step('admin creates driver1 (POST /drivers) — no password_hash in response', async () => {
    const d = expectStatus(await call('POST', '/drivers', { token: S.admin, body: { name: 'سائق 1', phone: S.d1Phone, password: S.d1Pass } }), 201);
    noSecrets(d, 'POST /drivers');
  });
  await step('admin creates driver2 via /admin/users → drivers row exists', async () => {
    const d = expectStatus(await call('POST', '/admin/users', { token: S.admin, body: { name: 'سائق 2', phone: S.d2Phone, password: S.d2Pass, role: 'driver' } }), 201);
    noSecrets(d, 'POST /admin/users');
    S.d2 = expectStatus(await call('POST', '/auth/login-password', { body: { phone: S.d2Phone, password: S.d2Pass } }), 200).token;
    expectStatus(await call('GET', '/drivers/me', { token: S.d2 }), 200);
    expectStatus(await call('PATCH', '/drivers/status', { token: S.d2, body: { is_online: false } }), 200);
  });
  await step('driver1 login + online + location', async () => {
    const d = expectStatus(await call('POST', '/auth/login-password', { body: { phone: S.d1Phone, password: S.d1Pass } }), 200);
    S.d1 = d.token; S.d1Id = d.user.id;
    expectStatus(await call('PATCH', '/drivers/status', { token: S.d1, body: { is_online: true, lat: R_LAT + 0.001, lng: R_LNG } }), 200);
    expectStatus(await call('PATCH', '/drivers/location', { token: S.d1, body: { lat: R_LAT + 0.001, lng: R_LNG } }), 200);
  });

  // ─── الزبائن ───
  S.refPhone = phone(); S.custPhone = phone(); S.cust2Phone = phone();
  await step('referrer + customer (with referral code) register', async () => {
    const r = expectStatus(await call('POST', '/auth/register', { body: { name: 'الداعي', phone: S.refPhone, password: pass() } }), 201);
    S.ref = r.token; S.refCode = r.user.referral_code;
    const c = expectStatus(await call('POST', '/auth/register', { body: { name: 'زبون', phone: S.custPhone, password: pass(), referred_by: S.refCode.toLowerCase() } }), 201);
    S.cust = c.token; S.custId = c.user.id;
    assert(Number(c.user.wallet_balance || 0) === 0, 'referral credited at register (should be on first delivery)');
    noSecrets(c, 'register');
    const c2 = expectStatus(await call('POST', '/auth/register', { body: { name: 'زبون 2', phone: S.cust2Phone, password: pass() } }), 201);
    S.cust2 = c2.token;
  });
  await step('customer adds address (~1.1 km from restaurant)', async () => {
    const a = expectStatus(await call('POST', '/users/addresses', { token: S.cust, body: { label: 'المنزل', address: 'شارع الاختبار', lat: R_LAT + 0.01, lng: R_LNG, is_default: true } }), 201);
    S.addr = a.data.id;
    const a2 = expectStatus(await call('POST', '/users/addresses', { token: S.cust2, body: { label: 'العمل', address: 'x', lat: R_LAT + 0.04, lng: R_LNG } }), 201);
    S.addr2 = a2.data.id;
  });
  await step('admin creates coupons (fixed + free_delivery)', async () => {
    expectStatus(await call('POST', '/coupons', { token: S.admin, body: { code: C_FIXED, type: 'fixed', value: 10, min_order: 0 } }), 201);
    expectStatus(await call('POST', '/coupons', { token: S.admin, body: { code: C_FREE, type: 'free_delivery', min_order: 0 } }), 201);
    expectStatus(await call('POST', '/coupons', { token: S.admin, body: { code: C_FIXED.toLowerCase(), type: 'fixed', value: 5 } }), 409);
  });

  const body1 = () => ({
    restaurant_id: S.restA, address_id: S.addr, order_type: 'delivery', payment_method: 'cash', tip: 3, coupon_code: C_FIXED.toLowerCase(),
    items: [{ id: S.item1, quantity: 2, options: [{ id: S.large, price: 0 }, { id: S.cheese, price: -100 }], notes: 'بدون بصل' }],
  });

  // ─── التسعير + الأمان ───
  await step('quote: DB add-on prices, free delivery ≥50, driver_fee kept, coupon (case-insensitive), first-order, tip', async () => {
    const d = expectStatus(await call('POST', '/orders/quote', { token: S.cust, body: body1() }), 200).data;
    // unit = 20 + 5 (كبير) + 2 (جبنة) = 27 ×2 = 54
    assert(close(d.subtotal, 54), `subtotal ${d.subtotal} != 54 (client add-on price must be ignored)`);
    assert(d.free_delivery === true && close(d.delivery_fee, 0), 'free delivery expected');
    assert(close(d.driver_fee, 5), `driver_fee ${d.driver_fee} != 5`);
    assert(close(d.first_order_discount, 8.1), `first order ${d.first_order_discount}`);
    assert(close(d.coupon_discount, 10) && !d.coupon_error, `coupon ${d.coupon_discount} ${d.coupon_error}`);
    assert(close(d.tip, 3), 'tip');
    assert(close(d.total, 54 - 18.1 + 3), `total ${d.total}`);
    assert(d.meets_min_order === true && d.distance_km > 1 && d.distance_km < 1.3, `distance ${d.distance_km}`);
    S.quote1 = d;
  });
  await step('quote with v2.3.0 option shape {group,name,price} priced from DB', async () => {
    const b = body1(); b.coupon_code = undefined; b.tip = 0;
    b.items = [{ id: S.item1, quantity: 1, options: [{ group: 'الحجم', name: 'كبير', price: 0 }, { group: 'إضافات', name: 'صوص', price: 0 }] }];
    const d = expectStatus(await call('POST', '/orders/quote', { token: S.cust, body: b }), 200).data;
    assert(close(d.subtotal, 26), `subtotal ${d.subtotal} != 26`);
  });
  for (const [label, mut, code] of [
    ['negative quantity → 400', (b) => { b.items[0].quantity = -3; }, 400],
    ['fractional quantity → 400', (b) => { b.items[0].quantity = 1.5; }, 400],
    ['quantity 100 → 400', (b) => { b.items[0].quantity = 100; }, 400],
    ['item from another restaurant → 400', (b) => { b.items.push({ id: S.itemB, quantity: 1 }); }, 400],
    ['missing required option group → 400', (b) => { b.items[0].options = [{ id: S.cheese }]; }, 400],
    ['two values in single-choice group → 400', (b) => { b.items[0].options = [{ id: S.small }, { id: S.large }]; }, 400],
    ['unknown add-on → 400', (b) => { b.items[0].options = [{ id: S.large }, { name: 'ذهب', price: 0 }]; }, 400],
    ['delivery without coordinates → 400', (b) => { delete b.address_id; }, 400],
    ['address of another user → 400', (b) => { b.address_id = S.addr2; }, 400],
  ]) {
    await step(`security: ${label}`, async () => { const b = body1(); mut(b); expectStatus(await call('POST', '/orders', { token: S.cust, body: b }), code); });
  }

  // ─── سوكِت (اختياري) ───
  if (ioClient) {
    S.sCust = socketFor(S.cust); S.sOwner = socketFor(S.owner); S.sD1 = socketFor(S.d1); S.sD2 = socketFor(S.d2);
    await sleep(800);
  }

  // ─── الطلب الكامل ───
  await step('create order (matches quote, stores tip & driver_fee, WSL number)', async () => {
    const d = expectStatus(await call('POST', '/orders', { token: S.cust, body: body1() }), 201).data;
    S.order1 = d.id;
    assert(close(d.total, S.quote1.total), `order total ${d.total} != quote ${S.quote1.total}`);
    assert(close(d.tip, 3) && close(d.driver_fee, 5) && close(d.delivery_fee, 0), 'tip/driver_fee/delivery_fee not stored');
    assert(/^WSL\d{6,}$/.test(d.order_number), `order_number ${d.order_number}`);
    assert(d.coupon_code === C_FIXED, 'coupon not stored');
  });
  if (ioClient) await step('socket: restaurant receives new_order with restaurant_id', async () => {
    const p = await waitEvent(S.sOwner, 'new_order', (x) => x.order_id === S.order1);
    assert(String(p.restaurant_id) === String(S.restA), 'restaurant_id missing');
  });
  await step('coupon per-user limit enforced (quote shows coupon_error)', async () => {
    const d = expectStatus(await call('POST', '/orders/quote', { token: S.cust, body: body1() }), 200).data;
    assert(d.coupon_error && close(d.coupon_discount, 0), 'coupon reuse allowed');
    assert(close(d.first_order_discount, 0), 'first-order discount granted twice');
  });
  await step('other restaurant cannot confirm → 403', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/confirm`, { token: S.owner2 }), 403);
  });
  await step('restaurant confirms → dispatch offer to driver1', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/confirm`, { token: S.owner }), 200);
    const me = expectStatus(await call('GET', '/drivers/me', { token: S.d1 }), 200).data;
    assert(me.active_order && me.active_order.id === S.order1 && me.active_order.is_offer, 'offer not given to driver1');
  });
  await step('confirm twice → 400', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/confirm`, { token: S.owner }), 400);
  });
  if (ioClient) await step('socket: driver new_order_request has offer_seconds=45 + expires_at; customer order_status', async () => {
    const p = await waitEvent(S.sD1, 'new_order_request', (x) => x.order_id === S.order1);
    assert(p.offer_seconds === 45 && p.expires_at && !isNaN(Date.parse(p.expires_at)), 'offer fields missing');
    await waitEvent(S.sCust, 'order_status', (x) => x.order_id === S.order1 && x.status === 'confirmed');
  });
  await step('GET /orders/:id for offered driver: offer_seconds, cash_to_collect, items', async () => {
    const d = expectStatus(await call('GET', `/orders/${S.order1}`, { token: S.d1 }), 200).data;
    assert(d.offer_seconds > 30 && d.offer_seconds <= 45, `offer_seconds ${d.offer_seconds}`);
    assert(close(d.cash_to_collect, S.quote1.total) && d.items.length === 1 && close(d.tip, 3), 'driver order fields');
  });
  await step('security: other driver cannot change status → 403', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.d2, body: { status: 'on_the_way' } }), 403);
  });
  await step('security: offered (not accepted) driver cannot set on_the_way → 403', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.d1, body: { status: 'on_the_way' } }), 403);
  });
  await step('driver1 accepts → preparing', async () => {
    expectStatus(await call('POST', `/orders/${S.order1}/accept`, { token: S.d1 }), 200);
    const d = expectStatus(await call('GET', `/orders/${S.order1}`, { token: S.cust }), 200).data;
    assert(d.status === 'preparing' && d.driver_assigned_at, `status ${d.status}`);
  });
  await step('driver cannot reject after accepting → 400', async () => {
    expectStatus(await call('POST', `/orders/${S.order1}/reject`, { token: S.d1 }), 400);
  });
  if (ioClient) await step('socket: spoofed driver:location from another driver is NOT relayed; real one is', async () => {
    S.sCust.events.length = 0;
    S.sD2.emit('driver:location', { lat: 1, lng: 1, orderId: S.order1 });
    await sleep(600);
    assert(!S.sCust.events.some(e => e.ev === 'driver:location'), 'spoofed location relayed');
    S.sD1.emit('driver:location', { lat: R_LAT + 0.002, lng: R_LNG, orderId: S.order1 });
    const p = await waitEvent(S.sCust, 'driver:location');
    assert(close(p.lat, R_LAT + 0.002, 1e-6), 'wrong relay');
  });
  await step('restaurant sets ready; restaurant cannot set on_the_way (403)', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.owner, body: { status: 'ready' } }), 200);
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.owner, body: { status: 'on_the_way' } }), 403);
  });
  await step('driver cannot deliver before on_the_way → 400', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.d1, body: { status: 'delivered' } }), 400);
  });
  await step('driver on_the_way → delivered (idempotent)', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.d1, body: { status: 'on_the_way' } }), 200);
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.d1, body: { status: 'delivered' } }), 200);
    const again = expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.d1, body: { status: 'delivered' } }), 200);
    assert(again.already === true, 'second delivered not idempotent');
  });
  await step('restaurant cannot cancel a delivered order → 400', async () => {
    expectStatus(await call('PATCH', `/orders/${S.order1}/status`, { token: S.owner, body: { status: 'cancelled' } }), 400);
  });
  await step('driver wallet = driver_fee + tip (5 + 3 = 8), total_deliveries = 1, earnings today', async () => {
    const me = expectStatus(await call('GET', '/drivers/me', { token: S.d1 }), 200).data;
    assert(close(me.wallet_balance, 8), `driver wallet ${me.wallet_balance}`);
    assert(Number(me.total_deliveries) === 1, `total_deliveries ${me.total_deliveries}`);
    assert(me.is_busy === false, 'driver still busy');
    const e = expectStatus(await call('GET', '/drivers/earnings?period=today', { token: S.d1 }), 200).data;
    assert(close(e.stats.earnings, 8) && e.period === 'today', `earnings ${e.stats.earnings}`);
    const h = expectStatus(await call('GET', '/drivers/orders', { token: S.d1 }), 200).data;
    assert(h[0] && h[0].status === 'delivered' && h[0].order_type, 'history status');
  });
  await step('customer: cashback (2%) + referral (10) on delivery, points earned + tier', async () => {
    const p = expectStatus(await call('GET', '/users/profile', { token: S.cust }), 200).data;
    assert(close(p.wallet_balance, 1.08 + 10), `customer wallet ${p.wallet_balance}`);
    assert(Number(p.loyalty_points) === 35, `points ${p.loyalty_points}`);
    assert(p.loyalty_tier === 'bronze', 'tier');
    const r = expectStatus(await call('GET', '/users/profile', { token: S.ref }), 200).data;
    assert(close(r.wallet_balance, 10), `referrer wallet ${r.wallet_balance}`);
    const tx = expectStatus(await call('GET', '/wallet/transactions', { token: S.cust }), 200).data;
    assert(tx.some(t => /كاش باك/.test(t.description)) && tx.some(t => /دعوة/.test(t.description)), 'wallet transactions missing');
    const l = expectStatus(await call('GET', '/users/loyalty', { token: S.cust }), 200).data;
    assert(l.transactions.some(t => t.type === 'earned' && t.points === 35), 'loyalty transaction missing');
  });
  if (ioClient) await step('socket: customer + owner got order_status delivered', async () => {
    await waitEvent(S.sCust, 'order_status', (x) => x.order_id === S.order1 && x.status === 'delivered');
    await waitEvent(S.sOwner, 'order_status', (x) => x.order_id === S.order1 && x.status === 'delivered');
  });
  await step('rating clamped to 1..5, second rating ignored', async () => {
    expectStatus(await call('POST', `/orders/${S.order1}/rate`, { token: S.cust, body: { restaurant_rating: 9, driver_rating: -2, comment: 'ممتاز' } }), 200);
    const again = expectStatus(await call('POST', `/orders/${S.order1}/rate`, { token: S.cust, body: { restaurant_rating: 1 } }), 200);
    assert(again.already === true, 'second rating accepted');
    const d = expectStatus(await call('GET', `/orders/${S.order1}`, { token: S.cust }), 200).data;
    assert(d.rating_restaurant === 5 && d.rating_driver === 1, `ratings ${d.rating_restaurant}/${d.rating_driver}`);
  });

  // ─── إلغاء + استرجاع ───
  await step('order 2 with wallet + points → customer cancels → full refund', async () => {
    const b = { restaurant_id: S.restA, address_id: S.addr, items: [{ id: S.item2, quantity: 1 }], use_wallet: true, redeem_points: 20 };
    const q = expectStatus(await call('POST', '/orders/quote', { token: S.cust, body: b }), 200).data;
    // 30 + 5 توصيل − 1 نقاط = 34 ؛ محفظة 11.08 → إجمالي 22.92
    assert(close(q.delivery_fee, 5) && close(q.points_value, 1) && close(q.wallet_used, 11.08) && close(q.total, 22.92), `quote2 ${JSON.stringify(q)}`);
    const o = expectStatus(await call('POST', '/orders', { token: S.cust, body: b }), 201).data;
    S.order2 = o.id;
    let p = expectStatus(await call('GET', '/users/profile', { token: S.cust }), 200).data;
    assert(close(p.wallet_balance, 0) && Number(p.loyalty_points) === 15, `after order: wallet ${p.wallet_balance} pts ${p.loyalty_points}`);
    if (ioClient) S.sOwner.events.length = 0;
    expectStatus(await call('PATCH', `/orders/${S.order2}/cancel`, { token: S.cust, body: { reason: 'تغيير رأي' } }), 200);
    p = expectStatus(await call('GET', '/users/profile', { token: S.cust }), 200).data;
    assert(close(p.wallet_balance, 11.08) && Number(p.loyalty_points) === 35, `after cancel: wallet ${p.wallet_balance} pts ${p.loyalty_points}`);
    expectStatus(await call('PATCH', `/orders/${S.order2}/cancel`, { token: S.cust }), 400);
  });
  if (ioClient) await step('socket: restaurant notified of customer cancel (order_cancelled by customer)', async () => {
    const p = await waitEvent(S.sOwner, 'order_cancelled', (x) => x.order_id === S.order2);
    assert(p.by === 'customer', 'by field');
  });
  await step('wallet double-spend blocked by atomic deduction (2 parallel orders)', async () => {
    const b = { restaurant_id: S.restA, address_id: S.addr, items: [{ id: S.item2, quantity: 1 }], use_wallet: true };
    const [r1, r2] = await Promise.all([call('POST', '/orders', { token: S.cust, body: b }), call('POST', '/orders', { token: S.cust, body: b })]);
    const ok = [r1, r2].filter(r => r.status === 201).map(r => r.data.data);
    const walletTotal = ok.reduce((s, o) => s + Number(o.wallet_used), 0);
    assert(close(walletTotal, 11.08), `wallet spent ${walletTotal} across ${ok.length} orders`);
    for (const o of ok) await call('PATCH', `/orders/${o.id}/cancel`, { token: S.cust });
    const p = expectStatus(await call('GET', '/users/profile', { token: S.cust }), 200).data;
    assert(close(p.wallet_balance, 11.08), `wallet after refunds ${p.wallet_balance}`);
  });

  // ─── رفض/إعادة التوزيع + إلغاء المطعم ───
  await step('reject flow: offered driver rejects → offer cleared; reject twice → 400; restaurant cancels', async () => {
    const o = expectStatus(await call('POST', '/orders', { token: S.cust2, body: { restaurant_id: S.restA, address_id: S.addr2, items: [{ id: S.item2, quantity: 1 }], coupon_code: C_FREE } }), 201).data;
    assert(close(o.delivery_fee, 0) && close(o.driver_fee, 8) && o.free_delivery, `free_delivery coupon: fee ${o.delivery_fee} driver ${o.driver_fee}`);
    S.order3 = o.id;
    expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.owner, body: { status: 'confirmed' } }), 200);
    expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.owner, body: { status: 'preparing' } }), 200);
    const off = expectStatus(await call('GET', '/drivers/me', { token: S.d1 }), 200).data;
    assert(off.active_order && off.active_order.id === o.id && off.active_order.is_offer, 'no offer while preparing (dispatch must continue)');
    expectStatus(await call('POST', `/orders/${o.id}/reject`, { token: S.d1 }), 200);
    expectStatus(await call('POST', `/orders/${o.id}/reject`, { token: S.d1 }), 400);
    const d = expectStatus(await call('GET', `/orders/${o.id}`, { token: S.cust2 }), 200).data;
    assert(!d.driver_id, 'driver still set after reject');
    expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.owner2, body: { status: 'cancelled' } }), 403);
    expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.owner, body: { status: 'cancelled', reason: 'نفد الصنف' } }), 200);
  });

  // ─── التوصيل الشخصي ───
  await step('personal order: quote + create + accept + deliver → driver paid fare', async () => {
    const pq = expectStatus(await call('POST', '/orders/personal/quote', { token: S.cust, body: { pickup_lat: R_LAT, pickup_lng: R_LNG, dropoff_lat: R_LAT + 0.04, dropoff_lng: R_LNG } }), 200).data;
    assert(close(pq.fare, 8), `fare ${pq.fare} (≈4.4km → zone 3-6 = 8)`);
    const before = Number(expectStatus(await call('GET', '/drivers/me', { token: S.d1 }), 200).data.wallet_balance);
    const o = expectStatus(await call('POST', '/orders/personal', { token: S.cust, body: {
      service_type: 'parcel', pickup_lat: R_LAT, pickup_lng: R_LNG, dropoff_lat: R_LAT + 0.04, dropoff_lng: R_LNG, recipient_name: 'x', recipient_phone: '0590000000' } }), 200).data;
    assert(o.status === 'confirmed' && close(o.driver_fee, 8) && /^WSL/.test(o.order_number), 'personal order fields');
    await sleep(300);
    expectStatus(await call('POST', `/orders/${o.id}/accept`, { token: S.d1 }), 200);
    expectStatus(await call('PATCH', '/drivers/location', { token: S.d1, body: { lat: R_LAT + 0.01, lng: R_LNG } }), 200);
    expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.d1, body: { status: 'on_the_way' } }), 200);
    expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.d1, body: { status: 'delivered' } }), 200);
    const after = Number(expectStatus(await call('GET', '/drivers/me', { token: S.d1 }), 200).data.wallet_balance);
    assert(close(after - before, 8), `driver got ${after - before}`);
  });

  // ─── بطاقة بدون Lahza → نقدي ───
  await step('card order without Lahza configured falls back to cash and reaches restaurant', async () => {
    const o = expectStatus(await call('POST', '/orders', { token: S.cust2, body: { restaurant_id: S.restA, order_type: 'pickup', payment_method: 'card', items: [{ id: S.item2, quantity: 1 }] } }), 201).data;
    if (o.payment_method === 'card') {
      // Lahza مفعّل بهذه البيئة: يجب ألا يظهر للمطعم قبل الدفع
      const l = expectStatus(await call('GET', `/restaurants/${S.restA}/orders?status=pending`, { token: S.owner }), 200).data;
      assert(!l.some(x => x.id === o.id), 'unpaid card order visible to restaurant');
    } else {
      const l = expectStatus(await call('GET', `/restaurants/${S.restA}/orders?status=pending`, { token: S.owner }), 200).data;
      assert(l.some(x => x.id === o.id), 'cash fallback order not visible');
      expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.owner, body: { status: 'confirmed' } }), 200);
      expectStatus(await call('PATCH', `/orders/${o.id}/status`, { token: S.owner, body: { status: 'delivered' } }), 200);
    }
  });

  // ─── أمان إضافي ───
  await step('public restaurant endpoints hide owner_id/commission_rate/email; static routes not shadowed', async () => {
    const l = expectStatus(await call('GET', '/restaurants?limit=50'), 200).data;
    assert(l.length && l.every(r => !('owner_id' in r) && !('commission_rate' in r) && !('email' in r)), 'private fields exposed');
    const one = expectStatus(await call('GET', `/restaurants/${S.restA}`), 200).data;
    assert(!('owner_id' in one) && one.menu.length, 'detail exposes owner_id');
    expectStatus(await call('GET', '/restaurants/featured/list'), 200);
    expectStatus(await call('GET', '/restaurants/top/rated'), 200);
    const own = expectStatus(await call('GET', `/restaurants?owner_id=REPLACE`.replace('REPLACE', 0)), 200);
    assert(Array.isArray(own.data), 'owner filter');
  });
  await step('store types: /store-types list + counts, filter by key / list / legacy market, admin validation', async () => {
    const before = expectStatus(await call('GET', '/store-types'), 200).data;
    assert(Array.isArray(before) && before.length >= 9 && before.every(t => t.key && t.name_ar && t.emoji && typeof t.count === 'number'), 'store-types shape');
    const petsBefore = before.find(t => t.key === 'pets').count;
    expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: { name_ar: 'نوع خطأ', store_type: 'casino' } }), 400);
    const d = expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: {
      name_ar: 'متجر حيوانات', lat: R_LAT, lng: R_LNG, store_type: 'pets', owner_phone: phone(), owner_password: pass() } }), 201);
    const pid = d.data.id;
    assert(d.data.store_type === 'pets', 'store_type not saved');
    const after = expectStatus(await call('GET', '/store-types'), 200).data;
    assert(after.find(t => t.key === 'pets').count === petsBefore + 1, 'pets count not updated (cache not invalidated?)');
    const pets = expectStatus(await call('GET', '/restaurants?store_type=pets&limit=100'), 200).data;
    assert(pets.some(r => r.id === pid) && pets.every(r => r.store_type === 'pets'), 'filter by key');
    const legacy = expectStatus(await call('GET', '/restaurants?store_type=market&limit=100'), 200).data;
    assert(legacy.some(r => r.id === pid) && legacy.every(r => r.store_type !== 'restaurant'), 'legacy market = all non-restaurant');
    assert(legacy.find(r => r.id === pid).market_type === 'pets', 'market_type for old apps');
    const multi = expectStatus(await call('GET', '/restaurants?store_type=pets,restaurant&limit=100'), 200).data;
    assert(multi.some(r => r.id === pid) && multi.some(r => r.id === S.restA), 'comma list filter');
    const plain = expectStatus(await call('GET', '/restaurants?limit=100'), 200).data;
    assert(!plain.some(r => r.id === pid) && plain.some(r => r.id === S.restA), 'default list = restaurants only');
    expectStatus(await call('GET', '/restaurants?store_type=nope'), 200);
    expectStatus(await call('PUT', `/admin/restaurants/${pid}`, { token: S.admin, body: { store_type: 'nope' } }), 400);
    expectStatus(await call('PUT', `/admin/restaurants/${pid}`, { token: S.admin, body: { store_type: 'market' } }), 200);
    const sm = expectStatus(await call('GET', '/restaurants?store_type=supermarket&limit=100'), 200).data;
    assert(sm.some(r => r.id === pid && r.store_type === 'supermarket'), 'market alias saved as supermarket');
    expectStatus(await call('DELETE', `/admin/restaurants/${pid}`, { token: S.admin }), 200);
  });
  await step('restaurant stats: other owner → 403, own → 200', async () => {
    expectStatus(await call('GET', `/restaurants/${S.restA}/stats`, { token: S.owner2 }), 403);
    expectStatus(await call('GET', `/restaurants/${S.restA}/stats`, { token: S.owner }), 200);
  });
  await step('drivers/register by customer → 403; debug-push by non-admin → 403', async () => {
    expectStatus(await call('POST', '/drivers/register', { token: S.cust, body: {} }), 403);
    expectStatus(await call('POST', '/debug-push', { token: S.owner, body: { msg: 'x' } }), 403);
  });
  await step('webpush subscribe for someone else\'s restaurant → 403', async () => {
    expectStatus(await call('POST', '/webpush/subscribe', { token: S.owner2, body: { restaurant_id: S.restA, subscription: { endpoint: 'https://x' } } }), 403);
  });
  await step('VIP: customer who never ordered → 400; real customer → 200', async () => {
    const meRef = expectStatus(await call('GET', '/auth/me', { token: S.ref }), 200).user;
    expectStatus(await call('POST', `/restaurants/${S.restA}/vip`, { token: S.owner, body: { customer_id: meRef.id } }), 400);
    expectStatus(await call('POST', `/restaurants/${S.restA}/vip`, { token: S.owner, body: { customer_id: S.custId } }), 200);
  });
  await step('group order: add item by id without code → 403; with code → 201 (DB price)', async () => {
    const g = expectStatus(await call('POST', '/group-orders', { token: S.cust, body: { restaurant_id: S.restA } }), 201).data;
    expectStatus(await call('POST', `/group-orders/${g.id}/items`, { token: S.cust2, body: { menu_item_id: S.item2, quantity: 1, price: 0 } }), 403);
    const it = expectStatus(await call('POST', `/group-orders/${g.id}/items`, { token: S.cust2, body: { menu_item_id: S.item2, quantity: 1, price: 0, code: g.code } }), 201).data;
    assert(close(it.price, 30), `group item price ${it.price}`);
  });
  await step('support ticket ownership', async () => {
    const t = expectStatus(await call('POST', '/support/tickets', { token: S.cust, body: { subject: 'مشكلة', message: 'تفاصيل' } }), 201).data;
    expectStatus(await call('GET', `/support/tickets/${t.id}/messages`, { token: S.cust2 }), 403);
    const m = expectStatus(await call('GET', `/support/tickets/${t.id}/messages`, { token: S.cust }), 200).data;
    assert(m.length === 1, 'ticket message missing');
  });
  await step('admin: users role=restaurant includes restaurant_owner; no password_hash; restaurants limit 1000', async () => {
    const u = expectStatus(await call('GET', '/admin/users?role=restaurant&limit=200', { token: S.admin }), 200);
    assert(u.data.some(x => x.role === 'restaurant_owner'), 'restaurant_owner missing'); noSecrets(u, 'admin users');
    const r = expectStatus(await call('GET', '/admin/restaurants?limit=1000', { token: S.admin }), 200);
    assert(r.data.length >= 2, 'restaurants list');
  });
  await step('admin accounting: LEFT JOIN restaurants (B with 0 orders), tips/discounts totals', async () => {
    const a = expectStatus(await call('GET', '/admin/accounting', { token: S.admin }), 200);
    assert(a.restaurants.some(r => r.id === S.restB && r.orders === 0), 'restaurant B missing');
    assert(a.totals.tips >= 3 && a.totals.discounts > 0 && 'delivery_fees' in a.totals, `totals ${JSON.stringify(a.totals)}`);
    const ra = a.restaurants.find(r => r.id === S.restA);
    assert(close(ra.commission, ra.sales * 0.15), 'commission calc');
  });
  await step('coupons list hides inactive unless ?all=1', async () => {
    const all = expectStatus(await call('GET', '/coupons?all=1', { token: S.admin }), 200).data;
    const fd = all.find(c => c.code === C_FREE);
    expectStatus(await call('DELETE', `/coupons/${fd.id}`, { token: S.admin }), 200);
    const act = expectStatus(await call('GET', '/coupons', { token: S.admin }), 200).data;
    assert(!act.some(c => c.code === C_FREE) && act.every(c => c.is_active === true), 'inactive coupon listed');
  });
  await step('banners /all (needs banners.created_at) and favorites / loyalty tables exist', async () => {
    expectStatus(await call('GET', '/banners/all', { token: S.admin }), 200);
    expectStatus(await call('POST', `/users/favorites/${S.restA}`, { token: S.cust }), 200);
    const f = expectStatus(await call('GET', '/users/favorites', { token: S.cust }), 200).data;
    assert(f.length === 1 && !('owner_id' in f[0]), 'favorites');
  });

  // ═══════════════════════════════════════════════════════════════
  //  🧺 الطلب المجمّع (عدة مطاعم — سائق واحد)
  // ═══════════════════════════════════════════════════════════════
  if (process.env.SMOKE_SKIP_MULTI !== '1') await multiRestaurantSuite(S);

  // تنظيف: السائقون offline حتى لا تؤثر على تشغيل لاحق
  for (const t of [S.d1, S.d2, S.d3, S.d4, S.d5]) if (t) await call('PATCH', '/drivers/status', { token: t, body: { is_online: false } }).catch(() => {});
  for (const k of ['sCust', 'sOwner', 'sD1', 'sD2', 'sCA', 'sO1', 'sO2', 'sO3', 'sD3', 'sD4', 'sD5']) if (S[k]) S[k].close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} steps passed`);
  if (failed.length) { for (const f of failed) console.log(`   - ${f.name}: ${f.err}`); process.exit(1); }
  process.exit(0);
})().catch((e) => { console.error('fatal:', e); process.exit(1); });

// ═══════════════════════════════════════════════════════════════
//  🧺 سيناريو الطلب المجمّع — مطاعم M1/M2/M3 متقاربة (≤3 كم) + MF بعيد، سائقان D3/D4، زبون CA بكود دعوة
//  الأرقام (مناطق: 0-3=5، 3-6=8؛ محطة إضافية 3₪؛ حد التوصيل المجاني 50):
//   A: M1 20 + M2 15 + M3 12 = 47؛ الأبعد M3 5.56كم → 8؛ إضافي 6؛ أول طلب 7.05؛ بقشيش 4 → 57.95؛ السائق 8+6+4 = 18
//   B: M1 40 + M2 15 + M3 3 = 58 (توصيل مجاني)؛ كوبون 10 (حد 50)؛ نقاط 39=1.95؛ محفظة 10.94 → 41.11
//      M1 يرفض → 18: أساسي 5 (الأبعد تغيّر) + 3، الكوبون يسقط → 13.11 ؛ M2 يلغي → 3+5−1.95 = 6.05 → استرجاع محفظة 4.89، الإجمالي 0
//   C: M1 20 + M2 15 = 35 + 8 + 3 − نقاط 0.15 − محفظة 4.95 → 40.90 → الزبون يلغي → استرجاع كامل
// ═══════════════════════════════════════════════════════════════
async function multiRestaurantSuite(S) {
  console.log('\n  🧺 multi-restaurant (one driver) suite');
  const L = 31.6 + (rnd() % 800) / 1000, G = 35.0 + (rnd() % 300) / 1000; // موقع عشوائي لكل تشغيل (بعيد عن سائقي التشغيلات السابقة)
  const M = {};
  const C_MULTI = 'MR' + RUN;

  async function mkRestaurant(key, name, lat, lng, minOrder, items) {
    const op = phone(), ow = pass();
    const d = expectStatus(await call('POST', '/admin/restaurants', { token: S.admin, body: {
      name_ar: name, lat, lng, min_order: minOrder, owner_phone: op, owner_password: ow } }), 201);
    const tok = expectStatus(await call('POST', '/auth/login-password', { body: { phone: op, password: ow } }), 200).token;
    const c = expectStatus(await call('POST', '/menu/categories', { token: tok, body: { restaurant_id: d.data.id, name_ar: 'عام' } }), 201);
    const ids = [];
    for (const [n, p] of items) {
      const i = expectStatus(await call('POST', '/menu/items', { token: tok, body: { restaurant_id: d.data.id, category_id: c.data.id, name_ar: n, price: p } }), 201);
      ids.push(i.data.id);
    }
    M[key] = { id: d.data.id, name, token: tok, items: ids };
  }
  const cart = (key, idx = 0, qty = 1) => ({ restaurant_id: M[key].id, items: [{ id: M[key].items[idx], quantity: qty }] });
  const profile = async (tok) => expectStatus(await call('GET', '/users/profile', { token: tok }), 200).data;
  const drvMe = async (tok) => expectStatus(await call('GET', '/drivers/me', { token: tok }), 200).data;
  async function waitFor(fn, ms = 5000, every = 250) {
    const t0 = Date.now();
    for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(every); }
  }

  await step('multi setup: restaurants M1/M2/M3 (+cheap item) + MF, drivers D3/D4, customer CA (referral), coupon', async () => {
    if (S.d1) expectStatus(await call('PATCH', '/drivers/status', { token: S.d1, body: { is_online: false } }), 200);
    await mkRestaurant('M1', 'مطعم م1 ' + RUN, L, G, 10, [['شاورما', 20]]);
    await mkRestaurant('M2', 'مطعم م2 ' + RUN, L + 0.01, G, 10, [['فلافل', 15]]);
    await mkRestaurant('M3', 'مطعم م3 ' + RUN, L + 0.02, G, 3, [['بيتزا', 12], ['ماء', 3]]);
    await mkRestaurant('MF', 'مطعم بعيد ' + RUN, L + 0.06, G, 10, [['برغر', 25]]);
    // D3: يعلن الميزة بالترويسة HTTP؛ D4: بمصافحة السوكِت فقط (إن توفّر socket.io-client)؛ D5: تطبيق قديم (بلا ميزة) واقف عند M3 تماماً
    for (const [k, lat] of [['d3', L + 0.021], ['d4', L - 0.001], ['d5', L + 0.02]]) {
      const ph = phone(), pw = pass();
      expectStatus(await call('POST', '/drivers', { token: S.admin, body: { name: 'سائق ' + k, phone: ph, password: pw } }), 201);
      const d = expectStatus(await call('POST', '/auth/login-password', { body: { phone: ph, password: pw } }), 200);
      S[k] = d.token; S[k + 'Id'] = d.user.id;
      if (k === 'd3' || (k === 'd4' && !ioClient)) GROUP_TOKENS.add(d.token);
      expectStatus(await call('PATCH', '/drivers/status', { token: d.token, body: { is_online: true, lat, lng: G } }), 200);
    }
    const r2 = expectStatus(await call('POST', '/auth/register', { body: { name: 'داعي 2', phone: phone(), password: pass() } }), 201);
    S.ref2 = r2.token;
    const ca = expectStatus(await call('POST', '/auth/register', { body: { name: 'زبون مجمّع', phone: phone(), password: pass(), referred_by: r2.user.referral_code } }), 201);
    S.ca = ca.token; S.caId = ca.user.id;
    S.addrA = expectStatus(await call('POST', '/users/addresses', { token: S.ca, body: { label: 'أ', address: 'عنوان أ', lat: L - 0.03, lng: G } }), 201).data.id;
    S.addrB = expectStatus(await call('POST', '/users/addresses', { token: S.ca, body: { label: 'ب', address: 'عنوان ب', lat: L + 0.035, lng: G } }), 201).data.id;
    expectStatus(await call('POST', '/coupons', { token: S.admin, body: { code: C_MULTI, type: 'fixed', value: 10, min_order: 50 } }), 201);
    if (ioClient) {
      S.sCA = socketFor(S.ca); S.sO1 = socketFor(M.M1.token); S.sO2 = socketFor(M.M2.token); S.sO3 = socketFor(M.M3.token);
      S.sD3 = socketFor(S.d3, 'groups'); S.sD4 = socketFor(S.d4, 'groups'); S.sD5 = socketFor(S.d5);
      await sleep(800);
    }
    S.sockByTok = new Map([[S.d3, S.sD3], [S.d4, S.sD4]]);
  });
  await step('capability gate: supports_groups recorded from X-Wasaly-Features header (D3) and socket auth.features (D4); old app (D5) false', async () => {
    const list = expectStatus(await call('GET', '/drivers', { token: S.admin }), 200).data;
    const f = (id) => list.find(d => d.user_id === id);
    assert(f(S.d3Id).supports_groups === true, 'D3 not marked');
    assert(f(S.d4Id).supports_groups === true, 'D4 not marked (socket handshake)');
    assert(f(S.d5Id).supports_groups === false, 'D5 must stay false');
  });
  if (!M.M1 || !S.ca) return;

  // ─── الإعدادات ───
  await step('multi config: public GET; admin GET/PUT with validation; non-admin PUT → 403; disabled → quote error', async () => {
    const pub = expectStatus(await call('GET', '/orders/multi/config'), 200).data;
    assert(pub.enabled === true && pub.max_restaurants === 3 && pub.max_distance_km === 3 && pub.extra_stop_fee === 3, `config ${JSON.stringify(pub)}`);
    assert(Array.isArray(pub.payment_methods) && pub.payment_methods.join() === 'cash', 'payment_methods');
    const a = expectStatus(await call('GET', '/admin/settings/multi-restaurant', { token: S.admin }), 200).data;
    assert(a.max_restaurants === 3, 'admin get');
    expectStatus(await call('PUT', '/admin/settings/multi-restaurant', { token: S.admin, body: { max_restaurants: 1 } }), 400);
    expectStatus(await call('PUT', '/admin/settings/multi-restaurant', { token: S.admin, body: { max_distance_km: 'x' } }), 400);
    expectStatus(await call('PUT', '/admin/settings/multi-restaurant', { token: S.ca, body: { enabled: false } }), 403);
    let u = expectStatus(await call('PUT', '/admin/settings/multi-restaurant', { token: S.admin, body: { enabled: false } }), 200).data;
    assert(u.enabled === false && u.max_restaurants === 3, 'partial update');
    const q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { address_id: S.addrA, carts: [cart('M1'), cart('M2')] } }), 200).data;
    assert(q.valid === false && q.errors.some(e => e.code === 'disabled'), 'disabled not reported');
    u = expectStatus(await call('PUT', '/admin/settings/multi-restaurant', { token: S.admin, body: { enabled: true, max_restaurants: 3, max_distance_km: 3, extra_stop_fee: 3 } }), 200).data;
    assert(u.enabled === true, 're-enable');
  });

  // ─── أخطاء التحقق ───
  await step('multi validation: distance limit names the far restaurant (quote lists, create 400)', async () => {
    const body = { address_id: S.addrA, carts: [cart('M1'), cart('M2'), cart('MF')] };
    const q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body }), 200).data;
    const e = q.errors.find(x => x.code === 'too_far');
    assert(q.valid === false && e && e.restaurant_id === M.MF.id && e.message.includes(M.MF.name), `too_far ${JSON.stringify(q.errors)}`);
    const c = expectStatus(await call('POST', '/orders/multi', { token: S.ca, body }), 400);
    assert(c.message.includes(M.MF.name) && Array.isArray(c.errors), `create msg ${c.message}`);
  });
  await step('multi validation: max restaurants (4 > 3), too few, card rejected, pickup rejected, coords required, closed restaurant, foreign item', async () => {
    let q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { address_id: S.addrA, carts: [cart('M1'), cart('M2'), cart('M3'), cart('MF')] } }), 200).data;
    assert(q.errors.some(x => x.code === 'too_many_restaurants'), 'too_many missing');
    expectStatus(await call('POST', '/orders/multi', { token: S.ca, body: { address_id: S.addrA, carts: [cart('M1'), cart('M2'), cart('M3'), cart('MF')] } }), 400);
    q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { address_id: S.addrA, carts: [cart('M1')] } }), 200).data;
    assert(q.errors.some(x => x.code === 'too_few_restaurants'), 'too_few missing');
    const card = expectStatus(await call('POST', '/orders/multi', { token: S.ca, body: { address_id: S.addrA, payment_method: 'card', carts: [cart('M1'), cart('M2')] } }), 400);
    assert(card.errors.some(x => x.code === 'card_not_allowed') && /البطاقة/.test(card.message), `card ${card.message}`);
    q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { order_type: 'pickup', address_id: S.addrA, carts: [cart('M1'), cart('M2')] } }), 200).data;
    assert(q.errors.some(x => x.code === 'pickup_not_allowed'), 'pickup');
    q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { carts: [cart('M1'), cart('M2')] } }), 200).data;
    assert(q.errors.some(x => x.code === 'location_required'), 'coords required');
    expectStatus(await call('PATCH', `/admin/restaurants/${M.M2.id}/toggle`, { token: S.admin, body: { field: 'is_open' } }), 200);
    q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { address_id: S.addrA, carts: [cart('M1'), cart('M2')] } }), 200).data;
    assert(q.errors.some(x => x.code === 'restaurant_closed' && x.restaurant_id === M.M2.id), `closed ${JSON.stringify(q.errors)}`);
    expectStatus(await call('PATCH', `/admin/restaurants/${M.M2.id}/toggle`, { token: S.admin, body: { field: 'is_open' } }), 200);
    const bad = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { address_id: S.addrA,
      carts: [cart('M1'), { restaurant_id: M.M2.id, items: [{ id: M.M1.items[0], quantity: 1 }] }] } }), 200).data;
    assert(bad.errors.some(x => x.code === 'cart_invalid' && x.restaurant_id === M.M2.id), 'item from other restaurant');
  });
  // ─── A: المسار الكامل ───
  const bodyA = () => ({ address_id: S.addrA, tip: 4, payment_method: 'cash', notes: 'اتصل عند الوصول',
    carts: [cart('M1'), cart('M2'), cart('M3')] });
  await step('A quote: per-restaurant breakdown, base = farthest zone, extra stops, first-order once, tip', async () => {
    const q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: bodyA() }), 200).data;
    assert(q.valid === true && q.errors.length === 0, `errors ${JSON.stringify(q.errors)}`);
    assert(q.restaurants.length === 3 && q.restaurants[0].restaurant_id === M.M3.id, 'farthest-first order');
    assert(close(q.subtotal, 47) && close(q.base_fee, 8) && close(q.delivery_fee, 8) && close(q.extra_stops_fee, 6), `fees ${JSON.stringify(q)}`);
    assert(close(q.first_order_discount, 7.05) && close(q.discount, 7.05) && close(q.tip, 4), 'discount/tip');
    assert(close(q.driver_fee, 14) && close(q.total, 57.95) && q.free_delivery === false, `total ${q.total}`);
    S.qA = q;
  });
  await step('A create: group WSG + 3 children (WSL, delivery_fee 0, carrier holds driver_fee/tip), total = quote', async () => {
    const d = expectStatus(await call('POST', '/orders/multi', { token: S.ca, body: bodyA() }), 201).data;
    S.gA = d.id;
    assert(/^WSG\d{6,}$/.test(d.group_number) && d.status === 'pending' && close(d.total, S.qA.total), `group ${d.group_number} ${d.total}`);
    assert(d.orders.length === 3 && d.orders.every(o => /^WSL\d{6,}$/.test(o.order_number) && o.status === 'pending'), 'children');
    S.kA = Object.fromEntries(d.orders.map(o => [o.restaurant_id, o.id]));
    const my = expectStatus(await call('GET', '/orders/my', { token: S.ca }), 200).data.filter(o => o.group_id === S.gA);
    assert(my.length === 3 && my.every(o => o.group_number === d.group_number && close(o.delivery_fee, 0)), '/orders/my group fields');
    const fees = my.map(o => Number(o.driver_fee)).sort((a, b) => a - b);
    assert(close(fees[2], 14) && close(fees[0], 0) && close(fees[1], 0), `carrier fees ${fees}`);
    assert(close(my.reduce((s, o) => s + Number(o.tip), 0), 4), 'tip on carrier only');
  });
  if (ioClient) await step('A socket: each restaurant got new_order with group_id/group_number/stops_count', async () => {
    for (const [k, s] of [['M1', S.sO1], ['M2', S.sO2], ['M3', S.sO3]]) {
      const p = await waitEvent(s, 'new_order', (x) => x.order_id === S.kA[M[k].id]);
      assert(p.group_id === S.gA && /^WSG/.test(p.group_number) && p.stops_count === 3 && p.is_group === true, `new_order ${JSON.stringify(p)}`);
    }
  });
  await step('A restaurant dashboard shows grouped child (is_group, group_number, group_stops_count)', async () => {
    const l = expectStatus(await call('GET', `/restaurants/${M.M1.id}/orders?status=pending`, { token: M.M1.token }), 200).data;
    const o = l.find(x => x.id === S.kA[M.M1.id]);
    assert(o && o.is_group === true && o.group_id === S.gA && /^WSG/.test(o.group_number) && o.group_stops_count === 3 && close(o.total, 20), `dash ${JSON.stringify(o)}`);
  });
  await step('A child-level guards: customer cannot cancel a child; owner limited group view; stranger 403', async () => {
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M1.id]}/cancel`, { token: S.ca }), 400);
    const v = expectStatus(await call('GET', `/orders/groups/${S.gA}`, { token: M.M1.token }), 200).data;
    assert(v.view === 'restaurant' && v.orders.length === 1 && !('total' in v) && v.other_stops.length === 2, `owner view ${JSON.stringify(v).slice(0, 200)}`);
    expectStatus(await call('GET', `/orders/groups/${S.gA}`, { token: S.cust2 }), 403);
  });
  await step('A confirms: 2 of 3 restaurants → group still pending, no driver offer', async () => {
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M1.id]}/confirm`, { token: M.M1.token }), 200);
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M2.id]}/status`, { token: M.M2.token, body: { status: 'confirmed' } }), 200);
    const g = expectStatus(await call('GET', `/orders/groups/${S.gA}`, { token: S.ca }), 200).data;
    assert(g.status === 'pending', `status ${g.status}`);
    for (const t of [S.d3, S.d4]) assert(!(await drvMe(t)).active_group, 'premature offer');
  });
  await step('A last restaurant confirms → group confirmed → ONE offer to nearest driver of first pickup (D3)', async () => {
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M3.id]}/confirm`, { token: M.M3.token }), 200);
    const me = await drvMe(S.d3);
    assert(me.active_group && me.active_group.id === S.gA && me.active_group.is_offer && me.active_group.offer_seconds > 30, `D3 offer ${JSON.stringify(me.active_group || null).slice(0, 200)}`);
    assert(close(me.active_group.cash_to_collect, 57.95) && close(me.active_group.driver_earning, 18), 'offer money');
    assert(!(await drvMe(S.d4)).active_group, 'D4 also offered');
    assert(!me.active_order, 'children must not be offered individually');
    const d5 = await drvMe(S.d5);
    assert(!d5.active_group && !d5.active_order, 'old-app driver D5 (closest to M3) must never get a group offer');
  });
  if (ioClient) await step('A socket: new_order_request {is_group, stops[3], dropoff, driver_fee 14, tip 4, cash 57.95, 45s}', async () => {
    const p = await waitEvent(S.sD3, 'new_order_request', (x) => x.group_id === S.gA);
    assert(p.is_group === true && p.stops.length === 3 && p.order_id === p.stops[0].order_id && p.dropoff && p.dropoff.lat, `payload ${JSON.stringify(p).slice(0, 300)}`);
    assert(close(p.driver_fee, 14) && close(p.tip, 4) && close(p.cash_to_collect, 57.95) && p.offer_seconds === 45 && !isNaN(Date.parse(p.expires_at)), 'offer fields');
    await waitEvent(S.sCA, 'group_status', (x) => x.group_id === S.gA && x.status === 'confirmed');
  });
  await step('A old-app compat: accepting a child id → 400 (group needs new driver app)', async () => {
    expectStatus(await call('POST', `/orders/${S.kA[M.M1.id]}/accept`, { token: S.d3 }), 400);
  });
  await step('A reject → offer moves to D4; D3 cannot accept after rejecting; reject twice → 400', async () => {
    expectStatus(await call('POST', `/orders/groups/${S.gA}/reject`, { token: S.d3 }), 200);
    expectStatus(await call('POST', `/orders/groups/${S.gA}/reject`, { token: S.d3 }), 400);
    const ok = await waitFor(async () => { const m = await drvMe(S.d4); return m.active_group && m.active_group.id === S.gA && m.active_group.is_offer; });
    assert(ok, 'D4 not offered after reject');
    expectStatus(await call('POST', `/orders/groups/${S.gA}/accept`, { token: S.d3 }), 400);
  });
  await step('A timeout: D4 ignores the 45s offer → expires → re-dispatched back to D3 (≈57s)', async () => {
    const ok = await waitFor(async () => { const m = await drvMe(S.d3); return m.active_group && m.active_group.id === S.gA && m.active_group.is_offer; }, 80000, 2000);
    assert(ok, 'offer did not return to D3 after D4 timeout');
    assert(!(await drvMe(S.d4)).active_group, 'D4 still holds expired offer');
    assert(!(await drvMe(S.d5)).active_group, 'D5 (no groups feature) got the group after retries');
  });
  await step('A D3 accepts → picking_up, children preparing + driver set, route M3→M2→M1, D3 busy; accept twice idempotent', async () => {
    const a = expectStatus(await call('POST', `/orders/groups/${S.gA}/accept`, { token: S.d3 }), 200).data;
    assert(a.group_id === S.gA && a.stops.length === 3, 'accept data');
    const again = expectStatus(await call('POST', `/orders/groups/${S.gA}/accept`, { token: S.d3 }), 200).data;
    assert(again.already === true, 'not idempotent');
    const g = expectStatus(await call('GET', `/orders/groups/${S.gA}`, { token: S.ca }), 200).data;
    assert(g.status === 'picking_up' && g.driver_id === S.d3Id && g.driver_name, `group ${g.status}`);
    assert(g.orders.every(o => o.status === 'preparing'), `children ${g.orders.map(o => o.status)}`);
    assert(g.stops.map(s => s.restaurant_id).join() === [M.M3.id, M.M2.id, M.M1.id].join(), `route ${g.stops.map(s => s.name)}`);
    const me = await drvMe(S.d3);
    assert(me.is_busy === true && me.active_group && me.active_group.id === S.gA && !me.active_group.is_offer, 'driver state');
  });
  if (ioClient) await step('A socket: customer driver_assigned {group_id} + group_status picking_up', async () => {
    const p = await waitEvent(S.sCA, 'driver_assigned', (x) => x.group_id === S.gA);
    assert(String(p.driver_id) === String(S.d3Id), 'driver id');
    await waitEvent(S.sCA, 'group_status', (x) => x.group_id === S.gA && x.status === 'picking_up' && x.stops_total === 3);
  });
  await step('A guards after accept: customer cannot cancel; other driver pickup 403; old status route 400; restaurant on_the_way 403; deliver before pickups 400', async () => {
    expectStatus(await call('PATCH', `/orders/groups/${S.gA}/cancel`, { token: S.ca }), 400);
    expectStatus(await call('POST', `/orders/groups/${S.gA}/pickup`, { token: S.d4, body: { order_id: S.kA[M.M3.id] } }), 403);
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M3.id]}/status`, { token: S.d3, body: { status: 'on_the_way' } }), 400);
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M3.id]}/status`, { token: M.M3.token, body: { status: 'on_the_way' } }), 403);
    expectStatus(await call('POST', `/orders/groups/${S.gA}/deliver`, { token: S.d3 }), 400);
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M3.id]}/status`, { token: M.M3.token, body: { status: 'ready' } }), 200);
  });
  if (ioClient) await step('A location relay: PATCH /drivers/location + socket driver:location reach customer & all owners with group_id; spoof blocked', async () => {
    S.sCA.events.length = 0; S.sO1.events.length = 0;
    expectStatus(await call('PATCH', '/drivers/location', { token: S.d3, body: { lat: L + 0.0205, lng: G } }), 200);
    let p = await waitEvent(S.sCA, 'driver:location', (x) => x.group_id === S.gA);
    assert(close(p.lat, L + 0.0205, 1e-6), 'relay lat');
    await waitEvent(S.sO1, 'driver:location', (x) => x.group_id === S.gA);
    S.sCA.events.length = 0;
    S.sD4.emit('driver:location', { lat: 1, lng: 1, group_id: S.gA });
    await sleep(500);
    assert(!S.sCA.events.some(e => e.ev === 'driver:location'), 'spoofed group location relayed');
    S.sD3.emit('driver:location', { lat: L + 0.0201, lng: G, group_id: S.gA });
    p = await waitEvent(S.sCA, 'driver:location', (x) => x.group_id === S.gA);
    assert(close(p.lat, L + 0.0201, 1e-6), 'socket relay');
  });
  await step('A pickups in route order (M3 → M2 → M1): picked_count increments, last → on_the_way; repeat idempotent; picked child cannot be cancelled', async () => {
    let r = expectStatus(await call('POST', `/orders/groups/${S.gA}/pickup`, { token: S.d3, body: { order_id: S.kA[M.M3.id] } }), 200).data;
    assert(r.picked_count === 1 && r.status === 'picking_up' && r.next_stop && r.next_stop.restaurant_id === M.M2.id, `p1 ${JSON.stringify(r)}`);
    r = expectStatus(await call('POST', `/orders/groups/${S.gA}/pickup`, { token: S.d3, body: { order_id: S.kA[M.M3.id] } }), 200).data;
    assert(r.already === true && r.picked_count === 1, 'repeat pickup');
    r = expectStatus(await call('POST', `/orders/groups/${S.gA}/pickup`, { token: S.d3, body: { order_id: S.kA[M.M2.id] } }), 200).data;
    assert(r.picked_count === 2 && r.next_stop.restaurant_id === M.M1.id, 'p2');
    expectStatus(await call('POST', `/orders/groups/${S.gA}/pickup`, { token: S.d3, body: { order_id: 99999999 } }), 404);
    expectStatus(await call('PATCH', `/orders/${S.kA[M.M3.id]}/status`, { token: M.M3.token, body: { status: 'cancelled' } }), 400);
    r = expectStatus(await call('POST', `/orders/groups/${S.gA}/pickup`, { token: S.d3, body: { order_id: S.kA[M.M1.id] } }), 200).data;
    assert(r.picked_count === 3 && r.status === 'on_the_way' && r.all_picked === true, 'p3');
    const c = expectStatus(await call('GET', `/orders/${S.kA[M.M1.id]}`, { token: S.ca }), 200).data;
    assert(c.status === 'on_the_way' && c.picked_up_at && c.group_number && c.is_group === true, 'child on_the_way');
  });
  if (ioClient) await step('A socket: group_status on_the_way (3/3) to customer + owners; order_status per child', async () => {
    await waitEvent(S.sCA, 'group_status', (x) => x.group_id === S.gA && x.status === 'on_the_way' && x.picked_count === 3);
    await waitEvent(S.sO2, 'group_status', (x) => x.group_id === S.gA && x.status === 'on_the_way');
    await waitEvent(S.sO1, 'order_status', (x) => x.order_id === S.kA[M.M1.id] && x.status === 'on_the_way');
  });
  await step('A deliver: driver wallet += 18 exactly once, total_deliveries +1, freed; customer cashback+points+referral once', async () => {
    const before = await drvMe(S.d3);
    const revBefore = Number(expectStatus(await call('GET', '/analytics/overview', { token: S.admin }), 200).data.revenue) || 0;
    const r = expectStatus(await call('POST', `/orders/groups/${S.gA}/deliver`, { token: S.d3 }), 200).data;
    const revAfter = Number(expectStatus(await call('GET', '/analytics/overview', { token: S.admin }), 200).data.revenue) || 0;
    assert(close(revAfter - revBefore, 57.95), `analytics revenue must add the group total once: +${revAfter - revBefore}`);
    assert(close(r.driver_earning, 18), `earning ${r.driver_earning}`);
    const again = expectStatus(await call('POST', `/orders/groups/${S.gA}/deliver`, { token: S.d3 }), 200).data;
    assert(again.already === true, 'deliver not idempotent');
    const after = await drvMe(S.d3);
    assert(close(Number(after.wallet_balance) - Number(before.wallet_balance), 18), `driver wallet delta ${after.wallet_balance - before.wallet_balance}`);
    assert(Number(after.total_deliveries) - Number(before.total_deliveries) === 1, 'total_deliveries delta');
    assert(after.is_busy === false && !after.active_group, 'driver freed');
    const e = expectStatus(await call('GET', '/drivers/earnings?period=today', { token: S.d3 }), 200).data;
    assert(close(e.stats.earnings, 18) && Number(e.stats.deliveries) === 1 && close(e.stats.tips, 4), `earnings ${JSON.stringify(e.stats)}`);
    const p = await profile(S.ca);
    assert(close(p.wallet_balance, 0.94 + 10), `customer wallet ${p.wallet_balance}`);
    assert(Number(p.loyalty_points) === 39, `points ${p.loyalty_points}`);
    const ref = await profile(S.ref2);
    assert(close(ref.wallet_balance, 10), `referrer ${ref.wallet_balance}`);
    const tx = expectStatus(await call('GET', '/wallet/transactions', { token: S.ca }), 200).data;
    assert(tx.filter(t => /كاش باك/.test(t.description)).length === 1 && tx.filter(t => /دعوة/.test(t.description)).length === 1, 'benefits paid more than once');
  });
  await step('A restaurants see their child delivered; group view + /groups/my + admin views + accounting', async () => {
    for (const k of ['M1', 'M2', 'M3']) {
      const l = expectStatus(await call('GET', `/restaurants/${M[k].id}/orders?status=delivered`, { token: M[k].token }), 200).data;
      assert(l.some(x => x.id === S.kA[M[k].id] && x.is_group), `${k} child not delivered`);
    }
    const g = expectStatus(await call('GET', `/orders/groups/${S.gA}`, { token: S.ca }), 200).data;
    assert(g.status === 'delivered' && g.payment_status === 'paid' && g.orders.every(o => o.status === 'delivered') && close(g.cashback_given, 0.94), 'group delivered');
    const my = expectStatus(await call('GET', '/orders/groups/my?status=past', { token: S.ca }), 200).data;
    assert(my.some(x => x.id === S.gA && x.orders.length === 3 && x.is_group), 'groups/my');
    const ag = expectStatus(await call('GET', `/admin/groups/${S.gA}`, { token: S.admin }), 200).data;
    assert(ag.view === 'admin' && ag.orders.length === 3 && ag.orders[0].items.length === 1, 'admin group');
    const ao = expectStatus(await call('GET', `/admin/orders?group_id=${S.gA}`, { token: S.admin }), 200).data;
    assert(ao.length === 3 && ao.every(o => o.group_number === g.group_number && o.is_group), 'admin orders group filter');
    expectStatus(await call('GET', `/admin/groups/${S.gA}`, { token: S.ca }), 403);
    const live = expectStatus(await call('GET', '/admin/live-ops', { token: S.admin }), 200);
    assert(Array.isArray(live.orders), 'live-ops');
    const acc = expectStatus(await call('GET', '/admin/accounting', { token: S.admin }), 200);
    assert(acc.totals.multi_groups >= 1 && acc.totals.extra_stops_fees >= 6, `accounting ${JSON.stringify(acc.totals)}`);
    const d3row = acc.drivers.find(d => d.id === S.d3Id);
    assert(d3row && d3row.deliveries === 1 && close(d3row.earnings, 18), `accounting driver ${JSON.stringify(d3row)}`);
  });
  await step('A rating a grouped child works (per restaurant)', async () => {
    expectStatus(await call('POST', `/orders/${S.kA[M.M1.id]}/rate`, { token: S.ca, body: { restaurant_rating: 5, driver_rating: 5 } }), 200);
  });
  // ─── B: مطعم يعتذر → إعادة حساب + استرجاع جزئي ───
  const bodyB = () => ({ address_id: S.addrB, coupon_code: C_MULTI, redeem_points: 39, use_wallet: true, tip: 0,
    carts: [cart('M1', 0, 2), cart('M2'), cart('M3', 1)] });
  await step('B create: free delivery (≥50) waives base only, coupon once, points + wallet atomically', async () => {
    const q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: bodyB() }), 200).data;
    assert(q.valid && close(q.subtotal, 58) && q.free_delivery && close(q.delivery_fee, 0) && close(q.base_fee, 8) && close(q.extra_stops_fee, 6), `B quote ${JSON.stringify(q)}`);
    assert(close(q.coupon_discount, 10) && !q.coupon_error && close(q.first_order_discount, 0) && close(q.points_value, 1.95) && close(q.wallet_used, 10.94) && close(q.total, 41.11), 'B money');
    const d = expectStatus(await call('POST', '/orders/multi', { token: S.ca, body: bodyB() }), 201).data;
    S.gB = d.id; S.kB = Object.fromEntries(d.orders.map(o => [o.restaurant_id, o.id]));
    assert(close(d.total, 41.11) && close(d.driver_fee, 14) && d.coupon_code === C_MULTI, 'B create');
    const p = await profile(S.ca);
    assert(close(p.wallet_balance, 0) && Number(p.loyalty_points) === 0, `after B create wallet ${p.wallet_balance} pts ${p.loyalty_points}`);
  });
  await step('B M2+M3 confirm, M1 rejects → recalculated: base 5 (farthest changed) + 3, coupon dropped & released, total 13.11; group confirmed & dispatched', async () => {
    expectStatus(await call('PATCH', `/orders/${S.kB[M.M2.id]}/confirm`, { token: M.M2.token }), 200);
    expectStatus(await call('PATCH', `/orders/${S.kB[M.M3.id]}/confirm`, { token: M.M3.token }), 200);
    if (ioClient) S.sCA.events.length = 0;
    expectStatus(await call('PATCH', `/orders/${S.kB[M.M1.id]}/status`, { token: M.M1.token, body: { status: 'cancelled', reason: 'نفد الصنف' } }), 200);
    const g = expectStatus(await call('GET', `/orders/groups/${S.gB}`, { token: S.ca }), 200).data;
    assert(close(g.subtotal, 18) && close(g.base_fee, 5) && close(g.delivery_fee, 5) && close(g.extra_stops_fee, 3) && g.free_delivery === false, `B recalc fees ${JSON.stringify(g).slice(0, 400)}`);
    assert(!g.coupon_code && close(g.discount, 0) && close(g.points_value, 1.95) && close(g.wallet_used, 10.94) && close(g.total, 13.11) && close(g.driver_fee, 8), `B recalc money total ${g.total}`);
    assert(g.stops_total === 2 && g.status === 'confirmed', `B status ${g.status}`);
    const offered = await waitFor(async () => {
      for (const t of [S.d3, S.d4]) { const m = await drvMe(t); if (m.active_group && m.active_group.id === S.gB && m.active_group.is_offer) return t; }
      return null;
    });
    assert(offered, 'B not dispatched after recalculation');
    S.bDriver = offered;
    S.bExpires = (await drvMe(offered)).active_group.expires_at;
    const q = expectStatus(await call('POST', '/orders/multi/quote', { token: S.ca, body: { ...bodyB(), redeem_points: 0, use_wallet: false } }), 200).data;
    assert(!q.coupon_error && close(q.coupon_discount, 10), `coupon usage not released: ${q.coupon_error}`);
  });
  if (ioClient) await step('B socket: group_updated (restaurant_cancelled, totals) + customer push "مطعم X اعتذر، كمّلنا طلبك من باقي المطاعم"', async () => {
    const p = await waitEvent(S.sCA, 'group_updated', (x) => x.group_id === S.gB && x.reason === 'restaurant_cancelled');
    assert(p.restaurant_id === M.M1.id && p.coupon_dropped === true && close(p.totals.total, 13.11), `group_updated ${JSON.stringify(p)}`);
    const n = await waitEvent(S.sCA, 'notification', (x) => x.type === 'group_updated');
    assert(n.body.includes(M.M1.name) && n.body.includes('كمّلنا طلبك من باقي المطاعم'), `push body ${n.body}`);
  });
  await step('B M2 cancels its confirmed child → only M3 left: due 6.05 → wallet refund 4.89, total 0 (paid)', async () => {
    expectStatus(await call('PATCH', `/orders/${S.kB[M.M2.id]}/status`, { token: M.M2.token, body: { status: 'cancelled' } }), 200);
    const g = expectStatus(await call('GET', `/orders/groups/${S.gB}`, { token: S.ca }), 200).data;
    assert(close(g.subtotal, 3) && close(g.delivery_fee, 5) && close(g.extra_stops_fee, 0) && close(g.wallet_used, 6.05) && close(g.total, 0) && g.payment_status === 'paid', `B2 ${JSON.stringify(g).slice(0, 400)}`);
    assert(g.stops_total === 1 && close(g.driver_fee, 5), 'B2 stops/driver_fee');
    const p = await profile(S.ca);
    assert(close(p.wallet_balance, 4.89), `refund wallet ${p.wallet_balance}`);
  });
  if (ioClient) await step('B pending offer re-sent with updated payload (same expires_at) + group_updated to offered driver', async () => {
    const s = S.sockByTok.get(S.bDriver);
    const p = await waitEvent(s, 'new_order_request', (x) => x.group_id === S.gB && x.updated === true && x.stops_count === 1);
    assert(close(p.driver_fee, 5) && close(p.cash_to_collect, 0) && p.stops[0].restaurant_id === M.M3.id, `updated offer ${JSON.stringify(p).slice(0, 300)}`);
    assert(Date.parse(p.expires_at) === Date.parse(S.bExpires) && p.offer_seconds <= 45, `expires_at changed ${p.expires_at} vs ${S.bExpires}`);
    await waitEvent(s, 'group_updated', (x) => x.group_id === S.gB && x.stops_total === 1);
  });
  await step('B group of one completes: accept, pickup, deliver → driver += 5; customer cashback 0.06 + 3 points', async () => {
    const t = S.bDriver;
    const before = Number((await drvMe(t)).wallet_balance);
    expectStatus(await call('POST', `/orders/groups/${S.gB}/accept`, { token: t }), 200);
    expectStatus(await call('POST', `/orders/groups/${S.gB}/pickup`, { token: t, body: { order_id: S.kB[M.M1.id] } }), 400); // ملغى
    const r = expectStatus(await call('POST', `/orders/groups/${S.gB}/pickup`, { token: t, body: { order_id: S.kB[M.M3.id] } }), 200).data;
    assert(r.status === 'on_the_way' && r.stops_total === 1, 'B pickup');
    expectStatus(await call('POST', `/orders/groups/${S.gB}/deliver`, { token: t }), 200);
    const after = Number((await drvMe(t)).wallet_balance);
    assert(close(after - before, 5), `B driver delta ${after - before}`);
    const p = await profile(S.ca);
    assert(close(p.wallet_balance, 4.95) && Number(p.loyalty_points) === 3, `B customer wallet ${p.wallet_balance} pts ${p.loyalty_points}`);
  });

  // ─── C: الزبون يلغي الكل → استرجاع كامل ───
  await step('C customer cancels whole group (one restaurant confirmed) → all children cancelled, full wallet+points refund', async () => {
    const d = expectStatus(await call('POST', '/orders/multi', { token: S.ca, body: { address_id: S.addrA, redeem_points: 3, use_wallet: true,
      carts: [cart('M1'), cart('M2')] } }), 201).data;
    S.gC = d.id; S.kC = Object.fromEntries(d.orders.map(o => [o.restaurant_id, o.id]));
    assert(close(d.subtotal, 35) && close(d.delivery_fee, 8) && close(d.extra_stops_fee, 3) && close(d.points_value, 0.15) && close(d.wallet_used, 4.95) && close(d.total, 40.9), `C ${JSON.stringify(d).slice(0, 300)}`);
    let p = await profile(S.ca);
    assert(close(p.wallet_balance, 0) && Number(p.loyalty_points) === 0, 'C debit');
    expectStatus(await call('PATCH', `/orders/${S.kC[M.M1.id]}/confirm`, { token: M.M1.token }), 200);
    if (ioClient) { S.sO1.events.length = 0; S.sO2.events.length = 0; }
    expectStatus(await call('PATCH', `/orders/groups/${S.gC}/cancel`, { token: S.cust2 }), 404);
    const c = expectStatus(await call('PATCH', `/orders/groups/${S.gC}/cancel`, { token: S.ca, body: { reason: 'غيّرت رأيي' } }), 200).data;
    assert(close(c.refunded_wallet, 4.95) && c.refunded_points === 3, `refund ${JSON.stringify(c)}`);
    p = await profile(S.ca);
    assert(close(p.wallet_balance, 4.95) && Number(p.loyalty_points) === 3, `after C cancel wallet ${p.wallet_balance} pts ${p.loyalty_points}`);
    const g = expectStatus(await call('GET', `/orders/groups/${S.gC}`, { token: S.ca }), 200).data;
    assert(g.status === 'cancelled' && g.orders.every(o => o.status === 'cancelled'), 'C children');
    expectStatus(await call('PATCH', `/orders/groups/${S.gC}/cancel`, { token: S.ca }), 400);
  });
  if (ioClient) await step('C socket: owners got order_cancelled {by: customer, group_id}; customer group_cancelled', async () => {
    for (const [k, s] of [['M1', S.sO1], ['M2', S.sO2]]) {
      const p = await waitEvent(s, 'order_cancelled', (x) => x.order_id === S.kC[M[k].id]);
      assert(p.by === 'customer' && p.group_id === S.gC, `${k} order_cancelled`);
    }
    await waitEvent(S.sCA, 'group_cancelled', (x) => x.group_id === S.gC && x.by === 'customer');
  });
  await step('D every restaurant rejects → group shrinks then cancels automatically; balances untouched', async () => {
    const d = expectStatus(await call('POST', '/orders/multi', { token: S.ca, body: { address_id: S.addrA, carts: [cart('M1'), cart('M2')] } }), 201).data;
    const k = Object.fromEntries(d.orders.map(o => [o.restaurant_id, o.id]));
    expectStatus(await call('PATCH', `/orders/${k[M.M1.id]}/status`, { token: M.M1.token, body: { status: 'cancelled' } }), 200);
    let g = expectStatus(await call('GET', `/orders/groups/${d.id}`, { token: S.ca }), 200).data;
    assert(g.status === 'pending' && g.stops_total === 1 && close(g.extra_stops_fee, 0), `D1 ${g.status}`);
    expectStatus(await call('PATCH', `/orders/${k[M.M2.id]}/status`, { token: M.M2.token, body: { status: 'cancelled' } }), 200);
    g = expectStatus(await call('GET', `/orders/groups/${d.id}`, { token: S.ca }), 200).data;
    assert(g.status === 'cancelled', `D2 ${g.status}`);
    const p = await profile(S.ca);
    assert(close(p.wallet_balance, 4.95) && Number(p.loyalty_points) === 3, 'D balances untouched');
  });
}
