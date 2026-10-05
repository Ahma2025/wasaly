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
    const isAuthCall = url.includes('/auth/login');
    // جلسة منتهية أو حساب محظور/غير مدير → رجوع لشاشة الدخول
    if ((status === 401 || status === 403) && !isAuthCall && getToken() && !loggingOut) {
      const msg = (data && data.message) || '';
      // 403 بسبب صلاحية على مورد معيّن (مثلاً تغيير حالة غير مسموح) لا تعني انتهاء الجلسة
      const permissionOnly = status === 403 && /غير مصرح لك بتغيير|not allowed/i.test(msg);
      if (!permissionOnly) {
        loggingOut = true;
        logout(status === 401 ? 'expired' : 'forbidden');
        setTimeout(() => { loggingOut = false; }, 1500);
      }
    }
    const e = (data && typeof data === 'object') ? { ...data } : { message: err.code === 'ECONNABORTED' ? 'انتهت مهلة الاتصال' : 'تعذّر الاتصال بالخادم' };
    e.status = status;
    throw e;
  }
);

export default api;
