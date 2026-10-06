// تنسيقات موحّدة لكل الصفحات: تواريخ عربية بأرقام لاتينية (توقيت فلسطين)، مبالغ، وحالات الطلب
const LOCALE = 'ar-EG-u-ca-gregory-nu-latn';
const TZ = 'Asia/Hebron';

const toDate = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? null : x;
};

// toLocale* مع المنطقة الزمنية، ومع رجوع آمن للأجهزة التي لا تدعم timeZone
const loc = (x, fn, opts) => {
  try { return x[fn](LOCALE, { ...opts, timeZone: TZ }); }
  catch { try { return x[fn]('ar-EG-u-nu-latn', opts); } catch { return null; } }
};

export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  // تاريخ بلا وقت (YYYY-MM-DD) يُعرض كما هو بدون إزاحة المنطقة الزمنية
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, dd] = d.split('-').map(Number);
    const noon = new Date(Date.UTC(y, m - 1, dd, 12));
    try { return noon.toLocaleDateString(LOCALE, { ...opts, timeZone: 'UTC' }); } catch { return d; }
  }
  const x = toDate(d); if (!x) return '—';
  return loc(x, 'toLocaleDateString', opts) ?? x.toISOString().slice(0, 10);
};

export const fmtDateTime = (d) => {
  const x = toDate(d); if (!x) return '—';
  return loc(x, 'toLocaleString', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? x.toISOString().slice(0, 16).replace('T', ' ');
};

export const fmtTime = (d) => {
  const x = toDate(d); if (!x) return '—';
  return loc(x, 'toLocaleTimeString', { hour: '2-digit', minute: '2-digit' }) ?? '';
};

export const fmtToday = () => fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });

/** مفتاح اليوم بتوقيت فلسطين YYYY-MM-DD */
export function hebronDay(d = new Date()) {
  const x = toDate(d) || new Date();
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(x);
    const g = (t) => p.find(q => q.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch { return x.toISOString().slice(0, 10); }
}
/** ساعة اليوم بتوقيت فلسطين (0–23) */
export function hebronHour(d = new Date()) {
  try { return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d), 10) % 24; }
  catch { return d.getHours(); }
}
/** آخر n أيام (الأقدم أولاً) بتوقيت فلسطين */
export function lastDays(n) {
  const out = [];
  const [y, m, d] = hebronDay().split('-').map(Number);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return out;
}
/** آخر n أشهر YYYY-MM (الأقدم أولاً) بتوقيت فلسطين */
export function lastMonths(n) {
  const out = [];
  const [y, m] = hebronDay().split('-').map(Number);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}
export const fmtMonth = (ym, opts = { month: 'short' }) => {
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  try { return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(LOCALE, { ...opts, timeZone: 'UTC' }); } catch { return ym; }
};
/** وقت مختصر لقوائم المحادثات: اليوم → الساعة، أمس، وإلا التاريخ */
export const fmtWhen = (d) => {
  const x = toDate(d); if (!x) return '';
  const k = hebronDay(x);
  if (k === hebronDay()) return fmtTime(x);
  if (k === hebronDay(new Date(Date.now() - 864e5))) return 'أمس';
  return fmtDate(x, { day: 'numeric', month: 'short' });
};

export const num = (n) => { const v = parseFloat(n); return isNaN(v) ? 0 : v; };
export const money = (n, digits = 2) => `${num(n).toFixed(digits)}₪`;

/**
 * حالات الطلب — جدول موحّد للتطبيقات الأربعة بألوان DESIGN.md (X-09):
 * pending=warning · confirmed=info · preparing=brand · ready=violet · on_the_way=coral · delivered=success · cancelled=danger
 * (شارة «مجمّع» بلون teal #0E9F9A لا تستخدمه أي حالة — مطابق للتطبيقات الأخرى)
 */
