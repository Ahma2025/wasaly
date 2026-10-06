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

// 401 قد يكون عطلًا لحظيًا في السيرفر (مثل مهلة قاعدة البيانات) — نتأكد بطلب /auth/me واحد بعد ~1.5 ثانية
// قبل إخراج المطعم من حسابه (وإيقاف تنبيهات الطلبات والطباعة)
let verifying = null;
function confirmUnauthorized() {
  if (verifying) return verifying;
  const token = localStorage.getItem('token');
  verifying = new Promise(res => setTimeout(res, 1500))
    .then(() => axios.get(API_BASE + '/auth/me', { headers: { Authorization: 'Bearer ' + token }, timeout: 10000 }))
    .then(() => false, (e) => e?.response?.status === 401)
    .then((expired) => {
      // التوكن تغيّر أثناء التحقق (دخول من جديد) → لا نخرج
      if (expired && localStorage.getItem('token') === token) { try { onUnauthorized && onUnauthorized(); } catch {} }
    })
    .finally(() => { verifying = null; });
  return verifying;
}

api.interceptors.response.use(
  res => res.data,
  err => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/logout');
    if (status === 401 && !isAuthCall && localStorage.getItem('token')) {
      confirmUnauthorized();
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
