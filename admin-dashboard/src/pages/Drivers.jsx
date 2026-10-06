import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPlus, FiBarChart2, FiEdit2, FiSlash, FiTrash2, FiCheck, FiTruck, FiWifi, FiActivity, FiUsers, FiPhone } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { normalizePhone, truthy, num, fmtDate } from '../utils/format';
import { PageHeader, Chips, SearchInput, EmptyState, ListSkeleton, LoadMore, Modal, Field, PasswordInput, Badge, PrimaryBtn, StatTile, Avatar, useConfirm } from '../components/ui';
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
    <div className="page">
      <PageHeader icon={<FiTruck />} title="السائقون" subtitle={`${drivers.length} سائق مسجّل · ${stats.online} متصل الآن`}
        action={<PrimaryBtn onClick={() => setShowForm(true)}><FiPlus /> <span>سائق<span className="hidden sm:inline"> جديد</span></span></PrimaryBtn>} />

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatTile label="متصل" value={stats.online} tone="green" icon={<FiWifi />} />
        <StatTile label="مشغول" value={stats.busy} tone="orange" icon={<FiActivity />} />
        <StatTile label="الكل" value={drivers.length} tone="violet" icon={<FiUsers />} />
        <div className="hidden lg:block"><StatTile label="محظور" value={stats.blocked} tone="slate" icon={<FiSlash />} /></div>
      </div>

      <div className="lg:card lg:p-4 space-y-3">
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو الهاتف أو اللوحة…" loading={refreshing} />
        <Chips value={filter} onChange={setFilter} options={[
          ['', 'الكل', drivers.length], ['online', 'متصل', stats.online], ['busy', 'مشغول', stats.busy], ['blocked', 'محظور', stats.blocked],
        ]} />
      </div>

      {loading && drivers.length === 0 ? <ListSkeleton rows={6} grid />
        : filtered.length === 0 ? <EmptyState icon={<FiTruck />} title="لا يوجد سائقون" hint={search ? 'لا نتائج مطابقة' : 'أضف أول سائق من زر «سائق»'}
            action={!search && <PrimaryBtn onClick={() => setShowForm(true)}><FiPlus /> إضافة سائق</PrimaryBtn>} />
        : (
          <div className="grid gap-3 lg:gap-4 sm:grid-cols-2 2xl:grid-cols-3 items-start stagger">
            {shown.map(d => {
              const online = truthy(d.is_online), busy = truthy(d.is_busy), blocked = truthy(d.is_blocked);
              const open = expanded === uid(d);
              return (
                <div key={d.id} className={`card card-hover p-4 ${blocked ? 'bg-[#FFFBFB] border-red-100' : ''}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={d.name || 'س'} size={52} rounded={17} tint={blocked ? '#F04438' : '#8B5CF6'} status={online ? (busy ? 'busy' : 'online') : 'off'} />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-ink text-[15.5px] truncate">{d.name}</p>
                      <div className="flex items-center gap-1 flex-wrap mt-0.5">
                        <Badge className={online ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-100 text-gray-500 ring-gray-200'}>{online ? 'متصل' : 'غير متصل'}</Badge>
                        {busy && <Badge className="bg-orange-50 text-orange-700 ring-orange-200">مشغول</Badge>}
                        {blocked && <Badge className="bg-red-50 text-red-600 ring-red-200">محظور</Badge>}
                        {truthy(d.supports_groups) && <Badge className="bg-violet-50 text-violet-700 ring-violet-200">يدعم المجمّعة</Badge>}
                      </div>
                      <p className="text-[11.5px] text-ink-3 mt-1.5 truncate font-medium flex items-center gap-1.5"><FiPhone className="flex-shrink-0" /><span dir="ltr" className="num">{d.phone}</span> · {d.vehicle_type || '—'} · <span className="font-mono">{d.vehicle_plate || 'بدون لوحة'}</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 mt-4 rounded-2xl bg-surface divide-x divide-x-reverse divide-surface-line text-center py-2.5">
                    <div><p className="text-[15px] font-black text-ink num">{d.total_orders || 0}</p><p className="text-[10.5px] text-ink-3 font-bold">توصيلة</p></div>
                    <div><p className="text-[15px] font-black text-ink num">{num(d.total_earnings).toFixed(1)}<span className="text-[11px] text-ink-3">₪</span></p><p className="text-[10.5px] text-ink-3 font-bold">أرباح</p></div>
                    <div><p className="text-[15px] font-black text-ink num">{num(d.rating).toFixed(1)}<span className="text-amber-400 text-[12px]"> ★</span></p><p className="text-[10.5px] text-ink-3 font-bold">تقييم</p></div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mt-3">
                    <button onClick={() => setExpanded(open ? null : uid(d))} aria-expanded={open} className={`btn btn-sm !px-1 ${open ? 'btn-dark' : 'bg-sky-50 text-sky-700 hover:bg-sky-100'}`}><FiBarChart2 /> تفاصيل</button>
                    <button onClick={() => setEditing(d)} className="btn btn-sm !px-1 btn-soft"><FiEdit2 /> المركبة</button>
                    <button onClick={() => blockDriver(d)} className={`btn btn-sm !px-1 ${blocked ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>{blocked ? <><FiCheck /> رفع</> : <><FiSlash /> حظر</>}</button>
                    <button onClick={() => deleteDriver(d)} className="btn btn-sm !px-1 btn-danger"><FiTrash2 /> حذف</button>
                  </div>

                  {open && <DriverStats driverId={uid(d)} />}
                </div>
              );
            })}
          </div>
        )}

      <LoadMore shown={shown.length} total={filtered.length} onMore={() => setVisible(v => v + PAGE)} />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="سائق جديد" subtitle="ينشئ حساب السائق وملف المركبة" icon={<FiTruck />}>
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
    <Modal open onClose={onClose} title="تعديل المركبة" subtitle={driver.name} size="sm" icon={<FiEdit2 />}>
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

  if (failed) return <p className="mt-3 text-xs text-center text-ink-3 bg-surface rounded-xl py-3 font-bold">تعذّر تحميل الإحصائيات</p>;
  if (!stats) return <div className="mt-3 flex gap-2"><Sk h={44} r={12} className="flex-1" /><Sk h={44} r={12} className="flex-1" /><Sk h={44} r={12} className="flex-1" /></div>;

  return (
    <div className="mt-3 grad-ink text-white rounded-2xl p-4 space-y-3 animate-fade-up">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="font-black num text-[15px]">{stats.total_orders || 0}</p><p className="text-[10px] text-white/55 font-bold">إجمالي الطلبات</p></div>
        <div><p className="font-black num text-[15px] text-green-300">{num(stats.total_earnings).toFixed(2)}₪</p><p className="text-[10px] text-white/55 font-bold">إجمالي الأرباح</p></div>
        <div><p className="font-black num text-[15px] text-orange-300">{num(stats.avg_per_delivery).toFixed(2)}₪</p><p className="text-[10px] text-white/55 font-bold">متوسط التوصيلة</p></div>
      </div>
      {stats.weekly?.length > 0 && (() => {
        const max = Math.max(1, ...stats.weekly.map(w => num(w.earnings)));
        return (
          <div className="pt-3 border-t border-white/10">
            <p className="text-[11px] font-bold text-white/60 mb-2">آخر 7 أيام</p>
            <div className="flex items-end gap-1.5 h-24" dir="ltr">
              {stats.weekly.map((w, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${fmtDate(w.date)} · ${w.orders} طلب · ${num(w.earnings).toFixed(2)}₪`}>
                  <span className="text-[9px] text-white/60 num">{num(w.earnings).toFixed(0)}</span>
                  <div className="w-full rounded-t-md grad-sunset grow-y" style={{ height: `${Math.max(4, (num(w.earnings) / max) * 70)}%`, animationDelay: `${i * 50}ms` }} />
                  <span className="text-[9px] text-white/50">{fmtDate(w.date, { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
