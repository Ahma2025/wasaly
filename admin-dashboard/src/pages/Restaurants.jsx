import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef(null);
  const [form, setForm] = useState({
    name_ar: '', description_ar: '', city: '', address: '', phone: '',
    min_order: '10', delivery_fee: '5', delivery_time_min: '20', delivery_time_max: '40',
    owner_phone: '', owner_password: 'rest123', category_id: '1', lat: '31.9', lng: '35.2',
    store_type: 'restaurant'
  });

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchRestaurants(), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const fetchRestaurants = async () => {
    try {
      const r = await api.get('/admin/restaurants', { params: { search } });
      setRestaurants(r.data || []);
    } catch { toast.error('فشل التحميل'); }
    finally { setLoading(false); }
  };

  const addRestaurant = async () => {
    if (!form.name_ar || !form.city) return toast.error('أدخل الاسم والمدينة');
    setSaving(true);
    try {
      await api.post('/admin/restaurants', form);
      toast.success('تم إضافة المطعم ✅');
      setShowForm(false);
      setForm({ name_ar: '', description_ar: '', city: '', address: '', phone: '', min_order: '10', delivery_fee: '5', delivery_time_min: '20', delivery_time_max: '40', owner_phone: '', owner_password: 'rest123', category_id: '1', lat: '31.9', lng: '35.2', store_type: 'restaurant' });
      fetchRestaurants();
    } catch (e) { toast.error(e.message || 'فشل الإضافة'); }
    finally { setSaving(false); }
  };

  const toggleField = async (id, field) => {
    try {
      await api.patch(`/admin/restaurants/${id}/toggle`, { field });
      fetchRestaurants();
    } catch { toast.error('فشل'); }
  };

  const deleteRestaurant = async (id) => {
    if (!window.confirm('حذف هذا المطعم؟')) return;
    try {
      await api.delete(`/admin/restaurants/${id}`);
      toast.success('تم الحذف');
      fetchRestaurants();
    } catch { toast.error('فشل الحذف'); }
  };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900">المطاعم</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
          ➕ مطعم جديد
        </button>
      </div>

      <div className="relative">
        <span className="absolute right-3 top-3 text-gray-400">🔍</span>
        <input className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-9 pl-4 text-sm"
          placeholder="بحث عن مطعم..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="font-bold text-gray-900">مطعم / متجر جديد</h2>

          {/* نوع المنشأة */}
          <div>
            <label className="text-xs font-bold text-gray-600 mb-2 block">نوع المنشأة *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'restaurant', icon: '🍽️', label: 'مطعم', desc: 'يظهر بالصفحة الرئيسية' },
                { val: 'market',     icon: '🛒', label: 'ماركت', desc: 'يظهر بقسم الماركت' },
              ].map(t => (
                <button key={t.val} type="button"
                  onClick={() => setForm(f => ({ ...f, store_type: t.val }))}
                  className={`p-3 rounded-xl border-2 text-right transition-all ${form.store_type === t.val ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'}`}>
                  <div className="text-2xl mb-1">{t.icon}</div>
                  <div className={`text-sm font-bold ${form.store_type === t.val ? 'text-orange-600' : 'text-gray-700'}`}>{t.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="اسم المطعم *"
            value={form.name_ar} onChange={e => setForm(f => ({...f, name_ar: e.target.value}))} />
          <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="وصف المطعم" rows={2}
            value={form.description_ar} onChange={e => setForm(f => ({...f, description_ar: e.target.value}))} />
          <div className="grid grid-cols-2 gap-3">
            <input className="border border-gray-200 rounded-xl p-3 text-sm" placeholder="المدينة *"
              value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} />
            <input className="border border-gray-200 rounded-xl p-3 text-sm" placeholder="رقم الهاتف"
              value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
          </div>
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="العنوان"
            value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">الحد الأدنى (₪)</label>
              <input className="w-full border border-gray-200 rounded-xl p-2 text-sm mt-1" type="number"
                value={form.min_order} onChange={e => setForm(f => ({...f, min_order: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">رسوم التوصيل (₪)</label>
              <input className="w-full border border-gray-200 rounded-xl p-2 text-sm mt-1" type="number"
                value={form.delivery_fee} onChange={e => setForm(f => ({...f, delivery_fee: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">وقت التوصيل من (دق)</label>
              <input className="w-full border border-gray-200 rounded-xl p-2 text-sm mt-1" type="number"
                value={form.delivery_time_min} onChange={e => setForm(f => ({...f, delivery_time_min: e.target.value}))} />
            </div>
            <div>
              <label className="text-xs text-gray-500">وقت التوصيل حتى (دق)</label>
              <input className="w-full border border-gray-200 rounded-xl p-2 text-sm mt-1" type="number"
                value={form.delivery_time_max} onChange={e => setForm(f => ({...f, delivery_time_max: e.target.value}))} />
            </div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-bold text-gray-600 mb-2">حساب صاحب المطعم</p>
            <div className="grid grid-cols-2 gap-3">
              <input className="border border-gray-200 rounded-xl p-3 text-sm" placeholder="رقم هاتف المالك"
                value={form.owner_phone} onChange={e => setForm(f => ({...f, owner_phone: e.target.value}))} />
              <input className="border border-gray-200 rounded-xl p-3 text-sm" placeholder="كلمة المرور"
                value={form.owner_password} onChange={e => setForm(f => ({...f, owner_password: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addRestaurant} disabled={saving}
              className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60">
              {saving ? 'جاري الإضافة...' : 'إضافة المطعم'}
            </button>
            <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : restaurants.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><p className="text-4xl mb-2">🏪</p><p>لا توجد مطاعم</p></div>
      ) : (
        <div className="space-y-3">
          {restaurants.map(r => (
            <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex gap-3">
                {r.logo
                  ? <img src={r.logo} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" alt="" />
                  : <div className="w-14 h-14 rounded-xl bg-orange-100 flex items-center justify-center text-2xl flex-shrink-0">🏪</div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-bold text-gray-900 truncate">{r.name_ar}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {r.is_active ? 'نشط' : 'مخفي'}
                      </span>
                      {r.is_featured ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-semibold">⭐</span> : null}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{r.city} • {r.phone || 'بدون هاتف'} {r.store_type === 'market' ? '🛒' : '🍽️'}</p>
                  <p className="text-xs text-gray-400">المالك: {r.owner_name || r.owner_phone || 'غير محدد'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
                <div><p className="text-sm font-black text-orange-500">{r.total_orders || 0}</p><p className="text-[10px] text-gray-400">طلبات</p></div>
                <div><p className="text-sm font-black text-green-600">{parseFloat(r.total_revenue || 0).toFixed(0)}₪</p><p className="text-[10px] text-gray-400">إيرادات</p></div>
                <div><p className="text-sm font-black text-blue-600">{parseFloat(r.rating || 0).toFixed(1)} ⭐</p><p className="text-[10px] text-gray-400">تقييم</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={() => toggleField(r.id, 'is_active')}
                  className={`py-2 rounded-xl text-xs font-bold ${r.is_active ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                  {r.is_active ? '🔴 إخفاء' : '🟢 تفعيل'}
                </button>
                <button onClick={() => toggleField(r.id, 'is_featured')}
                  className={`py-2 rounded-xl text-xs font-bold ${r.is_featured ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-50 text-gray-500'}`}>
                  ⭐ {r.is_featured ? 'إلغاء' : 'تمييز'}
                </button>
                <button onClick={() => deleteRestaurant(r.id)} className="py-2 rounded-xl text-xs font-bold bg-red-50 text-red-500">
                  🗑️ حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
