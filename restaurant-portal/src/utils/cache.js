// تخزين مؤقت (localStorage) — عرض فوري ثم تحديث بالخلفية
export const readCache = (key) => {
  try { const raw = localStorage.getItem('cache_' + key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};

export const writeCache = (key, data) => {
  try { localStorage.setItem('cache_' + key, JSON.stringify(data)); } catch {}
};

// حذف كل الكاش (عند الخروج) مع إبقاء إعدادات الجهاز مثل الطابعة
export const clearCaches = () => {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('cache_')).forEach(k => localStorage.removeItem(k));
  } catch {}
};
