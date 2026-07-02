import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [form, setForm] = useState({ name: '', phone: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async e => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.password) { toast.error('أكمل جميع الحقول'); return; }
    if (form.password !== form.confirm) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    if (form.password.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name: form.name, phone: form.phone, password: form.password, role: 'customer'
      });
      login(res.data?.user || res.user, res.data?.token || res.token);
      toast.success('تم إنشاء الحساب بنجاح!');
      nav('/');
    } catch (err) {
      toast.error(err?.message || 'فشل إنشاء الحساب');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 p-4">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🛵</div>
          <h1 className="text-2xl font-black text-gray-900">وصَلّي</h1>
          <p className="text-gray-500 mt-1 text-sm">أنشئ حسابك الآن</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {[
            { key: 'name', label: 'الاسم الكامل', type: 'text', ph: 'محمد أحمد' },
            { key: 'phone', label: 'رقم الهاتف', type: 'tel', ph: '05xxxxxxxx' },
            { key: 'password', label: 'كلمة المرور', type: 'password', ph: '••••••••' },
            { key: 'confirm', label: 'تأكيد كلمة المرور', type: 'password', ph: '••••••••' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-bold text-gray-700 mb-1">{f.label}</label>
              <input
                type={f.type} placeholder={f.ph}
                value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-right focus:border-orange-400 focus:outline-none transition"
              />
            </div>
          ))}
          <button
            type="submit" disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black rounded-xl py-3 text-lg transition disabled:opacity-50"
          >
            {loading ? '...' : 'إنشاء حساب'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-gray-500">
          لديك حساب؟{' '}
          <Link to="/login" className="text-orange-500 font-bold">تسجيل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
