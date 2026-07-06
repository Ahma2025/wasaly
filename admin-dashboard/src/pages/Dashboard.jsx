import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../utils/api';
import toast from 'react-hot-toast';

const StatCard = ({ icon, label, value, sub, color }) => (
  <div className={`rounded-2xl p-4 text-white ${color}`}>
    <div className="text-2xl mb-2">{icon}</div>
    <p className="text-white/80 text-xs">{label}</p>
    <p className="text-2xl font-black mt-0.5">{value ?? '-'}</p>
    {sub && <p className="text-white/70 text-xs mt-1">{sub}</p>}
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(r => setData(r.data))
      .catch(e => { console.error(e); toast.error('فشل تحميل البيانات'); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>;

  const statusLabels = { pending: 'قيد الانتظار', confirmed: 'مقبول', preparing: 'يُحضَّر', on_the_way: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي' };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">لوحة التحكم</h1>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon="👥" label="المستخدمون" value={data?.totalUsers} color="bg-gradient-to-br from-blue-500 to-blue-600" />
        <StatCard icon="🏪" label="المطاعم" value={data?.totalRestaurants} color="bg-gradient-to-br from-green-500 to-green-600" />
        <StatCard icon="📦" label="طلبات اليوم" value={data?.ordersToday} color="bg-gradient-to-br from-orange-500 to-orange-600" />
        <StatCard icon="🛵" label="سائقون متصلون" value={data?.activeDrivers} color="bg-gradient-to-br from-purple-500 to-purple-600" />
      </div>

      {/* Today Revenue */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-5 text-white">
        <p className="text-white/80 text-sm">إيرادات اليوم</p>
        <p className="text-4xl font-black">{parseFloat(data?.revenueToday || 0).toFixed(2)}₪</p>
        {data?.pendingOrders > 0 && (
          <p className="text-white/80 text-sm mt-2">⏳ {data.pendingOrders} طلبات قيد الانتظار</p>
        )}
      </div>

      {/* Weekly Revenue Chart */}
      {data?.weeklyRevenue?.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">إيرادات آخر 7 أيام</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.weeklyRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip formatter={v => [`${parseFloat(v).toFixed(2)}₪`, 'الإيراد']} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fill="#FF6B0020" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center text-gray-400 border border-gray-100">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">لا توجد بيانات إيرادات بعد</p>
        </div>
      )}

      {/* Orders by status */}
      {data?.ordersByStatus?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">الطلبات حسب الحالة</h2>
          <div className="space-y-2">
            {data.ordersByStatus.map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{statusLabels[s.status] || s.status}</span>
                <span className="font-bold text-orange-500">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
