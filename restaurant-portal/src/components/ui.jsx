import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiRefreshCw, FiAlertTriangle, FiX, FiCheck, FiTrendingUp, FiTrendingDown } from 'react-icons/fi';

// ═══════════════════════════════════════════════════════════════
//  مجموعة مكوّنات وصلّي (UI kit) — بوابة المطعم
// ═══════════════════════════════════════════════════════════════

export const cx = (...a) => a.filter(Boolean).join(' ');

// ─── مكدّس النوافذ المفتوحة (Sheet / الدعم …): Esc وزر الرجوع يغلقان الأعلى فقط ───
const overlayStack = [];
export const hasOverlay = () => overlayStack.length > 0;
export function closeTopOverlay() {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return false;
  try { top.close(); } catch {}
  return true;
}
export function useOverlay(open, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!open) return;
    const entry = { close: () => ref.current && ref.current() };
    overlayStack.push(entry);
    const onKey = (e) => {
      if (e.key !== 'Escape' || overlayStack[overlayStack.length - 1] !== entry) return;
      e.stopPropagation();
      entry.close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      const i = overlayStack.lastIndexOf(entry);
      if (i >= 0) overlayStack.splice(i, 1);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
}

export const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export function useMediaQuery(query) {
  const get = () => { try { return window.matchMedia(query).matches; } catch { return false; } };
  const [m, setM] = useState(get);
  useEffect(() => {
    let mq; try { mq = window.matchMedia(query); } catch { return; }
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on));
  }, [query]);
  return m;
}

// ─── عنوان الصفحة ───
export function PageHeader({ title, subtitle, icon: Icon, onRefresh, refreshing, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-11 h-11 rounded-[14px] bg-white border border-surface-line shadow-soft text-brand-600 flex items-center justify-center flex-shrink-0">
            <Icon size={20} aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[22px] lg:text-2xl font-extrabold text-ink leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-[12.5px] text-ink-3 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {children}
        {onRefresh && <RefreshButton onClick={onRefresh} spinning={refreshing} />}
      </div>
    </div>
  );
}

export function RefreshButton({ onClick, spinning, label = 'تحديث' }) {
  return (
    <button onClick={onClick} disabled={spinning} aria-label={label} title={label} className="btn-icon shadow-soft">
      <FiRefreshCw size={17} className={spinning ? 'spin' : ''} aria-hidden />
    </button>
  );
}

// ─── زر موحّد: variants + حالة تحميل + حالة نجاح ───
const BTN_VARIANT = {
  primary: 'btn-primary', ghost: 'btn-ghost', soft: 'btn-soft', danger: 'btn-danger',
  success: 'btn-success', dark: 'btn-dark',
  sky: 'btn text-white bg-info shadow-[0_10px_22px_rgba(46,144,250,.25)]',
  teal: 'btn text-white bg-teal-500 shadow-[0_10px_22px_rgba(20,184,166,.25)]',
  violet: 'btn text-white bg-violet-500 shadow-[0_10px_22px_rgba(139,92,246,.25)]',
};
const BTN_SIZE = { sm: 'h-9 px-3 text-xs rounded-xl', md: '', lg: 'h-[52px] px-5 text-[15px] rounded-2xl' };

export function Button({ variant = 'primary', size = 'md', loading = false, success = false, icon: Icon, children, className = '', block, ...rest }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined}
      className={cx(BTN_VARIANT[variant] || BTN_VARIANT.primary, BTN_SIZE[size], block && 'w-full', 'relative', className)}>
      {/* المحتوى يبقى في مكانه (شفاف) أثناء التحميل للحفاظ على عرض الزر */}
      <span className={cx('inline-flex items-center justify-center gap-2', (loading || success) && 'opacity-0')}>
        {Icon && <Icon size={size === 'sm' ? 14 : 17} aria-hidden />}
        {children}
      </span>
      {loading && <span className="absolute inset-0 flex items-center justify-center"><Spinner size={size === 'sm' ? 14 : 18} /></span>}
      {success && !loading && <span className="absolute inset-0 flex items-center justify-center gap-1.5"><FiCheck size={18} className="animate-check" aria-hidden /> تم</span>}
    </button>
  );
}

