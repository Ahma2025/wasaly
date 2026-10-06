// ثوابت ودوال تنسيق مشتركة بين الصفحات
import { pl } from './plural';

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

// اسم الحالة مع مراعاة نوع الطلب — الاستلام من المحل ينتهي بـ«تم الاستلام» (موحّد مع تطبيق الزبون)
export const statusLabel = (status, orderType) => {
  if (status === 'delivered' && orderType && orderType !== 'delivery') return 'تم الاستلام';
  if (status === 'ready' && orderType && orderType !== 'delivery') return 'جاهز للاستلام';
  return STATUS_LABELS[status] || status || '—';
};

// ─── جدول ألوان الحالات الموحّد (رموز DESIGN.md) — نفس الجدول في التطبيقات الأربعة ───
// pending=warning · confirmed=info · preparing=brand · ready=violet · on_the_way=coral · delivered=success · cancelled=danger
// شارات الطلب المجمّع تستخدم teal (لون لا تستخدمه أي حالة)
export const STATUS_META = {
  pending:    { tone: 'warning', accent: '#FFB020', chip: 'bg-warning-soft text-amber-700' },
  confirmed:  { tone: 'info',    accent: '#2E90FA', chip: 'bg-info-soft text-sky-700' },
  preparing:  { tone: 'brand',   accent: '#FF6B00', chip: 'bg-brand-50 text-brand-700' },
  ready:      { tone: 'violet',  accent: '#7B61FF', chip: 'bg-violet-50 text-violet-700' },
  on_the_way: { tone: 'coral',   accent: '#F53B57', chip: 'bg-coral-50 text-coral' },
  delivered:  { tone: 'success', accent: '#1DB954', chip: 'bg-success-soft text-emerald-700' },
  cancelled:  { tone: 'danger',  accent: '#F04438', chip: 'bg-danger-soft text-danger' },
};
export const GROUP_ACCENT = '#0E9F9A'; // teal — نفس لون شارة «مجمّع» في تطبيق السائق
const UNKNOWN_META = { tone: 'gray', accent: '#CBD5E1', chip: 'bg-gray-100 text-ink-2' };
export const statusMeta = (s) => STATUS_META[s] || UNKNOWN_META;
export const STATUS_ACCENT = Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.accent]));

// المصطلحات الموحّدة: «كاش عند الاستلام» · «محفظة وصلّي» · «إكرامية السائق» · «رسوم مطعم إضافي»
export const PAYMENT_LABELS = {
  cash: 'كاش عند الاستلام',
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
// رقم الطلب المعروف (WSL000123) — احتياط عند غياب order_number من حدث السيرفر
export const orderNumberOf = (p) => p?.order_number || (p?.order_id != null ? `WSL${String(p.order_id).padStart(6, '0')}` : '');

// ─── التواريخ: أرقام لاتينية + تقويم ميلادي + توقيت فلسطين (موحّد مع باقي التطبيقات) ───
const LOCALE = 'ar-EG-u-ca-gregory-nu-latn';
const TZ = 'Asia/Hebron';
function fmt(d, opts) {
  try { return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, ...opts }).format(d); }
  catch {
    try { return new Intl.DateTimeFormat(LOCALE, opts).format(d); }
    catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
}
const toDate = (v) => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? null : d;
};

// مفتاح يوم YYYY-MM-DD بتوقيت فلسطين (نفس تجميع السيرفر)
export function dayKey(v) {
  const d = toDate(v) || new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const g = (t) => parts.find(p => p.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export const fmtTime = (v) => { const d = toDate(v); return d ? fmt(d, { hour: '2-digit', minute: '2-digit', hour12: false }) : ''; };
export const fmtDate = (v, opts = { day: 'numeric', month: 'short' }) => { const d = toDate(v); return d ? fmt(d, opts) : ''; };
// «الثلاثاء، 6 أكتوبر»
export const fmtLongToday = () => fmt(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
// «06/10/2026»
export const fmtNumericDate = (v) => { const d = toDate(v); return d ? fmt(d, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; };

// تاريخ + وقت مقروء: "اليوم 14:30" / "أمس 09:10" / "12 أكتوبر 18:05"
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  const time = fmtTime(d);
  const now = new Date();
  const k = dayKey(d);
  const today = dayKey(now);
  if (k === today) return `اليوم ${time}`;
  if (k === dayKey(new Date(now.getTime() - 86400000))) return `أمس ${time}`;
  const sameYear = k.slice(0, 4) === today.slice(0, 4);
  const date = fmtDate(d, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  return `${date} ${time}`;
}

// صيغ الجمع العربية (للتوافق مع الكود القديم) — الأفضل استخدام utils/plural.js
export function arCount(n, [one, two, few, many]) {
  const c = Number(n) || 0;
  if (c === 0) return `لا ${few}`;
  if (c === 1) return one;
  if (c === 2) return two;
  const r = c % 100;
  if (r >= 3 && r <= 10) return `${c} ${few}`;
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
  // حماية: بعد انسحاب مطعم قد يصبح الترتيب أكبر من العدد («مطعم 3 من 2») — نخفي «X من N» حينها
  if (x && n && x <= n) return `طلب مجمّع (مطعم ${x} من ${n})`;
  if (n > 1) return `طلب مجمّع (${pl(n, 'restaurant')})`;
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
