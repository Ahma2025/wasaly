import api from './api';
import { clearCaches } from './cache';
import { teardownPush } from './pushNotifications';

// مفاتيح الجلسة فقط — إعدادات الجهاز (الطابعة، الطباعة التلقائية، حجم الورق) تبقى
const AUTH_KEYS = ['token', 'user', 'restaurant', 'restaurants'];

export function clearSession() {
  try { AUTH_KEYS.forEach(k => localStorage.removeItem(k)); } catch {}
  clearCaches();
}

// خروج فوري: نمسح الجلسة أولًا (الواجهة تنتقل لصفحة الدخول دون انتظار)، ثم نبلغ السيرفر بالخلفية
// بالتوكن القديم ليحذف رمز إشعارات هذا الجهاز
export async function logout() {
  let token = null;
  try { token = localStorage.getItem('token'); } catch {}
  clearSession();
  teardownPush().catch(() => {});
  if (token) {
    api.post('/auth/logout', null, { headers: { Authorization: 'Bearer ' + token }, timeout: 6000 }).catch(() => {});
  }
}
