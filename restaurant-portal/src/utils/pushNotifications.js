import api from './api';
import { Capacitor } from '@capacitor/core';

// ─── Firebase Web SDK push (works in Capacitor WebView too) ──────────────
async function setupFirebaseWebPush() {
  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

    const firebaseConfig = {
      apiKey: "AIzaSyAXX_V5q5zxFKu_WDbTAJ8I1WQCZ5OqEkY",
      projectId: "wasaly-delivery-app",
      messagingSenderId: "573612310538",
      appId: "1:573612310538:android:6642b6d4053bd85e5f9ff3"
    };

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    // Register service worker for background messages
    let swReg = null;
    if ('serviceWorker' in navigator) {
      try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      } catch (e) {
        console.warn('[PUSH] SW register failed:', e.message);
      }
    }

    const VAPID_KEY = 'BCQrhUZ-lWBkuu8mHowPLLIeV7gQUCBOTCOHZN2QtrW-QWflj2DPVnHg5BiXSYsDwWpFzkvfT2TJBchFeMunJTI';

    // Request notification permission
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      console.warn('[PUSH] Permission denied');
      return;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg || undefined
    });

    if (token) {
      console.log('[PUSH] Firebase Web token received');
      await api.post('/users/fcm-token', { token });
      console.log('[PUSH] Token saved OK');
    }

    // Handle foreground messages
    onMessage(messaging, (payload) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(payload.notification?.title || 'وصالي', {
          body: payload.notification?.body || '',
          icon: '/logo.png',
          requireInteraction: true,
          dir: 'rtl'
        });
      }
    });

  } catch (e) {
    console.error('[PUSH] Firebase Web SDK error:', e.message);
    // Fallback: try native Capacitor push
    await setupNativePush().catch(() => {});
  }
}

// ─── Native Capacitor push (fallback) ─────────────────────────────────────
async function setupNativePush() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  PushNotifications.addListener('registration', async (token) => {
    try {
      await api.post('/users/fcm-token', { token: token.value });
      console.log('[PUSH] Native token saved');
    } catch (e) {
      console.error('[PUSH] Native save failed:', e.message);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('[PUSH] Native error:', JSON.stringify(err));
  });

  await PushNotifications.register();
}

// ─── Browser Web Push (desktop) ───────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(c => c.charCodeAt(0)));
}

async function setupWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const vapidData = await api.get('/webpush/vapid-public-key');
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidData.publicKey)
    });

    const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');
    if (restaurant.id) {
      await api.post('/webpush/subscribe', {
        subscription: subscription.toJSON(),
        restaurant_id: restaurant.id
      });
      console.log('[PUSH] Web push subscription saved');
    }
  } catch (e) {
    console.error('[PUSH] Web push error:', e.message);
  }
}

// ─── Main entry ────────────────────────────────────────────────────────────
export async function setupBrowserNotifications() {
  if (Capacitor.isNativePlatform()) {
    // On iOS/Android Capacitor: use native APNs/FCM directly
    // This gives raw APNs token on iOS which our backend handles directly
    await setupNativePush();
  } else {
    await setupWebPush();
  }
}

export function showBrowserNotification(title, body, data = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, {
      body, icon: '/logo.png', badge: '/logo.png',
      tag: `order-${data.order_id || Date.now()}`,
      requireInteraction: true, dir: 'rtl',
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {
    console.error('showBrowserNotification error:', e);
  }
}
