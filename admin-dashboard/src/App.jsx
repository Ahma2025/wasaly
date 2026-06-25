import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Restaurants from './pages/Restaurants';
import Orders from './pages/Orders';
import Coupons from './pages/Coupons';
import Notifications from './pages/Notifications';
import Login from './pages/Login';

const NAV = [
  { to: '/', icon: '📊', label: 'لوحة التحكم' },
  { to: '/users', icon: '👥', label: 'المستخدمون' },
  { to: '/restaurants', icon: '🏪', label: 'المطاعم' },
  { to: '/orders', icon: '📦', label: 'الطلبات' },
  { to: '/coupons', icon: '🎟️', label: 'الكوبونات' },
  { to: '/notifications', icon: '🔔', label: 'الإشعارات' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role === 'admin' && payload.exp * 1000 > Date.now()) {
          setUser({ id: payload.userId, role: payload.role });
        } else { localStorage.removeItem('admin_token'); }
      } catch { localStorage.removeItem('admin_token'); }
    }
    setChecking(false);
  }, []);

  const logout = () => { localStorage.removeItem('admin_token'); setUser(null); };

  if (checking) return <div className="flex items-center justify-center h-screen"><div className="animate-spin h-10 w-10 rounded-full border-b-2 border-orange-500" /></div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <div className="flex h-screen bg-gray-50" dir="rtl">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-l shadow-sm flex flex-col">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🚀</span>
              <div>
                <h1 className="font-black text-gray-900">وصلّي</h1>
                <p className="text-xs text-gray-400">لوحة الإدارة</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {NAV.map(item => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl transition text-sm font-semibold ${isActive ? 'bg-orange-50 text-orange-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t">
            <button onClick={logout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 text-sm font-semibold w-full">
              <span>🚪</span> تسجيل الخروج
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/restaurants" element={<Restaurants />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
