import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { FiEye, FiEyeOff, FiX, FiAlertTriangle, FiSearch, FiInbox, FiRefreshCw, FiArrowUpRight, FiArrowDownRight, FiWifiOff, FiClock, FiCheckCircle, FiCoffee, FiShoppingBag, FiTruck, FiCheck, FiXCircle } from 'react-icons/fi';
import { Sk } from './Skeleton';
import { statusMeta, statusLabel } from '../utils/format';
import { pushOverlay, isTopOverlay } from '../utils/backStack';

/* =====================================================================
   Hooks
   ===================================================================== */
export function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    const on = () => setR(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return r;
}

export function useMediaQuery(q) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}

/** setInterval يتوقف تلقائياً عندما يكون التطبيق/التبويب مخفياً، ويحدّث فور العودة */
export function useVisiblePolling(fn, ms, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let t = null;
    const tick = () => ref.current?.();
    const start = () => { if (!t) t = setInterval(tick, ms); };
    const stop = () => { clearInterval(t); t = null; };
    const onVis = () => { if (document.hidden) stop(); else { tick(); start(); } };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [ms, enabled]);
}

/** يُبقي العنصر مركّباً أثناء حركة الخروج */
export function usePresence(open, ms = 220) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, ms);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return { mounted, closing };
}

/** عدّاد رقمي متحرك (easeOutCubic) — يحترم تقليل الحركة */
export function useCountUp(target, duration = 900) {
  const reduce = useReducedMotion();
  const to = Number(target) || 0;
  const [val, setVal] = useState(reduce ? to : 0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (reduce) { setVal(to); fromRef.current = to; return; }
    const from = fromRef.current;
    if (from === to) { setVal(to); return; }
    let raf; const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = to; };
  }, [to, duration, reduce]);
  return val;
}

export function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '', className = '', duration }) {
  const v = useCountUp(value, duration);
  const txt = Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className={`num ${className}`}>{prefix}{txt}{suffix}</span>;
}

/* =====================================================================
   Overlay: Modal / Bottom-sheet / Drawer  (portal فوق شريط التنقل)
   variant: 'dialog' (افتراضي: شيت سفلي على الهاتف، نافذة وسط على الشاشات)
            'drawer' (شيت سفلي على الهاتف، درج جانبي على ≥1024px)
   ===================================================================== */
