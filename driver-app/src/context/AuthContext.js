import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from '../utils/pushNotifications';
import { disconnectSocket } from '../utils/socket';

const AuthContext = createContext();

function decodeJWT(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
    const json = decodeURIComponent(
      Array.from(atob ? atob(padded) : Buffer.from(padded, 'base64').toString())
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch { return null; }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    AsyncStorage.multiGet(['driver_token', 'driver_user']).then(([[, t], [, u]]) => {
      if (t) {
        setToken(t);
        if (u) {
          try { setUser(JSON.parse(u)); } catch { setUser(decodeJWT(t)); }
        } else {
          setUser(decodeJWT(t));
        }
        registerForPushNotifications().catch(() => {});
      }
      setLoading(false);
    });
  }, []);

  // Re-register push token whenever app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        AsyncStorage.getItem('driver_token').then(t => {
          if (t) registerForPushNotifications().catch(() => {});
        });
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  const login = async (t, u) => {
    await AsyncStorage.multiSet([['driver_token', t], ['driver_user', JSON.stringify(u)]]);
    setToken(t);
    setUser(u);
    registerForPushNotifications().catch(() => {});
  };

  const logout = async () => {
    disconnectSocket();
    await AsyncStorage.multiRemove(['driver_token', 'driver_user']);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
