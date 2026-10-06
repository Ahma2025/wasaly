const jwt = require('jsonwebtoken');
const { jwtVerifyKey } = require('./jwtKey');
const pool = require('../config/database');
const cache = require('./cache');
const { isTokenDenied } = require('./security');
const driverLoc = require('./driverLocation');
const { noteDriverFeatures } = require('./driverFeatures');

// كاش المصادقة (60 ث): موجات الاتصال (إعادة نشر/انقطاع شبكة) لا تضرب القاعدة بـ SELECT لكل handshake
const AUTH_TTL = Number(process.env.SOCKET_AUTH_CACHE_MS) || 60000;
const authKey = (id) => `sockauth:${id}`;
async function lookupSocketUser(id) {
  return cache.wrap(authKey(id), AUTH_TTL, async () => {
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id=$1 AND is_active=true AND COALESCE(is_blocked,false)=false', [id]);
    return rows[0] ? { id: rows[0].id, role: rows[0].role } : { none: true };
  });
}
// يُستدعى عند حظر/حذف/تغيير دور مستخدم
const invalidateSocketAuth = (id) => cache.del(authKey(id)).catch(() => {});

const ACTIVE = ['confirmed', 'preparing', 'ready', 'on_the_way'];
const validCoord = (lat, lng) => {
  const a = parseFloat(lat), b = parseFloat(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
};

module.exports = (io) => {
  // 🔒 المصادقة: توكن صالح + حساب نشط وغير محظور (كان يكفي التوكن فقط)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, jwtVerifyKey());
      if (await isTokenDenied(token)) return next(new Error('Invalid token'));
      const u = await lookupSocketUser(decoded.id);
      if (!u || u.none) return next(new Error('User not found'));
      socket.userId = u.id;
      socket.userRole = u.role;
      if (u.role === 'driver') {
        const feats = (socket.handshake.auth && socket.handshake.auth.features) || socket.handshake.headers['x-wasaly-features'];
        if (feats) await noteDriverFeatures(u.id, feats);
      }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // كاش قصير: orderId → { customer_id, owner_id, driver_id, assigned, status } — يُحدَّث كل 30 ثانية
  const _orderCache = new Map();
  const CACHE_TTL = 30000;
  async function getOrderInfo(orderId) {
    const key = String(orderId);
    const hit = _orderCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.info;
    const { rows } = await pool.query(
      `SELECT o.customer_id, o.driver_id, o.driver_assigned_at, o.status, o.group_id, r.owner_id
       FROM orders o LEFT JOIN restaurants r ON r.id = o.restaurant_id WHERE o.id=$1`, [orderId]);
    const info = rows[0] ? {
      customer_id: rows[0].customer_id, owner_id: rows[0].owner_id, driver_id: rows[0].driver_id,
      assigned: !!rows[0].driver_assigned_at, status: rows[0].status, group_id: rows[0].group_id || null,
    } : null;
    if (_orderCache.size > 10000) _orderCache.clear();
    _orderCache.set(key, { at: Date.now(), info });
    return info;
  }

  // 🧺 الطلب المجمّع: groupId → { customer_id, driver_id, assigned, status, owner_ids, first_order_id } — نفس كاش الـ 30ث
  async function getGroupInfo(groupId) {
    const key = `g${groupId}`;
    const hit = _orderCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.info;
    const { rows } = await pool.query(
      `SELECT g.customer_id, g.driver_id, g.driver_assigned_at, g.status,
              (SELECT array_agg(DISTINCT r.owner_id) FROM orders o JOIN restaurants r ON r.id=o.restaurant_id
                WHERE o.group_id=g.id AND o.status <> 'cancelled' AND r.owner_id IS NOT NULL) AS owner_ids,
              (SELECT o.id FROM orders o WHERE o.group_id=g.id AND o.status <> 'cancelled' ORDER BY o.stop_sequence NULLS LAST, o.id LIMIT 1) AS first_order_id
       FROM order_groups g WHERE g.id=$1`, [groupId]);
    const info = rows[0] ? {
      customer_id: rows[0].customer_id, driver_id: rows[0].driver_id, assigned: !!rows[0].driver_assigned_at,
      status: rows[0].status, owner_ids: rows[0].owner_ids || [], first_order_id: rows[0].first_order_id,
    } : null;
    if (_orderCache.size > 10000) _orderCache.clear();
    _orderCache.set(key, { at: Date.now(), info });
    return info;
  }
  const GROUP_ACTIVE = ['picking_up', 'on_the_way'];

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);

    // موقع السائق الحي — فقط من السائق الذي *قبِل* هذا الطلب، وفقط لطلب نشط
    socket.on('driver:location', async (payload) => {
      try {
        if (socket.userRole !== 'driver' || !payload) return;
        const { lat, lng } = payload;
        const orderId = payload.orderId ?? payload.order_id;
        let groupId = payload.groupId ?? payload.group_id;
        if (!validCoord(lat, lng)) return;
        if (!groupId && orderId && /^\d+$/.test(String(orderId))) {
          const oi = await getOrderInfo(orderId);
          if (oi && oi.group_id) groupId = oi.group_id;
        }
        if (groupId && /^\d+$/.test(String(groupId))) {
          // 🧺 طلب مجمّع: فقط السائق المُسند، والموقع للزبون + كل أصحاب المطاعم
          const gi = await getGroupInfo(groupId);
          if (gi && gi.assigned && String(gi.driver_id) === String(socket.userId) && GROUP_ACTIVE.includes(gi.status)) {
            const oid = Number(orderId && /^\d+$/.test(String(orderId)) ? orderId : gi.first_order_id) || null;
            const out = { lat: +lat, lng: +lng, orderId: oid, order_id: oid, group_id: Number(groupId) };
            if (gi.customer_id) io.to(`user:${gi.customer_id}`).emit('driver:location', out);
            for (const ow of gi.owner_ids) io.to(`user:${ow}`).emit('driver:location', out);
          } else {
            const hit = _orderCache.get(`g${groupId}`);
            if (hit && Date.now() - hit.at > 3000) _orderCache.delete(`g${groupId}`);
          }
        } else if (orderId && /^\d+$/.test(String(orderId))) {
          const info = await getOrderInfo(orderId);
          if (info && info.assigned && String(info.driver_id) === String(socket.userId) && ACTIVE.includes(info.status)) {
            const out = { lat: +lat, lng: +lng, orderId: Number(orderId), order_id: Number(orderId) };
            if (info.customer_id) io.to(`user:${info.customer_id}`).emit('driver:location', out);
            if (info.owner_id) io.to(`user:${info.owner_id}`).emit('driver:location', out);
          } else {
            // ربما قُبل الطلب للتو — نُبطل الكاش (إن مضى عليه > 3 ثوانٍ) حتى تُعاد قراءته بالنبضة التالية
            const hit = _orderCache.get(String(orderId));
            if (hit && Date.now() - hit.at > 3000) _orderCache.delete(String(orderId));
          }
        }
        // آخر موقع → Redis/ذاكرة فوراً، والقاعدة ≤ مرة كل 15 ثانية (مشترك مع PATCH /drivers/location)
        driverLoc.setLocation(socket.userId, +lat, +lng).catch(() => {});
      } catch (e) {
        console.error('driver:location error:', e.message);
      }
    });

    socket.on('driver:status', async (payload) => {
      try {
        if (socket.userRole !== 'driver') return;
        await pool.query('UPDATE drivers SET is_online=$1 WHERE user_id=$2', [!!(payload && payload.isOnline), socket.userId]);
      } catch { /* ignore */ }
    });

    // ملاحظة: لا نجعل السائق offline عند انقطاع السوكِت — التطبيق بالخلفية يفقد السوكِت ويعتمد على FCM لاستقبال العروض
  });

  return io;
};
module.exports.invalidateSocketAuth = invalidateSocketAuth;
