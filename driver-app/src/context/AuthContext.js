import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications, resetPushRegistration, currentDevicePushToken } from '../utils/pushNotifications';
import { disconnectSocket } from '../utils/socket';
import api, { setUnauthorizedHandler, setTokenRefreshHandler } from '../utils/api';
import { getToken, setToken as storeToken, clearAllUserData, decodeJWT, isTokenExpired, USER_KEY, ONLINE_KEY } from '../utils/storage';
import { stopBackgroundTracking } from '../tasks/locationTask';

const AuthContext = createContext({});

// تجديد منزلق: نطلب توكناً جديداً حين يتبقى أقل من ٧ أيام على انتهاء الحالي
const REFRESH_WITHIN_MS = 7 * 24 * 3600 * 1000;
const CONFIRM_401_DELAY_MS = 1500;

// DriverContext يسجّل هنا دالة تخبرنا إن كان لدى السائق توصيل جارٍ (لا نخرجه بصمت وهو بنص التوصيلة)
let activeJobProbe = null;
export function setActiveJobProbe(fn) { activeJobProbe = fn; }

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// إيقاف استقبال الطلبات بلا توكن صالح (توكن منتهٍ/مرفوض) عبر توكن الإشعارات — السيرفر القديم يتجاهله (404)
async function deviceLogout() {
  try {
    const fcm = await currentDevicePushToken();
    if (fcm) await Promise.race([api.post('/auth/device-logout', { fcm_token: fcm }), wait(4000)]);
  } catch { /* اختياري */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const loggingOut = useRef(false);
  const refreshUnsupported = useRef(false);
  const refreshing = useRef(false);

  // ── تجديد التوكن (D-07) ──
  const adoptToken = useCallback(async (t) => {
    if (!t || typeof t !== 'string' || loggingOut.current) return;
    const cur = await getToken();
    if (!cur || cur === t) return;
    const p = decodeJWT(t);
    if (!p || isTokenExpired(t)) return;
    await storeToken(t);
    setToken(t);
  }, []);

  const maybeRefreshToken = useCallback(async () => {
    if (refreshUnsupported.current || refreshing.current) return;
    const t = await getToken();
    if (!t) return;
    const p = decodeJWT(t);
    if (!p?.exp) return;
    if (p.exp * 1000 - Date.now() > REFRESH_WITHIN_MS) return;
    refreshing.current = true;
    try {
      const r = await api.post('/auth/refresh');
      const fresh = r?.token || r?.data?.token;
      if (fresh) await adoptToken(fresh);
    } catch (e) {
      if (e?.status === 404 || e?.status === 405) refreshUnsupported.current = true; // السيرفر الحالي بلا مسار تجديد
    } finally { refreshing.current = false; }
  }, [adoptToken]);

  useEffect(() => {
    setTokenRefreshHandler((t) => { adoptToken(t); });
    return () => setTokenRefreshHandler(null);
  }, [adoptToken]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await getToken();
        let u = null;
        try { u = await AsyncStorage.getItem(USER_KEY); } catch {}
        if (t && !isTokenExpired(t)) {
          let parsed = null;
          if (u) { try { parsed = JSON.parse(u); } catch {} }
          if (!parsed) parsed = decodeJWT(t);
          if (alive && parsed) {
            setToken(t);
            setUser(parsed);
            registerForPushNotifications().catch(() => {});
            maybeRefreshToken();
          }
        } else if (t) {
          // توكن منتهٍ → نوقف استقبال الطلبات عند السيرفر (بلا توكن) ثم تنظيف كامل
          deviceLogout();
          await clearAllUserData();
        }
      } catch { /* قراءة التخزين فشلت — نكمل كمستخدم غير مسجّل */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // إعادة تسجيل توكن الإشعارات + فحص التجديد عند العودة للتطبيق
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        getToken().then(t => {
          if (!t) return;
          registerForPushNotifications().catch(() => {});
          maybeRefreshToken();
        });
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [maybeRefreshToken]);

  const login = useCallback(async (t, u) => {
    await storeToken(t);
    try { await AsyncStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {}
    setToken(t);
    setUser(u);
    registerForPushNotifications({ force: true }).catch(() => {});
  }, []);

  const updateUser = useCallback(async (patch) => {
    setUser(prev => {
      const next = { ...(prev || {}), ...patch };
      AsyncStorage.setItem(USER_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // remote=false عند 401 مؤكَّد (التوكن مرفوض أصلاً — لا داعي لطلبات مصادَقة)
  // يرجع { blocked: رسالة } إن رفض السيرفر الخروج (D-08: توصيلة مُسندة ما زالت جارية)
  const logout = useCallback(async ({ remote = true } = {}) => {
    if (loggingOut.current) return null;
    loggingOut.current = true;
    let blocked = null;
    try {
      if (remote) {
        const withTimeout = (p) => Promise.race([p, wait(5000)]);
        const isBlock = (e) => e?.status === 409 && (e?.code === 'ACTIVE_DELIVERY' || !e?.code);
        await withTimeout(api.patch('/drivers/status', { is_online: false }).catch((e) => { if (isBlock(e)) blocked = e.message; }));
        if (!blocked) await withTimeout(api.post('/auth/logout').catch((e) => { if (isBlock(e)) blocked = e.message; }));
        if (blocked) return { blocked: blocked || 'لا يمكنك تسجيل الخروج وعندك طلب قيد التوصيل — سلّمه أولاً' };
      } else {
        await deviceLogout();
      }
      await stopBackgroundTracking();
      disconnectSocket();
      resetPushRegistration();
      await clearAllUserData();
      try { await AsyncStorage.removeItem(ONLINE_KEY); } catch {}
    } finally {
      if (!blocked) {
        setToken(null);
        setUser(null);
      }
      loggingOut.current = false;
    }
    return null;
  }, []);

  // X-01: أي 401 لا يعني بالضرورة أن الجلسة انتهت (قد يكون عطلاً لحظياً بالسيرفر)
  // → نتأكد بطلب /auth/me واحد بعد ١.٥ ثانية؛ لا نخرج إلا إن رُفض التوكن فعلاً
  useEffect(() => {
    setUnauthorizedHandler(async ({ token: failedToken } = {}) => {
      if (loggingOut.current) return;
      const cur = await getToken();
      if (!cur) return;
      if (failedToken && failedToken !== cur) return; // التوكن تجدّد بعد إرسال الطلب
      await wait(CONFIRM_401_DELAY_MS);
      try {
        await api.get('/auth/me');
        return; // الجلسة سليمة — كان عطلاً عابراً
      } catch (e) {
        if (e?.status !== 401) return; // شبكة/5xx → لا نخرج
      }
      if ((await getToken()) !== cur) return;
      const busy = !!(activeJobProbe && activeJobProbe());
      if (busy) {
        await new Promise((resolve) => {
          Alert.alert(
            'انتهت جلستك',
            'تم تسجيل خروجك من الحساب. لديك توصيل جارٍ ما زال مسجّلاً عليك — سجّل الدخول مجدداً فوراً لإكماله، أو تواصل مع الإدارة.',
            [{ text: 'تسجيل الدخول', onPress: resolve }],
            { cancelable: false },
          );
        });
      }
      await logout({ remote: false });
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(() => ({ user, token, loading, login, logout, updateUser }), [user, token, loading, login, logout, updateUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
