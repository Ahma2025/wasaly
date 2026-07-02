import React, { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Notifications() {
  const [form, setForm] = useState({ title: '', body: '', target: 'all', role: 'customer' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const send = async () => {
    if (!form.title || !form.body) return toast.error('أدخل العنوان والمحتوى');
    setSending(true);
    try {
      const data = await api.post('/admin/notifications/broadcast', form);
      setSent({ recipients: data.recipients });
      toast.success('تم الإرسال');
    } catch { toast.error('خطأ في الإرسال'); }
    finally { setSending(false); }
  };

  const templates = [
    { title: 'خصم خاص 🔥', body: 'لا تفوّت عروضنا الحصرية اليوم! استخدم كود WASALY للحصول على خصم 10%' },
    { title: 'تحديث جديد 🚀', body: 'وصلّي تتطور! جرّب الميزات الجديدة المذهلة في آخر تحديث' },
    { title: 'مطاعم جديدة 🏪', body: 'أضفنا مطاعم جديدة رائعة في منطقتك! اكتشفها الآن' },
  ];

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <h1 className="text-xl font-bold text-gray-900">إرسال إشعارات</h1>

      <div className="grid grid-cols-1 gap-4">
        {/* Compose */}
        <div className="bg-white rounded-2xl border p-6 shadow-sm">
          <h2 className="font-bold text-lg mb-4">إنشاء إشعار</h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">الجمهور المستهدف</label>
              <select className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                <option value="all">الجميع</option>
                <option value="role">حسب الدور</option>
              </select>
            </div>

            {form.target === 'role' && (
              <div>
                <label className="text-sm text-gray-500 mb-1 block">الدور</label>
                <select className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="customer">الزبائن</option>
                  <option value="driver">المناديب</option>
                  <option value="restaurant">المطاعم</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-sm text-gray-500 mb-1 block">العنوان</label>
              <input className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="عنوان الإشعار" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>

            <div>
              <label className="text-sm text-gray-500 mb-1 block">المحتوى</label>
              <textarea className="border rounded-xl px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" rows={4} placeholder="نص الإشعار..." value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
            </div>

            <button onClick={send} disabled={sending} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 transition">
              {sending ? 'جاري الإرسال...' : 'إرسال الإشعار 📤'}
            </button>
          </div>

          {sent && (
            <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200">
              <p className="text-green-700 font-bold">تم الإرسال بنجاح!</p>
              <p className="text-green-600 text-sm">تم إرسال الإشعار لـ {sent.recipients} مستخدم</p>
            </div>
          )}
        </div>

        {/* Templates & Preview */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <h2 className="font-bold text-lg mb-4">قوالب جاهزة</h2>
            <div className="space-y-3">
              {templates.map((t, i) => (
                <button key={i} onClick={() => setForm(f => ({ ...f, title: t.title, body: t.body }))} className="w-full text-right p-3 rounded-xl border hover:border-orange-400 hover:bg-orange-50 transition">
                  <p className="font-bold text-sm">{t.title}</p>
                  <p className="text-gray-500 text-xs mt-1 truncate">{t.body}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Phone Preview */}
          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <h2 className="font-bold text-lg mb-4">معاينة</h2>
            <div className="bg-gray-900 rounded-2xl p-4 text-white">
              <div className="bg-gray-800 rounded-xl p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-sm font-bold shrink-0">و</div>
                <div>
                  <p className="font-bold text-sm">{form.title || 'عنوان الإشعار'}</p>
                  <p className="text-gray-400 text-xs mt-1">{form.body || 'محتوى الإشعار سيظهر هنا...'}</p>
                  <p className="text-gray-600 text-xs mt-2">الآن</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