export const STATUS = {
  pending:    { label: 'بانتظار المطعم', short: 'بانتظار',   icon: 'clock',   color: '#FFB020', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  confirmed:  { label: 'مؤكد',          short: 'مؤكد',      icon: 'check',   color: '#2E90FA', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  preparing:  { label: 'قيد التحضير',   short: 'تحضير',     icon: 'prep',    color: '#FF6B00', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  ready:      { label: 'جاهز',          short: 'جاهز',      icon: 'bag',     color: '#7B61FF', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  picked_up:  { label: 'في الطريق',     short: 'في الطريق', icon: 'truck',   color: '#F53B57', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  on_the_way: { label: 'في الطريق',     short: 'في الطريق', icon: 'truck',   color: '#F53B57', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  delivered:  { label: 'تم التوصيل',    short: 'تم',        icon: 'done',    color: '#1DB954', cls: 'bg-green-50 text-green-700 ring-green-200' },
  cancelled:  { label: 'ملغي',          short: 'ملغي',      icon: 'x',       color: '#F04438', cls: 'bg-red-50 text-red-600 ring-red-200' },
};
export const statusMeta = (s) => STATUS[s] || { label: s || '—', short: s || '—', icon: 'dot', color: '#8A8FA3', cls: 'bg-gray-100 text-gray-600 ring-gray-200' };

/** تسمية الحالة حسب نوع الطلب (مطابقة لتطبيق الزبون) — X-10 */
export function statusLabel(status, order) {
  const pickup = order?.order_type === 'pickup';
  if (pickup && status === 'delivered') return 'تم الاستلام';
  if (pickup && status === 'ready') return 'جاهز للاستلام';
  if (order && isPersonal(order) && (status === 'preparing' || status === 'ready')) return 'السائق بالطريق للاستلام';
  return statusMeta(status).label;
}
export function statusShort(status, order) {
  const pickup = order?.order_type === 'pickup';
  if (pickup && status === 'delivered') return 'استُلم';
  if (order && isPersonal(order) && status === 'preparing') return 'للاستلام';
  return statusMeta(status).short;
}

/** مراحل الطلب: الاستلام من المحل بلا «في الطريق» */
export const FLOW_DELIVERY = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'];
export const FLOW_PICKUP = ['pending', 'confirmed', 'preparing', 'ready', 'delivered'];
export const FLOW_PERSONAL = ['pending', 'confirmed', 'preparing', 'on_the_way', 'delivered'];
export const flowFor = (o) => (o?.order_type === 'pickup' ? FLOW_PICKUP : isPersonal(o) ? FLOW_PERSONAL : FLOW_DELIVERY);

/** آلة حالات الخادم (backend/routes/orders.js TRANSITIONS + validTransition) — A-05 */
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'],
  preparing: ['ready', 'on_the_way', 'delivered', 'cancelled'],
  ready: ['on_the_way', 'delivered', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
export const isAwaitingCardPayment = (o) => o?.payment_method === 'card' && o?.payment_status !== 'paid' && num(o?.total) > 0;
export function allowedTransitions(o) {
  if (!o) return [];
  const pickup = o.order_type === 'pickup';
  const grouped = isGroup(o);
  return (TRANSITIONS[o.status] || []).filter(to => {
    if (to === 'on_the_way' && pickup) return false;
    if (to === 'delivered' && !pickup && o.status !== 'on_the_way') return false;
    if (grouped && (to === 'on_the_way' || to === 'delivered')) return false; // ابن المجمّع: عبر مسار المجمّع فقط
    if (grouped && to === 'cancelled' && o.picked_up_at) return false;
    if (to === 'confirmed' && isAwaitingCardPayment(o)) return false;
    return true;
  });
}

/** فلاتر صفحة الطلبات (picked_up قديم — نبقيه للعرض فقط) */
export const ORDER_FILTERS = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'];

/** الطلب المجمّع (عدة مطاعم — سائق واحد) */
export const GROUP_STATUS = {
  pending:    { label: 'بانتظار المطاعم',      color: '#FFB020', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  confirmed:  { label: 'نبحث عن سائق',        color: '#2E90FA', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  picking_up: { label: 'السائق يجمع الطلبات', color: '#FF6B00', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  on_the_way: { label: 'في الطريق',            color: '#F53B57', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  delivered:  { label: 'تم التوصيل',           color: '#1DB954', cls: 'bg-green-50 text-green-700 ring-green-200' },
  cancelled:  { label: 'ملغي',                 color: '#F04438', cls: 'bg-red-50 text-red-600 ring-red-200' },
};
export const groupStatusMeta = (s) => GROUP_STATUS[s] || { label: s || '—', color: '#8A8FA3', cls: 'bg-gray-100 text-gray-600 ring-gray-200' };
export const isGroup = (o) => !!(o && (o.group_id != null || o.is_group === true || o.is_group === 'true'));

/** المصطلحات الموحّدة بين التطبيقات (X-11) */
export const PAYMENT = { cash: 'كاش عند الاستلام', card: 'بطاقة', wallet: 'محفظة وصلّي', online: 'دفع إلكتروني' };
export const paymentLabel = (p) => PAYMENT[p] || (p ? p : '—');
export const TERMS = { extraStopFee: 'رسوم مطعم إضافي', tip: 'إكرامية السائق', cash: 'كاش عند الاستلام', wallet: 'محفظة وصلّي' };

/** السائق «معيّن» فقط بعد قبوله (driver_assigned_at) — العرض المعلّق ليس تعييناً (X-03) */
export const driverAssigned = (o) => !!(o && o.driver_assigned_at);
export const driverOfferPending = (o) => !!(o && !o.driver_assigned_at && (o.driver_name || o.driver_id || o.driver_offer_expires_at) && !['delivered', 'cancelled'].includes(o.status));

/** أقسام المتاجر — نسخة محلية مطابقة لـ backend/utils/storeTypes.js (الصفحة تحدّثها من GET /store-types) */
export const STORE_TYPES = {
  restaurant:  { label: 'مطعم',              plural: 'مطاعم',            icon: '🍽️', tone: 'bg-orange-50 text-orange-700 ring-orange-200' },
  supermarket: { label: 'سوبرماركت',         plural: 'سوبرماركت',        icon: '🛒', tone: 'bg-green-50 text-green-700 ring-green-200' },
  grocery:     { label: 'بقالة',             plural: 'بقالات',           icon: '🧺', tone: 'bg-lime-50 text-lime-700 ring-lime-200' },
  pharmacy:    { label: 'صيدلية',            plural: 'صيدليات',          icon: '💊', tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  telecom:     { label: 'اتصالات وموبايلات', plural: 'اتصالات وموبايلات', icon: '📱', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  pets:        { label: 'حيوانات أليفة',      plural: 'حيوانات أليفة',     icon: '🐾', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  sweets:      { label: 'حلويات ومخابز',      plural: 'حلويات ومخابز',     icon: '🧁', tone: 'bg-pink-50 text-pink-700 ring-pink-200' },
  flowers:     { label: 'ورد وهدايا',         plural: 'ورد وهدايا',        icon: '💐', tone: 'bg-rose-50 text-rose-700 ring-rose-200' },
  beauty:      { label: 'عطور وتجميل',        plural: 'عطور وتجميل',       icon: '💄', tone: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200' },
};
export const STORE_TYPE_KEYS = Object.keys(STORE_TYPES);
export const normStoreType = (t) => {
  const k = String(t || '').trim().toLowerCase();
  if (k === 'market') return 'supermarket';
  return STORE_TYPES[k] ? k : 'restaurant';
};
export const storeType = (t) => STORE_TYPES[normStoreType(t)];

export const isPersonal = (o) => o?.order_type === 'personal' || (!o?.restaurant_id && !o?.restaurant_name && !!(o?.pickup_lat || o?.pickup_address || o?.service_type));

/** أرقام عربية-هندية → لاتينية + إزالة المسافات والشرطات */
export const normalizePhone = (p) => String(p || '')
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[\s-]/g, '');
export const looksLikePhone = (q) => /^\+?\d{4,15}$/.test(normalizePhone(q));

/** تطبيع نص عربي للبحث: أ/إ/آ→ا، ة→ه، ى→ي، ؤ→و، ئ→ي، حذف التشكيل والتطويل (A-46) */
export const normalizeAr = (s) => String(s || '')
  .toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/\s+/g, ' ').trim();

export const truthy = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
