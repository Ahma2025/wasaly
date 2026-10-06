import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiSend, FiBell, FiCheck } from 'react-icons/fi';
import api from '../utils/api';
import { fmtDate } from '../utils/format';
import { arCount } from '../utils/plural';
import { PageHeader, Field, Button, Segmented, SectionHeader, useConfirm } from '../components/ui';

const LOGO = `${import.meta.env.BASE_URL}logo.png`;
const ROLES = { customer: 'الزبائن', driver: 'السائقين', restaurant: 'المتاجر (أصحاب المطاعم)' };
const ROLE_ICON = { customer: '🛍️', driver: '🛵', restaurant: '🏪' };
const templates = [
  // بلا كود كوبون ثابت قد لا يكون موجوداً — أضف الكود الفعّال من «الكوبونات» بنفسك — A-37
  { title: 'عروض خاصة 🔥', body: 'لا تفوّت عروض المتاجر اليوم في وصلّي! افتح التطبيق واكتشف الخصومات المتاحة' },
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
      toast.success('بدأ إرسال الإشعار');
    } catch (e) { toast.error(e?.message || 'خطأ في الإرسال'); }
    finally { setSending(false); }
  };

  return (
    <div className="page">
      <PageHeader icon={<FiBell />} title="الإشعارات" subtitle="إرسال إشعار فوري للمستخدمين" />

      <div className="grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-4">
          <section className="card p-4 sm:p-5 space-y-4">
            <Field label="الجمهور المستهدف" as="group">
              <Segmented full value={form.target} onChange={v => setForm(f => ({ ...f, target: v }))} options={[['all', 'الجميع'], ['role', 'حسب الدور']]} />
            </Field>
            {form.target === 'role' && (
              <div className="grid grid-cols-3 gap-2 animate-fade-up">
                {Object.entries(ROLES).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setForm(f => ({ ...f, role: k }))} aria-pressed={form.role === k}
                    className={`rounded-2xl p-3 text-center border-[1.5px] ${form.role === k ? 'border-brand-400 bg-orange-50 text-brand-700 shadow-soft' : 'border-surface-line text-ink-2 hover:border-[#DDE0EA]'}`}>
                    <span className="text-xl block">{ROLE_ICON[k]}</span>
                    <span className="text-[11.5px] font-extrabold leading-tight block mt-1">{l}</span>
                  </button>
                ))}
              </div>
            )}
            <Field label="العنوان" hint={`(${form.title.length}/80)`}><input className="inp" maxLength={80} placeholder="عنوان الإشعار" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="المحتوى" hint={`(${form.body.length}/240)`}>
              <textarea className="inp resize-none" rows={4} maxLength={240} placeholder="نص الإشعار…" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
              <div className="h-1 rounded-full bg-surface-sunken mt-2 overflow-hidden"><div className={`h-full rounded-full transition-all duration-300 ${form.body.length > 200 ? 'bg-amber-400' : 'grad-sunset'}`} style={{ width: `${(form.body.length / 240) * 100}%` }} /></div>
            </Field>
            <Button size="lg" className="w-full" loading={sending} icon={<FiSend className="-scale-x-100" />} onClick={send}>
              {sending ? 'جاري الإرسال…' : `إرسال إلى ${form.target === 'all' ? 'الجميع' : ROLES[form.role]}`}
            </Button>
            {sent && (
              <div className="p-3.5 bg-green-50 rounded-2xl border border-green-200 flex gap-3 animate-pop">
                <span className="w-9 h-9 rounded-xl bg-green-500 text-white flex items-center justify-center flex-shrink-0"><FiCheck /></span>
                <div>
                  <p className="text-green-800 font-black text-sm">بدأ الإرسال</p>
                  <p className="text-green-700 text-xs font-medium mt-0.5">
                    {sent.recipients > 0
                      ? <>جارٍ الإرسال إلى <b className="num">{arCount(sent.recipients, 'user')}</b> ({sent.audience}) — فقط من فعّل الإشعارات. قد يستغرق التسليم دقائق.</>
                      : <>لا يوجد مستخدمون فعّلوا الإشعارات ضمن {sent.audience}.</>}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <SectionHeader title="قوالب جاهزة" hint="اضغط قالباً لتعبئة الحقول" />
            <div className="grid gap-2 sm:grid-cols-3 mt-3">
              {templates.map((t, i) => (
                <button key={i} onClick={() => setForm(f => ({ ...f, title: t.title, body: t.body }))}
                  className="text-right p-3.5 rounded-2xl border border-surface-line hover:border-orange-300 hover:bg-orange-50/50 hover:shadow-soft">
                  <p className="font-extrabold text-sm text-ink">{t.title}</p>
                  <p className="text-ink-3 text-xs mt-1 line-clamp-2 leading-relaxed">{t.body}</p>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Live phone preview */}
        <aside className="lg:sticky lg:top-[92px]">
          <p className="text-xs font-extrabold text-ink-3 mb-2 text-center">معاينة مباشرة</p>
          <div className="mx-auto w-[280px] rounded-[44px] p-[10px] bg-[#111118] shadow-[0_30px_60px_rgba(20,20,43,.28)] ring-1 ring-black/40">
            <div className="relative h-[500px] rounded-[36px] overflow-hidden mesh-sunset">
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/0 to-black/40" />
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-6 rounded-full bg-black" />
              <div className="relative text-white text-center pt-14">
                <p className="text-[13px] font-bold opacity-90">{fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p className="text-[64px] font-black leading-none mt-1 num" dir="ltr">{(() => { const d = new Date(); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; })()}</p>
              </div>
              <div className="relative mx-3 mt-8 rounded-[20px] bg-white/80 backdrop-blur-xl p-3 flex items-start gap-2.5 shadow-lg animate-pop">
                <img src={LOGO} alt="" className="w-9 h-9 rounded-[10px] object-cover shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-ink-2">وصلّي</p>
                    <p className="text-[10px] text-ink-3">الآن</p>
                  </div>
                  <p className="font-extrabold text-[13px] text-ink truncate">{form.title || 'عنوان الإشعار'}</p>
                  <p className="text-ink-2 text-[12px] mt-0.5 break-words line-clamp-4 leading-snug">{form.body || 'محتوى الإشعار سيظهر هنا…'}</p>
                </div>
              </div>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-28 h-1 rounded-full bg-white/80" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
