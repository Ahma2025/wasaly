// تسميات حالة الطلب الموحّدة (مطابقة لعقد السيرفر) + ألوان آمنة للوضعين
export const STATUS_LABELS = {
  pending: 'بانتظار المطعم',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  on_the_way: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

export const STATUS_META = {
  pending:    { color: '#FF9500', icon: 'time-outline' },
  confirmed:  { color: '#007AFF', icon: 'checkmark-circle-outline' },
  preparing:  { color: '#AF52DE', icon: 'flame-outline' },
  ready:      { color: '#25C26E', icon: 'bag-check-outline' },
  on_the_way: { color: '#FF6B00', icon: 'bicycle-outline' },
  delivered:  { color: '#25C26E', icon: 'gift-outline' },
  cancelled:  { color: '#FF3B30', icon: 'close-circle-outline' },
};

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'];
export const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

export const statusLabel = (s, order) => {
  if (s === 'delivered' && order?.order_type === 'pickup') return 'تم الاستلام';
  if (s === 'ready' && order?.order_type === 'pickup') return 'جاهز للاستلام';
  return STATUS_LABELS[s] || (s ? String(s) : 'غير معروف');
};

export const statusMeta = (s) => STATUS_META[s] || { color: '#8A90A0', icon: 'help-circle-outline' };

// لون بخلفية شفافة تعمل بالوضعين الفاتح والداكن
export const softBg = (hex, alpha = '22') => (hex && hex.length === 7 ? hex + alpha : 'rgba(138,144,160,0.15)');

export const isPersonalOrder = (o) => o?.order_type === 'personal' || (!o?.restaurant_id && !!o?.service_type);
