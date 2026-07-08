import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';
import toast from 'react-hot-toast';
import OrderMap from '../components/OrderMap';
import { showBrowserNotification } from '../utils/pushNotifications';

const STATUS_LABELS = {
  pending: 'قيد الانتظار',
  confirmed: 'تم القبول',
  preparing: 'قيد التحضير',
  on_the_way: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي'
};

const STATUS_COLORS = {
  pending:    'bg-yellow-100 text-yellow-700 border-yellow-200',
  confirmed:  'bg-blue-100 text-blue-700 border-blue-200',
  preparing:  'bg-orange-100 text-orange-700 border-orange-200',
  on_the_way: 'bg-purple-100 text-purple-700 border-purple-200',
  delivered:  'bg-green-100 text-green-700 border-green-200',
  cancelled:  'bg-red-100 text-red-600 border-red-200'
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active');
  const [selected, setSelected] = useState(null);
  const socketRef = useRef(null);
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  useEffect(() => {
    const socket = io('https://burger-app-production.up.railway.app', {
      auth: { token: localStorage.getItem('token') }
    });
    socketRef.current = socket;
    socket.on('new_order', (order) => {
      if (order.restaurant_id === restaurant.id) {
        toast('🔔 طلب جديد!', { icon: '🛍️', duration: 6000 });
        showBrowserNotification('🛎️ طلب جديد!', `طلب #${order.order_number || ''} ينتظر موافقتك`, { order_id: order.order_id });
        fetchOrders();
      }
    });
    socket.on('order_updated', () => fetchOrders());
    return () => socket.disconnect();
  }, []);

  const fetchOrders = async () => {
    if (!restaurant.id) return setLoading(false);
    try {
      const statusMap = {
        active: 'pending,confirmed,preparing',
        on_the_way: 'on_the_way',
        past: 'delivered,cancelled'
      };
      const statusParam = statusMap[filter] || '';
      const r = await api.get(`/restaurants/${restaurant.id}/orders${statusParam ? `?status=${statusParam}` : ''}`);
      setOrders(r.data || []);
    } catch { toast.error('فشل تحميل الطلبات'); }
    finally { setLoading(false); }
  };

  // Accept order → calls /confirm which auto-assigns driver for delivery orders
  const acceptOrder = async (orderId) => {
    try {
      await api.patch(`/orders/${orderId}/confirm`);
      toast.success('✅ تم قبول الطلب وبدأ البحث عن سائق');
      fetchOrders();
    } catch (e) { toast.error(e.message || 'فشل القبول'); }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      const msgs = {
        preparing: 'جاري التحضير 🍳',
        on_the_way: 'الطلب في الطريق إلى الزبون 🛵',
        delivered: 'تم التوصيل بنجاح ✅'
      };
      toast.success(msgs[newStatus] || 'تم تحديث الحالة');
      fetchOrders();
      if (selected?.id === orderId) setSelected(s => ({ ...s, status: newStatus }));
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const cancelOrder = async (orderId) => {
    if (!confirm('هل تريد إلغاء هذا الطلب؟')) return;
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'cancelled' });
      toast.success('تم إلغاء الطلب');
      fetchOrders();
      setSelected(null);
    } catch (e) { toast.error(e.message || 'فشل الإلغاء'); }
  };

  const FILTERS = [
    { key: 'active', label: '🔥 نشط' },
    { key: 'on_the_way', label: '🛵 في الطريق' },
    { key: 'past', label: '📋 السابقة' }
  ];

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">الطلبات</h1>

      <div className="flex gap-2">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setLoading(true); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${filter === f.key ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">📭</p>
          <p className="font-semibold">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              token={localStorage.getItem('token')}
              isExpanded={selected?.id === order.id}
              onToggle={() => setSelected(selected?.id === order.id ? null : order)}
              onAccept={acceptOrder}
              onUpdateStatus={updateStatus}
              onCancel={cancelOrder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, token, isExpanded, onToggle, onAccept, onUpdateStatus, onCancel }) {
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');
  const isDelivery = order.order_type === 'delivery';

  // Determine next action based on status + type
  const getActions = () => {
    if (order.status === 'pending') return [{
      label: '✅ قبول الطلب وبدء التحضير',
      color: 'bg-orange-500 text-white',
      onClick: () => onAccept(order.id)
    }];
    if (order.status === 'confirmed') {
      if (isDelivery) return [{
        label: '⏳ بانتظار قبول السائق...',
        color: 'bg-gray-200 text-gray-500 cursor-not-allowed',
        onClick: () => {}
      }];
      return [{
        label: '🍳 بدء التحضير',
        color: 'bg-blue-500 text-white',
        onClick: () => onUpdateStatus(order.id, 'preparing')
      }];
    }
    if (order.status === 'preparing') {
      if (isDelivery) return [{
        label: '🛵 السائق أخذ الطلب - في الطريق',
        color: 'bg-purple-500 text-white',
        onClick: () => onUpdateStatus(order.id, 'on_the_way')
      }];
      else return [{
        label: '✅ تم استلام الطلب من المحل',
        color: 'bg-green-500 text-white',
        onClick: () => onUpdateStatus(order.id, 'delivered')
      }];
    }
    return [];
  };

  const actions = getActions();

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Card Header */}
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-gray-900">#{order.id}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isDelivery ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                {isDelivery ? '🛵 توصيل' : '🏃 استلام'}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-1">{order.customer_name || 'زبون'}</p>
            {order.customer_phone && (
              <a href={`tel:${order.customer_phone}`} className="text-xs text-blue-500 font-semibold" onClick={e => e.stopPropagation()}>
                📞 {order.customer_phone}
              </a>
            )}
          </div>
          <div className="text-left flex-shrink-0">
            <p className="font-black text-orange-500 text-lg">{parseFloat(order.total || 0).toFixed(0)}₪</p>
            <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}</p>
            <p className="text-lg mt-1">{isExpanded ? '▲' : '▼'}</p>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">

          {/* Live Map */}
          <OrderMap
            token={token}
            order={{
              ...order,
              restaurant_lat: restaurant.lat,
              restaurant_lng: restaurant.lng,
              restaurant_name: restaurant.name_ar,
            }}
          />

          {/* Customer Info */}
          <div className="bg-white rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-bold text-gray-500 uppercase">معلومات الزبون</p>
            <p className="text-sm font-bold text-gray-800">{order.customer_name}</p>
            <a href={`tel:${order.customer_phone}`} className="text-sm text-blue-600 font-semibold block">
              📞 {order.customer_phone}
            </a>
            {order.delivery_address && (
              <p className="text-xs text-gray-600">📍 {order.delivery_address}</p>
            )}
            <p className="text-xs text-gray-500">{order.payment_method === 'cash' ? '💵 دفع نقداً' : '💳 دفع بطاقة'}</p>
          </div>

          {/* Order Items */}
          <OrderItems orderId={order.id} />

          {/* Price Summary */}
          <OrderSummary order={order} isDelivery={isDelivery} />

          {/* Notes */}
          {order.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs font-bold text-yellow-700">ملاحظات الزبون:</p>
              <p className="text-sm text-yellow-800 mt-0.5">{order.notes}</p>
            </div>
          )}

          {/* Driver info */}
          {order.status === 'preparing' && isDelivery && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-bold text-blue-700">
                {order.driver_id ? '🛵 تم تعيين سائق - في انتظار الوصول للمطعم' : '⏳ جاري البحث عن سائق...'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {actions.map((action, i) => (
              <button key={i} onClick={action.onClick}
                className={`w-full py-3 rounded-xl font-bold text-sm ${action.color}`}>
                {action.label}
              </button>
            ))}
            {['pending', 'confirmed', 'preparing'].includes(order.status) && (
              <button onClick={() => onCancel(order.id)}
                className="w-full bg-red-50 text-red-500 border border-red-200 py-2.5 rounded-xl font-bold text-sm">
                ❌ إلغاء الطلب
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderSummary({ order, isDelivery }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get(`/orders/${order.id}`).then(r => setItems(r.data?.items || [])).catch(() => {});
  }, [order.id]);

  const itemsSubtotal = items.reduce((sum, item) => {
    let opts = [];
    try { opts = typeof item.options === 'string' ? JSON.parse(item.options) : (item.options || []); } catch {}
    const addonsPrice = opts.reduce((s, o) => s + parseFloat(o.price || 0), 0);
    return sum + (parseFloat(item.price || 0) + addonsPrice) * item.quantity;
  }, 0);

  const subtotal = items.length > 0 ? itemsSubtotal : parseFloat(order.subtotal || 0);
  const deliveryFee = parseFloat(order.delivery_fee || 0);
  const discount = parseFloat(order.discount || 0);
  const total = subtotal + (isDelivery ? deliveryFee : 0) - discount;

  return (
    <div className="bg-white rounded-xl p-3 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">المجموع الفرعي</span>
        <span className="font-semibold">{subtotal.toFixed(2)}₪</span>
      </div>
      {isDelivery && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">رسوم التوصيل</span>
          <span className="font-semibold">{deliveryFee.toFixed(2)}₪</span>
        </div>
      )}
      {discount > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>خصم</span>
          <span>-{discount.toFixed(2)}₪</span>
        </div>
      )}
      <div className="flex justify-between font-black text-base border-t pt-1 mt-1">
        <span>الإجمالي</span>
        <span className="text-orange-500">{total.toFixed(2)}₪</span>
      </div>
    </div>
  );
}

