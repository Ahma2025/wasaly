import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import api from './api';

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
        name: 'وصالي - إشعارات الطلبات',
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

    let fcmToken = null;
    try {
      const result = await Notifications.getDevicePushTokenAsync();
      fcmToken = result?.data;
    } catch { return null; }

    if (!fcmToken) return null;

    try {
      await api.post('/users/fcm-token', { token: fcmToken });
    } catch {}

    return fcmToken;
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
