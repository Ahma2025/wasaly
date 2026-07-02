import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', password: '123456', vehicle_type: 'دراجة', vehicle_plate: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchDrivers(); }, []);

  const fetchDrivers = async () => {
    try {
      const r = await api.get('/drivers');
      setDrivers(r.data || []);
    } catch (e) { toast.error('فشل تحميل السائقين'); }
    finally { setLoading(false); }
  };

  const addDriver = async () => {
    if (!form.name || !form.phone) return toast.error('أدخل الاسم والهاتف');
    setSaving(true);
    try {
      await api.post('/drivers', form);
      toast.success('تم إضافة السائق');
      setShowForm(false);
      setForm({ name: '', phone: '', password: '123456', vehicle_type: 'دراجة', vehicle_plate: '' });
      fetchDrivers();
    } catch (e) { toast.error(e.message || 'فشل الإضافة'); }
    finally { setSaving(false); }
  };

  const deleteDriver = async (id) => {
    if (!confirm('حذف هذا السائق؟')) return;
    try {
      await api.delete(`/drivers/${id}`);
      toast.success('تم الحذف');
      fetchDrivers();
    } catch { toast.error('فشل الحذف'); }
  };

  const blockDriver = async (id) => {
    try {
      await api.patch(`/admin/users/${id}/block`);
      toast.success('تم التحديث');
      fetchDrivers();
    } catch { toast.error('فشل'); }
  };

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900">السائقون</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1">
          ➕ إضافة سائق
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="font-bold text-gray-900">سائق جديد</h2>
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="الاسم الكامل *"
            value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} />
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="رقم الهاتف *"
            value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} />
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="كلمة المرور"
            value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} />
          <div className="grid grid-cols-2 gap-3">
            <select className="border border-gray-200 rounded-xl p-3 text-sm" value={form.vehicle_type}
              onChange={e => setForm(f => ({...f, vehicle_type: e.target.value}))}>
              <option>دراجة</option>
              <option>سيارة</option>
              <option>دراجة هوائية</option>
            </select>
            <input className="border border-gray-200 rounded-xl p-3 text-sm" placeholder="رقم اللوحة"
              value={form.vehicle_plate} onChange={e => setForm(f => ({...f, vehicle_plate: e.target.value}))} />
          </div>
          <div className="flex gap-2">
            <button onClick={addDriver} disabled={saving}
              className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-60">
              {saving ? 'جاري الحفظ...' : 'إضافة'}
            </button>
            <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-green-600">{drivers.filter(d => d.is_online).length}</p>
          <p className="text-xs text-green-700">متصل</p>
        </div>
        <div className="bg-orange-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-orange-600">{drivers.filter(d => d.is_busy).length}</p>
          <p className="text-xs text-orange-700">مشغول</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-lg font-black text-gray-600">{drivers.length}</p>
          <p className="text-xs text-gray-700">الكل</p>
        </div>
      </div>

      {/* Drivers List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">🛵</p>
          <p>لا يوجد سائقون</p>
        </div>
      ) : (
        <div className="space-y-3">
          {drivers.map(d => (
            <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-black text-lg flex-shrink-0">
                  {d.name?.[0] || '🛵'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-900 truncate">{d.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${d.is_online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {d.is_online ? '🟢 متصل' : '⚫ غير متصل'}
                    </span>
                    {d.is_busy ? <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold">مشغول</span> : null}
                  </div>
                  <p className="text-sm text-gray-500">{d.phone}</p>
                  <p className="text-xs text-gray-400">{d.vehicle_type} • {d.vehicle_plate || 'بدون لوحة'}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-sm font-black text-orange-500">{d.total_orders || 0}</p>
                  <p className="text-[10px] text-gray-400">طلب</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-green-600">{parseFloat(d.total_earnings || 0).toFixed(1)}₪</p>
                  <p className="text-[10px] text-gray-400">أرباح</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-blue-600">{parseFloat(d.rating || 0).toFixed(1)} ⭐</p>
                  <p className="text-[10px] text-gray-400">تقييم</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSelectedDriver(selectedDriver?.id === d.id ? null : d)}
                  className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-xl text-xs font-bold">
                  📊 التفاصيل
                </button>
                <button onClick={() => blockDriver(d.user_id || d.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold ${d.is_blocked ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'}`}>
                  {d.is_blocked ? '✅ رفع الحظر' : '🚫 حظر'}
                </button>
                <button onClick={() => deleteDriver(d.user_id || d.id)}
                  className="flex-1 bg-red-50 text-red-600 py-2 rounded-xl text-xs font-bold">
                  🗑️ حذف
                </button>
              </div>

              {/* Expanded Stats */}
              {selectedDriver?.id === d.id && (
                <DriverStats driverId={d.user_id || d.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DriverStats({ driverId }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get(`/admin/driver-stats/${driverId}`).then(r => setStats(r.data)).catch(() => {});
  }, [driverId]);

  if (!stats) return <div className="mt-3 text-center py-2"><div className="animate-spin h-5 w-5 rounded-full border-b-2 border-orange-500 mx-auto" /></div>;

  return (
    <div className="mt-3 pt-3 border-t border-orange-100 bg-orange-50 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-black text-orange-600">{stats.total_orders || 0}</p>
          <p className="text-[10px] text-gray-500">إجمالي الطلبات</p>
        </div>
        <div>
          <p className="font-black text-green-600">{parseFloat(stats.total_earnings || 0).toFixed(2)}₪</p>
          <p className="text-[10px] text-gray-500">إجمالي الأرباح</p>
        </div>
        <div>
          <p className="font-black text-blue-600">{parseFloat(stats.avg_per_delivery || 0).toFixed(2)}₪</p>
          <p className="text-[10px] text-gray-500">متوسط التوصيل</p>
        </div>
      </div>
      {stats.weekly?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold text-gray-600">آخر 7 أيام:</p>
          {stats.weekly.map((d, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="text-gray-500">{d.date}</span>
              <span>{d.orders} طلب • <strong>{parseFloat(d.earnings).toFixed(2)}₪</strong></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
