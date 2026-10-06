// ثوابت ودوال تنسيق مشتركة بين الصفحات

// أسماء الحالات حسب العقد الموحّد للتطبيقات
export const STATUS_LABELS = {
  pending: 'بانتظار المطعم',
  confirmed: 'مؤكد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  on_the_way: 'في الطريق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

// اسم الحالة مع مراعاة نوع الطلب (الاستلام من المحل: "تم التسليم")
export const statusLabel = (status, orderType) => {
  if (status === 'delivered' && orderType && orderType !== 'delivery') return 'تم التسليم';
  if (status === 'ready' && orderType && orderType !== 'delivery') return 'جاهز للاستلام';
  return STATUS_LABELS[status] || status || '—';
};

export const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-sky-50 text-sky-700 ring-sky-200',
  preparing: 'bg-brand-50 text-brand-700 ring-brand-200',
  ready: 'bg-teal-50 text-teal-700 ring-teal-200',
  on_the_way: 'bg-violet-50 text-violet-700 ring-violet-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-600 ring-rose-200',
};

export const STATUS_ACCENT = {
  pending: '#F59E0B', confirmed: '#0EA5E9', preparing: '#FF6B00', ready: '#14B8A6',
  on_the_way: '#8B5CF6', delivered: '#10B981', cancelled: '#F43F5E',
};

export const PAYMENT_LABELS = {
  cash: 'نقداً عند الاستلام',
  card: 'بطاقة',
  wallet: 'محفظة وصلّي',
  online: 'دفع إلكتروني',
};
export const paymentLabel = (m) => PAYMENT_LABELS[m] || (m ? String(m) : 'غير محدد');

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const money = (v) => `${num(v).toFixed(2)}₪`;
export const moneyShort = (v) => {
  const n = num(v);
  return `${Number.isInteger(n) ? n : n.toFixed(2)}₪`;
};

export const orderNo = (o) => (o ? (o.order_number || o.id) : '');

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// تاريخ + وقت مقروء: "اليوم 14:30" / "أمس 09:10" / "12 أكتوبر 18:05"
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return '';
  const time = d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `اليوم ${time}`;
  if (sameDay(d, y)) return `أمس ${time}`;
  const date = d.toLocaleDateString('ar', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return `${date} ${time}`;
}

// صيغ الجمع العربية للأعداد: 1 صنف، 2 صنفان، 3-10 أصناف، 11+ صنفًا
export function arCount(n, [one, two, few, many]) {
  const c = Number(n) || 0;
  if (c === 0) return `لا ${few}`;
  if (c === 1) return one;
  if (c === 2) return two;
  if (c >= 3 && c <= 10) return `${c} ${few}`;
  return `${c} ${many}`;
}

export function parseOptions(it) {
  try {
    const v = typeof it?.options === 'string' ? JSON.parse(it.options) : (it?.options || []);
    return Array.isArray(v) ? v.filter(Boolean) : [];
  } catch { return []; }
}

export const optionName = (o) => (typeof o === 'string' ? o : (o?.name_ar || o?.name || o?.label || ''));
export const optionPrice = (o) => (typeof o === 'object' && o ? num(o.price ?? o.extra_price) : 0);

// ─── الطلب المجمّع (سائق واحد يجمع من عدة مطاعم) ───
export const isGroupOrder = (o) => !!(o && (o.group_id != null || o.is_group === true || o.is_group === 'true'));
export const groupStops = (o) => parseInt(o?.group_stops_count ?? o?.stops_count ?? o?.stops_total) || 0;
// «طلب مجمّع (مطعم 2 من 3)» — رقم المطعم = ترتيب الاستلام
export function groupLabel(o) {
  if (!isGroupOrder(o)) return '';
  const n = groupStops(o);
  const x = parseInt(o?.stop_sequence) || 0;
  if (x && n) return `طلب مجمّع (مطعم ${x} من ${n})`;
  if (n) return `طلب مجمّع (${n} مطاعم)`;
  return 'طلب مجمّع';
}
export const GROUP_STATUS_LABELS = {
  pending: 'بانتظار المطاعم', confirmed: 'نبحث عن سائق', picking_up: 'السائق يجمع الطلبات',
  on_the_way: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي',
};

// المسافة بالكيلومتر بين نقطتين (Haversine)
export function distanceKm(aLat, aLng, bLat, bLng) {
  const [a1, b1, a2, b2] = [aLat, aLng, bLat, bLng].map(Number);
  if (![a1, b1, a2, b2].every(Number.isFinite)) return null;
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(a2 - a1), dLng = toRad(b2 - b1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// مفتاح تاريخ محلي YYYY-MM-DD
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
