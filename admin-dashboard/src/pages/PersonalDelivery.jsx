import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { PageHeader, useConfirm } from '../components/ui';
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
    <div className="p-4 space-y-4 animate-fade-up">
      <PageHeader icon="📦" title="التوصيل الشخصي" subtitle="طرد أو راكب من نقطة إلى نقطة" />

      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="font-black text-gray-900 flex items-center gap-2">
            تفعيل الخدمة
            {loaded && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{enabled ? 'مفعّلة' : 'متوقفة'}</span>}
          </p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">عند التفعيل يستطيع الزبون طلب توصيل شخصي، ويُرسل الطلب لأقرب سائق متاح.</p>
          {error && (
            <p className="text-xs text-red-500 font-bold mt-2">تعذّر تحميل الحالة — <button onClick={fetchCfg} className="underline">إعادة المحاولة</button></p>
          )}
        </div>
        {loaded ? (
          <button disabled={saving} onClick={toggle} aria-pressed={enabled} aria-label="تفعيل الخدمة"
            className={`w-14 h-8 rounded-full transition relative flex-shrink-0 disabled:opacity-60 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${enabled ? 'right-1' : 'right-7'}`} />
          </button>
        ) : (
          error ? <span className="w-14 h-8 rounded-full bg-gray-100 flex-shrink-0" /> : <Sk w={56} h={32} r={999} />
        )}
      </div>

      <div className="card p-4 space-y-3">
        <h2 className="font-black text-gray-900">💰 كيف يُحسب السعر؟</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          يُحسب السعر تلقائياً حسب <b>المسافة بين نقطة الاستلام والتسليم</b> باستخدام نفس
          <b> مناطق التوصيل</b> المعتمدة للطلبات العادية. عدّل الأسعار من صفحة المناطق وتنطبق هنا أيضاً.
        </p>
        <button onClick={() => navigate('/zones')} className="btn-lux px-5 py-2.5 text-sm">⚙️ إدارة مناطق التوصيل والأسعار</button>
      </div>

      <div className="rounded-2xl p-4 bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-100">
        <p className="text-xs text-sky-700 leading-relaxed font-semibold">
          🛵 يُرسل الطلب لأقرب سائق <b>متاح</b> (أي وسيلة). إن رفض أو لم يردّ يُحوَّل تلقائياً للسائق التالي. الدفع نقداً حالياً.
          تظهر الطلبات الشخصية في «العمليات» و«الطلبات» بعلامة 📦.
        </p>
      </div>
    </div>
  );
}
