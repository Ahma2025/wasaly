import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import api from '../utils/api';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/analytics').then(r => setData(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>;

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">التحليلات</h1>

      {/* Monthly Revenue */}
      {data?.monthlyRevenue?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">الإيرادات الشهرية</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.monthlyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip formatter={v => [`${parseFloat(v).toFixed(2)}₪`]} />
              <Line type="monotone" dataKey="revenue" stroke="#FF6B00" strokeWidth={2} dot={{ fill: '#FF6B00' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Restaurants */}
      {data?.topRestaurants?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">🏆 أفضل المطاعم</h2>
          <div className="space-y-2">
            {data.topRestaurants.map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black
                  ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-500'}`}>
                  {i + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-gray-800">{r.name_ar}</span>
                <div className="text-right">
                  <p className="text-xs font-black text-orange-500">{r.orders} طلب</p>
                  <p className="text-xs text-green-600">{parseFloat(r.revenue || 0).toFixed(0)}₪</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Drivers */}
      {data?.topDrivers?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">🛵 أفضل السائقين</h2>
          <div className="space-y-2">
            {data.topDrivers.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black
                  ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : 'bg-gray-100 text-gray-500'}`}>
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                  <p className="text-xs text-gray-400">{d.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-orange-500">{d.orders} طلب</p>
                  <p className="text-xs text-green-600">{parseFloat(d.earnings || 0).toFixed(0)}₪</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders by status */}
      {data?.ordersByStatus?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">📦 الطلبات حسب الحالة</h2>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data.ordersByStatus} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis dataKey="status" type="category" tick={{ fontSize: 9 }} width={70} />
              <Tooltip />
              <Bar dataKey="count" fill="#FF6B00" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {(!data?.topRestaurants?.length && !data?.monthlyRevenue?.length) && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">📊</p>
          <p>لا توجد بيانات تحليلية بعد</p>
          <p className="text-sm mt-1">ستظهر البيانات بعد اكتمال أول طلب</p>
        </div>
      )}
    </div>
  );
}
