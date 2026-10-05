import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import api from './api';

export const NOTIF_PREF_KEY = 'notif_pref'; // 'on' | 'off'
export const ANDROID_CHANNEL = 'wasaly_default';

// Handle notifications when app is FOREGROUND
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function getNotificationsEnabled() {
  try { return (await AsyncStorage.getItem(NOTIF_PREF_KEY)) !== 'off'; } catch { return true; }
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'وصلّي - إشعارات الطلبات',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B35',
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

export async function registerForPushNotifications({ force = false } = {}) {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;

  try {
    // احترام اختيار المستخدم من صفحة حسابي
    if (!force && !(await getNotificationsEnabled())) return null;

    await ensureChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // iOS  → raw APNs token ، Android → FCM token (السيرفر يرسل مباشرة)
    let token = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await Notifications.getDevicePushTokenAsync();
        token = result?.data;
        if (token) break;
      } catch (e) {
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!token) return null;

    try {
      await api.post('/users/fcm-token', { token });
    } catch {}

    return token;
  } catch {
    return null;
  }
}

// تفعيل/إيقاف الإشعارات فعلياً: إيقاف = إلغاء تسجيل الجهاز من الإشعارات البعيدة
export async function setNotificationsEnabled(enabled) {
  try { await AsyncStorage.setItem(NOTIF_PREF_KEY, enabled ? 'on' : 'off'); } catch {}
  if (enabled) {
    return !!(await registerForPushNotifications({ force: true }));
  }
  try { await Notifications.unregisterForNotificationsAsync(); } catch {}
  return true;
}

// تذكير محلي على قناة أندرويد الصحيحة
export async function scheduleLocal(content, seconds) {
  return Notifications.scheduleNotificationAsync({
    content: { sound: 'default', ...content },
    trigger: Platform.OS === 'android' ? { seconds, channelId: ANDROID_CHANNEL } : { seconds },
  });
}

// يستخرج بيانات الإشعار (قد تكون نص JSON)
export function notificationData(response) {
  let d = response?.notification?.request?.content?.data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
  return d || {};
}
