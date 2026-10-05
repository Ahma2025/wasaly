import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiPhone, FiLock, FiEye, FiEyeOff, FiChevronLeft } from 'react-icons/fi';
import { MdStorefront } from 'react-icons/md';
import api from '../utils/api';
import { clearSession } from '../utils/auth';
import { LOGO_URL } from '../utils/config';
import { Spinner } from '../components/ui';

const RESTAURANT_ROLES = ['restaurant', 'restaurant_owner'];

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
    <div className="min-h-screen grad-sunset flex items-center justify-center p-4 relative overflow-hidden" dir="rtl"
      style={{ paddingTop: 'calc(var(--sat) + 16px)', paddingBottom: 'calc(var(--sab) + 16px)' }}>
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
      <div className="bg-white rounded-[28px] shadow-card p-7 w-full max-w-md animate-fade-up relative z-10">
        <div className="text-center mb-7">
          <img src={LOGO_URL} alt="وصلّي" className="w-20 h-20 mx-auto mb-4 rounded-3xl shadow-brand object-cover" />
          <h1 className="text-2xl font-black text-gray-900">بوابة المطعم</h1>
          <p className="text-gray-500 mt-1 text-sm">وصلّي — إدارة طلباتك ومنيوك بسهولة</p>
        </div>

        {choices ? (
          <div className="space-y-2 animate-fade-up">
            <p className="text-sm font-bold text-gray-700 mb-2">اختر المطعم الذي تريد إدارته:</p>
            {choices.map(r => (
              <button key={r.id} onClick={() => finish(r)}
                className="w-full flex items-center gap-3 border border-gray-200 hover:border-brand-300 hover:bg-brand-50 rounded-2xl p-3 text-right">
                <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {r.logo ? <img src={r.logo} alt="" className="w-full h-full object-cover" /> : <MdStorefront size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 truncate">{r.name_ar}</p>
                  {r.address && <p className="text-xs text-gray-400 truncate">{r.address}</p>}
                </div>
                <FiChevronLeft className="text-gray-400" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="phone" className="label">رقم الهاتف</label>
              <div className="relative">
                <FiPhone className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                <input id="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" className="input pr-10 text-right py-3"
                  placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="label">كلمة المرور</label>
              <div className="relative">
                <FiLock className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
                <input id="password" type={showPass ? 'text' : 'password'} autoComplete="current-password" className="input pr-10 pl-10 py-3"
                  placeholder="••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
                <button type="button" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600">
                  {showPass ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base mt-2">
              {loading ? <><Spinner size={16} /> جاري الدخول…</> : 'دخول'}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">يتم إنشاء حسابات المطاعم عبر إدارة وصلّي</p>
          </form>
        )}
      </div>
    </div>
  );
}
