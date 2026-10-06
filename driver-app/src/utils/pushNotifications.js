import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import api from './api';

export const CHANNEL_ID = 'wasaly_default';

// معالج العرض أثناء فتح التطبيق:
// - رنّة عرض الطلب المحلية: صوت فقط بدون بانر (النافذة الكاملة ظاهرة أصلاً)
// - إشعار طلب جديد والتطبيق مفتوح: صوت بدون بانر (النافذة تظهر من السوكِت/المستمع)
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const data = n?.request?.content?.data || {};
    if (data._offerChime) return { shouldShowAlert: false, shouldPlaySound: true, shouldSetBadge: false };
    if (data.type === 'new_order_request' && AppState.currentState === 'active') {
      return { shouldShowAlert: false, shouldPlaySound: true, shouldSetBadge: false };
    }
    return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
  },
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'وصلّي - إشعارات السائق',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 250, 400],
      lightColor: '#FF6B00',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {}
}

let lastRegisteredToken = null;
let registering = null;

export async function registerForPushNotifications({ force = false } = {}) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (registering) return registering;
  registering = (async () => {
    try {
      await ensureChannel();
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return null;

      let token = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await Notifications.getDevicePushTokenAsync();
          token = result?.data;
          if (token) break;
        } catch {
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
      }
      if (!token) return null;
      // لا نعيد الإرسال إن لم يتغيّر التوكن (كان يُرسل مع كل عودة للتطبيق)
      if (!force && token === lastRegisteredToken) return token;
      await api.post('/users/fcm-token', { token });
      lastRegisteredToken = token;
      return token;
    } catch {
      return null;
    } finally {
      registering = null;
    }
  })();
  return registering;
}

export function resetPushRegistration() { lastRegisteredToken = null; }

// توكن الإشعارات الحالي بلا طلب إذن (لإيقاف استقبال الطلبات حين يكون توكن الدخول منتهياً)
export async function currentDevicePushToken() {
  if (lastRegisteredToken) return lastRegisteredToken;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const r = await Promise.race([Notifications.getDevicePushTokenAsync(), new Promise(res => setTimeout(() => res(null), 3000))]);
    return r?.data || null;
  } catch { return null; }
}

// رنّة تنبيه لعرض الطلب (بدون expo-av): إشعار محلي صوت-فقط عبر المعالج أعلاه
export async function playOfferChime() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'طلب جديد', body: '', data: { _offerChime: true }, sound: 'default' },
      trigger: null,
    });
  } catch {}
}
