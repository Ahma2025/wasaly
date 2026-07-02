import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useCart } from '../context/CartContext';

export default function Restaurant() {
  const { id } = useParams();
  const nav = useNavigate();
  const { items: cartItems, add, restaurantId, setRestaurantId, setRestaurantName, clear, count } = useCart();
  const [restaurant, setRestaurant] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // item for addon modal

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    try {
      const res = await api.get(`/restaurants/${id}`);
      const data = res.data || res;
      setRestaurant(data);
      const menu = data.menu || data.categories || [];
      setCategories(Array.isArray(menu) ? menu : [menu].filter(Boolean));
      const firstCat = Array.isArray(menu) ? menu[0] : menu;
      if (firstCat) setActiveCategory(firstCat.id);
    } catch { toast.error('فشل تحميل المطعم'); }
    finally { setLoading(false); }
  };

  const addToCart = (item, options = []) => {
    if (restaurantId && restaurantId != id) {
      if (!window.confirm('سلتك تحتوي على طلب من مطعم آخر. هل تريد إعادة البدء؟')) return;
      clear();
    }
    setRestaurantId(id);
    setRestaurantName(restaurant?.name_ar || restaurant?.name || '');
    add(item, 1, options);
    toast.success(`تمت الإضافة: ${item.name}`);
    setModal(null);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center text-gray-400">
        <div className="text-5xl animate-pulse">🍽️</div>
        <p className="mt-2">جاري التحميل...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => nav(-1)} className="text-2xl">←</button>
          <span className="font-black text-gray-900">{restaurant?.name_ar || restaurant?.name}</span>
          <button onClick={() => nav('/cart')} className="relative text-2xl">
            🛒
            {count > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{count}</span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Restaurant Info */}
        <div className="bg-white p-4 mb-2">
          <div className="h-44 bg-gradient-to-br from-orange-100 to-orange-50 rounded-2xl overflow-hidden mb-4 flex items-center justify-center">
            {(restaurant?.logo || restaurant?.logo_url)
              ? <img src={restaurant.logo || restaurant.logo_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-7xl">🍽️</span>}
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-black text-xl text-gray-900">{restaurant?.name_ar || restaurant?.name}</h1>
              <p className="text-gray-500 text-sm">{restaurant?.category_name || restaurant?.cuisine_type}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${(restaurant?.is_open == 1 || restaurant?.is_open === true) ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
              {(restaurant?.is_open == 1 || restaurant?.is_open === true) ? 'مفتوح' : 'مغلق'}
            </span>
          </div>
          <div className="flex gap-4 mt-3 text-sm text-gray-600">
            <span>⭐ {parseFloat(restaurant?.rating || 0).toFixed(1)}</span>
            <span>⏱️ {restaurant?.delivery_time_min || restaurant?.delivery_time || 30} دقيقة</span>
            <span>🚚 {restaurant?.delivery_fee || 0}₪</span>
          </div>
        </div>

        {/* Category Tabs */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto bg-white px-4 py-3 mb-2 sticky top-14 z-10 scrollbar-hide shadow-sm">
            {categories.map(c => (
              <button key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition ${activeCategory === c.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >{c.name_ar || c.name}</button>
            ))}
          </div>
        )}

        {/* Items */}
        <div className="px-4 space-y-4">
          {categories
            .filter(c => !activeCategory || c.id === activeCategory)
            .map(cat => (
              <div key={cat.id}>
                <h2 className="font-black text-gray-800 text-lg mb-3">{cat.name_ar || cat.name}</h2>
                <div className="space-y-3">
                  {(cat.items || []).filter(i => i.is_available !== false && i.is_available != 0).map(item => (
                    <ItemCard key={item.id} item={item} onAdd={() => {
                      if (!(restaurant?.is_open == 1 || restaurant?.is_open === true)) { toast.error('المطعم مغلق حالياً'); return; }
                      if (item.options?.length > 0) setModal(item);
                      else addToCart(item);
                    }} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Cart Button */}
      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 max-w-2xl mx-auto">
          <button onClick={() => nav('/cart')}
            className="w-full bg-orange-500 text-white font-black rounded-2xl py-4 text-lg shadow-xl"
          >
            🛒 عرض السلة ({count} عناصر)
          </button>
        </div>
      )}

      {/* Addon Modal */}
      {modal && <AddonModal item={modal} onClose={() => setModal(null)} onAdd={addToCart} />}
    </div>
  );
}

function ItemCard({ item, onAdd }) {
  const cartItems = useCart().items;
  const qty = cartItems.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);
  return (
    <div className="bg-white rounded-2xl p-4 flex gap-3 shadow-sm">
      <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50 flex items-center justify-center">
        {(item.image || item.image_url)
          ? <img src={item.image || item.image_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-3xl">🍽️</span>}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-black text-gray-900 text-sm">{item.name_ar || item.name}</h3>
        {(item.description_ar || item.description) && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description_ar || item.description}</p>}
        <div className="flex items-center justify-between mt-2">
          <div>
            {item.discount_price ? (
              <div className="flex items-center gap-2">
                <span className="font-black text-orange-500">{item.discount_price}₪</span>
                <span className="text-xs text-gray-400 line-through">{item.price}₪</span>
              </div>
            ) : (
              <span className="font-black text-orange-500">{item.price}₪</span>
            )}
          </div>
          <button onClick={onAdd}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-lg font-black transition ${qty > 0 ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-500 hover:bg-orange-500 hover:text-white'}`}
          >
            {qty > 0 ? qty : '+'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddonModal({ item, onClose, onAdd }) {
  const [selections, setSelections] = useState({});

  const toggle = (groupId, opt, isMultiple) => {
    setSelections(prev => {
      if (isMultiple) {
        const cur = prev[groupId] || [];
        const exists = cur.find(o => o.id === opt.id);
        return { ...prev, [groupId]: exists ? cur.filter(o => o.id !== opt.id) : [...cur, opt] };
      } else {
        return { ...prev, [groupId]: [opt] };
      }
    });
  };

  const selected = Object.values(selections).flat();
  const price = parseFloat(item.discount_price || item.price) + selected.reduce((s, o) => s + parseFloat(o.extra_price || 0), 0);

  const doAdd = () => {
    const required = (item.options || []).filter(g => g.is_required);
    for (const g of required) {
      if (!(selections[g.id]?.length > 0)) { toast.error(`اختر ${g.name}`); return; }
    }
    onAdd(item, selected);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black text-gray-900 text-lg">{item.name}</h2>
          <button onClick={onClose} className="text-2xl text-gray-400">✕</button>
        </div>
        {(item.options || []).map(group => (
          <div key={group.id} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-black text-gray-800">{group.name}</h3>
              {group.is_required && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-bold">مطلوب</span>}
            </div>
            <div className="space-y-2">
              {(group.choices || []).map(opt => {
                const sel = selections[group.id] || [];
                const isSelected = sel.find(o => o.id === opt.id);
                return (
                  <label key={opt.id} className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition ${isSelected ? 'border-orange-400 bg-orange-50' : 'border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type={group.is_multiple ? 'checkbox' : 'radio'}
                        name={`group-${group.id}`}
                        checked={!!isSelected}
                        onChange={() => toggle(group.id, opt, group.is_multiple)}
                        className="accent-orange-500 w-4 h-4"
                      />
                      <span className="font-bold text-gray-800 text-sm">{opt.name}</span>
                    </div>
                    {opt.extra_price > 0 && <span className="text-orange-500 text-sm font-black">+{opt.extra_price}₪</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <button onClick={doAdd}
          className="w-full bg-orange-500 text-white font-black rounded-2xl py-4 text-lg"
        >
          إضافة للسلة — {price.toFixed(2)}₪
        </button>
      </div>
    </div>
  );
}
