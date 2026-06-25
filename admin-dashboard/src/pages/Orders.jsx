import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const STATUS_LABELS = { pending: 'انتظار', confirmed: 'مؤكد', preparing: 'تحضير', ready: 'جاهز', picked_up: 'استلمه السائق', delivered: 'تم التوصيل', cancelled: 'ملغي' };
const STATUS_COLORS = { pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', preparing: 'bg-purple-100 text-purple-700', ready: 'bg-cyan-100 text-cyan-700', picked_up: 'bg-orange-100 text-orange-700', delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' };

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchOrders(); }, [status]);

  const fetchOrders = async () => {
    try {
      const data = await api.get(`/admin/orders?status=${status}&limit=50`);
      setOrders(data.data);
    } catch { toast.error('خطأ'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4 p-6" dir="rtl">
      <h1 className="text-2xl font-bold">إدارة الطلبات</h1>

      <div className="flex gap-2 flex-wrap">
        {[['', 'الكل'], ...Object.entries(STATUS_LABELS)].map(([val, label]) => (
          <button key={val} onClick={() => setStatus(val)} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${status === val ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>{label}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3">رقم الطلب</th>
                <th className="px-4 py-3">الزبون</th>
                <th className="px-4 py-3">المطعم</th>
                <th className="px-4 py-3">المبلغ</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">طريقة الدفع</th>
                <th className="px-4 py-3">الوقت</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? [...Array(8)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
              )) : orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(selected?.id === o.id ? null : o)}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{o.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 font-medium">{o.customer_name}</td>
                  <td className="px-4 py-3 text-gray-600">{o.restaurant_name}</td>
                  <td className="px-4 py-3 font-bold text-orange-600">{parseFloat(o.total_amount).toFixed(2)}₪</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{o.payment_method}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(o.created_at).toLocaleString('ar')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-lg mb-4">تفاصيل الطلب</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">رقم الطلب</span><span className="font-mono text-xs">{selected.id}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">الزبون</span><span>{selected.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">المطعم</span><span>{selected.restaurant_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">المبلغ</span><span className="font-bold text-orange-600">{parseFloat(selected.total_amount).toFixed(2)}₪</span></div>
              <div className="flex justify-between"><span className="text-gray-500">رسوم التوصيل</span><span>{parseFloat(selected.delivery_fee || 0).toFixed(2)}₪</span></div>
              <div className="flex justify-between"><span className="text-gray-500">الحالة</span><span className={`px-2 py-0.5 rounded text-xs font-bold ${STATUS_COLORS[selected.status]}`}>{STATUS_LABELS[selected.status]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">الدفع</span><span>{selected.payment_method}</span></div>
              {selected.notes && <div className="flex justify-between"><span className="text-gray-500">ملاحظات</span><span>{selected.notes}</span></div>}
            </div>
            <button onClick={() => setSelected(null)} className="mt-4 w-full py-2 bg-gray-100 rounded-xl font-bold text-gray-700">إغلاق</button>
          </div>
        </div>
      )}
    </div>
  );
}
