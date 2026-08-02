import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

// يعرض خيار الكاميرا أو المعرض، يطلب الإذن المناسب، ويرجّع asset الصورة أو null
export function pickImage(options = {}) {
  const opts = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, ...options };

  const denied = (what) => Alert.alert(
    'الإذن مرفوض',
    `نحتاج إذن ${what}. فعّله من إعدادات الهاتف.`,
    [{ text: 'إلغاء', style: 'cancel' }, { text: 'الإعدادات', onPress: () => Linking.openSettings() }]
  );

  return new Promise((resolve) => {
    Alert.alert('إضافة صورة', 'اختر مصدر الصورة', [
      {
        text: '📷 الكاميرا',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) { denied('الكاميرا'); return resolve(null); }
            const res = await ImagePicker.launchCameraAsync(opts);
            resolve(res.canceled ? null : (res.assets?.[0] || null));
          } catch { Alert.alert('خطأ', 'تعذّر فتح الكاميرا'); resolve(null); }
        },
      },
      {
        text: '🖼️ المعرض',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { denied('الصور'); return resolve(null); }
            const res = await ImagePicker.launchImageLibraryAsync(opts);
            resolve(res.canceled ? null : (res.assets?.[0] || null));
          } catch { Alert.alert('خطأ', 'تعذّر فتح المعرض'); resolve(null); }
        },
      },
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
