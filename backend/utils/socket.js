const jwt = require('jsonwebtoken');
const pool = require('../config/database');

module.exports = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // كاش بالذاكرة: orderId → customerId (يوفّر SELECT على كل نبضة موقع)
  const _orderCustomer = new Map();
  // آخر وقت حفظنا فيه موقع السائق بقاعدة البيانات (تقليل الكتابة)
  const _lastPersist = new Map();
  const PERSIST_EVERY = 15000; // نكتب الموقع بالـ DB كل 15 ثانية فقط، والبثّ اللحظي للزبون كل نبضة

  io.on('connection', (socket) => {
    console.log(`Socket connected: user ${socket.userId} (${socket.userRole})`);
    socket.join(`user:${socket.userId}`);

    // Driver sends live location with orderId
    socket.on('driver:location', async ({ lat, lng, orderId }) => {
      try {
        // 1) البثّ اللحظي للزبون فورًا (بدون انتظار قاعدة البيانات)
        if (orderId) {
          let customerId = _orderCustomer.get(String(orderId));
          if (customerId === undefined) {
            const { rows } = await pool.query('SELECT customer_id FROM orders WHERE id=$1', [orderId]);
            customerId = rows[0] ? rows[0].customer_id : null;
            if (_orderCustomer.size > 10000) _orderCustomer.clear(); // حماية الذاكرة
            _orderCustomer.set(String(orderId), customerId); // كاش
          }
          if (customerId) io.to(`user:${customerId}`).emit('driver:location', { lat, lng, orderId });
        }
        // 2) حفظ الموقع بقاعدة البيانات كل 15 ثانية فقط (بدل كل نبضة)
        const now = Date.now();
        if (now - (_lastPersist.get(socket.userId) || 0) >= PERSIST_EVERY) {
          _lastPersist.set(socket.userId, now);
          pool.query('UPDATE drivers SET current_lat=$1, current_lng=$2 WHERE user_id=$3',
            [lat, lng, socket.userId]).catch(() => {});
        }
      } catch (e) {
        console.error('driver:location error:', e.message);
      }
    });

    // Driver goes online/offline
    socket.on('driver:status', async ({ isOnline }) => {
      try {
        await pool.query(
          'UPDATE drivers SET is_online=$1 WHERE user_id=$2',
          [isOnline ? 1 : 0, socket.userId]
        );
      } catch {}
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user ${socket.userId}`);
    });
  });

  return io;
};
