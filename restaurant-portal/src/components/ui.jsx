import React, { useCallback, useRef, useState } from 'react';
import { FiRefreshCw, FiAlertTriangle, FiX } from 'react-icons/fi';

// عنوان صفحة موحّد مع زر تحديث اختياري
export function PageHeader({ title, subtitle, icon: Icon, onRefresh, refreshing, children }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <Icon size={20} aria-hidden />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-black text-gray-900 leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
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
    <button onClick={onClick} disabled={spinning} aria-label={label} title={label}
      className="w-10 h-10 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-brand-600 hover:border-brand-300 flex items-center justify-center shadow-soft">
      <FiRefreshCw size={17} className={spinning ? 'spin' : ''} aria-hidden />
    </button>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="text-center py-14 px-6 animate-fade-up">
      <div className="w-20 h-20 mx-auto mb-4 rounded-3xl bg-brand-50 text-brand-500 flex items-center justify-center">
        {Icon && <Icon size={36} aria-hidden />}
      </div>
      <p className="font-black text-gray-800 text-lg">{title}</p>
      {text && <p className="text-sm text-gray-400 mt-1 leading-relaxed">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ text = 'تعذّر تحميل البيانات', onRetry }) {
  return (
    <div className="card p-6 text-center animate-fade-up">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
        <FiAlertTriangle size={26} aria-hidden />
      </div>
      <p className="font-bold text-gray-800">{text}</p>
      <p className="text-xs text-gray-400 mt-1">تحقق من اتصال الإنترنت وحاول مرة أخرى</p>
      {onRetry && <button onClick={onRetry} className="btn-primary mt-4"><FiRefreshCw size={15} aria-hidden /> إعادة المحاولة</button>}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 py-1" aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 card p-4">
          <div className="sk" style={{ width: 44, height: 44, borderRadius: 12 }} />
          <div className="flex-1 space-y-2">
            <div className="sk" style={{ width: '45%', height: 14, borderRadius: 8 }} />
            <div className="sk" style={{ width: '25%', height: 11, borderRadius: 8 }} />
          </div>
          <div className="sk" style={{ width: 64, height: 24, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ size = 18, className = '' }) {
  return <span className={`inline-block rounded-full border-2 border-current border-t-transparent spin ${className}`} style={{ width: size, height: size }} aria-hidden />;
}

// نافذة تأكيد أنيقة بدل confirm() — تُستخدم عبر useConfirm
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center animate-fade-in" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => onClose(false)} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 shadow-card animate-sheet"
        style={{ paddingBottom: 'calc(20px + var(--sab))' }}>
        <button onClick={() => onClose(false)} aria-label="إغلاق" className="absolute left-4 top-4 w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center"><FiX size={16} /></button>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${danger ? 'bg-rose-50 text-rose-500' : 'bg-brand-50 text-brand-600'}`}>
          <FiAlertTriangle size={22} aria-hidden />
        </div>
        <p className="font-black text-gray-900 text-lg">{title}</p>
        {message && <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>}
        {reasons && (
          <div className="flex flex-wrap gap-2 mt-4">
            {reasons.map(r => (
              <button key={r} onClick={() => setReason(reason === r ? '' : r)}
                className={`text-xs font-bold px-3 py-2 rounded-xl border ${reason === r ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-gray-200 text-gray-600'}`}>
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={() => onClose(reasons ? { ok: true, reason } : true)}
            className={`flex-1 ${danger ? 'btn bg-rose-500 text-white' : 'btn-primary'} py-3`}>{confirmText}</button>
          <button onClick={() => onClose(false)} className="flex-1 btn-ghost py-3">{cancelText}</button>
        </div>
      </div>
    </div>
  );
}
