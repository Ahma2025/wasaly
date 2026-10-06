import { useEffect, useRef } from 'react';

/**
 * مكدّس النوافذ المفتوحة (Modal / Sheet / قائمة «المزيد» / محادثة ملء الشاشة / البحث السريع).
 * زر الرجوع في أندرويد وزر Esc يغلقان النافذة العليا فقط — X-04.
 */
const STACK = [];

/** يسجّل نافذة؛ يرجّع token فيه remove() */
export function pushOverlay(close) {
  const token = { close };
  token.remove = () => { const i = STACK.indexOf(token); if (i >= 0) STACK.splice(i, 1); };
  STACK.push(token);
  return token;
}
export const isTopOverlay = (token) => STACK[STACK.length - 1] === token;
export const overlayCount = () => STACK.length;

/** يغلق النافذة العليا؛ يرجّع true إن وُجدت */
export function closeTopOverlay() {
  const top = STACK[STACK.length - 1];
  if (!top) return false;
  try { top.close?.(); } catch { /* ignore */ }
  return true;
}

/** يسجّل نافذة مفتوحة في المكدّس طالما active=true؛ يرجّع ref للـtoken (لفحص «العليا» عند Esc) */
export function useOverlay(active, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  const tokenRef = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const t = pushOverlay(() => ref.current?.());
    tokenRef.current = t;
    return () => { t.remove(); if (tokenRef.current === t) tokenRef.current = null; };
  }, [active]);
  return tokenRef;
}
