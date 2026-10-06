import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { FiHome, FiPackage, FiStar, FiSettings, FiLogOut, FiChevronLeft } from 'react-icons/fi';
import { MdOutlineRestaurantMenu, MdStorefront } from 'react-icons/md';
import SupportWidget from './components/SupportWidget';
import PageSkeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';
import PushBanner from './components/PushBanner';
import Login from './pages/Login';
import { RestaurantProvider, useRestaurant } from './context/RestaurantContext';
import { LiveOrdersProvider, useLiveOrders } from './context/LiveOrdersContext';
import { setUnauthorizedHandler } from './utils/api';
import { clearSession, logout } from './utils/auth';
import { ROUTER_BASENAME, LOGO_URL } from './utils/config';
import { installBackHandler } from './utils/backButton';
import { canLeave } from './utils/navGuard';
import { fmtLongToday } from './utils/format';
import { pl } from './utils/plural';
import { useConfirm, cx } from './components/ui';

// تقسيم الحزمة: كل صفحة تُحمَّل عند الحاجة (المخططات والخرائط لا تثقل التشغيل الأول)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const Menu = lazy(() => import('./pages/Menu'));
const Settings = lazy(() => import('./pages/Settings'));
const Reviews = lazy(() => import('./pages/Reviews'));

const NAV = [
  { to: '/', icon: FiHome, label: 'الرئيسية' },
  { to: '/orders', icon: FiPackage, label: 'الطلبات' },
  { to: '/menu', icon: MdOutlineRestaurantMenu, label: 'المنيو' },
  { to: '/reviews', icon: FiStar, label: 'التقييمات' },
  { to: '/settings', icon: FiSettings, label: 'الإعدادات' },
];
const isActive = (to, pathname) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

// تنقّل يحترم حارس التغييرات غير المحفوظة (الإعدادات)
function useGo() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return async (to) => {
    if (to === pathname) return;
    if (await canLeave()) navigate(to);
  };
}

function useLogout() {
  const navigate = useNavigate();
  const [dialog, confirm] = useConfirm();
  const doLogout = async () => {
    if (!(await canLeave())) return;
    const ok = await confirm({ title: 'تسجيل الخروج', message: 'سيتوقف وصول إشعارات الطلبات على هذا الجهاز حتى تسجّل الدخول مجددًا. إعدادات الطابعة تبقى محفوظة.', confirmText: 'خروج', danger: true });
    if (!ok) return;
    // الخروج فوري: الجلسة تُمسح محليًا والسيرفر يُبلَّغ بالخلفية
    await logout();
    navigate('/login', { replace: true });
  };
  return [dialog, doLogout];
}

function RestaurantAvatar({ restaurant, size = 44, className = '' }) {
  return (
    <div className={cx('rounded-[14px] flex items-center justify-center overflow-hidden flex-shrink-0', className)} style={{ width: size, height: size }}>
      {restaurant.logo
        ? <img src={restaurant.logo} className="w-full h-full object-cover" alt={`شعار ${restaurant.name_ar || 'المطعم'}`} />
        : <MdStorefront size={size * 0.5} aria-hidden />}
    </div>
  );
}

function LiveBadge({ connected, light }) {
  return connected ? (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap', light ? 'text-white/90' : 'text-emerald-700')}>
      <span className={cx('w-2 h-2 rounded-full live-dot', light ? 'bg-emerald-300' : 'bg-success')} aria-hidden /> مباشر
    </span>
  ) : (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap', light ? 'text-white/80' : 'text-amber-700')}>
      <span className={cx('w-2 h-2 rounded-full animate-pulse', light ? 'bg-amber-200' : 'bg-warning')} aria-hidden /> جارِ الاتصال…
    </span>
  );
}

