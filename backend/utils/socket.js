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

  io.on('connection', (socket) => {
    console.log(`Socket connected: user ${socket.userId} (${socket.userRole})`);
    socket.join(`user:${socket.userId}`);

    // Driver sends live location with orderId
    socket.on('driver:location', async ({ lat, lng, orderId }) => {
      try {
        // Update driver's current location in DB
        await pool.query(
          'UPDATE drivers SET current_lat=$1, current_lng=$2 WHERE user_id=$3',
          [lat, lng, socket.userId]
        );

        if (orderId) {
          // Find the customer of this order and emit only to them
          const { rows } = await pool.query(
            'SELECT customer_id FROM orders WHERE id=$1', [orderId]
          );
          if (rows[0]) {
            io.to(`user:${rows[0].customer_id}`).emit('driver:location', { lat, lng, orderId });
          }
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
