import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { onLogout } from '../utils/session';
import { scheduleLocal } from '../utils/pushNotifications';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';

/*
  السلة تدعم الطلب المجمّع (طلب من أكثر من مطعم بسائق واحد):
  carts = [{ restaurant: { id, name_ar, logo, min_order, lat, lng, store_type }, items: [...] }]
  - مطعم واحد → نفس السلوك القديم تماماً (POST /orders/quote و /orders)
  - ≥ 2 مطاعم → /orders/multi/quote و /orders/multi (حسب إعداد /orders/multi/config)
  الواجهة القديمة (items / restaurantId / restaurantName / addItem / ...) باقية كما هي لباقي الشاشات.
*/

const CartContext = createContext({});
const CART_KEY = 'wasaly_cart_v1'; // نفس المفتاح — الصيغة الجديدة فيها v: 2 والقديمة تُرحّل تلقائياً
const REMINDER_KEY = 'wasaly_cart_reminder_id';
export const MAX_QTY = 99; // مطابق لتحقق السيرفر (1..99)
export const DEFAULT_MAX_RESTAURANTS = 3;
const DEFAULT_MULTI = { enabled: false, max_restaurants: DEFAULT_MAX_RESTAURANTS, max_distance_km: null, extra_stop_fee: 3, free_delivery_threshold: 50, payment_methods: ['cash'] };

const lineKey = (item) => {
  try {
    return item.id + JSON.stringify((item.addons || item.selectedOptions || []).map(a => [a?.id ?? null, a?.name, a?.group ?? null]));
  } catch { return String(item?.id) + Math.random().toString(36).slice(2, 8); }
};
const keyFor = (rid, item) => `${rid}|${lineKey(item)}`;

export const linePrice = (i) => {
  const base = parseFloat(i.discount_price || i.price || 0);
  const addons = (i.addons || []).reduce((s, a) => s + parseFloat(a.price || 0), 0);
  return base + addons;
};

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const clampQty = (q) => Math.min(MAX_QTY, Math.max(1, parseInt(q, 10) || 1));
const numOrNull = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n !== 0 ? n : null; };

// نحتفظ فقط بمعلومات المطعم اللازمة للسلة (بدون المنيو الكامل)
export const pickRestaurant = (r = {}) => ({
  id: r.id,
  name_ar: r.name_ar || r.name || r.restaurant_name || '',
  logo: r.logo || r.logo_url || r.image || r.restaurant_logo || null,
  min_order: r.min_order != null ? parseFloat(r.min_order) || 0 : null,
  lat: numOrNull(r.lat ?? r.latitude ?? r.restaurant_lat),
  lng: numOrNull(r.lng ?? r.longitude ?? r.restaurant_lng),
  store_type: r.store_type || null,
});

// مسافة تقريبية (كم) بين نقطتين
export const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

const sanitizeItems = (rid, list) => (Array.isArray(list) ? list : [])
  .filter(i => i && typeof i === 'object' && i.id != null)
  .map(i => ({ ...i, quantity: clampQty(i.quantity), _key: keyFor(rid, i) }))
  // دمج الأسطر المكررة بعد إعادة بناء المفاتيح
  .reduce((acc, it) => {
    const ex = acc.find(x => x._key === it._key);
    if (ex) ex.quantity = Math.min(MAX_QTY, ex.quantity + it.quantity); else acc.push(it);
    return acc;
  }, []);

// ترحيل آمن لأي صيغة محفوظة (قديمة أو جديدة أو تالفة) — لا يرمي أبداً
export function migrateSavedCart(saved) {
  try {
    if (!saved || typeof saved !== 'object') return { carts: [], groupOrder: null };
    if (Array.isArray(saved.carts)) {
      const carts = saved.carts
        .filter(c => c && c.restaurant && c.restaurant.id != null)
        .map(c => ({ restaurant: pickRestaurant(c.restaurant), items: sanitizeItems(c.restaurant.id, c.items) }))
        .filter(c => c.items.length > 0);
      return { carts, groupOrder: saved.groupOrder || null };
    }
    // الصيغة القديمة: { items, restaurantId, restaurantName, groupOrder }
    if (Array.isArray(saved.items) && saved.items.length && saved.restaurantId != null) {
      const items = sanitizeItems(saved.restaurantId, saved.items);
      if (!items.length) return { carts: [], groupOrder: null };
      return {
        carts: [{ restaurant: pickRestaurant({ id: saved.restaurantId, name_ar: saved.restaurantName || '' }), items }],
        groupOrder: saved.groupOrder || null,
      };
    }
  } catch {}
  return { carts: [], groupOrder: null };
}