// ─── القائمة السفلية (جوال/تابلت) مع مؤشّر منزلق ───
function BottomNav() {
  const go = useGo();
  const { pathname } = useLocation();
  const { pendingCount } = useLiveOrders();
  const idx = Math.max(0, NAV.findIndex(n => isActive(n.to, pathname)));

  return (
    <nav aria-label="القائمة الرئيسية" className="lg:hidden fixed bottom-0 inset-x-0 z-50 px-3 pointer-events-none"
      style={{ paddingBottom: 'calc(var(--sab) + 8px)' }}>
      <div className="pointer-events-auto max-w-xl mx-auto glass-light border border-white/70 rounded-[24px] shadow-[0_10px_34px_rgba(20,20,43,.14)] relative flex px-1" style={{ height: 'calc(var(--nav-h) - 8px)' }}>
        <span aria-hidden className="absolute top-1.5 bottom-1.5 start-1 transition-transform duration-[380ms] ease-spring"
          style={{ width: 'calc((100% - 8px) / 5)', transform: `translateX(${-idx * 100}%)` }}>
          <span className="block w-full h-full rounded-[18px] bg-brand-50" />
        </span>
        {NAV.map(item => {
          const active = isActive(item.to, pathname);
          const Icon = item.icon;
          const badge = item.to === '/orders' && pendingCount > 0 ? pendingCount : 0;
          return (
            <button key={item.to} onClick={() => go(item.to)} aria-current={active ? 'page' : undefined}
              aria-label={badge > 0 ? `${item.label} — ${pl(badge, 'order')} بانتظار القبول` : undefined}
              className={cx('no-press relative z-[1] flex-1 flex flex-col items-center justify-center gap-0.5', active ? 'text-brand-600' : 'text-ink-3 hover:text-ink-2')}>
              <span className={cx('relative transition-transform duration-300 ease-spring', active && '-translate-y-0.5 scale-110')}>
                <Icon size={21} aria-hidden />
                {badge > 0 && (
                  <span className="absolute -top-2 -left-3 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white pulse-dot tnum">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              <span className={cx('text-[11px]', active ? 'font-extrabold' : 'font-bold')}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── القائمة الجانبية (≥1024px) ───
function Sidebar({ onLogout }) {
  const go = useGo();
  const { pathname } = useLocation();
  const { restaurant } = useRestaurant();
  const { pendingCount, connected } = useLiveOrders();

  return (
    <aside className="hidden lg:flex fixed inset-y-0 start-0 z-40 flex-col bg-white border-e border-surface-line" style={{ width: 'var(--sidebar-w)' }} aria-label="القائمة الجانبية">
      <div className="px-5 pt-6 pb-4 flex items-center gap-2.5">
        <img src={LOGO_URL} alt="" className="w-10 h-10 rounded-[12px] object-cover shadow-brand" onError={e => { e.currentTarget.style.display = 'none'; }} />
        <div>
          <p className="font-black text-ink text-lg leading-none">وصلّي</p>
          <p className="text-[11px] font-bold text-ink-3 mt-1">بوابة المطعم</p>
        </div>
      </div>

      <button onClick={() => go('/settings')} className="no-press mx-4 mb-4 p-3 rounded-[18px] grad-mesh text-white flex items-center gap-3 text-right sheen shadow-brand">
        <RestaurantAvatar restaurant={restaurant} size={42} className="glass text-white relative z-[1]" />
        <div className="flex-1 min-w-0 relative z-[1]">
          <p className="font-extrabold truncate leading-tight">{restaurant.name_ar || 'المطعم'}</p>
          <p className="text-[11px] mt-1 flex items-center gap-1.5 font-bold text-white/90">
            <span className={cx('w-1.5 h-1.5 rounded-full', restaurant.is_open ? 'bg-emerald-300' : 'bg-white/60')} />
            {restaurant.is_open ? 'مفتوح الآن' : 'مغلق'}
          </p>
        </div>
        <FiChevronLeft className="text-white/80 relative z-[1]" aria-hidden />
      </button>

      <nav className="flex-1 px-3 space-y-1" aria-label="القائمة الرئيسية">
        {NAV.map(item => {
          const active = isActive(item.to, pathname);
          const Icon = item.icon;
          const badge = item.to === '/orders' && pendingCount > 0 ? pendingCount : 0;
          return (
            <button key={item.to} onClick={() => go(item.to)} aria-current={active ? 'page' : undefined}
              className={cx('no-press group relative w-full flex items-center gap-3 h-12 px-3 rounded-[14px] font-bold text-[15px] text-right',
                active ? 'bg-brand-50 text-brand-700' : 'text-ink-2 hover:bg-surface hover:text-ink')}>
              <span aria-hidden className={cx('absolute start-0 top-2.5 bottom-2.5 w-1 rounded-full grad-brand transition-all duration-300', active ? 'opacity-100' : 'opacity-0 scale-y-0')} />
              <span className={cx('w-9 h-9 rounded-xl flex items-center justify-center transition-colors', active ? 'grad-brand text-white shadow-brand' : 'bg-surface text-ink-3 group-hover:text-ink-2')}>
                <Icon size={18} aria-hidden />
              </span>
              <span className="flex-1">{item.label}</span>
              {badge > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-coral text-white text-[11px] font-black flex items-center justify-center pulse-dot tnum">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-surface-line space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-ink-3">حالة الاتصال</span>
          <LiveBadge connected={connected} />
        </div>
        <button onClick={onLogout} className="w-full h-11 rounded-[14px] flex items-center justify-center gap-2 font-bold text-sm text-ink-2 bg-surface hover:bg-danger-soft hover:text-danger">
          <FiLogOut size={16} aria-hidden /> تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}

// ─── الهيدر اللاصق مع الحالة المباشرة ───
function Header({ onLogout }) {
  const go = useGo();
  const { pathname } = useLocation();
  const { restaurant } = useRestaurant();
  const { connected, pendingCount } = useLiveOrders();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const current = NAV.find(n => isActive(n.to, pathname));

  return (
    <>
      {/* جوال/تابلت: شريط بهوية وصلّي يتقلّص عند التمرير */}
      <header className={cx('lg:hidden sticky top-0 z-40 grad-mesh text-white px-4 rounded-b-[24px] transition-[padding,box-shadow] duration-300 sheen',
        scrolled ? 'shadow-brand' : '')}
        style={{ paddingTop: `calc(var(--sat) + ${scrolled ? 8 : 14}px)`, paddingBottom: scrolled ? 10 : 16 }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3 relative z-[1]">
          <RestaurantAvatar restaurant={restaurant} size={scrolled ? 38 : 46} className="glass text-white transition-all duration-300" />
          <div className="flex-1 min-w-0">
            <p className="font-extrabold leading-tight text-[16px] truncate">{restaurant.name_ar || 'المطعم'}</p>
            <div className="flex items-center gap-2.5 mt-1">
              <button onClick={() => go('/settings')} className={cx('no-press inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', restaurant.is_open ? 'bg-white/20' : 'bg-black/15 text-white/90')}>
                <span className={cx('w-1.5 h-1.5 rounded-full', restaurant.is_open ? 'bg-emerald-300' : 'bg-white/60')} />
                {restaurant.is_open ? 'مفتوح الآن' : 'مغلق'}
              </button>
              <LiveBadge connected={connected} light />
            </div>
          </div>
          {pendingCount > 0 && !pathname.startsWith('/orders') && (
            <button onClick={() => go('/orders')} className="h-9 px-3 rounded-full bg-white text-brand-700 text-xs font-extrabold flex items-center gap-1.5 shadow-soft animate-pop" aria-label={`${pl(pendingCount, 'order')} بانتظار القبول`}>
              <span className="w-2 h-2 rounded-full bg-coral pulse-dot" /> <span className="tnum">{pendingCount}</span> جديد
            </button>
          )}
          <button onClick={onLogout} aria-label="تسجيل الخروج" className="w-10 h-10 rounded-[14px] glass flex items-center justify-center flex-shrink-0">
            <FiLogOut size={17} aria-hidden />
          </button>
        </div>
      </header>

      {/* سطح المكتب: شريط زجاجي خفيف */}
      <header className={cx('hidden lg:block sticky top-0 z-30 glass-light border-b transition-shadow duration-300', scrolled ? 'border-surface-line shadow-soft' : 'border-transparent')}>
        <div className="max-w-6xl mx-auto px-8 h-16 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-ink-3">{fmtLongToday()}</p>
            <p className="font-extrabold text-ink leading-tight">{current?.label || ''}</p>
          </div>
          {pendingCount > 0 && (
            <button onClick={() => go('/orders')} className="h-10 px-4 rounded-full bg-coral text-white text-sm font-extrabold flex items-center gap-2 shadow-[0_10px_24px_rgba(245,59,87,.3)] animate-pop">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> <span className="tnum">{pendingCount}</span> بانتظار القبول
            </button>
          )}
          <span className={cx('h-10 px-4 rounded-full border text-sm font-bold flex items-center gap-2', restaurant.is_open ? 'bg-success-soft border-success/20 text-emerald-700' : 'bg-gray-100 border-gray-200 text-ink-2')}>
            <span className={cx('w-2 h-2 rounded-full', restaurant.is_open ? 'bg-success' : 'bg-gray-400')} />
            {restaurant.is_open ? 'مفتوح' : 'مغلق'}
          </span>
          <span className="h-10 px-4 rounded-full bg-white border border-surface-line flex items-center"><LiveBadge connected={connected} /></span>
        </div>
      </header>
    </>
  );
}

function NoRestaurant() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center bg-surface" dir="rtl">
      <div className="card p-8 max-w-sm animate-pop">
        <div className="w-20 h-20 mx-auto mb-4 rounded-[24px] grad-sunset text-white flex items-center justify-center shadow-brand"><MdStorefront size={36} /></div>
        <p className="font-extrabold text-lg text-ink">لا يوجد مطعم مرتبط بهذا الحساب</p>
        <p className="text-sm text-ink-2 mt-2 leading-relaxed">قد يكون المطعم غير مفعّل بعد. تواصل مع إدارة وصلّي.</p>
        <button className="btn-primary w-full mt-6 h-12" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>العودة لتسجيل الدخول</button>
      </div>
    </div>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const [dialog, doLogout] = useLogout();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="min-h-screen" dir="rtl">
      {dialog}
      <Sidebar onLogout={doLogout} />
      <div className="lg:ps-[var(--sidebar-w)]">
        <Header onLogout={doLogout} />
        <main className="page-bottom-space max-w-3xl lg:max-w-6xl mx-auto px-4 pt-4 lg:px-8 lg:pt-6">
          <PushBanner />
          {/* حماية الصفحات: خطأ في صفحة لا يوقف تنبيهات الطلبات والطباعة (LiveOrdersProvider خارج الحماية) */}
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<PageSkeleton cards={4} rows={4} />}>
              <div key={pathname} className="route-enter">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/menu" element={<Menu />} />
                  <Route path="/reviews" element={<Reviews />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      <SupportWidget />
    </div>
  );
}

function Layout() {
  const { restaurant } = useRestaurant();
  if (!restaurant?.id) return <NoRestaurant />;
  return (
    <LiveOrdersProvider>
      <Shell />
    </LiveOrdersProvider>
  );
}

function ProtectedRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" replace />;
}

// زر الرجوع في أندرويد: يغلق النافذة المفتوحة ← يرجع صفحة ← ضغطتان للخروج من الرئيسية
function BackButtonHandler() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  useEffect(() => installBackHandler(navigate, () => pathRef.current), [navigate]);
  return null;
}

// انتهاء الجلسة (401 مؤكَّد بطلب /auth/me) → خروج وتوجيه لصفحة الدخول
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
      <BackButtonHandler />
      <Toaster position="top-center" containerStyle={{ top: 'calc(var(--sat) + 12px)' }}
        toastOptions={{
          className: 'wasaly-toast',
          style: { fontFamily: 'inherit', direction: 'rtl', borderRadius: '16px', fontWeight: 700, fontSize: '14px', color: '#14142B', padding: '10px 14px', maxWidth: 420 },
          success: { iconTheme: { primary: '#1DB954', secondary: '#fff' } },
          error: { iconTheme: { primary: '#F04438', secondary: '#fff' } },
        }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedRoute><RestaurantProvider><Layout /></RestaurantProvider></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
