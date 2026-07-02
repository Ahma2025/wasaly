import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const STATUS_LABELS = { pending: 'انتظار', confirmed: 'مؤكد', preparing: 'تحضير', ready: 'جاهز', picked_up: 'مع السائق', delivered: 'تم التوصيل', cancelled: 'ملغي' };
const STATUS_COLORS = { pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', preparing: 'bg-purple-100 text-purple-700', ready: 'bg-cyan-100 text-cyan-700', picked_up: 'bg-orange-100 text-orange-700', delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' };

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchOrders(); }, [status]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/admin/orders?status=${status}&limit=50`);
      setOrders(data.data || []);
    } catch { toast.error('خطأ'); }
    finally { setLoading(false); }
  };

  const formatDate = (d) => {
    try { return new Date(d).toLocaleString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return d; }
  };

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <h1 className="text-xl font-bold text-gray-900">الطلبات</h1>

      {/* Status Filter - scrollable horizontal */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[['', 'الكل'], ...Object.entries(STATUS_LABELS)].map(([val, label]) => (
          <button key={val} onClick={() => setStatus(val)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 transition ${status === val ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Order Cards */}
      <div className="space-y-3">
        {loading ? [...Array(6)].map((_, i) => <div key={i} className="h-24 bg-white rounded-2xl border animate-pulse" />)
          : orders.length === 0 ? <div className="text-center py-12 text-gray-400">لا توجد طلبات</div>
          : orders.map(o => (
          <div key={o.id} className="bg-white rounded-2xl border shadow-sm p-4 cursor-pointer active:bg-gray-50"
            onClick={() => setSelected(selected?.id === o.id ? null : o)}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-bold text-gray-900 text-sm">{o.customer_name || 'زبون'}</p>
                <p className="text-xs text-gray-500">{o.restaurant_name}</p>
              </div>
              <div className="text-left">
                <p className="font-black text-orange-600">{parseFloat(o.total || 0).toFixed(2)}₪</p>
                <p className="text-[10px] text-gray-400 text-left">{formatDate(o.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-600'}`}>
                {STATUS_LABELS[o.status] || o.status}
              </span>
              <span className="text-xs text-gray-400">{o.payment_method === 'cash' ? 'نقداً' : 'بطاقة'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-0"
          onClick={() => setSelected(null)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <h3 className="font-bold text-lg mb-4">تفاصيل الطلب</h3>
            <div className="space-y-3 text-sm">
              {[
                ['الزبون', selected.customer_name],
                ['المطعم', selected.restaurant_name],
                ['السائق', selected.driver_name || 'لم يُحدد'],
                ['المبلغ', `${parseFloat(selected.total || 0).toFixed(2)}₪`],
                ['رسوم التوصيل', `${parseFloat(selected.delivery_fee || 0).toFixed(2)}₪`],
                ['طريقة الدفع', selected.payment_method === 'cash' ? 'نقداً' : 'بطاقة'],
                ['التاريخ', formatDate(selected.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-2 border-b border-gray-50">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-semibold text-gray-900">{v}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-500">الحالة</span>
                <span className={`px-2 py-1 rounded-lg text-xs font-bold ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="mt-4 w-full py-3 bg-gray-100 rounded-2xl font-bold text-gray-700">إغلاق</button>
          </div>
        </div>
      )}
    </div>
  );
}
