import React, { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiImage, FiTrash2, FiPlus, FiUploadCloud, FiLink, FiCalendar } from 'react-icons/fi';
import api, { uploadFile } from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { truthy, fmtDateTime, STORE_TYPES } from '../utils/format';
import { arCount } from '../utils/plural';
import { PageHeader, EmptyState, Field, Button, Switch, SectionHeader, Segmented, useConfirm } from '../components/ui';
import { Sk } from '../components/Skeleton';

/** وجهة الضغط على الإعلان — مطابقة لـ customer-app BannerSlider.bannerAction (link_type/link_value) — X-02 */
const LINKS = [['none', 'بدون'], ['store', 'متجر'], ['category', 'تصنيف'], ['market', 'قسم'], ['url', 'رابط']];
const EMPTY = { title_ar: '', sort_order: '', link_type: 'none', link_value: '', starts_at: '', ends_at: '' };

/** تصغير الصورة قبل الرفع (أقصى عرض 1600px، JPEG) حتى لا يفشل الرفع على الشبكات البطيئة — A-33 */
async function shrinkImage(file, maxW = 1600, quality = 0.85) {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type) || file.size < 450 * 1024) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

const linkLabel = (b, stores, cats) => {
  const t = String(b.link_type || '').toLowerCase();
  const v = b.link_value;
  if (!t || t === 'none') return null;
  if (t === 'store' || t === 'restaurant') return `🏪 ${stores.find(s => String(s.id) === String(v))?.name_ar || `متجر #${v}`}`;
  if (t === 'category') return `🗂️ ${cats.find(c => String(c.id) === String(v))?.name_ar || `تصنيف #${v}`}`;
  if (t === 'market') return `🛒 ${v && STORE_TYPES[v] ? STORE_TYPES[v].plural : 'المتاجر'}`;
  if (t === 'url' || t === 'link') return `🔗 ${String(v || '').replace(/^https?:\/\//, '').slice(0, 40)}`;
  return null;
};

const toIso = (local) => (local ? new Date(local).toISOString() : null);

