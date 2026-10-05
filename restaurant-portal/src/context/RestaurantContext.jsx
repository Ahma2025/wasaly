import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api from '../utils/api';

const RestaurantCtx = createContext(null);

const readJSON = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; } };

// مصدر واحد لبيانات المطعم: الهيدر والإعدادات والصفحات تتحدّث معًا
export function RestaurantProvider({ children }) {
  const [restaurant, setState] = useState(() => readJSON('restaurant', {}));
  const ref = useRef(restaurant);
  ref.current = restaurant;
  const lastRefresh = useRef(0);

  const setRestaurant = useCallback((patch) => {
    setState(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      try { localStorage.setItem('restaurant', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // تحديث من السيرفر (يعكس مثلاً إغلاق الإدارة للمطعم أو تغيير البيانات من جهاز آخر)
  const refresh = useCallback(async () => {
    const user = readJSON('user', null);
    if (!user?.id) return;
    lastRefresh.current = Date.now();
    try {
      const r = await api.get('/restaurants', { params: { owner_id: user.id, limit: 50 } });
      const list = Array.isArray(r?.data) ? r.data : [];
      const cur = ref.current;
      const found = list.find(x => String(x.id) === String(cur?.id)) || (!cur?.id ? list[0] : null);
      if (found) { setRestaurant(prev => ({ ...prev, ...found })); return; }
      // غير موجود في القائمة (القائمة تستثني المطاعم غير المفعّلة) → نقرأه مباشرة
      if (cur?.id) {
        const d = await api.get(`/restaurants/${cur.id}`);
        // eslint-disable-next-line no-unused-vars
        const { menu, hours, ...rest } = d?.data || {};
        if (rest.id) setRestaurant(prev => ({ ...prev, ...rest }));
      }
    } catch { /* نبقي النسخة المحفوظة */ }
  }, [setRestaurant]);

  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > 60000) refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const value = useMemo(() => ({ restaurant, setRestaurant, refresh }), [restaurant, setRestaurant, refresh]);
  return <RestaurantCtx.Provider value={value}>{children}</RestaurantCtx.Provider>;
}

export function useRestaurant() {
  const ctx = useContext(RestaurantCtx);
  if (ctx) return ctx;
  // احتياط خارج المزوّد
  return { restaurant: readJSON('restaurant', {}), setRestaurant: () => {}, refresh: async () => {} };
}
