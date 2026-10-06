import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import api, { setUnauthorizedHandler } from '../utils/api';
import { clearAllCache } from '../utils/cache';
import { emitLogout } from '../utils/session';
import { registerForPushNotifications } from '../utils/pushNotifications';

const AuthContext = createContext({});
const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const appState = useRef(AppState.currentState);
  const loggingOut = useRef(false);
  const confirming = useRef(null);

  // تنظيف كامل للجلسة: التوكن، المستخدم، السلة، الكاش، تذكير السلة المجدول
  const clearSession = useCallback(async () => {
    try { await SecureStore.deleteItemAsync('token'); } catch {}
    try { await SecureStore.deleteItemAsync('user'); } catch {}
    await emitLogout();      // السلة تمسح نفسها وتلغي التذكير
    await clearAllCache();   // cache_* (home, profile, orders_my, favorites, notifications, rest_*...)
    try { Notifications.setBadgeCountAsync(0).catch(() => {}); } catch {}
    setToken(null);
    setUser(null);
  }, []);

  /*
    تسجيل الخروج: نمسح الجلسة فوراً (بدون انتظار الشبكة) ثم نبلغ السيرفر بالخلفية
    بالتوكن القديم وبمهلة قصيرة — ما في تعليق 15 ثانية على زر الخروج
  */
  const logout = useCallback(async ({ remote = true } = {}) => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    let old = null;
    try { old = await SecureStore.getItemAsync('token'); } catch {}
    try {
      await clearSession();
    } finally { loggingOut.current = false; }
    if (remote && old) {
      api.post('/auth/logout', null, { headers: { Authorization: `Bearer ${old}` }, timeout: 5000, _skipAuthHandler: true }).catch(() => {});
    }
  }, [clearSession]);

  /*
    401 من أي طلب: ما منطلّع الزبون فوراً (ممكن يكون عطل لحظي بالسيرفر).
    نتأكد مرة وحدة بعد ~1.5 ثانية عبر GET /auth/me: 401 مؤكد → خروج نظيف؛ غير هيك → الجلسة باقية.
  */
  const confirmUnauthorized = useCallback((sentToken) => {
    if (confirming.current) return confirming.current;
    confirming.current = (async () => {
      try {
        const current = await SecureStore.getItemAsync('token').catch(() => null);
        if (!current) return;
        // طلب قديم بتوكن سابق (مثلاً بعد دخول بحساب ثاني) — نتجاهله
        if (sentToken && current !== sentToken) return;
        await wait(1500);
        try {
          await api.get('/auth/me', { _skipAuthHandler: true, timeout: 10000 });
        } catch (e) {
          if (e?.status === 401) {
            const still = await SecureStore.getItemAsync('token').catch(() => null);
            if (still === current) await logout({ remote: false });
          }
        }
      } finally { confirming.current = null; }
    })();
    return confirming.current;
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler((sent) => { confirmUnauthorized(sent); });
    return () => setUnauthorizedHandler(null);
  }, [confirmUnauthorized]);

  useEffect(() => { loadUser(); }, []);

  // Re-register push token whenever app comes to foreground (+ تصفير شارة أيقونة التطبيق)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        try { Notifications.setBadgeCountAsync(0).catch(() => {}); } catch {}
        SecureStore.getItemAsync('token').then(t => {
          if (t) registerForPushNotifications().catch(() => {});
        }).catch(() => {});
      }
      appState.current = next;
    });
    try { Notifications.setBadgeCountAsync(0).catch(() => {}); } catch {}
    return () => sub.remove();
  }, []);

  const loadUser = async () => {
    try {
      const t = await SecureStore.getItemAsync('token');
      if (t) {
        setToken(t);
        // عرض فوري من الكاش (بدون انتظار الشبكة)
        try {
          const cached = await SecureStore.getItemAsync('user');
          if (cached) setUser(JSON.parse(cached));
          else setUser({});
        } catch { setUser({}); }
        setLoading(false);
        // تحقّق بالخلفية — 401 يمرّ على التأكيد (confirmUnauthorized) قبل أي خروج
        api.get('/auth/me')
          .then(data => {
            if (data?.user) { setUser(data.user); SecureStore.setItemAsync('user', JSON.stringify(data.user)).catch(() => {}); }
            // تجديد منزلق للتوكن (سيرفر أحدث) — الجلسة ما بتنتهي فجأة بعد 30 يوم
            if (typeof data?.refreshed_token === 'string' && data.refreshed_token.length > 20) {
              SecureStore.setItemAsync('token', data.refreshed_token).then(() => setToken(data.refreshed_token)).catch(() => {});
            }
          })
          .catch(() => {});
        registerForPushNotifications().catch(() => {});
        return;
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const login = async (tokenValue, userData) => {
    // حساب جديد على نفس الجهاز → لا نُبقي بيانات الحساب السابق
    await emitLogout();
    await clearAllCache();
    await SecureStore.setItemAsync('token', tokenValue);
    try { await SecureStore.setItemAsync('user', JSON.stringify(userData || {})); } catch {}
    setToken(tokenValue);
    setUser(userData || {});
    registerForPushNotifications().catch(() => {});
  };

  // تحديث بيانات المستخدم بالذاكرة + التخزين الآمن (مثلاً بعد تعديل الاسم)
  const updateUser = useCallback((data) => {
    setUser(prev => {
      const next = { ...(prev || {}), ...data };
      SecureStore.setItemAsync('user', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
