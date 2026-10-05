import api from './api';
import { clearCaches } from './cache';
import { teardownPush } from './pushNotifications';

// مفاتيح الجلسة فقط — إعدادات الجهاز (الطابعة، الطباعة التلقائية، حجم الورق) تبقى
const AUTH_KEYS = ['token', 'user', 'restaurant', 'restaurants'];

export function clearSession() {
  try { AUTH_KEYS.forEach(k => localStorage.removeItem(k)); } catch {}
  clearCaches();
}

// خروج كامل: إبلاغ السيرفر (يحذف رمز الإشعارات للجهاز) ثم مسح الجلسة
export async function logout() {
  try {
    if (localStorage.getItem('token')) {
      await Promise.race([
        api.post('/auth/logout'),
        new Promise(res => setTimeout(res, 4000)),
      ]);
    }
  } catch { /* نكمل الخروج حتى لو فشل الطلب */ }
  try { await teardownPush(); } catch {}
  clearSession();
}
