import api from './api';
import { normalizePhone, truthy } from './format';

/** الحساب «معطّل» = محذوف ناعماً (is_active=false) — يختلف عن «محظور» (is_blocked) — A-07 */
export const isInactive = (u) => u && u.is_active != null && !truthy(u.is_active);

/** يبحث عن صاحب رقم مسجّل مسبقاً ليشرح سبب رفض الإضافة (حساب معطّل أم نشط) */
export async function findByPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  try {
    const r = await api.get('/admin/users', { params: { search: p, limit: 10 } });
    return (r.data || []).find(u => normalizePhone(u.phone) === p) || null;
  } catch { return null; }
}

export async function duplicatePhoneMessage(phone) {
  const u = await findByPhone(phone);
  if (!u) return 'رقم الهاتف مسجّل مسبقاً — استخدم رقماً آخر';
  if (isInactive(u)) return `الرقم يخص حساباً معطّلاً «${u.name || 'مستخدم'}» — أعد تفعيله من صفحة «المستخدمون» بدل إنشاء حساب جديد`;
  return `رقم الهاتف مسجّل مسبقاً باسم «${u.name || 'مستخدم'}» — استخدم رقماً آخر`;
}

/**
 * إعادة تفعيل حساب معطّل. يجرّب المسار الجديد ثم البديل؛ على الخادم القديم (بلا مسار) يرمي
 * خطأ missingRoute فتعرض الواجهة رسالة واضحة.
 */
export async function reactivateUser(id) {
  try {
    return await api.patch(`/admin/users/${id}/reactivate`);
  } catch (e) {
    if (!e?.missingRoute) throw e;
    return api.patch(`/admin/users/${id}/activate`);
  }
}
