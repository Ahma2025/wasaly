import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';
import api from '../utils/api';

const STATUS_STEPS = [
  { key: 'pending', label: 'في الانتظار', icon: '⏳' },
  { key: 'confirmed', label: 'تم التأكيد', icon: '✅' },
  { key: 'preparing', label: 'قيد التحضير', icon: '👨‍🍳' },
  { key: 'on_the_way', label: 'في الطريق', icon: '🛵' },
  { key: 'delivered', label: 'تم التسليم', icon: '🎉' },
];

export default function OrderTracking() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    load();
    const token = localStorage.getItem('wasaly_token');
    const socket = io('https://snareless-diatonic-emmalynn.ngrok-free.dev', {
      auth: { token }, transports: ['websocket']
    });
    socketRef.current = socket;
    socket.on(`order_${id}_update`, data => {
      setOrder(prev => prev ? { ...prev, status: data.status } : prev);
      toast.success(`تحديث الطلب: ${data.status_label || data.status}`);
    });
    return () => socket.disconnect();
  }, [id]);

  const load = async () => {
    try {
      const res = await api.get(`/orders/${id}`);
      setOrder(res.data || res);
    } catch { toast.error('فشل تحميل الطلب'); }
    finally { setLoading(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center text-gray-400"><div className="text-5xl animate-pulse">🛵</div><p className="mt-2">جاري التحميل...</p></div>
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center"><p className="text-2xl">😕</p><p className="text-gray-500">لم يُعثر على الطلب</p></div>
    </div>
  );

  const currentIdx = STATUS_STEPS.findIndex(s => s.key === order.status);
  const isCancelled = order.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => nav('/orders')} className="text-2xl">←</button>
          <h1 className="font-black text-gray-900">تتبع الطلب #{id}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Status Card */}
        <div className={`rounded-3xl p-6 text-white text-center ${isCancelled ? 'bg-red-500' : 'bg-gradient-to-br from-orange-400 to-orange-600'}`}>
          <div className="text-5xl mb-3">
            {isCancelled ? '❌' : (STATUS_STEPS[currentIdx]?.icon || '📦')}
          </div>
          <p className="text-xl font-black">
            {isCancelled ? 'تم إلغاء الطلب' : (STATUS_STEPS[currentIdx]?.label || order.status)}
          </p>
          <p className="text-sm opacity-80 mt-1">طلب من {order.restaurant_name || order.restaurant_name_ar}</p>
        </div>

        {/* Progress Steps */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl p-5">
            <h2 className="font-black text-gray-800 mb-4">مراحل الطلب</h2>
            <div className="space-y-4">
              {STATUS_STEPS.map((step, idx) => {
                const done = idx <= currentIdx;
                const active = idx === currentIdx;
                return (
                  <div key={step.key} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 transition-all ${active ? 'bg-orange-500 scale-110 shadow-lg' : done ? 'bg-green-400' : 'bg-gray-100'}`}>
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <p className={`font-bold text-sm ${done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                    </div>
                    {done && !active && <span className="text-green-500 text-lg">✓</span>}
                    {active && <span className="text-orange-500 text-xs font-bold animate-pulse">الآن</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Driver Info */}
        {order.driver_name && (
          <div className="bg-white rounded-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center font-black text-orange-600 text-lg">
              {order.driver_name[0]}
            </div>
            <div>
              <p className="font-black text-gray-900">{order.driver_name}</p>
              <p className="text-sm text-gray-500">المندوب</p>
            </div>
            {order.driver_phone && (
              <a href={`tel:${order.driver_phone}`} className="mr-auto bg-orange-100 text-orange-600 rounded-xl px-3 py-2 text-sm font-bold">📞 اتصال</a>
            )}
          </div>
        )}

        {/* Order Items */}
        <div className="bg-white rounded-2xl p-4">
          <h2 className="font-black text-gray-800 mb-3">تفاصيل الطلب</h2>
          {(order.items || []).map((item, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
              <div>
                <p className="font-bold text-sm text-gray-900">{item.name} × {item.quantity}</p>
              </div>
              <p className="font-black text-orange-500 text-sm">{(parseFloat(item.price) * item.quantity).toFixed(2)}₪</p>
            </div>
          ))}
          <div className="flex justify-between mt-3 pt-2 border-t font-black text-gray-900">
            <span>المجموع</span>
            <span className="text-orange-500">{parseFloat(order.total || order.total_amount || 0).toFixed(2)}₪</span>
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-white rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 flex-shrink-0">العنوان:</span>
            <span className="font-bold text-gray-800">{order.delivery_address}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 flex-shrink-0">الدفع:</span>
            <span className="font-bold text-gray-800">{order.payment_method === 'cash' ? 'نقداً' : 'بطاقة'}</span>
          </div>
        </div>

        <button onClick={() => nav('/')} className="w-full border-2 border-orange-400 text-orange-500 font-black rounded-2xl py-3">
          طلب جديد
        </button>
      </div>
    </div>
  );
}
