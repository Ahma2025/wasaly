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
        name: 'وصالي - إشعارات السائق',
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

    // Try up to 3 times to get FCM token (MIUI can fail on first attempt)
    let fcmToken = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await Notifications.getDevicePushTokenAsync();
        fcmToken = result?.data;
        if (fcmToken) break;
      } catch (e) {
        console.log(`[PUSH DRIVER] attempt ${attempt} failed:`, e.message);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!fcmToken) {
      console.log('[PUSH DRIVER] Could not get FCM token after 3 attempts');
      return null;
    }

    await api.post('/users/fcm-token', { token: fcmToken });
    console.log('[PUSH DRIVER] Token saved OK');
    return fcmToken;
  } catch (e) {
    console.log('[PUSH DRIVER] Error:', e.message);
    return null;
  }
}

export async function showLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: null,
  });
}
