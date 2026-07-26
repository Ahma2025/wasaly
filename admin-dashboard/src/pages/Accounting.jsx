import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const money = (n) => `${(parseFloat(n) || 0).toFixed(2)}₪`;

export default function Accounting() {
  const [data, setData] = useState({ totals: {}, restaurants: [], drivers: [] });
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState({});

  const load = () => api.get('/admin/accounting')
    .then(r => {
      setData({ totals: r.totals || {}, restaurants: r.restaurants || [], drivers: r.drivers || [] });
      const rt = {}; (r.restaurants || []).forEach(x => { rt[x.id] = x.commission_rate; });
      setRates(rt);
    })
    .catch(() => toast.error('فشل التحميل'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const saveRate = async (id) => {
    const rate = parseFloat(rates[id]);
    if (isNaN(rate) || rate < 0 || rate > 100) return toast.error('نسبة غير صحيحة');
    try { await api.patch(`/admin/restaurants/${id}/commission`, { rate }); toast.success('تم تحديث العمولة'); load(); }
    catch { toast.error('فشل'); }
  };

  const t = data.totals;

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">المحاسبة والعمولات 💰</h1>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : (
        <>
          {/* ملخّص */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white shadow-card">
              <p className="text-white/80 text-xs">💰 عمولتك (إيراد المنصّة)</p>
              <p className="text-2xl font-black mt-1">{money(t.commission)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-card">
              <p className="text-white/80 text-xs">📊 إجمالي المبيعات</p>
              <p className="text-2xl font-black mt-1">{money(t.sales)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white shadow-card">
              <p className="text-white/80 text-xs">🏪 صافي للمطاعم</p>
              <p className="text-2xl font-black mt-1">{money(t.restaurant_net)}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-4 text-white shadow-card">
              <p className="text-white/80 text-xs">🛵 أرباح السائقين</p>
              <p className="text-2xl font-black mt-1">{money(t.driver_earnings)}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 text-center">محسوبة من الطلبات المسلّمة · {t.orders || 0} طلب</p>

          {/* المطاعم */}
          <h2 className="font-black text-gray-900 mt-2">المطاعم 🏪</h2>
          {data.restaurants.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">لا توجد مبيعات مسلّمة بعد</p>
          ) : data.restaurants.map(r => (
            <div key={r.id} className="bg-white rounded-2xl p-4 shadow-soft border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-gray-900 text-sm">{r.name}</p>
                <span className="text-xs text-gray-400">{r.orders} طلب</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><p className="text-gray-400">المبيعات</p><p className="font-black text-gray-800">{money(r.sales)}</p></div>
                <div><p className="text-gray-400">عمولتك</p><p className="font-black text-orange-500">{money(r.commission)}</p></div>
                <div><p className="text-gray-400">صافي للمطعم</p><p className="font-black text-green-600">{money(r.net)}</p></div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <label className="text-xs text-gray-500">نسبة العمولة %</label>
                <input type="number" min="0" max="100" step="0.5"
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center"
                  value={rates[r.id] ?? ''} onChange={e => setRates(p => ({ ...p, [r.id]: e.target.value }))} />
                <button onClick={() => saveRate(r.id)} className="bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg">حفظ</button>
              </div>
            </div>
          ))}

          {/* السائقون */}
          <h2 className="font-black text-gray-900 mt-2">السائقون 🛵</h2>
          {data.drivers.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">لا توجد توصيلات بعد</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-hidden">
              {data.drivers.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-sm">🛵</div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm leading-none">{d.name || 'سائق'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{d.deliveries} توصيلة</p>
                    </div>
                  </div>
                  <p className="font-black text-purple-600 text-sm">{money(d.earnings)}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