function OrderItems({ orderId }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get(`/orders/${orderId}`).then(r => setItems(r.data?.items || [])).catch(() => {});
  }, [orderId]);

  if (!items.length) return null;

  return (
    <div className="bg-white rounded-xl p-3">
      <p className="text-xs font-bold text-gray-500 mb-2 uppercase">الأصناف</p>
      <div className="space-y-3">
        {items.map((item, i) => {
          // options محفوظة كـ JSON string أو array
          let opts = [];
          try {
            opts = typeof item.options === 'string' ? JSON.parse(item.options) : (item.options || []);
          } catch {}

          return (
            <div key={i} className="border-b border-gray-50 pb-2 last:border-0 last:pb-0">
              <div className="flex justify-between items-start">
                <span className="text-sm text-gray-800 font-bold">{item.quantity}× {item.name_ar}</span>
                <span className="text-sm font-bold text-orange-500">{parseFloat(item.subtotal || item.price * item.quantity || 0).toFixed(2)}₪</span>
              </div>

              {/* الإضافات */}
              {opts.length > 0 && (
                <div className="mt-1.5 space-y-0.5 pr-3">
                  {opts.map((opt, j) => (
                    <div key={j} className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        ✚ {opt.name_ar || opt.name || opt.label || opt}
                      </span>
                      {(opt.price > 0) && (
                        <span className="text-xs text-gray-400">+{parseFloat(opt.price).toFixed(2)}₪</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ملاحظة الصنف */}
              {item.notes && (
                <p className="text-xs text-amber-600 mt-1 pr-3">📝 {item.notes}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

