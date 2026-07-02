import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export default function Home() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();
  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [rRes, cRes] = await Promise.all([api.get('/restaurants'), api.get('/categories')]);
      setRestaurants(rRes.data || rRes || []);
      const cats = cRes.data || cRes || [];
      setCategories(Array.isArray(cats) ? cats : []);
    } catch { toast.error('فشل تحميل المطاعم'); }
    finally { setLoading(false); }
  };

  const filtered = (restaurants || []).filter(r => {
    const name = r.name_ar || r.name || '';
    const cuisine = r.category_name || r.cuisine_type || '';
    const matchSearch = !search || name.includes(search) || cuisine.includes(search);
    const matchCat = !catFilter || cuisine.includes(catFilter);
    return matchSearch && matchCat;
  });

  const open = filtered.filter(r => r.is_open == 1 || r.is_open === true);
  const closed = filtered.filter(r => !r.is_open || r.is_open == 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛵</span>
            <span className="font-black text-orange-500 text-xl">وصَلّي</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => nav('/cart')} className="relative">
              <span className="text-2xl">🛒</span>
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{count}</span>
              )}
            </button>
            <button onClick={() => nav('/profile')} className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-600 text-sm">
              {user?.name?.[0] || '؟'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Greeting */}
        <div className="bg-gradient-to-l from-orange-500 to-orange-400 rounded-2xl p-5 text-white">
          <p className="text-sm opacity-90">مرحباً {user?.name?.split(' ')[0]} 👋</p>
          <p className="text-xl font-black mt-1">شو تحب تاكل اليوم؟</p>
        </div>

        {/* Search */}
        <input
          type="text" placeholder="🔍  ابحث عن مطعم أو طبق..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 focus:border-orange-400 focus:outline-none bg-white text-right"
        />

        {/* Categories */}
        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCatFilter('')}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition ${!catFilter ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            >الكل</button>
            {categories.map(c => (
              <button key={c.id}
                onClick={() => setCatFilter(catFilter === c.name ? '' : c.name)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition ${catFilter === c.name ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
              >{c.icon} {c.name}</button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl animate-pulse">🍔</div>
            <p className="mt-2">جاري التحميل...</p>
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <div>
                <h2 className="font-black text-gray-800 text-lg mb-3">مفتوح الآن 🟢</h2>
                <div className="space-y-3">
                  {open.map(r => <RestaurantCard key={r.id} r={r} />)}
                </div>
              </div>
            )}
            {closed.length > 0 && (
              <div>
                <h2 className="font-black text-gray-500 text-lg mb-3">مغلق حالياً 🔴</h2>
                <div className="space-y-3 opacity-60">
                  {closed.map(r => <RestaurantCard key={r.id} r={r} />)}
                </div>
              </div>
            )}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl">😕</p>
                <p className="mt-2">لا توجد مطاعم</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <BottomNav active="home" />
    </div>
  );
}

function RestaurantCard({ r }) {
  const nav = useNavigate();
  return (
    <div
      onClick={() => nav(`/restaurant/${r.id}`)}
      className="bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition"
    >
      <div className="h-40 bg-gradient-to-br from-orange-100 to-orange-50 relative overflow-hidden">
        {(r.logo || r.logo_url) ? (
          <img src={r.logo || r.logo_url} alt={r.name_ar || r.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl">🍽️</div>
        )}
        {!(r.is_open == 1 || r.is_open === true) && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-black/60 text-white text-sm font-bold px-3 py-1 rounded-full">مغلق</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-900">{r.name_ar || r.name}</h3>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-yellow-400">⭐</span>
            <span className="font-bold text-gray-700">{parseFloat(r.rating || 0).toFixed(1)}</span>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{r.category_name || r.cuisine_type || 'مطعم'}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span>⏱️ {r.delivery_time_min || r.delivery_time || 30} دقيقة</span>
          <span>•</span>
          <span>🚚 {r.delivery_fee || 0}₪</span>
          {r.min_order && <><span>•</span><span>الحد الأدنى {r.min_order}₪</span></>}
        </div>
      </div>
    </div>
  );
}

export function BottomNav({ active }) {
  const nav = useNavigate();
  const { count } = useCart();
  const items = [
    { id: 'home', icon: '🏠', label: 'الرئيسية', path: '/' },
    { id: 'orders', icon: '📦', label: 'طلباتي', path: '/orders' },
    { id: 'cart', icon: '🛒', label: 'السلة', path: '/cart', badge: count },
    { id: 'profile', icon: '👤', label: 'حسابي', path: '/profile' },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex max-w-2xl mx-auto">
      {items.map(i => (
        <button key={i.id} onClick={() => nav(i.path)}
          className={`flex-1 py-3 flex flex-col items-center gap-0.5 relative transition ${active === i.id ? 'text-orange-500' : 'text-gray-400'}`}
        >
          <span className="text-xl">{i.icon}</span>
          <span className="text-xs font-bold">{i.label}</span>
          {i.badge > 0 && (
            <span className="absolute top-2 right-1/2 translate-x-4 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">{i.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
