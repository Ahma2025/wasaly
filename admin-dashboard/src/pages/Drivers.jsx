import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPlus, FiBarChart2, FiEdit2, FiSlash, FiTrash2, FiCheck } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { normalizePhone, truthy, num, fmtDate } from '../utils/format';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, LoadMore, Modal, Field, PasswordInput, Badge, PrimaryBtn, StatTile, useConfirm } from '../components/ui';
import { Sk } from '../components/Skeleton';

const PAGE = 30;
const VEHICLES = ['دراجة نارية', 'دراجة', 'سيارة', 'دراجة هوائية'];
const EMPTY = { name: '', phone: '', password: '', vehicle_type: 'دراجة نارية', vehicle_plate: '' };

export default function Drivers() {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const cached = readCache('adm_drivers');
  const [drivers, setDrivers] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [visible, setVisible] = useState(PAGE);
  const [editing, setEditing] = useState(null);

  useEffect(() => { fetchDrivers(); }, []);
  useEffect(() => { if (params.get('new') === '1') { setShowForm(true); const p = new URLSearchParams(params); p.delete('new'); setParams(p, { replace: true }); } }, [params]);
  useEffect(() => { setVisible(PAGE); }, [search, filter]);

  const fetchDrivers = async () => {
    setRefreshing(true);
    try {
      const r = await api.get('/drivers');
      setDrivers(r.data || []); writeCache('adm_drivers', r.data || []);
    } catch (e) { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل السائقين'); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const uid = (d) => d.user_id || d.id;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter(d => {
      if (filter === 'online' && !truthy(d.is_online)) return false;
      if (filter === 'busy' && !truthy(d.is_busy)) return false;
      if (filter === 'blocked' && !truthy(d.is_blocked)) return false;
      if (!q) return true;
      return [d.name, d.phone, d.vehicle_plate, d.vehicle_type].join(' ').toLowerCase().includes(q);
    });
  }, [drivers, search, filter]);

  const stats = useMemo(() => ({
    online: drivers.filter(d => truthy(d.is_online)).length,
    busy: drivers.filter(d => truthy(d.is_busy)).length,
    blocked: drivers.filter(d => truthy(d.is_blocked)).length,
  }), [drivers]);

  const addDriver = async () => {
    const phone = normalizePhone(form.phone);
    if (!form.name.trim()) return toast.error('أدخل اسم السائق');
    if (!/^\+?\d{9,15}$/.test(phone)) return toast.error('أدخل رقم هاتف صحيح');
    if (!form.password || form.password.length < 6) return toast.error('كلمة المرور 6 أحرف على الأقل');
    setSaving(true);
    try {
      await api.post('/drivers', { ...form, name: form.name.trim(), phone });
      toast.success('تمت إضافة السائق');
      setShowForm(false);
      setForm(EMPTY);
      fetchDrivers();
    } catch (e) { toast.error(e?.message || 'فشل الإضافة'); }
    finally { setSaving(false); }
  };

  const deleteDriver = async (d) => {
    const ok = await confirm({
      title: 'حذف السائق',
      message: `سيُزال «${d.name}» من قائمة السائقين ويتحوّل حسابه إلى زبون غير نشط. سجلّ طلباته السابقة يبقى محفوظاً.`,
      confirmText: 'حذف',
    });
    if (!ok) return;
    try { await api.delete(`/drivers/${uid(d)}`); toast.success('تم حذف السائق'); fetchDrivers(); }
    catch (e) { toast.error(e?.message || 'فشل الحذف'); }
  };

  const blockDriver = async (d) => {
    const blocked = truthy(d.is_blocked);
    const ok = await confirm({
      title: blocked ? 'رفع الحظر' : 'حظر السائق',
      message: blocked ? `سيتمكّن «${d.name}» من العمل مجدداً.` : `لن يتمكّن «${d.name}» من تسجيل الدخول أو استقبال الطلبات.`,
      confirmText: blocked ? 'رفع الحظر' : 'حظر',
      danger: !blocked,
    });
    if (!ok) return;
    try {
      const r = await api.patch(`/admin/users/${uid(d)}/block`);
      setDrivers(prev => prev.map(x => (uid(x) === uid(d) ? { ...x, is_blocked: r?.is_blocked ?? !blocked } : x)));
      toast.success(blocked ? 'تم رفع الحظر' : 'تم الحظر');
    } catch (e) { toast.error(e?.message || 'فشل'); }
  };

  const shown = filtered.slice(0, visible);

  return (
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="🛵" title="السائقون" subtitle={`${drivers.length} سائق مسجّل`}
        action={<PrimaryBtn onClick={() => setShowForm(true)} className="flex items-center gap-1.5"><FiPlus /> سائق</PrimaryBtn>} />

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="متصل" value={stats.online} tone="green" />
        <StatTile label="مشغول" value={stats.busy} tone="orange" />
        <StatTile label="الكل" value={drivers.length} tone="violet" />
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو اللوحة…" loading={refreshing} />
      <Chips value={filter} onChange={setFilter} options={[
        ['', 'الكل', drivers.length], ['online', 'متصل', stats.online], ['busy', 'مشغول', stats.busy], ['blocked', 'محظور', stats.blocked],
      ]} />

      {loading && drivers.length === 0 ? <ListSkeleton rows={6} />
        : filtered.length === 0 ? <EmptyState icon="🛵" title="لا يوجد سائقون" hint={search ? 'لا نتائج مطابقة' : 'أضف أول سائق من زر «سائق»'} />
        : (
          <div className="space-y-3">
            {shown.map(d => {
              const online = truthy(d.is_online), busy = truthy(d.is_busy), blocked = truthy(d.is_blocked);
              const open = expanded === uid(d);
              return (
                <div key={d.id} className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 font-black text-lg flex-shrink-0">
                      {d.name?.[0] || '🛵'}
                      <span className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-gray-900 truncate">{d.name}</p>
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        <Badge className={online ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}>{online ? 'متصل' : 'غير متصل'}</Badge>
                        {busy && <Badge className="bg-orange-50 text-orange-700 ring-orange-200">مشغول</Badge>}
                        {blocked && <Badge className="bg-red-50 text-red-600 ring-red-200">محظور</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1 truncate"><span dir="ltr">{d.phone}</span> · {d.vehicle_type || '—'} · {d.vehicle_plate || 'بدون لوحة'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-center">
                    <div><p className="text-sm font-black text-orange-500 tabular-nums">{d.total_orders || 0}</p><p className="text-[10px] text-gray-400">توصيلة</p></div>
                    <div><p className="text-sm font-black text-green-600 tabular-nums">{num(d.total_earnings).toFixed(1)}₪</p><p className="text-[10px] text-gray-400">أرباح</p></div>
                    <div><p className="text-sm font-black text-blue-600 tabular-nums">{num(d.rating).toFixed(1)} ⭐</p><p className="text-[10px] text-gray-400">تقييم</p></div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-3">
                    <button onClick={() => setExpanded(open ? null : uid(d))} className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${open ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}><FiBarChart2 /> تفاصيل</button>
                    <button onClick={() => setEditing(d)} className="py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-600 flex items-center justify-center gap-1"><FiEdit2 /> المركبة</button>
                    <button onClick={() => blockDriver(d)} className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${blocked ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-700'}`}>{blocked ? <><FiCheck /> رفع</> : <><FiSlash /> حظر</>}</button>
                    <button onClick={() => deleteDriver(d)} className="py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 flex items-center justify-center gap-1"><FiTrash2 /> حذف</button>
                  </div>

                  {open && <DriverStats driverId={uid(d)} />}
                </div>
              );
            })}
          </div>
        )}

      <LoadMore shown={shown.length} total={filtered.length} onMore={() => setVisible(v => v + PAGE)} />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="سائق جديد" subtitle="ينشئ حساب السائق وملف المركبة">
        <div className="space-y-3">
          <Field label="الاسم الكامل *"><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
          <Field label="رقم الهاتف *"><input className="inp" inputMode="tel" dir="ltr" style={{ textAlign: 'right' }} placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="كلمة المرور *" hint="(6 أحرف على الأقل)"><PasswordInput value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="المركبة">
              <select className="inp" value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}>
                {VEHICLES.map(v => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="رقم اللوحة"><input className="inp" value={form.vehicle_plate} onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value }))} /></Field>
          </div>
          <button onClick={addDriver} disabled={saving} className="w-full btn-lux py-3 disabled:opacity-60">{saving ? 'جاري الحفظ…' : 'إضافة السائق'}</button>
        </div>
      </Modal>

      <EditVehicle driver={editing} onClose={() => setEditing(null)} onSaved={(patch) => {
        setDrivers(prev => prev.map(x => (uid(x) === uid(editing) ? { ...x, ...patch } : x)));
        setEditing(null);
      }} />
    </div>
  );
}

