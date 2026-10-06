import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import {
  FiHome, FiMap, FiPackage, FiShoppingBag, FiGrid, FiTruck, FiUsers, FiMapPin, FiSend,
  FiTrendingUp, FiTag, FiBell, FiImage, FiStar, FiMessageCircle, FiDollarSign, FiLogOut, FiX,
  FiSearch, FiChevronsRight, FiChevronsLeft, FiChevronDown, FiCornerDownLeft, FiWifiOff, FiLayers,
} from 'react-icons/fi';
import Login from './pages/Login';
import PageSkeleton from './components/Skeleton';
import ErrorBoundary from './components/ErrorBoundary';
import { ConfirmProvider, useConfirm, usePresence } from './components/ui';
import { currentAdmin, logout, clearSession } from './utils/session';
import { revokeAndLogout } from './utils/api';
import { fmtToday, normalizeAr } from './utils/format';
import { useOverlay, closeTopOverlay } from './utils/backStack';

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
const MultiRestaurant = lazy(() => import('./pages/MultiRestaurant'));

const LOGO = `${import.meta.env.BASE_URL}logo.png`;

/* شريط الهاتف: 4 تبويبات + «المزيد» */
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
  { to: '/multi-orders', icon: FiLayers, label: 'الطلبات المجمّعة', tint: '#7C3AED' },
  { to: '/coupons', icon: FiTag, label: 'الكوبونات', tint: '#D97706' },
  { to: '/notifications', icon: FiBell, label: 'الإشعارات', tint: '#E11D48' },
  { to: '/banners', icon: FiImage, label: 'الإعلانات', tint: '#7C3AED' },
  { to: '/reviews', icon: FiStar, label: 'التقييمات', tint: '#EAB308' },
  { to: '/chats', icon: FiMessageCircle, label: 'المحادثات', tint: '#0891B2' },
];

const ALL = [...PRIMARY, ...MORE];

/* كلمات بحث إضافية للبحث السريع (تُطبَّع بلا همزات/تاء مربوطة) — A-46 */
const ALIASES = {
  '/': ['لوحة', 'رئيسية', 'ملخص', 'dashboard', 'home'],
  '/live': ['خريطة', 'مباشر', 'عمليات حية', 'تتبع', 'live', 'map'],
  '/orders': ['طلبات', 'اوردر', 'orders'],
  '/restaurants': ['مطاعم', 'متاجر', 'محلات', 'صيدليات', 'stores'],
  '/drivers': ['سائقين', 'سواقين', 'مناديب', 'كباتن', 'drivers'],
  '/users': ['مستخدمين', 'زبائن', 'حسابات', 'عملاء', 'users'],
  '/accounting': ['محاسبه', 'عمولات', 'ارباح', 'مالية', 'فلوس', 'accounting'],
  '/analytics': ['تحليلات', 'احصائيات', 'تقارير', 'analytics'],
  '/zones': ['مناطق', 'اسعار التوصيل', 'رسوم', 'كيلو', 'zones'],
  '/personal-delivery': ['توصيل شخصي', 'طرد', 'راكب', 'مشوار'],
  '/multi-orders': ['مجمعه', 'مجمع', 'عده مطاعم', 'multi'],
  '/coupons': ['كوبونات', 'خصم', 'اكواد', 'coupons'],
  '/notifications': ['اشعارات', 'بث', 'رسائل جماعية', 'notifications'],
  '/banners': ['اعلانات', 'بانرات', 'بنر', 'سلايدر', 'banners'],
  '/reviews': ['تقييمات', 'نجوم', 'ملاحظات', 'reviews'],
  '/chats': ['محادثات', 'دعم', 'شات', 'رسائل', 'support'],
};
const SEARCH_INDEX = ALL.map(i => ({ ...i, hay: normalizeAr([i.label, ...(ALIASES[i.to] || [])].join(' ')) }));
const byTo = Object.fromEntries(ALL.map(i => [i.to, i]));

