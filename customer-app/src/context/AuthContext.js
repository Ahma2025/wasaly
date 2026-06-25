import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const t = await SecureStore.getItemAsync('token');
      if (t) {
        setToken(t);
        const data = await api.get('/auth/me');
        setUser(data.user);
      }
    } catch { await SecureStore.deleteItemAsync('token'); }
    finally { setLoading(false); }
  };

  const login = async (tokenValue, userData) => {
    await SecureStore.setItemAsync('token', tokenValue);
    setToken(tokenValue);
    setUser(userData);
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
