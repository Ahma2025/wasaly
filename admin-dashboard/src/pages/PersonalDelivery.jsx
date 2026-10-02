import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function PersonalDelivery() {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCfg(); }, []);

  const fetchCfg = async () => {
    try {
      const r = await api.get('/admin/settings/personal-delivery');
      setEnabled(r.data?.enabled !== false);
    } catch { toast.error('فشل تحميل الإعدادات'); }
    finally { setLoading(false); }
  };

  const save = async (val) => {
    setSaving(true);
    try {
      await api.put('/admin/settings/personal-delivery', { enabled: val });
      setEnabled(val);
      toast.success(val ? 'تم تفعيل الخدمة ✅' : 'تم إيقاف الخدمة');
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="p-4 space-y-3" dir="rtl">{[...Array(3)].map((_, i) => (<div key={i} className="sk" style={{ height: 90, borderRadius: 18 }} />))}</div>;
  }

  return (
    <div className="p-4 space-y-4 animate-fade-up" dir="rtl">
      <h1 className="text-xl font-black text-gray-900">التوصيل الشخصي</h1>

      {/* تفعيل الخدمة */}
      <div className="bg-white rounded-2xl p-4 shadow-card flex items-center justify-between">
        <div className="flex-1">
          <p className="font-black text-gray-900">تفعيل الخدمة</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">لما تكون مفعّلة، يقدر الزبون يطلب توصيل شخصي (طرد أو راكب) من نقطة لنقطة، ويروح الطلب لأقرب سائق فاضي.</p>
        </div>
        <button disabled={saving} onClick={() => save(!enabled)}
          className={`w-14 h-8 rounded-full transition relative flex-shrink-0 ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ${enabled ? 'right-1' : 'right-7'}`} />
        </button>
      </div>

      {/* شرح التسعير */}
      <div className="bg-white rounded-2xl p-4 shadow-card space-y-3">
        <h2 className="font-black text-gray-900">💰 كيف يُحسب السعر؟</h2>
        <p className="text-sm text-gray-600 leading-relaxed">
          سعر التوصيل الشخصي يُحسب تلقائياً حسب <b>المسافة بين نقطة الاستلام والتسليم</b>، باستخدام نفس
          <b> مناطق التوصيل الجغرافية</b> المعتمدة للدليفري. يعني ما في داعي تحدّد سعر منفصل هون —
          عدّل الأسعار من صفحة مناطق التوصيل وتنطبق على التوصيل الشخصي كمان.
        </p>
        <button onClick={() => navigate('/zones')} className="btn-lux text-white px-5 py-2.5 rounded-xl text-sm">
          ⚙️ إدارة مناطق التوصيل والأسعار
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs text-blue-600 leading-relaxed">
          🛵 الطلب يوصل لأقرب سائق <b>فاضي</b> (أي وسيلة: دراجة أو سيارة). إذا قبِل يصير الطلب مسؤوليته؛
          وإذا رفض أو ما ردّ، يروح تلقائياً للسائق اللي بعده. الدفع كاش حالياً.
        </p>
      </div>
    </div>
  );
}
