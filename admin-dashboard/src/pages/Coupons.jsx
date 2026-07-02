import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'percentage', value: '', min_order: '', max_uses: '', expires_at: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    try {
      const data = await api.get('/coupons');
      setCoupons(data.data || []);
    } catch { toast.error('خطأ'); }
    finally { setLoading(false); }
  };

  const create = async () => {
    try {
      const data = await api.post('/coupons', form);
      setCoupons(prev => [data.data, ...prev]);
      setShowForm(false);
      setForm({ code: '', type: 'percentage', value: '', min_order: '', max_uses: '', expires_at: '' });
      toast.success('تم إنشاء الكوبون');
    } catch { toast.error('خطأ'); }
  };

  const deleteCoupon = async (id) => {
    try {
      await api.delete(`/coupons/${id}`);
      setCoupons(prev => prev.filter(c => c.id !== id));
      toast.success('تم الحذف');
    } catch { toast.error('خطأ'); }
  };

  const typeLabel = { percentage: 'نسبة %', fixed: 'مبلغ ثابت', free_delivery: 'توصيل مجاني' };

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">الكوبونات</h1>
        <button onClick={() => setShowForm(true)} className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-600 transition">+ إضافة كوبون</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <h2 className="font-bold mb-4">كوبون جديد</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">كود الكوبون</label>
              <input className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="WASALY10" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">نوع الخصم</label>
              <select className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="percentage">نسبة مئوية</option>
                <option value="fixed">مبلغ ثابت</option>
                <option value="free_delivery">توصيل مجاني</option>
              </select>
            </div>
            {form.type !== 'free_delivery' && (
              <div>
                <label className="text-sm text-gray-500 mb-1 block">قيمة الخصم</label>
                <input type="number" className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder={form.type === 'percentage' ? '10' : '5'} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
              </div>
            )}
            <div>
              <label className="text-sm text-gray-500 mb-1 block">الحد الأدنى للطلب (₪)</label>
              <input type="number" className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="0" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">عدد الاستخدامات</label>
              <input type="number" className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="100" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-1 block">تاريخ الانتهاء</label>
              <input type="datetime-local" className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} className="bg-orange-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-orange-600">إنشاء</button>
            <button onClick={() => setShowForm(false)} className="bg-gray-100 text-gray-700 px-6 py-2 rounded-xl font-bold hover:bg-gray-200">إلغاء</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? [...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-32 border" />) : coupons.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="font-mono font-black text-orange-600 text-lg">{c.code}</span>
                <span className="mr-2 px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-600 font-bold">{typeLabel[c.type]}</span>
              </div>
              <button onClick={() => deleteCoupon(c.id)} className="text-red-400 hover:text-red-600 text-sm">حذف</button>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              {c.value && <p>الخصم: <strong>{c.value}{c.type === 'percentage' ? '%' : '₪'}</strong></p>}
              {c.min_order > 0 && <p>الحد الأدنى: <strong>{c.min_order}₪</strong></p>}
              <p>الاستخدامات: <strong>{c.usage_count || 0} / {c.usage_limit || '∞'}</strong></p>
              {c.expires_at && <p className="text-gray-400 text-xs">ينتهي: {new Date(c.expires_at).toLocaleDateString('ar')}</p>}
            </div>
            <div className="mt-2">
              <div className="bg-gray-100 rounded-full h-1.5"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (c.usage_count / (c.usage_limit || 1)) * 100)}%` }} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