const FOCUSABLE ='a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', dismissable = true, variant = 'dialog', icon }) {
  const { mounted, closing } = usePresence(open, 220);
  const panelRef = useRef(null);
  const lastFocus = useRef(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isSm = useMediaQuery('(min-width: 640px)');
  const labelId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissableRef = useRef(dismissable);
  dismissableRef.current = dismissable;

  useEffect(() => {
    if (!open) return;
    // زر الرجوع (أندرويد) و Esc يغلقان النافذة العليا فقط
    const token = pushOverlay(() => { if (dismissableRef.current) onCloseRef.current?.(); });
    lastFocus.current = document.activeElement;
    const onKey = (e) => {
      if (!isTopOverlay(token)) return; // فقط النافذة العليا
      if (e.key === 'Escape' && dismissable) { e.stopPropagation(); onCloseRef.current?.(); }
      if (e.key === 'Tab' && panelRef.current) {
        const els = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => { if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus({ preventScroll: true }); }, 40);
    return () => {
      clearTimeout(t);
      token.remove();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      try { lastFocus.current?.focus?.({ preventScroll: true }); } catch { /* ignore */ }
    };
  }, [open, dismissable]);

  if (!mounted) return null;
  const drawer = variant === 'drawer' && isDesktop;
  const sheet = !drawer && !isSm;
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : size === 'xl' ? 'sm:max-w-4xl' : 'sm:max-w-lg';

  const anim = drawer
    ? (closing ? 'drawerOut .22s cubic-bezier(.4,0,1,1) both' : 'drawerIn .42s cubic-bezier(.2,.9,.25,1.05) both')
    : sheet
      ? (closing ? 'sheetDown .22s cubic-bezier(.4,0,1,1) both' : 'sheetUp .42s cubic-bezier(.2,.9,.25,1.04) both')
      : (closing ? 'dialogOut .18s ease both' : 'dialogIn .34s cubic-bezier(.34,1.36,.64,1) both');

  const panelCls = drawer
    ? 'absolute top-0 bottom-0 left-0 w-full max-w-[560px] rounded-r-[28px]'
    : `relative w-full ${width} rounded-t-[28px] sm:rounded-[24px] max-h-[92vh]`;

  return createPortal(
    <div className={`fixed inset-0 z-[100] flex ${drawer ? '' : 'items-end sm:items-center justify-center sm:p-6'}`} dir="rtl">
      <div className="absolute inset-0 bg-[#14142B]/50 backdrop-blur-[3px]" style={{ animation: closing ? 'fadeOut .2s ease both' : 'fadeIn .2s ease both' }}
        onClick={() => dismissable && onClose?.()} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? labelId : undefined} tabIndex={-1}
        className={`${panelCls} bg-white shadow-2xl flex flex-col outline-none`}
        style={{ animation: anim, paddingBottom: drawer ? 0 : 'env(safe-area-inset-bottom)' }}>
        {sheet && <div className="w-10 h-1.5 bg-gray-200 rounded-full mx-auto mt-2.5 flex-shrink-0" />}
        {(title || dismissable) && (
          <div className={`flex items-start gap-3 px-5 sm:px-6 ${drawer ? 'pt-6 pb-4 border-b border-surface-line' : 'pt-4 sm:pt-5 pb-3'}`}
            style={drawer ? { paddingTop: 'calc(env(safe-area-inset-top) + 24px)' } : undefined}>
            {icon && <div className="w-10 h-10 rounded-2xl grad-sunset text-white flex items-center justify-center text-lg shadow-brand flex-shrink-0">{icon}</div>}
            <div className="flex-1 min-w-0">
              {title && <h3 id={labelId} className="font-black text-lg text-ink leading-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-ink-3 font-medium mt-1">{subtitle}</p>}
            </div>
            {dismissable && (
              <button onClick={onClose} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-surface-sunken text-ink-2 hover:bg-gray-200 flex items-center justify-center flex-shrink-0">
                <FiX />
              </button>
            )}
          </div>
        )}
        <div className={`px-5 sm:px-6 overflow-y-auto overscroll-contain flex-1 ${drawer ? 'py-5' : 'pb-5'}`}>{children}</div>
        {footer && <div className={`px-5 sm:px-6 pt-3 pb-4 border-t border-surface-line bg-white/95 ${drawer ? '' : 'rounded-b-[24px]'}`}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
export const Sheet = (p) => <Modal variant="drawer" {...p} />;

/* ---------- Confirm dialog (بديل window.confirm) ---------- */
const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve;
    setState(typeof opts === 'string' ? { message: opts } : opts);
    setOpen(true);
  }), []);

  const close = (val) => { resolver.current?.(val); resolver.current = null; setOpen(false); };

  const danger = state?.danger !== false;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={open} onClose={() => close(false)} size="sm" dismissable>
        {state && (
          <div className="text-center pt-1">
            <div className="relative w-[72px] h-[72px] mx-auto mb-4">
              <div className={`absolute inset-0 rounded-[24px] rotate-6 ${danger ? 'bg-red-100' : 'bg-orange-100'}`} />
              <div className={`relative w-full h-full rounded-[24px] flex items-center justify-center text-3xl animate-pop ${danger ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-[0_12px_28px_rgba(240,68,56,.35)]' : 'grad-sunset text-white shadow-brand'}`}>
                {state.icon || <FiAlertTriangle />}
              </div>
            </div>
            <h3 className="font-black text-xl text-ink">{state.title || 'تأكيد الإجراء'}</h3>
            {state.message && <p className="text-sm text-ink-2 mt-2 leading-relaxed whitespace-pre-line">{state.message}</p>}
            <div className="grid grid-cols-2 gap-2.5 mt-6">
              <button onClick={() => close(true)} className={`btn btn-lg ${danger ? 'btn-danger-solid' : 'btn-primary'}`}>
                {state.confirmText || 'تأكيد'}
              </button>
              <button onClick={() => close(false)} className="btn btn-lg btn-secondary">
                {state.cancelText || 'إلغاء'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  return ctx || (async (o) => window.confirm(typeof o === 'string' ? o : (o?.message || o?.title || 'تأكيد؟')));
}

/* =====================================================================
   Layout primitives
   ===================================================================== */
export function PageHeader({ title, subtitle, icon, action, eyebrow }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {icon && (
        <div className="w-12 h-12 rounded-[16px] grad-sunset text-white flex items-center justify-center text-[22px] shadow-brand sheen flex-shrink-0">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        {eyebrow && <p className="text-[11px] font-extrabold text-brand-600 mb-0.5">{eyebrow}</p>}
        <h1 className="text-[22px] sm:text-2xl font-black text-ink leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-[13px] text-ink-3 font-medium mt-0.5 truncate">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
    </div>
  );
}

export function SectionHeader({ title, hint, action, className = '' }) {
  return (
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="panel-title truncate">{title}</h2>
        {hint && <p className="text-[11.5px] text-ink-3 font-medium mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ as: Tag = 'div', className = '', hover = false, children, ...p }) {
  return <Tag {...p} className={`card ${hover ? 'card-hover' : ''} ${className}`}>{children}</Tag>;
}

export function Button({ variant = 'primary', size, loading, icon, children, className = '', ...p }) {
  const v = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', soft: 'btn-soft', danger: 'btn-danger', 'danger-solid': 'btn-danger-solid', dark: 'btn-dark' }[variant] || 'btn-primary';
  const s = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  return (
    <button {...p} disabled={p.disabled || loading} aria-busy={loading || undefined} className={`btn ${v} ${s} ${className}`}>
      {loading ? <Spinner light={variant === 'primary' || variant === 'danger-solid' || variant === 'dark'} /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ light, className = '' }) {
  return <span className={`inline-block w-4 h-4 rounded-full border-2 animate-spin ${light ? 'border-white/40 border-t-white' : 'border-orange-200 border-t-orange-500'} ${className}`} aria-hidden="true" />;
}

export function IconButton({ label, children, className = '', ...p }) {
  return <button {...p} aria-label={label} title={label} className={`icon-btn ${className}`}>{children}</button>;
}

export function PrimaryBtn({ children, className = '', ...p }) {
  return <button {...p} className={`btn btn-primary ${className}`}>{children}</button>;
}
export function SoftBtn({ children, className = '', ...p }) {
  return <button {...p} className={`btn btn-secondary ${className}`}>{children}</button>;
}

/* =====================================================================
   Form bits
   ===================================================================== */
/**
 * Field: label حول حقل واحد. لمجموعة أزرار (اختيار نوع/دور/جمهور) مرّر as="group"
 * حتى لا يؤدي الضغط على العنوان أو الفراغات إلى اختيار أول زر بالخطأ — A-11
 */
export function Field({ label, hint, error, children, as }) {
  const group = as === 'group' || as === 'div';
  const labelId = useId();
  const Tag = group ? 'div' : 'label';
  const extra = group ? { role: 'group', 'aria-labelledby': label ? labelId : undefined } : {};
  return (
    <Tag className="block" {...extra}>
      {label && <span id={group ? labelId : undefined} className="lbl">{label}{hint && <span className="text-ink-3 font-medium mr-1">{hint}</span>}</span>}
      {children}
      {error && <span className="flex items-center gap-1 text-[11.5px] text-red-500 font-bold mt-1.5" role="alert"><FiAlertTriangle className="text-[11px]" />{error}</span>}
    </Tag>
  );
}

export function PasswordInput({ value, onChange, placeholder = 'كلمة المرور', autoComplete = 'new-password', className = '', ...p }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...p} type={show ? 'text' : 'password'} className={`inp pl-12 ${className}`} value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete} dir="ltr" style={{ textAlign: 'right' }} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl text-ink-3 hover:text-ink hover:bg-surface-sunken flex items-center justify-center">
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'بحث...', loading, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <FiSearch className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
      <input type="search" className="inp pr-10 pl-10" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} aria-label={placeholder} />
      {loading ? <span className="absolute left-3.5 top-1/2 -translate-y-1/2"><Spinner /></span>
        : value ? (
          <button type="button" onClick={() => onChange('')} aria-label="مسح البحث"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-surface-sunken text-ink-3 hover:text-ink flex items-center justify-center text-sm"><FiX /></button>
        ) : null}
    </div>
  );
}

/* ---------- Chips (filter pills) ---------- */
export function Chips({ options, value, onChange, brand = false }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap no-scrollbar" role="tablist">
      {options.map(([val, label, count]) => {
        const on = value === val;
        return (
          <button key={val} role="tab" aria-selected={on} onClick={() => onChange(val)} className={`chip ${brand ? 'chip-brand' : ''} ${on ? 'chip-on' : ''}`}>
            {label}{count != null && <span className="chip-count num">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Segmented control (thumb ينزلق بنابض) ---------- */
export function Segmented({ options, value, onChange, className = '', full = false, size }) {
  const wrap = useRef(null);
  const [thumb, setThumb] = useState(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector(`[data-val="${CSS.escape(String(value))}"]`);
    if (!el || !wrap.current) return setThumb(null);
    const W = wrap.current.getBoundingClientRect(), r = el.getBoundingClientRect();
    setThumb({ right: W.right - r.right, width: r.width });
  }, [value, options.length]);
  useEffect(() => {
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      const el = wrap.current?.querySelector(`[data-val="${CSS.escape(String(value))}"]`);
      if (!el || !wrap.current) return;
      const W = wrap.current.getBoundingClientRect(), r = el.getBoundingClientRect();
      setThumb({ right: W.right - r.right, width: r.width });
    }) : null;
    if (ro && wrap.current) ro.observe(wrap.current);
    return () => ro?.disconnect();
  }, [value]);
  return (
    <div ref={wrap} className={`seg ${full ? 'flex w-full' : ''} ${className}`} role="tablist">
      {thumb && <span className="seg-thumb" style={{ right: thumb.right, width: thumb.width }} aria-hidden="true" />}
      {options.map(([val, label]) => (
        <button key={val} type="button" data-val={val} role="tab" aria-selected={value === val} aria-pressed={value === val}
          onClick={() => onChange(val)} className={`seg-btn ${size === 'sm' ? '!py-1.5 !text-xs !min-h-0' : ''}`}>{label}</button>
      ))}
    </div>
  );
}
export const Tabs = Segmented;

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-pressed={!!checked} aria-label={label} disabled={disabled}
      onClick={() => onChange?.(!checked)} className="switch disabled:opacity-50">
      <span />
    </button>
  );
}

/* ---------- Badges & status ---------- */
export function Badge({ className = '', children }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10.5px] font-extrabold ring-1 ring-inset whitespace-nowrap ${className}`}>{children}</span>;
}

const STATUS_ICONS = { clock: FiClock, check: FiCheckCircle, prep: FiCoffee, bag: FiShoppingBag, truck: FiTruck, done: FiCheck, x: FiXCircle };

/** شارة الحالة: لون + أيقونة + نص (التسمية حسب نوع الطلب إن مُرّر order) — X-09 / X-10 */
export function StatusChip({ status, size = 'md', order, label }) {
  const m = statusMeta(status);
  const Icon = STATUS_ICONS[m.icon];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-extrabold ring-1 ring-inset whitespace-nowrap ${m.cls} ${size === 'sm' ? 'px-2 py-[2px] text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}>
      {Icon ? <Icon className="flex-shrink-0" style={{ color: m.color }} aria-hidden="true" />
        : <span className="w-2 h-2 rounded-full" style={{ background: m.color, width: 7, height: 7 }} />}
      {label || statusLabel(status, order)}
    </span>
  );
}

export function Avatar({ name, src, size = 44, tint = '#FF6B00', status, rounded = 14 }) {
  const initial = (name || '؟').trim()[0] || '؟';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" style={{ borderRadius: rounded }} />
        : (
          <div className="w-full h-full flex items-center justify-center font-black" style={{ borderRadius: rounded, background: `${tint}17`, color: tint, fontSize: size * 0.4 }}>
            {initial}
          </div>
        )}
      {status && <span className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full ring-[2.5px] ring-white ${status === 'online' ? 'bg-ok' : status === 'busy' ? 'bg-brand-500' : 'bg-gray-300'}`} />}
    </div>
  );
}

