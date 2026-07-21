import React, { useEffect } from 'react';
import { setupBrowserNotifications } from './utils/pushNotifications';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Menu from './pages/Menu';
import Settings from './pages/Settings';
import Login from './pages/Login';

const NAV = [
  { to: '/', icon: '📊', label: 'الرئيسية' },
  { to: '/orders', icon: '📦', label: 'الطلبات' },
  { to: '/menu', icon: '🍽️', label: 'المنيو' },
  { to: '/settings', icon: '⚙️', label: 'الإعدادات' },
];

function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const logout = () => { localStorage.clear(); navigate('/login'); };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 flex z-50 shadow-[0_-4px_20px_rgba(26,26,46,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {NAV.map(item => {
        const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
        return (
          <button key={item.to} onClick={() => navigate(item.to)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 ${active ? 'text-orange-500' : 'text-gray-400'}`}>
            <span className={`text-xl w-11 h-8 flex items-center justify-center rounded-full ${active ? 'bg-orange-50' : ''}`}>{item.icon}</span>
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        );
      })}
      <button onClick={logout} className="flex-1 flex flex-col items-center py-2 gap-0.5 text-gray-400">
        <span className="text-xl w-11 h-8 flex items-center justify-center">🚪</span>
        <span className="text-[10px] font-bold">خروج</span>
      </button>
    </nav>
  );
}

function Layout() {
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => {
    // Ask for browser notification permission once logged in
    setupBrowserNotifications();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-soft">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-lg ring-2 ring-white shadow-soft overflow-hidden">
          {restaurant.logo ? <img src={restaurant.logo} className="w-10 h-10 rounded-xl object-cover" /> : '🏪'}
        </div>
        <div>
          <p className="font-bold text-gray-900 leading-none text-sm">{restaurant.name_ar || 'المطعم'}</p>
          <span className={`text-[10px] font-semibold ${restaurant.is_open ? 'text-green-600' : 'text-red-500'}`}>
            {restaurant.is_open ? '● مفتوح' : '● مغلق'}
          </span>
        </div>
      </header>

      <main className="pb-20">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <BottomNav />
    </div>
  );
}

function ProtectedRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: 'inherit', direction: 'rtl' } }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><Layout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
