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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏪</div>
          <h1 className="text-2xl font-bold text-gray-900">بورتال المطعم</h1>
          <p className="text-gray-500 mt-1">وصلي - منصة التوصيل</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">رقم الهاتف</label>
            <input type="tel" className="w-full border rounded-xl p-3 mt-1 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="05XXXXXXXX" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">كلمة المرور</label>
            <input type="password" className="w-full border rounded-xl p-3 mt-1 focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="••••••" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 disabled:opacity-70 mt-2">
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
          <p className="text-center text-sm text-gray-500 mt-4">يتم إنشاء حسابات المطاعم عبر لوحة الإدارة</p>
        </form>
      </div>
    </div>
  );
}