/* =====================================================================
   States
   ===================================================================== */
export function EmptyState({ icon, title, hint, action, compact }) {
  return (
    <div className={`card text-center px-6 ${compact ? 'py-8' : 'py-14'} animate-fade-up`}>
      <div className="relative w-20 h-20 mx-auto mb-4">
        <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-orange-200/70 to-rose-200/60 blur-xl" />
        <div className="relative w-full h-full rounded-[26px] bg-gradient-to-br from-[#FFF3EA] to-white ring-1 ring-orange-100 flex items-center justify-center text-[34px] text-brand-500 shadow-soft">
          {icon || <FiInbox />}
        </div>
      </div>
      <p className="font-black text-ink text-[17px]">{title}</p>
      {hint && <p className="text-[13px] text-ink-3 mt-1.5 leading-relaxed max-w-xs mx-auto">{hint}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'تعذّر تحميل البيانات', hint = 'تحقق من الاتصال ثم أعد المحاولة.', onRetry }) {
  return (
    <EmptyState icon={<FiWifiOff className="text-red-400" />} title={title} hint={hint}
      action={onRetry && <Button variant="secondary" icon={<FiRefreshCw />} onClick={onRetry}>إعادة المحاولة</Button>} />
  );
}

export function ListSkeleton({ rows = 6, grid = false }) {
  return (
    <div className={grid ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-3" style={{ opacity: 1 - i * 0.08 }}>
          <Sk w={44} h={44} r={14} />
          <div className="flex-1 space-y-2"><Sk w="50%" h={14} /><Sk w="30%" h={11} /></div>
          <Sk w={64} h={24} r={999} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-[#FAFBFD] border-b border-surface-line px-4 py-3 flex gap-6">{Array.from({ length: cols }).map((_, i) => <Sk key={i} w={70} h={10} />)}</div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex items-center gap-6 border-b border-[#F3F4F8] last:border-0">
          <Sk w={36} h={36} r={12} /><Sk w="22%" h={12} /><Sk w="14%" h={12} /><Sk w="12%" h={12} /><div className="flex-1" /><Sk w={70} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

export function LoadMore({ shown, total, onMore, loading }) {
  if (shown >= total && !loading) return null;
  return (
    <button onClick={onMore} disabled={loading}
      className="w-full py-3.5 rounded-2xl bg-white border border-dashed border-orange-200 text-brand-600 font-extrabold text-sm hover:bg-orange-50/60 hover:border-orange-300 disabled:opacity-60 flex items-center justify-center gap-2">
      {loading ? <><Spinner /> جاري التحميل…</> : `تحميل المزيد${total > shown && Number.isFinite(total) ? ` (${total - shown} متبقٍ)` : ''}`}
    </button>
  );
}

/* =====================================================================
   Data viz bits
   ===================================================================== */
export function Sparkline({ data = [], color = '#FF6B00', height = 36, width = 120, fill = true, className = '' }) {
  const id = useId().replace(/:/g, '');
  const vals = data.map(v => Number(v) || 0);
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const step = width / (vals.length - 1);
  const pts = vals.map((v, i) => [i * step, height - 3 - ((v - min) / span) * (height - 6)]); // محور زمني LTR مثل الرسوم البيانية
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} style={{ width: '100%', height }} aria-hidden="true">
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#sg${id})`} className="animate-[fadeIn_.8s_ease_both]" />}
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        style={{ strokeDasharray: 400, '--len': 400, animation: 'drawLine 1.1s cubic-bezier(.2,.8,.2,1) both' }} />
    </svg>
  );
}

export function Trend({ value, suffix = '%' }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold num ${up ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
      {up ? <FiArrowUpRight /> : <FiArrowDownRight />}{Math.abs(value).toFixed(0)}{suffix}
    </span>
  );
}

/** KPI tile: أيقونة + عدّاد متحرك + اتجاه + سبارك لاين */
export function KpiTile({ label, value, icon, tint = '#FF6B00', decimals = 0, suffix = '', prefix = '', trend, spark, hint, onClick, loading }) {
  const Tag = onClick ? 'button' : 'div';
  const numeric = typeof value === 'number' || (value !== '' && value != null && !isNaN(Number(value)));
  return (
    <Tag onClick={onClick} className={`card ${onClick ? 'card-hover cursor-pointer' : ''} relative overflow-hidden p-4 text-right w-full group`}>
      <div className="absolute -left-8 -top-10 w-28 h-28 rounded-full opacity-[.08] transition-transform duration-500 group-hover:scale-125" style={{ background: tint }} />
      <div className="flex items-center justify-between gap-2 relative">
        <div className="w-10 h-10 rounded-[13px] flex items-center justify-center text-lg" style={{ background: `${tint}16`, color: tint }}>{icon}</div>
        {trend != null && <Trend value={trend} />}
        {onClick && trend == null && <FiArrowUpRight className="text-ink-4 group-hover:text-ink-2 transition-colors -scale-x-100" />}
      </div>
      <p className="text-ink-3 text-[12px] font-bold mt-3 relative truncate">{label}</p>
      {loading ? <Sk w="55%" h={26} className="mt-1" /> : (
        <p className="text-[26px] leading-tight font-black mt-0.5 text-ink relative">
          {numeric ? <AnimatedNumber value={Number(value)} decimals={decimals} prefix={prefix} suffix={suffix} /> : (value ?? '—')}
        </p>
      )}
      {hint && <p className="text-[11px] text-ink-3 font-medium mt-0.5 relative truncate">{hint}</p>}
      {spark?.length > 1 && <div className="mt-2 -mx-1 relative"><Sparkline data={spark} color={tint} height={34} /></div>}
    </Tag>
  );
}

/** StatTile — بلاطة متدرّجة مدمجة (يبقى نفس الـAPI) */
export function StatTile({ label, value, tone = 'orange', icon, hint }) {
  const tones = {
    orange: 'from-[#FF8A00] via-[#FF5E3A] to-[#F53B57]',
    green: 'from-emerald-500 to-green-600',
    violet: 'from-violet-500 to-purple-600',
    blue: 'from-sky-500 to-blue-600',
    slate: 'from-slate-700 to-slate-900',
  };
  const numeric = typeof value === 'number';
  return (
    <div className={`sheen relative overflow-hidden rounded-[18px] p-3.5 sm:p-4 text-white bg-gradient-to-br ${tones[tone] || tones.orange} shadow-card`}>
      <div className="absolute -left-6 -bottom-8 w-20 h-20 rounded-full bg-white/10" />
      <div className="absolute left-6 -top-6 w-12 h-12 rounded-full bg-white/10" />
      <p className="text-white/85 text-[11.5px] font-bold flex items-center gap-1 relative truncate">{icon}{label}</p>
      <p className="text-2xl sm:text-[26px] font-black mt-0.5 relative leading-tight">{numeric ? <AnimatedNumber value={value} /> : value}</p>
      {hint && <p className="text-white/70 text-[10.5px] font-semibold mt-0.5 relative leading-snug">{hint}</p>}
    </div>
  );
}

/** Recharts tooltip موحّد */
export function ChartTooltip({ active, payload, label, fmt = (v) => v, labelFmt = (l) => l, name }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl bg-[#14142B] text-white px-3.5 py-2.5 shadow-lift text-right" dir="rtl">
      <p className="text-[11px] text-white/60 font-bold">{labelFmt(label)}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-black num flex items-center gap-1.5 mt-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.payload?.color || '#FF8A00' }} />
          {name || p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

/* =====================================================================
   DataTable — رأس ثابت، تمرير أفقي، صفوف قابلة للنقر
   columns: [{ key, header, render?(row), align?: 'end'|'center', className?, width? }]
   ===================================================================== */
export function DataTable({ columns, rows, rowKey = (r) => r.id, onRowClick, footer, maxHeight, dim }) {
  return (
    <div className={`card overflow-hidden ${dim ? 'opacity-70' : ''} transition-opacity`}>
      <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="dt">
          <thead>
            <tr>{columns.map(c => <th key={c.key} style={{ width: c.width, textAlign: c.align === 'end' ? 'left' : c.align === 'center' ? 'center' : 'right' }}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={rowKey(r, i)} className={onRowClick ? 'dt-click' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}>
                {columns.map(c => (
                  <td key={c.key} className={c.className || ''} style={{ textAlign: c.align === 'end' ? 'left' : c.align === 'center' ? 'center' : 'right' }}>
                    {c.render ? c.render(r, i) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot><tr>{footer}</tr></tfoot>}
        </table>
      </div>
    </div>
  );
}
