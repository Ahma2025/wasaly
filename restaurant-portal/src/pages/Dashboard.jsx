import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [statsData, ordersData] = await Promise.all([
        api.get(`/restaurants/${restaurant.id}/stats`),
        api.get(`/restaurants/${restaurant.id}/orders?limit=5`)
      ]);
      setStats(statsData.data);
      setOrders(ordersData.data);
    } catch (e) { toast.error('خطأ في تحميل البيانات'); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div></div>;

  const statusLabels = { pending: 'معلق', confirmed: 'مؤكد', preparing: 'يُحضَّر', delivered: 'مُسلَّم', cancelled: 'ملغى' };
  const statusColors = { pending: 'bg-yellow-100 text-yellow-800', confirmed: 'bg-blue-100 text-blue-800', preparing: 'bg-purple-100 text-purple-800', delivered: 'bg-green-100 text-green-800', cancelled: 'bg-red-100 text-red-800' };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">لوحة التحكم</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الطلبات', value: stats?.ordersByStatus?.reduce((s, o) => s + parseInt(o.count), 0) || 0, icon: '📦', color: 'bg-blue-500' },
          { label: 'الإيرادات هذا الشهر', value: `${parseFloat(stats?.sales?.reduce((s, d) => s + parseFloat(d.revenue), 0) || 0).toFixed(2)}₪`, icon: '💰', color: 'bg-green-500' },
          { label: 'متوسط التقييم', value: restaurant.rating?.toFixed(1) || '0', icon: '⭐', color: 'bg-yellow-500' },
          { label: 'أكثر صنف مبيعاً', value: stats?.topItems?.[0]?.name_ar || '-', icon: '🏆', color: 'bg-orange-500' }
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className={`${card.color} w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4`}>{card.icon}</div>
            <p className="text-gray-500 text-sm">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 truncate">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      {stats?.sales?.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 mb-4">الإيرادات اليومية</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={stats.sales}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v}₪`, 'الإيراد']} />
              <Bar dataKey="revenue" fill="#FF6B00" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">آخر الطلبات</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead><tr className="text-gray-500 text-sm border-b">
              <th className="pb-3 font-medium">رقم الطلب</th>
              <th className="pb-3 font-medium">الزبون</th>
              <th className="pb-3 font-medium">المبلغ</th>
              <th className="pb-3 font-medium">الحالة</th>
              <th className="pb-3 font-medium">الوقت</th>
            </tr></thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-mono text-sm">#{order.order_number}</td>
                  <td className="py-3 text-sm">{order.customer_name}</td>
                  <td className="py-3 font-bold text-orange-600">{parseFloat(order.total).toFixed(2)}₪</td>
                  <td className="py-3"><span className={`px-2 py-1 rounded-lg text-xs font-semibold ${statusColors[order.status]}`}>{statusLabels[order.status]}</span></td>
                  <td className="py-3 text-xs text-gray-400">{new Date(order.created_at).toLocaleString('ar')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
