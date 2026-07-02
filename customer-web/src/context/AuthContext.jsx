import { createContext, useContext, useState, useEffect } from 'react';

const Ctx = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wasaly_user')); } catch { return null; }
  });

  const login = (userData, token) => {
    localStorage.setItem('wasaly_token', token);
    localStorage.setItem('wasaly_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('wasaly_token');
    localStorage.removeItem('wasaly_user');
    setUser(null);
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
