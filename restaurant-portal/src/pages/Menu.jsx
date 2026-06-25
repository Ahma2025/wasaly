import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Menu() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [selectedCat, setSelectedCat] = useState(null);
  const [newItem, setNewItem] = useState({ name_ar: '', name_en: '', description_ar: '', price: '', discount_price: '', calories: '', is_spicy: false, is_vegetarian: false });
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');

  useEffect(() => { fetchMenu(); }, []);

  const fetchMenu = async () => {
    try {
      const data = await api.get(`/restaurants/${restaurant.id}`);
      setCategories(data.data.menu || []);
    } catch { toast.error('خطأ في تحميل المنيو'); }
    finally { setLoading(false); }
  };

  const toggleItemAvailability = async (itemId) => {
    try {
      await api.patch(`/menu/items/${itemId}/toggle`);
      setCategories(prev => prev.map(cat => ({
        ...cat,
        items: cat.items?.map(item => item.id === itemId ? { ...item, is_available: !item.is_available } : item)
      })));
      toast.success('تم التحديث');
    } catch { toast.error('خطأ'); }
  };

  const deleteItem = async (itemId) => {
    if (!confirm('حذف هذا الصنف؟')) return;
    try {
      await api.delete(`/menu/items/${itemId}`);
      setCategories(prev => prev.map(cat => ({ ...cat, items: cat.items?.filter(i => i.id !== itemId) })));
      toast.success('تم الحذف');
    } catch { toast.error('خطأ في الحذف'); }
  };

  const addItem = async (e) => {
    e.preventDefault();
    try {
      await api.post('/menu/items', { ...newItem, restaurant_id: restaurant.id, category_id: selectedCat });
      toast.success('تمت إضافة الصنف');
      setShowAddItem(false);
      setNewItem({ name_ar: '', name_en: '', description_ar: '', price: '', discount_price: '', calories: '', is_spicy: false, is_vegetarian: false });
      fetchMenu();
    } catch { toast.error('خطأ في الإضافة'); }
  };

  if (loading) return <div className="flex justify-center py-10"><div className="animate-spin h-10 w-10 border-b-2 border-orange-500 rounded-full" /></div>;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">إدارة المنيو</h1>
      </div>

      {categories.map(cat => (
        <div key={cat.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
            <h2 className="font-bold text-gray-900 text-lg">{cat.name_ar}</h2>
            <button onClick={() => { setSelectedCat(cat.id); setShowAddItem(true); }} className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-orange-600">
              + إضافة صنف
            </button>
          </div>

          <div className="divide-y">
            {cat.items?.map(item => (
              <div key={item.id} className="flex items-center p-4 gap-4 hover:bg-gray-50">
                {item.image && <img src={item.image} alt={item.name_ar} className="w-16 h-16 rounded-xl object-cover" />}
                {!item.image && <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">🍽️</div>}

                <div className="flex-1">
                  <p className="font-bold text-gray-900">{item.name_ar}</p>
                  {item.description_ar && <p className="text-sm text-gray-500 line-clamp-1">{item.description_ar}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-bold text-orange-500">{item.price}₪</span>
                    {item.discount_price && <span className="text-sm text-green-500">{item.discount_price}₪ خصم</span>}
                    {item.calories && <span className="text-xs text-gray-400">{item.calories} سعرة</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleItemAvailability(item.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${item.is_available ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                  >
                    {item.is_available ? '✅ متاح' : '❌ غير متاح'}
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">🗑️</button>
                </div>
              </div>
            ))}
            {(!cat.items || cat.items.length === 0) && (
              <p className="text-center text-gray-400 py-6">لا توجد أصناف في هذا القسم</p>
            )}
          </div>
        </div>
      ))}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" dir="rtl">
            <h2 className="text-xl font-bold mb-4">إضافة صنف جديد</h2>
            <form onSubmit={addItem} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">اسم الصنف (عربي) *</label>
                  <input className="w-full border rounded-xl p-2.5 mt-1 text-sm" value={newItem.name_ar} onChange={e => setNewItem({...newItem, name_ar: e.target.value})} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">اسم الصنف (إنجليزي)</label>
                  <input className="w-full border rounded-xl p-2.5 mt-1 text-sm" value={newItem.name_en} onChange={e => setNewItem({...newItem, name_en: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">الوصف</label>
                <textarea className="w-full border rounded-xl p-2.5 mt-1 text-sm" rows={2} value={newItem.description_ar} onChange={e => setNewItem({...newItem, description_ar: e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">السعر ₪ *</label>
                  <input type="number" className="w-full border rounded-xl p-2.5 mt-1 text-sm" value={newItem.price} onChange={e => setNewItem({...newItem, price: e.target.value})} required />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">سعر الخصم ₪</label>
                  <input type="number" className="w-full border rounded-xl p-2.5 mt-1 text-sm" value={newItem.discount_price} onChange={e => setNewItem({...newItem, discount_price: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">السعرات</label>
                  <input type="number" className="w-full border rounded-xl p-2.5 mt-1 text-sm" value={newItem.calories} onChange={e => setNewItem({...newItem, calories: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newItem.is_spicy} onChange={e => setNewItem({...newItem, is_spicy: e.target.checked})} /><span className="text-sm">🌶️ حار</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newItem.is_vegetarian} onChange={e => setNewItem({...newItem, is_vegetarian: e.target.checked})} /><span className="text-sm">🌿 نباتي</span></label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-orange-500 text-white py-2.5 rounded-xl font-bold hover:bg-orange-600">إضافة</button>
                <button type="button" onClick={() => setShowAddItem(false)} className="flex-1 border py-2.5 rounded-xl font-bold text-gray-600 hover:bg-gray-50">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
