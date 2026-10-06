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

// اختيار المستخدم من صفحة حسابي (بدون النظر لإذن الجهاز)
export async function getNotificationsPref() {
  try { return (await AsyncStorage.getItem(NOTIF_PREF_KEY)) !== 'off'; } catch { return true; }
}
// للتوافق مع الاستدعاءات القديمة
export const getNotificationsEnabled = getNotificationsPref;

/**
  الحالة الفعلية: { enabled, pref, granted, canAskAgain }
  enabled = المستخدم ما طفّاها + إذن الجهاز ممنوح (المفتاح ما بيكذب لو الإذن مرفوض من الإعدادات)
*/
export async function getNotificationsStatus() {
  const pref = await getNotificationsPref();
  let granted = false, canAskAgain = true;
  try {
    const p = await Notifications.getPermissionsAsync();
    granted = p?.status === 'granted' || p?.granted === true || p?.ios?.status === Notifications.IosAuthorizationStatus?.PROVISIONAL;
    canAskAgain = p?.canAskAgain !== false;
  } catch {}
  return { enabled: pref && granted, pref, granted, canAskAgain };
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
    if (!force && !(await getNotificationsPref())) return null;

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

// تفعيل/إيقاف الإشعارات فعلياً: إيقاف = إلغاء تسجيل الجهاز + إلغاء أي تذكير محلي مجدول (تذكير السلة)
export async function setNotificationsEnabled(enabled) {
  try { await AsyncStorage.setItem(NOTIF_PREF_KEY, enabled ? 'on' : 'off'); } catch {}
  if (enabled) {
    return !!(await registerForPushNotifications({ force: true }));
  }
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
  try { await Notifications.unregisterForNotificationsAsync(); } catch {}
  return true;
}

// تذكير محلي على قناة أندرويد الصحيحة — لا شيء لو المستخدم طفّى الإشعارات أو الإذن مرفوض
export async function scheduleLocal(content, seconds) {
  const st = await getNotificationsStatus();
  if (!st.enabled) return null;
  return Notifications.scheduleNotificationAsync({
    content: { sound: 'default', ...content },
    trigger: Platform.OS === 'android' ? { seconds, channelId: ANDROID_CHANNEL } : { seconds },
  });
}

/** تصفير الرقم الأحمر على أيقونة التطبيق (iOS) */
export function clearBadge() {
  try { Notifications.setBadgeCountAsync(0).catch(() => {}); } catch {}
}

const parse = (d) => {
  if (typeof d === 'string') { try { return JSON.parse(d) || {}; } catch { return {}; } }
  return d && typeof d === 'object' ? d : {};
};

// يستخرج بيانات الإشعار (قد تكون نص JSON). iOS (APNs خام): البيانات أحياناً داخل trigger.payload بدل content.data
export function notificationData(response) {
  const req = response?.notification?.request;
  let d = parse(req?.content?.data);
  if (!Object.keys(d).length) {
    const payload = parse(req?.trigger?.payload);
    const { aps, ...rest } = payload;
    // السيرفر ممكن يبعتها مسطّحة أو داخل data/body
    const fromData = parse(rest.data);
    const fromBody = parse(rest.body);
    d = Object.keys(fromData).length ? fromData : Object.keys(fromBody).length ? fromBody : rest;
  }
  // بعض المسارات تلف البيانات بطبقة data إضافية
  if (d && d.data && typeof d.data === 'object' && !d.order_id && !d.group_id && !d.type) d = { ...d.data, ...d };
  return d || {};
}
