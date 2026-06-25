import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';
import toast from 'react-hot-toast';

const STATUS = {
  pending: { label: 'جديد', next: 'confirmed', nextLabel: 'قبول', color: 'border-yellow-400 bg-yellow-50' },
  confirmed: { label: 'مؤكد', next: 'preparing', nextLabel: 'بدء التحضير', color: 'border-blue-400 bg-blue-50' },
  preparing: { label: 'يُحضَّر', next: 'ready', nextLabel: 'جاهز', color: 'border-purple-400 bg-purple-50' },
  ready: { label: 'جاهز', next: null, nextLabel: null, color: 'border-green-400 bg-green-50' },
  delivered: { label: 'مُسلَّم', color: 'border-gray-200 bg-gray-50' },
  cancelled: { label: 'ملغى', color: 'border-red-200 bg-red-50' }
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => {
    fetchOrders();
    const socket = io('http://localhost:5000', { auth: { token: localStorage.getItem('token') } });
    socket.on('new_order', () => { fetchOrders(); toast.success('🔔 طلب جديد!'); });
    return () => socket.disconnect();
  }, [filter]);

  const fetchOrders = async () => {
    try {
      const statuses = filter === 'active' ? 'pending,confirmed,preparing,ready' : filter === 'done' ? 'delivered' : 'cancelled';
      const data = await api.get(`/restaurants/${restaurant.id}/orders?limit=50`);
      const filtered = filter === 'active'
        ? data.data.filter(o => ['pending','confirmed','preparing','ready'].includes(o.status))
        : filter === 'done' ? data.data.filter(o => o.status === 'delivered')
        : data.data.filter(o => o.status === 'cancelled');
      setOrders(filtered);
    } catch { toast.error('خطأ في تحميل الطلبات'); }
    finally { setLoading(false); }
  };

  const updateStatus = async (orderId, status) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
      toast.success('تم تحديث حالة الطلب');
    } catch { toast.error('خطأ في التحديث'); }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">الطلبات</h1>
        <button onClick={fetchOrders} className="text-orange-500 hover:text-orange-600 text-sm font-medium">🔄 تحديث</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {[{ id: 'active', label: 'النشطة' }, { id: 'done', label: 'المكتملة' }, { id: 'cancelled', label: 'الملغاة' }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${filter === f.id ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center py-10">جاري التحميل...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.length === 0 && <p className="text-gray-400 col-span-3 text-center py-10">لا توجد طلبات</p>}
          {orders.map(order => {
            const s = STATUS[order.status];
            return (
              <div key={order.id} className={`rounded-2xl border-2 p-4 space-y-3 ${s?.color}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">#{order.order_number}</p>
                    <p className="text-sm text-gray-500">{order.customer_name} • {order.customer_phone}</p>
                  </div>
                  <span className="text-lg font-bold text-orange-600">{parseFloat(order.total).toFixed(2)}₪</span>
                </div>

                <div className="text-sm text-gray-600">
                  <p>📍 {order.delivery_address}</p>
                  {order.notes && <p className="mt-1 text-orange-600">💬 {order.notes}</p>}
                </div>

                <div className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString('ar')}</div>

                {s?.next && (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(order.id, s.next)} className="flex-1 bg-orange-500 text-white rounded-xl py-2 text-sm font-bold hover:bg-orange-600 transition-colors">
                      {s.nextLabel}
                    </button>
                    {order.status === 'pending' && (
                      <button onClick={() => updateStatus(order.id, 'cancelled')} className="px-3 bg-red-100 text-red-600 rounded-xl text-sm font-bold hover:bg-red-200">
                        رفض
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
