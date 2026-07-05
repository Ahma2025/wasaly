import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

function compressToBase64(file, maxPx = 500, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('فشل تحميل الصورة')); };
    img.src = url;
  });
}

export default function Settings() {
  const [restaurant, setRestaurant] = useState(JSON.parse(localStorage.getItem('restaurant') || '{}'));
  const [form, setForm] = useState({
    name_ar: '', description_ar: '', phone: '', address: '',
    min_order: '', delivery_time_min: '', delivery_time_max: '',
    opens_at: '', closes_at: '', logo: '', lat: '', lng: ''
  });
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [kbVisible, setKbVisible] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const logoInputRef = useRef(null);
  const blurTimer = useRef(null);

  // Detect keyboard via visualViewport (most reliable on iOS)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onVVChange = () => {
      const diff = window.innerHeight - vv.height;
      if (diff > 80) {
        setKbVisible(true);
        setKbHeight(diff);
      } else {
        setKbVisible(false);
        setKbHeight(0);
      }
    };
    vv.addEventListener('resize', onVVChange);
    vv.addEventListener('scroll', onVVChange);
    return () => {
      vv.removeEventListener('resize', onVVChange);
      vv.removeEventListener('scroll', onVVChange);
    };
  }, []);

  const onInputFocus = useCallback(() => {
    clearTimeout(blurTimer.current);
    setKbVisible(true);
  }, []);

  const onInputBlur = useCallback(() => {
    blurTimer.current = setTimeout(() => setKbVisible(false), 200);
  }, []);

  const dismissKeyboard = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    document.activeElement?.blur();
    setKbVisible(false);
  }, []);

  useEffect(() => {
    if (restaurant.id) {
      setForm({
        name_ar: restaurant.name_ar || '',
        description_ar: restaurant.description_ar || '',
        phone: restaurant.phone || '',
        address: restaurant.address || '',
        min_order: restaurant.min_order || '',
        delivery_time_min: restaurant.delivery_time_min || '',
        delivery_time_max: restaurant.delivery_time_max || '',
        opens_at: restaurant.opens_at || '',
        closes_at: restaurant.closes_at || '',
        logo: restaurant.logo || '',
        lat: restaurant.lat || '',
        lng: restaurant.lng || ''
      });
    }
  }, []);

  const uploadLogo = async (file) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const base64 = await compressToBase64(file);
      setForm(f => ({ ...f, logo: base64 }));
      toast.success('تم رفع الشعار ✅');
    } catch (e) {
      toast.error('فشل رفع الصورة');
    } finally {
      setUploadingLogo(false);
    }
  };

  const save = async () => {
    if (!restaurant.id) return toast.error('لم يتم تحديد المطعم');
    setSaving(true);
    try {
      const payload = {
        ...form,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null
      };
      const r = await api.put(`/restaurants/${restaurant.id}`, payload);
      const updated = { ...restaurant, ...r.data };
      setRestaurant(updated);
      localStorage.setItem('restaurant', JSON.stringify(updated));
      toast.success('تم حفظ الإعدادات ✅');
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const toggleOpen = async () => {
    if (!restaurant.id) return;
    setToggling(true);
    try {
      const r = await api.patch(`/restaurants/${restaurant.id}/toggle`);
      const updated = { ...restaurant, is_open: r.is_open ?? r.data?.is_open };
      setRestaurant(updated);
      localStorage.setItem('restaurant', JSON.stringify(updated));
      toast.success(updated.is_open ? 'المطعم الآن مفتوح 🟢' : 'المطعم الآن مغلق 🔴');
    } catch (e) { toast.error(e.message || 'فشل'); }
    finally { setToggling(false); }
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return toast.error('المتصفح لا يدعم الموقع');
    toast('جاري تحديد موقعك...', { icon: '📡' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        toast.success('تم تحديد موقعك ✅');
      },
      (err) => {
        if (err.code === 1) toast.error('اسمح للتطبيق بالوصول للموقع من إعدادات الجوال');
        else toast.error('فشل تحديد الموقع، حاول مرة أخرى');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const inputProps = { onFocus: onInputFocus, onBlur: onInputBlur };

  return (
    <div className="p-4 space-y-4" dir="rtl">

      {/* iOS-style keyboard toolbar — fixed above keyboard */}
      {kbVisible && (
        <div
          className="fixed left-0 right-0 z-[9999] flex items-center justify-end px-3"
          style={{
            bottom: kbHeight > 0 ? kbHeight : 260,
            height: 44,
            background: '#d1d5db',
            borderTop: '0.5px solid #a0a0a8',
          }}
        >
          <button
            onTouchStart={dismissKeyboard}
            onMouseDown={dismissKeyboard}
            style={{
              color: '#007AFF',
              fontWeight: '600',
              fontSize: 17,
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'none',
              padding: '0 8px',
            }}
          >
            تم
          </button>
        </div>
      )}

      <h1 className="text-lg font-black text-gray-900">الإعدادات</h1>

      {/* Open/Close Toggle */}
      <div className={`rounded-2xl p-5 ${restaurant.is_open ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-gray-500 to-gray-600'} text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-lg">{restaurant.is_open ? '🟢 المطعم مفتوح' : '🔴 المطعم مغلق'}</p>
            <p className="text-white/80 text-sm mt-1">
              {restaurant.is_open ? 'الزبائن يمكنهم الطلب الآن' : 'الطلبات متوقفة حالياً'}
            </p>
          </div>
          <button onClick={toggleOpen} disabled={toggling}
            className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all bg-white disabled:opacity-60 ${restaurant.is_open ? 'text-green-600' : 'text-gray-600'}`}>
            {toggling ? '...' : restaurant.is_open ? 'إغلاق' : 'فتح'}
          </button>
        </div>
      </div>

      {/* Logo & Basic Info */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-900">معلومات المطعم</h2>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-2xl bg-orange-50 border-2 border-dashed border-orange-200 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
            onClick={() => logoInputRef.current?.click()}
          >
            {uploadingLogo ? (
              <div className="animate-spin w-6 h-6 rounded-full border-b-2 border-orange-500" />
            ) : form.logo ? (
              <img src={form.logo} className="w-full h-full object-cover" alt="logo" />
            ) : (
              <div className="text-center">
                <span className="text-2xl block">🏪</span>
                <span className="text-[9px] text-orange-400 font-bold">اضغط لرفع</span>
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="text-xs font-bold text-gray-600 block mb-1">شعار المطعم</label>
            <button
              onClick={() => logoInputRef.current?.click()}
              className="w-full border-2 border-dashed border-orange-200 rounded-xl p-2.5 text-sm text-orange-500 font-semibold"
            >
              {uploadingLogo ? 'جاري المعالجة...' : '📷 رفع صورة الشعار'}
            </button>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => uploadLogo(e.target.files?.[0])} />
            {form.logo && !uploadingLogo && (
              <p className="text-xs text-green-600 mt-1">✓ تم رفع الشعار</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-600">اسم المطعم</label>
            <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1"
              value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
              {...inputProps} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600">وصف المطعم</label>
            <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1" rows={3}
              placeholder="وصف مختصر للمطعم ومميزاته..."
              value={form.description_ar} onChange={e => setForm(f => ({ ...f, description_ar: e.target.value }))}
              {...inputProps} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600">رقم الهاتف</label>
              <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1"
                value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                {...inputProps} />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">العنوان</label>
              <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1"
                value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                {...inputProps} />
            </div>
          </div>
        </div>
      </div>

      {/* Location */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">📍 موقع المطعم</h2>
          <button onClick={detectLocation}
            className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-xl font-bold active:opacity-70">
            📡 موقعي الآن
          </button>
        </div>
        <p className="text-xs text-gray-400">اضغط "موقعي الآن" لتحديد موقع مطعمك تلقائياً عبر GPS</p>
        {form.lat && form.lng ? (
          <>
            <iframe title="map"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(form.lng)-0.01},${parseFloat(form.lat)-0.01},${parseFloat(form.lng)+0.01},${parseFloat(form.lat)+0.01}&layer=mapnik&marker=${form.lat},${form.lng}`}
              style={{ width: '100%', height: '220px', border: 'none', borderRadius: '12px' }} />
            <p className="text-xs text-gray-500 text-center">
              📌 {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-28 bg-gray-50 rounded-xl text-gray-400 gap-2">
            <span className="text-3xl">🗺️</span>
            <p className="text-xs">اضغط "موقعي الآن" لتحديد الموقع</p>
          </div>
        )}
      </div>

      {/* Delivery Settings */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-4">
        <h2 className="font-bold text-gray-900">إعدادات التوصيل والأوقات</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-600">الحد الأدنى للطلب (₪)</label>
            <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1" type="number"
              value={form.min_order} onChange={e => setForm(f => ({ ...f, min_order: e.target.value }))}
              {...inputProps} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600">وقت التحضير من (دق)</label>
            <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1" type="number"
              value={form.delivery_time_min} onChange={e => setForm(f => ({ ...f, delivery_time_min: e.target.value }))}
              {...inputProps} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600">وقت التحضير حتى (دق)</label>
            <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1" type="number"
              value={form.delivery_time_max} onChange={e => setForm(f => ({ ...f, delivery_time_max: e.target.value }))}
              {...inputProps} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600">ساعة الافتتاح</label>
            <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1" type="time"
              value={form.opens_at} onChange={e => setForm(f => ({ ...f, opens_at: e.target.value }))}
              {...inputProps} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-bold text-gray-600">ساعة الإغلاق</label>
            <input className="w-full border border-gray-200 rounded-xl p-3 text-sm mt-1" type="time"
              value={form.closes_at} onChange={e => setForm(f => ({ ...f, closes_at: e.target.value }))}
              {...inputProps} />
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h2 className="font-bold text-gray-900 mb-3">معلومات الحساب</h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">المدينة</span>
            <span className="font-semibold text-gray-800">{restaurant.city || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">التقييم</span>
            <span className="font-semibold text-gray-800">{parseFloat(restaurant.rating || 0).toFixed(1)} ⭐</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">الحالة</span>
            <span className={`font-semibold ${restaurant.is_active ? 'text-green-600' : 'text-red-500'}`}>
              {restaurant.is_active ? 'نشط' : 'غير نشط'}
            </span>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black text-base disabled:opacity-60 shadow-lg shadow-orange-200">
        {saving ? 'جاري الحفظ...' : '💾 حفظ الإعدادات'}
      </button>
    </div>
  );
}
