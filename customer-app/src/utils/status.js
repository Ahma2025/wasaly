// تسميات حالة الطلب الموحّدة (مطابقة لعقد السيرفر) + ألوان DESIGN.md (نفس الجدول بالتطبيقات الأربعة)
export const STATUS_LABELS = {
  pending: 'بانتظار المطعم',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  on_the_way: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

// الألوان من DESIGN.md: warning / info / brand / violet / coral / success / danger — نفس جدول السائق/المطعم/الإدارة
export const STATUS_COLORS = {
  warning: '#FFB020', info: '#2E90FA', brand: '#FF6B00', violet: '#7B61FF', coral: '#F53B57', success: '#1DB954', danger: '#F04438',
};

export const STATUS_META = {
  pending:    { color: STATUS_COLORS.warning, icon: 'hourglass-outline' },
  confirmed:  { color: STATUS_COLORS.info,    icon: 'checkmark-circle-outline' },
  preparing:  { color: STATUS_COLORS.brand,   icon: 'flame-outline' },
  ready:      { color: STATUS_COLORS.violet,  icon: 'bag-check-outline' },
  on_the_way: { color: STATUS_COLORS.coral,   icon: 'bicycle-outline' },
  delivered:  { color: STATUS_COLORS.success, icon: 'checkmark-done-outline' },
  cancelled:  { color: STATUS_COLORS.danger,  icon: 'close-circle-outline' },
};

export const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'];
export const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

export const isPersonalOrder = (o) => o?.order_type === 'personal' || (!o?.restaurant_id && !!o?.service_type);

// الطلب بالبطاقة لسا ما اندفع → السيرفر ما بيبعته للمطعم لحد ما يكتمل الدفع (أو يتحوّل لكاش)
export const isAwaitingCardPayment = (o) => !!o && o.status === 'pending' && (o.awaiting_payment === true
  || (o.awaiting_payment !== false && o.payment_method === 'card' && o.payment_status !== 'paid' && (parseFloat(o.total) || 0) > 0));

export const statusLabel = (s, order) => {
  if (order && isPersonalOrder(order)) {
    if (s === 'pending' || s === 'confirmed') return 'البحث عن سائق';
    // بالتوصيل الشخصي: قبول السائق = preparing/ready بالسيرفر
    if (s === 'preparing' || s === 'ready') return 'السائق بالطريق للاستلام';
  }
  if (s === 'pending' && isAwaitingCardPayment(order)) return 'بانتظار إتمام الدفع';
  if (s === 'delivered' && order?.order_type === 'pickup') return 'تم الاستلام';
  if (s === 'ready' && order?.order_type === 'pickup') return 'جاهز للاستلام';
  return STATUS_LABELS[s] || (s ? String(s) : 'غير معروف');
};

export const statusMeta = (s, order) => {
  if (order && isPersonalOrder(order) && (s === 'preparing' || s === 'ready')) return { color: STATUS_COLORS.info, icon: 'navigate-outline' };
  if (s === 'pending' && isAwaitingCardPayment(order)) return { color: STATUS_COLORS.warning, icon: 'card-outline' };
  return STATUS_META[s] || { color: '#8A90A0', icon: 'help-circle-outline' };
};

// لون بخلفية شفافة تعمل بالوضعين الفاتح والداكن
export const softBg = (hex, alpha = '22') => (hex && hex.length === 7 ? hex + alpha : 'rgba(138,144,160,0.15)');

// ── الطلب المجمّع (عدة مطاعم + سائق واحد) ──
export const GROUP_STATUS_LABELS = {
  pending: 'بانتظار المطاعم',
  confirmed: 'نبحث عن سائق',
  picking_up: 'السائق يجمع الطلبات',
  on_the_way: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};
export const GROUP_STATUS_META = {
  pending:    { color: STATUS_COLORS.warning, icon: 'time-outline' },
  confirmed:  { color: STATUS_COLORS.info,    icon: 'search-outline' },
  picking_up: { color: STATUS_COLORS.brand,   icon: 'git-network-outline' },
  on_the_way: { color: STATUS_COLORS.coral,   icon: 'bicycle-outline' },
  delivered:  { color: STATUS_COLORS.success, icon: 'checkmark-done-circle-outline' },
  cancelled:  { color: STATUS_COLORS.danger,  icon: 'close-circle-outline' },
};
export const ACTIVE_GROUP_STATUSES = ['pending', 'confirmed', 'picking_up', 'on_the_way'];
export const GROUP_PROGRESS = ['pending', 'confirmed', 'picking_up', 'on_the_way', 'delivered'];
export const groupStatusLabel = (s, g) => g?.status_label || GROUP_STATUS_LABELS[s] || (s ? String(s) : 'غير معروف');
export const groupStatusMeta = (s) => GROUP_STATUS_META[s] || { color: '#8A90A0', icon: 'help-circle-outline' };

/**
  السائق "معيّن" فعلاً (قبل العرض) — X-03: عرض الطلب على سائق لسا ما قبله ما لازم يطلع للزبون كأنه سائقه.
  سيرفر قديم بدون driver_assigned_at → نعتمد على الحالة (بعد الاستلام أكيد معيّن)
*/
export const isDriverAssigned = (o) => {
  if (!o || !o.driver_name) return false;
  if (['on_the_way', 'delivered'].includes(o.status)) return true;
  if (Object.prototype.hasOwnProperty.call(o, 'driver_assigned_at')) return o.driver_assigned_at != null;
  return true;
};
