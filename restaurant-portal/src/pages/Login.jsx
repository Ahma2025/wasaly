import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ phone: '', password: '' });
  const [loading, setLoading] = useState(false);

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post('/auth/login-password', { ...form, phone: normalizePhone(form.phone) });
      if (!['restaurant', 'restaurant_owner', 'admin'].includes(data.user?.role)) {
        toast.error('هذا الحساب ليس حساب مطعم');
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (['restaurant', 'restaurant_owner'].includes(data.user.role)) {
        try {
          const rData = await api.get('/restaurants', { params: { owner_id: data.user.id } });
          if (rData.data?.[0]) localStorage.setItem('restaurant', JSON.stringify(rData.data[0]));
          else toast.error('تحذير: لم يتم العثور على بيانات المطعم');
        } catch { toast.error('تحذير: فشل تحميل بيانات المطعم'); }
      }
      navigate('/');
    } catch (e) { toast.error(e.message || 'بيانات خاطئة'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grad-sunset flex items-center justify-center p-4 relative overflow-hidden" dir="rtl">
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/10 blur-2xl" />
      <div className="bg-white rounded-3xl shadow-card p-8 w-full max-w-md animate-fade-up relative z-10">
        <div className="text-center mb-8">
          <div className="text-4xl w-20 h-20 mx-auto mb-4 rounded-3xl grad-brand flex items-center justify-center shadow-brand">🏪</div>
          <h1 className="text-3xl font-black grad-text">بورتال المطعم</h1>
          <p className="text-gray-500 mt-1">وصلي - منصة التوصيل</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold text-gray-700">رقم الهاتف</label>
            <input type="tel" className="w-full border-[1.5px] border-gray-200 bg-gray-50 rounded-xl p-3 mt-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white" placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700">كلمة المرور</label>
            <input type="password" className="w-full border-[1.5px] border-gray-200 bg-gray-50 rounded-xl p-3 mt-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 focus:bg-white" placeholder="••••••" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          </div>
          <button type="submit" disabled={loading} className="w-full grad-brand text-white py-3.5 rounded-xl font-bold shadow-brand hover:-translate-y-0.5 disabled:opacity-70 mt-2">
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
          <p className="text-center text-sm text-gray-500 mt-4">يتم إنشاء حسابات المطاعم عبر لوحة الإدارة</p>
        </form>
      </div>
    </div>
  );
}
