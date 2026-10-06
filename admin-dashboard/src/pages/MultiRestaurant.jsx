import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { FiLayers, FiPause, FiWifiOff, FiSave, FiRotateCcw, FiTruck, FiDollarSign, FiMapPin, FiShoppingBag, FiInfo } from 'react-icons/fi';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Button, Field, useConfirm } from '../components/ui';
import { Sk } from '../components/Skeleton';
import { money, TERMS } from '../utils/format';
import { arCount } from '../utils/plural';
import { useOverlay } from '../utils/backStack';

/** قواعد التحقق — مطابقة لعقد PUT /api/admin/settings/multi-restaurant */
const RULES = {
  max_restaurants: (v) => (Number.isInteger(v) && v >= 2 && v <= 10 ? null : 'أقصى عدد مطاعم يجب أن يكون عدداً صحيحاً بين 2 و 10'),
  max_distance_km: (v) => (Number.isFinite(v) && v >= 0.1 && v <= 50 ? null : 'أقصى مسافة بين المطاعم يجب أن تكون بين 0.1 و 50 كم'),
  extra_stop_fee: (v) => (Number.isFinite(v) && v >= 0 && v <= 100 ? null : 'رسوم المحطة الإضافية يجب أن تكون بين 0 و 100 ₪'),
};
const toForm = (d) => ({
  max_restaurants: d?.max_restaurants != null ? String(d.max_restaurants) : '',
  max_distance_km: d?.max_distance_km != null ? String(d.max_distance_km) : '',
  extra_stop_fee: d?.extra_stop_fee != null ? String(d.extra_stop_fee) : '',
});
const parse = (s) => (String(s).trim() === '' ? NaN : Number(String(s).replace(',', '.')));

