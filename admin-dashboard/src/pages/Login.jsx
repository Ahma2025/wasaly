import React, { useEffect, useId, useRef, useState } from 'react';
import {
  FiPhone, FiLock, FiArrowLeft, FiShield, FiActivity, FiTrendingUp, FiTruck, FiEye, FiEyeOff,
  FiAlertCircle, FiWifiOff, FiRefreshCw, FiCheck,
} from 'react-icons/fi';
import api from '../utils/api';
import { TOKEN_KEY, clearSession } from '../utils/session';
import { normalizePhone } from '../utils/format';
import { Spinner, useReducedMotion, useMediaQuery } from '../components/ui';

const LOGO = `${import.meta.env.BASE_URL}logo.png`;

/* ---------- Phone helpers: يعرض 05X XXX XXXX ويرسل الأرقام فقط ---------- */
const phoneDigits = (raw) => {
  const s = normalizePhone(raw).replace(/[^\d+]/g, '');
  const plus = s.startsWith('+');
  const d = s.replace(/\+/g, '');
  return plus ? `+${d.slice(0, 15)}` : d.slice(0, d.startsWith('0') ? 10 : 15);
};
const formatPhone = (raw) => {
  const d = phoneDigits(raw);
  if (!d.startsWith('0')) return d; // دولي/غير محلي: بدون قالب
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
};
const phoneError = (display) => {
  const d = phoneDigits(display).replace('+', '');
  if (!d) return 'أدخل رقم الهاتف';
  if (d.length < 9) return 'رقم الهاتف غير مكتمل';
  return '';
};

export default function Login({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});           // أخطاء الحقول
  const [banner, setBanner] = useState(null);         // { kind: 'auth'|'role'|'network', msg }
  const [status, setStatus] = useState('idle');       // idle | loading | success
  const [shake, setShake] = useState(0);
  const busy = useRef(false);
  const reduce = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const phoneRef = useRef(null);
  const passRef = useRef(null);

  useEffect(() => { try { window.__hideSplash?.(); } catch { /* ignore */ } }, []);

  const fail = (b) => { setBanner(b); setShake(s => s + 1); };

  const submit = async (e) => {
    e?.preventDefault();
    if (busy.current) return;                          // منع الإرسال المزدوج
    const pe = phoneError(phone);
    const we = password ? '' : 'أدخل كلمة المرور';
    setErrors({ phone: pe, password: we });
    if (pe || we) {
      setBanner(null); setShake(s => s + 1);
      (pe ? phoneRef : passRef).current?.focus();
      return;
    }
    busy.current = true;
    setBanner(null);
    setStatus('loading');
    let ok = false;
    try {
      const data = await api.post('/auth/login-password', { phone: normalizePhone(phoneDigits(phone)), password });
      if (data.user?.role !== 'admin') {
        fail({ kind: 'role', msg: 'غير مصرح — هذا الحساب ليس حساب مدير' });
        return;
      }
      clearSession();
      localStorage.setItem(TOKEN_KEY, data.token);
      ok = true;
      setStatus('success');
      setTimeout(() => onLogin(data.user), reduce ? 0 : 650);
    } catch (err) {
      if (err?.status === 401 || err?.status === 400) {
        fail({ kind: 'auth', msg: err.message || 'بيانات الدخول غير صحيحة' });
        setTimeout(() => { passRef.current?.focus(); passRef.current?.select?.(); }, 30);
      } else if (!err?.status) {
        fail({ kind: 'network', msg: err?.message || 'تعذّر الاتصال بالخادم' });
      } else {
        fail({ kind: 'auth', msg: err?.message || 'تعذّر تسجيل الدخول' });
      }
    } finally {
      if (!ok) { busy.current = false; setStatus('idle'); }
    }
  };

  const card = {
    phone, password, errors, banner, status, shake, phoneRef, passRef, submit,
    onPhone: (v) => { setPhone(formatPhone(v)); if (errors.phone) setErrors(x => ({ ...x, phone: '' })); if (banner) setBanner(null); },
    onPassword: (v) => { setPassword(v); if (errors.password) setErrors(x => ({ ...x, password: '' })); if (banner?.kind === 'auth') setBanner(null); },
    onBlurPhone: () => { if (phone) setErrors(x => ({ ...x, phone: phoneError(phone) })); },
  };

  return (
    <div className="min-h-[100dvh] flex bg-surface" dir="rtl">
      {/* Brand panel — mesh gradient + floating glass cards */}
      <div className="relative flex-1 mesh-sunset noise overflow-hidden flex items-center justify-center px-4 sm:px-6 lg:px-12"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}>
        <div className="absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-white/15 blur-3xl animate-drift pointer-events-none" />
        <div className="absolute -bottom-40 -left-24 w-[32rem] h-[32rem] rounded-full bg-[#7A0030]/25 blur-3xl animate-drift pointer-events-none" style={{ animationDelay: '-7s' }} />
        <svg className="absolute inset-0 w-full h-full opacity-[.10] pointer-events-none" aria-hidden="true">
          <defs><pattern id="lg" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#fff" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#lg)" />
        </svg>

        {/* Desktop storytelling */}
        <div className="hidden lg:block relative z-10 max-w-lg text-white">
          <div className="flex items-center gap-3 mb-10 animate-fade-up">
            <img src={LOGO} alt="" width="56" height="56" className="w-14 h-14 rounded-[18px] object-cover ring-2 ring-white/30 shadow-2xl" />
            <div>
              <p className="font-black text-3xl leading-none">وصلّي</p>
              <p className="text-white/75 text-sm font-bold mt-1">مركز العمليات</p>
            </div>
          </div>
          <h2 className="text-[44px] leading-[1.15] font-black animate-fade-up [text-wrap:balance]" style={{ animationDelay: '.08s' }}>
            كل طلب، كل سائق،<br />كل شيكل — في شاشة واحدة.
          </h2>
          <p className="text-white/80 text-lg mt-4 font-medium leading-relaxed animate-fade-up" style={{ animationDelay: '.16s' }}>
            راقب العمليات الحية، أدِر الشركاء، وتابع المحاسبة لحظة بلحظة.
          </p>
          <div className="relative h-56 mt-10" aria-hidden="true">
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

        {/* Mobile: glass hero card floating on the gradient */}
        {!isDesktop && (
          <div className="relative z-10 w-full max-w-[400px]">
            <LoginCard {...card} />
          </div>
        )}
      </div>

      {/* Desktop form column */}
      <div className="hidden lg:flex w-[480px] xl:w-[540px] items-center justify-center p-10 bg-white relative">
        <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />
        <div className="relative w-full max-w-sm">
          {isDesktop && <LoginCard {...card} flat />}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   Card
   ===================================================================== */
