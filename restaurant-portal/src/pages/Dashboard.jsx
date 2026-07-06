import React, { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('week'); // week | month
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => {
    if (!restaurant.id) return setLoading(false);
    api.get(`/restaurants/${restaurant.id}/stats`)
      .then(r => setStats(r.data))
      .catch(e => { console.error(e); toast.error('فشل تحميل البيانات'); })
      .finally(() => setLoading(false));
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const sales = stats?.sales || [];

  const todaySales = sales.find(d => d.date === todayStr);
  const todayRevenue = parseFloat(todaySales?.revenue || 0);
  const todayOrders = parseInt(todaySales?.count || 0);

  // Last 7 days vs previous 7 days
  const last7 = sales.slice(-7);
  const prev7 = sales.slice(-14, -7);
  const last7Revenue = last7.reduce((s, d) => s + parseFloat(d.revenue || 0), 0);
  const prev7Revenue = prev7.reduce((s, d) => s + parseFloat(d.revenue || 0), 0);
  const weekGrowth = prev7Revenue > 0 ? ((last7Revenue - prev7Revenue) / prev7Revenue * 100).toFixed(0) : null;

  const totalRevenue = sales.reduce((s, d) => s + parseFloat(d.revenue || 0), 0);
  const totalOrders = sales.reduce((s, d) => s + parseInt(d.count || 0), 0);
  const avgOrder = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;

  const deliveredCount = stats?.ordersByStatus?.find(s => s.status === 'delivered')?.count || 0;
  const cancelledCount = stats?.ordersByStatus?.find(s => s.status === 'cancelled')?.count || 0;

  const chartData = view === 'week' ? last7 : sales;
  const topItems = stats?.topItems || [];
  const maxSold = topItems[0]?.sold || 1;

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" />
    </div>
  );

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900">الرئيسية</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${restaurant.is_open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {restaurant.is_open ? '🟢 مفتوح' : '🔴 مغلق'}
        </span>
      </div>

      {/* Today Highlight */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-4 text-white">
        <p className="text-white/80 text-xs font-semibold mb-2">اليوم</p>
        <div className="flex justify-between items-end">
          <div>
            <p className="text-3xl font-black">{todayRevenue.toFixed(0)}₪</p>
            <p className="text-white/80 text-sm mt-1">{todayOrders} طلب</p>
          </div>
          {weekGrowth !== null && (
            <div className={`text-xs font-bold px-2 py-1 rounded-xl ${parseFloat(weekGrowth) >= 0 ? 'bg-green-400/30 text-white' : 'bg-red-400/30 text-white'}`}>
              {parseFloat(weekGrowth) >= 0 ? '↑' : '↓'} {Math.abs(weekGrowth)}% مقارنة بالأسبوع الماضي
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs">إيرادات الشهر</p>
          <p className="text-xl font-black text-gray-900 mt-1">{totalRevenue.toFixed(0)}₪</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs">طلبات الشهر</p>
          <p className="text-xl font-black text-gray-900 mt-1">{totalOrders}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs">متوسط الطلب</p>
          <p className="text-xl font-black text-gray-900 mt-1">{avgOrder}₪</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-gray-400 text-xs">تم التوصيل</p>
          <p className="text-xl font-black text-green-600 mt-1">{deliveredCount}</p>
        </div>
      </div>

      {/* Revenue Chart */}
      {sales.length > 0 ? (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">الإيرادات</h2>
            <div className="flex gap-1">
              <button onClick={() => setView('week')}
                className={`text-xs px-3 py-1 rounded-lg font-bold ${view === 'week' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                أسبوع
              </button>
              <button onClick={() => setView('month')}
                className={`text-xs px-3 py-1 rounded-lg font-bold ${view === 'month' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                شهر
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="date" tick={{ fontSize: 8 }} tickFormatter={d => d?.slice(5)} />
              <YAxis tick={{ fontSize: 8 }} />
              <Tooltip formatter={v => [`${parseFloat(v).toFixed(0)}₪`, 'الإيراد']} labelFormatter={l => l?.slice(5)} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fill="#FF6B0020" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
          <p className="text-4xl mb-2">📊</p>
          <p className="text-gray-400 font-semibold">لا توجد بيانات بعد</p>
          <p className="text-xs text-gray-400 mt-1">ستظهر الإحصائيات بعد أول طلب</p>
        </div>
      )}

      {/* Weekly Comparison */}
      {last7.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-1">📅 آخر 7 أيام</h2>
          <div className="flex gap-4 mb-3">
            <div>
              <p className="text-xs text-gray-400">هذا الأسبوع</p>
              <p className="font-black text-orange-500">{last7Revenue.toFixed(0)}₪</p>
            </div>
            {prev7Revenue > 0 && (
              <div>
                <p className="text-xs text-gray-400">الأسبوع الماضي</p>
                <p className="font-black text-gray-500">{prev7Revenue.toFixed(0)}₪</p>
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={last7}>
              <XAxis dataKey="date" tick={{ fontSize: 8 }} tickFormatter={d => d?.slice(5)} />
              <Tooltip formatter={v => [`${parseFloat(v).toFixed(0)}₪`]} labelFormatter={l => l?.slice(5)} />
              <Bar dataKey="revenue" fill="#FF6B00" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Items */}
      {topItems.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">🏆 الأصناف الأكثر مبيعاً</h2>
          <div className="space-y-3">
            {topItems.map((item, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0
                    ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-200 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-800 font-semibold">{item.name_ar}</span>
                  <span className="text-sm font-black text-orange-500">{item.sold} مباع</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${i === 0 ? 'bg-orange-500' : i === 1 ? 'bg-orange-400' : 'bg-orange-300'}`}
                    style={{ width: `${Math.min(100, (item.sold / maxSold) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders by Status */}
      {stats?.ordersByStatus?.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-3">📦 حالات الطلبات</h2>
          <div className="space-y-2">
            {stats.ordersByStatus.map((s, i) => {
              const labels = { pending: 'قيد الانتظار', confirmed: 'تم القبول', preparing: 'يُحضَّر', on_the_way: 'في الطريق', delivered: 'مكتمل', cancelled: 'ملغي' };
              const colors = { pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', preparing: 'bg-orange-100 text-orange-700', on_the_way: 'bg-purple-100 text-purple-700', delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-600' };
              const total = stats.ordersByStatus.reduce((sum, x) => sum + parseInt(x.count || 0), 0);
              const pct = total > 0 ? Math.round((parseInt(s.count) / total) * 100) : 0;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold w-24 text-center flex-shrink-0 ${colors[s.status] || 'bg-gray-100 text-gray-600'}`}>
                    {labels[s.status] || s.status}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-black text-gray-700 w-6 text-left">{s.count}</span>
                </div>
              );
            })}
          </div>
          {cancelledCount > 0 && (
            <p className="text-xs text-red-400 mt-2">❗ {cancelledCount} طلب ملغي - راجع أسباب الإلغاء</p>
          )}
        </div>
      )}
    </div>
  );
}
