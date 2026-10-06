import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  FiPlus, FiEdit2, FiTrash2, FiEye, FiEyeOff, FiChevronDown, FiSliders, FiImage, FiSearch, FiCheck, FiX, FiInfo,
  FiUploadCloud, FiLayers, FiTag, FiGrid,
} from 'react-icons/fi';
import { MdOutlineRestaurantMenu } from 'react-icons/md';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useRestaurant } from '../context/RestaurantContext';
import { PageHeader, EmptyState, ErrorState, ListSkeleton, Spinner, useConfirm, Sheet, Button, Toggle, Tabs, cx } from '../components/ui';
import { num } from '../utils/format';
import { pl } from '../utils/plural';
import { compressImage, uploadErrorMessage } from '../utils/image';

// عدد الأصناف/الفئات بصيغة عربية صحيحة (0 → «لا أصناف»)
const itemsCount = (n) => (n ? pl(n, 'item') : 'لا أصناف');
const catsCount = (n) => (n ? pl(n, 'category') : 'لا فئات');
// قسم «بدون قسم» (أصناف بلا فئة يرسلها السيرفر بـ id = null) — مفتاح ثابت يسمح بفتحه وإغلاقه
const ORPHAN_KEY = '__orphan__';
const catKey = (c) => (c.id == null ? ORPHAN_KEY : c.id);

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
  // قراءة الكاش مرة واحدة فقط (لا مع كل حرف في البحث)
  const [categories, setCategories] = useState(() => readCache(cacheKey) || []);
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fullMode, setFullMode] = useState(true); // false = السيرفر القديم (لا يعرض المخفي)
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [expandedCat, setExpandedCat] = useState(null);
  const [renaming, setRenaming] = useState(null); // {id, name}
  const [showAddItem, setShowAddItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showOptions, setShowOptions] = useState(null);
  const [editorSession, setEditorSession] = useState(0); // يتغير مع كل فتح للمحرر → نموذج جديد نظيف
  const [togglingIds, setTogglingIds] = useState(() => new Set());
  const addingCatRef = useRef(false);
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
        // القائمة العامة (بدون المخفي) فقط لسيرفر قديم لا يعرف /manage — أي خطأ آخر لا يبدّل العرض ولا يكتب فوق الكاش
        if (e.status !== 404) throw e;
        const r = await api.get(`/restaurants/${restaurant.id}`);
        menu = r?.data?.menu || [];
        setFullMode(false);
      }
      const norm = normalizeMenu(menu);
      setCategories(norm);
      writeCache(cacheKey, norm);
      setError(false);
      return norm;
    } catch (e) {
      if (!readCache(cacheKey)) setError(true);
      else toast.error(e.message || 'فشل تحميل المنيو — نعرض آخر نسخة محفوظة');
      return null;
    } finally { setLoading(false); setRefreshing(false); }
  }, [restaurant.id, cacheKey]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);
  // افتح أول فئة تلقائيًا لعرض فوري
  useEffect(() => { if (expandedCat == null && categories.length) setExpandedCat(catKey(categories[0])); }, [categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchItem = (id, patch) => setCategories(cs => cs.map(c => ({ ...c, items: c.items.map(it => (it.id === id ? { ...it, ...patch } : it)) })));

  // ─── الفئات ───
  const addCategory = async () => {
    if (addingCatRef.current) return; // Enter مرتين لا يكرر الفئة
    const name = newCatName.trim();
    if (!name) return toast.error('اكتب اسم الفئة');
    addingCatRef.current = true;
    setAddingCat(true);
    try {
      const r = await api.post('/menu/categories', { restaurant_id: restaurant.id, name_ar: name, name_en: name, sort_order: categories.filter(c => c.id != null).length });
      toast.success('تمت إضافة الفئة');
      setNewCatName(''); setShowAddCat(false);
      const newId = r?.data?.id;
      const menu = await fetchMenu();
      // افتح الفئة الجديدة وانزل لها مباشرة لإضافة أصنافها
      const created = newId != null ? (menu || []).find(c => String(c.id) === String(newId)) : null;
      if (created) {
        setQuery('');
        setExpandedCat(created.id);
        setTimeout(() => document.getElementById(`cat-${created.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
      }
    } catch (e) { toast.error(e.message || 'فشل'); }
    finally { addingCatRef.current = false; setAddingCat(false); }
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

  const deleteCategory = async (shownCat) => {
    // أثناء البحث الفئة المعروضة مفلترة — نعدّ أصنافها من الفئة الكاملة
    const cat = categories.find(c => c.id === shownCat.id) || shownCat;
    const n = cat.items?.length || 0;
    const message = n
      ? `سيتم حذف الفئة و${n === 1 ? 'الصنف الوحيد' : pl(n, 'item')} بداخلها نهائيًا.`
      : 'الفئة فارغة — سيتم حذفها نهائيًا.';
    const ok = await confirm({ title: `حذف فئة «${cat.name_ar}»؟`, message, confirmText: 'حذف', danger: true });
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
    if (togglingIds.has(item.id)) return;
    const next = !item.is_available;
    patchItem(item.id, { is_available: next });
    setTogglingIds(s => new Set(s).add(item.id));
    try {
      const r = await api.patch(`/menu/items/${item.id}/toggle`);
      const value = r?.is_available ?? r?.data?.is_available;
      if (value != null) patchItem(item.id, { is_available: truthy(value) });
      toast.success(next ? 'الصنف ظاهر للزبائن' : 'تم إخفاء الصنف — يمكنك إظهاره في أي وقت');
      if (!fullMode && !next) toast('ملاحظة: الأصناف المخفية تظهر هنا بعد تحديث الخادم', { icon: 'ℹ️' });
    } catch (e) {
      patchItem(item.id, { is_available: item.is_available });
      toast.error(e.message || 'فشل');
    } finally {
      setTogglingIds(s => { const n = new Set(s); n.delete(item.id); return n; });
    }
  };

  const openEditor = (mode, value) => {
    setEditorSession(x => x + 1);
    if (mode === 'new') { setShowAddItem(value); setEditItem(null); }
    else { setEditItem(value); setShowAddItem(null); }
  };

  const q = query.trim();
  const visibleCats = useMemo(() => {
    if (!q) return categories;
    return categories.map(c => ({ ...c, items: c.items.filter(it => (it.name_ar || '').includes(q) || (it.description_ar || '').includes(q)) }))
      .filter(c => c.items.length || (c.name_ar || '').includes(q));
  }, [categories, q]);

  const totalItems = categories.reduce((s, c) => s + (c.items?.length || 0), 0);
  const hiddenItems = categories.reduce((s, c) => s + c.items.filter(i => !i.is_available).length, 0);

  // محرر الصنف (إضافة/تعديل) — نحتفظ بآخر حالة أثناء حركة الإغلاق
  const editorNow = showAddItem != null ? { mode: 'new', catId: showAddItem } : editItem ? { mode: 'edit', item: editItem } : null;
  const lastEditor = useRef(null);
  if (editorNow) lastEditor.current = editorNow;
  const editor = editorNow || lastEditor.current;

  const optionsItemNow = showOptions != null ? categories.flatMap(c => c.items).find(i => i.id === showOptions) : null;
  const lastOptItem = useRef(null);
  if (optionsItemNow) lastOptItem.current = optionsItemNow;
  const optionsItem = optionsItemNow || lastOptItem.current;

  return (
    <div className="space-y-4" dir="rtl">
      {dialog}
      <PageHeader title="المنيو" icon={MdOutlineRestaurantMenu}
        subtitle={`${itemsCount(totalItems)} · ${catsCount(categories.filter(c => c.id != null).length)}`}
        onRefresh={() => { setRefreshing(true); fetchMenu(); }} refreshing={refreshing}>
        <button onClick={() => setShowAddCat(true)} className="btn-primary px-3.5" aria-label="إضافة فئة">
          <FiPlus aria-hidden /> <span>فئة</span>
        </button>
      </PageHeader>

      {!loading && !error && categories.length > 0 && (
        <div className="grid grid-cols-3 gap-2 lg:gap-3 stagger">
          <MiniStat icon={FiLayers} label="الفئات" value={categories.filter(c => c.id != null).length} />
          <MiniStat icon={FiGrid} label="الأصناف" value={totalItems} />
          <MiniStat icon={FiEyeOff} label="مخفي" value={hiddenItems} tone={hiddenItems ? 'amber' : 'gray'} />
        </div>
      )}

      {!fullMode && (
        <div className="flex items-start gap-2 bg-info-soft border border-info/15 text-sky-800 rounded-[18px] p-3 text-xs font-semibold">
          <FiInfo className="mt-0.5 flex-shrink-0" aria-hidden />
          يتم عرض الأصناف الظاهرة فقط حاليًا. ستظهر الأصناف المخفية هنا تلقائيًا بعد تحديث الخادم.
        </div>
      )}

      {totalItems > 6 && (
        <div className="relative">
          <FiSearch className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" aria-hidden />
          <input className="input ps-11 pe-11 shadow-soft" placeholder="ابحث عن صنف…" value={query} onChange={e => setQuery(e.target.value)} aria-label="بحث في المنيو" />
          {query && <button onClick={() => setQuery('')} className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full hover:bg-surface text-ink-3 flex items-center justify-center" aria-label="مسح البحث"><FiX size={15} /></button>}
        </div>
      )}

      {loading ? <ListSkeleton rows={5} />
        : error ? <ErrorState text="تعذّر تحميل المنيو" onRetry={fetchMenu} />
        : categories.length === 0 ? (
          <EmptyState icon={MdOutlineRestaurantMenu} title="ابدأ ببناء منيوك" text="أضف أول فئة (مثل: برجر، مشروبات) ثم أضف أصنافها"
            action={<button onClick={() => setShowAddCat(true)} className="btn-primary px-6 h-12"><FiPlus /> أضف أول فئة</button>} />
        ) : (
          <div className="space-y-3 stagger">
            {visibleCats.map((cat, ci) => {
              const key = catKey(cat);
              const orphan = cat.id == null;
              const open = expandedCat === key || !!q;
              const count = cat.items?.length || 0;
              const hidden = cat.items.filter(i => !i.is_available).length;
              return (
                <section key={key} id={orphan ? undefined : `cat-${cat.id}`} className={cx('card overflow-hidden transition-shadow scroll-mt-24', open && 'shadow-card', !cat.is_active && 'opacity-80')}>
                  {renaming?.id === cat.id ? (
                    <div className="flex items-center gap-2 p-3">
                      <input className="input flex-1" value={renaming.name} autoFocus aria-label="اسم الفئة"
                        onChange={e => setRenaming({ ...renaming, name: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') renameCategory(); if (e.key === 'Escape') setRenaming(null); }} />
                      <button onClick={renameCategory} className="w-12 h-12 rounded-[14px] bg-success text-white flex items-center justify-center" aria-label="حفظ الاسم"><FiCheck size={18} /></button>
                      <button onClick={() => setRenaming(null)} className="w-12 h-12 rounded-[14px] bg-surface text-ink-2 flex items-center justify-center" aria-label="إلغاء"><FiX size={18} /></button>
                    </div>
                  ) : (
                    <button type="button" className={cx('no-press w-full flex items-center gap-3 p-4 text-right', open ? 'bg-gradient-to-l from-brand-50/80 to-transparent' : 'hover:bg-surface/60')}
                      onClick={() => setExpandedCat(open && !q ? null : key)} aria-expanded={open}>
                      <div className={cx('w-11 h-11 rounded-[14px] flex items-center justify-center font-black flex-shrink-0 tnum transition-all duration-300',
                        open ? 'grad-brand text-white shadow-brand' : 'bg-brand-50 text-brand-600')}>{orphan ? <FiInfo aria-hidden /> : ci + 1}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-ink text-[16px] flex items-center gap-2 min-w-0">
                          <span className="truncate min-w-0">{cat.name_ar}</span>
                          {!cat.is_active && <span className="chip bg-gray-100 text-ink-2 flex-shrink-0"><FiEyeOff size={11} aria-hidden /> مخفية</span>}
                        </p>
                        <p className="text-[12px] text-ink-3 mt-0.5">{itemsCount(count)}{hidden ? ` · مخفي: ${hidden}` : ''}{orphan ? ' · أصناف بلا فئة' : ''}</p>
                      </div>
                      <span className={cx('w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300', open ? 'rotate-180 bg-white text-brand-600 shadow-soft' : 'bg-surface text-ink-3')}><FiChevronDown aria-hidden /></span>
                    </button>
                  )}

                  <div className={cx('collapse-grid', open && 'open')}>
                    <div>
                      <div className="px-3 pb-3 lg:px-4 lg:pb-4 pt-1">
                        {/* أدوات الفئة — قسم «بدون قسم» ليس فئة حقيقية: لا تعديل ولا حذف ولا إضافة */}
                        {orphan ? (
                          <p className="text-[12px] text-ink-3 bg-surface rounded-[12px] px-3 py-2 mb-3 flex items-start gap-1.5"><FiInfo className="mt-0.5 flex-shrink-0" aria-hidden /> أصناف فئتها محذوفة — عدّلها أو احذفها من هنا، أو أنشئ فئة جديدة وأضف الأصناف إليها.</p>
                        ) : (
                        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                          <button onClick={() => setRenaming({ id: cat.id, name: cat.name_ar })} className="btn h-9 px-3 text-xs bg-surface text-ink-2 hover:bg-gray-200" tabIndex={open ? 0 : -1}><FiEdit2 size={13} /> تعديل الاسم</button>
                          <button onClick={() => toggleCategory(cat)} className="btn h-9 px-3 text-xs bg-surface text-ink-2 hover:bg-gray-200" tabIndex={open ? 0 : -1}>
                            {cat.is_active ? <><FiEyeOff size={13} /> إخفاء الفئة</> : <><FiEye size={13} /> إظهار الفئة</>}
                          </button>
                          <button onClick={() => deleteCategory(cat)} className="btn h-9 px-3 text-xs bg-danger-soft text-danger hover:bg-danger/10 ms-auto" tabIndex={open ? 0 : -1} aria-label={`حذف فئة ${cat.name_ar}`}><FiTrash2 size={13} /> حذف</button>
                        </div>
                        )}

                        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                          {cat.items.map(item => (
                            <ItemCard key={item.id} item={item} tabIndex={open ? 0 : -1} toggling={togglingIds.has(item.id)}
                              onEdit={() => openEditor('edit', item)}
                              onToggle={() => toggleItem(item)}
                              onDelete={() => deleteItem(item)}
                              onOptions={() => setShowOptions(item.id)} />
                          ))}
                          {!orphan && <button onClick={() => openEditor('new', cat.id)} tabIndex={open ? 0 : -1}
                            className={cx('rounded-[18px] border-2 border-dashed border-brand-200 text-brand-600 font-extrabold text-sm hover:bg-brand-50 hover:border-brand-300 flex items-center justify-center gap-2',
                              count === 0 ? 'py-8 sm:col-span-2 xl:col-span-3 flex-col' : 'min-h-[64px] py-4')}>
                            <span className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center"><FiPlus aria-hidden /></span>
                            أضف صنف جديد
                            {count === 0 && <span className="text-[12px] font-bold text-ink-3">لا أصناف بعد في هذه الفئة</span>}
                          </button>}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
            {q && visibleCats.length === 0 && <EmptyState compact icon={FiSearch} title={`لا نتائج لـ «${q}»`} text="جرّب كلمة أخرى" />}
          </div>
        )}

      {/* فئة جديدة */}
      <Sheet open={showAddCat} onClose={() => setShowAddCat(false)} title="فئة جديدة" subtitle="مثال: برجر، مشروبات، حلويات" size="sm"
        footer={<div className="flex gap-2"><Button loading={addingCat} onClick={addCategory} icon={FiCheck} className="flex-1 h-12">إضافة الفئة</Button><button onClick={() => setShowAddCat(false)} className="btn-ghost h-12 px-5">إلغاء</button></div>}>
        <label className="label" htmlFor="new-cat">اسم الفئة</label>
        <input id="new-cat" className="input h-[52px]" placeholder="اسم الفئة" value={newCatName} onChange={e => setNewCatName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCategory()} autoFocus />
      </Sheet>

      {/* محرر الصنف */}
      {editor && (
        <ItemEditorSheet key={`${editor.mode === 'new' ? `new-${editor.catId}` : `edit-${editor.item.id}`}-${editorSession}`}
          open={!!editorNow}
          initial={editor.mode === 'edit' ? editor.item : null}
          onSave={(payload) => (editor.mode === 'new' ? addItem(editor.catId, payload) : updateItem(editor.item.id, payload))}
          onClose={() => { setShowAddItem(null); setEditItem(null); }} />
      )}

      {/* الإضافات */}
      {optionsItem && (
        <Sheet open={!!optionsItemNow} onClose={() => setShowOptions(null)} size="lg"
          title={`الإضافات · ${optionsItem.name_ar}`} subtitle="مجموعات مثل «الحجم» أو «إضافات البرجر» يختار منها الزبون">
          <ItemOptions itemId={optionsItem.id} options={optionsItem.options || []} onUpdate={fetchMenu} confirm={confirm} />
        </Sheet>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, tone = 'brand' }) {
  const t = tone === 'amber' ? 'bg-warning-soft text-amber-600' : tone === 'gray' ? 'bg-surface text-ink-3' : 'bg-brand-50 text-brand-600';
  return (
    <div className="card p-3 flex items-center gap-2.5 max-sm:flex-col max-sm:items-start max-sm:gap-2">
      <span className={cx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', t)}><Icon size={16} aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-lg font-extrabold text-ink leading-none tnum">{value}</p>
        <p className="text-[11px] font-bold text-ink-3 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

function ItemCard({ item, onEdit, onToggle, onDelete, onOptions, tabIndex, toggling = false }) {
  const hasDiscount = item.discount_price != null && num(item.discount_price) > 0 && num(item.discount_price) < num(item.price);
  const optCount = item.options?.length || 0;
  return (
    <div className={cx('rounded-[18px] p-3 border transition-all duration-200 flex flex-col',
      item.is_available ? 'bg-white border-surface-line hover:shadow-card hover:border-brand-100' : 'bg-surface/70 border-dashed border-gray-300')}>
      <div className="flex gap-3">
        <div className="relative flex-shrink-0">
          {item.image ? (
            <img src={item.image} className={cx('w-[76px] h-[76px] rounded-[14px] object-cover bg-surface', !item.is_available && 'opacity-50 grayscale')} alt="" loading="lazy" width="76" height="76" />
          ) : (
            <div className="w-[76px] h-[76px] rounded-[14px] bg-gradient-to-br from-brand-50 to-surface flex items-center justify-center text-brand-300"><FiImage size={24} aria-hidden /></div>
          )}
          {hasDiscount && <span className="absolute -top-1.5 -start-1.5 chip bg-coral text-white shadow-soft tnum">-{Math.round((1 - num(item.discount_price) / num(item.price)) * 100)}%</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={cx('font-extrabold text-[14.5px] leading-snug', item.is_available ? 'text-ink' : 'text-ink-3')}>{item.name_ar}</p>
            <Toggle checked={item.is_available} onChange={onToggle} busy={toggling} label={item.is_available ? `إخفاء ${item.name_ar}` : `إظهار ${item.name_ar}`} tone="emerald" className="mt-0.5 me-1" />
          </div>
          {item.description_ar && <p className="text-[12px] text-ink-3 mt-0.5 line-clamp-2 leading-relaxed">{item.description_ar}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {hasDiscount ? (
              <>
                <span className="text-[15px] font-black text-brand-600 tnum">{num(item.discount_price).toFixed(2)}₪</span>
                <span className="text-xs text-ink-3 line-through tnum">{num(item.price).toFixed(2)}₪</span>
              </>
            ) : (
              <span className="text-[15px] font-black text-brand-600 tnum">{num(item.price).toFixed(2)}₪</span>
            )}
            {!item.is_available && <span className="chip bg-gray-200 text-ink-2"><FiEyeOff size={11} /> مخفي</span>}
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 mt-3 pt-3 border-t border-surface-line">
        <button onClick={onEdit} tabIndex={tabIndex} className="btn h-9 flex-1 text-xs bg-surface text-ink-2 hover:bg-brand-50 hover:text-brand-700"><FiEdit2 size={13} aria-hidden /> تعديل</button>
        <button onClick={onOptions} tabIndex={tabIndex} className="btn h-9 flex-1 text-xs bg-surface text-ink-2 hover:bg-violet-50 hover:text-violet-700">
          <FiSliders size={13} aria-hidden /> الإضافات{optCount ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-violet-500 text-white text-[10px] font-black flex items-center justify-center tnum">{optCount}</span> : null}
        </button>
        <button onClick={onDelete} tabIndex={tabIndex} className="btn h-9 w-10 px-0 bg-surface text-ink-3 hover:bg-danger-soft hover:text-danger" aria-label={`حذف ${item.name_ar}`}><FiTrash2 size={14} /></button>
      </div>
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

function MoneyInput({ id, value, onChange, placeholder, ...rest }) {
  return (
    <div className="relative">
      <input id={id} className="input pe-10 tnum" type="number" inputMode="decimal" min="0" step="0.5" placeholder={placeholder} value={value} onChange={onChange} {...rest} />
      <span className="absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-3 font-bold pointer-events-none">₪</span>
    </div>
  );
}

function ItemEditorSheet({ open, initial, onSave, onClose }) {
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
      const small = await compressImage(file, { maxPx: 1600 });
      const fd = new FormData();
      fd.append('file', small, small.name || file.name || 'image.jpg');
      const r = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      if (!r?.url) throw new Error('لم يُرجع الخادم رابط الصورة');
      setForm(f => ({ ...f, image: r.url }));
      toast.success('تم رفع الصورة');
    } catch (e) { toast.error(uploadErrorMessage(e)); }
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
    <Sheet open={open} onClose={onClose} size="md" title={initial ? 'تعديل الصنف' : 'صنف جديد'} subtitle={initial ? initial.name_ar : 'أضف صورة جذابة واسمًا واضحًا وسعرًا'}
      footer={(
        <div className="flex gap-2">
          <Button onClick={submit} loading={saving} disabled={uploading} icon={FiCheck} className="flex-1 h-12">{initial ? 'حفظ التعديلات' : 'إضافة الصنف'}</Button>
          <button onClick={onClose} className="btn-ghost h-12 px-5">إلغاء</button>
        </div>
      )}>
      <div className="space-y-4">
        {/* صورة الصنف مع معاينة */}
        <div>
          <p className="label">صورة الصنف</p>
          <div className="relative group">
            <button type="button" onClick={() => fileInputRef.current?.click()} aria-label={form.image ? 'تغيير صورة الصنف' : 'رفع صورة الصنف'}
              className={cx('no-press w-full aspect-[16/9] rounded-[20px] overflow-hidden flex flex-col items-center justify-center gap-2 transition-colors',
                form.image ? 'bg-surface' : 'border-2 border-dashed border-brand-200 bg-brand-50/50 hover:bg-brand-50 hover:border-brand-300 text-brand-500')}>
              {form.image ? (
                <img src={form.image} className="w-full h-full object-cover" alt="معاينة صورة الصنف" />
              ) : (
                <>
                  <span className="w-14 h-14 rounded-[18px] bg-white shadow-soft flex items-center justify-center"><FiUploadCloud size={26} aria-hidden /></span>
                  <span className="font-extrabold text-sm">اضغط لرفع صورة</span>
                  <span className="text-[11.5px] text-ink-3 font-bold">صورة أفقية واضحة تزيد الطلبات</span>
                </>
              )}
            </button>
            {uploading && (
              <div className="absolute inset-0 rounded-[20px] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-brand-600 animate-fade-in">
                <Spinner size={26} /> <span className="text-sm font-extrabold">جاري الرفع…</span>
              </div>
            )}
            {form.image && !uploading && (
              <div className="absolute bottom-2.5 inset-x-2.5 flex gap-2 justify-end">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn h-9 px-3 text-xs glass-light text-ink shadow-soft"><FiImage size={13} aria-hidden /> تغيير</button>
                <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))} className="btn h-9 px-3 text-xs bg-danger text-white shadow-soft" aria-label="إزالة الصورة"><FiX size={14} /> إزالة</button>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { uploadImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <div>
          <label className="label" htmlFor="it-name">اسم الصنف <span className="text-coral">*</span></label>
          <input id="it-name" className="input" value={form.name_ar} onChange={set('name_ar')} placeholder="مثال: برجر كلاسيك" />
        </div>
        <div>
          <label className="label" htmlFor="it-desc">وصف مختصر</label>
          <textarea id="it-desc" className="input" rows={2} value={form.description_ar} onChange={set('description_ar')} placeholder="المكوّنات أو ما يميّز الصنف (اختياري)" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="it-price">السعر <span className="text-coral">*</span></label>
            <MoneyInput id="it-price" placeholder="10.00" value={form.price} onChange={set('price')} />
          </div>
          <div>
            <label className="label" htmlFor="it-disc">سعر بعد الخصم</label>
            <MoneyInput id="it-disc" placeholder="بدون خصم" value={form.discount_price} onChange={set('discount_price')} />
          </div>
        </div>
        {showPreview && (
          d < p ? (
            <div className="rounded-[14px] bg-gradient-to-l from-coral-50 to-brand-50 border border-coral/15 p-3 flex items-center justify-between gap-2 animate-fade-up">
              <span className="chip bg-coral text-white text-[12px] py-1 px-2.5"><FiTag size={12} aria-hidden /> خصم {Math.round((1 - d / p) * 100)}%</span>
              <span className="text-sm font-bold tnum"><span className="line-through text-ink-3">{p.toFixed(2)}₪</span> <span className="text-ink-3">←</span> <span className="text-brand-600 font-black text-base">{d.toFixed(2)}₪</span></span>
            </div>
          ) : (
            <p className="text-xs font-bold text-danger flex items-center gap-1.5"><FiInfo aria-hidden /> سعر الخصم يجب أن يكون أقل من السعر الأصلي</p>
          )
        )}
      </div>
    </Sheet>
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
    const minMax = multi ? 2 : 1;
    return { name_ar: form.name_ar.trim(), name_en: form.name_ar.trim(), type: form.type, is_required: !!form.is_required, max_selections: Math.min(Math.max(minMax, max), Math.max(minMax, values.length)), values };
  };

  const validate = (form) => {
    if (!form.name_ar.trim()) return 'أدخل اسم مجموعة الإضافات';
    const vals = form.values.filter(v => v.name_ar.trim());
    if (!vals.length) return 'أضف خيارًا واحدًا على الأقل';
    if (vals.some(v => String(v.extra_price).trim() !== '' && (!Number.isFinite(parseFloat(v.extra_price)) || parseFloat(v.extra_price) < 0))) return 'سعر الإضافة لا يمكن أن يكون سالبًا';
    if (form.type === 'multiple') {
      // «متعدد» بحد أقصى 1 = «اختيار واحد» فعليًا (والسيرفر كان يغيّره لكل الخيارات بصمت)
      if (vals.length < 2) return 'الاختيار المتعدد يحتاج خيارين على الأقل — أو اختر «اختيار واحد»';
      if (String(form.max_selections).trim() !== '') {
        const m = parseInt(form.max_selections);
        if (!Number.isFinite(m) || m < 1) return 'الحد الأقصى للاختيارات يجب أن يكون 2 أو أكثر';
        if (m === 1) return 'حد أقصى 1 يعني اختيارًا واحدًا — اختر «اختيار واحد» أو اجعل الحد 2 أو أكثر';
        if (m > vals.length) return 'الحد الأقصى أكبر من عدد الخيارات';
      }
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
    <div className="space-y-3">
      {options.length === 0 && editing !== 'new' && (
        <EmptyState compact icon={FiSliders} title="لا توجد إضافات بعد" text="مثال: «الحجم» (صغير/وسط/كبير) أو «إضافات البرجر» (جبنة، بيض…)"
          action={<button onClick={() => setEditing('new')} className="btn bg-violet-500 text-white h-11 px-5 shadow-[0_10px_22px_rgba(139,92,246,.25)]"><FiPlus /> أضف أول مجموعة</button>} />
      )}

      {options.map(opt => (
        editing === opt.id ? (
          <OptionForm key={opt.id} initial={opt} busy={busy} onSave={(f) => save(f, opt)} onCancel={() => setEditing(null)} />
        ) : (
          <div key={opt.id} className="rounded-[18px] border border-surface-line bg-white p-3.5 animate-fade-up">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-ink truncate">{opt.name_ar}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {opt.is_required ? <span className="chip bg-danger-soft text-danger">إجباري</span> : <span className="chip bg-gray-100 text-ink-2">اختياري</span>}
                  <span className="chip bg-violet-50 text-violet-700">
                    {opt.type === 'multiple' ? `متعدد${opt.max_selections ? ` (حتى ${opt.max_selections})` : ''}` : 'اختيار واحد'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setEditing(opt.id)} className="w-9 h-9 rounded-xl text-ink-2 bg-surface hover:bg-violet-50 hover:text-violet-700 flex items-center justify-center" aria-label={`تعديل ${opt.name_ar}`}><FiEdit2 size={14} /></button>
                <button onClick={() => deleteGroup(opt)} className="w-9 h-9 rounded-xl text-danger bg-danger-soft hover:bg-danger/10 flex items-center justify-center" aria-label={`حذف ${opt.name_ar}`}><FiTrash2 size={14} /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {opt.values.map((v, j) => (
                <span key={v.id || j} className="inline-flex items-center gap-1.5 text-[12.5px] bg-surface text-ink-2 ps-3 pe-1 h-8 rounded-full border border-surface-line">
                  {v.name_ar} <b dir="ltr" className={cx('font-extrabold tnum', num(v.extra_price) > 0 ? 'text-brand-600' : 'text-emerald-600')}>{num(v.extra_price) > 0 ? `+${num(v.extra_price).toFixed(2)}₪` : 'مجاناً'}</b>
                  {v.id ? (
                    <button onClick={() => deleteValue(opt, v)} className="w-6 h-6 rounded-full hover:bg-danger-soft hover:text-danger text-ink-3 flex items-center justify-center" aria-label={`حذف خيار ${v.name_ar}`}><FiX size={12} /></button>
                  ) : <span className="w-1" />}
                </span>
              ))}
            </div>
          </div>
        )
      ))}

      {editing === 'new' && <OptionForm busy={busy} onSave={(f) => save(f, null)} onCancel={() => setEditing(null)} />}

      {options.length > 0 && editing !== 'new' && (
        <button onClick={() => setEditing('new')} className="w-full h-12 rounded-[16px] border-2 border-dashed border-violet-200 text-violet-600 font-extrabold text-sm hover:bg-violet-50 flex items-center justify-center gap-2">
          <FiPlus aria-hidden /> مجموعة إضافات جديدة
        </button>
      )}
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
    <div className="rounded-[20px] border-[1.5px] border-violet-200 bg-violet-50/40 p-4 space-y-4 animate-pop">
      <p className="text-sm font-extrabold text-violet-700 flex items-center gap-1.5"><FiSliders size={14} aria-hidden /> {initial ? 'تعديل المجموعة' : 'مجموعة جديدة'}</p>
      <div>
        <label className="label" htmlFor="og-name">اسم المجموعة</label>
        <input id="og-name" className="input" placeholder="مثال: الحجم، الإضافات، نوع الخبز" value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="label">نوع الاختيار</p>
          <Tabs size="sm" value={form.type} onChange={(v) => setForm(f => ({ ...f, type: v }))} ariaLabel="نوع الاختيار"
            tabs={[{ key: 'single', label: 'اختيار واحد' }, { key: 'multiple', label: 'متعدد' }]} />
        </div>
        <div>
          <p className="label">إجباري؟</p>
          <div className="h-10 rounded-2xl bg-white border border-surface-line px-3 flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink-2">{form.is_required ? 'يجب على الزبون الاختيار' : 'اختياري للزبون'}</span>
            <Toggle checked={form.is_required} onChange={(v) => setForm(f => ({ ...f, is_required: v }))} label="مجموعة إجبارية" />
          </div>
        </div>
      </div>
      {form.type === 'multiple' && (
        <div className="animate-fade-up">
          <label className="label" htmlFor="og-max">الحد الأقصى للاختيارات</label>
          <input id="og-max" className="input tnum" type="number" min="2" inputMode="numeric" placeholder="فارغ = بلا حد (كل الخيارات) — أقل قيمة 2"
            value={form.max_selections} onChange={e => setForm(f => ({ ...f, max_selections: e.target.value }))} />
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="label mb-0">الخيارات</p>
          <span className="text-[11px] font-bold text-ink-3">السعر الإضافي — فارغ = مجاناً</span>
        </div>
        {form.values.map((v, i) => (
          <div key={v.id || `n${i}`} className="flex gap-2 items-center animate-fade-up">
            <span className="w-6 text-center text-[12px] font-black text-violet-400 tnum">{i + 1}</span>
            <input className="input flex-1" placeholder="اسم الخيار" aria-label={`اسم الخيار ${i + 1}`} value={v.name_ar} onChange={e => setVal(i, { name_ar: e.target.value })} />
            <div className="relative w-28 flex-shrink-0">
              <input className="input pe-8 tnum" type="number" min="0" step="0.5" inputMode="decimal" placeholder="0" aria-label={`السعر الإضافي للخيار ${i + 1}`} value={v.extra_price} onChange={e => setVal(i, { extra_price: e.target.value })} />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-3 text-sm font-bold pointer-events-none">₪</span>
            </div>
            <button onClick={() => setForm(f => ({ ...f, values: f.values.filter((_, j) => j !== i) }))} disabled={form.values.length <= 1}
              className="w-10 h-10 rounded-xl text-danger hover:bg-danger-soft flex items-center justify-center disabled:opacity-30 flex-shrink-0" aria-label={`حذف الخيار ${i + 1}`}><FiX /></button>
          </div>
        ))}
        <button onClick={() => setForm(f => ({ ...f, values: [...f.values, { name_ar: '', extra_price: '' }] }))}
          className="h-10 px-3 rounded-xl text-violet-600 text-sm font-extrabold flex items-center gap-1.5 hover:bg-violet-50"><FiPlus size={15} /> خيار آخر</button>
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="violet" loading={busy} icon={FiCheck} onClick={() => onSave(form)} className="flex-1 h-12">حفظ المجموعة</Button>
        <button onClick={onCancel} className="btn-ghost h-12 px-5">إلغاء</button>
      </div>
    </div>
  );
}
