import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  const load = () => {
    if (!restaurant.id) return setLoading(false);
    api.get(`/restaurants/${restaurant.id}/customers`)
      .then(r => setCustomers(r.data || []))
      .catch(() => toast.error('فشل تحميل الزبائن'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleVip = async (c) => {
    setBusy(c.id);
    try {
      if (c.is_vip) {
        await api.delete(`/restaurants/${restaurant.id}/vip/${c.id}`);
        toast.success('تمت الإزالة من المميزين');
      } else {
        await api.post(`/restaurants/${restaurant.id}/vip`, { customer_id: c.id });
        toast.success('⭐ تمت إضافته كزبون مميز — وصله إشعار');
      }
      setCustomers(prev => prev.map(x => x.id === c.id ? { ...x, is_vip: !x.is_vip } : x));
    } catch (e) { toast.error(e.message || 'فشل'); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">الزبائن 👥</h1>
      <p className="text-xs text-gray-400">علّم زبونك المميز ⭐ — بيوصله إشعار، ولما يطلب مرة ثانية بيجيك تنبيه لتجهّزله طلب مميز 🎁</p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16 text-gray-400"><p className="text-5xl mb-3">👥</p><p className="font-semibold">لا يوجد زبائن بعد</p></div>
      ) : (
        <div className="space-y-3">
          {customers.map(c => (
            <div key={c.id} className={`bg-white rounded-2xl p-4 shadow-soft border ${c.is_vip ? 'border-orange-300' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-black ${c.is_vip ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                    {c.is_vip ? '⭐' : (c.name?.[0] || '؟')}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm leading-none">{c.name || 'زبون'}</p>
                    <p className="text-xs text-gray-400 mt-1">{c.phone} · {c.orders} طلب</p>
                  </div>
                </div>
                <button onClick={() => toggleVip(c)} disabled={busy === c.id}
                  className={`px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${c.is_vip ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-orange-500 text-white'}`}>
                  {busy === c.id ? '...' : c.is_vip ? '★ مميز — إزالة' : '☆ تعيين مميز'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
