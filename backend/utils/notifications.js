const pool = require('../config/database');

const saveNotification = async (userId, titleAr, titleEn, bodyAr, bodyEn, type, data = {}) => {
  await pool.query(
    `INSERT INTO notifications (user_id, title_ar, title_en, body_ar, body_en, type, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, titleAr, titleEn, bodyAr, bodyEn, type, JSON.stringify(data)]
  );
};

const sendPush = async (fcmToken, title, body, data = {}) => {
  // Firebase Admin push notification
  try {
    const admin = require('../config/firebase');
    if (!fcmToken || !admin) return;
    await admin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data },
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } }
    });
  } catch (e) {
    console.error('Push notification failed:', e.message);
  }
};

const notifyUser = async (io, userId, event, data) => {
  if (io) io.to(`user:${userId}`).emit(event, data);
};

module.exports = { saveNotification, sendPush, notifyUser };
