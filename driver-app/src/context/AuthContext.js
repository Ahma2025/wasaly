import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('driver_token').then(t => {
      if (t) { setToken(t); try { setUser(JSON.parse(atob(t.split('.')[1]))); } catch {} }
      setLoading(false);
    });
  }, []);

  const login = async (t, u) => {
    await AsyncStorage.setItem('driver_token', t);
    setToken(t); setUser(u);
  };

  const logout = async () => {
    await AsyncStorage.removeItem('driver_token');
    setToken(null); setUser(null);
  };

  return <AuthContext.Provider value={{ user, token, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
