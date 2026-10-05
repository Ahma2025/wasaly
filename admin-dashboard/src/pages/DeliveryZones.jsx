import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiPlus, FiEdit2, FiTrash2, FiAlertTriangle, FiMapPin, FiInfo, FiNavigation } from 'react-icons/fi';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { num } from '../utils/format';
import { PageHeader, EmptyState, ListSkeleton, Modal, Field, PrimaryBtn, useConfirm } from '../components/ui';

const MAX_KM = 100;
const FALLBACK_FEE = 5;
const EMPTY = { name: '', min_km: '', max_km: '', price: '' };
const PRESETS = [
  { name: 'قريب (0 - 1 كم)', min_km: '0', max_km: '1', price: '' },
  { name: 'متوسط (1 - 3 كم)', min_km: '1', max_km: '3', price: '' },
  { name: 'بعيد (3 - 5 كم)', min_km: '3', max_km: '5', price: '' },
];

const ZONE_COLORS = [
  'linear-gradient(135deg,#FF8A00,#FF6B00)', 'linear-gradient(135deg,#FF6B3A,#F53B57)', 'linear-gradient(135deg,#F53B57,#C0265A)',
  'linear-gradient(135deg,#B42A7C,#7C3AED)', 'linear-gradient(135deg,#7C3AED,#4F46E5)', 'linear-gradient(135deg,#4F46E5,#2E90FA)',
];

const overlaps =(a, b) => num(a.min_km) < num(b.max_km) && num(b.min_km) < num(a.max_km);

/** فحص التداخل والفجوات في المناطق (المسافة d تطابق min ≤ d < max) */
function analyze(zones) {
  const z = [...zones].sort((a, b) => num(a.min_km) - num(b.min_km));
  const issues = [];
  if (z.length && num(z[0].min_km) > 0) issues.push({ type: 'gap', text: `لا توجد منطقة من 0 حتى ${num(z[0].min_km)} كم` });
  for (let i = 1; i < z.length; i++) {
    const prev = z[i - 1], cur = z[i];
    if (num(cur.min_km) < num(prev.max_km)) issues.push({ type: 'overlap', text: `تداخل بين «${prev.name}» و«${cur.name}» (${num(cur.min_km)}–${Math.min(num(prev.max_km), num(cur.max_km))} كم)` });
    else if (num(cur.min_km) > num(prev.max_km)) issues.push({ type: 'gap', text: `فجوة بين ${num(prev.max_km)} و ${num(cur.min_km)} كم` });
  }
  return { sorted: z, issues, maxCovered: z.length ? Math.max(...z.map(x => num(x.max_km))) : 0 };
}

