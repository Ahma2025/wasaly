import axios from 'axios';
import { getToken, logout } from './session';

export const API_URL = import.meta.env.VITE_API_URL || 'https://burger-app-production.up.railway.app/api';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let loggingOut = false;

api.interceptors.response.use(
  res => res.data,
  err => {
    const status = err.response?.status;
    const data = err.response?.data;
    const url = err.config?.url || '';
    // تسجيل الدخول والخروج لا يدخلان حلقة «انتهت الجلسة»
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/logout');
    // جلسة منتهية أو حساب محظور/غير مدير → رجوع لشاشة الدخول
    if ((status === 401 || status === 403) && !isAuthCall && getToken() && !loggingOut) {
      const msg = (data && data.message) || '';
      // 403 بسبب صلاحية على مورد معيّن (مثلاً تغيير حالة غير مسموح) لا تعني انتهاء الجلسة
      const permissionOnly = status === 403 && /غير مصرح لك بتغيير|not allowed|ليس لك|ليس مسنداً/i.test(msg);
      if (!permissionOnly) {
        loggingOut = true;
        logout(status === 401 ? 'expired' : 'forbidden');
        setTimeout(() => { loggingOut = false; }, 1500);
      }
    }
    const e = (data && typeof data === 'object') ? { ...data } : { message: err.code === 'ECONNABORTED' ? 'انتهت مهلة الاتصال' : status ? `تعذّر تنفيذ الطلب (${status})` : 'تعذّر الاتصال بالخادم' };
    e.status = status;
    // مسار غير موجود على الخادم (نسخة قديمة) — 404 بدون رسالة JSON
    e.missingRoute = status === 404 && !(data && typeof data === 'object' && data.message);
    throw e;
  }
);

/** خروج يدوي: يلغي التوكن عند الخادم (حدّ 4 ثوانٍ) ثم ينظّف الجلسة — A-14 */
export async function revokeAndLogout(reason = 'manual') {
  if (getToken()) {
    try { await api.post('/auth/logout', {}, { timeout: 4000 }); } catch { /* نكمل الخروج محلياً */ }
  }
  logout(reason);
}

/** رفع ملف بمهلة أطول للشبكات البطيئة — A-33 */
export const uploadFile = (file, name = 'file') => {
  const fd = new FormData();
  fd.append(name, file);
  return api.post('/upload', fd, { timeout: 90000 });
};

export default api;
