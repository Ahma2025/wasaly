import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Settings() {
  const [restaurant, setRestaurant] = useState(JSON.parse(localStorage.getItem('restaurant') || '{}'));
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/restaurants/${restaurant.id}`, restaurant);
      localStorage.setItem('restaurant', JSON.stringify(restaurant));
      toast.success('تم الحفظ');
    } catch { toast.error('خطأ في الحفظ'); }
    finally { setSaving(false); }
  };

  const toggleOpen = async () => {
    try {
      const data = await api.patch(`/restaurants/${restaurant.id}/toggle`);
      setRestaurant(prev => ({ ...prev, is_open: data.is_open }));
      localStorage.setItem('restaurant', JSON.stringify({ ...restaurant, is_open: data.is_open }));
      toast.success(data.is_open ? 'المطعم مفتوح الآن' : 'المطعم مغلق الآن');
    } catch { toast.error('خطأ'); }
  };

  return (
    <div className="max-w-2xl space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900">إعدادات المطعم</h1>

      {/* Open/Close Toggle */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">حالة المطعم</p>
          <p className="text-sm text-gray-500">{restaurant.is_open ? 'المطعم يستقبل طلبات الآن' : 'المطعم مغلق حالياً'}</p>
        </div>
        <button onClick={toggleOpen} className={`relative w-14 h-7 rounded-full transition-colors ${restaurant.is_open ? 'bg-green-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${restaurant.is_open ? 'translate-x-7' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <form onSubmit={save} className="bg-white rounded-2xl p-6 shadow-sm border space-y-4">
        <h2 className="font-bold text-gray-900 text-lg border-b pb-3">معلومات المطعم</h2>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium text-gray-700">الاسم (عربي)</label><input className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.name_ar || ''} onChange={e => setRestaurant({...restaurant, name_ar: e.target.value})} /></div>
          <div><label className="text-sm font-medium text-gray-700">الاسم (إنجليزي)</label><input className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.name_en || ''} onChange={e => setRestaurant({...restaurant, name_en: e.target.value})} /></div>
        </div>

        <div><label className="text-sm font-medium text-gray-700">الوصف</label><textarea className="w-full border rounded-xl p-2.5 mt-1" rows={3} value={restaurant.description_ar || ''} onChange={e => setRestaurant({...restaurant, description_ar: e.target.value})} /></div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium text-gray-700">رقم الهاتف</label><input className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.phone || ''} onChange={e => setRestaurant({...restaurant, phone: e.target.value})} /></div>
          <div><label className="text-sm font-medium text-gray-700">البريد الإلكتروني</label><input className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.email || ''} onChange={e => setRestaurant({...restaurant, email: e.target.value})} /></div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div><label className="text-sm font-medium text-gray-700">الحد الأدنى للطلب ₪</label><input type="number" className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.min_order || ''} onChange={e => setRestaurant({...restaurant, min_order: e.target.value})} /></div>
          <div><label className="text-sm font-medium text-gray-700">رسوم التوصيل ₪</label><input type="number" className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.delivery_fee || ''} onChange={e => setRestaurant({...restaurant, delivery_fee: e.target.value})} /></div>
          <div><label className="text-sm font-medium text-gray-700">وقت التوصيل (دقيقة)</label><input type="number" className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.delivery_time_max || ''} onChange={e => setRestaurant({...restaurant, delivery_time_max: e.target.value})} /></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div><label className="text-sm font-medium text-gray-700">وقت الفتح</label><input type="time" className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.opens_at || '08:00'} onChange={e => setRestaurant({...restaurant, opens_at: e.target.value})} /></div>
          <div><label className="text-sm font-medium text-gray-700">وقت الإغلاق</label><input type="time" className="w-full border rounded-xl p-2.5 mt-1" value={restaurant.closes_at || '23:00'} onChange={e => setRestaurant({...restaurant, closes_at: e.target.value})} /></div>
        </div>

        <button type="submit" disabled={saving} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-70">
          {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
        </button>
      </form>
    </div>
  );
}
