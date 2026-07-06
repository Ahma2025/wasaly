import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const API = import.meta.env.VITE_API_URL || 'https://wasaly-production.up.railway.app';

export default function Banners() {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title_ar: '', sort_order: 0 });
  const [preview, setPreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const fileRef = useRef();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const r = await api.get('/banners/all');
      setBanners(r.data || []);
    } catch {
      // fallback to public endpoint
      try {
        const r = await api.get('/banners');
        setBanners(r.data || []);
      } catch (e) { console.error(e); }
    } finally { setLoading(false); }
  };

  const pickImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const uploadImage = async () => {
    if (!imageFile) return null;
    const fd = new FormData();
    fd.append('file', imageFile);
    const r = await fetch(`${API}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      body: fd,
    });
    const data = await r.json();
    return data.url;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!imageFile) return toast.error('ارفع صورة أولاً');
    if (!form.title_ar.trim()) return toast.error('أدخل عنوان الإعلان');
    setUploading(true);
    try {
      const imageUrl = await uploadImage();
      if (!imageUrl) throw new Error('فشل رفع الصورة');
      await api.post('/banners', { ...form, image: imageUrl, is_active: true });
      toast.success('تم إضافة الإعلان ✅');
      setForm({ title_ar: '', sort_order: 0 });
      setPreview(null);
      setImageFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      toast.error(err.message || 'حدث خطأ');
    } finally { setUploading(false); }
  };

  const toggleActive = async (id, current) => {
    try {
      await api.patch(`/banners/${id}/toggle`);
      setBanners(prev => prev.map(b => b.id === id ? { ...b, is_active: !current } : b));
      toast.success(current ? 'تم إيقاف الإعلان' : 'تم تفعيل الإعلان');
    } catch { toast.error('حدث خطأ'); }
  };

  const deleteBanner = async (id) => {
    if (!confirm('حذف هذا الإعلان؟')) return;
    try {
      await api.delete(`/banners/${id}`);
      setBanners(prev => prev.filter(b => b.id !== id));
      toast.success('تم الحذف');
    } catch { toast.error('حدث خطأ'); }
  };

  return (
    <div className="p-4 pb-32 space-y-4" dir="rtl">
      <h1 className="text-lg font-black text-gray-900">🖼️ إدارة الإعلانات</h1>

      {/* فورم إضافة */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h2 className="font-bold text-gray-800 mb-3 text-sm">إضافة إعلان جديد</h2>
        <form onSubmit={submit} className="space-y-3">

          {/* رفع الصورة */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-orange-300 rounded-xl cursor-pointer overflow-hidden bg-orange-50 hover:bg-orange-100 transition-colors"
            style={{ minHeight: 140 }}
          >
            {preview ? (
              <img src={preview} alt="preview" className="w-full object-cover" style={{ maxHeight: 200 }} />
            ) : (
              <div className="flex flex-col items-center justify-center h-36 text-orange-400">
                <span className="text-4xl mb-2">📷</span>
                <span className="text-sm font-semibold">اضغط لرفع صورة الإعلان</span>
                <span className="text-xs text-orange-300 mt-1">JPG, PNG, WEBP — حتى 10MB</span>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

          {/* العنوان */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">عنوان الإعلان *</label>
            <input
              value={form.title_ar}
              onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))}
              placeholder="مثال: عروض رمضان 🌙"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 text-right"
            />
          </div>

          {/* الترتيب */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">الترتيب (رقم أصغر = يظهر أول)</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={e => setForm(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><span className="animate-spin">⏳</span> جاري الرفع...</>
            ) : (
              <><span>➕</span> إضافة الإعلان</>
            )}
          </button>
        </form>
      </div>

      {/* قائمة الإعلانات */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">{banners.length} إعلان</span>
          <h2 className="font-bold text-gray-800 text-sm">الإعلانات الحالية</h2>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" />
          </div>
        ) : banners.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">🖼️</div>
            <p className="text-sm">لا توجد إعلانات بعد</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {banners.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-3">
                {/* صورة */}
                <div className="w-20 h-14 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                  {b.image ? (
                    <img src={b.image} alt={b.title_ar} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">🖼️</div>
                  )}
                </div>

                {/* تفاصيل */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{b.title_ar || 'بدون عنوان'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">ترتيب: {b.sort_order ?? 0}</p>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {b.is_active ? '● نشط' : '○ متوقف'}
                  </span>
                </div>

                {/* أزرار */}
                <div className="flex flex-col gap-1.5">
                  <button
                    onClick={() => toggleActive(b.id, b.is_active)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg ${b.is_active ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}
                  >
                    {b.is_active ? 'إيقاف' : 'تفعيل'}
                  </button>
                  <button
                    onClick={() => deleteBanner(b.id)}
                    className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
