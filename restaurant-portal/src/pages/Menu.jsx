import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import toast from 'react-hot-toast';

export default function Menu() {
  const restaurant = JSON.parse(localStorage.getItem('restaurant') || '{}');
  const cachedMenu = readCache('rest_menu_' + restaurant.id);
  const [categories, setCategories] = useState(cachedMenu || []);
  const [loading, setLoading] = useState(!cachedMenu);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);
  const [showAddItem, setShowAddItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showOptions, setShowOptions] = useState(null);

  useEffect(() => { fetchMenu(); }, []);

  const fetchMenu = async () => {
    if (!restaurant.id) return setLoading(false);
    try {
      const r = await api.get(`/restaurants/${restaurant.id}`);
      const menu = r.data?.menu || [];
      setCategories(menu);
      writeCache('rest_menu_' + restaurant.id, menu);
    } catch { if (!cachedMenu) toast.error('فشل تحميل المنيو'); }
    finally { setLoading(false); }
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.post('/menu/categories', { restaurant_id: restaurant.id, name_ar: newCatName, name_en: newCatName, sort_order: categories.length });
      toast.success('تم إضافة الفئة');
      setNewCatName('');
      setShowAddCat(false);
      fetchMenu();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const deleteCategory = async (id) => {
    if (!confirm('حذف هذه الفئة وكل أصنافها؟')) return;
    try {
      await api.delete(`/menu/categories/${id}`);
      toast.success('تم الحذف');
      fetchMenu();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const addItem = async (catId, form) => {
    if (!form.name_ar || !form.price) return toast.error('أدخل الاسم والسعر');
    try {
      await api.post('/menu/items', {
        ...form,
        restaurant_id: restaurant.id,
        category_id: catId,
        price: parseFloat(form.price),
        discount_price: form.discount_price ? parseFloat(form.discount_price) : null
      });
      toast.success('تم إضافة الصنف');
      setShowAddItem(null);
      fetchMenu();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const updateItem = async (id, form) => {
    try {
      await api.put(`/menu/items/${id}`, {
        ...form,
        price: parseFloat(form.price),
        discount_price: form.discount_price ? parseFloat(form.discount_price) : null
      });
      toast.success('تم الحفظ');
      setEditItem(null);
      fetchMenu();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const deleteItem = async (id) => {
    if (!confirm('حذف هذا الصنف؟')) return;
    try {
      await api.delete(`/menu/items/${id}`);
      toast.success('تم الحذف');
      fetchMenu();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const toggleItem = async (id) => {
    try {
      await api.patch(`/menu/items/${id}/toggle`);
      fetchMenu();
    } catch { toast.error('فشل'); }
  };

  const totalItems = categories.reduce((s, c) => s + (c.items?.length || 0), 0);

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">المنيو</h1>
          <p className="text-xs text-gray-400 mt-0.5">{totalItems} صنف · {categories.length} فئة</p>
        </div>
        <button onClick={() => setShowAddCat(!showAddCat)}
          className="grad-brand text-white shadow-brand px-4 py-2.5 rounded-2xl text-sm font-black flex items-center gap-1.5">
          <span className="text-base leading-none">＋</span> فئة
        </button>
      </div>

      {showAddCat && (
        <div className="bg-white rounded-2xl p-3 shadow-soft space-y-2 animate-fade-up">
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" placeholder="اسم الفئة (مثال: برجر، مشروبات...)"
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
          <div className="flex gap-2">
            <button onClick={addCategory} className="flex-1 grad-brand text-white shadow-brand py-2.5 rounded-xl text-sm font-black">إضافة الفئة</button>
            <button onClick={() => setShowAddCat(false)} className="px-4 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold">إلغاء</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 py-2">{[...Array(6)].map((_,i)=>(<div key={i} className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-soft"><div className="sk" style={{width:44,height:44,borderRadius:12}}/><div className="flex-1 space-y-2"><div className="sk" style={{width:"45%",height:14,borderRadius:8}}/><div className="sk" style={{width:"25%",height:11,borderRadius:8}}/></div></div>))}</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="w-24 h-24 mx-auto mb-4 rounded-3xl bg-orange-50 flex items-center justify-center text-5xl">🍽️</div>
          <p className="font-black text-gray-700 text-lg">ابدأ ببناء منيوك</p>
          <p className="text-sm mt-1">أضف أول فئة (مثل: برجر، مشروبات) ثم أضف أصنافها</p>
          <button onClick={() => setShowAddCat(true)} className="mt-5 grad-brand text-white shadow-brand px-6 py-3 rounded-2xl text-sm font-black">＋ أضف أول فئة</button>
        </div>
      ) : (
        <div className="space-y-4 stagger">
          {categories.map((cat, ci) => {
            const open = expandedCat === cat.id;
            const count = cat.items?.length || 0;
            return (
            <div key={cat.id} className="bg-white rounded-3xl shadow-soft overflow-hidden">
              {/* Category Header */}
              <div className={`flex items-center gap-3 p-4 cursor-pointer select-none transition-colors ${open ? 'bg-orange-50/60' : ''}`}
                onClick={() => setExpandedCat(open ? null : cat.id)}>
                <div className="w-11 h-11 rounded-2xl grad-brand shadow-brand flex items-center justify-center text-white font-black text-base flex-shrink-0">{ci + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-gray-900 text-base truncate">{cat.name_ar}</p>
                  <p className="text-xs text-gray-400">{count} {count === 1 ? 'صنف' : 'صنف'}</p>
                </div>
                <span className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>▼</span>
              </div>

              {open && (
                <div className="px-3 pb-3 space-y-2.5 animate-fade-up">
                  {/* Add item — big clear target */}
                  {showAddItem === cat.id ? (
                    <ItemForm catId={cat.id} onSave={addItem} onCancel={() => setShowAddItem(null)} />
                  ) : (
                    <button onClick={() => { setShowAddItem(cat.id); setEditItem(null); }}
                      className="w-full border-2 border-dashed border-orange-200 text-orange-600 rounded-2xl py-3 font-black text-sm hover:bg-orange-50 transition-colors">
                      ＋ أضف صنف جديد
                    </button>
                  )}

                  {count === 0 && showAddItem !== cat.id && (
                    <p className="text-center text-gray-400 text-sm py-3">لا أصناف بعد — اضغط «أضف صنف جديد»</p>
                  )}

                  {cat.items?.map(item => (
                    editItem?.id === item.id ? (
                      <ItemForm key={item.id} catId={cat.id} initial={editItem} onSave={(_, form) => updateItem(item.id, form)} onCancel={() => setEditItem(null)} />
                    ) : (
                      <div key={item.id} className={`rounded-2xl p-3 border ${item.is_available ? 'bg-gray-50 border-gray-100' : 'bg-gray-100/70 border-gray-200'}`}>
                        <div className="flex gap-3">
                          {item.image ? (
                            <img src={item.image} className={`w-[70px] h-[70px] rounded-2xl object-cover flex-shrink-0 ${!item.is_available && 'opacity-50'}`} alt="" />
                          ) : (
                            <div className="w-[70px] h-[70px] rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`font-black text-sm ${item.is_available ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{item.name_ar}</p>
                            {item.description_ar && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description_ar}</p>}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {item.discount_price ? (
                                <>
                                  <span className="text-base font-black text-orange-500">{parseFloat(item.discount_price).toFixed(2)}₪</span>
                                  <span className="text-xs text-gray-400 line-through">{parseFloat(item.price).toFixed(2)}₪</span>
                                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-black">-{Math.round((1 - item.discount_price / item.price) * 100)}%</span>
                                </>
                              ) : (
                                <span className="text-base font-black text-orange-500">{parseFloat(item.price).toFixed(2)}₪</span>
                              )}
                            </div>
                          </div>
                          {/* Availability toggle — clear & large */}
                          <button onClick={() => toggleItem(item.id)}
                            className={`flex-shrink-0 self-start flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-black transition-colors ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${item.is_available ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {item.is_available ? 'ظاهر' : 'مخفي'}
                          </button>
                        </div>

                        {/* Action bar — big even buttons */}
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => { setEditItem({ ...item }); setShowAddItem(null); }}
                            className="flex-1 bg-white border border-gray-200 text-gray-700 py-2 rounded-xl text-xs font-black hover:border-orange-300 hover:text-orange-600 transition-colors">✏️ تعديل</button>
                          <button onClick={() => setShowOptions(showOptions === item.id ? null : item.id)}
                            className={`flex-1 py-2 rounded-xl text-xs font-black transition-colors ${showOptions === item.id ? 'grad-brand text-white' : 'bg-white border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-600'}`}>
                            ⚙️ إضافات{item.options?.filter(o => o && o.id).length ? ` (${item.options.filter(o => o && o.id).length})` : ''}
                          </button>
                          <button onClick={() => deleteItem(item.id)}
                            className="w-11 bg-white border border-gray-200 text-red-500 py-2 rounded-xl text-sm hover:bg-red-50 hover:border-red-200 transition-colors flex items-center justify-center">🗑️</button>
                        </div>

                        {showOptions === item.id && (
                          <div className="mt-2">
                            <ItemOptions itemId={item.id} options={item.options || []} onUpdate={fetchMenu} />
                          </div>
                        )}
                      </div>
                    )
                  ))}

                  {/* Delete category — subtle, separated to avoid mis-taps */}
                  <button onClick={() => deleteCategory(cat.id)}
                    className="w-full text-gray-400 text-xs font-bold py-2 hover:text-red-500 transition-colors">
                    🗑️ حذف الفئة «{cat.name_ar}»
                  </button>
                </div>
              )}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

function ItemForm({ catId, initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial ? {
    name_ar: initial.name_ar || '',
    description_ar: initial.description_ar || '',
    price: initial.price || '',
    discount_price: initial.discount_price || '',
    image: initial.image || ''
  } : { name_ar: '', description_ar: '', price: '', discount_price: '', image: '' });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setForm(f => ({ ...f, image: r.url }));
      toast.success('تم رفع الصورة ✅');
    } catch { toast.error('فشل رفع الصورة'); }
    finally { setUploading(false); }
  };

  return (
    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-black text-orange-700">{initial ? '✏️ تعديل الصنف' : '✨ صنف جديد'}</p>

      {/* Image Upload */}
      <div className="flex items-center gap-3">
        <div
          className="w-16 h-16 rounded-xl bg-white border-2 border-dashed border-orange-300 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-orange-50 flex-shrink-0"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="animate-spin w-5 h-5 rounded-full border-b-2 border-orange-500" />
          ) : form.image ? (
            <img src={form.image} className="w-full h-full object-cover" alt="" />
          ) : (
            <span className="text-2xl">📷</span>
          )}
        </div>
        <div className="flex-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-orange-200 rounded-xl p-2 text-xs text-orange-600 font-semibold bg-white hover:bg-orange-50"
          >
            {uploading ? 'جاري الرفع...' : form.image ? 'تغيير الصورة' : '📷 رفع صورة الصنف'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => uploadImage(e.target.files?.[0])} />
        </div>
      </div>

      <input className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white" placeholder="اسم الصنف *"
        value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
      <input className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white" placeholder="وصف مختصر (اختياري)"
        value={form.description_ar} onChange={e => setForm(f => ({ ...f, description_ar: e.target.value }))} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">السعر (₪) *</label>
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white mt-1" type="number" placeholder="10.00"
            value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs text-gray-500">سعر بعد الخصم (₪)</label>
          <input className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white mt-1" type="number" placeholder="فارغ = بدون خصم"
            value={form.discount_price} onChange={e => setForm(f => ({ ...f, discount_price: e.target.value }))} />
        </div>
      </div>
      {form.discount_price && form.price && parseFloat(form.discount_price) < parseFloat(form.price) && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-2 text-center">
          <span className="text-xs font-bold text-red-600">
            خصم {Math.round((1 - parseFloat(form.discount_price) / parseFloat(form.price)) * 100)}% •
            السعر الأصلي: <span className="line-through">{parseFloat(form.price).toFixed(2)}₪</span> →
            بعد الخصم: <span className="text-orange-500">{parseFloat(form.discount_price).toFixed(2)}₪</span>
          </span>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onSave(catId, form)} className="flex-1 grad-brand text-white shadow-brand py-2.5 rounded-xl font-bold text-sm">
          {initial ? 'حفظ التعديلات' : 'إضافة الصنف'}
        </button>
        <button onClick={onCancel} className="flex-1 bg-white text-gray-600 border border-gray-200 py-2.5 rounded-xl font-bold text-sm">
          إلغاء
        </button>
      </div>
    </div>
  );
}

function ItemOptions({ itemId, options, onUpdate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name_ar: '', type: 'single', is_required: false, values: [{ name_ar: '', extra_price: '' }] });

  const addValue = () => setForm(f => ({ ...f, values: [...f.values, { name_ar: '', extra_price: '' }] }));
  const removeValue = (i) => setForm(f => ({ ...f, values: f.values.filter((_, idx) => idx !== i) }));

  const saveOption = async () => {
    if (!form.name_ar || !form.values[0]?.name_ar) return toast.error('أدخل اسم الإضافة وخيار واحد على الأقل');
    try {
      await api.post(`/menu/items/${itemId}/options`, {
        ...form,
        values: form.values.filter(v => v.name_ar).map(v => ({
          name_ar: v.name_ar, name_en: v.name_ar,
          extra_price: parseFloat(v.extra_price || 0)
        }))
      });
      toast.success('تم إضافة الإضافة');
      setShowAdd(false);
      setForm({ name_ar: '', type: 'single', is_required: false, values: [{ name_ar: '', extra_price: '' }] });
      onUpdate();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  return (
    <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-purple-700">الإضافات والخيارات</p>
        <button onClick={() => setShowAdd(!showAdd)}
          className="text-xs bg-purple-500 text-white px-3 py-1 rounded-lg font-bold">
          ➕ إضافة
        </button>
      </div>

      {options?.filter(o => o && o.id).map((opt, i) => (
        <div key={i} className="bg-white rounded-xl p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-800">{opt.name_ar}</p>
            <div className="flex gap-1">
              {opt.is_required && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">مطلوب</span>}
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{opt.type === 'single' ? 'اختيار واحد' : 'متعدد'}</span>
            </div>
          </div>
          {opt.values && Array.isArray(opt.values) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {opt.values.filter(v => v).map((v, j) => (
                <span key={j} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  {v.name_ar} {parseFloat(v.extra_price || 0) > 0 ? `+${parseFloat(v.extra_price).toFixed(2)}₪` : '(مجاناً)'}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <div className="bg-white rounded-xl p-3 space-y-3">
          <input className="w-full border border-gray-200 rounded-xl p-2.5 text-sm" placeholder="اسم الإضافة (مثال: الحجم، الإضافات...)"
            value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <select className="border border-gray-200 rounded-xl p-2.5 text-sm"
              value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="single">اختيار واحد</option>
              <option value="multiple">اختيار متعدد</option>
            </select>
            <label className="flex items-center gap-2 border border-gray-200 rounded-xl p-2.5 cursor-pointer">
              <input type="checkbox" checked={form.is_required}
                onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} />
              <span className="text-sm text-gray-700">مطلوب</span>
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-600">الخيارات:</p>
            {form.values.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className="flex-1 border border-gray-200 rounded-xl p-2.5 text-sm" placeholder="اسم الخيار"
                  value={v.name_ar} onChange={e => setForm(f => ({ ...f, values: f.values.map((vv, j) => j === i ? { ...vv, name_ar: e.target.value } : vv) }))} />
                <input className="w-20 border border-gray-200 rounded-xl p-2.5 text-sm" type="number" placeholder="0 = مجاناً"
                  value={v.extra_price} onChange={e => setForm(f => ({ ...f, values: f.values.map((vv, j) => j === i ? { ...vv, extra_price: e.target.value } : vv) }))} />
                {i > 0 && <button onClick={() => removeValue(i)} className="text-red-400 text-lg font-bold w-8 h-8 flex items-center justify-center">×</button>}
              </div>
            ))}
            <button onClick={addValue} className="text-purple-500 text-sm font-semibold">+ إضافة خيار آخر</button>
          </div>
          <div className="flex gap-2">
            <button onClick={saveOption} className="flex-1 bg-purple-500 text-white py-2.5 rounded-xl font-bold text-sm">حفظ</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm">إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
