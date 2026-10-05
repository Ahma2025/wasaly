import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSend } from 'react-icons/fi';
import api from '../utils/api';
import { PageHeader, Field, useConfirm } from '../components/ui';

const LOGO = `${import.meta.env.BASE_URL}logo.png`;
const ROLES = { customer: 'الزبائن', driver: 'السائقين', restaurant: 'المتاجر (أصحاب المطاعم)' };
const templates = [
  { title: 'خصم خاص 🔥', body: 'لا تفوّت عروضنا الحصرية اليوم! استخدم كود WASALY للحصول على خصم 10%' },
  { title: 'تحديث جديد ✨', body: 'وصلّي تتطور! جرّب الميزات الجديدة في آخر تحديث' },
  { title: 'متاجر جديدة 🏪', body: 'أضفنا متاجر جديدة رائعة في منطقتك! اكتشفها الآن' },
];

export default function Notifications() {
  const confirm = useConfirm();
  const [form, setForm] = useState({ title: '', body: '', target: 'all', role: 'customer' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast.error('أدخل العنوان والمحتوى');
    const audience = form.target === 'all' ? 'جميع المستخدمين' : ROLES[form.role];
    const ok = await confirm({
      title: 'إرسال إشعار جماعي',
      message: `سيصل الإشعار «${form.title.trim()}» إلى ${audience}.\nلا يمكن التراجع بعد الإرسال.`,
      confirmText: 'إرسال الآن',
      danger: form.target === 'all',
      icon: <FiSend />,
    });
    if (!ok) return;
    setSending(true);
    try {
      const data = await api.post('/admin/notifications/broadcast', { ...form, title: form.title.trim(), body: form.body.trim() });
      setSent({ recipients: data.recipients ?? data.data?.recipients ?? 0, audience });
      toast.success('تم الإرسال');
    } catch (e) { toast.error(e?.message || 'خطأ في الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4 p-4 animate-fade-up">
      <PageHeader icon="🔔" title="الإشعارات" subtitle="إرسال إشعار فوري للمستخدمين" />

      <div className="card p-4 space-y-3">
        <Field label="الجمهور المستهدف">
          <div className="grid grid-cols-2 gap-2">
            {[['all', 'الجميع'], ['role', 'حسب الدور']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setForm(f => ({ ...f, target: k }))}
                className={`py-2.5 rounded-xl text-xs font-bold ${form.target === k ? 'chip-on' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>{l}</button>
            ))}
          </div>
        </Field>
        {form.target === 'role' && (
          <Field label="الدور">
            <select className="inp" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        )}
        <Field label="العنوان"><input className="inp" maxLength={80} placeholder="عنوان الإشعار" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="المحتوى" hint={`(${form.body.length}/240)`}>
          <textarea className="inp resize-none" rows={4} maxLength={240} placeholder="نص الإشعار…" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
        </Field>
        <button onClick={send} disabled={sending} className="w-full btn-lux py-3 disabled:opacity-60 flex items-center justify-center gap-2">
          <FiSend className="-scale-x-100" /> {sending ? 'جاري الإرسال…' : 'إرسال الإشعار'}
        </button>
        {sent && (
          <div className="p-3 bg-green-50 rounded-2xl border border-green-200">
            <p className="text-green-700 font-black text-sm">تم الإرسال بنجاح ✅</p>
            <p className="text-green-600 text-xs font-semibold">وصل إلى {sent.recipients} جهاز ({sent.audience}) — فقط من فعّل الإشعارات.</p>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="font-black text-gray-900 mb-3">قوالب جاهزة</h2>
        <div className="space-y-2">
          {templates.map((t, i) => (
            <button key={i} onClick={() => setForm(f => ({ ...f, title: t.title, body: t.body }))}
              className="w-full text-right p-3 rounded-2xl border border-gray-100 hover:border-orange-300 hover:bg-orange-50/50">
              <p className="font-bold text-sm text-gray-900">{t.title}</p>
              <p className="text-gray-500 text-xs mt-1 truncate">{t.body}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-black text-gray-900 mb-3">معاينة</h2>
        <div className="bg-gradient-to-br from-gray-800 to-gray-950 rounded-3xl p-4">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-3 flex items-start gap-3">
            <img src={LOGO} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" />
            <div className="min-w-0">
              <p className="font-bold text-sm text-white">{form.title || 'عنوان الإشعار'}</p>
              <p className="text-gray-300 text-xs mt-1 break-words">{form.body || 'محتوى الإشعار سيظهر هنا…'}</p>
              <p className="text-gray-500 text-[10px] mt-2">وصلّي · الآن</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
