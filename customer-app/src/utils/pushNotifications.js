import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from './api';

// Handle notifications when app is FOREGROUND
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('wasaly_default', {
        name: 'وصلّي - إشعارات الطلبات',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // iOS  → getDevicePushTokenAsync returns raw APNs token (64-char hex)
    //         backend detects this and sends via APNs directly
    // Android → returns FCM token, backend sends via FCM v1
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

export async function showLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: null,
  });
}

// Setup notification tap handler — call once in App root
export function setupNotificationListeners(navigationRef) {
  const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    if (data?.order_id && navigationRef?.current) {
      navigationRef.current.navigate('Orders');
    }
  });
  return () => responseSub.remove();
}
