import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff, FiChevronDown, FiSliders, FiImage, FiSearch, FiCheck, FiX, FiInfo,
} from 'react-icons/fi';
import { MdOutlineRestaurantMenu } from 'react-icons/md';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useRestaurant } from '../context/RestaurantContext';
import { PageHeader, EmptyState, ErrorState, ListSkeleton, Spinner, useConfirm } from '../components/ui';
import { arCount, num } from '../utils/format';

const ITEM_WORDS = ['صنف واحد', 'صنفان', 'أصناف', 'صنفًا'];
const CAT_WORDS = ['فئة واحدة', 'فئتان', 'فئات', 'فئة'];

const truthy = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';

// توحيد شكل المنيو (القائمة الكاملة أو القائمة العامة القديمة)
function normalizeMenu(cats) {
  return (cats || []).map(c => ({
    ...c,
    is_active: c.is_active == null ? true : truthy(c.is_active),
    items: (c.items || []).filter(Boolean).map(it => ({
      ...it,
      is_available: it.is_available == null ? true : truthy(it.is_available),
      options: (it.options || []).filter(o => o && o.id).map(o => ({
        ...o,
        is_required: truthy(o.is_required),
        values: (Array.isArray(o.values) ? o.values : []).filter(v => v && (v.id || v.name_ar)),
      })),
    })),
  }));
}

