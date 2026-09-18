// عرض فوري ثم تحديث بالخلفية (stale-while-revalidate) — localStorage
export const readCache = (key) => {
  try { const raw = localStorage.getItem('cache_' + key); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};

export const writeCache = (key, data) => {
  try { localStorage.setItem('cache_' + key, JSON.stringify(data)); } catch {}
};