function EditVehicle({ driver, onClose, onSaved }) {
  const [v, setV] = useState({ vehicle_type: '', vehicle_plate: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (driver) setV({ vehicle_type: driver.vehicle_type || VEHICLES[0], vehicle_plate: driver.vehicle_plate || '' }); }, [driver]);
  if (!driver) return null;
  const id = driver.user_id || driver.id;

  const save = async () => {
    setSaving(true);
    const body = { vehicle_type: v.vehicle_type, vehicle_plate: v.vehicle_plate.trim() };
    try {
      try { await api.put(`/drivers/${id}`, body); }
      catch (e) { if (e?.status === 404) await api.patch(`/drivers/${id}`, body); else throw e; }
      toast.success('تم تحديث المركبة');
      onSaved(body);
    } catch (e) {
      toast.error(e?.status === 404 ? 'تعديل المركبة يتطلب تحديث الخادم (PUT /drivers/:id)' : (e?.message || 'فشل الحفظ'));
    } finally { setSaving(false); }
  };

  const options = VEHICLES.includes(v.vehicle_type) ? VEHICLES : [v.vehicle_type, ...VEHICLES];
  return (
    <Modal open onClose={onClose} title="تعديل المركبة" subtitle={driver.name} size="sm">
      <div className="space-y-3">
        <Field label="نوع المركبة">
          <select className="inp" value={v.vehicle_type} onChange={e => setV(p => ({ ...p, vehicle_type: e.target.value }))}>
            {options.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="رقم اللوحة"><input className="inp" value={v.vehicle_plate} onChange={e => setV(p => ({ ...p, vehicle_plate: e.target.value }))} /></Field>
        <button onClick={save} disabled={saving} className="w-full btn-lux py-3 disabled:opacity-60">{saving ? 'جاري الحفظ…' : 'حفظ'}</button>
      </div>
    </Modal>
  );
}

function DriverStats({ driverId }) {
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api.get(`/admin/driver-stats/${driverId}`).then(r => setStats(r.data || {})).catch(() => setFailed(true));
  }, [driverId]);

  if (failed) return <p className="mt-3 text-xs text-center text-gray-400">تعذّر تحميل الإحصائيات</p>;
  if (!stats) return <div className="mt-3 flex gap-2"><Sk h={44} r={12} className="flex-1" /><Sk h={44} r={12} className="flex-1" /><Sk h={44} r={12} className="flex-1" /></div>;

  return (
    <div className="mt-3 bg-gradient-to-br from-orange-50 to-rose-50 rounded-2xl p-3 space-y-2 animate-fade-up">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="font-black text-orange-600 tabular-nums">{stats.total_orders || 0}</p><p className="text-[10px] text-gray-500">إجمالي الطلبات</p></div>
        <div><p className="font-black text-green-600 tabular-nums">{num(stats.total_earnings).toFixed(2)}₪</p><p className="text-[10px] text-gray-500">إجمالي الأرباح</p></div>
        <div><p className="font-black text-blue-600 tabular-nums">{num(stats.avg_per_delivery).toFixed(2)}₪</p><p className="text-[10px] text-gray-500">متوسط التوصيلة</p></div>
      </div>
      {stats.weekly?.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-orange-100">
          <p className="text-xs font-bold text-gray-600">آخر 7 أيام</p>
          {stats.weekly.map((w, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-500">{fmtDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="tabular-nums">{w.orders} طلب · <strong>{num(w.earnings).toFixed(2)}₪</strong></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
