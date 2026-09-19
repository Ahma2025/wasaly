import React, { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post('/auth/login-password', { ...form, phone: normalizePhone(form.phone) });
      if (data.user?.role !== 'admin') return toast.error('غير مصرح - هذا الحساب ليس حساب مدير');
      localStorage.setItem('admin_token', data.token);
      onLogin(data.user);
    } catch { toast.error('بيانات خاطئة'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grad-sunset flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-card animate-fade-up relative z-10" dir="rtl">
        <div className="text-center mb-8">
          <div className="text-4xl w-20 h-20 mx-auto mb-4 rounded-3xl grad-brand flex items-center justify-center shadow-brand">🚀</div>
          <h1 className="text-3xl font-black grad-text">وصلّي</h1>
          <p className="text-gray-500 text-sm mt-1">لوحة تحكم المدير</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-600 mb-1 block">رقم الهاتف</label>
            <input type="tel" className="border-[1.5px] border-gray-200 bg-gray-50 rounded-xl px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white" placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-600 mb-1 block">كلمة المرور</label>
            <input type="password" className="border-[1.5px] border-gray-200 bg-gray-50 rounded-xl px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>
          <button type="submit" disabled={loading} className="w-full grad-brand text-white py-3.5 rounded-xl font-bold shadow-brand hover:-translate-y-0.5 disabled:opacity-50">
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
