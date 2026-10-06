import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

export const NETWORK_MESSAGE = 'تعذّر الاتصال — تأكد من الإنترنت';
const GENERIC_MESSAGE = 'حدث خطأ، حاول مرة أخرى';

/** خطأ شبكة/مهلة (بدون رد من السيرفر) */
export const isNetworkError = (e) => !!e && (e.code === 'NETWORK' || e.code === 'TIMEOUT');

// معالج 401 — يسجّله AuthContext. ما بنمسح الجلسة هون مباشرة:
// AuthContext يتأكد أولاً بطلب /auth/me (عطل لحظي بالسيرفر ما لازم يطلّع الزبون من حسابه)
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

api.interceptors.request.use(async (config) => {
  // ترويسة صريحة (مثلاً تسجيل خروج بالتوكن القديم بعد مسحه) تُحترم كما هي
  if (!config.headers?.Authorization) {
    const token = await SecureStore.getItemAsync('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  res => res.data,
  async err => {
    // طلب أُلغي عمداً (بحث قديم مثلاً) — نميّزه حتى لا يظهر كخطأ
    if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED') {
      throw { canceled: true, message: 'canceled' };
    }
    const status = err.response?.status;
    const sentAuth = err.config?.headers?.Authorization;
    if (status === 401 && sentAuth && !err.config?._skipAuthHandler) {
      try { unauthorizedHandler && unauthorizedHandler(String(sentAuth).replace(/^Bearer\s+/i, '')); } catch {}
    }
    const data = err.response?.data;
    let out;
    if (!err.response) {
      // بدون رد: انقطاع إنترنت أو مهلة
      const timeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || /timeout/i.test(String(err.message || ''));
      out = { message: NETWORK_MESSAGE, code: timeout ? 'TIMEOUT' : 'NETWORK' };
    } else if (data && typeof data === 'object') {
      out = { ...data };
    } else {
      out = { message: typeof data === 'string' && data.length < 200 && !/<\w+/.test(data) ? data : GENERIC_MESSAGE };
    }
    out.status = status;
    if (!out.message) out.message = GENERIC_MESSAGE;
    // رسائل السيرفر التقنية بالإنجليزي (No token / Invalid token...) → نص عربي مفهوم
    if (typeof out.message === 'string' && /^[\x00-\x7F]*$/.test(out.message)) {
      out.message = status === 401 ? 'انتهت الجلسة، سجّل الدخول من جديد'
        : status >= 500 ? 'الخادم مشغول لحظياً، حاول بعد شوي'
          : out.code ? out.message : GENERIC_MESSAGE;
    }
    throw out;
  }
);

export default api;
