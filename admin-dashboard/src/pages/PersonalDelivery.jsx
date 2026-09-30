import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const DEFAULTS = {
  enabled: true,
  bike: { base: 3, perKm: 2 },
  car: { base: 5, perKm: 3 },
  parcelSize: { small: 0, medium: 3, large: 5 },
  minFare: 3,
};

export default function PersonalDelivery() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCfg(); }, []);

  const fetchCfg = async () => {
    try {
      const r = await api.get('/admin/settings/personal-delivery');
      const val = r.data || {};
      setCfg({ ...DEFAULTS, ...val, bike: { ...DEFAULTS.bike, ...val.bike }, car: { ...DEFAULTS.car, ...val.car }, parcelSize: { ...DEFAULTS.parcelSize, ...val.parcelSize } });
    } catch { setCfg(DEFAULTS); toast.error('فشل تحميل الإعدادات'); }
    finally { setLoading(false); }
  };

  const num = (v) => (v === '' || v == null ? 0 : parseFloat(v));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled: !!cfg.enabled,
        bike: { base: num(cfg.bike.base), perKm: num(cfg.bike.perKm) },
        car: { base: num(cfg.car.base), perKm: num(cfg.car.perKm) },
        parcelSize: { small: num(cfg.parcelSize.small), medium: num(cfg.parcelSize.medium), large: num(cfg.parcelSize.large) },
        minFare: num(cfg.minFare),
      };
      await api.put('/admin/settings/personal-delivery', payload);
      toast.success('تم حفظ الإعدادات ✅');
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  // مثال حساب سعر (٤ كم)
  const example = (v) => cfg ? (num(cfg[v].base) + num(cfg[v].perKm) * 4).toFixed(1) : '—';

  if (loading || !cfg) {
    return <div className="p-4 space-y-3" dir="rtl">{[...Array(4)].map((_, i) => (<div key={i} className="sk" style={{ height: 90, borderRadius: 18 }} />))}</div>;
  }

  const Field = ({ label, value, onChange, suffix }) => (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="relative">
        <input type="number" min="0" step="0.5" value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 rounded-xl p-3 text-sm font-bold text-gray-800 focus:border-orange-400" />
        {suffix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900">التوصيل الشخصي (راكب / طرد)</h1>
        <button onClick={save} disabled={saving}
          className="btn-lux text-white px-5 py-2.5 rounded-xl text-sm disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : '💾 حفظ'}
        </button>
      </div>

      {/* تشغيل الخدمة */}
      <div className="bg-white rounded-2xl p-4 shadow-card flex items-center justify-between">
        <div>
          <p className="font-bold text-gray-900">تفعيل الخدمة</p>
          <p className="text-xs text-gray-500 mt-0.5">لما تكون مطفأة، الزبون ما بيقدر يطلب توصيل شخصي</p>
        </div>
        <button onClick={() => setCfg(c => ({ ...c, enabled: !c.enabled }))}
          className={`w-14 h-8 rounded-full transition relative ${cfg.enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${cfg.enabled ? 'right-1' : 'right-7'}`} />
        </button>
      </div>

      {/* تسعير الدراجة */}
      <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">🛵 تسعير الدراجة</h2>
          <span className="text-xs text-gray-400">مثال (٤ كم): <b className="text-orange-500">{example('bike')}₪</b></span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سعر أساسي" suffix="₪" value={cfg.bike.base} onChange={v => setCfg(c => ({ ...c, bike: { ...c.bike, base: v } }))} />
          <Field label="سعر لكل كم" suffix="₪/كم" value={cfg.bike.perKm} onChange={v => setCfg(c => ({ ...c, bike: { ...c.bike, perKm: v } }))} />
        </div>
      </div>

      {/* تسعير السيارة */}
      <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-gray-900">🚗 تسعير السيارة</h2>
          <span className="text-xs text-gray-400">مثال (٤ كم): <b className="text-orange-500">{example('car')}₪</b></span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سعر أساسي" suffix="₪" value={cfg.car.base} onChange={v => setCfg(c => ({ ...c, car: { ...c.car, base: v } }))} />
          <Field label="سعر لكل كم" suffix="₪/كم" value={cfg.car.perKm} onChange={v => setCfg(c => ({ ...c, car: { ...c.car, perKm: v } }))} />
        </div>
      </div>

      {/* رسوم حجم الطرد */}
      <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
        <h2 className="font-bold text-gray-900">📦 رسوم إضافية حسب حجم الطرد</h2>
        <div className="grid grid-cols-3 gap-3">
          <Field label="صغير" suffix="₪" value={cfg.parcelSize.small} onChange={v => setCfg(c => ({ ...c, parcelSize: { ...c.parcelSize, small: v } }))} />
          <Field label="وسط" suffix="₪" value={cfg.parcelSize.medium} onChange={v => setCfg(c => ({ ...c, parcelSize: { ...c.parcelSize, medium: v } }))} />
          <Field label="كبير" suffix="₪" value={cfg.parcelSize.large} onChange={v => setCfg(c => ({ ...c, parcelSize: { ...c.parcelSize, large: v } }))} />
        </div>
      </div>

      {/* حد أدنى */}
      <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
        <h2 className="font-bold text-gray-900">الحد الأدنى للسعر</h2>
        <Field label="أقل سعر ممكن للطلب" suffix="₪" value={cfg.minFare} onChange={v => setCfg(c => ({ ...c, minFare: v }))} />
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs text-blue-600 leading-relaxed">
          💡 السعر = <b>السعر الأساسي + (سعر الكم × المسافة)</b> + رسوم حجم الطرد (للطرود). لو النتيجة أقل من الحد الأدنى، يُطبّق الحد الأدنى. الدفع كاش حالياً.
        </p>
      </div>
    </div>
  );
}
