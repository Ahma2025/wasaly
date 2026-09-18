import AsyncStorage from '@react-native-async-storage/async-storage';

// عرض فوري ثم تحديث بالخلفية (stale-while-revalidate)
export const readCache = async (key) => {
  try {
    const raw = await AsyncStorage.getItem('cache_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

export const writeCache = (key, data) => {
  try { AsyncStorage.setItem('cache_' + key, JSON.stringify(data)); } catch {}
};
