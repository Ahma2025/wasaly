import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { FiHome, FiPackage, FiStar, FiSettings, FiLogOut } from 'react-icons/fi';
import { MdOutlineRestaurantMenu, MdStorefront } from 'react-icons/md';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Menu from './pages/Menu';
import Settings from './pages/Settings';
import Reviews from './pages/Reviews';
import SupportWidget from './components/SupportWidget';
import Login from './pages/Login';
import { RestaurantProvider, useRestaurant } from './context/RestaurantContext';
import { LiveOrdersProvider, useLiveOrders } from './context/LiveOrdersContext';
import { setUnauthorizedHandler } from './utils/api';
import { clearSession, logout } from './utils/auth';
import { ROUTER_BASENAME } from './utils/config';
import { useConfirm } from './components/ui';

const NAV = [
  { to: '/', icon: FiHome, label: 'الرئيسية' },
  { to: '/orders', icon: FiPackage, label: 'الطلبات' },
  { to: '/menu', icon: MdOutlineRestaurantMenu, label: 'المنيو' },
  { to: '/reviews', icon: FiStar, label: 'التقييمات' },
  { to: '/settings', icon: FiSettings, label: 'الإعدادات' },
];

function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { pendingCount } = useLiveOrders();
  const [dialog, confirm] = useConfirm();

  const doLogout = async () => {
    const ok = await confirm({ title: 'تسجيل الخروج', message: 'سيتوقف وصول إشعارات الطلبات على هذا الجهاز حتى تسجّل الدخول مجددًا. إعدادات الطابعة تبقى محفوظة.', confirmText: 'خروج', danger: true });
    if (!ok) return;
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {dialog}
      <nav aria-label="القائمة الرئيسية"
        className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 z-50 shadow-[0_-6px_24px_rgba(26,26,46,0.06)]"
        style={{ paddingBottom: 'var(--sab)' }}>
        <div className="max-w-3xl mx-auto flex" style={{ height: 'var(--nav-h)' }}>
          {NAV.map(item => {
            const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
            const Icon = item.icon;
            const badge = item.to === '/orders' && pendingCount > 0 ? pendingCount : 0;
            return (
              <button key={item.to} onClick={() => navigate(item.to)} aria-current={active ? 'page' : undefined}
                className={`no-press flex-1 flex flex-col items-center justify-center gap-1 ${active ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
                <span className={`relative w-12 h-7 flex items-center justify-center rounded-full transition-colors ${active ? 'bg-brand-50' : ''}`}>
                  <Icon size={21} aria-hidden />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white pulse-dot">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] ${active ? 'font-black' : 'font-bold'}`}>{item.label}</span>
              </button>
            );
          })}
          <button onClick={doLogout} className="no-press flex-1 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-rose-500" aria-label="تسجيل الخروج">
            <span className="w-12 h-7 flex items-center justify-center"><FiLogOut size={20} aria-hidden /></span>
            <span className="text-[11px] font-bold">خروج</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function Header() {
  const { restaurant } = useRestaurant();
  const { connected } = useLiveOrders();
  return (
    <header className="sticky top-0 z-40 grad-sunset px-4 shadow-brand rounded-b-[28px]"
      style={{ paddingTop: 'calc(var(--sat) + 14px)', paddingBottom: '16px' }}>
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center overflow-hidden flex-shrink-0 text-white">
          {restaurant.logo
            ? <img src={restaurant.logo} className="w-12 h-12 object-cover" alt={`شعار ${restaurant.name_ar || 'المطعم'}`} />
            : <MdStorefront size={24} aria-hidden />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-white leading-tight text-base truncate">{restaurant.name_ar || 'المطعم'}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${restaurant.is_open ? 'bg-white/20 text-white' : 'bg-black/15 text-white/90'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${restaurant.is_open ? 'bg-emerald-300' : 'bg-white/60'}`} />
              {restaurant.is_open ? 'مفتوح الآن' : 'مغلق'}
            </span>
            {!connected && <span className="text-[10px] font-semibold text-white/75">جارِ الاتصال…</span>}
          </div>
        </div>
        <span className="text-[11px] font-black text-white/90 tracking-wide">وصلّي</span>
      </div>
    </header>
  );
}

function NoRestaurant() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center" dir="rtl">
      <div className="card p-8 max-w-sm">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center"><MdStorefront size={30} /></div>
        <p className="font-black text-lg text-gray-900">لا يوجد مطعم مرتبط بهذا الحساب</p>
        <p className="text-sm text-gray-500 mt-2">قد يكون المطعم غير مفعّل بعد. تواصل مع إدارة وصلّي.</p>
        <button className="btn-primary w-full mt-5" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>العودة لتسجيل الدخول</button>
      </div>
    </div>
  );
}

function Layout() {
  const { restaurant } = useRestaurant();
  if (!restaurant?.id) return <NoRestaurant />;
  return (
    <LiveOrdersProvider>
      <div className="min-h-screen" dir="rtl">
        <Header />
        <main className="page-bottom-space max-w-3xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <BottomNav />
        <SupportWidget />
      </div>
    </LiveOrdersProvider>
  );
}

function ProtectedRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />;
}

// انتهاء الجلسة (401) → خروج وتوجيه لصفحة الدخول
function AuthWatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      toast.error('انتهت الجلسة — سجّل الدخول من جديد', { id: 'session-expired' });
      navigate('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter basename={ROUTER_BASENAME}>
      <AuthWatcher />
      <Toaster position="top-center" containerStyle={{ top: 'calc(var(--sat) + 10px)' }}
        toastOptions={{ style: { fontFamily: 'inherit', direction: 'rtl', borderRadius: '14px', fontWeight: 700, fontSize: '14px' } }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><RestaurantProvider><Layout /></RestaurantProvider></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