function LoginCard({ flat, phone, password, errors, banner, status, shake, phoneRef, passRef, submit, onPhone, onPassword, onBlurPhone }) {
  const loading = status === 'loading';
  const success = status === 'success';
  const uid = useId();
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const capsCheck = (e) => { try { setCaps(!!e.getModifierState?.('CapsLock')); } catch { /* ignore */ } };

  return (
    <div
      className={`${flat ? '' : 'bg-white/[.94] backdrop-blur-xl rounded-[28px] p-6 sm:p-7 shadow-[0_30px_80px_rgba(80,10,30,.35)] ring-1 ring-white/60'} ${shake ? '' : 'animate-pop'}`}
      style={shake ? { animation: `${shake % 2 ? 'loginShakeA' : 'loginShakeB'} .42s cubic-bezier(.36,.07,.19,.97) both` } : undefined}
    >
      <div className={`${flat ? 'text-right' : 'text-center'} mb-6`}>
        {!flat && (
          <div className="relative w-[72px] h-[72px] mx-auto mb-4">
            <div className="absolute inset-0 rounded-[24px] grad-sunset blur-lg opacity-50" />
            <img src={LOGO} alt="وصلّي" width="72" height="72" className="relative w-[72px] h-[72px] rounded-[24px] object-cover shadow-brand" />
          </div>
        )}
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-orange-50 text-brand-700 px-3 py-1 text-[11px] font-extrabold ring-1 ring-orange-100 ${flat ? 'mb-4' : 'mb-3'}`}>
          <FiShield aria-hidden="true" /> دخول آمن للمدراء
        </span>
        <h1 className={`font-black text-ink leading-tight ${flat ? 'text-3xl' : 'text-[26px]'}`}>مرحباً بعودتك</h1>
        <p className="text-ink-3 text-sm mt-1.5 font-medium">سجّل الدخول لمتابعة لوحة التحكم</p>
      </div>

      {banner && (
        <div role="alert" aria-live="assertive"
          className={`mb-4 rounded-2xl px-3.5 py-3 flex items-start gap-2.5 text-[13px] font-bold animate-fade-up ${banner.kind === 'network' ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-red-50 text-red-700 ring-1 ring-red-100'}`}>
          {banner.kind === 'network' ? <FiWifiOff className="mt-0.5 flex-shrink-0" aria-hidden="true" /> : <FiAlertCircle className="mt-0.5 flex-shrink-0" aria-hidden="true" />}
          <div className="flex-1 min-w-0 leading-relaxed">
            {banner.msg}
            {banner.kind === 'network' && <p className="text-[11.5px] font-medium text-amber-700/90 mt-0.5">بياناتك محفوظة — تحقق من الإنترنت ثم أعد المحاولة.</p>}
          </div>
          {banner.kind === 'network' && (
            <button type="button" onClick={submit} disabled={loading}
              className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl bg-white px-2.5 py-1.5 text-[12px] font-extrabold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100/60">
              <FiRefreshCw aria-hidden="true" /> إعادة
            </button>
          )}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3.5" noValidate aria-busy={loading || undefined}>
        <FloatField
          id={`${uid}-phone`} label="رقم الهاتف" icon={<FiPhone />} error={errors.phone}
          inputRef={phoneRef}
          inputProps={{
            name: 'username', type: 'tel', inputMode: 'tel', autoComplete: 'username tel', dir: 'ltr',
            enterKeyHint: 'next', maxLength: 16, value: phone, disabled: loading || success,
            onChange: (e) => onPhone(e.target.value), onBlur: onBlurPhone,
          }}
          hint={!errors.phone ? '05X XXX XXXX' : null}
        />
        <FloatField
          id={`${uid}-pass`} label="كلمة المرور" icon={<FiLock />} error={errors.password}
          inputRef={passRef}
          inputProps={{
            name: 'password', type: showPw ? 'text' : 'password', autoComplete: 'current-password', dir: 'ltr',
            enterKeyHint: 'go', value: password, disabled: loading || success, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
            onChange: (e) => onPassword(e.target.value), onKeyUp: capsCheck, onKeyDown: capsCheck, onBlur: () => setCaps(false),
          }}
          hint={caps && !errors.password ? 'تنبيه: زر الأحرف الكبيرة (Caps Lock) مفعّل' : null}
          trailing={
            <button type="button" onClick={() => setShowPw(s => !s)} aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={showPw}
              className="w-10 h-10 rounded-xl text-ink-3 hover:text-ink hover:bg-surface-sunken flex items-center justify-center">
              {showPw ? <FiEyeOff /> : <FiEye />}
            </button>
          }
        />

        <button type="submit" disabled={loading || success} aria-live="polite"
          className={`btn btn-primary btn-lg w-full h-[54px] text-base group !mt-5 ${success ? 'login-success !opacity-100' : ''}`}>
          {success ? (
            <><span className="login-check" aria-hidden="true"><FiCheck /></span> تم الدخول</>
          ) : loading ? (
            <><Spinner light /> جاري الدخول…</>
          ) : (
            <>دخول <FiArrowLeft className="transition-transform group-hover:-translate-x-1" aria-hidden="true" /></>
          )}
        </button>
      </form>

      <p className="text-center text-[11px] text-ink-4 font-medium mt-6">© وصلّي · لوحة الإدارة الداخلية</p>
    </div>
  );
}

/* ---------- Floating-label 52px field ---------- */
function FloatField({ id, label, icon, error, hint, trailing, inputProps, inputRef }) {
  const descId = error || hint ? `${id}-desc` : undefined;
  return (
    <div>
      <div className={`ff ${error ? 'ff-err' : ''} ${trailing ? 'ff-trail' : ''}`}>
        <input id={id} ref={inputRef} placeholder=" " aria-invalid={!!error || undefined} aria-describedby={descId} className="ff-inp peer" {...inputProps} />
        <label htmlFor={id} className="ff-lbl">{label}</label>
        <span className="ff-ico" aria-hidden="true">{icon}</span>
        {trailing && <span className="ff-trailing">{trailing}</span>}
      </div>
      {error ? (
        <p id={descId} role="alert" className="flex items-center gap-1 text-[12px] text-bad font-bold mt-1.5 pr-1 animate-fade-up">
          <FiAlertCircle className="text-[12px]" aria-hidden="true" />{error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-[11.5px] text-ink-3 font-medium mt-1.5 pr-1" dir="rtl">{hint}</p>
      ) : null}
    </div>
  );
}
