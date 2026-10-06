// حارس مغادرة الصفحة: صفحة فيها تغييرات غير محفوظة (الإعدادات) تسجّل دالة تأكيد،
// وكل تنقّل داخل التطبيق (القائمة، زر الرجوع، تسجيل الخروج) يمرّ عبر canLeave() أولًا.
// (BrowserRouter لا يدعم useBlocker، لذا نستخدم حارسًا بسيطًا على مستوى الوحدة)
let guard = null;

/** @param {null | (() => Promise<boolean>)} fn */
export function setLeaveGuard(fn) { guard = fn || null; }
export const hasLeaveGuard = () => !!guard;

export async function canLeave() {
  if (!guard) return true;
  try {
    const ok = await guard();
    if (ok) guard = null;
    return !!ok;
  } catch { return true; }
}
