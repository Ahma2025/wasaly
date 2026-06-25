import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchRestaurants(); }, [search]);

  const fetchRestaurants = async () => {
    try {
      const data = await api.get(`/restaurants?search=${search}&limit=50`);
      setRestaurants(data.data);
    } catch { toast.error('خطأ'); }
    finally { setLoading(false); }
  };

  const verify = async (id, verified) => {
    try {
      await api.patch(`/admin/restaurants/${id}/verify`, { verified });
      setRestaurants(prev => prev.map(r => r.id === id ? { ...r, is_verified: verified } : r));
      toast.success(verified ? 'تم التوثيق' : 'تم إلغاء التوثيق');
    } catch { toast.error('خطأ'); }
  };

  const feature = async (id, featured) => {
    try {
      await api.patch(`/admin/restaurants/${id}/feature`, { featured });
      setRestaurants(prev => prev.map(r => r.id === id ? { ...r, is_featured: featured } : r));
      toast.success(featured ? 'تم التمييز' : 'تم إلغاء التمييز');
    } catch { toast.error('خطأ'); }
  };

  return (
    <div className="space-y-4 p-6" dir="rtl">
      <h1 className="text-2xl font-bold">إدارة المطاعم</h1>

      <input placeholder="🔍 بحث عن مطعم..." className="border rounded-xl px-4 py-2 w-full max-w-md focus:outline-none focus:ring-2 focus:ring-orange-400" value={search} onChange={e => setSearch(e.target.value)} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? [...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-44 border" />
        )) : restaurants.map(r => (
          <div key={r.id} className="bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md transition">
            <div className="flex items-start gap-3 mb-3">
              {r.logo_url ? <img src={r.logo_url} alt={r.name} className="w-14 h-14 rounded-xl object-cover" /> : <div className="w-14 h-14 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">🏪</div>}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 truncate">{r.name}</h3>
                <p className="text-sm text-gray-500 truncate">{r.address}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-yellow-600 font-bold">⭐ {parseFloat(r.rating || 0).toFixed(1)}</span>
                  <span className="text-xs text-gray-400">({r.total_reviews || 0} تقييم)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${r.is_verified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.is_verified ? '✓ موثق' : 'غير موثق'}</span>
              {r.is_featured && <span className="px-2 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-700">⭐ مميز</span>}
              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${r.is_open ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{r.is_open ? 'مفتوح' : 'مغلق'}</span>
            </div>

            <div className="flex gap-2">
              <button onClick={() => verify(r.id, !r.is_verified)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${r.is_verified ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                {r.is_verified ? 'إلغاء التوثيق' : 'توثيق'}
              </button>
              <button onClick={() => feature(r.id, !r.is_featured)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${r.is_featured ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}>
                {r.is_featured ? 'إلغاء التمييز' : 'تمييز'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
