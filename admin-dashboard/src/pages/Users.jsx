import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const roleLabel = { customer: 'زبون', restaurant: 'مطعم', driver: 'مندوب', admin: 'مدير' };
const roleColor = {
  customer: 'bg-blue-100 text-blue-700',
  restaurant: 'bg-green-100 text-green-700',
  driver: 'bg-orange-100 text-orange-700',
  admin: 'bg-purple-100 text-purple-700'
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'driver', city: '' });
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchUsers(), 400);
    return () => clearTimeout(searchTimer.current);
  }, [search, role]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/admin/users', { params: { search, role, limit: 50 } });
      setUsers(data.data || []);
    } catch { toast.error('خطأ في تحميل المستخدمين'); }
    finally { setLoading(false); }
  };

  const toggleBlock = async (id) => {
    try {
      const data = await api.patch(`/admin/users/${id}/block`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_blocked: data.is_blocked } : u));
      toast.success('تم التحديث');
    } catch { toast.error('خطأ'); }
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.password) return toast.error('أدخل جميع البيانات');
    setCreating(true);
    try {
      await api.post('/auth/admin/create-user', form);
      toast.success('تم إنشاء الحساب بنجاح');
      setShowCreate(false);
      setForm({ name: '', phone: '', password: '', role: 'driver', city: '' });
      fetchUsers();
    } catch (e) {
      toast.error(e.message || 'حدث خطأ');
    } finally { setCreating(false); }
  };

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">المستخدمون</h1>
        <button onClick={() => setShowCreate(!showCreate)}
          className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold text-sm">
          + إنشاء حساب
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createUser} className="bg-white rounded-2xl border shadow-sm p-4 space-y-3">
          <h2 className="font-bold text-base text-gray-800">إنشاء حساب جديد</h2>
          <select className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
            <option value="driver">مندوب توصيل</option>
            <option value="restaurant">صاحب مطعم</option>
          </select>
          <input className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="الاسم الكامل *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
          <input className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="رقم الهاتف *" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} required />
          <input className="w-full border rounded-xl px-3 py-2.5 text-sm" type="password" placeholder="كلمة المرور *" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
          <input className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="المدينة" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-60">
              {creating ? 'جاري الإنشاء...' : 'إنشاء'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border py-2.5 rounded-xl font-bold text-sm text-gray-600">
              إلغاء
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <input placeholder="🔍 بحث..." className="border rounded-xl px-3 py-2 flex-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400" value={role} onChange={e => setRole(e.target.value)}>
          <option value="">الكل</option>
          <option value="customer">زبائن</option>
          <option value="restaurant">مطاعم</option>
          <option value="driver">مناديب</option>
          <option value="admin">مدراء</option>
        </select>
      </div>

      {/* Cards List */}
      <div className="space-y-2">
        {loading ? (
          [...Array(5)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl border animate-pulse" />)
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-400">لا يوجد مستخدمون</div>
        ) : users.map(user => (
          <div key={user.id} className="bg-white rounded-2xl border shadow-sm p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center font-bold text-orange-600 text-lg flex-shrink-0">
                {user.name?.[0] || '?'}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{user.name}</p>
                <p className="text-xs text-gray-400 font-mono">{user.phone}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${roleColor[user.role] || 'bg-gray-100 text-gray-700'}`}>
                    {roleLabel[user.role] || user.role}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${user.is_blocked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {user.is_blocked ? 'محظور' : 'نشط'}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={() => toggleBlock(user.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 ${user.is_blocked ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {user.is_blocked ? 'رفع الحظر' : 'حظر'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
