import { Platform } from 'react-native';

// إعدادات مركزية — مكان واحد بدل تكرار الروابط في كل شاشة
export const SERVER_URL = 'https://burger-app-production.up.railway.app';
export const API_URL = `${SERVER_URL}/api`;
export const SOCKET_URL = SERVER_URL;

export const SUPPORT_PHONE = '0599039704';

export const ANDROID_PACKAGE = 'com.wasaly.customer';
// رقم التطبيق على App Store (يُضاف بعد النشر على iOS). لو فاضي نفتح البحث بالمتجر.
export const IOS_APP_STORE_ID = '';

export const storeUrl = () => {
  if (Platform.OS === 'ios') {
    return IOS_APP_STORE_ID
      ? `itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`
      : 'https://apps.apple.com/search?term=%D9%88%D8%B5%D9%84%D9%91%D9%8A';
  }
  return `market://details?id=${ANDROID_PACKAGE}`;
};
export const storeWebUrl = () => (Platform.OS === 'ios'
  ? storeUrl()
  : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);

// روابط تحميل قابلة للمشاركة (https — تفتح على أي جهاز)
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const APP_STORE_URL = IOS_APP_STORE_ID ? `https://apps.apple.com/app/id${IOS_APP_STORE_ID}` : '';
export const shareDownloadText = () => [
  `أندرويد: ${PLAY_URL}`,
  APP_STORE_URL ? `آيفون: ${APP_STORE_URL}` : 'آيفون: ابحث عن «وصلّي» بالـ App Store',
].join('\n');

// ارتفاع شريط "تم" فوق كيبورد iOS (KeyboardToolbar بـ App.js)
export const KB_TOOLBAR_H = 44;

// ثوابت تطابق السيرفر — تُستخدم فقط كحساب احتياطي لو /orders/quote أو /orders/multi/config غير متوفر
export const FREE_DELIVERY_THRESHOLD = 50;
export const POINT_VALUE = 0.05; // 100 نقطة = 5₪
export const DEFAULT_DELIVERY_FEE = 5;
