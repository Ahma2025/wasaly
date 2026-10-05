import api from './api';
import { Capacitor } from '@capacitor/core';
import { APP_BASE, LOGO_URL } from './config';

// القناة التي يرسل عليها السيرفر (channel_id: 'wasaly_default')
export const CHANNEL_ID = 'wasaly_default';

let nativeListeners = [];

// ─── إشعارات أندرويد/iOS الأصلية (FCM / APNs) ─────────────────────────────
async function setupNativePush({ onReceive, onAction } = {}) {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // قناة عالية الأهمية (importance 5) حتى يظهر الإشعار منبثقًا مع صوت
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: CHANNEL_ID,
          name: 'طلبات جديدة',
          description: 'تنبيهات الطلبات الجديدة وتحديثاتها',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#FF6B00',
        });
      } catch (e) { console.warn('[push] createChannel failed', e); }
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[push] permission not granted');
      return;
    }

    await teardownNativeListeners();
    nativeListeners.push(await PushNotifications.addListener('registration', async (token) => {
      try { await api.post('/users/fcm-token', { token: token.value }); }
      catch (e) { console.warn('[push] token save failed', e?.message); }
    }));
    nativeListeners.push(await PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err);
    }));
    // إشعار وصل والتطبيق مفتوح → نحدّث الطلبات ونعرض تنبيهًا داخليًا
    nativeListeners.push(await PushNotifications.addListener('pushNotificationReceived', (n) => {
      try { onReceive && onReceive(n); } catch {}
    }));
    // ضغط المستخدم على الإشعار → صفحة الطلبات
    nativeListeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      try { onAction && onAction(a); } catch {}
    }));

    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] native setup error', e?.message || e);
  }
}

async function teardownNativeListeners() {
  const list = nativeListeners;
  nativeListeners = [];
  for (const l of list) { try { await l.remove(); } catch {} }
}

// ─── إشعارات الويب (متصفح الكمبيوتر) ─────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
}

async function setupWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register(APP_BASE + 'sw.js', { scope: APP_BASE });
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const vapidData = await api.get('/webpush/vapid-public-key');
    if (!vapidData?.publicKey) return;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey)
    });

    const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');
    if (restaurant.id) {
      await api.post('/webpush/subscribe', { subscription: subscription.toJSON(), restaurant_id: restaurant.id });
    }
  } catch (e) {
    console.warn('[push] web push error', e?.message || e);
  }
}

// ─── نقطة الدخول ──────────────────────────────────────────────────────────
export async function setupPush(handlers = {}) {
  if (Capacitor.isNativePlatform()) await setupNativePush(handlers);
  else await setupWebPush();
}

export async function teardownPush() {
  if (Capacitor.isNativePlatform()) {
    await teardownNativeListeners();
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllDeliveredNotifications();
    } catch {}
  }
}

// إشعار نظام من داخل الصفحة (متصفح الكمبيوتر فقط — في التطبيق يصل إشعار FCM من السيرفر)
export function showBrowserNotification(title, body, data = {}, onClick) {
  if (Capacitor.isNativePlatform()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body, icon: LOGO_URL, badge: LOGO_URL,
      tag: `order-${data.order_id || Date.now()}`,
      requireInteraction: true, dir: 'rtl', lang: 'ar',
    });
    n.onclick = () => { window.focus(); n.close(); onClick && onClick(); };
  } catch (e) {
    console.warn('showBrowserNotification error', e);
  }
}
