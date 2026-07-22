import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Users = lazy(() => import('./pages/Users'));
const Restaurants = lazy(() => import('./pages/Restaurants'));
const Orders = lazy(() => import('./pages/Orders'));
const Drivers = lazy(() => import('./pages/Drivers'));
const DeliveryZones = lazy(() => import('./pages/DeliveryZones'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Coupons = lazy(() => import('./pages/Coupons'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Banners = lazy(() => import('./pages/Banners'));
const Reviews = lazy(() => import('./pages/Reviews'));

const NAV = [
  { to: '/', icon: '📊', label: 'الرئيسية' },
  { to: '/restaurants', icon: '🏪', label: 'المطاعم' },
  { to: '/drivers', icon: '🛵', label: 'السائقين' },
  { to: '/orders', icon: '📦', label: 'الطلبات' },
  { to: '/users', icon: '👥', label: 'المستخدمون' },
];

const NAV2 = [
  { to: '/zones', icon: '📍', label: 'التوصيل' },
  { to: '/analytics', icon: '📈', label: 'التحليلات' },
  { to: '/coupons', icon: '🎟️', label: 'الكوبونات' },
  { to: '/notifications', icon: '🔔', label: 'الإشعارات' },
  { to: '/banners', icon: '🖼️', label: 'الإعلانات' },
  { to: '/reviews', icon: '⭐', label: 'التقييمات' },
];

function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const allNav = [...NAV, ...NAV2];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 z-50 safe-area-bottom shadow-[0_-4px_20px_rgba(26,26,46,0.06)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex overflow-x-auto">
        {allNav.map(item => {
          const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
          return (
            <button key={item.to} onClick={() => navigate(item.to)}
              className={`flex-shrink-0 flex flex-col items-center py-2 px-3 gap-0.5 min-w-[60px] ${active ? 'text-orange-500' : 'text-gray-400'}`}>
              <span className={`text-lg w-10 h-7 flex items-center justify-center rounded-full ${active ? 'bg-orange-50' : ''}`}>{item.icon}</span>
              <span className="text-[9px] font-bold whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
        <button onClick={() => { localStorage.removeItem('admin_token'); window.location.reload(); }}
          className="flex-shrink-0 flex flex-col items-center py-2 px-3 gap-0.5 text-red-400 min-w-[60px]">
          <span className="text-lg">🚪</span>
          <span className="text-[9px] font-semibold">خروج</span>
        </button>
      </div>
    </nav>
  );
}

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 px-4 flex items-center gap-3 shadow-soft"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)', paddingBottom: '16px' }}>
        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-brand">و</div>
        <div>
          <h1 className="font-black text-gray-900 leading-none text-base">وصلّي</h1>
          <p className="text-[10px] text-gray-400">لوحة الإدارة</p>
        </div>
      </header>
      <main className="pb-20">
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<Users />} />
            <Route path="/restaurants" element={<Restaurants />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/zones" element={<DeliveryZones />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/banners" element={<Banners />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.role === 'admin' && payload.exp * 1000 > Date.now()) {
          setUser({ id: payload.id, role: payload.role });
        } else { localStorage.removeItem('admin_token'); }
      } catch { localStorage.removeItem('admin_token'); }
    }
    setChecking(false);
  }, []);

  if (checking) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="animate-spin h-10 w-10 rounded-full border-b-2 border-orange-500" />
    </div>
  );

  if (!user) return (
    <>
      <Toaster position="top-center" />
      <Login onLogin={setUser} />
    </>
  );

  return (
    <BrowserRouter>
      <Toaster position="top-center" toastOptions={{ style: { fontFamily: 'inherit', direction: 'rtl' } }} />
      <AppLayout />
    </BrowserRouter>
  );
}
