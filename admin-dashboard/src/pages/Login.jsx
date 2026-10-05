import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { TOKEN_KEY, clearSession } from '../utils/session';
import { normalizePhone } from '../utils/format';
import { PasswordInput } from '../components/ui';

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
    <div className="min-h-screen grad-sunset flex items-center justify-center p-4 relative overflow-hidden" dir="rtl"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
      <div className="bg-white rounded-[28px] p-8 w-full max-w-sm shadow-card animate-fade-up relative z-10">
        <div className="text-center mb-8">
          <img src={LOGO} alt="وصلّي" className="w-20 h-20 mx-auto mb-4 rounded-3xl object-cover shadow-brand" />
          <h1 className="text-3xl font-black grad-text">وصلّي</h1>
          <p className="text-gray-500 text-sm mt-1 font-semibold">لوحة تحكم المدير</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="lbl">رقم الهاتف</label>
            <input type="tel" inputMode="tel" autoComplete="username" className="inp py-3" placeholder="05XXXXXXXX" dir="ltr" style={{ textAlign: 'right' }}
              value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="lbl">كلمة المرور</label>
            <PasswordInput autoComplete="current-password" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <button type="submit" disabled={loading} className="w-full btn-lux py-3.5 disabled:opacity-60">
            {loading ? 'جاري الدخول…' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
