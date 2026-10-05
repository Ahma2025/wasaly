// إعدادات عامة للبوابة
export const SERVER_URL = 'https://burger-app-production.up.railway.app';
export const API_BASE = SERVER_URL + '/api';

// مسار التطبيق: "/" داخل Capacitor أو الاستضافة العادية، و"/portal/" عند خدمته من السيرفر
export const APP_BASE = (typeof window !== 'undefined' && window.location.pathname.startsWith('/portal'))
  ? '/portal/'
  : '/';
export const ROUTER_BASENAME = APP_BASE === '/' ? '/' : APP_BASE.replace(/\/$/, '');

export const LOGO_URL = APP_BASE + 'logo.png';

export const SUPPORT_PHONE = '0599039704';
