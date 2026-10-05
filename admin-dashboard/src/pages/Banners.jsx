import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FiImage, FiTrash2, FiPlus, FiUploadCloud } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { truthy } from '../utils/format';
import { PageHeader, EmptyState, Field, Button, Switch, SectionHeader, useConfirm } from '../components/ui';
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
    <div className="page">
      <PageHeader icon={<FiImage />} title="الإعلانات" subtitle={`${banners.length} إعلان · ${banners.filter(b => truthy(b.is_active)).length} نشط · تظهر في واجهة تطبيق الزبون`} />

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
        <form onSubmit={submit} className="card p-4 sm:p-5 space-y-3.5 lg:sticky lg:top-[92px]">
          <SectionHeader title="إضافة إعلان جديد" hint="نسبة 16:9 تعطي أفضل نتيجة" />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="group relative w-full aspect-[16/9] border-2 border-dashed border-orange-200 rounded-[18px] overflow-hidden bg-gradient-to-br from-orange-50/80 to-rose-50/50 hover:border-orange-300">
            {preview ? (
              <>
                <img src={preview} alt="معاينة" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 glass-light rounded-full px-3 py-1 text-[11px] font-extrabold text-ink opacity-0 group-hover:opacity-100 transition-opacity">تغيير الصورة</span>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-500">
                <span className="w-14 h-14 rounded-2xl bg-white shadow-soft flex items-center justify-center text-2xl mb-2 transition-transform duration-300 ease-spring group-hover:scale-110 group-hover:-translate-y-0.5"><FiUploadCloud /></span>
                <span className="text-sm font-extrabold">اضغط لاختيار صورة الإعلان</span>
                <span className="text-[11px] text-orange-400 mt-1">JPG, PNG, WEBP — حتى 10MB</span>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
          <Field label="عنوان الإعلان *"><input className="inp" value={form.title_ar} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} placeholder="مثال: عروض رمضان 🌙" /></Field>
          <Field label="الترتيب" hint="(1 = أولاً · فارغ = في النهاية)"><input className="inp" type="number" min="1" value={form.sort_order} placeholder="تلقائي" onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} /></Field>
          <Button type="submit" size="lg" className="w-full" loading={uploading} icon={<FiPlus />}>{uploading ? 'جاري الرفع…' : 'إضافة الإعلان'}</Button>
        </form>

        {loading && banners.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">{[...Array(4)].map((_, i) => <Sk key={i} h={220} r={20} />)}</div>
        ) : banners.length === 0 ? (
          <EmptyState icon={<FiImage />} title="لا توجد إعلانات بعد" hint="ارفع أول إعلان ليظهر في واجهة تطبيق الزبون" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 stagger">
            {[...banners].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(b => {
              const active = truthy(b.is_active);
              return (
                <article key={b.id} className="card overflow-hidden group">
                  <div className="relative aspect-[16/9] bg-surface-sunken overflow-hidden">
                    {b.image ? <img src={b.image} alt="" loading="lazy" className={`w-full h-full object-cover transition-transform duration-500 ease-lux group-hover:scale-105 ${active ? '' : 'grayscale opacity-60'}`} />
                      : <div className="w-full h-full flex items-center justify-center text-ink-4 text-3xl"><FiImage /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                    <span className="absolute top-3 right-3 w-8 h-8 rounded-xl glass-light text-ink font-black text-sm flex items-center justify-center num shadow-soft" title="الترتيب">{b.sort_order ?? 0}</span>
                    <span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold flex items-center gap-1.5 ${active ? 'bg-green-500 text-white' : 'bg-white/90 text-ink-2'}`}>
                      {active ? <><span className="live-dot !bg-white" /> نشط</> : 'متوقف'}
                    </span>
                    <p className="absolute bottom-3 right-3 left-3 text-white font-extrabold text-[15px] truncate drop-shadow">{b.title_ar || 'بدون عنوان'}</p>
                  </div>
                  <div className="p-3 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2.5">
                      <Switch checked={active} onChange={() => toggleActive(b)} label={active ? 'إيقاف الإعلان' : 'تفعيل الإعلان'} />
                      <span className="text-xs font-bold text-ink-2">{active ? 'ظاهر للزبائن' : 'مخفي'}</span>
                    </div>
                    <button onClick={() => deleteBanner(b)} className="btn btn-sm btn-danger"><FiTrash2 /> حذف</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