// ─── بطاقة ───
export function Card({ as: Tag = 'div', className = '', children, padded = true, ...rest }) {
  return <Tag {...rest} className={cx('card', padded && 'p-4 lg:p-5', className)}>{children}</Tag>;
}

export function CardHeader({ icon: Icon, title, hint, action, className = '' }) {
  return (
    <div className={cx('flex items-center justify-between gap-3 mb-4', className)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0"><Icon size={17} aria-hidden /></span>}
        <div className="min-w-0">
          <h2 className="font-extrabold text-ink text-[16px] leading-tight truncate">{title}</h2>
          {hint && <p className="text-[11.5px] text-ink-3 mt-0.5 truncate">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── عدّاد متحرك للأرقام ───
export function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const t = Number.isFinite(+target) ? +target : 0;
  const [val, setVal] = useState(() => (prefersReducedMotion() ? t : 0));
  const fromRef = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setVal(t); fromRef.current = t; return; }
    const from = fromRef.current;
    let raf; const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (t - from) * eased;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step); else fromRef.current = t;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); fromRef.current = t; };
  }, [t, duration]);
  const f = Math.pow(10, decimals);
  return Math.round(val * f) / f;
}

export function CountUp({ value, decimals = 0, suffix = '', prefix = '', className = '' }) {
  const v = useCountUp(value, { decimals });
  return <span className={cx('tnum', className)}>{prefix}{v.toFixed(decimals)}{suffix}</span>;
}

