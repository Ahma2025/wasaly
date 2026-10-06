import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiEye, FiEyeOff, FiStar, FiShoppingBag, FiPhone, FiMapPin, FiUser, FiFilter, FiX } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { STORE_TYPES, normalizePhone, truthy, num } from '../utils/format';
import { arCount } from '../utils/plural';
import { duplicatePhoneMessage } from '../utils/accounts';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, LoadMore, Modal, Field, PasswordInput, Badge, PrimaryBtn, Button, Switch, Spinner, useConfirm } from '../components/ui';

const FETCH_LIMIT = 1000;
const PAGE = 30;
const EMPTY_NEW = { name_ar: '', owner_phone: '', owner_password: '', store_type: 'restaurant' };

/* ─── أقسام المتاجر: القائمة المحلية + ما يرجعه الخادم (GET /store-types) ─── */
const LOCAL_TYPES = Object.entries(STORE_TYPES).map(([key, v], i) => ({ key, ...v, sort: i }));
const NEUTRAL_TONE = 'bg-gray-50 text-gray-700 ring-gray-200';
function mergeTypes(server) {
  if (!Array.isArray(server) || !server.length) return LOCAL_TYPES;
  const out = LOCAL_TYPES.map(t => ({ ...t }));
  for (const s of server) {
    if (!s || !s.key || out.some(t => t.key === s.key)) continue;
    out.push({ key: s.key, label: s.name_ar || s.key, plural: s.name_ar || s.key, icon: s.emoji || '🏪', tone: NEUTRAL_TONE, sort: s.sort ?? 99 });
  }
  return out.sort((a, b) => a.sort - b.sort);
}
function useStoreTypes() {
  const [types, setTypes] = useState(() => mergeTypes(readCache('adm_store_types')));
  useEffect(() => {
    let alive = true;
    api.get('/store-types').then(r => {
      if (!alive || !Array.isArray(r?.data)) return;
      writeCache('adm_store_types', r.data);
      setTypes(mergeTypes(r.data));
    }).catch(() => { /* القائمة المحلية تكفي */ });
    return () => { alive = false; };
  }, []);
  return useMemo(() => {
    const byKey = Object.fromEntries(types.map(t => [t.key, t]));
    const norm = (v) => { const k = String(v || '').trim().toLowerCase(); if (k === 'market') return 'supermarket'; return byKey[k] ? k : 'restaurant'; };
    return { types, byKey, norm, meta: (v) => byKey[norm(v)] };
  }, [types]);
}

