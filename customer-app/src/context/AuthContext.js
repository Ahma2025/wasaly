import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import api, { setUnauthorizedHandler } from '../utils/api';
import { clearAllCache } from '../utils/cache';
import { emitLogout } from '../utils/session';
import { registerForPushNotifications } from '../utils/pushNotifications';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const appState = useRef(AppState.currentState);
  const loggingOut = useRef(false);

  // تنظيف كامل للجلسة: التوكن، المستخدم، السلة، الكاش، تذكير السلة المجدول
  const clearSession = useCallback(async () => {
    try { await SecureStore.deleteItemAsync('token'); } catch {}
    try { await SecureStore.deleteItemAsync('user'); } catch {}
    await emitLogout();      // السلة تمسح نفسها وتلغي التذكير
    await clearAllCache();   // cache_* (home, profile, orders_my, favorites, notifications, rest_*...)
    setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback(async ({ remote = true } = {}) => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      if (remote) { try { await api.post('/auth/logout'); } catch {} }
      await clearSession();
    } finally { loggingOut.current = false; }
  }, [clearSession]);

  // أي 401 من السيرفر (توكن منتهي) → خروج نظيف بدل بقاء التطبيق بمستخدم وهمي
  useEffect(() => {
    setUnauthorizedHandler(() => { logout({ remote: false }); });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => { loadUser(); }, []);

  // Re-register push token whenever app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        SecureStore.getItemAsync('token').then(t => {
          if (t) registerForPushNotifications().catch(() => {});
        }).catch(() => {});
      }
      appState.current = next;
    });
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
        // تحقّق بالخلفية — 401 يتولاه معالج الـ api (logout)
        api.get('/auth/me')
          .then(data => { if (data?.user) { setUser(data.user); SecureStore.setItemAsync('user', JSON.stringify(data.user)).catch(() => {}); } })
          .catch((e) => { if (e?.status === 401) logout({ remote: false }); });
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
