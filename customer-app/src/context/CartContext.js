import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { onLogout } from '../utils/session';
import { scheduleLocal } from '../utils/pushNotifications';

const CartContext = createContext({});
const CART_KEY = 'wasaly_cart_v1';
const REMINDER_KEY = 'wasaly_cart_reminder_id';
export const MAX_QTY = 99; // مطابق لتحقق السيرفر (1..99)

const lineKey = (item) => item.id + JSON.stringify((item.addons || item.selectedOptions || []).map(a => [a.id ?? null, a.name, a.group ?? null]));

export const linePrice = (i) => {
  const base = parseFloat(i.discount_price || i.price || 0);
  const addons = (i.addons || []).reduce((s, a) => s + parseFloat(a.price || 0), 0);
  return base + addons;
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [groupOrder, setGroupOrder] = useState(null); // { id, code } لو السلة مستوردة من طلب جماعي
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef(null);
  const reminderTimer = useRef(null);

  // استرجاع السلة المحفوظة عند فتح التطبيق
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CART_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.items?.length) {
            setItems(saved.items);
            setRestaurantId(saved.restaurantId || null);
            setRestaurantName(saved.restaurantName || '');
            setGroupOrder(saved.groupOrder || null);
          }
        }
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // حفظ السلة تلقائياً عند أي تغيير (بعد الاسترجاع)
  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(CART_KEY, JSON.stringify({ items, restaurantId, restaurantName, groupOrder })).catch(() => {});
    }, 300);
  }, [items, restaurantId, restaurantName, groupOrder, hydrated]);

  const cancelReminder = useCallback(async () => {
    try {
      const id = await AsyncStorage.getItem(REMINDER_KEY);
      if (id) {
        await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
        await AsyncStorage.removeItem(REMINDER_KEY);
      }
    } catch {}
  }, []);

  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  // تذكير السلة المتروكة — إشعار محلي بعد 90 دقيقة؛ يُعاد جدولته فقط عند تغيّر العدد (مع تأخير بسيط)
  useEffect(() => {
    if (!hydrated) return;
    clearTimeout(reminderTimer.current);
    reminderTimer.current = setTimeout(async () => {
      await cancelReminder();
      if (count > 0) {
        try {
          const id = await scheduleLocal({
            title: '🛒 سلتك بتنطرك!',
            body: `عندك ${count} صنف بالسلة${restaurantName ? ' من ' + restaurantName : ''} — كمّل طلبك قبل ما يبرد 😋`,
            data: { type: 'cart_reminder' },
          }, 90 * 60);
          if (id) await AsyncStorage.setItem(REMINDER_KEY, id);
        } catch {}
      }
    }, 1500);
    return () => clearTimeout(reminderTimer.current);
  }, [count, hydrated, restaurantName, cancelReminder]);

  const clearCart = useCallback(() => {
    setItems([]); setRestaurantId(null); setRestaurantName(''); setGroupOrder(null);
    AsyncStorage.removeItem(CART_KEY).catch(() => {});
  }, []);

  // تسجيل الخروج → إفراغ السلة + إلغاء التذكير
  useEffect(() => onLogout(async () => {
    clearCart();
    await cancelReminder();
  }), [clearCart, cancelReminder]);

  const addItem = useCallback((item, restaurant, qty = 1) => {
    if (restaurantId && restaurant?.id && String(restaurantId) !== String(restaurant.id)) {
      return { conflict: true, restaurant: restaurantName };
    }
    const q = Math.min(MAX_QTY, Math.max(1, parseInt(qty) || 1));
    if (restaurant?.id) setRestaurantId(restaurant.id);
    if (restaurant?.name_ar) setRestaurantName(restaurant.name_ar);
    setItems(prev => {
      const key = item._key || lineKey(item);
      const existing = prev.find(i => i._key === key);
      if (existing) return prev.map(i => i._key === key ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + q) } : i);
      return [...prev, { ...item, _key: key, quantity: q }];
    });
    return { success: true };
  }, [restaurantId, restaurantName]);

  const incrementItem = useCallback((key) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + 1) } : i));
  }, []);

  const removeItem = useCallback((key) => {
    setItems(prev => {
      const updated = prev.map(i => i._key === key ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0);
      if (updated.length === 0) { setRestaurantId(null); setRestaurantName(''); setGroupOrder(null); }
      return updated;
    });
  }, []);

  // استبدال السلة بالكامل (إعادة طلب / طلب جماعي)
  const reorder = useCallback((newItems, restaurant, meta = {}) => {
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name_ar || '');
    setGroupOrder(meta.groupOrder || null);
    const map = new Map();
    (newItems || []).forEach(it => {
      const key = lineKey(it);
      const q = Math.min(MAX_QTY, Math.max(1, parseInt(it.quantity) || 1));
      if (map.has(key)) map.get(key).quantity = Math.min(MAX_QTY, map.get(key).quantity + q);
      else map.set(key, { ...it, _key: key, quantity: q });
    });
    setItems(Array.from(map.values()));
  }, []);

  const clearAndAdd = useCallback((item, restaurant, qty = 1) => {
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name_ar || '');
    setGroupOrder(null);
    setItems([{ ...item, _key: lineKey(item), quantity: Math.min(MAX_QTY, Math.max(1, parseInt(qty) || 1)) }]);
  }, []);

  // تحديث ملاحظة صنف معيّن
  const updateItemNote = useCallback((key, note) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, notes: note } : i));
  }, []);

  const total = items.reduce((sum, i) => sum + linePrice(i) * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, restaurantId, restaurantName, groupOrder, total, count, hydrated,
      addItem, incrementItem, removeItem, clearCart, clearAndAdd, reorder, updateItemNote,
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
