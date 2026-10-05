// أدوات عرض مشتركة: مبالغ، حالات، عناوين الطلبات، تواريخ ميلادية
import { COLORS } from '../theme';

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const money = (v) => `${num(v).toFixed(2)}₪`;

export const STATUS = {
  pending:    { label: 'بانتظار المطعم', color: COLORS.amber,  bg: COLORS.amberSoft },
  confirmed:  { label: 'مؤكد',          color: COLORS.blue,   bg: COLORS.blueSoft },
  preparing:  { label: 'قيد التحضير',    color: COLORS.amber,  bg: COLORS.amberSoft },
  ready:      { label: 'جاهز',          color: COLORS.purple, bg: COLORS.purpleSoft },
  on_the_way: { label: 'في الطريق',      color: COLORS.primary, bg: COLORS.tint },
  delivered:  { label: 'تم التوصيل',     color: COLORS.green,  bg: COLORS.greenSoft },
  cancelled:  { label: 'ملغي',          color: COLORS.red,    bg: COLORS.redSoft },
};
export const statusInfo = (s) => STATUS[s] || { label: s || '—', color: COLORS.gray, bg: COLORS.bg };

export const isPersonal = (o) => o?.order_type === 'personal';
export const isRide = (o) => isPersonal(o) && o?.service_type === 'ride';

// عنوان الطلب: اسم المطعم أو "توصيل راكب/طرد"
export function orderTitle(o) {
  if (!o) return '';
  if (isPersonal(o)) return isRide(o) ? 'توصيل راكب' : 'توصيل طرد';
  return o.restaurant_name || 'طلب مطعم';
}
export function orderIcon(o) {
  if (isPersonal(o)) return isRide(o) ? 'people' : 'cube';
  return 'restaurant';
}
export const orderNo = (o) => (o ? (o.order_number || o.id) : '');

export function pickupPoint(o) {
  if (!o) return { lat: null, lng: null };
  return isPersonal(o)
    ? { lat: num(o.pickup_lat) || null, lng: num(o.pickup_lng) || null }
    : { lat: num(o.restaurant_lat) || null, lng: num(o.restaurant_lng) || null };
}
export const pickupLabel = (o) => (isPersonal(o) ? 'نقطة الاستلام' : 'المطعم');
export const dropLabel = (o) => (isPersonal(o) ? 'نقطة التسليم' : 'عنوان الزبون');

// أجر السائق = driver_fee (+ الإكرامية) وإلا delivery_fee
export const driverFee = (o) => (o?.driver_fee != null && o.driver_fee !== '' ? num(o.driver_fee) : num(o?.delivery_fee));
export const tipOf = (o) => num(o?.tip);

const PAY = { cash: 'كاش عند الاستلام', card: 'بطاقة', online: 'دفع إلكتروني', wallet: 'المحفظة', paid: 'مدفوع' };
export const paymentLabel = (m) => PAY[m] || (m ? String(m) : 'كاش عند الاستلام');

// المبلغ المطلوب تحصيله من الزبون (من السيرفر إن وُجد وإلا نحسبه)
export function cashToCollect(o) {
  if (!o) return 0;
  if (o.cash_to_collect != null && o.cash_to_collect !== '') return num(o.cash_to_collect);
  const method = o.payment_method || 'cash';
  if (method === 'cash' && o.payment_status !== 'paid') return num(o.total);
  return 0;
}

// هل قبل هذا السائق الطلب؟ (driver_assigned_at يُضبط عند القبول)
export function isAccepted(o) {
  if (!o) return false;
  if (o.status === 'on_the_way') return true;
  if (o.status === 'delivered' || o.status === 'cancelled') return false;
  if (o.is_offer === true) return false; // عرض لم يُقبل بعد (السيرفر الجديد)
  if (o.is_offer === false) return true;
  if (o.driver_assigned_at !== undefined) return !!o.driver_assigned_at;
  return o.status === 'preparing' || o.status === 'ready';
}

export function parseItems(o) {
  const items = Array.isArray(o?.items) ? o.items : [];
  return items.map((it, idx) => {
    let opts = it.options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { opts = []; } }
    if (!Array.isArray(opts)) opts = [];
    return {
      key: String(it.id ?? `i${idx}`),
      name: it.name_ar || it.name || it.item_name || 'صنف',
      qty: parseInt(it.quantity, 10) || 1,
      subtotal: it.subtotal != null ? num(it.subtotal) : num(it.price) * (parseInt(it.quantity, 10) || 1),
      options: opts.map(x => (typeof x === 'string' ? x : (x?.name || x?.value || x?.name_ar))).filter(Boolean),
      notes: it.notes || '',
    };
  });
}

// تواريخ بالتقويم الميلادي دائماً (ar-SA يعطي هجري)
const LOCALE = 'ar-EG-u-ca-gregory-nu-latn';
export function fmtDate(d, withTime = true) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  try {
    const day = date.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory' });
    if (!withTime) return day;
    const time = date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', calendar: 'gregory' });
    return `${day} · ${time}`;
  } catch {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())}${withTime ? ` ${p(date.getHours())}:${p(date.getMinutes())}` : ''}`;
  }
}
export function fmtTime(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  try { return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }); }
  catch { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
}
// "2026-10-05" → "الأحد ٥ أكتوبر"
export function fmtDay(ymd) {
  if (!ymd) return '';
  const [y, m, dd] = String(ymd).split('-').map(Number);
  if (!y || !m || !dd) return String(ymd);
  const date = new Date(y, m - 1, dd);
  try { return date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }); }
  catch { return String(ymd); }
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(v => Number.isFinite(parseFloat(v)) && parseFloat(v) !== 0)) return null;
  const R = 6371;
  const toR = (x) => (parseFloat(x) * Math.PI) / 180;
  const dLat = toR(lat2) - toR(lat1);
  const dLon = toR(lng2) - toR(lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export const km = (v) => (v == null ? null : `${num(v).toFixed(1)} كم`);
