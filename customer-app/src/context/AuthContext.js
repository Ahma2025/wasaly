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
        const data = await api.get('/auth/me');
        setUser(data.user);
        registerForPushNotifications().catch(() => {});
      }
    } catch { await SecureStore.deleteItemAsync('token'); }
    finally { setLoading(false); }
  };

  const login = async (tokenValue, userData) => {
    await SecureStore.setItemAsync('token', tokenValue);
    setToken(tokenValue);
    setUser(userData);
    registerForPushNotifications().catch(() => {});
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    await SecureStore.deleteItemAsync('token');
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
