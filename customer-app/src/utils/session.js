// ناقل أحداث بسيط للجلسة — يسمح لـ AuthContext بإبلاغ السلة وغيرها عند تسجيل الخروج
const listeners = new Set();

export const onLogout = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export const emitLogout = async () => {
  for (const fn of Array.from(listeners)) {
    try { await fn(); } catch {}
  }
};
