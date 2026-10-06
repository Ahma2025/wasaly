// تنسيقات موحّدة لكل الصفحات: تواريخ عربية بأرقام لاتينية، مبالغ، وحالات الطلب
const LOCALE = 'ar-EG-u-nu-latn';

const toDate = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? null : x;
};

export const fmtDate = (d, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  const x = toDate(d); if (!x) return '—';
  try { return x.toLocaleDateString(LOCALE, opts); } catch { return x.toISOString().slice(0, 10); }
};

export const fmtDateTime = (d) => {
  const x = toDate(d); if (!x) return '—';
  try { return x.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return x.toISOString().slice(0, 16).replace('T', ' '); }
};

export const fmtTime = (d) => {
  const x = toDate(d); if (!x) return '—';
  try { return x.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

export const fmtToday = () => fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });

export const num = (n) => { const v = parseFloat(n); return isNaN(v) ? 0 : v; };
export const money = (n, digits = 2) => `${num(n).toFixed(digits)}₪`;

/** حالات الطلب — نفس التسميات المعتمدة في العقد */
export const STATUS = {
  pending:    { label: 'بانتظار المطعم', short: 'بانتظار', color: '#F59E0B', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  confirmed:  { label: 'مؤكد',          short: 'مؤكد',    color: '#3B82F6', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  preparing:  { label: 'قيد التحضير',   short: 'تحضير',   color: '#8B5CF6', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  ready:      { label: 'جاهز',          short: 'جاهز',    color: '#0EA5E9', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  picked_up:  { label: 'مع السائق',     short: 'مع السائق', color: '#F97316', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  on_the_way: { label: 'في الطريق',     short: 'في الطريق', color: '#06B6D4', cls: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  delivered:  { label: 'تم التوصيل',    short: 'تم',      color: '#16A34A', cls: 'bg-green-50 text-green-700 ring-green-200' },
  cancelled:  { label: 'ملغي',          short: 'ملغي',    color: '#EF4444', cls: 'bg-red-50 text-red-600 ring-red-200' },
};
export const statusMeta = (s) => STATUS[s] || { label: s || '—', short: s || '—', color: '#9AA0AE', cls: 'bg-gray-100 text-gray-600 ring-gray-200' };

/** فلاتر صفحة الطلبات (picked_up قديم — نبقيه للعرض فقط) */
export const ORDER_FILTERS = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'];

/** الطلب المجمّع (عدة مطاعم — سائق واحد) */
export const GROUP_STATUS = {
  pending:    { label: 'بانتظار المطاعم',      color: '#F59E0B', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  confirmed:  { label: 'نبحث عن سائق',        color: '#3B82F6', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  picking_up: { label: 'السائق يجمع الطلبات', color: '#8B5CF6', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  on_the_way: { label: 'في الطريق',            color: '#06B6D4', cls: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  delivered:  { label: 'تم التوصيل',           color: '#16A34A', cls: 'bg-green-50 text-green-700 ring-green-200' },
  cancelled:  { label: 'ملغي',                 color: '#EF4444', cls: 'bg-red-50 text-red-600 ring-red-200' },
};
export const groupStatusMeta = (s) => GROUP_STATUS[s] || { label: s || '—', color: '#9AA0AE', cls: 'bg-gray-100 text-gray-600 ring-gray-200' };
export const isGroup = (o) => !!(o && (o.group_id != null || o.is_group === true));

export const PAYMENT = { cash: 'نقداً', card: 'بطاقة', wallet: 'المحفظة', online: 'دفع إلكتروني' };
export const paymentLabel = (p) => PAYMENT[p] || (p ? p : '—');

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

export const isPersonal = (o) => o?.order_type === 'personal' || (!o?.restaurant_id && !o?.restaurant_name && (o?.pickup_lat || o?.pickup_address));

/** أرقام عربية-هندية → لاتينية + إزالة المسافات والشرطات */
export const normalizePhone = (p) => String(p || '')
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[\s-]/g, '');

export const truthy = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
