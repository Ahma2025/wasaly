import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { BottomNav } from './Home';

const STATUS_MAP = {
  pending: { label: 'في الانتظار', color: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: 'مؤكد', color: 'bg-blue-100 text-blue-700' },
  preparing: { label: 'قيد التحضير', color: 'bg-purple-100 text-purple-700' },
  on_the_way: { label: 'في الطريق', color: 'bg-orange-100 text-orange-700' },
  delivered: { label: 'تم التسليم', color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'ملغي', color: 'bg-red-100 text-red-500' },
};

export default function Orders() {
  const nav = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const res = await api.get('/orders/my');
      setOrders(res.data || res || []);
    } catch { toast.error('فشل تحميل الطلبات'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <h1 className="font-black text-gray-900 text-lg">طلباتي 📦</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl animate-pulse">📦</div>
            <p className="mt-2">جاري التحميل...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-6xl mb-3">📭</div>
            <p className="font-bold text-lg">لا توجد طلبات بعد</p>
            <button onClick={() => nav('/')} className="mt-4 bg-orange-500 text-white font-black rounded-2xl px-6 py-3 text-sm">
              اطلب الآن
            </button>
          </div>
        ) : (
          orders.map(o => {
            const s = STATUS_MAP[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-600' };
            return (
              <div key={o.id} onClick={() => nav(`/order/${o.id}`)}
                className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-black text-gray-900">{o.restaurant_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">#{o.id} • {new Date(o.created_at).toLocaleDateString('ar-SA')}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.color}`}>{s.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">{o.items_count || ''} عناصر</p>
                  <p className="font-black text-orange-500">{parseFloat(o.total || o.total_amount || 0).toFixed(2)}₪</p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <BottomNav active="orders" />
    </div>
  );
}
