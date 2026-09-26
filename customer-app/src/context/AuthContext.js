import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';
import { registerForPushNotifications } from '../utils/pushNotifications';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => { loadUser(); }, []);

  // Re-register push token whenever app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        SecureStore.getItemAsync('token').then(t => {
          if (t) registerForPushNotifications().catch(() => {});
        });
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
        // عرض فوري من الكاش (بدون انتظار الشبكة) — يلغي شاشة التحميل البيضا
        try {
          const cached = await SecureStore.getItemAsync('user');
          if (cached) setUser(JSON.parse(cached));
        } catch {}
        setLoading(false); // ندخل التطبيق فورًا
        // تحقّق بالخلفية (تحديث البيانات، وتسجيل خروج فقط لو التوكن غير صالح)
        api.get('/auth/me')
          .then(data => { if (data?.user) { setUser(data.user); SecureStore.setItemAsync('user', JSON.stringify(data.user)).catch(() => {}); } })
          .catch(async (e) => {
            if (e?.message !== 'Network error' && e?.status === 401) {
              await SecureStore.deleteItemAsync('token'); setToken(null); setUser(null);
            }
          });
        registerForPushNotifications().catch(() => {});
        return;
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const login = async (tokenValue, userData) => {
    await SecureStore.setItemAsync('token', tokenValue);
    try { await SecureStore.setItemAsync('user', JSON.stringify(userData)); } catch {}
    setToken(tokenValue);
    setUser(userData);
    registerForPushNotifications().catch(() => {});
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    await SecureStore.deleteItemAsync('token');
    try { await SecureStore.deleteItemAsync('user'); } catch {}
    setToken(null);
    setUser(null);
  };

  const updateUser = (data) => setUser(prev => ({ ...prev, ...data }));

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
