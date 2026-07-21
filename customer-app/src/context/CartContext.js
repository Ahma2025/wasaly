import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const CartContext = createContext();
const CART_KEY = 'wasaly_cart_v1';

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef(null);
  const reminderId = useRef(null);

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
      AsyncStorage.setItem(CART_KEY, JSON.stringify({ items, restaurantId, restaurantName })).catch(() => {});
    }, 300);
  }, [items, restaurantId, restaurantName, hydrated]);

  // تذكير السلة المتروكة — إشعار محلي بعد 90 دقيقة، يُلغى عند إفراغ السلة
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        if (reminderId.current) {
          await Notifications.cancelScheduledNotificationAsync(reminderId.current);
          reminderId.current = null;
        }
        const n = items.reduce((s, i) => s + i.quantity, 0);
        if (n > 0) {
          reminderId.current = await Notifications.scheduleNotificationAsync({
            content: {
              title: '🛒 سلتك بتنطرك!',
              body: `عندك ${n} صنف بالسلة${restaurantName ? ' من ' + restaurantName : ''} — كمّل طلبك قبل ما يبرد 😋`,
            },
            trigger: { seconds: 90 * 60 },
          });
        }
      } catch {}
    })();
  }, [items, hydrated, restaurantName]);

  const addItem = useCallback((item, restaurant) => {
    if (restaurantId && restaurantId !== restaurant.id) {
      return { conflict: true, restaurant: restaurantName };
    }
    setRestaurantId(restaurant.id);
    if (restaurant.name_ar) setRestaurantName(restaurant.name_ar);
    setItems(prev => {
      const key = item.id + JSON.stringify(item.addons || item.selectedOptions || []);
      const existing = prev.find(i => i._key === key);
      if (existing) return prev.map(i => i._key === key ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, _key: key, quantity: 1 }];
    });
    return { success: true };
  }, [restaurantId, restaurantName]);

  const removeItem = useCallback((key) => {
    setItems(prev => {
      const updated = prev.map(i => i._key === key ? { ...i, quantity: i.quantity - 1 } : i).filter(i => i.quantity > 0);
      if (updated.length === 0) { setRestaurantId(null); setRestaurantName(''); }
      return updated;
    });
  }, []);

  const clearCart = () => {
    setItems([]); setRestaurantId(null); setRestaurantName('');
    AsyncStorage.removeItem(CART_KEY).catch(() => {});
  };

  // إعادة طلب سابق كامل بضغطة — يستبدل السلة الحالية
  const reorder = (newItems, restaurant) => {
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name_ar || '');
    setItems((newItems || []).map(it => ({
      ...it,
      _key: it.id + JSON.stringify(it.addons || []),
      quantity: it.quantity || 1,
    })));
  };

  const clearAndAdd = (item, restaurant) => {
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name_ar);
    setItems([{ ...item, _key: item.id + JSON.stringify(item.addons || []), quantity: 1 }]);
  };

  // تحديث ملاحظة صنف معيّن
  const updateItemNote = (key, note) => {
    setItems(prev => prev.map(i => i._key === key ? { ...i, notes: note } : i));
  };

  const total = items.reduce((sum, i) => {
    const base = parseFloat(i.discount_price || i.price || 0);
    const addons = (i.addons || []).reduce((s, a) => s + parseFloat(a.price || 0), 0);
    return sum + (base + addons) * i.quantity;
  }, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, restaurantId, restaurantName, total, count, addItem, removeItem, clearCart, clearAndAdd, reorder, updateItemNote }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
