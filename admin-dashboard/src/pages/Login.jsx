import React, { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { ...form, role: 'admin' });
      if (data.user?.role !== 'admin') return toast.error('غير مصرح');
      localStorage.setItem('admin_token', data.token);
      onLogin(data.user);
    } catch { toast.error('بيانات خاطئة'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl" dir="rtl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🚀</div>
          <h1 className="text-2xl font-black text-gray-900">وصلّي</h1>
          <p className="text-gray-500 text-sm mt-1">لوحة تحكم المدير</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">رقم الهاتف</label>
            <input type="tel" className="border rounded-xl px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="+972..." value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">كلمة المرور</label>
            <input type="password" className="border rounded-xl px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 transition">
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
