import React, { useState, useEffect, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import {
  FiHome, FiMap, FiPackage, FiShoppingBag, FiGrid, FiTruck, FiUsers, FiMapPin, FiSend,
  FiTrendingUp, FiTag, FiBell, FiImage, FiStar, FiMessageCircle, FiDollarSign, FiLogOut, FiX,
} from 'react-icons/fi';
import Login from './pages/Login';
import PageSkeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider, useConfirm } from './components/ui';
import { currentAdmin, logout, clearSession } from './utils/session';

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
const Chats = lazy(() => import('./pages/Chats'));
const LiveOps = lazy(() => import('./pages/LiveOps'));
const Accounting = lazy(() => import('./pages/Accounting'));
const PersonalDelivery = lazy(() => import('./pages/PersonalDelivery'));

const LOGO = `${import.meta.env.BASE_URL}logo.png`;

const PRIMARY = [
  { to: '/', icon: FiHome, label: 'الرئيسية' },
  { to: '/live', icon: FiMap, label: 'العمليات' },
  { to: '/orders', icon: FiPackage, label: 'الطلبات' },
  { to: '/restaurants', icon: FiShoppingBag, label: 'المطاعم' },
];

const MORE = [
  { to: '/drivers', icon: FiTruck, label: 'السائقون', tint: '#8B5CF6' },
  { to: '/users', icon: FiUsers, label: 'المستخدمون', tint: '#3B82F6' },
  { to: '/accounting', icon: FiDollarSign, label: 'المحاسبة', tint: '#16A34A' },
  { to: '/analytics', icon: FiTrendingUp, label: 'التحليلات', tint: '#0EA5E9' },
  { to: '/zones', icon: FiMapPin, label: 'مناطق التوصيل', tint: '#FF6B00' },
  { to: '/personal-delivery', icon: FiSend, label: 'توصيل شخصي', tint: '#F53B57' },
  { to: '/coupons', icon: FiTag, label: 'الكوبونات', tint: '#D97706' },
  { to: '/notifications', icon: FiBell, label: 'الإشعارات', tint: '#E11D48' },
  { to: '/banners', icon: FiImage, label: 'الإعلانات', tint: '#7C3AED' },
  { to: '/reviews', icon: FiStar, label: 'التقييمات', tint: '#EAB308' },
  { to: '/chats', icon: FiMessageCircle, label: 'المحادثات', tint: '#0891B2' },
];

const ALL = [...PRIMARY, ...MORE];
const isActive = (to, pathname) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

