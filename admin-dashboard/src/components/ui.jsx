import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiEye, FiEyeOff, FiX, FiAlertTriangle, FiSearch } from 'react-icons/fi';
import { Sk } from './Skeleton';

/* ---------- Modal / Bottom-sheet (portal فوق شريط التنقل) ---------- */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', dismissable = true }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, dismissable, onClose]);

  if (!open) return null;
  const width = size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center" dir="rtl" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#1A1A2E]/55 backdrop-blur-[2px] animate-[fadeIn_.18s_ease]" onClick={() => dismissable && onClose?.()} />
      <div className={`relative w-full ${width} bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col max-h-[92vh] animate-[sheetUp_.26s_cubic-bezier(.2,.8,.2,1)]`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="sm:hidden w-11 h-1.5 bg-gray-200 rounded-full mx-auto mt-2.5" />
        {(title || dismissable) && (
          <div className="flex items-start gap-3 px-5 pt-4 pb-3">
            <div className="flex-1 min-w-0">
              {title && <h3 className="font-black text-lg text-gray-900 leading-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
            {dismissable && (
              <button onClick={onClose} aria-label="إغلاق" className="w-9 h-9 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                <FiX />
              </button>
            )}
          </div>
        )}
        <div className="px-5 pb-4 overflow-y-auto overscroll-contain flex-1">{children}</div>
        {footer && <div className="px-5 pt-3 pb-4 border-t border-gray-100 bg-white rounded-b-[28px]">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Confirm dialog (بديل window.confirm) ---------- */
const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolver.current = resolve;
    setState(typeof opts === 'string' ? { message: opts } : opts);
  }), []);

  const close = (val) => { resolver.current?.(val); resolver.current = null; setState(null); };

  const danger = state?.danger !== false;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} size="sm" dismissable>
        {state && (
          <div className="text-center pt-1">
            <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-3 ${danger ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'}`}>
              {state.icon || <FiAlertTriangle />}
            </div>
            <h3 className="font-black text-lg text-gray-900">{state.title || 'تأكيد الإجراء'}</h3>
            {state.message && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed whitespace-pre-line">{state.message}</p>}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button onClick={() => close(true)}
                className={`py-3 rounded-2xl font-black text-white ${danger ? 'bg-gradient-to-l from-red-500 to-rose-600 shadow-[0_10px_24px_rgba(239,68,68,.3)]' : 'btn-lux'}`}>
                {state.confirmText || 'تأكيد'}
              </button>
              <button onClick={() => close(false)} className="py-3 rounded-2xl font-bold bg-gray-100 text-gray-700">
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

/* ---------- Page header ---------- */
export function PageHeader({ title, subtitle, icon, action }) {
  return (
    <div className="flex items-center gap-3">
      {icon && (
        <div className="w-11 h-11 rounded-2xl grad-sunset text-white flex items-center justify-center text-xl shadow-brand sheen flex-shrink-0">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-black text-gray-900 leading-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400 font-semibold mt-0.5 truncate">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryBtn({ children, className = '', ...p }) {
  return <button {...p} className={`btn-lux px-4 py-2.5 text-sm disabled:opacity-60 disabled:pointer-events-none ${className}`}>{children}</button>;
}
export function SoftBtn({ children, className = '', ...p }) {
  return <button {...p} className={`px-4 py-2.5 rounded-2xl text-sm font-bold bg-gray-100 text-gray-700 disabled:opacity-60 ${className}`}>{children}</button>;
}

/* ---------- Form bits ---------- */
export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && <span className="lbl">{label}{hint && <span className="text-gray-400 font-normal mr-1">{hint}</span>}</span>}
      {children}
      {error && <span className="block text-[11px] text-red-500 font-semibold mt-1">{error}</span>}
    </label>
  );
}

export function PasswordInput({ value, onChange, placeholder = 'كلمة المرور', autoComplete = 'new-password', ...p }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...p} type={show ? 'text' : 'password'} className="inp pl-11" value={value} onChange={onChange}
        placeholder={placeholder} autoComplete={autoComplete} dir="ltr" style={{ textAlign: 'right' }} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 flex items-center justify-center">
        {show ? <FiEyeOff /> : <FiEye />}
      </button>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'بحث...', loading }) {
  return (
    <div className="relative">
      <FiSearch className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input className="inp pr-10 bg-white" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      {loading && <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin" />}
    </div>
  );
}

/* ---------- Chips ---------- */
export function Chips({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
      {options.map(([val, label, count]) => (
        <button key={val} onClick={() => onChange(val)} className={`chip ${value === val ? 'chip-on' : ''}`}>
          {label}{count != null && <span className={`mr-1 text-[10px] ${value === val ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Badge({ className = '', children }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ring-inset ${className}`}>{children}</span>;
}

/* ---------- States ---------- */
export function EmptyState({ icon = '📭', title, hint, action }) {
  return (
    <div className="card text-center py-12 px-6">
      <div className="w-16 h-16 mx-auto rounded-3xl bg-orange-50 flex items-center justify-center text-3xl mb-3">{icon}</div>
      <p className="font-black text-gray-800">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1 leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-3">
          <Sk w={44} h={44} r={14} />
          <div className="flex-1 space-y-2"><Sk w="45%" h={14} /><Sk w="25%" h={11} /></div>
          <Sk w={60} h={24} r={999} />
        </div>
      ))}
    </div>
  );
}

export function LoadMore({ shown, total, onMore, loading }) {
  if (shown >= total && !loading) return null;
  return (
    <button onClick={onMore} disabled={loading}
      className="w-full py-3 rounded-2xl bg-white border border-dashed border-orange-200 text-orange-600 font-bold text-sm disabled:opacity-60">
      {loading ? 'جاري التحميل…' : `تحميل المزيد${total > shown && Number.isFinite(total) ? ` (${total - shown} متبقٍ)` : ''}`}
    </button>
  );
}

export function StatTile({ label, value, tone = 'orange', icon }) {
  const tones = {
    orange: 'from-[#FF8A1E] to-[#F53B57]',
    green: 'from-emerald-500 to-green-600',
    violet: 'from-violet-500 to-purple-600',
    blue: 'from-sky-500 to-blue-600',
    slate: 'from-slate-600 to-slate-800',
  };
  return (
    <div className={`sheen relative overflow-hidden rounded-2xl p-3.5 text-white bg-gradient-to-br ${tones[tone] || tones.orange} shadow-card`}>
      <div className="absolute -left-5 -bottom-6 w-16 h-16 rounded-full bg-white/10" />
      <p className="text-white/80 text-[11px] font-bold flex items-center gap-1">{icon}{label}</p>
      <p className="text-2xl font-black mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
