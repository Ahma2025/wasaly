import { createContext, useContext, useState, useEffect } from 'react';

const Ctx = createContext();

function loadCart() {
  try { return JSON.parse(localStorage.getItem('wasaly_cart') || '{}'); } catch { return {}; }
}

export function CartProvider({ children }) {
  const saved = loadCart();
  const [items, setItems] = useState(saved.items || []);
  const [restaurantId, setRestaurantId] = useState(saved.restaurantId || null);
  const [restaurantName, setRestaurantName] = useState(saved.restaurantName || '');

  useEffect(() => {
    localStorage.setItem('wasaly_cart', JSON.stringify({ items, restaurantId, restaurantName }));
  }, [items, restaurantId, restaurantName]);

  const add = (item, qty = 1, options = []) => {
    setItems(prev => {
      const key = item.id + JSON.stringify(options);
      const exists = prev.find(i => i._key === key);
      if (exists) return prev.map(i => i._key === key ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { ...item, qty, options, _key: key }];
    });
  };

  const remove = (key) => setItems(prev => prev.filter(i => i._key !== key));

  const updateQty = (key, qty) => {
    if (qty <= 0) { remove(key); return; }
    setItems(prev => prev.map(i => i._key === key ? { ...i, qty } : i));
  };

  const clear = () => { setItems([]); setRestaurantId(null); setRestaurantName(''); };

  const total = items.reduce((s, i) => {
    const base = parseFloat(i.discount_price || i.price);
    const extras = i.options.reduce((a, o) => a + parseFloat(o.extra_price || 0), 0);
    return s + (base + extras) * i.qty;
  }, 0);

  const count = items.reduce((s, i) => s + i.qty, 0);

  return (
    <Ctx.Provider value={{ items, restaurantId, restaurantName, setRestaurantId, setRestaurantName, add, remove, updateQty, clear, total, count }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => useContext(Ctx);
