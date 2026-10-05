import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications, resetPushRegistration } from '../utils/pushNotifications';
import { disconnectSocket } from '../utils/socket';
import api, { setUnauthorizedHandler } from '../utils/api';
import { getToken, setToken as storeToken, clearAllUserData, decodeJWT, isTokenExpired, USER_KEY, ONLINE_KEY } from '../utils/storage';
import { stopBackgroundTracking } from '../tasks/locationTask';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);
  const loggingOut = useRef(false);

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
          }
        } else if (t) {
          // توكن منتهي → تنظيف كامل
          await clearAllUserData();
        }
      } catch { /* قراءة التخزين فشلت — نكمل كمستخدم غير مسجّل */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // إعادة تسجيل توكن الإشعارات عند العودة للتطبيق (يُرسل فقط إن تغيّر)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        getToken().then(t => { if (t) registerForPushNotifications().catch(() => {}); });
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

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

  // remote=false عند 401 (التوكن مرفوض أصلاً — لا داعي لطلبات الشبكة)
  const logout = useCallback(async ({ remote = true } = {}) => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      if (remote) {
        const withTimeout = (p) => Promise.race([p, new Promise(r => setTimeout(r, 5000))]);
        await withTimeout(api.patch('/drivers/status', { is_online: false }).catch(() => {}));
        await withTimeout(api.post('/auth/logout').catch(() => {}));
      }
      await stopBackgroundTracking();
      disconnectSocket();
      resetPushRegistration();
      await clearAllUserData();
      try { await AsyncStorage.removeItem(ONLINE_KEY); } catch {}
    } finally {
      setToken(null);
      setUser(null);
      loggingOut.current = false;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => logout({ remote: false }));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
