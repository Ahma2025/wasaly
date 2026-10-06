/*
  وجهة الضغط على إشعار (من الإشعار نفسه أو من قائمة الإشعارات) — مكان واحد للتطبيق كله.
  يرجّع { name, params } أو null
*/
const has = (v) => v != null && v !== '' && v !== 'null' && v !== 'undefined';

export function notificationTarget(data, type) {
  const d = data || {};
  const t = String(type || d.type || '').toLowerCase();
  if (t === 'cart_reminder') return { name: 'Main', params: { screen: 'سلتي' } };
  // رد فريق الدعم
  if (t === 'support' || t === 'support_message' || t === 'support_reply') return { name: 'SupportChat' };
  // السلة المشتركة (group_orders) — group_id هون مش طلب مجمّع؛ بنفتحها بالكود لو موجود
  if (t === 'group_order' || t === 'group_cart' || t === 'shared_cart') return has(d.code) ? { name: 'GroupOrder', params: { code: d.code } } : null;
  // طلب مجمّع (عدة مطاعم) → شاشة تتبّع المجموعة (السلة المشتركة إلها code)
  if (has(d.group_id) && !d.code) return { name: 'GroupTracking', params: { groupId: d.group_id } };
  if (has(d.order_id)) return { name: 'OrderTracking', params: { orderId: d.order_id } };
  // سلة مشتركة (طلب مع الأصحاب)
  if (has(d.code) && (t.startsWith('group') || has(d.group_id))) return { name: 'GroupOrder', params: { code: d.code } };
  // عرض/VIP من مطعم
  if (has(d.restaurant_id)) return { name: 'Restaurant', params: { restaurantId: d.restaurant_id } };
  return null;
}

// أيقونة + لون + نص زر لكل نوع إشعار
export const NOTIF_META = {
  order:            { icon: 'receipt', color: '#FF6B00' },
  order_status:     { icon: 'receipt', color: '#FF6B00' },
  order_confirmed:  { icon: 'checkmark-circle', color: '#2E90FA' },
  driver_assigned:  { icon: 'bicycle', color: '#7C5CFA' },
  on_the_way:       { icon: 'bicycle', color: '#F53B57' },
  order_ready:      { icon: 'bag-check', color: '#7C5CFA' },
  delivered:        { icon: 'checkmark-done-circle', color: '#1DB954' },
  cancelled:        { icon: 'close-circle', color: '#F04438' },
  order_cancelled:  { icon: 'close-circle', color: '#F04438' },
  group_confirmed:  { icon: 'layers', color: '#2E90FA' },
  group_status:     { icon: 'layers', color: '#FF6B00' },
  group_updated:    { icon: 'layers', color: '#FFB020' },
  group_cancelled:  { icon: 'layers', color: '#F04438' },
  group_order:      { icon: 'people', color: '#7B61FF' },
  support:          { icon: 'chatbubbles', color: '#1DB954' },
  vip:              { icon: 'diamond', color: '#7C5CFA' },
  promo:            { icon: 'gift', color: '#7C5CFA' },
  broadcast:        { icon: 'megaphone', color: '#2E90FA' },
  system:           { icon: 'notifications', color: '#2E90FA' },
  driver:           { icon: 'bicycle', color: '#FF5E3A' },
  payment:          { icon: 'card', color: '#1DB954' },
  review:           { icon: 'star', color: '#FFB020' },
  wallet:           { icon: 'wallet', color: '#1DB954' },
};

export function notificationMeta(type, target) {
  const t = String(type || '').toLowerCase();
  if (NOTIF_META[t]) return NOTIF_META[t];
  if (t.startsWith('group')) return NOTIF_META.group_status;
  if (t.includes('cancel')) return NOTIF_META.cancelled;
  if (target?.name === 'OrderTracking') return NOTIF_META.order;
  return NOTIF_META.system;
}

export function targetLabel(target) {
  switch (target?.name) {
    case 'OrderTracking': return 'عرض الطلب';
    case 'GroupTracking': return 'عرض الطلب المجمّع';
    case 'SupportChat': return 'فتح المحادثة';
    case 'Restaurant': return 'عرض المطعم';
    case 'GroupOrder': return 'فتح السلة المشتركة';
    case 'Main': return 'فتح السلة';
    default: return '';
  }
}
