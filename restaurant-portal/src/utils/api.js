import axios from 'axios';
import { API_BASE } from './config';

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// مستمع يُستدعى عند انتهاء الجلسة (401) — يضبطه App ليوجّه لصفحة الدخول
let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

api.interceptors.response.use(
  res => res.data,
  err => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/logout');
    if (status === 401 && !isAuthCall && localStorage.getItem('token')) {
      try { onUnauthorized && onUnauthorized(); } catch {}
    }
    const body = err.response?.data;
    const message = (body && (body.message || body.error))
      || (err.code === 'ECONNABORTED' ? 'انتهت مهلة الاتصال بالخادم' : null)
      || (err.response ? 'حدث خطأ، حاول مرة أخرى' : 'تعذّر الاتصال بالخادم — تحقق من الإنترنت');
    const e = { ...(typeof body === 'object' && body ? body : {}), message, status };
    throw e;
  }
);

export default api;
