import React, { useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import api from '../utils/api';

const COLORS_CHART = ['#FF6B00', '#34C759', '#007AFF', '#FF9500', '#AF52DE'];

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/admin/dashboard'),
      api.get('/analytics/overview')
    ]).then(([d, a]) => { setData(d.data); setAnalytics(a.data); }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin h-12 w-12 rounded-full border-b-2 border-orange-500" /></div>;

  const statusData = data?.orders?.map(o => ({ name: o.status, value: parseInt(o.count) })) || [];

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-900">لوحة التحكم الرئيسية</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي المستخدمين', value: data?.totalUsers?.toLocaleString(), icon: '👥', color: 'from-blue-500 to-blue-600', change: '+12%' },
          { label: 'المطاعم النشطة', value: data?.totalRestaurants?.toLocaleString(), icon: '🏪', color: 'from-green-500 to-green-600', change: '+5%' },
          { label: 'إيرادات الشهر', value: `${parseFloat(data?.revenue?.total || 0).toFixed(2)}₪`, icon: '💰', color: 'from-orange-500 to-orange-600', change: '+23%' },
          { label: 'المناديب المتصلون', value: data?.activeDrivers, icon: '🛵', color: 'from-purple-500 to-purple-600', change: '' }
        ].map((card, i) => (
          <div key={i} className={`bg-gradient-to-br ${card.color} rounded-2xl p-5 text-white`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-3xl">{card.icon}</span>
              {card.change && <span className="text-xs bg-white/20 px-2 py-1 rounded-full">{card.change}</span>}
            </div>
            <p className="text-white/80 text-sm">{card.label}</p>
            <p className="text-2xl font-bold mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border">
          <h2 className="text-lg font-bold text-gray-900 mb-4">إيرادات آخر 30 يوم</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data?.dailyRevenue || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => [`${parseFloat(v).toFixed(2)}₪`]} />
              <Area type="monotone" dataKey="revenue" stroke="#FF6B00" fill="#FF6B0015" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Orders Status Pie */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <h2 className="text-lg font-bold text-gray-900 mb-4">توزيع الطلبات</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {statusData.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS_CHART[i % COLORS_CHART.length] }} />
                <span className="text-gray-600">{s.name}</span>
                <span className="font-bold mr-auto">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hourly Orders */}
      {analytics?.hourly?.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border">
          <h2 className="text-lg font-bold text-gray-900 mb-4">توزيع الطلبات بالساعة</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={analytics.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip labelFormatter={h => `${h}:00`} formatter={v => [v, 'طلبات']} />
              <Bar dataKey="orders" fill="#FF6B00" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Commission */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-6 text-white">
        <h2 className="text-lg font-bold mb-2">عمولة المنصة هذا الشهر</h2>
        <p className="text-4xl font-black">{parseFloat(data?.revenue?.commission || 0).toFixed(2)}₪</p>
        <p className="text-white/70 text-sm mt-1">من إجمالي مبيعات {parseFloat(data?.revenue?.total || 0).toFixed(2)}₪</p>
      </div>
    </div>
  );
}
