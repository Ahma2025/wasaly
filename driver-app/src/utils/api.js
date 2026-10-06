import axios from 'axios';
import { API_BASE, CLIENT_FEATURES, FEATURES_HEADER } from '../config';
import { getToken } from './storage';

const api = axios.create({ baseURL: API_BASE, timeout: 15000 });

// رسائل الشبكة بالعربي + رمز ثابت للمقارنة (بدل مقارنة النص)
export const NET_MESSAGES = {
  NETWORK: 'تعذّر الاتصال — تأكد من الإنترنت',
  TIMEOUT: 'انتهت مهلة الاتصال — حاول مرة أخرى',
};
export const isNetworkError = (e) => !!e && (e.code === 'NETWORK' || e.code === 'TIMEOUT');

// يُسجَّل من AuthContext — يُستدعى عند 401 (يتحقق أولاً قبل تسجيل الخروج)
let unauthorizedHandler = null;
let handling401 = false;
export function setUnauthorizedHandler(fn) { unauthorizedHandler = fn; }

// تجديد التوكن المنزلق: إن أرسل السيرفر توكناً جديداً في الهيدر نخزّنه (AuthContext)
let tokenRefreshHandler = null;
export function setTokenRefreshHandler(fn) { tokenRefreshHandler = fn; }

// ── فرق ساعة الجهاز عن ساعة السيرفر (من هيدر Date) ──
// يُستخدم لحساب مهلة العروض حتى لو كانت ساعة الموبايل مقدّمة/متأخرة
let clockOffset = null; // serverTime - deviceTime (ms)
let preciseOffset = false;
function addSample(sample, precise) {
  if (!Number.isFinite(sample)) return;
  if (precise && !preciseOffset) { preciseOffset = true; clockOffset = sample; return; }
  if (!precise && preciseOffset) return; // عيّنة server_now (بالميلي ثانية) أدق من هيدر Date (بالثانية)
  clockOffset = clockOffset == null ? sample : Math.round(clockOffset * 0.7 + sample * 0.3);
}
function noteServerDate(headers) {
  const raw = headers && (headers.date || headers.Date);
  if (!raw) return;
  const t = Date.parse(raw);
  if (Number.isFinite(t)) addSample(t + 500 - Date.now(), false); // دقة الهيدر ثانية واحدة → منتصفها
}
// server_now (ISO بالميلي ثانية) يرسله السيرفر الجديد في /drivers/me والعروض
export function noteServerNow(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isFinite(t)) addSample(t - Date.now(), true);
}
export const serverClockOffset = () => clockOffset;
// يحوّل وقتاً بتوقيت السيرفر إلى وقت الجهاز (null إن لم نعرف الفرق بعد)
export const serverToDevice = (serverMs) => (clockOffset == null || !Number.isFinite(serverMs) ? null : serverMs - clockOffset);

api.interceptors.request.use(async config => {
  const token = await getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config._token = token || null;
  // 🧺 إعلان دعم الطلب المجمّع (بدونه لا تُعرض علينا طلبات عدة مطاعم)
  config.headers[FEATURES_HEADER] = CLIENT_FEATURES;
  return config;
});

api.interceptors.response.use(
  res => {
    noteServerDate(res?.headers);
    const body = res?.data;
    if (body && typeof body === 'object') {
      if (body.server_now) noteServerNow(body.server_now);
      else if (body.data && typeof body.data === 'object' && body.data.server_now) noteServerNow(body.data.server_now);
    }
    // D-07: تجديد منزلق — توكن جديد في الرد (refreshed_token) أو في الهيدر
    const fresh = (body && typeof body === 'object' && typeof body.refreshed_token === 'string' && body.refreshed_token)
      || res?.headers?.['x-refreshed-token'];
    if (fresh && tokenRefreshHandler) { try { tokenRefreshHandler(fresh); } catch {} }
    return res.data;
  },
  err => {
    if (err?.response?.headers) noteServerDate(err.response.headers);
    const status = err?.response?.status;
    const url = String(err?.config?.url || '');
    const isAuthCall = url.includes('/auth/');
    if (status === 401 && !isAuthCall && unauthorizedHandler && !handling401) {
      handling401 = true;
      Promise.resolve(unauthorizedHandler({ token: err?.config?._token || null, url }))
        .catch(() => {}).finally(() => { handling401 = false; });
    }
    const data = err?.response?.data;
    const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''));
    const code = status ? undefined : (timedOut ? 'TIMEOUT' : 'NETWORK');
    const message = (data && data.message) || (code ? NET_MESSAGES[code] : 'حدث خطأ، حاول مرة أخرى');
    // eslint-disable-next-line no-throw-literal
    throw { ...(data && typeof data === 'object' ? data : {}), message, status, ...(code ? { code } : {}) };
  }
);

export default api;
