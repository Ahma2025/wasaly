import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchUsers(); }, [search, role]);

  const fetchUsers = async () => {
    try {
      const data = await api.get(`/admin/users?search=${search}&role=${role}&limit=50`);
      setUsers(data.data);
    } catch { toast.error('خطأ'); }
    finally { setLoading(false); }
  };

  const toggleBlock = async (id) => {
    try {
      const data = await api.patch(`/admin/users/${id}/block`);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, is_blocked: data.is_blocked } : u));
      toast.success('تم التحديث');
    } catch { toast.error('خطأ'); }
  };

  const roleLabel = { customer: 'زبون', restaurant: 'مطعم', driver: 'مندوب', admin: 'مدير' };
  const roleColor = { customer: 'bg-blue-100 text-blue-700', restaurant: 'bg-green-100 text-green-700', driver: 'bg-orange-100 text-orange-700', admin: 'bg-purple-100 text-purple-700' };

  return (
    <div className="space-y-4 p-6" dir="rtl">
      <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>

      <div className="flex gap-3 flex-wrap">
        <input placeholder="🔍 بحث..." className="border rounded-xl px-4 py-2 flex-1 min-w-48 focus:outline-none focus:ring-2 focus:ring-orange-400" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="border rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400" value={role} onChange={e => setRole(e.target.value)}>
          <option value="">الكل</option>
          <option value="customer">زبائن</option>
          <option value="restaurant">مطاعم</option>
          <option value="driver">مناديب</option>
          <option value="admin">مدراء</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-3 font-semibold">المستخدم</th>
                <th className="px-4 py-3 font-semibold">الهاتف</th>
                <th className="px-4 py-3 font-semibold">الدور</th>
                <th className="px-4 py-3 font-semibold">الرصيد</th>
                <th className="px-4 py-3 font-semibold">النقاط</th>
                <th className="px-4 py-3 font-semibold">تاريخ التسجيل</th>
                <th className="px-4 py-3 font-semibold">الحالة</th>
                <th className="px-4 py-3 font-semibold">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                ))
              ) : users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono">{user.phone}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${roleColor[user.role]}`}>{roleLabel[user.role]}</span></td>
                  <td className="px-4 py-3 font-bold text-orange-600">{parseFloat(user.wallet_balance || 0).toFixed(2)}₪</td>
                  <td className="px-4 py-3 text-gray-600">{user.loyalty_points || 0}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(user.created_at).toLocaleDateString('ar')}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-bold ${user.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{user.is_blocked ? 'محظور' : 'نشط'}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleBlock(user.id)} className={`px-3 py-1 rounded-lg text-xs font-bold ${user.is_blocked ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                      {user.is_blocked ? 'رفع الحظر' : 'حظر'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
