import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

const api = axios.create({ baseURL: API_URL, timeout: 15000 });

// معالج انتهاء الجلسة (401) — يسجّله AuthContext حتى يتم تسجيل الخروج بشكل صحيح
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
    const sentToken = !!err.config?.headers?.Authorization;
    if (status === 401 && sentToken) {
      try { await SecureStore.deleteItemAsync('token'); } catch {}
      try { unauthorizedHandler && unauthorizedHandler(); } catch {}
    }
    const data = err.response?.data;
    const out = (data && typeof data === 'object')
      ? { ...data }
      : { message: err.response ? (typeof data === 'string' && data.length < 200 ? data : 'حدث خطأ، حاول مرة أخرى') : 'Network error' };
    out.status = status;
    if (!out.message) out.message = 'حدث خطأ، حاول مرة أخرى';
    throw out;
  }
);

export default api;