function MoreSheet({ open, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const confirm = useConfirm();
  if (!open) return null;

  const go = (to) => { onClose(); navigate(to); };
  const doLogout = async () => {
    const ok = await confirm({ title: 'تسجيل الخروج', message: 'سيتم مسح البيانات المخزّنة على هذا الجهاز والرجوع لشاشة الدخول.', confirmText: 'خروج', icon: <FiLogOut /> });
    if (ok) { onClose(); logout('manual'); }
  };

  return (
    <div className="fixed inset-0 z-[60]" dir="rtl">
      <div className="absolute inset-0 bg-[#1A1A2E]/45 backdrop-blur-[2px] animate-[fadeIn_.18s_ease]" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 mx-auto max-w-3xl bg-white rounded-t-[30px] shadow-2xl animate-[sheetUp_.26s_cubic-bezier(.2,.8,.2,1)]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
        <div className="w-11 h-1.5 bg-gray-200 rounded-full mx-auto mt-2.5" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div>
            <h3 className="font-black text-lg text-gray-900">كل الأقسام</h3>
            <p className="text-[11px] text-gray-400 font-semibold">اختر القسم الذي تريد إدارته</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"><FiX /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 px-4 pt-1">
          {MORE.map(item => {
            const Icon = item.icon;
            const active = isActive(item.to, pathname);
            return (
              <button key={item.to} onClick={() => go(item.to)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${active ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-gray-50'}`}>
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-[22px]"
                  style={{ background: `${item.tint}14`, color: item.tint }}>
                  <Icon />
                </span>
                <span className={`text-[11px] font-bold leading-tight text-center ${active ? 'text-orange-600' : 'text-gray-700'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 mt-3">
          <button onClick={doLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-50 text-red-600 font-black text-sm">
            <FiLogOut /> تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some(m => isActive(m.to, pathname));

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const Tab = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 relative" aria-current={active ? 'page' : undefined}>
      <span className={`w-12 h-8 rounded-full flex items-center justify-center text-[20px] transition-all ${active ? 'grad-sunset text-white shadow-brand -translate-y-0.5' : 'text-gray-400'}`}>
        <Icon />
      </span>
      <span className={`text-[11px] font-bold ${active ? 'text-orange-600' : 'text-gray-500'}`}>{label}</span>
    </button>
  );

  return (
    <>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <nav className="fixed bottom-0 inset-x-0 z-[70] bg-white/95 backdrop-blur-xl border-t border-gray-100 shadow-[0_-6px_24px_rgba(26,26,46,0.07)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex max-w-3xl mx-auto px-1">
          {PRIMARY.map(item => (
            <Tab key={item.to} active={!moreOpen && isActive(item.to, pathname)} onClick={() => { setMoreOpen(false); navigate(item.to); }} icon={item.icon} label={item.label} />
          ))}
          <Tab active={moreOpen || moreActive} onClick={() => setMoreOpen(o => !o)} icon={FiGrid} label="المزيد" />
        </div>
      </nav>
    </>
  );
}

function AppLayout() {
  const { pathname } = useLocation();
  const current = ALL.find(i => isActive(i.to, pathname));
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen bg-[#F5F6F8]" dir="rtl">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', boxShadow: '0 2px 20px rgba(26,26,46,0.05)' }}>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center gap-3">
          <img src={LOGO} alt="وصلّي" className="w-11 h-11 rounded-2xl object-cover shadow-brand" />
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-gray-900 leading-none text-lg tracking-tight">وصلّي <span className="text-[11px] font-bold text-gray-400">· لوحة الإدارة</span></h1>
            <p className="text-[12px] text-orange-600 font-bold mt-1 truncate">{current?.label || 'الرئيسية'}</p>
          </div>
        </div>
        <div className="h-[3px] grad-sunset opacity-90" />
      </header>
      <main className="max-w-3xl mx-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}>
        <ErrorBoundary resetKey={pathname}>
        <Suspense fallback={<div className="p-4"><PageSkeleton cards={4} rows={6} /></div>}>
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
            <Route path="/chats" element={<Chats />} />
            <Route path="/live" element={<LiveOps />} />
            <Route path="/accounting" element={<Accounting />} />
            <Route path="/personal-delivery" element={<PersonalDelivery />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav />
    </div>
  );
}

const toasterProps = { position: 'top-center', toastOptions: { style: { fontFamily: 'inherit', direction: 'rtl', borderRadius: 16, fontWeight: 700 } } };

export default function App() {
  const [user, setUser] = useState(() => {
    const u = currentAdmin();
    if (!u) clearSession();
    return u;
  });

  // إخفاء شاشة البداية فور جاهزية التطبيق
  useEffect(() => { window.__hideSplash?.(); }, []);

  // 401/403 أو خروج يدوي → شاشة الدخول
  useEffect(() => {
    const onLogout = (e) => {
      setUser(null);
      const r = e.detail?.reason;
      if (r === 'expired') toast.error('انتهت الجلسة، سجّل الدخول من جديد');
      else if (r === 'forbidden') toast.error('لا تملك صلاحية — سجّل الدخول بحساب مدير');
    };
    window.addEventListener('wasaly:logout', onLogout);
    return () => window.removeEventListener('wasaly:logout', onLogout);
  }, []);

  // فحص انتهاء التوكن دورياً
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => { if (!currentAdmin()) logout('expired'); }, 60000);
    return () => clearInterval(t);
  }, [user]);

  return (
    <ConfirmProvider>
      <Toaster {...toasterProps} />
      {!user ? (
        <Login onLogin={() => setUser(currentAdmin())} />
      ) : (
        <HashRouter>
          <AppLayout />
        </HashRouter>
      )}
    </ConfirmProvider>
  );
}