/* الشريط الجانبي (≥1024px) — أقسام مجمّعة */
const GROUPS = [
  { title: 'نظرة عامة', items: ['/', '/live', '/analytics'] },
  { title: 'العمليات', items: ['/orders', '/multi-orders', '/personal-delivery', '/zones', '/chats'] },
  { title: 'الشركاء', items: ['/restaurants', '/drivers', '/users'] },
  { title: 'التسويق', items: ['/coupons', '/notifications', '/banners', '/reviews'] },
  { title: 'المالية', items: ['/accounting'] },
];

const isActive = (to, pathname) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

function useLogout() {
  const confirm = useConfirm();
  return async (after) => {
    const ok = await confirm({ title: 'تسجيل الخروج', message: 'سيتم مسح البيانات المخزّنة على هذا الجهاز والرجوع لشاشة الدخول.', confirmText: 'خروج', icon: <FiLogOut /> });
    if (!ok) return;
    after?.();
    // إلغاء التوكن عند الخادم أولاً (حد 4 ثوانٍ) — A-14
    const t = toast.loading('جارٍ تسجيل الخروج…');
    try { await revokeAndLogout('manual'); } finally { toast.dismiss(t); }
  };
}

function LiveBadge({ dark }) {
  const online = useOnline();
  return online ? (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${dark ? 'bg-white/10 text-green-300' : 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-200'}`}>
      <span className="live-dot" /> مباشر
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold bg-red-50 text-red-600 ring-1 ring-inset ring-red-200">
      <FiWifiOff /> غير متصل
    </span>
  );
}

/* =====================================================================
   Command palette (Ctrl/⌘+K) — تنقّل سريع بين الأقسام
   ===================================================================== */
function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { mounted, closing } = usePresence(open, 180);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const items = useMemo(() => {
    const s = normalizeAr(q);
    if (!s) return ALL;
    const words = s.split(' ').filter(Boolean);
    return SEARCH_INDEX.filter(i => words.every(w => i.hay.includes(w) || i.hay.includes(w.replace(/^ال/, ''))));
  }, [q]);
  useOverlay(open, onClose);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);

  if (!mounted) return null;
  const go = (to) => { onClose(); navigate(to); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && items[idx]) go(items[idx].to);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]" dir="rtl" role="dialog" aria-modal="true" aria-label="بحث سريع">
      <div className="absolute inset-0 bg-[#14142B]/45 backdrop-blur-[3px]" style={{ animation: closing ? 'fadeOut .18s ease both' : 'fadeIn .18s ease both' }} onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-[22px] shadow-2xl overflow-hidden"
        style={{ animation: closing ? 'dialogOut .16s ease both' : 'dialogIn .3s cubic-bezier(.34,1.36,.64,1) both' }}>
        <div className="flex items-center gap-3 px-4 border-b border-surface-line">
          <FiSearch className="text-ink-3 text-lg flex-shrink-0" />
          <input ref={inputRef} autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="اذهب إلى قسم… (الطلبات، السائقون، المحاسبة)" aria-label="ابحث عن قسم"
            className="flex-1 py-4 bg-transparent outline-none text-[15px] font-medium placeholder:text-ink-4" style={{ boxShadow: 'none' }} />
          <span className="kbd">Esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && <li className="text-center text-sm text-ink-3 py-8">لا توجد نتائج</li>}
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={it.to} role="option" aria-selected={i === idx}>
                <button onMouseEnter={() => setIdx(i)} onClick={() => go(it.to)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right ${i === idx ? 'bg-orange-50' : ''}`}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[17px]" style={{ background: `${it.tint || '#FF6B00'}14`, color: it.tint || '#FF6B00' }}><Icon /></span>
                  <span className={`flex-1 font-bold text-sm ${i === idx ? 'text-brand-700' : 'text-ink'}`}>{it.label}</span>
                  {i === idx && <FiCornerDownLeft className="text-ink-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* =====================================================================
   Mobile: "المزيد" sheet + bottom nav
   ===================================================================== */
function MoreSheet({ open, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const doLogout = useLogout();
  const { mounted, closing } = usePresence(open, 220);
  useOverlay(open, onClose);
  if (!mounted) return null;

  const go = (to) => { onClose(); navigate(to); };

  return (
    <div className="fixed inset-0 z-[60] lg:hidden" dir="rtl">
      <div className="absolute inset-0 bg-[#14142B]/45 backdrop-blur-[3px]" style={{ animation: closing ? 'fadeOut .2s ease both' : 'fadeIn .2s ease both' }} onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 mx-auto max-w-3xl bg-white rounded-t-[30px] shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 88px)', animation: closing ? 'sheetDown .22s cubic-bezier(.4,0,1,1) both' : 'sheetUp .42s cubic-bezier(.2,.9,.25,1.04) both' }}>
        <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mt-2.5" />
        <div className="flex items-center justify-between px-5 pt-3 pb-3">
          <div>
            <h3 className="font-black text-lg text-ink">كل الأقسام</h3>
            <p className="text-[12px] text-ink-3 font-medium">اختر القسم الذي تريد إدارته</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center"><FiX /></button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 px-3 stagger">
          {MORE.map(item => {
            const Icon = item.icon;
            const active = isActive(item.to, pathname);
            return (
              <button key={item.to} onClick={() => go(item.to)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl ${active ? 'bg-orange-50 ring-1 ring-orange-200' : 'active:bg-gray-50'}`}>
                <span className="w-[50px] h-[50px] rounded-[17px] flex items-center justify-center text-[22px]"
                  style={{ background: `linear-gradient(135deg, ${item.tint}1f, ${item.tint}0d)`, color: item.tint }}>
                  <Icon />
                </span>
                <span className={`text-[11px] font-bold leading-tight text-center ${active ? 'text-brand-700' : 'text-ink-2'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="px-4 mt-4">
          <button onClick={() => doLogout(onClose)} className="btn btn-danger w-full btn-lg">
            <FiLogOut /> تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
}

/* تبويب الشريط السفلي — على مستوى الوحدة حتى لا يُعاد إنشاؤه كل render فتعمل حركته — A-45 */
function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 relative min-h-[56px]" aria-current={active ? 'page' : undefined}>
      <span className={`w-12 h-8 rounded-full flex items-center justify-center text-[20px] transition-all duration-300 ease-spring ${active ? 'grad-sunset text-white shadow-brand -translate-y-0.5 scale-105' : 'text-ink-3'}`}>
        <Icon />
      </span>
      <span className={`text-[11px] font-bold transition-colors ${active ? 'text-brand-700' : 'text-ink-3'}`}>{label}</span>
    </button>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some(m => isActive(m.to, pathname));

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  return (
    <div className="lg:hidden">
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <nav aria-label="التنقل الرئيسي" className="fixed bottom-0 inset-x-0 z-[70] glass-light border-t border-white/60 shadow-[0_-8px_30px_rgba(20,20,43,0.08)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex max-w-3xl mx-auto px-1">
          {PRIMARY.map(item => (
            <Tab key={item.to} active={!moreOpen && isActive(item.to, pathname)} onClick={() => { setMoreOpen(false); navigate(item.to); }} icon={item.icon} label={item.label} />
          ))}
          <Tab active={moreOpen || moreActive} onClick={() => setMoreOpen(o => !o)} icon={FiGrid} label="المزيد" />
        </div>
      </nav>
    </div>
  );
}

/* =====================================================================
   Desktop: sidebar + top bar
   ===================================================================== */
function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const doLogout = useLogout();
  const me = currentAdmin();

  return (
    <aside className="hidden lg:flex fixed top-0 bottom-0 right-0 z-50 flex-col grad-ink text-white transition-[width] duration-300 ease-lux"
      style={{ width: collapsed ? 84 : 'var(--sidebar-w)' }} aria-label="القائمة الجانبية">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-16 w-64 h-64 rounded-full bg-[#FF6B00]/20 blur-3xl" />
        <div className="absolute bottom-10 -right-20 w-56 h-56 rounded-full bg-[#F53B57]/10 blur-3xl" />
      </div>

      <div className={`relative flex items-center gap-3 h-[72px] ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
        <img src={LOGO} alt="وصلّي" className="w-10 h-10 rounded-[13px] object-cover shadow-brand ring-1 ring-white/20 flex-shrink-0" />
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <p className="font-black text-[19px] leading-none">وصلّي</p>
            <p className="text-[11px] text-white/45 font-bold mt-1">مركز العمليات</p>
          </div>
        )}
      </div>

      <nav className="relative flex-1 overflow-y-auto no-scrollbar px-3 pb-4 pt-1">
        {GROUPS.map(g => (
          <div key={g.title} className="mb-4">
            {collapsed ? <div className="h-px bg-white/10 mx-3 my-3" />
              : <p className="px-3 mb-1.5 text-[10.5px] font-extrabold text-white/35">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map(to => {
                const it = byTo[to]; const Icon = it.icon; const active = isActive(to, pathname);
                return (
                  <button key={to} onClick={() => navigate(to)} title={collapsed ? it.label : undefined} aria-current={active ? 'page' : undefined}
                    className={`side-link ${active ? 'active' : ''} ${collapsed ? 'justify-center !px-0' : ''}`}>
                    <span className="side-ico"><Icon /></span>
                    {!collapsed && <span className="truncate">{it.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative p-3 border-t border-white/10">
        {!collapsed ? (
          <div className="flex items-center gap-3 rounded-2xl bg-white/[.06] p-2.5">
            <div className="w-9 h-9 rounded-xl grad-sunset flex items-center justify-center font-black text-sm flex-shrink-0">م</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-none truncate">المدير العام</p>
              <p className="text-[10.5px] text-white/40 mt-1 truncate">ID · {me?.id ?? '—'}</p>
            </div>
            <button onClick={() => doLogout()} aria-label="تسجيل الخروج" title="تسجيل الخروج" className="w-9 h-9 rounded-xl text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center"><FiLogOut /></button>
          </div>
        ) : (
          <button onClick={() => doLogout()} aria-label="تسجيل الخروج" title="تسجيل الخروج" className="w-full h-10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center"><FiLogOut /></button>
        )}
        <button onClick={onToggle} aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'} title={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          className="mt-2 w-full h-9 rounded-xl text-white/45 hover:text-white hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-bold">
          {collapsed ? <FiChevronsLeft /> : <><FiChevronsRight /> طي القائمة</>}
        </button>
      </div>
    </aside>
  );
}

function AdminMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const doLogout = useLogout();
  const me = currentAdmin();
  useOverlay(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2 rounded-2xl pl-2 pr-1 py-1 hover:bg-surface-sunken">
        <span className="w-9 h-9 rounded-xl grad-sunset text-white flex items-center justify-center font-black text-sm shadow-brand">م</span>
        <span className="text-right leading-none hidden xl:block">
          <span className="block text-sm font-extrabold text-ink">المدير</span>
          <span className="block text-[10.5px] text-ink-3 mt-1">صلاحيات كاملة</span>
        </span>
        <FiChevronDown className={`text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full mt-2 w-60 bg-white rounded-2xl shadow-lift border border-surface-line p-2 animate-pop origin-top-left z-50">
          <div className="px-3 py-2.5">
            <p className="font-extrabold text-sm text-ink">المدير العام</p>
            <p className="text-[11px] text-ink-3 mt-0.5">ID · {me?.id ?? '—'}</p>
          </div>
          <div className="divider my-1" />
          <button role="menuitem" onClick={() => { setOpen(false); doLogout(); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50">
            <FiLogOut /> تسجيل الخروج
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar({ current, onSearch }) {
  return (
    <header className="hidden lg:block sticky top-0 z-40 glass-light border-b border-surface-line/80" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="h-[68px] px-8 flex items-center gap-5 max-w-[1500px] mx-auto">
        <div className="min-w-0">
          <p className="text-[11px] text-ink-3 font-bold">لوحة الإدارة <span className="mx-1 text-ink-4">/</span> {fmtToday()}</p>
          <h1 className="font-black text-ink text-lg leading-tight truncate">{current?.label || 'الرئيسية'}</h1>
        </div>
        <button onClick={onSearch} className="mr-auto flex items-center gap-3 w-[340px] xl:w-[420px] h-11 rounded-2xl bg-surface-sunken/80 border border-transparent hover:border-surface-line hover:bg-white px-4 text-ink-3 text-sm font-medium">
          <FiSearch className="text-base" />
          <span className="flex-1 text-right">ابحث أو انتقل إلى قسم…</span>
          <span className="kbd" dir="ltr">Ctrl K</span>
        </button>
        <LiveBadge />
        <div className="w-px h-8 bg-surface-line" />
        <AdminMenu />
      </div>
    </header>
  );
}

function MobileHeader({ current, onSearch }) {
  return (
    <header className="lg:hidden sticky top-0 z-40 glass-light border-b border-white/70"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', boxShadow: '0 4px 24px rgba(20,20,43,0.05)' }}>
      <div className="max-w-3xl mx-auto px-4 pb-2.5 flex items-center gap-3">
        <img src={LOGO} alt="وصلّي" className="w-10 h-10 rounded-[13px] object-cover shadow-brand" />
        <div className="flex-1 min-w-0">
          <p className="font-black text-ink leading-none text-[17px]">وصلّي <span className="text-[11px] font-bold text-ink-3">· الإدارة</span></p>
          <p key={current?.to} className="text-[12px] text-brand-600 font-extrabold mt-1 truncate animate-fade-in">{current?.label || 'الرئيسية'}</p>
        </div>
        <LiveBadge />
        <button onClick={onSearch} aria-label="بحث سريع" className="icon-btn !w-10 !h-10 !rounded-full"><FiSearch /></button>
      </div>
      <div className="h-[2px] grad-sunset opacity-80" />
    </header>
  );
}

/**
 * زر الرجوع في أندرويد (MainActivity يستدعي window.__wasalyBack):
 * 1) يغلق النافذة العليا  2) يرجع صفحة للخلف  3) من الرئيسية → يصغّر التطبيق بدل إغلاقه — X-04
 */
function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const locRef = useRef(location);
  locRef.current = location;
  useEffect(() => {
    window.__wasalyNav = () => {
      const l = locRef.current;
      if (l.key && l.key !== 'default') { navigate(-1); return true; }
      if (l.pathname !== '/') { navigate('/', { replace: true }); return true; }
      return false;
    };
    return () => { delete window.__wasalyNav; };
  }, [navigate]);
}

function AppLayout() {
  useBackNavigation();
  const { pathname } = useLocation();
  const current = ALL.find(i => isActive(i.to, pathname));
  const [collapsed, setCollapsed] = useState(() => ls.get('adm_sidebar') === '1');
  const [palette, setPalette] = useState(false);
  useEffect(() => { window.scrollTo(0, 0); setPalette(false); }, [pathname]);
  useEffect(() => { ls.set('adm_sidebar', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { document.title = `${current?.label || 'الرئيسية'} · وصلّي`; }, [current]);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-surface" dir="rtl" style={{ '--sb': collapsed ? '84px' : 'var(--sidebar-w)' }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="lg:pr-[var(--sb)] transition-[padding] duration-300 ease-lux">
        <MobileHeader current={current} onSearch={() => setPalette(true)} />
        <TopBar current={current} onSearch={() => setPalette(true)} />
        <main className="max-w-3xl lg:max-w-[1500px] mx-auto pb-[calc(env(safe-area-inset-bottom)+96px)] lg:pb-10">
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<div className="p-4 lg:p-8"><PageSkeleton cards={4} rows={6} /></div>}>
              <div key={pathname} className="route-in">
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
                  <Route path="/multi-orders" element={<MultiRestaurant />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

const toasterProps = {
  position: 'top-center',
  containerStyle: { top: 'calc(env(safe-area-inset-top) + 14px)' },
  toastOptions: {
    className: 'lux-toast',
    duration: 3200,
    success: { iconTheme: { primary: '#1DB954', secondary: '#fff' } },
    error: { iconTheme: { primary: '#F04438', secondary: '#fff' } },
  },
};

export default function App() {
  const [user, setUser] = useState(() => {
    const u = currentAdmin();
    if (!u) clearSession();
    return u;
  });

  // إخفاء شاشة البداية فور جاهزية التطبيق
  useEffect(() => { window.__hideSplash?.(); }, []);

  // جسر زر الرجوع (أندرويد) — يرجّع true إن عالجه التطبيق، false → يصغّر التطبيق
  useEffect(() => {
    window.__wasalyBack = () => {
      if (closeTopOverlay()) return true;
      return typeof window.__wasalyNav === 'function' ? !!window.__wasalyNav() : false;
    };
    return () => { delete window.__wasalyBack; };
  }, []);

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
