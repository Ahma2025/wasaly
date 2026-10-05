import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiEye, FiEyeOff, FiStar } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { STORE_TYPES, storeType, normStoreType, normalizePhone, truthy, num } from '../utils/format';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, LoadMore, Modal, Field, PasswordInput, Badge, PrimaryBtn, useConfirm } from '../components/ui';

const FETCH_LIMIT = 1000;
const PAGE = 30;
const EMPTY_NEW = { name_ar: '', owner_phone: '', owner_password: '', store_type: 'restaurant' };

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
  const [visible, setVisible] = useState(PAGE);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY_NEW);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => { fetchRestaurants(); }, []);
  useEffect(() => { if (params.get('new') === '1') { setShowNew(true); const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); } }, [params]);
  useEffect(() => { setVisible(PAGE); }, [search, filter]);

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
      if (filter && STORE_TYPES[filter] && normStoreType(r.store_type) !== filter) return false;
      if (!q) return true;
      return [r.name_ar, r.name_en, r.phone, r.owner_phone, r.owner_name, r.city].join(' ').toLowerCase().includes(q);
    });
  }, [restaurants, search, filter]);

  const counts = useMemo(() => ({
    active: restaurants.filter(r => truthy(r.is_active)).length,
    hidden: restaurants.filter(r => !truthy(r.is_active)).length,
  }), [restaurants]);

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
        if (hit) { setSaving(false); return toast.error(`رقم الهاتف مسجّل مسبقاً باسم «${hit.name || 'مستخدم'}» — استخدم رقماً آخر`); }
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
    } catch (e) { toast.error(e?.message || (e?.status === 409 ? 'رقم الهاتف مسجّل مسبقاً' : 'فشل الإضافة')); }
    finally { setSaving(false); }
  };

  const toggleField = async (r, field) => {
    if (field === 'is_active' && truthy(r.is_active)) {
      const ok = await confirm({ title: 'إخفاء المتجر', message: `سيختفي «${r.name_ar}» من تطبيق الزبائن ولن يستقبل طلبات. يمكنك إعادة تفعيله لاحقاً.`, confirmText: 'إخفاء' });
      if (!ok) return;
    }
    try {
      const res = await api.patch(`/admin/restaurants/${r.id}/toggle`, { field });
      const val = res?.value ?? !truthy(r[field]);
      setRestaurants(prev => prev.map(x => (x.id === r.id ? { ...x, [field]: val } : x)));
      toast.success('تم التحديث');
    } catch (e) { toast.error(e?.message || 'فشل التحديث'); }
  };

  const shown = filtered.slice(0, visible);

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="🏪" title="المطاعم والمتاجر" subtitle={`${restaurants.length} متجر · ${counts.active} نشط`}
        action={<PrimaryBtn onClick={() => setShowNew(true)} className="flex items-center gap-1.5"><FiPlus /> متجر</PrimaryBtn>} />

      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو المدينة…" loading={refreshing} />
      <Chips value={filter} onChange={setFilter} options={[
        ['', 'الكل', restaurants.length], ['active', 'نشط', counts.active], ['hidden', 'مخفي', counts.hidden],
        ['restaurant', '🍽️ مطاعم'], ['supermarket', '🛒 سوبرماركت'], ['pharmacy', '💊 صيدليات'],
      ]} />

      {loading && restaurants.length === 0 ? <ListSkeleton rows={6} />
        : filtered.length === 0 ? <EmptyState icon="🏪" title="لا توجد متاجر" hint={search ? 'لا نتائج مطابقة للبحث' : 'أضف أول متجر من زر «متجر»'} />
        : (
          <div className="space-y-3">
            {shown.map(r => {
              const active = truthy(r.is_active);
              const featured = truthy(r.is_featured);
              const st = storeType(r.store_type);
              return (
                <div key={r.id} className={`card p-4 ${active ? '' : 'opacity-80'}`}>
                  <div className="flex gap-3">
                    {r.logo
                      ? <img src={r.logo} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" alt="" />
                      : <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">{st.icon}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-900 truncate">{r.name_ar}</p>
                      <div className="flex gap-1 flex-wrap mt-1">
                        <Badge className={active ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}>{active ? 'نشط' : 'مخفي عن الزبائن'}</Badge>
                        {r.is_open != null && <Badge className={truthy(r.is_open) ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}>{truthy(r.is_open) ? 'مفتوح' : 'مغلق'}</Badge>}
                        {featured && <Badge className="bg-yellow-50 text-yellow-700 ring-yellow-200">⭐ مميّز</Badge>}
                        <Badge className="bg-orange-50 text-orange-700 ring-orange-200">{st.icon} {st.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-400 mt-1 truncate">{r.city && r.city !== '-' ? `${r.city} · ` : ''}{r.phone || 'بدون هاتف'} · المالك: {r.owner_name || r.owner_phone || 'غير محدد'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
                    <div><p className="text-sm font-black text-orange-500 tabular-nums">{r.total_orders || 0}</p><p className="text-[10px] text-gray-400">طلب مُسلّم</p></div>
                    <div><p className="text-sm font-black text-green-600 tabular-nums">{num(r.total_revenue).toFixed(0)}₪</p><p className="text-[10px] text-gray-400">مدفوعات الطلبات</p></div>
                    <div><p className="text-sm font-black text-blue-600 tabular-nums">{num(r.rating).toFixed(1)} ⭐</p><p className="text-[10px] text-gray-400">تقييم</p></div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <button onClick={() => toggleField(r, 'is_active')}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${active ? 'bg-gray-100 text-gray-600' : 'bg-green-50 text-green-600'}`}>
                      {active ? <><FiEyeOff /> إخفاء</> : <><FiEye /> تفعيل</>}
                    </button>
                    <button onClick={() => toggleField(r, 'is_featured')}
                      className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${featured ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-50 text-gray-500'}`}>
                      <FiStar /> {featured ? 'إلغاء التمييز' : 'تمييز'}
                    </button>
                    <button onClick={() => setEditing(r)} className="py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-600 flex items-center justify-center gap-1">
                      <FiEdit2 /> تعديل
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <LoadMore shown={shown.length} total={filtered.length} onMore={() => setVisible(v => v + PAGE)} />
      {serverHasMore && visible >= filtered.length && (
        <LoadMore shown={0} total={Infinity} loading={refreshing} onMore={() => fetchRestaurants({ append: true })} />
      )}

      {/* إضافة */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="متجر جديد" subtitle="صاحب المتجر يكمّل الموقع والمنيو والأوقات من بوابته">
        <div className="space-y-3">
          <Field label="اسم المتجر *"><input className="inp" placeholder="مثال: مطعم العميد" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} /></Field>
          <Field label="نوع المتجر">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(STORE_TYPES).map(([k, v]) => (
                <button key={k} type="button" onClick={() => setForm(f => ({ ...f, store_type: k }))}
                  className={`py-2.5 rounded-xl text-xs font-bold ${form.store_type === k ? 'chip-on' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                  {v.icon} {v.label}
                </button>
              ))}
            </div>
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

      <EditRestaurant restaurant={editing} onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await fetchRestaurants(); }}
        refetch={fetchRestaurants} />
    </div>
  );
}

function EditRestaurant({ restaurant, onClose, onSaved, refetch }) {
  const confirm = useConfirm();
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
      store_type: normStoreType(restaurant.store_type),
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
      // توافق مع الخادم القديم: العمولة عبر مسارها الخاص
      if (rate !== num(r.commission_rate ?? 15)) {
        try { await api.patch(`/admin/restaurants/${r.id}/commission`, { rate }); } catch { /* ignore */ }
      }
      // حالة فتح/إغلاق: نتحقق بعد الحفظ ونبدّل فقط إن لم يطبّقها الخادم
      const rows = await refetch();
      const fresh = rows?.find(x => x.id === r.id);
      if (fresh && fresh.is_open != null && truthy(fresh.is_open) !== f.is_open) {
        try { await api.patch(`/admin/restaurants/${r.id}/toggle`, { field: 'is_open' }); } catch { /* ignore */ }
      }
      if (fresh && fresh.store_type && normStoreType(fresh.store_type) !== f.store_type) {
        toast('نوع المتجر يتطلب تحديث الخادم ليُحفظ', { icon: 'ℹ️' });
      }
      toast.success('تم حفظ التعديلات');
      onSaved();
    } catch (e) { toast.error(e?.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const hideForever = async () => {
    const ok = await confirm({
      title: 'إخفاء نهائي',
      message: `سيُخفى «${restaurant.name_ar}» من التطبيق ولن يستقبل طلبات.\nالبيانات والطلبات السابقة تبقى محفوظة، ويمكن إعادة التفعيل من زر «تفعيل».`,
      confirmText: 'إخفاء نهائي',
    });
    if (!ok) return;
    try { await api.delete(`/admin/restaurants/${restaurant.id}`); toast.success('تم إخفاء المتجر'); onSaved(); }
    catch (e) { toast.error(e?.message || 'فشل'); }
  };

  return (
    <Modal open onClose={onClose} title="تعديل المتجر" subtitle={restaurant.name_ar}
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
        <Field label="نوع المتجر">
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(STORE_TYPES).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setF(p => ({ ...p, store_type: k }))}
                className={`py-2.5 rounded-xl text-xs font-bold ${f.store_type === k ? 'chip-on' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>{v.icon} {v.label}</button>
            ))}
          </div>
        </Field>
        <div className="flex items-center justify-between rounded-2xl bg-gray-50 p-3">
          <div><p className="font-bold text-sm text-gray-800">المتجر مفتوح الآن</p><p className="text-[11px] text-gray-400">يستقبل طلبات جديدة</p></div>
          <button type="button" onClick={() => setF(p => ({ ...p, is_open: !p.is_open }))} aria-pressed={f.is_open}
            className={`w-14 h-8 rounded-full relative flex-shrink-0 ${f.is_open ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${f.is_open ? 'right-1' : 'right-7'}`} />
          </button>
        </div>
        {truthy(restaurant.is_active) && (
          <div className="rounded-2xl border border-red-100 bg-red-50/50 p-3">
            <p className="font-bold text-sm text-red-700">منطقة الخطر</p>
            <p className="text-[11px] text-red-500 mb-2">الإخفاء النهائي لا يحذف البيانات — يوقف ظهور المتجر واستقبال الطلبات.</p>
            <button onClick={hideForever} className="w-full py-2.5 rounded-xl bg-white text-red-600 font-bold text-sm border border-red-200">إخفاء نهائي</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
