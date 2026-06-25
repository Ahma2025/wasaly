const jwt = require('jsonwebtoken');

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
    console.log(`Socket connected: ${socket.userId}`);
    socket.join(`user:${socket.userId}`);

    // Driver location update
    socket.on('driver:location', ({ lat, lng }) => {
      socket.broadcast.emit(`driver:location:${socket.userId}`, { lat, lng });
    });

    // Driver goes online/offline
    socket.on('driver:status', ({ isOnline }) => {
      socket.isOnline = isOnline;
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.userId}`);
    });
  });

  return io;
};
