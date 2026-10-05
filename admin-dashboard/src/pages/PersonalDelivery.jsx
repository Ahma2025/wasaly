import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { FiSend, FiPause, FiWifiOff, FiDollarSign, FiSettings, FiTruck } from 'react-icons/fi';
import { PageHeader, Button, useConfirm } from '../components/ui';
import { Sk } from '../components/Skeleton';

export default function PersonalDelivery() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  // null = لم نعرف الحالة بعد → الزر معطّل حتى التحميل
  const [enabled, setEnabled] = useState(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchCfg = async () => {
    setError(false);
    try {
      const r = await api.get('/admin/settings/personal-delivery');
      setEnabled(r.data?.enabled === true);
    } catch { setError(true); }
  };
  useEffect(() => { fetchCfg(); }, []);

  const toggle = async () => {
    if (enabled === null || saving) return;
    const val = !enabled;
    if (!val) {
      const ok = await confirm({ title: 'إيقاف التوصيل الشخصي', message: 'لن يتمكّن الزبائن من طلب توصيل شخصي جديد حتى تعيد التفعيل.', confirmText: 'إيقاف' });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const r = await api.put('/admin/settings/personal-delivery', { enabled: val });
      setEnabled(r?.data?.enabled ?? val);
      toast.success(val ? 'تم تفعيل الخدمة ✅' : 'تم إيقاف الخدمة');
    } catch (e) { toast.error(e?.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const loaded = enabled !== null;

  return (
    <div className="page">
      <PageHeader icon={<FiSend />} title="التوصيل الشخصي" subtitle="طرد أو راكب من نقطة إلى نقطة" />

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-5">
        {/* Service status hero */}
        <section className={`lg:col-span-3 relative overflow-hidden rounded-[28px] p-5 sm:p-7 transition-colors duration-500 ${enabled ? 'mesh-sunset text-white shadow-brand' : 'bg-white border border-surface-line shadow-card text-ink'}`}>
          {enabled && <div className="absolute -left-16 -bottom-20 w-64 h-64 rounded-full bg-white/10" />}
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${!loaded ? 'bg-surface-sunken text-ink-3' : enabled ? 'glass text-white' : 'bg-surface-sunken text-ink-2'}`}>
                {!loaded ? (error ? 'غير معروف' : 'جاري التحميل…') : enabled ? <><span className="live-dot !bg-white" /> الخدمة مفعّلة</> : <><FiPause /> الخدمة متوقفة</>}
              </span>
              <h2 className="text-2xl sm:text-[28px] font-black mt-3 leading-tight">تفعيل التوصيل الشخصي</h2>
              <p className={`text-sm mt-2 leading-relaxed max-w-md ${enabled ? 'text-white/85' : 'text-ink-2'}`}>عند التفعيل يستطيع الزبون طلب توصيل شخصي، ويُرسل الطلب لأقرب سائق متاح.</p>
              {error && (
                <p className="text-xs text-red-500 font-bold mt-3 flex items-center gap-2"><FiWifiOff /> تعذّر تحميل الحالة — <button onClick={fetchCfg} className="underline">إعادة المحاولة</button></p>
              )}
            </div>
            <div className="flex-shrink-0 pt-1">
              {loaded ? (
                <button disabled={saving} onClick={toggle} aria-pressed={enabled} aria-label="تفعيل الخدمة"
                  className={`switch !w-[68px] !h-[40px] disabled:opacity-60 ${enabled ? '!bg-white/25 ring-2 ring-white/50' : ''}`}>
                  <span className="!w-[32px] !h-[32px] !top-1 !right-1" style={{ transform: enabled ? 'none' : 'translateX(-28px)' }} />
                </button>
              ) : (
                error ? <span className="block w-[68px] h-10 rounded-full bg-gray-100" /> : <Sk w={68} h={40} r={999} />
              )}
            </div>
          </div>
          <div className="relative grid grid-cols-2 gap-3 mt-6">
            {[['📦', 'توصيل طرد', 'من باب لباب'], ['🚗', 'توصيل راكب', 'أقرب سائق متاح']].map(([e, t, s]) => (
              <div key={t} className={`rounded-2xl p-3.5 ${enabled ? 'glass' : 'bg-surface'}`}>
                <span className="text-2xl">{e}</span>
                <p className="font-extrabold text-sm mt-1.5">{t}</p>
                <p className={`text-[11px] font-medium ${enabled ? 'text-white/75' : 'text-ink-3'}`}>{s}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="lg:col-span-2 space-y-4">
          <section className="card p-5 space-y-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-brand-600 flex items-center justify-center text-xl"><FiDollarSign /></div>
            <h2 className="panel-title">كيف يُحسب السعر؟</h2>
            <p className="text-sm text-ink-2 leading-relaxed">
              يُحسب السعر تلقائياً حسب <b>المسافة بين نقطة الاستلام والتسليم</b> باستخدام نفس
              <b> مناطق التوصيل</b> المعتمدة للطلبات العادية. عدّل الأسعار من صفحة المناطق وتنطبق هنا أيضاً.
            </p>
            <Button className="w-full" icon={<FiSettings />} onClick={() => navigate('/zones')}>إدارة مناطق التوصيل والأسعار</Button>
          </section>

          <div className="rounded-[18px] p-4 bg-gradient-to-br from-sky-50 to-blue-50/60 border border-sky-100 flex gap-3">
            <span className="w-9 h-9 rounded-xl bg-white text-sky-600 flex items-center justify-center shadow-soft flex-shrink-0"><FiTruck /></span>
            <p className="text-xs text-sky-900/80 leading-relaxed font-medium">
              يُرسل الطلب لأقرب سائق <b>متاح</b> (أي وسيلة). إن رفض أو لم يردّ يُحوَّل تلقائياً للسائق التالي. الدفع نقداً حالياً.
              تظهر الطلبات الشخصية في «العمليات» و«الطلبات» بعلامة 📦.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
