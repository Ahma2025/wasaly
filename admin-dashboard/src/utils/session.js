// إدارة جلسة المدير: فك JWT بأمان (base64url) + خروج ينظّف كل الكاش
export const TOKEN_KEY = 'admin_token';

export function decodeJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    // دعم UTF-8 (أسماء عربية داخل الـ payload)
    const json = decodeURIComponent(Array.from(bin, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** يرجّع المستخدم الحالي من التوكن لو صالح (مدير وغير منتهي) */
export function currentAdmin() {
  const payload = decodeJwt(getToken());
  if (!payload || payload.role !== 'admin') return null;
  if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
  return { id: payload.id, role: payload.role };
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('cache_adm_') || k.startsWith('cache_'))) drop.push(k);
    }
    drop.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/** خروج كامل: تنظيف + إبلاغ التطبيق ليعرض شاشة الدخول */
export function logout(reason) {
  clearSession();
  window.dispatchEvent(new CustomEvent('wasaly:logout', { detail: { reason } }));
}
