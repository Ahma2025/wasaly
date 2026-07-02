import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function Addresses() {
  const nav = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newAddr, setNewAddr] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { fetchAddresses(); }, []);

  const fetchAddresses = async () => {
    try {
      const res = await api.get('/users/addresses');
      setAddresses(res.data || res || []);
    } catch { toast.error('فشل تحميل العناوين'); }
    finally { setLoading(false); }
  };

  const addAddress = async () => {
    if (!newAddr.trim()) return toast.error('أدخل العنوان');
    try {
      await api.post('/users/addresses', { address: newAddr, label: 'منزل' });
      toast.success('تم إضافة العنوان');
      setNewAddr('');
      setShowAdd(false);
      fetchAddresses();
    } catch { toast.error('فشل إضافة العنوان'); }
  };

  const deleteAddress = async (id) => {
    try {
      await api.delete(`/users/addresses/${id}`);
      setAddresses(prev => prev.filter(a => a.id !== id));
      toast.success('تم حذف العنوان');
    } catch { toast.error('فشل الحذف'); }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-6" dir="rtl">
      <div className="bg-white px-4 py-4 flex items-center gap-3 shadow-sm">
        <button onClick={() => nav(-1)} className="text-gray-600 text-xl">←</button>
        <h1 className="font-black text-gray-900 text-lg">عناواني 📍</h1>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" />
          </div>
        ) : addresses.length === 0 && !showAdd ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-3">📍</p>
            <p className="font-semibold">لا توجد عناوين محفوظة</p>
          </div>
        ) : (
          addresses.map(a => (
            <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-gray-800">{a.label || 'منزل'}</p>
                <p className="text-sm text-gray-500 mt-0.5">{a.address}</p>
                {a.is_default ? <span className="text-xs text-orange-500 font-bold">الافتراضي</span> : null}
              </div>
              <button onClick={() => deleteAddress(a.id)} className="text-red-400 text-sm font-bold">🗑️</button>
            </div>
          ))
        )}

        {showAdd ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-orange-200 space-y-3">
            <input value={newAddr} onChange={e => setNewAddr(e.target.value)}
              placeholder="أدخل عنوانك بالتفصيل..."
              className="w-full border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={addAddress} className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-bold text-sm">حفظ</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm">إلغاء</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full bg-orange-50 border-2 border-dashed border-orange-300 text-orange-500 py-3 rounded-2xl font-bold text-sm">
            + إضافة عنوان جديد
          </button>
        )}
      </div>
    </div>
  );
}
