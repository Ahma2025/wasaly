import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FiImage, FiTrash2, FiPlus } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { truthy } from '../utils/format';
import { PageHeader, EmptyState, Field, Badge, useConfirm } from '../components/ui';
import { Sk } from '../components/Skeleton';

export default function Banners() {
  const confirm = useConfirm();
  const cached = readCache('adm_banners');
  const [banners, setBanners] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title_ar: '', sort_order: '' });
  const [preview, setPreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const fileRef = useRef();

  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const load = async () => {
    try {
      const r = await api.get('/banners/all');
      setBanners(r.data || []); writeCache('adm_banners', r.data || []);
    } catch {
      try { const r = await api.get('/banners'); setBanners(r.data || []); } catch { /* ignore */ }
    } finally { setLoading(false); }
  };

  const pickImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('اختر ملف صورة');
    if (file.size > 10 * 1024 * 1024) return toast.error('الحد الأقصى 10MB');
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!imageFile) return toast.error('ارفع صورة أولاً');
    if (!form.title_ar.trim()) return toast.error('أدخل عنوان الإعلان');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', imageFile);
      const up = await api.post('/upload', fd);
      const imageUrl = up.url || up.data?.url;
      if (!imageUrl) throw new Error('فشل رفع الصورة');
      const sortOrder = form.sort_order === '' ? banners.length + 1 : Math.max(1, parseInt(form.sort_order) || 1);
      await api.post('/banners', { title_ar: form.title_ar.trim(), sort_order: sortOrder, image: imageUrl, is_active: true });
      toast.success('تمت إضافة الإعلان ✅');
      setForm({ title_ar: '', sort_order: '' });
      setPreview(null); setImageFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) { toast.error(err?.message || 'حدث خطأ'); }
    finally { setUploading(false); }
  };

  const toggleActive = async (b) => {
    const cur = truthy(b.is_active);
    try {
      await api.patch(`/banners/${b.id}/toggle`);
      setBanners(prev => prev.map(x => (x.id === b.id ? { ...x, is_active: !cur } : x)));
      toast.success(cur ? 'تم إيقاف الإعلان' : 'تم تفعيل الإعلان');
    } catch (e) { toast.error(e?.message || 'حدث خطأ'); }
  };

  const deleteBanner = async (b) => {
    const ok = await confirm({ title: 'حذف الإعلان', message: `حذف «${b.title_ar || 'الإعلان'}» نهائياً؟ لا يمكن التراجع.`, confirmText: 'حذف' });
    if (!ok) return;
    try {
      await api.delete(`/banners/${b.id}`);
      setBanners(prev => prev.filter(x => x.id !== b.id));
      toast.success('تم الحذف');
    } catch (e) { toast.error(e?.message || 'حدث خطأ'); }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="🖼️" title="الإعلانات" subtitle={`${banners.length} إعلان · تظهر في واجهة تطبيق الزبون`} />

      <form onSubmit={submit} className="card p-4 space-y-3">
        <h2 className="font-black text-gray-900 text-sm">إضافة إعلان جديد</h2>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-orange-200 rounded-2xl overflow-hidden bg-orange-50/60 hover:bg-orange-50" style={{ minHeight: 140 }}>
          {preview ? (
            <img src={preview} alt="معاينة" className="w-full object-cover" style={{ maxHeight: 200 }} />
          ) : (
            <div className="flex flex-col items-center justify-center h-36 text-orange-400">
              <FiImage className="text-4xl mb-2" />
              <span className="text-sm font-bold">اضغط لاختيار صورة الإعلان</span>
              <span className="text-xs text-orange-300 mt-1">JPG, PNG, WEBP — حتى 10MB</span>
            </div>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
        <Field label="عنوان الإعلان *"><input className="inp" value={form.title_ar} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} placeholder="مثال: عروض رمضان 🌙" /></Field>
        <Field label="الترتيب" hint="(1 = أولاً · فارغ = في النهاية)"><input className="inp" type="number" min="1" value={form.sort_order} placeholder="تلقائي" onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} /></Field>
        <button type="submit" disabled={uploading} className="w-full btn-lux py-3 disabled:opacity-60 flex items-center justify-center gap-2">
          {uploading ? <><span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> جاري الرفع…</> : <><FiPlus /> إضافة الإعلان</>}
        </button>
      </form>

      {loading && banners.length === 0 ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Sk key={i} h={84} r={18} />)}</div>
      ) : banners.length === 0 ? (
        <EmptyState icon="🖼️" title="لا توجد إعلانات بعد" />
      ) : (
        <div className="card divide-y divide-gray-50 overflow-hidden">
          {[...banners].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(b => {
            const active = truthy(b.is_active);
            return (
              <div key={b.id} className="flex items-center gap-3 p-3">
                <div className="w-24 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                  {b.image ? <img src={b.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl"><FiImage /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{b.title_ar || 'بدون عنوان'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">الترتيب: {b.sort_order ?? 0}</p>
                  <Badge className={`mt-1 ${active ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}`}>{active ? '● نشط' : '○ متوقف'}</Badge>
                </div>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => toggleActive(b)} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${active ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{active ? 'إيقاف' : 'تفعيل'}</button>
                  <button onClick={() => deleteBanner(b)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-500 flex items-center justify-center gap-1"><FiTrash2 /> حذف</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
