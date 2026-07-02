import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export default function Cart() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { items, updateQty, remove, total, clear, restaurantId, restaurantName } = useCart();
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [newAddress, setNewAddress] = useState('');
  const [payment, setPayment] = useState('cash');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddAddr, setShowAddAddr] = useState(false);

  useEffect(() => { loadAddresses(); }, []);

  const loadAddresses = async () => {
    try {
      const res = await api.get('/users/addresses');
      const list = res.data || res || [];
      setAddresses(list);
      if (list[0]) setSelectedAddress(list[0].id);
    } catch {}
  };

  const addAddress = async () => {
    if (!newAddress.trim()) { toast.error('أدخل العنوان'); return; }
    try {
      const res = await api.post('/users/addresses', { address: newAddress, label: 'منزل' });
      const added = res.data || res;
      setAddresses(prev => [...prev, added]);
      setSelectedAddress(added.id);
      setNewAddress('');
      setShowAddAddr(false);
      toast.success('تم إضافة العنوان');
    } catch { toast.error('فشل إضافة العنوان'); }
  };

  const placeOrder = async () => {
    if (!user) { toast.error('يجب تسجيل الدخول أولاً'); nav('/login'); return; }
    if (items.length === 0) { toast.error('السلة فارغة'); return; }
    if (!selectedAddress && !newAddress) { toast.error('اختر عنوان التوصيل'); return; }

    setLoading(true);
    try {
      const addrObj = addresses.find(a => a.id === selectedAddress);
      const deliveryAddr = addrObj?.address || addrObj?.label || newAddress;

      const orderItems = items.map(i => ({
        id: i.id,
        quantity: i.qty,
        price: parseFloat(i.discount_price || i.price),
        options: i.options
      }));

      const res = await api.post('/orders', {
        restaurant_id: restaurantId,
        items: orderItems,
        delivery_address: deliveryAddr,
        payment_method: payment,
        notes,
        total_amount: total
      });

      const order = res.data || res;
      clear();
      toast.success('تم إرسال طلبك!');
      nav(`/order/${order.id || order.order?.id}`);
    } catch (err) {
      toast.error(err?.message || 'فشل إرسال الطلب');
    } finally { setLoading(false); }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-7xl mb-4">🛒</div>
        <h2 className="text-xl font-black text-gray-800 mb-2">السلة فارغة</h2>
        <p className="text-gray-500 mb-6">أضف طلبات من مطاعمنا</p>
        <button onClick={() => nav('/')} className="bg-orange-500 text-white font-black rounded-2xl px-8 py-3">
          تصفح المطاعم
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="text-2xl">←</button>
          <h1 className="font-black text-gray-900 text-lg">السلة</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Restaurant */}
        <div className="bg-orange-50 rounded-2xl p-3 flex items-center gap-2">
          <span className="text-xl">🍽️</span>
          <span className="font-bold text-orange-700 text-sm">{restaurantName}</span>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl p-4 space-y-4">
          <h2 className="font-black text-gray-800">الطلبات</h2>
          {items.map(item => (
            <div key={item._key} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-sm">{item.name}</p>
                {item.options?.length > 0 && (
                  <p className="text-xs text-gray-400">{item.options.map(o => o.name).join(', ')}</p>
                )}
                <p className="text-orange-500 font-black text-sm mt-0.5">
                  {(parseFloat(item.discount_price || item.price) + item.options.reduce((s, o) => s + parseFloat(o.extra_price || 0), 0)).toFixed(2)}₪
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => updateQty(item._key, item.qty - 1)}
                  className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-black text-lg">−</button>
                <span className="font-black text-gray-900 w-5 text-center">{item.qty}</span>
                <button onClick={() => updateQty(item._key, item.qty + 1)}
                  className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-lg">+</button>
              </div>
            </div>
          ))}
        </div>

        {/* Address */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <h2 className="font-black text-gray-800">عنوان التوصيل 📍</h2>
          {addresses.map(a => (
            <label key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${selectedAddress === a.id ? 'border-orange-400 bg-orange-50' : 'border-gray-100'}`}>
              <input type="radio" name="address" checked={selectedAddress === a.id}
                onChange={() => setSelectedAddress(a.id)} className="accent-orange-500" />
              <div>
                <p className="font-bold text-sm text-gray-800">{a.label || 'عنوان'}</p>
                <p className="text-xs text-gray-500">{a.address}</p>
              </div>
            </label>
          ))}
          {showAddAddr ? (
            <div className="flex gap-2">
              <input value={newAddress} onChange={e => setNewAddress(e.target.value)}
                placeholder="أدخل العنوان..." className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-orange-400 focus:outline-none" />
              <button onClick={addAddress} className="bg-orange-500 text-white rounded-xl px-3 py-2 text-sm font-bold">حفظ</button>
            </div>
          ) : (
            <button onClick={() => setShowAddAddr(true)} className="text-orange-500 font-bold text-sm">+ إضافة عنوان جديد</button>
          )}
        </div>

        {/* Payment */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <h2 className="font-black text-gray-800">طريقة الدفع 💳</h2>
          {[
            { id: 'cash', icon: '💵', label: 'نقداً عند الاستلام' },
            { id: 'card', icon: '💳', label: 'بطاقة ائتمانية' },
          ].map(p => (
            <label key={p.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${payment === p.id ? 'border-orange-400 bg-orange-50' : 'border-gray-100'}`}>
              <input type="radio" name="payment" checked={payment === p.id} onChange={() => setPayment(p.id)} className="accent-orange-500" />
              <span>{p.icon}</span>
              <span className="font-bold text-gray-800 text-sm">{p.label}</span>
            </label>
          ))}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl p-4">
          <h2 className="font-black text-gray-800 mb-2">ملاحظات (اختياري) 📝</h2>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="أي تعليمات خاصة للمطعم أو المندوب..."
            className="w-full border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-orange-400 focus:outline-none resize-none h-20"
          />
        </div>

        {/* Summary */}
        <div className="bg-white rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>المجموع</span><span>{total.toFixed(2)}₪</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>رسوم التوصيل</span><span>سيتم التحديد</span>
          </div>
          <div className="border-t pt-2 flex justify-between font-black text-gray-900">
            <span>الإجمالي</span><span className="text-orange-500">{total.toFixed(2)}₪+</span>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t max-w-2xl mx-auto">
        <button onClick={placeOrder} disabled={loading}
          className="w-full bg-orange-500 text-white font-black rounded-2xl py-4 text-lg disabled:opacity-50 transition"
        >
          {loading ? 'جاري الإرسال...' : `تأكيد الطلب — ${total.toFixed(2)}₪`}
        </button>
      </div>
    </div>
  );
}