export default function MultiRestaurant() {
  const confirm = useConfirm();
  const [cfg, setCfg] = useState(null);       // آخر إعدادات محفوظة من الخادم
  const [form, setForm] = useState(toForm(null));
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState({});

  const load = async () => {
    setError(false);
    try {
      const r = await api.get('/admin/settings/multi-restaurant');
      const d = r?.data || {};
      setCfg(d); setForm(toForm(d)); setTouched({});
    } catch { setError(true); }
  };
  useEffect(() => { load(); }, []);

  const loaded = cfg !== null;
  const enabled = cfg?.enabled === true;

  const values = useMemo(() => ({
    max_restaurants: parse(form.max_restaurants),
    max_distance_km: parse(form.max_distance_km),
    extra_stop_fee: parse(form.extra_stop_fee),
  }), [form]);
  const errors = useMemo(() => Object.fromEntries(Object.entries(RULES).map(([k, fn]) => [k, fn(values[k])])), [values]);
  const hasErrors = Object.values(errors).some(Boolean);
  const dirty = loaded && Object.keys(RULES).some(k => Number(cfg?.[k]) !== values[k]);

  // زر الرجوع (أندرويد) مع تعديلات غير محفوظة: نسأل قبل المغادرة بدل ضياعها — X-04
  const navigate = useNavigate();
  useOverlay(dirty && !saving, async () => {
    const ok = await confirm({ title: 'تعديلات غير محفوظة', message: 'غيّرت إعدادات الطلبات المجمّعة ولم تحفظها. المغادرة بدون حفظ؟', confirmText: 'مغادرة بدون حفظ', cancelText: 'البقاء' });
    if (ok) { setForm(toForm(cfg)); setTouched({}); if (!(window.__wasalyNav && window.__wasalyNav())) navigate('/'); }
  });

  const toggle = async () => {
    if (!loaded || toggling) return;
    const val = !enabled;
    if (!val) {
      const ok = await confirm({ title: 'إيقاف الطلبات المجمّعة', message: 'لن يتمكّن الزبائن من الطلب من أكثر من مطعم في طلب واحد حتى تعيد التفعيل. الطلبات الجارية تكمل بشكل طبيعي.', confirmText: 'إيقاف' });
      if (!ok) return;
    }
    setToggling(true);
    try {
      const r = await api.put('/admin/settings/multi-restaurant', { enabled: val });
      const d = r?.data || { ...cfg, enabled: val };
      setCfg(c => ({ ...c, ...d }));
      toast.success(val ? 'تم تفعيل الطلبات المجمّعة ✅' : 'تم إيقاف الطلبات المجمّعة');
    } catch (e) { toast.error(e?.message || 'فشل الحفظ'); }
    finally { setToggling(false); }
  };

  const save = async () => {
    setTouched({ max_restaurants: true, max_distance_km: true, extra_stop_fee: true });
    if (hasErrors) { toast.error(Object.values(errors).find(Boolean)); return; }
    setSaving(true);
    try {
      const r = await api.put('/admin/settings/multi-restaurant', values);
      const d = r?.data || { ...cfg, ...values };
      setCfg(d); setForm(toForm(d)); setTouched({});
      toast.success('تم حفظ إعدادات الطلبات المجمّعة ✅');
    } catch (e) { toast.error(e?.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setTouched(t => ({ ...t, [k]: true })); };
  const err = (k) => (touched[k] ? errors[k] : null);

  // مثال حيّ: رسوم مجمّع من الحد الأقصى من المطاعم
  const exStops = !errors.max_restaurants ? values.max_restaurants : (Number(cfg?.max_restaurants) || 3);
  const exFee = !errors.extra_stop_fee ? values.extra_stop_fee : (Number(cfg?.extra_stop_fee) || 0);

  return (
    <div className="page">
      <PageHeader icon={<FiLayers />} title="الطلبات المجمّعة" subtitle="طلب واحد من عدة مطاعم — سائق واحد يجمعها" />

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          {/* Service status hero */}
          <section className={`relative overflow-hidden rounded-[28px] p-5 sm:p-7 transition-colors duration-500 ${enabled ? 'mesh-sunset text-white shadow-brand' : 'bg-white border border-surface-line shadow-card text-ink'}`}>
            {enabled && <div className="absolute -left-16 -bottom-20 w-64 h-64 rounded-full bg-white/10" />}
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${!loaded ? 'bg-surface-sunken text-ink-3' : enabled ? 'glass text-white' : 'bg-surface-sunken text-ink-2'}`}>
                  {!loaded ? (error ? 'غير معروف' : 'جاري التحميل…') : enabled ? <><span className="live-dot !bg-white" /> مفعّلة</> : <><FiPause /> متوقفة</>}
                </span>
                <h2 className="text-2xl sm:text-[28px] font-black mt-3 leading-tight">تفعيل الطلبات المجمّعة</h2>
                <p className={`text-sm mt-2 leading-relaxed max-w-md ${enabled ? 'text-white/85' : 'text-ink-2'}`}>
                  يستطيع الزبون الطلب من عدة مطاعم قريبة في سلة واحدة، ويجمعها سائق واحد ثم يوصلها. الدفع {TERMS.cash} (مع {TERMS.wallet}).
                </p>
                {error && (
                  <p className="text-xs text-red-500 font-bold mt-3 flex items-center gap-2"><FiWifiOff /> تعذّر تحميل الإعدادات — <button onClick={load} className="underline">إعادة المحاولة</button></p>
                )}
              </div>
              <div className="flex-shrink-0 pt-1">
                {loaded ? (
                  <button disabled={toggling} onClick={toggle} aria-pressed={enabled} aria-label="تفعيل الطلبات المجمّعة"
                    className={`switch !w-[68px] !h-[40px] disabled:opacity-60 ${enabled ? '!bg-white/25 ring-2 ring-white/50' : ''}`}>
                    <span className="!w-[32px] !h-[32px] !top-1 !right-1" style={{ transform: enabled ? 'none' : 'translateX(-28px)' }} />
                  </button>
                ) : (
                  error ? <span className="block w-[68px] h-10 rounded-full bg-gray-100" /> : <Sk w={68} h={40} r={999} />
                )}
              </div>
            </div>
          </section>

          {/* Limits & fees form */}
          <section className="card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="panel-title">الحدود والرسوم</h2>
                <p className="text-[11.5px] text-ink-3 font-medium mt-0.5">تنطبق على الطلبات المجمّعة الجديدة فقط — الطلبات الحالية تحتفظ برسومها.</p>
              </div>
            </div>
            {!loaded && !error ? (
              <div className="space-y-4"><Sk h={70} r={14} /><Sk h={70} r={14} /><Sk h={70} r={14} /></div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
                <Field label="أقصى عدد مطاعم في الطلب الواحد" hint="(2 – 10)" error={err('max_restaurants')}>
                  <div className="relative">
                    <FiShoppingBag className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                    <input className="inp pr-10 num" type="number" inputMode="numeric" min={2} max={10} step={1} value={form.max_restaurants} onChange={set('max_restaurants')} disabled={!loaded} aria-invalid={!!err('max_restaurants')} />
                  </div>
                </Field>
                <Field label="أقصى مسافة بين أي مطعمين" hint="(كم · 0.1 – 50)" error={err('max_distance_km')}>
                  <div className="relative">
                    <FiMapPin className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                    <input className="inp pr-10 pl-12 num" type="number" inputMode="decimal" min={0.1} max={50} step={0.1} value={form.max_distance_km} onChange={set('max_distance_km')} disabled={!loaded} aria-invalid={!!err('max_distance_km')} />
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-3">كم</span>
                  </div>
                </Field>
                <Field label={TERMS.extraStopFee} hint="(₪ لكل مطعم بعد الأول · 0 – 100)" error={err('extra_stop_fee')}>
                  <div className="relative">
                    <FiDollarSign className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                    <input className="inp pr-10 pl-12 num" type="number" inputMode="decimal" min={0} max={100} step={0.5} value={form.extra_stop_fee} onChange={set('extra_stop_fee')} disabled={!loaded} aria-invalid={!!err('extra_stop_fee')} />
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-3">₪</span>
                  </div>
                </Field>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" className="flex-1" loading={saving} disabled={!loaded || !dirty || hasErrors} icon={<FiSave />}>حفظ التغييرات</Button>
                  {dirty && <Button type="button" variant="secondary" icon={<FiRotateCcw />} onClick={() => { setForm(toForm(cfg)); setTouched({}); }}>تراجع</Button>}
                </div>
              </form>
            )}
          </section>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <section className="card p-5 space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center text-xl"><FiDollarSign /></div>
            <h2 className="panel-title">كيف تُحسب الرسوم؟</h2>
            <ul className="text-sm text-ink-2 leading-relaxed space-y-1.5 list-disc pr-4">
              <li><b>رسوم التوصيل الأساسية</b> حسب مسافة <b>أبعد مطعم</b> عن الزبون (من مناطق التوصيل).</li>
              <li><b>رسوم المطاعم الإضافية</b> = {TERMS.extraStopFee} × (عدد المطاعم − 1).</li>
              <li>التوصيل المجاني يُلغي الرسوم الأساسية فقط، لا رسوم المطاعم الإضافية.</li>
              <li>الكوبون وخصم الطلب الأول يُطبَّقان <b>مرة واحدة</b> على مجموع السلة.</li>
              {/* الأجرة لا تشمل الإكرامية — A-49 */}
              <li><b>أجرة السائق</b> = الرسوم الأساسية + رسوم المطاعم الإضافية دائماً (حتى مع التوصيل المجاني).</li>
              <li><b>ربح السائق</b> = الأجرة + {TERMS.tip} (الإكرامية كاملة للسائق).</li>
            </ul>
            <div className="rounded-2xl bg-surface p-3.5">
              <p className="text-[11px] font-extrabold text-ink-3 mb-1">مثال: طلب من {arCount(exStops, 'restaurant')}</p>
              <p className="text-sm font-bold text-ink">رسوم إضافية = <span className="num">{money(exFee)}</span> × <span className="num">{Math.max(0, exStops - 1)}</span> = <span className="num text-violet-700 font-black">{money(exFee * Math.max(0, exStops - 1))}</span></p>
            </div>
          </section>

          <div className="rounded-[18px] p-4 bg-gradient-to-br from-violet-50 to-indigo-50/60 border border-violet-100 flex gap-3">
            <span className="w-9 h-9 rounded-xl bg-white text-violet-600 flex items-center justify-center shadow-soft flex-shrink-0"><FiTruck /></span>
            <p className="text-xs text-violet-950/80 leading-relaxed font-medium">
              يُعرض الطلب على السائقين فقط بعد قبول <b>كل</b> المطاعم. إن اعتذر مطعم يُعاد حساب الطلب ويكمل من الباقي تلقائياً.
              تظهر الطلبات المجمّعة في «الطلبات» و«العمليات» بشارة <b>مجمّع</b>.
            </p>
          </div>
          <div className="rounded-[18px] p-4 bg-amber-50/70 border border-amber-100 flex gap-3">
            <span className="w-9 h-9 rounded-xl bg-white text-amber-600 flex items-center justify-center shadow-soft flex-shrink-0"><FiInfo /></span>
            <p className="text-xs text-amber-900/80 leading-relaxed font-medium">
              تُعرض الطلبات المجمّعة فقط على السائقين بنسخة تطبيق تدعمها (شارة «يدعم المجمّعة» في صفحة السائقين). إن لم يتوفر سائق منهم يبقى الطلب «نبحث عن سائق» — انشر تحديث تطبيق السائق قبل التفعيل.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
