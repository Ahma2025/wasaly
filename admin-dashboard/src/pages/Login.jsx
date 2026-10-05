import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiPhone, FiLock, FiArrowLeft, FiShield, FiActivity, FiTrendingUp, FiTruck } from 'react-icons/fi';
import api from '../utils/api';
import { TOKEN_KEY, clearSession } from '../utils/session';
import { normalizePhone } from '../utils/format';
import { PasswordInput, Spinner } from '../components/ui';

const LOGO = `${import.meta.env.BASE_URL}logo.png`;

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.phone.trim() || !form.password) return toast.error('أدخل رقم الهاتف وكلمة المرور');
    setLoading(true);
    try {
      const data = await api.post('/auth/login-password', { ...form, phone: normalizePhone(form.phone) });
      if (data.user?.role !== 'admin') return toast.error('غير مصرح — هذا الحساب ليس حساب مدير');
      clearSession();
      localStorage.setItem(TOKEN_KEY, data.token);
      onLogin(data.user);
    } catch (err) {
      toast.error(err?.status === 401 || err?.status === 400 ? (err.message || 'بيانات الدخول غير صحيحة') : (err?.message || 'تعذّر تسجيل الدخول'));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-surface" dir="rtl">
      {/* Brand panel — mesh gradient + floating glass cards */}
      <div className="relative flex-1 mesh-sunset noise overflow-hidden flex items-center justify-center px-5 lg:px-12"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 20px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
        <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-white/15 blur-3xl animate-drift" />
        <div className="absolute -bottom-40 -left-24 w-[32rem] h-[32rem] rounded-full bg-[#7A0030]/25 blur-3xl animate-drift" style={{ animationDelay: '-7s' }} />
        <svg className="absolute inset-0 w-full h-full opacity-[.10] pointer-events-none" aria-hidden="true">
          <defs><pattern id="lg" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#fff" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#lg)" />
        </svg>

        {/* Desktop storytelling */}
        <div className="hidden lg:block relative z-10 max-w-lg text-white">
          <div className="flex items-center gap-3 mb-10 animate-fade-up">
            <img src={LOGO} alt="" className="w-14 h-14 rounded-[18px] object-cover ring-2 ring-white/30 shadow-2xl" />
            <div>
              <p className="font-black text-3xl leading-none">وصلّي</p>
              <p className="text-white/75 text-sm font-bold mt-1">مركز العمليات</p>
            </div>
          </div>
          <h2 className="text-[44px] leading-[1.15] font-black animate-fade-up" style={{ animationDelay: '.08s' }}>
            كل طلب، كل سائق،<br />كل شيكل — في شاشة واحدة.
          </h2>
          <p className="text-white/80 text-lg mt-4 font-medium leading-relaxed animate-fade-up" style={{ animationDelay: '.16s' }}>
            راقب العمليات الحية، أدِر الشركاء، وتابع المحاسبة لحظة بلحظة.
          </p>
          <div className="relative h-56 mt-10">
            <div className="absolute right-0 top-0 glass rounded-[22px] p-4 w-60 animate-float shadow-2xl">
              <div className="flex items-center gap-2 text-white/80 text-xs font-bold"><FiTrendingUp /> الإيرادات</div>
              <p className="text-xl font-black mt-1">رسوم بيانية لحظية</p>
              <div className="flex items-end gap-1 h-8 mt-2">{[30, 45, 38, 60, 52, 75, 90].map((h, i) => <span key={i} className="flex-1 rounded-t bg-white/70 grow-y" style={{ height: `${h}%`, animationDelay: `${.3 + i * .06}s` }} />)}</div>
            </div>
            <div className="absolute left-4 top-16 glass rounded-[22px] p-4 w-52 animate-float shadow-2xl" style={{ animationDelay: '-2s' }}>
              <div className="flex items-center gap-2 text-white/80 text-xs font-bold"><FiActivity /> العمليات الحية</div>
              <p className="text-xl font-black mt-1">خريطة الطلبات</p>
              <p className="text-[11px] text-white/70 font-bold flex items-center gap-1.5 mt-1"><span className="live-dot" /> مباشر الآن</p>
            </div>
            <div className="absolute right-24 bottom-0 glass rounded-full px-4 py-2.5 flex items-center gap-2 animate-float shadow-xl" style={{ animationDelay: '-4s' }}>
              <span className="w-8 h-8 rounded-full bg-white text-brand-600 flex items-center justify-center"><FiTruck /></span>
              <span className="text-sm font-extrabold">تتبّع السائقين</span>
            </div>
          </div>
        </div>

        {/* Mobile: form floats on the gradient */}
        <div className="lg:hidden relative z-10 w-full max-w-sm">
          <LoginCard form={form} setForm={setForm} loading={loading} submit={submit} />
        </div>
      </div>

      {/* Desktop form column */}
      <div className="hidden lg:flex w-[480px] xl:w-[540px] items-center justify-center p-10 bg-white relative">
        <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />
        <div className="relative w-full max-w-sm">
          <LoginCard form={form} setForm={setForm} loading={loading} submit={submit} flat />
        </div>
      </div>
    </div>
  );
}

function LoginCard({ form, setForm, loading, submit, flat }) {
  return (
    <div className={`${flat ? '' : 'bg-white/95 backdrop-blur-xl rounded-[30px] p-7 shadow-[0_30px_80px_rgba(80,10,30,.35)] ring-1 ring-white/60'} animate-pop`}>
      <div className={`text-center ${flat ? 'text-right' : ''} mb-7`}>
        <div className={`relative w-20 h-20 ${flat ? 'hidden' : 'mx-auto'} mb-4`}>
          <div className="absolute inset-0 rounded-[26px] grad-sunset blur-lg opacity-50" />
          <img src={LOGO} alt="وصلّي" className="relative w-20 h-20 rounded-[26px] object-cover shadow-brand" />
        </div>
        {flat && <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 text-brand-700 px-3 py-1 text-[11px] font-extrabold mb-4 ring-1 ring-orange-100"><FiShield /> دخول آمن للمدراء</span>}
        <h1 className={`font-black ${flat ? 'text-3xl text-ink' : 'text-[28px] grad-text'}`}>{flat ? 'مرحباً بعودتك 👋' : 'وصلّي'}</h1>
        <p className="text-ink-3 text-sm mt-1.5 font-medium">{flat ? 'سجّل الدخول لمتابعة لوحة التحكم' : 'لوحة تحكم المدير'}</p>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="lg-phone" className="lbl">رقم الهاتف</label>
          <div className="relative">
            <FiPhone className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
            <input id="lg-phone" type="tel" inputMode="tel" autoComplete="username" className="inp pr-10 h-[52px]" placeholder="05XXXXXXXX" dir="ltr" style={{ textAlign: 'right' }}
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div>
          <label htmlFor="lg-pass" className="lbl flex items-center gap-1"><FiLock className="text-[11px]" /> كلمة المرور</label>
          <PasswordInput id="lg-pass" className="h-[52px]" autoComplete="current-password" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full h-[54px] text-base group">
          {loading ? <><Spinner light /> جاري الدخول…</> : <>دخول <FiArrowLeft className="transition-transform group-hover:-translate-x-1" /></>}
        </button>
      </form>
      <p className="text-center text-[11px] text-ink-4 font-medium mt-6">© وصلّي · لوحة الإدارة الداخلية</p>
    </div>
  );
}
