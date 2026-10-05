import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPhone, FiLock, FiEye, FiEyeOff, FiChevronLeft, FiBell, FiPrinter, FiBarChart2, FiArrowRight } from 'react-icons/fi';
import { MdStorefront } from 'react-icons/md';
import api from '../utils/api';
import { clearSession } from '../utils/auth';
import { LOGO_URL } from '../utils/config';
import { Spinner } from '../components/ui';

const RESTAURANT_ROLES = ['restaurant', 'restaurant_owner'];

const FEATURES = [
  { icon: FiBell, title: 'تنبيه فوري لكل طلب', text: 'صوت وإشعار لحظة وصول الطلب' },
  { icon: FiPrinter, title: 'طباعة تلقائية', text: 'اربط ماكنة الطلبات مرة واحدة' },
  { icon: FiBarChart2, title: 'أرقامك بوضوح', text: 'مبيعات يومية وأكثر الأصناف طلبًا' },
];

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [choices, setChoices] = useState(null); // أكثر من مطعم لنفس الحساب

  const normalizePhone = (p) => p
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[\s-]/g, '');

  const finish = (restaurant) => {
    localStorage.setItem('restaurant', JSON.stringify(restaurant));
    navigate('/', { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post('/auth/login-password', { ...form, phone: normalizePhone(form.phone) });
      const role = data.user?.role;
      if (role === 'admin') {
        toast.error('حساب الإدارة يستخدم لوحة الإدارة وليس بوابة المطعم');
        return;
      }
      if (!RESTAURANT_ROLES.includes(role)) {
        toast.error('هذا الحساب ليس حساب مطعم');
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      let list = [];
      try {
        const rData = await api.get('/restaurants', { params: { owner_id: data.user.id, limit: 50 } });
        list = Array.isArray(rData?.data) ? rData.data : [];
      } catch {
        clearSession();
        toast.error('تعذّر تحميل بيانات المطعم — حاول مرة أخرى');
        return;
      }
      if (!list.length) {
        clearSession();
        toast.error('لا يوجد مطعم مفعّل مرتبط بهذا الحساب — تواصل مع إدارة وصلّي', { duration: 6000 });
        return;
      }
      if (list.length > 1) { setChoices(list); return; }
      finish(list[0]);
    } catch (err) {
      toast.error(err.status === 401 || err.status === 400 ? (err.message || 'رقم الهاتف أو كلمة المرور غير صحيحة') : (err.message || 'تعذّر تسجيل الدخول'));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[1.05fr_1fr]" dir="rtl">
      {/* ─── لوحة الهوية (أعلى الشاشة على الجوال، نصف الشاشة على الكمبيوتر) ─── */}
      <section className="relative overflow-hidden grad-mesh text-white lg:min-h-screen lg:order-2 flex flex-col"
        style={{ paddingTop: 'calc(var(--sat) + 28px)' }}>
        <div className="absolute inset-0 dot-grid opacity-40" aria-hidden />
        <div className="absolute -top-24 -right-20 w-80 h-80 rounded-full bg-white/15 blur-3xl animate-blob" aria-hidden />
        <div className="absolute -bottom-28 -left-16 w-96 h-96 rounded-full bg-[#F53B57]/40 blur-3xl animate-blob" style={{ animationDelay: '-6s' }} aria-hidden />

        <div className="relative px-6 pb-16 lg:pb-0 lg:px-14 lg:flex-1 lg:flex lg:flex-col lg:justify-center text-center lg:text-right">
          <div className="inline-flex lg:flex items-center gap-3 animate-pop">
            <img src={LOGO_URL} alt="وصلّي" className="w-[72px] h-[72px] lg:w-16 lg:h-16 rounded-[22px] object-cover shadow-[0_18px_40px_rgba(0,0,0,.2)] ring-4 ring-white/25 animate-floaty"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
          </div>
          <h1 className="mt-5 text-[30px] lg:text-[44px] font-black leading-[1.15]">
            مطبخك. طلباتك.
            <br /><span className="text-white/90">في مكان واحد.</span>
          </h1>
          <p className="mt-3 text-white/85 text-[15px] lg:text-lg max-w-md mx-auto lg:mx-0 leading-relaxed">بوابة مطاعم وصلّي — استقبل الطلبات، أدِر منيوك، وتابع مبيعاتك لحظة بلحظة.</p>

          <ul className="hidden lg:grid gap-3 mt-10 max-w-md stagger">
            {FEATURES.map(f => (
              <li key={f.title} className="glass rounded-[18px] p-4 flex items-center gap-3.5">
                <span className="w-11 h-11 rounded-[14px] bg-white text-brand-600 flex items-center justify-center flex-shrink-0 shadow-soft"><f.icon size={20} aria-hidden /></span>
                <span>
                  <span className="block font-extrabold">{f.title}</span>
                  <span className="block text-[13px] text-white/80 mt-0.5">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden lg:block relative px-14 pb-8 text-[12px] text-white/70">© وصلّي — توصيل أسرع، مطاعم أسعد</p>
      </section>

      {/* ─── نموذج الدخول ─── */}
      <section className="relative -mt-8 lg:mt-0 lg:order-1 flex items-start lg:items-center justify-center px-4 lg:px-10"
        style={{ paddingBottom: 'calc(var(--sab) + 24px)' }}>
        <div className="w-full max-w-[420px] bg-white rounded-[28px] shadow-card border border-surface-line/80 p-6 sm:p-8 animate-fade-up lg:shadow-none lg:border-0 lg:bg-transparent lg:p-0">
          {choices ? (
            <div className="animate-fade-up">
              <button onClick={() => setChoices(null)} className="text-[13px] font-bold text-ink-3 hover:text-ink flex items-center gap-1 mb-4"><FiArrowRight aria-hidden /> رجوع</button>
              <h2 className="text-2xl font-extrabold text-ink">اختر المطعم</h2>
              <p className="text-sm text-ink-3 mt-1 mb-5">حسابك مرتبط بأكثر من مطعم — أيّها تريد إدارته الآن؟</p>
              <div className="space-y-2.5 stagger">
                {choices.map(r => (
                  <button key={r.id} onClick={() => finish(r)}
                    className="w-full flex items-center gap-3 bg-white border-[1.5px] border-surface-line hover:border-brand-300 hover:shadow-card rounded-[18px] p-3 text-right">
                    <div className="w-12 h-12 rounded-[14px] bg-brand-50 text-brand-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {r.logo ? <img src={r.logo} alt="" className="w-full h-full object-cover" /> : <MdStorefront size={22} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-ink truncate">{r.name_ar}</p>
                      {r.address && <p className="text-xs text-ink-3 truncate mt-0.5">{r.address}</p>}
                    </div>
                    <FiChevronLeft className="text-ink-3" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <p className="eyebrow text-brand-600">بوابة المطعم</p>
              <h2 className="text-[26px] font-black text-ink mt-1">أهلًا بعودتك 👋</h2>
              <p className="text-ink-3 mt-1 text-sm">سجّل الدخول لإدارة طلباتك ومنيوك</p>

              <form onSubmit={submit} className="space-y-4 mt-7">
                <div>
                  <label htmlFor="phone" className="label">رقم الهاتف</label>
                  <div className="relative">
                    <FiPhone className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
                    <input id="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className="input h-[52px] pr-11 text-right text-base tnum"
                      placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="label">كلمة المرور</label>
                  <div className="relative">
                    <FiLock className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
                    <input id="password" type={showPass ? 'text' : 'password'} autoComplete="current-password" className="input h-[52px] ps-11 pe-12 text-base"
                      placeholder="••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                    <button type="button" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute end-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl flex items-center justify-center text-ink-3 hover:text-ink hover:bg-surface">
                      {showPass ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full h-[54px] text-base rounded-2xl mt-2">
                  {loading ? <><Spinner size={18} /> جاري الدخول…</> : <>دخول <FiChevronLeft aria-hidden /></>}
                </button>
              </form>
              <div className="flex items-center gap-3 my-6"><span className="h-px flex-1 bg-surface-line" /><span className="text-[11px] font-bold text-ink-3">مطعم جديد؟</span><span className="h-px flex-1 bg-surface-line" /></div>
              <p className="text-center text-[13px] text-ink-2">يتم إنشاء حسابات المطاعم عبر إدارة وصلّي</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