/* شبكة اختيار القسم: إيموجي كبير + الاسم، المختار بإطار برتقالي وعلامة ✓ داخله */
function StoreTypePicker({ types, value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="قسم المتجر">
      {types.map(t => {
        const on = value === t.key;
        return (
          <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(t.key)}
            className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl px-1.5 py-2.5 min-h-[76px] transition active:scale-95 border-2 ${on ? 'border-brand-500 bg-brand-50 shadow-brand' : 'border-surface-line bg-white hover:border-brand-200 hover:bg-[#FFFAF5]'}`}>
            {on && <span className="absolute top-1.5 left-1.5 w-[18px] h-[18px] rounded-full grad-sunset text-white text-[10px] font-black flex items-center justify-center">✓</span>}
            <span className="text-[26px] leading-none" aria-hidden>{t.icon}</span>
            <span className={`text-[11.5px] font-extrabold text-center leading-tight ${on ? 'text-brand-700' : 'text-ink-2'}`}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function Restaurants() {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const cached = readCache('adm_restaurants');
  const [restaurants, setRestaurants] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const ST = useStoreTypes();
  const [visible, setVisible] = useState(PAGE);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyKey, setBusyKey] = useState(null); // `${id}:${field}` أثناء التبديل — A-25

  useEffect(() => { fetchRestaurants(); }, []);
  useEffect(() => { if (params.get('new') === '1') { setShowNew(true); const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); } }, [params]);
  useEffect(() => { setVisible(PAGE); }, [search, filter, typeFilter]);

  const fetchRestaurants = async ({ append = false } = {}) => {
    setRefreshing(true);
    try {
      const offset = append ? restaurants.length : 0;
      const r = await api.get('/admin/restaurants', { params: { limit: FETCH_LIMIT, offset } });
      const rows = r.data || [];
      setRestaurants(prev => {
        const next = append ? [...prev, ...rows.filter(x => !prev.some(p => p.id === x.id))] : rows;
        writeCache('adm_restaurants', next);
        return next;
      });
      setServerHasMore(rows.length >= FETCH_LIMIT);
      return rows;
    } catch (e) { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل المطاعم'); return null; }
    finally { setLoading(false); setRefreshing(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return restaurants.filter(r => {
      if (filter === 'active' && !truthy(r.is_active)) return false;
      if (filter === 'hidden' && truthy(r.is_active)) return false;
      if (typeFilter && ST.norm(r.store_type) !== typeFilter) return false;
      if (!q) return true;
      return [r.name_ar, r.name_en, r.phone, r.owner_phone, r.owner_name, r.city].join(' ').toLowerCase().includes(q);
    });
  }, [restaurants, search, filter, typeFilter, ST]);

  const counts = useMemo(() => ({
    active: restaurants.filter(r => truthy(r.is_active)).length,
    hidden: restaurants.filter(r => !truthy(r.is_active)).length,
  }), [restaurants]);
  const typeCounts = useMemo(() => {
    const c = {};
    restaurants.forEach(r => { const k = ST.norm(r.store_type); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [restaurants, ST]);

  const addRestaurant = async () => {
    const name = form.name_ar.trim();
    const phone = normalizePhone(form.owner_phone);
    if (!name) return toast.error('أدخل اسم المتجر');
    if (!/^\+?\d{9,15}$/.test(phone)) return toast.error('أدخل رقم هاتف صحيح');
    if (!form.owner_password || form.owner_password.length < 6) return toast.error('كلمة المرور 6 أحرف على الأقل');
    setSaving(true);
    try {
      // حماية إضافية (حتى مع الخادم القديم): لا نسمح بتحويل حساب موجود لصاحب مطعم
      try {
        const u = await api.get('/admin/users', { params: { search: phone, limit: 5 } });
        const hit = (u.data || []).find(x => normalizePhone(x.phone) === phone);
        if (hit) { const msg = await duplicatePhoneMessage(phone); setSaving(false); return toast.error(msg, { duration: 6000 }); }
      } catch { /* الفحص اختياري */ }
      const payload = {
        name_ar: name, owner_phone: phone, owner_password: form.owner_password, store_type: form.store_type,
        phone, city: '-', min_order: 10, delivery_fee: 5, delivery_time_min: 20, delivery_time_max: 40, category_id: '1',
      };
      await api.post('/admin/restaurants', payload);
      toast.success('تمت إضافة المتجر ✅ صاحب المتجر يكمل التفاصيل من بوابته');
      setShowNew(false);
      setForm(EMPTY_NEW);
      fetchRestaurants();
    } catch (e) {
      if (e?.status === 409) toast.error(await duplicatePhoneMessage(phone), { duration: 6000 });
      else toast.error(e?.message || 'فشل الإضافة');
    }
    finally { setSaving(false); }
  };

  /** تبديل حقل: زر معطّل أثناء الطلب + نرسل القيمة المطلوبة صراحةً + نعتمد ما يرجعه الخادم — A-25 */
  const toggleField = async (r, field) => {
    const key = `${r.id}:${field}`;
    if (busyKey) return;
    const want = !truthy(r[field]);
    if (field === 'is_active' && !want) {
      const ok = await confirm({ title: 'إخفاء المتجر', message: `سيختفي «${r.name_ar}» من تطبيق الزبائن ولن يستقبل طلبات. يمكنك إعادة تفعيله لاحقاً.`, confirmText: 'إخفاء' });
      if (!ok) return;
    }
    setBusyKey(key);
    try {
      const res = await api.patch(`/admin/restaurants/${r.id}/toggle`, { field, value: want });
      const val = res?.value ?? res?.data?.value ?? want;
      setRestaurants(prev => prev.map(x => (x.id === r.id ? { ...x, [field]: val } : x)));
      const msg = field === 'is_featured' ? (val ? 'تم تمييز المتجر' : 'أُلغي تمييز المتجر')
        : field === 'is_active' ? (val ? 'تم تفعيل المتجر' : 'تم إخفاء المتجر') : 'تم التحديث';
      toast.success(msg, { id: key });
    } catch (e) { toast.error(e?.message || 'فشل التحديث', { id: key }); }
    finally { setBusyKey(null); }
  };

  const shown = filtered.slice(0, visible);

  return (
    <div className="page">
      <PageHeader icon={<FiShoppingBag />} title="المطاعم والمتاجر" subtitle={`${arCount(restaurants.length, 'store', { zero: 'لا متاجر' })} · ${counts.active} نشط · ${counts.hidden} مخفي`}
        action={<PrimaryBtn onClick={() => setShowNew(true)}><FiPlus /> <span>متجر<span className="hidden sm:inline"> جديد</span></span></PrimaryBtn>} />

      <div className="lg:card lg:p-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو المدينة…" loading={refreshing} />
        <Chips value={filter} onChange={setFilter} options={[
          ['', 'الكل', restaurants.length], ['active', 'نشط', counts.active], ['hidden', 'مخفي', counts.hidden],
        ]} />
        <Chips brand value={typeFilter} onChange={setTypeFilter} options={[
          ['', '🏪 كل الأقسام'],
          ...ST.types.filter(t => typeCounts[t.key] || typeFilter === t.key).map(t => [t.key, `${t.icon} ${t.plural || t.label}`, typeCounts[t.key] || 0]),
        ]} />
      </div>

      {loading && restaurants.length === 0 ? <ListSkeleton rows={6} grid />
        : filtered.length === 0 ? ((search.trim() || filter || typeFilter) && restaurants.length > 0
            ? <EmptyState icon={<FiFilter />} title="لا نتائج لهذا الفلتر" hint="جرّب بحثاً آخر أو امسح الفلاتر"
                action={<Button variant="secondary" icon={<FiX />} onClick={() => { setSearch(''); setFilter(''); setTypeFilter(''); }}>مسح الفلاتر</Button>} />
            : <EmptyState icon={<FiShoppingBag />} title="لا توجد متاجر بعد" hint="أضف أول متجر من زر «متجر»"
                action={<PrimaryBtn onClick={() => setShowNew(true)}><FiPlus /> إضافة متجر</PrimaryBtn>} />)
        : (
          <div className="grid gap-3 lg:gap-4 sm:grid-cols-2 2xl:grid-cols-3 stagger">
            {shown.map(r => {
              const active = truthy(r.is_active);
              const featured = truthy(r.is_featured);
              const open = r.is_open != null ? truthy(r.is_open) : null;
              const st = ST.meta(r.store_type);
              return (
                <article key={r.id} className={`card card-hover p-4 flex flex-col relative overflow-hidden ${active ? '' : 'bg-[#FCFCFD]'}`}>
                  {featured && <span className="absolute top-0 left-4 grad-sunset text-white text-[10px] font-extrabold px-2 pt-1 pb-1.5 rounded-b-lg shadow-brand flex items-center gap-1"><FiStar className="fill-current" /> مميّز</span>}
                  <div className="flex gap-3.5">
                    <div className={`relative flex-shrink-0 ${active ? '' : 'grayscale opacity-70'}`}>
                      {r.logo
                        ? <img src={r.logo} className="w-16 h-16 rounded-[18px] object-cover ring-1 ring-surface-line" alt="" loading="lazy" />
                        : <div className="w-16 h-16 rounded-[18px] bg-gradient-to-br from-orange-50 to-rose-50 flex items-center justify-center text-[28px] ring-1 ring-orange-100">{st.icon}</div>}
                      {open != null && <span className={`absolute -bottom-1 -left-1 w-4 h-4 rounded-full ring-[3px] ring-white ${open ? 'bg-ok' : 'bg-gray-300'}`} title={open ? 'مفتوح' : 'مغلق'} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-ink text-[16px] truncate pl-14">{r.name_ar}</p>
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        <Badge className={active ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}>{active ? 'نشط' : 'مخفي عن الزبائن'}</Badge>
                        {open != null && <Badge className={open ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}>{open ? 'مفتوح' : 'مغلق'}</Badge>}
                        <Badge className={st.tone || NEUTRAL_TONE}>{st.icon} {st.label}</Badge>
                      </div>
                      <p className="text-[11.5px] text-ink-3 mt-1.5 truncate flex items-center gap-1.5 font-medium">
                        {r.city && r.city !== '-' && <><FiMapPin className="flex-shrink-0" />{r.city} · </>}
                        <FiPhone className="flex-shrink-0" />{r.phone ? <bdi dir="ltr" className="num">{r.phone}</bdi> : <span>بدون هاتف</span>}
                      </p>
                      <p className="text-[11.5px] text-ink-3 mt-0.5 truncate flex items-center gap-1.5 font-medium"><FiUser className="flex-shrink-0" />المالك: {r.owner_name || (r.owner_phone ? <bdi dir="ltr" className="num">{r.owner_phone}</bdi> : 'غير محدد')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 mt-4 rounded-2xl bg-surface divide-x divide-x-reverse divide-surface-line text-center py-2.5">
                    <div><p className="text-[15px] font-black text-ink num">{r.total_orders || 0}</p><p className="text-[10.5px] text-ink-3 font-bold">طلب مُسلّم</p></div>
                    <div><p className="text-[15px] font-black text-ink num">{num(r.total_revenue).toFixed(0)}<span className="text-[11px] text-ink-3">₪</span></p><p className="text-[10.5px] text-ink-3 font-bold">مدفوعات</p></div>
                    <div><p className="text-[15px] font-black text-ink num">{num(r.rating).toFixed(1)}<span className="text-amber-400 text-[12px]"> ★</span></p><p className="text-[10.5px] text-ink-3 font-bold">تقييم</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 mt-auto pt-3">
                    <button onClick={() => toggleField(r, 'is_active')} disabled={!!busyKey} aria-busy={busyKey === `${r.id}:is_active` || undefined}
                      className={`btn btn-sm disabled:opacity-60 ${active ? 'btn-secondary' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
                      {busyKey === `${r.id}:is_active` ? <Spinner /> : active ? <FiEyeOff /> : <FiEye />} {active ? 'إخفاء' : 'تفعيل'}
                    </button>
                    <button onClick={() => toggleField(r, 'is_featured')} disabled={!!busyKey} aria-pressed={featured} aria-busy={busyKey === `${r.id}:is_featured` || undefined} title={featured ? 'إلغاء التمييز' : 'تمييز المتجر'}
                      className={`btn btn-sm disabled:opacity-60 ${featured ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'btn-secondary'}`}>
                      {busyKey === `${r.id}:is_featured` ? <Spinner /> : <FiStar className={featured ? 'fill-current' : ''} />} {featured ? 'مُميّز' : 'تمييز'}
                    </button>
                    <button onClick={() => setEditing(r)} className="btn btn-sm btn-soft">
                      <FiEdit2 /> تعديل
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

      <LoadMore shown={shown.length} total={filtered.length} onMore={() => setVisible(v => v + PAGE)} />
      {serverHasMore && visible >= filtered.length && (
        <LoadMore shown={0} total={Infinity} loading={refreshing} onMore={() => fetchRestaurants({ append: true })} />
      )}

      {/* إضافة */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="متجر جديد" subtitle="صاحب المتجر يكمّل الموقع والمنيو والأوقات من بوابته" icon={<FiPlus />}>
        <div className="space-y-3">
          <Field label="اسم المتجر *"><input className="inp" placeholder="مثال: مطعم العميد" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} /></Field>
          <Field label="قسم المتجر *" hint="(يظهر المتجر للزبائن تحت هذا القسم)" as="group">
            <StoreTypePicker types={ST.types} value={form.store_type} onChange={(k) => setForm(f => ({ ...f, store_type: k }))} />
          </Field>
          <Field label="رقم هاتف صاحب المتجر *" hint="(يُستخدم لتسجيل الدخول — يجب ألا يكون مسجّلاً)">
            <input className="inp" placeholder="05XXXXXXXX" inputMode="tel" dir="ltr" style={{ textAlign: 'right' }}
              value={form.owner_phone} onChange={e => setForm(f => ({ ...f, owner_phone: e.target.value }))} />
          </Field>
          <Field label="كلمة المرور *" hint="(6 أحرف على الأقل)">
            <PasswordInput value={form.owner_password} onChange={e => setForm(f => ({ ...f, owner_password: e.target.value }))} placeholder="اكتب كلمة مرور لصاحب المتجر" />
          </Field>
          <button onClick={addRestaurant} disabled={saving} className="w-full btn-lux py-3 disabled:opacity-60">{saving ? 'جاري الإضافة…' : 'إضافة المتجر'}</button>
        </div>
      </Modal>

      <EditRestaurant ST={ST} restaurant={editing} onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await fetchRestaurants(); }}
        refetch={fetchRestaurants} />
    </div>
  );
}

function EditRestaurant({ ST, restaurant, onClose, onSaved, refetch }) {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurant) { setF(null); return; }
    setF({
      name_ar: restaurant.name_ar || '',
      phone: restaurant.phone || '',
      city: restaurant.city && restaurant.city !== '-' ? restaurant.city : '',
      address: restaurant.address || '',
      min_order: restaurant.min_order ?? '',
      store_type: ST.norm(restaurant.store_type),
      is_open: truthy(restaurant.is_open ?? true),
      commission_rate: restaurant.commission_rate ?? 15,
    });
  }, [restaurant]);

  if (!restaurant || !f) return null;
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e?.target ? e.target.value : e }));

  const save = async () => {
    if (!f.name_ar.trim()) return toast.error('أدخل اسم المتجر');
    const minOrder = f.min_order === '' ? 0 : parseFloat(f.min_order);
    if (isNaN(minOrder) || minOrder < 0) return toast.error('الحد الأدنى للطلب غير صحيح');
    const rate = parseFloat(f.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 100) return toast.error('نسبة العمولة بين 0 و 100');
    setSaving(true);
    try {
      const r = restaurant;
      // نرسل كل الحقول الحالية (الخادم القديم يكتب كل الأعمدة) + الحقول الجديدة
      await api.put(`/admin/restaurants/${r.id}`, {
        name_ar: f.name_ar.trim(), description_ar: r.description_ar ?? null, category_id: r.category_id ?? null,
        city: f.city.trim() || r.city || '-', address: f.address.trim(), lat: r.lat, lng: r.lng,
        phone: normalizePhone(f.phone), delivery_fee: r.delivery_fee, min_order: minOrder,
        delivery_time_min: r.delivery_time_min, delivery_time_max: r.delivery_time_max,
        store_type: f.store_type, is_open: f.is_open, commission_rate: rate,
      });
      // العمولة عبر مسارها الخاص — فشلها يظهر ولا يُبلَّغ «تم الحفظ» — A-22
      const problems = [];
      const rows0 = await refetch();
      const fresh0 = rows0?.find(x => x.id === r.id);
      if (rate !== num(fresh0?.commission_rate ?? r.commission_rate ?? 15)) {
        try { await api.patch(`/admin/restaurants/${r.id}/commission`, { rate }); }
        catch (e) { problems.push(`العمولة: ${e?.message || 'تعذّر حفظها'}`); }
      }
      // حالة فتح/إغلاق: نبدّل فقط إن لم يطبّقها الخادم
      if (fresh0 && fresh0.is_open != null && truthy(fresh0.is_open) !== f.is_open) {
        try { await api.patch(`/admin/restaurants/${r.id}/toggle`, { field: 'is_open', value: f.is_open }); }
        catch (e) { problems.push(`حالة الفتح: ${e?.message || 'تعذّر حفظها'}`); }
      }
      if (fresh0 && fresh0.store_type && ST.norm(fresh0.store_type) !== f.store_type) problems.push('قسم المتجر لم يُحفظ على الخادم');
      if (problems.length) {
        await refetch();
        toast.error(`حُفظت باقي البيانات، لكن:\n${problems.join('\n')}`, { duration: 6000 });
        return; // تبقى النافذة مفتوحة لإعادة المحاولة
      }
      toast.success('تم حفظ التعديلات');
      onSaved();
    } catch (e) { toast.error(e?.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="تعديل المتجر" subtitle={restaurant.name_ar} icon={<FiEdit2 />}
      footer={<button onClick={save} disabled={saving} className="w-full btn-lux py-3 disabled:opacity-60">{saving ? 'جاري الحفظ…' : 'حفظ التعديلات'}</button>}>
      <div className="space-y-3">
        <Field label="الاسم *"><input className="inp" value={f.name_ar} onChange={set('name_ar')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="هاتف المتجر"><input className="inp" inputMode="tel" dir="ltr" style={{ textAlign: 'right' }} value={f.phone} onChange={set('phone')} /></Field>
          <Field label="المدينة"><input className="inp" value={f.city} onChange={set('city')} /></Field>
        </div>
        <Field label="العنوان"><input className="inp" value={f.address} onChange={set('address')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="الحد الأدنى للطلب (₪)"><input className="inp" type="number" min="0" step="0.5" value={f.min_order} onChange={set('min_order')} /></Field>
          <Field label="نسبة العمولة %"><input className="inp" type="number" min="0" max="100" step="0.5" value={f.commission_rate} onChange={set('commission_rate')} /></Field>
        </div>
        <Field label="قسم المتجر" hint="(يحدد أين يظهر المتجر في تطبيق الزبائن)" as="group">
          <StoreTypePicker types={ST.types} value={f.store_type} onChange={(k) => setF(p => ({ ...p, store_type: k }))} />
        </Field>
        <div className="flex items-center justify-between rounded-2xl bg-surface p-3.5">
          <div><p className="font-bold text-sm text-ink">المتجر مفتوح الآن</p><p className="text-[11.5px] text-ink-3">يستقبل طلبات جديدة</p></div>
          <Switch checked={f.is_open} onChange={(v) => setF(p => ({ ...p, is_open: v }))} label="المتجر مفتوح الآن" />
        </div>
        {/* «إخفاء نهائي» كان مطابقاً لزر «إخفاء» (ليس نهائياً) — أُزيل لتفادي التضليل؛ الإخفاء/التفعيل من بطاقة المتجر — A-31 */}
        <p className="text-[11.5px] text-ink-3 font-medium">لإخفاء المتجر عن الزبائن استخدم زر «إخفاء» في بطاقته — الإخفاء لا يحذف أي بيانات ويمكن التراجع عنه.</p>
      </div>
    </Modal>
  );
}
