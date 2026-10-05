import AsyncStorage from '@react-native-async-storage/async-storage';

// تخزين مؤقت بسيط — نعرض البيانات فوراً من الكاش ونحدّثها بالخلفية (stale-while-revalidate)
export const readCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem('cache_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const writeCache = (key, data) => {
  try { AsyncStorage.setItem('cache_' + key, JSON.stringify(data)).catch(() => {}); } catch {}
};

// مسح كل الكاش (عند تسجيل الخروج) — حتى ما يشوف الحساب التالي بيانات الحساب السابق
export const clearAllCache = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(k => k.startsWith('cache_'));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {}
};