export default function Menu() {
  const { restaurant } = useRestaurant();
  const cacheKey = 'rest_menu_' + restaurant.id;
  const cachedMenu = readCache(cacheKey);
  const [categories, setCategories] = useState(cachedMenu || []);
  const [loading, setLoading] = useState(!cachedMenu);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fullMode, setFullMode] = useState(true); // false = السيرفر القديم (لا يعرض المخفي)
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [expandedCat, setExpandedCat] = useState(null);
  const [renaming, setRenaming] = useState(null); // {id, name}
  const [showAddItem, setShowAddItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showOptions, setShowOptions] = useState(null);
  const [query, setQuery] = useState('');
  const [dialog, confirm] = useConfirm();

  const fetchMenu = useCallback(async () => {
    if (!restaurant.id) { setLoading(false); return; }
    try {
      let menu;
      try {
        const r = await api.get(`/menu/restaurant/${restaurant.id}/manage`);
        menu = Array.isArray(r?.data) ? r.data : (r?.data?.menu || []);
        setFullMode(true);
      } catch (e) {
        if (e.status === 403 || e.status === 401) throw e;
        const r = await api.get(`/restaurants/${restaurant.id}`);
        menu = r?.data?.menu || [];
        setFullMode(false);
      }
      const norm = normalizeMenu(menu);
      setCategories(norm);
      writeCache(cacheKey, norm);
      setError(false);
    } catch (e) {
      if (!readCache(cacheKey)) setError(true);
      else toast.error(e.message || 'فشل تحميل المنيو');
    } finally { setLoading(false); setRefreshing(false); }
  }, [restaurant.id, cacheKey]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  const patchItem = (id, patch) => setCategories(cs => cs.map(c => ({ ...c, items: c.items.map(it => (it.id === id ? { ...it, ...patch } : it)) })));

  // ─── الفئات ───
  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return toast.error('اكتب اسم الفئة');
    try {
      await api.post('/menu/categories', { restaurant_id: restaurant.id, name_ar: name, name_en: name, sort_order: categories.length });
      toast.success('تمت إضافة الفئة');
      setNewCatName(''); setShowAddCat(false);
      fetchMenu();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  const saveCategory = async (cat, patch) => {
    try {
      await api.put(`/menu/categories/${cat.id}`, {
        name_ar: patch.name_ar ?? cat.name_ar,
        name_en: patch.name_en ?? cat.name_en ?? patch.name_ar ?? cat.name_ar,
        sort_order: cat.sort_order ?? 0,
        is_active: patch.is_active ?? cat.is_active ?? true,
      });
      setCategories(cs => cs.map(c => (c.id === cat.id ? { ...c, ...patch } : c)));
      return true;
    } catch (e) { toast.error(e.message || 'فشل حفظ الفئة'); return false; }
  };

  const renameCategory = async () => {
    const name = renaming?.name?.trim();
    if (!name) return toast.error('اسم الفئة مطلوب');
    const cat = categories.find(c => c.id === renaming.id);
    if (await saveCategory(cat, { name_ar: name, name_en: cat.name_en && cat.name_en !== cat.name_ar ? cat.name_en : name })) {
      toast.success('تم تغيير اسم الفئة');
      setRenaming(null);
    }
  };

  const toggleCategory = async (cat) => {
    if (await saveCategory(cat, { is_active: !cat.is_active })) {
      toast.success(cat.is_active ? 'تم إخفاء الفئة عن الزبائن' : 'الفئة ظاهرة للزبائن الآن');
    }
  };

  const deleteCategory = async (cat) => {
    const ok = await confirm({ title: `حذف فئة «${cat.name_ar}»؟`, message: `سيتم حذف الفئة و${arCount(cat.items.length, ITEM_WORDS)} بداخلها نهائيًا.`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    try { await api.delete(`/menu/categories/${cat.id}`); toast.success('تم حذف الفئة'); fetchMenu(); }
    catch (e) { toast.error(e.message || 'فشل'); }
  };

  // ─── الأصناف ───
  const addItem = async (catId, payload) => {
    try {
      await api.post('/menu/items', { ...payload, restaurant_id: restaurant.id, category_id: catId });
      toast.success('تمت إضافة الصنف');
      setShowAddItem(null);
      fetchMenu();
      return true;
    } catch (e) { toast.error(e.message || 'فشل'); return false; }
  };

  const updateItem = async (id, payload) => {
    try {
      await api.put(`/menu/items/${id}`, payload);
      toast.success('تم حفظ التعديلات');
      setEditItem(null);
      patchItem(id, payload);
      fetchMenu();
      return true;
    } catch (e) { toast.error(e.message || 'فشل'); return false; }
  };

  const deleteItem = async (item) => {
    const ok = await confirm({ title: `حذف «${item.name_ar}»؟`, message: 'سيُحذف الصنف وإضافاته نهائيًا. لإيقافه مؤقتًا استخدم زر الإخفاء بدلًا من الحذف.', confirmText: 'حذف', danger: true });
    if (!ok) return;
    try { await api.delete(`/menu/items/${item.id}`); toast.success('تم حذف الصنف'); fetchMenu(); }
    catch (e) { toast.error(e.message || 'فشل'); }
  };

  const toggleItem = async (item) => {
    const next = !item.is_available;
    patchItem(item.id, { is_available: next });
    try {
      const r = await api.patch(`/menu/items/${item.id}/toggle`);
      const value = r?.is_available ?? r?.data?.is_available;
      if (value != null) patchItem(item.id, { is_available: truthy(value) });
      toast.success(next ? 'الصنف ظاهر للزبائن' : 'تم إخفاء الصنف — يمكنك إظهاره في أي وقت');
      if (!fullMode && !next) toast('ملاحظة: الأصناف المخفية تظهر هنا بعد تحديث الخادم', { icon: 'ℹ️' });
    } catch (e) {
      patchItem(item.id, { is_available: item.is_available });
      toast.error(e.message || 'فشل');
    }
  };

  const q = query.trim();
  const visibleCats = useMemo(() => {
    if (!q) return categories;
    return categories.map(c => ({ ...c, items: c.items.filter(it => (it.name_ar || '').includes(q) || (it.description_ar || '').includes(q)) }))
      .filter(c => c.items.length || (c.name_ar || '').includes(q));
  }, [categories, q]);

  const totalItems = categories.reduce((s, c) => s + (c.items?.length || 0), 0);
  const hiddenItems = categories.reduce((s, c) => s + c.items.filter(i => !i.is_available).length, 0);

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {dialog}
      <PageHeader title="المنيو" icon={MdOutlineRestaurantMenu}
        subtitle={`${arCount(totalItems, ITEM_WORDS)} · ${arCount(categories.length, CAT_WORDS)}${hiddenItems ? ` · ${hiddenItems} مخفي` : ''}`}
        onRefresh={() => { setRefreshing(true); fetchMenu(); }} refreshing={refreshing}>
        <button onClick={() => setShowAddCat(s => !s)} className="btn-primary px-3.5" aria-label="إضافة فئة">
          <FiPlus aria-hidden /> فئة
        </button>
      </PageHeader>

      {!fullMode && (
        <div className="flex items-start gap-2 bg-sky-50 border border-sky-100 text-sky-800 rounded-2xl p-3 text-xs font-semibold">
          <FiInfo className="mt-0.5 flex-shrink-0" aria-hidden />
          يتم عرض الأصناف الظاهرة فقط حاليًا. ستظهر الأصناف المخفية هنا تلقائيًا بعد تحديث الخادم.
        </div>
      )}

      {showAddCat && (
        <div className="card p-3 space-y-2 animate-fade-up">
          <input className="input" placeholder="اسم الفئة (مثال: برجر، مشروبات…)" aria-label="اسم الفئة الجديدة"
            value={newCatName} onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
          <div className="flex gap-2">
            <button onClick={addCategory} className="btn-primary flex-1">إضافة الفئة</button>
            <button onClick={() => setShowAddCat(false)} className="btn-ghost px-4">إلغاء</button>
          </div>
        </div>
      )}

      {totalItems > 6 && (
        <div className="relative">
          <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
          <input className="input pr-10" placeholder="ابحث عن صنف…" value={query} onChange={e => setQuery(e.target.value)} aria-label="بحث في المنيو" />
        </div>
      )}

      {loading ? <ListSkeleton rows={5} />
        : error ? <ErrorState text="تعذّر تحميل المنيو" onRetry={fetchMenu} />
        : categories.length === 0 ? (
          <EmptyState icon={MdOutlineRestaurantMenu} title="ابدأ ببناء منيوك" text="أضف أول فئة (مثل: برجر، مشروبات) ثم أضف أصنافها"
            action={<button onClick={() => setShowAddCat(true)} className="btn-primary px-6 py-3"><FiPlus /> أضف أول فئة</button>} />
        ) : (
          <div className="space-y-3 stagger">
            {visibleCats.map((cat, ci) => {
              const open = expandedCat === cat.id || !!q;
              const count = cat.items?.length || 0;
              return (
                <section key={cat.id} className={`bg-white rounded-3xl shadow-soft overflow-hidden ${!cat.is_active ? 'opacity-80' : ''}`}>
                  {renaming?.id === cat.id ? (
                    <div className="flex items-center gap-2 p-3">
                      <input className="input flex-1" value={renaming.name} autoFocus aria-label="اسم الفئة"
                        onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renameCategory(); if (e.key === 'Escape') setRenaming(null); }} />
                      <button onClick={renameCategory} className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center" aria-label="حفظ الاسم"><FiCheck /></button>
                      <button onClick={() => setRenaming(null)} className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center" aria-label="إلغاء"><FiX /></button>
                    </div>
                  ) : (
                    <button type="button" className={`no-press w-full flex items-center gap-3 p-4 text-right ${open ? 'bg-brand-50/50' : ''}`}
                      onClick={() => setExpandedCat(open && !q ? null : cat.id)} aria-expanded={open}>
                      <div className="w-11 h-11 rounded-2xl grad-brand shadow-brand flex items-center justify-center text-white font-black flex-shrink-0">{ci + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-gray-900 text-base truncate flex items-center gap-2">
                          {cat.name_ar}
                          {!cat.is_active && <span className="chip bg-gray-100 text-gray-500"><FiEyeOff size={11} /> مخفية</span>}
                        </p>
                        <p className="text-xs text-gray-400">{arCount(count, ITEM_WORDS)}</p>
                      </div>
                      <span className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}><FiChevronDown aria-hidden /></span>
                    </button>
                  )}

                  {open && (
                    <div className="px-3 pb-3 space-y-2.5 animate-fade-up">
                      {showAddItem === cat.id ? (
                        <ItemForm onSave={(payload) => addItem(cat.id, payload)} onCancel={() => setShowAddItem(null)} />
                      ) : (
                        <button onClick={() => { setShowAddItem(cat.id); setEditItem(null); }}
                          className="w-full border-2 border-dashed border-brand-200 text-brand-600 rounded-2xl py-3 font-black text-sm hover:bg-brand-50 flex items-center justify-center gap-2">
                          <FiPlus aria-hidden /> أضف صنف جديد
                        </button>
                      )}

                      {count === 0 && showAddItem !== cat.id && (
                        <p className="text-center text-gray-400 text-sm py-3">لا أصناف بعد — اضغط «أضف صنف جديد»</p>
                      )}

                      {cat.items.map(item => (
                        editItem?.id === item.id ? (
                          <ItemForm key={item.id} initial={item} onSave={(payload) => updateItem(item.id, payload)} onCancel={() => setEditItem(null)} />
                        ) : (
                          <ItemRow key={item.id} item={item}
                            optionsOpen={showOptions === item.id}
                            onEdit={() => { setEditItem(item); setShowAddItem(null); }}
                            onToggle={() => toggleItem(item)}
                            onDelete={() => deleteItem(item)}
                            onOptions={() => setShowOptions(showOptions === item.id ? null : item.id)}
                            onOptionsChanged={fetchMenu}
                            confirm={confirm} />
                        )
                      ))}

                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setRenaming({ id: cat.id, name: cat.name_ar })} className="btn-ghost flex-1 text-xs py-2"><FiEdit2 size={13} /> تعديل الاسم</button>
                        <button onClick={() => toggleCategory(cat)} className="btn-ghost flex-1 text-xs py-2">
                          {cat.is_active ? <><FiEyeOff size={13} /> إخفاء الفئة</> : <><FiEye size={13} /> إظهار الفئة</>}
                        </button>
                        <button onClick={() => deleteCategory(cat)} className="btn-danger px-3 text-xs py-2" aria-label={`حذف فئة ${cat.name_ar}`}><FiTrash2 size={13} /></button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
            {q && visibleCats.length === 0 && <p className="text-center text-sm text-gray-400 py-6">لا نتائج لـ «{q}»</p>}
          </div>
        )}
    </div>
  );
}

function ItemRow({ item, optionsOpen, onEdit, onToggle, onDelete, onOptions, onOptionsChanged, confirm }) {
  const hasDiscount = item.discount_price != null && num(item.discount_price) > 0 && num(item.discount_price) < num(item.price);
  const optCount = item.options?.length || 0;
  return (
    <div className={`rounded-2xl p-3 border transition-colors ${item.is_available ? 'bg-gray-50/70 border-gray-100' : 'bg-gray-100 border-gray-200 border-dashed'}`}>
      <div className="flex gap-3">
        {item.image ? (
          <img src={item.image} className={`w-[72px] h-[72px] rounded-2xl object-cover flex-shrink-0 ${!item.is_available ? 'opacity-50 grayscale' : ''}`} alt="" loading="lazy" />
        ) : (
          <div className="w-[72px] h-[72px] rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0"><FiImage size={24} aria-hidden /></div>
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-black text-sm ${item.is_available ? 'text-gray-900' : 'text-gray-500'}`}>{item.name_ar}</p>
          {item.description_ar && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description_ar}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {hasDiscount ? (
              <>
                <span className="text-base font-black text-brand-600">{num(item.discount_price).toFixed(2)}₪</span>
                <span className="text-xs text-gray-400 line-through">{num(item.price).toFixed(2)}₪</span>
                <span className="chip bg-rose-50 text-rose-600">-{Math.round((1 - num(item.discount_price) / num(item.price)) * 100)}%</span>
              </>
            ) : (
              <span className="text-base font-black text-brand-600">{num(item.price).toFixed(2)}₪</span>
            )}
          </div>
        </div>
        <button onClick={onToggle} aria-pressed={!item.is_available} aria-label={item.is_available ? `إخفاء ${item.name_ar}` : `إظهار ${item.name_ar}`}
          className={`flex-shrink-0 self-start flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-black ${item.is_available ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-white text-gray-500 ring-1 ring-gray-300'}`}>
          {item.is_available ? <FiEye size={13} aria-hidden /> : <FiEyeOff size={13} aria-hidden />}
          {item.is_available ? 'ظاهر' : 'مخفي'}
        </button>
      </div>
      {!item.is_available && <p className="text-[11px] text-gray-500 mt-2">هذا الصنف مخفي عن الزبائن — اضغط «مخفي» لإظهاره مجددًا</p>}

      <div className="flex gap-2 mt-3">
        <button onClick={onEdit} className="btn-ghost flex-1 py-2 text-xs"><FiEdit2 size={13} aria-hidden /> تعديل</button>
        <button onClick={onOptions} aria-expanded={optionsOpen}
          className={`flex-1 py-2 text-xs ${optionsOpen ? 'btn-primary' : 'btn-ghost'}`}>
          <FiSliders size={13} aria-hidden /> الإضافات{optCount ? ` (${optCount})` : ''}
        </button>
        <button onClick={onDelete} className="btn-danger w-11 px-0 py-2" aria-label={`حذف ${item.name_ar}`}><FiTrash2 size={14} /></button>
      </div>

      {optionsOpen && (
        <div className="mt-2">
          <ItemOptions itemId={item.id} options={item.options || []} onUpdate={onOptionsChanged} confirm={confirm} />
        </div>
      )}
    </div>
  );
}

function validateItem(form) {
  if (!form.name_ar.trim()) return 'أدخل اسم الصنف';
  const price = parseFloat(form.price);
  if (!Number.isFinite(price) || price <= 0) return 'السعر يجب أن يكون رقمًا أكبر من صفر';
  if (String(form.discount_price).trim() !== '') {
    const d = parseFloat(form.discount_price);
    if (!Number.isFinite(d) || d <= 0) return 'سعر الخصم يجب أن يكون رقمًا أكبر من صفر';
    if (d >= price) return 'سعر الخصم يجب أن يكون أقل من السعر الأصلي';
  }
  return null;
}

function ItemForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name_ar: initial?.name_ar || '',
    description_ar: initial?.description_ar || '',
    price: initial?.price != null ? String(initial.price) : '',
    discount_price: initial?.discount_price != null && num(initial.discount_price) > 0 ? String(initial.discount_price) : '',
    image: initial?.image || '',
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const uploadImage = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('اختر ملف صورة');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      if (!r?.url) throw new Error();
      setForm(f => ({ ...f, image: r.url }));
      toast.success('تم رفع الصورة');
    } catch { toast.error('فشل رفع الصورة'); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    const err = validateItem(form);
    if (err) return toast.error(err);
    setSaving(true);
    const d = String(form.discount_price).trim();
    await onSave({
      name_ar: form.name_ar.trim(),
      description_ar: form.description_ar.trim() || null,
      price: parseFloat(form.price),
      discount_price: d ? parseFloat(d) : null,
      image: form.image || null,
    });
    setSaving(false);
  };

  const p = parseFloat(form.price); const d = parseFloat(form.discount_price);
  const showPreview = Number.isFinite(p) && Number.isFinite(d) && p > 0 && d > 0;

  return (
    <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4 space-y-3 animate-fade-up">
      <p className="text-sm font-black text-brand-700">{initial ? 'تعديل الصنف' : 'صنف جديد'}</p>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="رفع صورة الصنف"
          className="w-16 h-16 rounded-xl bg-white border-2 border-dashed border-brand-300 flex items-center justify-center overflow-hidden flex-shrink-0 text-brand-400">
          {uploading ? <Spinner size={20} className="text-brand-500" /> : form.image ? <img src={form.image} className="w-full h-full object-cover" alt="" /> : <FiImage size={22} />}
        </button>
        <div className="flex-1 flex gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-ghost flex-1 text-xs py-2">
            {uploading ? 'جاري الرفع…' : form.image ? 'تغيير الصورة' : 'رفع صورة الصنف'}
          </button>
          {form.image && !uploading && (
            <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))} className="btn-danger px-3 py-2" aria-label="إزالة الصورة"><FiX size={14} /></button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <div>
        <label className="label">اسم الصنف *</label>
        <input className="input" value={form.name_ar} onChange={set('name_ar')} placeholder="مثال: برجر كلاسيك" />
      </div>
      <div>
        <label className="label">وصف مختصر</label>
        <textarea className="input" rows={2} value={form.description_ar} onChange={set('description_ar')} placeholder="المكوّنات أو ما يميّز الصنف (اختياري)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">السعر (₪) *</label>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.5" placeholder="10.00" value={form.price} onChange={set('price')} />
        </div>
        <div>
          <label className="label">سعر بعد الخصم (₪)</label>
          <input className="input" type="number" inputMode="decimal" min="0" step="0.5" placeholder="بدون خصم" value={form.discount_price} onChange={set('discount_price')} />
        </div>
      </div>
      {showPreview && (
        d < p ? (
          <div className="bg-white border border-rose-100 rounded-xl p-2 text-center text-xs font-bold text-rose-600">
            خصم {Math.round((1 - d / p) * 100)}% · <span className="line-through text-gray-400">{p.toFixed(2)}₪</span> ← <span className="text-brand-600">{d.toFixed(2)}₪</span>
          </div>
        ) : (
          <p className="text-xs font-bold text-rose-600">سعر الخصم يجب أن يكون أقل من السعر الأصلي</p>
        )
      )}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving || uploading} className="btn-primary flex-1">
          {saving ? <Spinner size={15} /> : <FiCheck aria-hidden />} {initial ? 'حفظ التعديلات' : 'إضافة الصنف'}
        </button>
        <button onClick={onCancel} className="btn-ghost flex-1">إلغاء</button>
      </div>
    </div>
  );
}

// ─── مجموعات الإضافات (إضافة / تعديل / حذف المجموعة أو خيار) ───
const emptyGroup = () => ({ name_ar: '', type: 'single', is_required: false, max_selections: '', values: [{ name_ar: '', extra_price: '' }] });

function ItemOptions({ itemId, options, onUpdate, confirm }) {
  const [editing, setEditing] = useState(null); // 'new' | option id
  const [busy, setBusy] = useState(false);

  const groupPayload = (form) => {
    const values = form.values.filter(v => v.name_ar.trim()).map(v => ({
      ...(v.id ? { id: v.id } : {}),
      name_ar: v.name_ar.trim(), name_en: v.name_ar.trim(),
      extra_price: Math.max(0, parseFloat(v.extra_price) || 0),
    }));
    const multi = form.type === 'multiple';
    const max = multi ? (parseInt(form.max_selections) || values.length) : 1;
    return { name_ar: form.name_ar.trim(), name_en: form.name_ar.trim(), type: form.type, is_required: !!form.is_required, max_selections: Math.min(Math.max(1, max), Math.max(1, values.length)), values };
  };

  const validate = (form) => {
    if (!form.name_ar.trim()) return 'أدخل اسم مجموعة الإضافات';
    const vals = form.values.filter(v => v.name_ar.trim());
    if (!vals.length) return 'أضف خيارًا واحدًا على الأقل';
    if (vals.some(v => String(v.extra_price).trim() !== '' && (!Number.isFinite(parseFloat(v.extra_price)) || parseFloat(v.extra_price) < 0))) return 'سعر الإضافة لا يمكن أن يكون سالبًا';
    if (form.type === 'multiple' && String(form.max_selections).trim() !== '') {
      const m = parseInt(form.max_selections);
      if (!Number.isFinite(m) || m < 1) return 'الحد الأقصى للاختيارات يجب أن يكون 1 أو أكثر';
      if (m > vals.length) return 'الحد الأقصى أكبر من عدد الخيارات';
    }
    return null;
  };

  const recreate = async (opt, payload) => {
    // احتياط للسيرفر القديم (لا يوجد PUT): حذف المجموعة وإعادة إنشائها
    await api.post(`/menu/items/${itemId}/options`, { ...payload, values: payload.values.map(({ id, ...v }) => v) });
    await api.delete(`/menu/options/${opt.id}`);
  };

  const save = async (form, opt) => {
    const err = validate(form);
    if (err) return toast.error(err);
    const payload = groupPayload(form);
    setBusy(true);
    try {
      if (!opt) {
        await api.post(`/menu/items/${itemId}/options`, { ...payload, values: payload.values.map(({ id, ...v }) => v) });
        toast.success('تمت إضافة المجموعة');
      } else {
        try { await api.put(`/menu/options/${opt.id}`, payload); }
        catch (e) { if (e.status === 404) await recreate(opt, payload); else throw e; }
        toast.success('تم حفظ التعديلات');
      }
      setEditing(null);
      onUpdate();
    } catch (e) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setBusy(false); }
  };

  const deleteGroup = async (opt) => {
    const ok = await confirm({ title: `حذف مجموعة «${opt.name_ar}»؟`, message: 'ستُحذف المجموعة وكل خياراتها.', confirmText: 'حذف', danger: true });
    if (!ok) return;
    try { await api.delete(`/menu/options/${opt.id}`); toast.success('تم حذف المجموعة'); onUpdate(); }
    catch (e) { toast.error(e.message || 'فشل'); }
  };

  const deleteValue = async (opt, value) => {
    if (opt.values.length <= 1) return toast.error('المجموعة تحتاج خيارًا واحدًا على الأقل — احذف المجموعة بدلًا من ذلك');
    const ok = await confirm({ title: `حذف خيار «${value.name_ar}»؟`, confirmText: 'حذف', danger: true });
    if (!ok) return;
    try {
      try { await api.delete(`/menu/option-values/${value.id}`); }
      catch (e) {
        if (e.status !== 404) throw e;
        const form = { ...opt, max_selections: opt.max_selections, values: opt.values.filter(v => v.id !== value.id) };
        const payload = groupPayload({ ...form, values: form.values.map(v => ({ ...v, extra_price: v.extra_price ?? '' })) });
        try { await api.put(`/menu/options/${opt.id}`, payload); }
        catch (e2) { if (e2.status === 404) await recreate(opt, payload); else throw e2; }
      }
      toast.success('تم حذف الخيار');
      onUpdate();
    } catch (e) { toast.error(e.message || 'فشل'); }
  };

  return (
    <div className="bg-violet-50/70 border border-violet-100 rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-violet-700">الإضافات والخيارات</p>
        {editing !== 'new' && (
          <button onClick={() => setEditing('new')} className="btn bg-violet-500 text-white text-xs px-3 py-1.5"><FiPlus size={13} /> مجموعة</button>
        )}
      </div>

      {options.length === 0 && editing !== 'new' && (
        <p className="text-xs text-violet-500 py-2 text-center">لا توجد إضافات — مثال: «الحجم» أو «إضافات البرجر»</p>
      )}

      {options.map(opt => (
        editing === opt.id ? (
          <OptionForm key={opt.id} initial={opt} busy={busy} onSave={(f) => save(f, opt)} onCancel={() => setEditing(null)} />
        ) : (
          <div key={opt.id} className="bg-white rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-800 truncate">{opt.name_ar}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                {opt.is_required ? <span className="chip bg-rose-50 text-rose-600">مطلوب</span> : <span className="chip bg-gray-100 text-gray-500">اختياري</span>}
                <span className="chip bg-gray-100 text-gray-500">
                  {opt.type === 'multiple' ? `متعدد${opt.max_selections ? ` (حتى ${opt.max_selections})` : ''}` : 'اختيار واحد'}
                </span>
                <button onClick={() => setEditing(opt.id)} className="w-7 h-7 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center" aria-label={`تعديل ${opt.name_ar}`}><FiEdit2 size={13} /></button>
                <button onClick={() => deleteGroup(opt)} className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center" aria-label={`حذف ${opt.name_ar}`}><FiTrash2 size={13} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {opt.values.map((v, j) => (
                <span key={v.id || j} className="inline-flex items-center gap-1 text-xs bg-violet-100/70 text-violet-800 pr-2 pl-1 py-0.5 rounded-full">
                  {v.name_ar} <b className="font-bold">{num(v.extra_price) > 0 ? `+${num(v.extra_price).toFixed(2)}₪` : 'مجاناً'}</b>
                  {v.id && (
                    <button onClick={() => deleteValue(opt, v)} className="w-4 h-4 rounded-full hover:bg-violet-200 flex items-center justify-center" aria-label={`حذف خيار ${v.name_ar}`}><FiX size={10} /></button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )
      ))}

      {editing === 'new' && <OptionForm busy={busy} onSave={(f) => save(f, null)} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function OptionForm({ initial, busy, onSave, onCancel }) {
  const [form, setForm] = useState(() => initial ? {
    name_ar: initial.name_ar || '',
    type: initial.type === 'multiple' ? 'multiple' : 'single',
    is_required: !!initial.is_required,
    max_selections: initial.type === 'multiple' && initial.max_selections ? String(initial.max_selections) : '',
    values: initial.values.length ? initial.values.map(v => ({ id: v.id, name_ar: v.name_ar || '', extra_price: num(v.extra_price) ? String(v.extra_price) : '' })) : [{ name_ar: '', extra_price: '' }],
  } : emptyGroup());

  const setVal = (i, patch) => setForm(f => ({ ...f, values: f.values.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  return (
    <div className="bg-white rounded-xl p-3 space-y-3 animate-fade-up">
      <div>
        <label className="label">اسم المجموعة</label>
        <input className="input" placeholder="مثال: الحجم، الإضافات، نوع الخبز" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className="input" aria-label="نوع الاختيار" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          <option value="single">اختيار واحد</option>
          <option value="multiple">اختيار متعدد</option>
        </select>
        <label className="flex items-center gap-2 border-[1.5px] border-gray-200 rounded-xl px-3 cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-brand-500" checked={form.is_required} onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} />
          <span className="text-sm text-gray-700 font-semibold">إجباري</span>
        </label>
      </div>
      {form.type === 'multiple' && (
        <div>
          <label className="label">الحد الأقصى للاختيارات</label>
          <input className="input" type="number" min="1" inputMode="numeric" placeholder="فارغ = بلا حد (كل الخيارات)"
            value={form.max_selections} onChange={e => setForm(f => ({ ...f, max_selections: e.target.value }))} />
        </div>
      )}
      <div className="space-y-2">
        <p className="label">الخيارات (السعر الإضافي — فارغ = مجاناً)</p>
        {form.values.map((v, i) => (
          <div key={v.id || `n${i}`} className="flex gap-2 items-center">
            <input className="input flex-1" placeholder="اسم الخيار" aria-label="اسم الخيار" value={v.name_ar} onChange={e => setVal(i, { name_ar: e.target.value })} />
            <input className="input w-24" type="number" min="0" step="0.5" inputMode="decimal" placeholder="0" aria-label="السعر الإضافي" value={v.extra_price} onChange={e => setVal(i, { extra_price: e.target.value })} />
            <button onClick={() => setForm(f => ({ ...f, values: f.values.filter((_, j) => j !== i) }))} disabled={form.values.length <= 1}
              className="w-9 h-9 rounded-lg text-rose-500 hover:bg-rose-50 flex items-center justify-center disabled:opacity-30" aria-label="حذف الخيار"><FiX /></button>
          </div>
        ))}
        <button onClick={() => setForm(f => ({ ...f, values: [...f.values, { name_ar: '', extra_price: '' }] }))} className="text-violet-600 text-sm font-bold flex items-center gap-1"><FiPlus size={14} /> خيار آخر</button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave(form)} disabled={busy} className="btn flex-1 bg-violet-500 text-white">{busy ? <Spinner size={14} /> : <FiCheck />} حفظ</button>
        <button onClick={onCancel} className="btn-ghost flex-1">إلغاء</button>
      </div>
    </div>
  );
}
