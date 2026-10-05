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

export const PAYMENT = { cash: 'نقداً', card: 'بطاقة', wallet: 'المحفظة', online: 'دفع إلكتروني' };
export const paymentLabel = (p) => PAYMENT[p] || (p ? p : '—');

export const STORE_TYPES = {
  restaurant:  { label: 'مطعم', icon: '🍽️' },
  supermarket: { label: 'سوبرماركت', icon: '🛒' },
  pharmacy:    { label: 'صيدلية', icon: '💊' },
};
export const storeType = (t) => STORE_TYPES[t === 'market' ? 'supermarket' : t] || STORE_TYPES.restaurant;
export const normStoreType = (t) => (t === 'market' ? 'supermarket' : (STORE_TYPES[t] ? t : 'restaurant'));

export const isPersonal = (o) => o?.order_type === 'personal' || (!o?.restaurant_id && !o?.restaurant_name && (o?.pickup_lat || o?.pickup_address));

/** أرقام عربية-هندية → لاتينية + إزالة المسافات والشرطات */
export const normalizePhone = (p) => String(p || '')
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[\s-]/g, '');

export const truthy = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
