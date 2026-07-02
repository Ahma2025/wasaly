import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
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

  Alert.alert('🔔 PUSH', 'Step 1: بدأ تسجيل الإشعارات...');

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

    Alert.alert('🔔 PUSH', 'Step 2: Permission = ' + finalStatus);

    if (finalStatus !== 'granted') return null;

    let fcmToken = null;
    try {
      const result = await Notifications.getDevicePushTokenAsync();
      fcmToken = result?.data;
      Alert.alert('🔔 PUSH', 'Step 3: FCM Token = ' + (fcmToken ? fcmToken.slice(0, 40) + '...' : 'NULL!'));
    } catch (e) {
      Alert.alert('❌ PUSH ERROR', 'getDevicePushTokenAsync فشل:\n' + e.message);
      return null;
    }

    if (!fcmToken) {
      Alert.alert('❌ PUSH', 'Token = NULL - فشل الحصول على token');
      return null;
    }

    try {
      await api.post('/users/fcm-token', { token: fcmToken });
      Alert.alert('✅ PUSH SUCCESS', 'Token حُفظ في السيرفر بنجاح!');
    } catch (e) {
      Alert.alert('❌ PUSH SAVE FAILED', 'فشل الحفظ:\n' + (e.message || JSON.stringify(e)));
    }

    return fcmToken;
  } catch (e) {
    Alert.alert('❌ PUSH CRASH', 'خطأ عام:\n' + e.message);
    return null;
  }
}

export async function showLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: 'default' },
    trigger: null,
  });
}
