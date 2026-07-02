import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';

const MAX_KM = 5;

export default function DeliveryZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', min_km: '', max_km: '', price: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchZones(); }, []);

  const fetchZones = async () => {
    try {
      const r = await api.get('/delivery-zones');
      setZones(r.data || []);
    } catch { toast.error('فشل تحميل المناطق'); }
    finally { setLoading(false); }
  };

  const validateZone = (z) => {
    const min = parseFloat(z.min_km);
    const max = parseFloat(z.max_km);
    const price = parseFloat(z.price);
    if (!z.name?.trim()) return 'أدخل اسم المنطقة';
    if (isNaN(min) || min < 0) return 'أدخل المسافة الدنيا بشكل صحيح';
    if (isNaN(max) || max <= min) return 'المسافة القصوى يجب أن تكون أكبر من الدنيا';
    if (max > MAX_KM) return `الحد الأقصى للمسافة هو ${MAX_KM} كيلومتر`;
    if (isNaN(price) || price < 0) return 'أدخل السعر بشكل صحيح';
    return null;
  };

  const addZone = async () => {
    const err = validateZone(newZone);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      await api.post('/delivery-zones', {
        name: newZone.name,
        min_km: parseFloat(newZone.min_km),
        max_km: parseFloat(newZone.max_km),
        price: parseFloat(newZone.price),
      });
      toast.success('تم الإضافة ✅');
      setShowAdd(false);
      setNewZone({ name: '', min_km: '', max_km: '', price: '' });
      fetchZones();
    } catch (e) { toast.error(e.message || 'فشل الإضافة'); }
    finally { setSaving(false); }
  };

  const updateZone = async (zone) => {
    const err = validateZone(zone);
    if (err) return toast.error(err);
    setSaving(true);
    try {
      await api.put(`/delivery-zones/${zone.id}`, {
        name: zone.name,
        min_km: parseFloat(zone.min_km),
        max_km: parseFloat(zone.max_km),
        price: parseFloat(zone.price),
      });
      toast.success('تم الحفظ ✅');
      setEditing(null);
      fetchZones();
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
  };

  const deleteZone = async (id) => {
    if (!window.confirm('حذف هذه المنطقة؟')) return;
    try {
      await api.delete(`/delivery-zones/${id}`);
      toast.success('تم الحذف');
      fetchZones();
    } catch (e) { toast.error(e.message || 'فشل الحذف'); }
  };

  const PRESETS = [
    { name: 'قريب (0 - 1 كم)', min_km: '0', max_km: '1', price: '' },
    { name: 'متوسط (1 - 3 كم)', min_km: '1', max_km: '3', price: '' },
    { name: 'بعيد (3 - 5 كم)', min_km: '3', max_km: '5', price: '' },
  ];

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-gray-900">مناطق التوصيل والأسعار</h1>
        <button onClick={() => { setShowAdd(!showAdd); setNewZone({ name: '', min_km: '', max_km: '', price: '' }); }}
          className="bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
          ➕ منطقة جديدة
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-1">
        <p className="text-sm text-blue-700 font-semibold">📍 نظام التسعير حسب المسافة</p>
        <p className="text-xs text-blue-600">الحد الأقصى للتوصيل: <strong>{MAX_KM} كيلومتر</strong>. يمكنك إنشاء حتى 3 براكيتات للمسافة وتحديد سعر التوصيل لكل واحدة.</p>
      </div>

      {/* Quick Presets */}
      {showAdd && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
          <p className="text-xs font-bold text-orange-700 mb-2">اختر براكيت جاهز:</p>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => setNewZone({ ...p })}
                className="text-xs bg-white border border-orange-200 text-orange-600 rounded-lg px-2 py-1 font-semibold hover:bg-orange-100 transition">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="font-bold text-gray-900">منطقة جديدة</h2>
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="اسم المنطقة *"
            value={newZone.name} onChange={e => setNewZone(z => ({ ...z, name: e.target.value }))} />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">من (كم)</label>
              <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" type="number" min="0" max={MAX_KM} step="0.5"
                placeholder="0" value={newZone.min_km}
                onChange={e => setNewZone(z => ({ ...z, min_km: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">حتى (كم) — max {MAX_KM}</label>
              <input className={`w-full border rounded-xl p-3 text-sm ${parseFloat(newZone.max_km) > MAX_KM ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                type="number" min="0" max={MAX_KM} step="0.5"
                placeholder={`max ${MAX_KM}`} value={newZone.max_km}
                onChange={e => setNewZone(z => ({ ...z, max_km: e.target.value }))} />
              {parseFloat(newZone.max_km) > MAX_KM && (
                <p className="text-red-500 text-[10px] mt-0.5">⚠ لا يمكن تجاوز {MAX_KM} كم</p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">السعر (₪)</label>
              <input className="w-full border border-gray-200 rounded-xl p-3 text-sm" type="number" min="0"
                placeholder="5" value={newZone.price}
                onChange={e => setNewZone(z => ({ ...z, price: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addZone} disabled={saving || parseFloat(newZone.max_km) > MAX_KM}
              className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold text-sm disabled:opacity-50">
              {saving ? 'جاري الحفظ...' : 'إضافة'}
            </button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold text-sm">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Zones List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 rounded-full border-b-2 border-orange-500" /></div>
      ) : zones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📍</p>
          <p className="font-semibold">لا توجد مناطق توصيل</p>
          <p className="text-xs mt-1">أنشئ حتى 3 براكيتات للمسافة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map(zone => (
            <div key={zone.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {editing?.id === zone.id ? (
                <div className="p-4 space-y-3">
                  <input className="w-full border border-gray-200 rounded-xl p-3 text-sm font-bold" value={editing.name}
                    onChange={e => setEditing(z => ({ ...z, name: e.target.value }))} />
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">من (كم)</label>
                      <input className="w-full border border-gray-200 rounded-xl p-2 text-sm" type="number" min="0" max={MAX_KM}
                        value={editing.min_km} onChange={e => setEditing(z => ({ ...z, min_km: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">حتى (كم) — max {MAX_KM}</label>
                      <input className={`w-full border rounded-xl p-2 text-sm ${parseFloat(editing.max_km) > MAX_KM ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                        type="number" min="0" max={MAX_KM}
                        value={editing.max_km} onChange={e => setEditing(z => ({ ...z, max_km: e.target.value }))} />
                      {parseFloat(editing.max_km) > MAX_KM && (
                        <p className="text-red-500 text-[10px] mt-0.5">⚠ لا يمكن تجاوز {MAX_KM} كم</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">السعر (₪)</label>
                      <input className="w-full border border-orange-300 rounded-xl p-2 text-sm font-bold text-orange-600" type="number"
                        value={editing.price} onChange={e => setEditing(z => ({ ...z, price: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateZone(editing)} disabled={saving || parseFloat(editing.max_km) > MAX_KM}
                      className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-50">
                      {saving ? 'حفظ...' : '💾 حفظ'}
                    </button>
                    <button onClick={() => setEditing(null)} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-sm">
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900">{zone.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {zone.min_km} — {zone.max_km} كيلومتر
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-orange-500">{zone.price}₪</p>
                      <p className="text-xs text-gray-400">سعر التوصيل</p>
                    </div>
                  </div>
                  {/* Visual bar */}
                  <div className="mt-3 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="bg-orange-400 h-2 rounded-full"
                      style={{ width: `${Math.min((zone.max_km / MAX_KM) * 100, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                    <span>0 كم</span>
                    <span>{MAX_KM} كم</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setEditing({ ...zone })}
                      className="flex-1 bg-blue-50 text-blue-600 py-2 rounded-xl text-sm font-bold">
                      ✏️ تعديل
                    </button>
                    <button onClick={() => deleteZone(zone.id)}
                      className="flex-1 bg-red-50 text-red-500 py-2 rounded-xl text-sm font-bold">
                      🗑️ حذف
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