const normalizeConfig = (d) => {
  if (!d || typeof d !== 'object') return null;
  const max = parseInt(d.max_restaurants, 10);
  return {
    ...DEFAULT_MULTI,
    ...d,
    enabled: d.enabled === true,
    max_restaurants: Number.isFinite(max) && max >= 2 ? max : DEFAULT_MAX_RESTAURANTS,
    max_distance_km: numOrNull(d.max_distance_km),
    extra_stop_fee: Number.isFinite(parseFloat(d.extra_stop_fee)) ? parseFloat(d.extra_stop_fee) : DEFAULT_MULTI.extra_stop_fee,
  };
};

export const CartProvider = ({ children }) => {
  const [carts, setCarts] = useState([]);
  const [groupOrder, setGroupOrder] = useState(null); // { id, code } لو السلة مستوردة من طلب جماعي (مطعم واحد)
  const [hydrated, setHydrated] = useState(false);
  const [multiConfig, setMultiConfig] = useState(DEFAULT_MULTI);
  const [multiSupported, setMultiSupported] = useState(false);
  const saveTimer = useRef(null);
  const reminderTimer = useRef(null);
  const cartsRef = useRef(carts);
  cartsRef.current = carts;

  // استرجاع السلة المحفوظة عند فتح التطبيق
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CART_KEY);
        if (raw) {
          let saved = null;
          try { saved = JSON.parse(raw); } catch {}
          const m = migrateSavedCart(saved);
          if (m.carts.length) { setCarts(m.carts); setGroupOrder(m.groupOrder); }
        }
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // إعداد الطلب المجمّع (مُخزّن مؤقتاً) — لو السيرفر قديم (404) الميزة تبقى مخفية
  const refreshMultiConfig = useCallback(async () => {
    try {
      const r = await api.get('/orders/multi/config');
      const cfg = normalizeConfig(r?.data);
      if (cfg) { setMultiConfig(cfg); setMultiSupported(true); writeCache('multi_config', cfg); }
      return cfg;
    } catch (e) {
      if (e?.status === 404) { setMultiSupported(false); setMultiConfig(DEFAULT_MULTI); writeCache('multi_config', null); }
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = normalizeConfig(await readCache('multi_config'));
      if (cached) { setMultiConfig(cached); setMultiSupported(true); }
      refreshMultiConfig();
    })();
    // إعادة الفحص عند الرجوع للتطبيق (العقد: الأدمن ممكن يوقف الميزة بأي وقت)
    let last = 0;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && Date.now() - last > 60000) { last = Date.now(); refreshMultiConfig(); }
    });
    return () => sub?.remove?.();
  }, [refreshMultiConfig]);

  const multiEnabled = multiSupported && !!multiConfig.enabled;
  const maxRestaurants = multiEnabled ? multiConfig.max_restaurants : 1;

  // حفظ السلة تلقائياً عند أي تغيير (بعد الاسترجاع)
  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(CART_KEY, JSON.stringify({ v: 2, carts, groupOrder })).catch(() => {});
    }, 300);
  }, [carts, groupOrder, hydrated]);

  const cancelReminder = useCallback(async () => {
    try {
      const id = await AsyncStorage.getItem(REMINDER_KEY);
      if (id) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
        await AsyncStorage.removeItem(REMINDER_KEY);
      }
    } catch {}
  }, []);

  // ── قيم مشتقة (متوافقة مع الواجهة القديمة) ──
  const items = useMemo(() => carts.flatMap(c => c.items.map(i => ({ ...i, _rid: c.restaurant.id }))), [carts]);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = items.reduce((sum, i) => sum + linePrice(i) * i.quantity, 0);
  const restaurantId = carts[0]?.restaurant?.id ?? null;
  const restaurantName = carts.length > 1
    ? carts.map(c => c.restaurant.name_ar).filter(Boolean).join(' + ')
    : (carts[0]?.restaurant?.name_ar || '');
  const restaurantsCount = carts.length;
  const isMulti = carts.length > 1;

  // تذكير السلة المتروكة — إشعار محلي بعد 90 دقيقة؛ يُعاد جدولته فقط عند تغيّر العدد (مع تأخير بسيط)
  const reminderFrom = isMulti ? `${carts.length} مطاعم` : restaurantName;
  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(reminderTimer.current);
    reminderTimer.current = setTimeout(async () => {
      await cancelReminder();
      if (count > 0) {
        try {
          const id = await scheduleLocal({
            title: '🛒 سلتك بتنطرك!',
            body: `عندك ${count} صنف بالسلة${reminderFrom ? ' من ' + reminderFrom : ''} — كمّل طلبك قبل ما يبرد 😋`,
            data: { type: 'cart_reminder' },
          }, 90 * 60);
          if (id) await AsyncStorage.setItem(REMINDER_KEY, id);
        } catch {}
      }
    }, 1500);
    return () => clearTimeout(reminderTimer.current);
  }, [count, hydrated, reminderFrom, cancelReminder]);

  const clearCart = useCallback(() => {
    setCarts([]); setGroupOrder(null);
    AsyncStorage.removeItem(CART_KEY).catch(() => {});
  }, []);

  // تسجيل الخروج → إفراغ السلة + إلغاء التذكير
  useEffect(() => onLogout(async () => {
    clearCart();
    await cancelReminder();
  }), [clearCart, cancelReminder]);

  /*
    فحص إمكانية إضافة مطعم جديد للسلة (بدون تعديل):
    { ok: true } أو { conflict: true, reason: 'single'|'limit'|'group_order'|'too_far', restaurant, ... }
  */
  const canAddRestaurant = useCallback((restaurant) => {
    const list = cartsRef.current;
    if (!restaurant?.id || !list.length || list.some(c => sameId(c.restaurant.id, restaurant.id))) return { ok: true };
    const names = list.map(c => c.restaurant.name_ar).filter(Boolean).join('، ');
    const base = { conflict: true, restaurant: names || 'مطعم آخر', restaurants: list.map(c => c.restaurant) };
    if (groupOrder?.id) return { ...base, reason: 'group_order' };
    if (!multiEnabled) return { ...base, reason: 'single' };
    if (list.length >= maxRestaurants) return { ...base, reason: 'limit', max: maxRestaurants };
    const maxKm = multiConfig.max_distance_km;
    const nr = pickRestaurant(restaurant);
    if (maxKm && nr.lat && nr.lng) {
      for (const c of list) {
        if (!c.restaurant.lat || !c.restaurant.lng) continue;
        const d = haversineKm(nr.lat, nr.lng, c.restaurant.lat, c.restaurant.lng);
        if (d > maxKm) return { ...base, reason: 'too_far', far: c.restaurant.name_ar, distance_km: Math.round(d * 10) / 10, max_distance_km: maxKm };
      }
    }
    return { ok: true };
  }, [groupOrder, multiEnabled, maxRestaurants, multiConfig.max_distance_km]);

  const addItem = useCallback((item, restaurant, qty = 1) => {
    const rid = restaurant?.id ?? cartsRef.current[0]?.restaurant?.id;
    if (rid == null) return { conflict: true, restaurant: '' };
    const check = canAddRestaurant(restaurant);
    if (check.conflict) return check;
    const q = clampQty(qty);
    const wasNew = !cartsRef.current.some(c => sameId(c.restaurant.id, rid));
    setCarts(prev => {
      const idx = prev.findIndex(c => sameId(c.restaurant.id, rid));
      const key = keyFor(rid, item);
      if (idx === -1) {
        return [...prev, { restaurant: pickRestaurant({ ...(restaurant || {}), id: rid }), items: [{ ...item, _key: key, quantity: q }] }];
      }
      return prev.map((c, i) => {
        if (i !== idx) return c;
        // تحديث معلومات المطعم (لوجو/حد أدنى/موقع) لو وصلت أحدث
        const info = restaurant ? { ...c.restaurant, ...Object.fromEntries(Object.entries(pickRestaurant({ ...restaurant, id: rid })).filter(([, v]) => v != null && v !== '')) } : c.restaurant;
        const existing = c.items.find(it => it._key === key);
        const nextItems = existing
          ? c.items.map(it => (it._key === key ? { ...it, quantity: Math.min(MAX_QTY, it.quantity + q) } : it))
          : [...c.items, { ...item, _key: key, quantity: q }];
        return { restaurant: info, items: nextItems };
      });
    });
    return { success: true, newRestaurant: wasNew && cartsRef.current.length > 0, restaurantsCount: cartsRef.current.length + (wasNew ? 1 : 0) };
  }, [canAddRestaurant]);

  const mapLine = (key, fn) => setCarts(prev => prev
    .map(c => (c.items.some(i => i._key === key) ? { ...c, items: fn(c.items) } : c))
    .filter(c => c.items.length > 0));

  const incrementItem = useCallback((key) => {
    mapLine(key, list => list.map(i => (i._key === key ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + 1) } : i)));
  }, []);

  const removeItem = useCallback((key) => {
    mapLine(key, list => list.map(i => (i._key === key ? { ...i, quantity: i.quantity - 1 } : i)).filter(i => i.quantity > 0));
  }, []);

  // تحديث ملاحظة صنف معيّن
  const updateItemNote = useCallback((key, note) => {
    mapLine(key, list => list.map(i => (i._key === key ? { ...i, notes: note } : i)));
  }, []);

  // حذف مطعم كامل من السلة
  const removeRestaurant = useCallback((rid) => {
    setCarts(prev => prev.filter(c => !sameId(c.restaurant.id, rid)));
  }, []);

  // تحديث معلومات مطعم بالسلة (مثلاً اللوجو/الحد الأدنى بعد جلبها من السيرفر)
  const updateRestaurantInfo = useCallback((rid, info) => {
    if (!info) return;
    setCarts(prev => {
      let changed = false;
      const next = prev.map(c => {
        if (!sameId(c.restaurant.id, rid)) return c;
        const fresh = pickRestaurant({ ...info, id: c.restaurant.id });
        const merged = { ...c.restaurant };
        Object.entries(fresh).forEach(([k, v]) => { if (v != null && v !== '' && merged[k] !== v) { merged[k] = v; changed = true; } });
        return changed ? { ...c, restaurant: merged } : c;
      });
      return changed ? next : prev;
    });
  }, []);

  // استبدال السلة بالكامل (إعادة طلب / طلب جماعي) — مطعم واحد
  const reorder = useCallback((newItems, restaurant, meta = {}) => {
    if (!restaurant || restaurant.id == null) return;
    setGroupOrder(meta.groupOrder || null);
    const list = sanitizeItems(restaurant.id, newItems);
    setCarts(list.length ? [{ restaurant: pickRestaurant(restaurant), items: list }] : []);
  }, []);

  const clearAndAdd = useCallback((item, restaurant, qty = 1) => {
    if (!restaurant || restaurant.id == null) return;
    setGroupOrder(null);
    setCarts([{ restaurant: pickRestaurant(restaurant), items: [{ ...item, _key: keyFor(restaurant.id, item), quantity: clampQty(qty) }] }]);
  }, []);

  return (
    <CartContext.Provider value={{
      // الواجهة القديمة
      items, restaurantId, restaurantName, groupOrder, total, count, hydrated,
      addItem, incrementItem, removeItem, clearCart, clearAndAdd, reorder, updateItemNote,
      // الطلب المجمّع
      carts, restaurantsCount, isMulti, multiConfig, multiEnabled, maxRestaurants,
      canAddRestaurant, removeRestaurant, updateRestaurantInfo, refreshMultiConfig,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