// ─── بلاطة مؤشر (KPI) مع عدّاد واتجاه ───
const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-success-soft text-success',
  sky: 'bg-info-soft text-info',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-warning-soft text-amber-600',
  rose: 'bg-danger-soft text-danger',
};
export function KpiTile({ icon: Icon, label, value, decimals = 0, suffix = '', trend = null, hint, tone = 'brand', className = '' }) {
  return (
    <div className={cx('card p-4 hover-lift relative overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-2">
        <span className={cx('w-10 h-10 rounded-[14px] flex items-center justify-center', TONES[tone] || TONES.brand)}><Icon size={18} aria-hidden /></span>
        {trend != null && <Trend value={trend} />}
      </div>
      <p className="text-[24px] font-extrabold text-ink mt-3 leading-none tnum">
        <CountUp value={value} decimals={decimals} />{suffix && <span className="text-[15px] font-bold text-ink-3 ms-0.5">{suffix}</span>}
      </p>
      <p className="text-ink-3 text-[12px] font-bold mt-1.5 leading-tight">{label}</p>
      {hint && <p className="text-[10.5px] text-ink-3/80 mt-0.5">{hint}</p>}
    </div>
  );
}

export function Trend({ value, className = '' }) {
  const up = value >= 0;
  return (
    <span className={cx('chip py-1 px-2 tnum', up ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger', className)}
      aria-label={`${up ? 'ارتفاع' : 'انخفاض'} ${Math.abs(value)}%`}>
      {up ? <FiTrendingUp size={12} aria-hidden /> : <FiTrendingDown size={12} aria-hidden />} {Math.abs(value)}%
    </span>
  );
}

// ─── شارة حالة الطلب مع أيقونة (اللون ليس الإشارة الوحيدة) ───
export function Chip({ tone = 'gray', icon: Icon, children, className = '' }) {
  const t = {
    gray: 'bg-gray-100 text-ink-2', brand: 'bg-brand-50 text-brand-700', emerald: 'bg-success-soft text-emerald-700',
    amber: 'bg-warning-soft text-amber-700', rose: 'bg-danger-soft text-danger', sky: 'bg-info-soft text-sky-700',
    violet: 'bg-violet-50 text-violet-700', teal: 'bg-teal-50 text-teal-700', solid: 'bg-coral text-white',
  }[tone];
  return <span className={cx('chip', t, className)}>{Icon && <Icon size={12} aria-hidden />}{children}</span>;
}

// ─── مفتاح تبديل ───
export function Toggle({ checked, onChange, disabled, label, size = 'md', busy = false, tone = 'brand', className = '' }) {
  const dims = size === 'lg' ? { w: 'w-[60px] h-[34px]', k: 'w-[26px] h-[26px]', on: '-translate-x-[26px]' } : { w: 'w-12 h-7', k: 'w-5 h-5', on: '-translate-x-5' };
  const onBg = tone === 'light' ? 'bg-white/40' : tone === 'emerald' ? 'bg-success' : 'bg-brand-500';
  const offBg = tone === 'light' ? 'bg-black/20' : 'bg-gray-300';
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled || busy}
      onClick={() => onChange && onChange(!checked)}
      className={cx('no-press hit-area relative inline-flex items-center flex-shrink-0 rounded-full p-1 transition-colors duration-200', dims.w, checked ? onBg : offBg, className)}>
      {/* في RTL: البداية يمين — المفتاح يتحرك يسارًا عند التفعيل */}
      <span className={cx('rounded-full bg-white shadow-[0_2px_6px_rgba(20,20,43,.25)] flex items-center justify-center transition-transform duration-300 ease-spring', dims.k, checked ? dims.on : 'translate-x-0')}>
        {busy && <Spinner size={11} className="text-ink-3" />}
      </span>
    </button>
  );
}

// ─── تبويبات بمؤشّر منزلق ───
export function Tabs({ tabs, value, onChange, className = '', size = 'md', ariaLabel }) {
  const wrapRef = useRef(null);
  const [ind, setInd] = useState(null);
  const measure = useCallback(() => {
    const el = wrapRef.current?.querySelector(`[data-tab="${value}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  useLayoutEffect(() => { measure(); }, [measure, tabs]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !wrapRef.current) return;
    const ro = new ResizeObserver(measure); ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrapRef} role="tablist" aria-label={ariaLabel}
      className={cx('relative flex bg-white border border-surface-line rounded-2xl p-1 shadow-soft', className)}>
      {ind && (
        <span aria-hidden className="absolute top-1 bottom-1 rounded-xl grad-brand shadow-brand transition-all duration-300 ease-out2"
          style={{ left: ind.left, width: ind.width }} />
      )}
      {tabs.map(t => {
        const active = t.key === value; const Icon = t.icon;
        return (
          <button key={t.key} data-tab={t.key} role="tab" aria-selected={active} onClick={() => onChange(t.key)}
            className={cx('no-press relative z-[1] flex-1 flex items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-3 text-sm',
              active ? 'text-white' : 'text-ink-3 hover:text-ink')}>
            {Icon && <Icon size={size === 'sm' ? 13 : 16} aria-hidden />} {t.label}
            {t.badge > 0 && (
              <span className={cx('min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center tnum', active ? 'bg-white text-brand-600' : 'bg-coral text-white')}>{t.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── نافذة سفلية / جانبية بحركة نابضية ───
// variant: 'sheet' (سفلية على الجوال، وسط الشاشة على الكبيرة) | 'drawer' (سفلية على الجوال، درج جانبي على الكبيرة)
export function Sheet({ open, onClose, title, subtitle, children, footer, variant = 'sheet', size = 'md', labelledBy }) {
  const panelRef = useRef(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const autoId = useId();
  // سحب المقبض لأسفل يغلق النافذة (جوال)
  const drag = useRef(null);
  const [dragY, setDragY] = useState(0);
  useOverlay(open, onClose);

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, prefersReducedMotion() ? 0 : 220);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!open) setDragY(0); }, [open]);

  // حبس التركيز + منع تمرير الخلفية (Esc عبر مكدّس النوافذ: الأعلى فقط)
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // لا نسرق التركيز من حقل autoFocus داخل النافذة
    const t = setTimeout(() => {
      const p = panelRef.current;
      if (p && !p.contains(document.activeElement)) p.focus();
    }, 30);
    const onKey = (e) => {
      if (e.key === 'Tab' && panelRef.current && panelRef.current.contains(document.activeElement)) {
        const f = panelRef.current.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t); document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch {}
    };
  }, [open]);

  const onDragStart = (e) => {
    drag.current = { y: e.clientY, t: performance.now() };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onDragMove = (e) => { if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.y)); };
  const onDragEnd = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    const v = dy / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (dy > 110 || (dy > 40 && v > 0.6)) onCloseRef.current?.();
    else setDragY(0);
  };

  if (!mounted) return null;
  const maxW = { sm: 'lg:max-w-sm', md: 'lg:max-w-lg', lg: 'lg:max-w-2xl' }[size];
  const isDrawer = variant === 'drawer';

  return createPortal(
    <div className="fixed inset-0 z-[100]" dir="rtl" role="dialog" aria-modal="true" aria-labelledby={labelledBy || (title ? autoId : undefined)}>
      <div className={cx('absolute inset-0 bg-ink/45 backdrop-blur-[3px] transition-opacity duration-200', closing ? 'opacity-0' : 'animate-fade-in')} onClick={onClose} />
      <div className={cx('absolute inset-x-0 bottom-0 flex justify-center pointer-events-none',
        isDrawer ? 'lg:inset-y-0 lg:left-0 lg:right-auto lg:items-stretch' : 'lg:inset-0 lg:items-center lg:p-6')}
        style={dragY ? { transform: `translateY(${dragY}px)` } : { transition: 'transform .22s cubic-bezier(.2,.8,.2,1)' }}>
        <div ref={panelRef} tabIndex={-1}
          className={cx('pointer-events-auto relative w-full bg-white flex flex-col outline-none shadow-sheet',
            'rounded-t-[28px] max-h-[92vh]',
            isDrawer ? 'lg:rounded-none lg:rounded-s-[28px] lg:max-h-none lg:h-full lg:w-[460px]' : cx('lg:rounded-[28px] lg:max-h-[88vh]', maxW),
            closing ? 'sheet-out' : isDrawer ? 'sheet-in drawer-in' : 'sheet-in modal-in')}
          style={{ paddingBottom: 'var(--sab)' }}>
          {/* مقبض السحب (جوال) */}
          <div className="lg:hidden flex justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing" style={{ touchAction: 'none' }} aria-hidden
            onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
            <span className="w-10 h-1.5 rounded-full bg-gray-200" />
          </div>
          {(title || subtitle) && (
            <div className="flex items-start justify-between gap-3 px-5 pt-2 lg:pt-5 pb-3 border-b border-surface-line">
              <div className="min-w-0">
                {title && <h2 id={autoId} className="font-extrabold text-ink text-lg leading-tight truncate">{title}</h2>}
                {subtitle && <div className="text-[12.5px] text-ink-3 mt-1">{subtitle}</div>}
              </div>
              <button onClick={onClose} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-surface text-ink-2 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"><FiX size={18} /></button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="border-t border-surface-line px-5 py-3 bg-white/95">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── الحالات ───
export function EmptyState({ icon: Icon, title, text, action, compact = false }) {
  return (
    <div className={cx('text-center px-6 animate-fade-up', compact ? 'py-8' : 'py-14')}>
      <div className="relative w-28 h-28 mx-auto mb-5">
        <div className="absolute inset-0 rounded-[36px] grad-sunset opacity-[.14] rotate-6" />
        <div className="absolute inset-2 rounded-[30px] bg-gradient-to-br from-brand-100 to-white -rotate-3" />
        <div className="absolute inset-0 flex items-center justify-center text-brand-500 animate-floaty">
          {Icon && <Icon size={42} aria-hidden />}
        </div>
        <span className="absolute -top-1 left-3 w-3 h-3 rounded-full bg-coral/60" />
        <span className="absolute bottom-2 -right-1 w-2 h-2 rounded-full bg-brand-300" />
      </div>
      <p className="font-extrabold text-ink text-lg">{title}</p>
      {text && <p className="text-sm text-ink-3 mt-1.5 leading-relaxed max-w-xs mx-auto">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ text = 'تعذّر تحميل البيانات', onRetry }) {
  return (
    <div className="card p-7 text-center animate-fade-up">
      <div className="w-16 h-16 mx-auto mb-3 rounded-[20px] bg-danger-soft text-danger flex items-center justify-center">
        <FiAlertTriangle size={28} aria-hidden />
      </div>
      <p className="font-extrabold text-ink">{text}</p>
      <p className="text-[12.5px] text-ink-3 mt-1">تحقق من اتصال الإنترنت وحاول مرة أخرى</p>
      {onRetry && <button onClick={onRetry} className="btn-primary mt-5 px-6"><FiRefreshCw size={15} aria-hidden /> إعادة المحاولة</button>}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 16, r = 8, className = '', style = {} }) {
  return <div className={cx('sk', className)} style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 card p-4" style={{ opacity: 1 - i * 0.12 }}>
          <Skeleton w={48} h={48} r={14} />
          <div className="flex-1 space-y-2">
            <Skeleton w="45%" h={14} />
            <Skeleton w="28%" h={11} />
          </div>
          <Skeleton w={68} h={26} r={999} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 18, className = '' }) {
  return <span className={`inline-block rounded-full border-2 border-current border-t-transparent spin ${className}`} style={{ width: size, height: size }} aria-hidden />;
}

// ─── نافذة تأكيد أنيقة بدل confirm() — تُستخدم عبر useConfirm ───
export function useConfirm() {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve;
    setState({ title: 'تأكيد', confirmText: 'تأكيد', cancelText: 'تراجع', danger: false, reasons: null, ...opts });
  }), []);

  const close = (result) => {
    setState(null);
    const r = resolver.current; resolver.current = null;
    r && r(result);
  };

  const dialog = state ? <ConfirmSheet {...state} onClose={close} /> : null;
  return [dialog, confirm];
}

function ConfirmSheet({ title, message, confirmText, cancelText, danger, reasons, onClose }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet open onClose={() => onClose(false)} size="sm" labelledBy="confirm-title">
      <div className="text-center pt-1">
        <div className={cx('w-16 h-16 mx-auto rounded-[20px] flex items-center justify-center mb-3 animate-pop', danger ? 'bg-danger-soft text-danger' : 'bg-brand-50 text-brand-600')}>
          <FiAlertTriangle size={26} aria-hidden />
        </div>
        <p id="confirm-title" className="font-extrabold text-ink text-lg">{title}</p>
        {message && <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{message}</p>}
      </div>
      {reasons && (
        <div className="mt-5">
          <p className="label">السبب (اختياري)</p>
          <div className="flex flex-wrap gap-2">
            {reasons.map(r => (
              <button key={r} onClick={() => setReason(reason === r ? '' : r)} aria-pressed={reason === r}
                className={cx('text-xs font-bold px-3.5 h-9 rounded-full border-[1.5px] flex items-center gap-1', reason === r ? 'border-danger/40 bg-danger-soft text-danger' : 'border-surface-line text-ink-2 hover:border-gray-300')}>
                {reason === r && <FiCheck size={12} aria-hidden />}{r}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 mt-6">
        <button onClick={() => onClose(reasons ? { ok: true, reason } : true)}
          className={cx('flex-1 h-12', danger ? 'btn bg-danger text-white shadow-[0_10px_22px_rgba(240,68,56,.25)]' : 'btn-primary')}>{confirmText}</button>
        <button onClick={() => onClose(false)} className="flex-1 btn-ghost h-12">{cancelText}</button>
      </div>
    </Sheet>
  );
}