export default function DeliveryZones() {
  const confirm = useConfirm();
  const cached = readCache('adm_zones');
  const [zones, setZones] = useState(cached || []);
  const [loading, setLoading] = useState(!cached);
  const [editing, setEditing] = useState(null); // null | {…zone} | {…EMPTY, id: undefined}
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchZones(); }, []);

  const fetchZones = async () => {
    try {
      const r = await api.get('/delivery-zones');
      setZones(r.data || []); writeCache('adm_zones', r.data || []);
    } catch (e) { if (e?.status !== 401 && e?.status !== 403) toast.error('فشل تحميل المناطق'); }
    finally { setLoading(false); }
  };

  const { sorted, issues, maxCovered } = useMemo(() => analyze(zones), [zones]);
  const scaleMax = Math.max(1, Math.ceil(maxCovered));
  const tickStep = scaleMax <= 6 ? 1 : scaleMax <= 12 ? 2 : scaleMax <= 30 ? 5 : scaleMax <= 60 ? 10 : 20;
  const ticks = Array.from({ length: Math.floor(scaleMax / tickStep) + 1 }, (_, i) => i * tickStep);

  const validateZone = (z) => {
    const min = parseFloat(z.min_km), max = parseFloat(z.max_km), price = parseFloat(z.price);
    if (!z.name?.trim()) return 'أدخل اسم المنطقة';
    if (isNaN(min) || min < 0) return 'أدخل المسافة الدنيا بشكل صحيح';
    if (isNaN(max) || max <= min) return 'المسافة القصوى يجب أن تكون أكبر من الدنيا';
    if (max > MAX_KM) return `الحد الأقصى للمسافة ${MAX_KM} كم`;
    if (isNaN(price) || price < 0) return 'أدخل السعر بشكل صحيح';
    const clash = zones.find(o => o.id !== z.id && overlaps(o, { min_km: min, max_km: max }));
    if (clash) return `المدى يتداخل مع «${clash.name}» (${num(clash.min_km)}–${num(clash.max_km)} كم)`;
    return null;
  };

  const save = async () => {
    const z = editing;
    const err = validateZone(z);
    if (err) return toast.error(err);
    const body = { name: z.name.trim(), min_km: parseFloat(z.min_km), max_km: parseFloat(z.max_km), price: parseFloat(z.price) };
    const after = analyze([...zones.filter(o => o.id !== z.id), { ...body, id: z.id ?? '_new' }]);
    const newGaps = after.issues.filter(i => i.type === 'gap').length > issues.filter(i => i.type === 'gap').length;
    if (newGaps) {
      const ok = await confirm({ title: 'فجوة في المسافات', message: `سينتج عن هذا الحفظ فجوة:\n${after.issues.filter(i => i.type === 'gap').map(i => '• ' + i.text).join('\n')}\n\nالمسافات خارج المناطق تُسعَّر ${FALLBACK_FEE}₪ تلقائياً. متابعة؟`, confirmText: 'حفظ على أي حال', danger: false });
      if (!ok) return;
    }
    setSaving(true);
    try {
      if (z.id) await api.put(`/delivery-zones/${z.id}`, body);
      else await api.post('/delivery-zones', body);
      toast.success('تم الحفظ ✅');
      setEditing(null);
      fetchZones();
    } catch (e) { toast.error(e?.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const deleteZone = async (zone) => {
    const ok = await confirm({ title: 'حذف المنطقة', message: `حذف «${zone.name}» (${num(zone.min_km)}–${num(zone.max_km)} كم)؟ المسافات داخلها ستُسعَّر ${FALLBACK_FEE}₪ ما لم تغطّها منطقة أخرى.`, confirmText: 'حذف' });
    if (!ok) return;
    try { await api.delete(`/delivery-zones/${zone.id}`); toast.success('تم الحذف'); fetchZones(); }
    catch (e) { toast.error(e?.message || 'فشل الحذف'); }
  };

  const e = editing;
  const set = (k) => (ev) => setEditing(z => ({ ...z, [k]: ev.target.value }));

  return (
    <div className="page">
      <PageHeader icon={<FiMapPin />} title="مناطق التوصيل" subtitle={`التسعير حسب المسافة · ${zones.length} منطقة`}
        action={<PrimaryBtn onClick={() => setEditing({ ...EMPTY })}><FiPlus /> <span>منطقة<span className="hidden sm:inline"> جديدة</span></span></PrimaryBtn>} />

      {/* Visual km-bracket bar */}
      {sorted.length > 0 && (
        <section className="card p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3 mb-5">
            <div>
              <h2 className="panel-title">خريطة الشرائح</h2>
              <p className="text-[11.5px] text-ink-3 font-medium mt-0.5">من 0 حتى {scaleMax} كم · الفجوات تُسعَّر {FALLBACK_FEE}₪</p>
            </div>
            <span className={`text-[11px] font-extrabold rounded-full px-2.5 py-1 ${issues.length ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
              {issues.length ? `${issues.length} تنبيه` : '✓ تغطية متصلة'}
            </span>
          </div>
          <div dir="ltr">
            <div className="relative h-14 rounded-2xl bg-[repeating-linear-gradient(135deg,#FFF4E5_0_6px,#FFE7CC_6px_12px)] ring-1 ring-inset ring-amber-200/60 overflow-hidden">
              {sorted.map((z, i) => {
                const left = (num(z.min_km) / scaleMax) * 100;
                const width = ((Math.min(num(z.max_km), scaleMax) - num(z.min_km)) / scaleMax) * 100;
                return (
                  <button key={z.id} onClick={() => setEditing({ ...z })} title={`${z.name}: ${num(z.min_km)}–${num(z.max_km)} كم · ${num(z.price)}₪`}
                    className="absolute top-0 bottom-0 flex flex-col items-center justify-center text-white border-l-2 border-white/70 first:border-l-0 hover:brightness-110 grow-x origin-left"
                    style={{ left: `${left}%`, width: `${width}%`, background: ZONE_COLORS[i % ZONE_COLORS.length], animationDelay: `${i * 90}ms` }}>
                    {width > 7 && <span className="text-[13px] font-black num leading-none drop-shadow-sm">{num(z.price)}₪</span>}
                    {width > 12 && <span className="text-[9.5px] font-bold opacity-85 mt-1 truncate max-w-full px-1">{z.name}</span>}
                  </button>
                );
              })}
            </div>
            <div className="relative h-5 mt-1.5">
              {ticks.map(t => (
                <span key={t} className="absolute -translate-x-1/2 text-[10px] text-ink-3 font-bold num" style={{ left: `${(t / scaleMax) * 100}%` }}>
                  <span className="block w-px h-1.5 bg-ink-4 mx-auto mb-0.5" />{t}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[18px] p-4 bg-gradient-to-br from-sky-50 to-blue-50/60 border border-sky-100 flex gap-3">
          <span className="w-10 h-10 rounded-xl bg-white text-sky-600 flex items-center justify-center shadow-soft flex-shrink-0"><FiInfo /></span>
          <div>
            <p className="text-sm text-sky-900 font-black">كيف يعمل التسعير؟</p>
            <p className="text-xs text-sky-800/80 leading-relaxed font-medium mt-1">
              كل منطقة تغطي مدى مسافات (من ≤ المسافة &lt; حتى) بسعر توصيل ثابت. أنشئ ما تحتاجه من مناطق بدون تداخل، حتى {MAX_KM} كم.
              المسافات غير المغطّاة تُسعَّر <b>{FALLBACK_FEE}₪</b> تلقائياً.
            </p>
          </div>
        </div>

        {issues.length > 0 && (
          <div className="rounded-[18px] p-4 bg-amber-50 border border-amber-200 flex gap-3">
            <span className="w-10 h-10 rounded-xl bg-white text-amber-600 flex items-center justify-center shadow-soft flex-shrink-0"><FiAlertTriangle /></span>
            <div className="space-y-1">
              <p className="text-sm text-amber-900 font-black">تنبيهات على المناطق</p>
              {issues.map((i, k) => (
                <p key={k} className={`text-xs font-bold ${i.type === 'overlap' ? 'text-red-600' : 'text-amber-700'}`}>• {i.text}{i.type === 'gap' ? ` — تُسعَّر ${FALLBACK_FEE}₪` : ''}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && zones.length === 0 ? <ListSkeleton rows={4} grid />
        : zones.length === 0 ? <EmptyState icon={<FiMapPin />} title="لا توجد مناطق توصيل" hint={`كل الطلبات تُسعَّر حالياً ${FALLBACK_FEE}₪ — أضف مناطق حسب المسافة`}
            action={<PrimaryBtn onClick={() => setEditing({ ...EMPTY })}><FiPlus /> إضافة منطقة</PrimaryBtn>} />
        : (
          <div className="grid gap-3 lg:gap-4 sm:grid-cols-2 xl:grid-cols-3 stagger">
            {sorted.map((zone, i) => (
              <div key={zone.id} className="card card-hover p-4 relative overflow-hidden">
                <span className="absolute top-0 right-0 left-0 h-1" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-ink text-[15.5px] truncate">{zone.name}</p>
                    <p className="text-[12px] text-ink-3 mt-1 font-bold num flex items-center gap-1"><FiNavigation className="text-[11px]" />{num(zone.min_km)} — {num(zone.max_km)} كم</p>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <p className="text-[28px] leading-none font-black grad-text num">{num(zone.price)}<span className="text-lg">₪</span></p>
                    <p className="text-[10.5px] text-ink-3 font-bold mt-1">سعر التوصيل</p>
                  </div>
                </div>
                <div className="mt-4 bg-surface-sunken rounded-full h-2 overflow-hidden relative" dir="ltr">
                  <div className="absolute h-2 rounded-full grow-x origin-left"
                    style={{ left: `${(num(zone.min_km) / Math.max(maxCovered, 1)) * 100}%`, width: `${((num(zone.max_km) - num(zone.min_km)) / Math.max(maxCovered, 1)) * 100}%`, background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                </div>
                <div className="flex justify-between text-[10px] text-ink-3 mt-1 num font-bold" dir="ltr"><span>0 كم</span><span>{maxCovered} كم</span></div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={() => setEditing({ ...zone })} className="btn btn-sm btn-soft"><FiEdit2 /> تعديل</button>
                  <button onClick={() => deleteZone(zone)} className="btn btn-sm btn-danger"><FiTrash2 /> حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}

      <Modal open={!!e} onClose={() => setEditing(null)} title={e?.id ? 'تعديل المنطقة' : 'منطقة جديدة'} icon={<FiMapPin />}
        footer={<button onClick={save} disabled={saving} className="w-full btn-lux py-3 disabled:opacity-60">{saving ? 'جاري الحفظ…' : 'حفظ'}</button>}>
        {e && (
          <div className="space-y-3">
            {!e.id && (
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map((p, i) => (
                  <button key={i} type="button" onClick={() => setEditing(z => ({ ...z, ...p, price: z.price }))} className="chip">{p.name}</button>
                ))}
              </div>
            )}
            <Field label="اسم المنطقة *"><input className="inp" value={e.name} onChange={set('name')} /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="من (كم)"><input className="inp" type="number" min="0" max={MAX_KM} step="0.5" value={e.min_km} onChange={set('min_km')} /></Field>
              <Field label="حتى (كم)" error={parseFloat(e.max_km) > MAX_KM ? `الحد ${MAX_KM} كم` : null}><input className="inp" type="number" min="0" max={MAX_KM} step="0.5" value={e.max_km} onChange={set('max_km')} /></Field>
              <Field label="السعر ₪"><input className="inp" type="number" min="0" step="0.5" value={e.price} onChange={set('price')} /></Field>
            </div>
            {(() => { const err = e.name || e.min_km || e.max_km ? validateZone({ ...e, name: e.name || 'x', price: e.price === '' ? 0 : e.price }) : null; return err ? <p className="text-xs text-red-500 font-bold">⚠ {err}</p> : null; })()}
          </div>
        )}
      </Modal>
    </div>
  );
}
