import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [form, setForm] = useState({ phone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async e => {
    e.preventDefault();
    if (!form.phone || !form.password) { toast.error('أدخل رقم الهاتف وكلمة المرور'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/login-password', { ...form, role: 'customer' });
      login(res.data?.user || res.user, res.data?.token || res.token);
      toast.success('مرحباً بك!');
      nav('/');
    } catch (err) {
      toast.error(err?.message || 'خطأ في تسجيل الدخول');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🛵</div>
          <h1 className="text-2xl font-black text-gray-900">وصَلّي</h1>
          <p className="text-gray-500 mt-1 text-sm">توصيل أكلك بأسرع وقت</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">رقم الهاتف</label>
            <input
              type="tel" placeholder="05xxxxxxxx"
              value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-right focus:border-orange-400 focus:outline-none transition"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">كلمة المرور</label>
            <input
              type="password" placeholder="••••••••"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-right focus:border-orange-400 focus:outline-none transition"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl py-3 text-lg transition disabled:opacity-50"
          >
            {loading ? '...' : 'تسجيل الدخول'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-500">
          ليس لديك حساب؟{' '}
          <Link to="/register" className="text-orange-500 font-bold">إنشاء حساب</Link>
        </p>
      </div>
    </div>
  );
}
