import React, { createContext, useContext, useState, useCallback } from 'react';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');

  const addItem = useCallback((item, restaurant) => {
    if (restaurantId && restaurantId !== restaurant.id) {
      return { conflict: true, restaurant: restaurantName };
    }
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name_ar);
    setItems(prev => {
      const key = item.id + JSON.stringify(item.selectedOptions || []);
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

  const clearCart = () => { setItems([]); setRestaurantId(null); setRestaurantName(''); };

  const clearAndAdd = (item, restaurant) => {
    clearCart();
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name_ar);
    setItems([{ ...item, _key: item.id, quantity: 1 }]);
  };

  const total = items.reduce((sum, i) => sum + (i.discount_price || i.price) * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, restaurantId, restaurantName, total, count, addItem, removeItem, clearCart, clearAndAdd }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