export default function Banners() {
  const confirm = useConfirm();
  const cached = readCache('adm_banners');
  const [banners, setBanners] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [preview, setPreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [toggling, setToggling] = useState(() => new Set());
  const [stores, setStores] = useState(() => readCache('adm_restaurants') || []);
  const [cats, setCats] = useState([]);
  const fileRef = useRef();

  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  // قوائم الوجهات تُجلب عند الحاجة فقط
  useEffect(() => {
    if (form.link_type === 'store' && !stores.length) api.get('/admin/restaurants', { params: { limit: 1000 } }).then(r => setStores(r.data || [])).catch(() => {});
    if (form.link_type === 'category' && !cats.length) api.get('/admin/categories').then(r => setCats(r.data || [])).catch(() => {});
  }, [form.link_type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (banners.some(b => b.link_type === 'category') && !cats.length) api.get('/admin/categories').then(r => setCats(r.data || [])).catch(() => {});
    if (banners.some(b => b.link_type === 'store' || b.link_type === 'restaurant') && !stores.length) api.get('/admin/restaurants', { params: { limit: 1000 } }).then(r => setStores(r.data || [])).catch(() => {});
  }, [banners]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const linkError = useMemo(() => {
    const t = form.link_type, v = String(form.link_value || '').trim();
    if (t === 'store' && !v) return 'اختر المتجر';
    if (t === 'category' && !v) return 'اختر التصنيف';
    if (t === 'url' && !/^https?:\/\/\S+\.\S+/.test(v)) return 'أدخل رابطاً كاملاً يبدأ بـ https://';
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) return 'تاريخ الانتهاء يجب أن يكون بعد البداية';
    return null;
  }, [form]);

  const submit = async (e) => {
    e.preventDefault();
    if (!imageFile) return toast.error('ارفع صورة أولاً');
    if (!form.title_ar.trim()) return toast.error('أدخل عنوان الإعلان');
    if (linkError) return toast.error(linkError);
    setUploading(true);
    try {
      const file = await shrinkImage(imageFile);
      const up = await uploadFile(file);
      const imageUrl = up.url || up.data?.url;
      if (!imageUrl) throw new Error('فشل رفع الصورة');
      const sortOrder = form.sort_order === '' ? banners.length + 1 : Math.max(1, parseInt(form.sort_order) || 1);
      const lt = form.link_type === 'none' ? null : form.link_type;
      await api.post('/banners', {
        title_ar: form.title_ar.trim(), sort_order: sortOrder, image: imageUrl, is_active: true,
        link_type: lt, link_value: lt ? (String(form.link_value || '').trim() || null) : null,
        starts_at: toIso(form.starts_at), ends_at: toIso(form.ends_at),
      });
      toast.success('تمت إضافة الإعلان ✅');
      setForm(EMPTY);
      setPreview(null); setImageFile(null);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      toast.error(err?.message === 'انتهت مهلة الاتصال' ? 'انتهت مهلة رفع الصورة — جرّب صورة أصغر أو اتصالاً أفضل' : (err?.message || 'حدث خطأ'));
    }
    finally { setUploading(false); }
  };

  /** تبديل الإعلان: الزر معطّل أثناء الطلب ونعتمد قيمة الخادم — A-34 */
  const toggleActive = async (b) => {
    if (toggling.has(b.id)) return;
    const cur = truthy(b.is_active);
    setToggling(s => new Set(s).add(b.id));
    try {
      const r = await api.patch(`/banners/${b.id}/toggle`);
      const val = r?.is_active ?? r?.data?.is_active ?? !cur;
      setBanners(prev => prev.map(x => (x.id === b.id ? { ...x, is_active: val } : x)));
      toast.success(val ? 'تم تفعيل الإعلان' : 'تم إيقاف الإعلان', { id: `b${b.id}` });
    } catch (e) { toast.error(e?.message || 'حدث خطأ'); }
    finally { setToggling(s => { const n = new Set(s); n.delete(b.id); return n; }); }
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

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const activeCount = banners.filter(b => truthy(b.is_active)).length;
  const now = Date.now();

  return (
    <div className="page">
      <PageHeader icon={<FiImage />} title="الإعلانات" subtitle={`${arCount(banners.length, 'banner', { zero: 'لا إعلانات' })} · ${activeCount} نشط · تظهر في واجهة تطبيق الزبون`} />

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[400px_minmax(0,1fr)] items-start">
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
                <span className="text-[11px] text-orange-400 mt-1">JPG, PNG, WEBP — حتى 10MB (تُصغَّر تلقائياً)</span>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
          <Field label="عنوان الإعلان *"><input className="inp" value={form.title_ar} onChange={set('title_ar')} placeholder="مثال: عروض رمضان 🌙" /></Field>

          <Field label="عند الضغط على الإعلان" as="group">
            <Segmented full size="sm" value={form.link_type} onChange={(v) => setForm(p => ({ ...p, link_type: v, link_value: v === 'market' ? 'supermarket' : '' }))} options={LINKS} />
          </Field>
          {form.link_type === 'store' && (
            <Field label="المتجر">
              <select className="inp" value={form.link_value} onChange={set('link_value')}>
                <option value="">اختر متجراً…</option>
                {stores.filter(s => truthy(s.is_active ?? true)).map(s => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
              </select>
            </Field>
          )}
          {form.link_type === 'category' && (
            <Field label="التصنيف">
              <select className="inp" value={form.link_value} onChange={set('link_value')}>
                <option value="">اختر تصنيفاً…</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name_ar || c.name_en}</option>)}
              </select>
            </Field>
          )}
          {form.link_type === 'market' && (
            <Field label="قسم المتاجر">
              <select className="inp" value={form.link_value} onChange={set('link_value')}>
                {Object.entries(STORE_TYPES).filter(([k]) => k !== 'restaurant').map(([k, t]) => <option key={k} value={k}>{t.icon} {t.plural}</option>)}
              </select>
            </Field>
          )}
          {form.link_type === 'url' && (
            <Field label="الرابط"><input className="inp" dir="ltr" inputMode="url" placeholder="https://…" value={form.link_value} onChange={set('link_value')} /></Field>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Field label="يبدأ" hint="(اختياري)"><input className="inp !text-[13px]" type="datetime-local" value={form.starts_at} onChange={set('starts_at')} /></Field>
            <Field label="ينتهي" hint="(اختياري)"><input className="inp !text-[13px]" type="datetime-local" value={form.ends_at} onChange={set('ends_at')} /></Field>
          </div>
          <Field label="الترتيب" hint="(1 = أولاً · فارغ = في النهاية)"><input className="inp" type="number" min="1" value={form.sort_order} placeholder="تلقائي" onChange={set('sort_order')} /></Field>
          {linkError && (form.link_value || form.starts_at || form.ends_at) && <p className="text-xs text-red-500 font-bold">⚠ {linkError}</p>}
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
              const link = linkLabel(b, stores, cats);
              const notYet = b.starts_at && new Date(b.starts_at).getTime() > now;
              const ended = b.ends_at && new Date(b.ends_at).getTime() < now;
              const busy = toggling.has(b.id);
              return (
                <article key={b.id} className="card overflow-hidden group">
                  <div className="relative aspect-[16/9] bg-surface-sunken overflow-hidden">
                    {b.image ? <img src={b.image} alt="" loading="lazy" className={`w-full h-full object-cover transition-transform duration-500 ease-lux group-hover:scale-105 ${active && !ended ? '' : 'grayscale opacity-60'}`} />
                      : <div className="w-full h-full flex items-center justify-center text-ink-4 text-3xl"><FiImage /></div>}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                    <span className="absolute top-3 right-3 w-8 h-8 rounded-xl glass-light text-ink font-black text-sm flex items-center justify-center num shadow-soft" title="الترتيب">{b.sort_order ?? 0}</span>
                    <span className={`absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold flex items-center gap-1.5 ${active && !ended && !notYet ? 'bg-green-500 text-white' : 'bg-white/90 text-ink-2'}`}>
                      {!active ? 'متوقف' : ended ? 'انتهى' : notYet ? 'مجدول' : <><span className="live-dot !bg-white" /> نشط</>}
                    </span>
                    <p className="absolute bottom-3 right-3 left-3 text-white font-extrabold text-[15px] truncate drop-shadow">{b.title_ar || 'بدون عنوان'}</p>
                  </div>
                  <div className="px-3 pt-2.5 space-y-1 text-[11.5px] font-bold text-ink-3">
                    <p className="flex items-center gap-1.5 truncate"><FiLink className="flex-shrink-0" />{link || 'بدون وجهة (لا ينفتح عند الضغط)'}</p>
                    {(b.starts_at || b.ends_at) && <p className="flex items-center gap-1.5 num"><FiCalendar className="flex-shrink-0" />{b.starts_at ? fmtDateTime(b.starts_at) : 'الآن'} ← {b.ends_at ? fmtDateTime(b.ends_at) : 'بلا نهاية'}</p>}
                  </div>
                  <div className="p-3 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2.5">
                      <Switch checked={active} disabled={busy} onChange={() => toggleActive(b)} label={active ? 'إيقاف الإعلان' : 'تفعيل الإعلان'} />
                      <span className="text-xs font-bold text-ink-2">{busy ? 'جارٍ الحفظ…' : active ? 'ظاهر للزبائن' : 'مخفي'}</span>
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
