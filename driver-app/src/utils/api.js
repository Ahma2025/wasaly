import axios from 'axios';
import { API_BASE, CLIENT_FEATURES, FEATURES_HEADER } from '../config';
import { getToken } from './storage';

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

// يُسجَّل من AuthContext — يُستدعى عند 401 لتسجيل الخروج
let unauthorizedHandler = null;
let handling401 = false;
export function setUnauthorizedHandler(fn) { unauthorizedHandler = fn; }

api.interceptors.request.use(async config => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // 🧺 إعلان دعم الطلب المجمّع (بدونه لا تُعرض علينا طلبات عدة مطاعم)
  config.headers[FEATURES_HEADER] = CLIENT_FEATURES;
  return config;
});

api.interceptors.response.use(
  res => res.data,
  err => {
    const status = err?.response?.status;
    const url = String(err?.config?.url || '');
    const isAuthCall = url.includes('/auth/');
    if (status === 401 && !isAuthCall && unauthorizedHandler && !handling401) {
      handling401 = true;
      Promise.resolve(unauthorizedHandler()).catch(() => {}).finally(() => { handling401 = false; });
    }
    const data = err?.response?.data;
    const message = (data && data.message) || (err?.code === 'ECONNABORTED' ? 'انتهت مهلة الاتصال' : (status ? 'حدث خطأ، حاول مرة أخرى' : 'تعذّر الاتصال بالإنترنت'));
    // eslint-disable-next-line no-throw-literal
    throw { ...(data && typeof data === 'object' ? data : {}), message, status };
  }
);

export default api;
