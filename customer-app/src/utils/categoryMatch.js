/*
  مطابقة المطاعم مع تصنيف — نفس المنطق بالرئيسية وصفحة التصنيف (نفس العدد بالمكانين):
  الأولوية لتطابق category_id الدقيق؛ المطابقة بالاسم مع أقسام المنيو فقط لو ما في نتائج دقيقة
*/
export const matchesCategoryId = (r, id) => id != null && (
  String(r?.category_id) === String(id)
  || (Array.isArray(r?.category_ids) && r.category_ids.some(x => String(x) === String(id)))
);

export const matchesCategoryName = (r, name) => !!name && (r?.menu_cats || []).some(mc => mc && (mc.includes(name) || name.includes(mc)));

export function restaurantsForCategory(all, { id, name } = {}) {
  const list = Array.isArray(all) ? all : [];
  const exact = list.filter(r => matchesCategoryId(r, id));
  return exact.length ? exact : list.filter(r => matchesCategoryName(r, name));
}
