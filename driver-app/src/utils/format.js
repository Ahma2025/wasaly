// أدوات عرض مشتركة: مبالغ، حالات، عناوين الطلبات، تواريخ ميلادية
import { COLORS } from '../theme';

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const money = (v) => `${num(v).toFixed(2)}₪`;

// جدول الحالات الموحّد لتطبيقات وصلّي الأربعة (DESIGN.md):
// pending=warning · confirmed=info · preparing=brand · ready=violet · on_the_way=coral · delivered=success · cancelled=danger
// color = لون الشريط/الأيقونة، fg = لون النص على الخلفية الفاتحة bg (تباين مقروء)، icon = Ionicons
export const STATUS = {
  pending:    { label: 'بانتظار المطعم', color: COLORS.amber,    fg: COLORS.amberDeep, bg: COLORS.amberSoft,  icon: 'hourglass-outline' },
  confirmed:  { label: 'مؤكد',          color: COLORS.blue,     fg: COLORS.blueDeep,  bg: COLORS.blueSoft,   icon: 'checkmark-circle-outline' },
  preparing:  { label: 'قيد التحضير',    color: COLORS.primary,  fg: COLORS.brandText, bg: COLORS.brandSoft,  icon: 'flame-outline' },
  ready:      { label: 'جاهز',          color: COLORS.purple,   fg: COLORS.purpleDeep, bg: COLORS.purpleSoft, icon: 'bag-check-outline' },
  // 🧺 الطلب المجمّع: السائق يجمع الطلبات من المطاعم
  picking_up: { label: 'تجمع الطلبات',   color: COLORS.primary,  fg: COLORS.brandText, bg: COLORS.brandSoft,  icon: 'git-network-outline' },
  on_the_way: { label: 'في الطريق',      color: COLORS.coral,    fg: COLORS.coralDeep, bg: COLORS.coralSoft,  icon: 'bicycle-outline' },
  delivered:  { label: 'تم التوصيل',     color: COLORS.green,    fg: COLORS.greenDeep, bg: COLORS.greenSoft,  icon: 'checkmark-done' },
  cancelled:  { label: 'ملغي',          color: COLORS.red,      fg: COLORS.redDeep,   bg: COLORS.redSoft,    icon: 'close-circle-outline' },
};
// شارة "طلب مجمّع" بلون لا تستخدمه أي حالة
export const GROUP_CHIP = { color: COLORS.teal, fg: COLORS.tealDeep, bg: COLORS.tealSoft, icon: 'layers-outline' };
export const statusInfo = (s) => STATUS[s] || { label: s || '—', color: COLORS.gray, fg: COLORS.sub, bg: COLORS.bg, icon: 'ellipse-outline' };

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

// المصطلحات الموحّدة (X-11): «كاش عند الاستلام» · «محفظة وصلّي» · «إكرامية السائق» · «رسوم مطعم إضافي»
export const TERMS = { cash: 'كاش عند الاستلام', wallet: 'محفظة وصلّي', tip: 'إكرامية السائق', extraStopFee: 'رسوم مطعم إضافي' };
const PAY = { cash: TERMS.cash, card: 'بطاقة', online: 'دفع إلكتروني', wallet: TERMS.wallet, paid: 'مدفوع' };
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

// تواريخ بالتقويم الميلادي دائماً (ar-SA يعطي هجري) وأرقام لاتينية وبتوقيت فلسطين (X-08)
const LOCALE = 'ar-EG-u-ca-gregory-nu-latn';
export const TZ = 'Asia/Hebron';
// بعض محركات JS (Hermes القديم) ترفض timeZone → نعيد المحاولة بدونه ثم صيغة يدوية
function localeFmt(date, method, opts) {
  try { return date[method](LOCALE, { ...opts, timeZone: TZ }); } catch {}
  try { return date[method](LOCALE, opts); } catch {}
  return null;
}
const pad2 = (n) => String(n).padStart(2, '0');
export function fmtDate(d, withTime = true) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return String(d);
  const day = localeFmt(date, 'toLocaleDateString', { day: 'numeric', month: 'long', year: 'numeric', calendar: 'gregory' });
  const time = withTime ? localeFmt(date, 'toLocaleTimeString', { hour: '2-digit', minute: '2-digit', calendar: 'gregory' }) : '';
  if (day != null && time != null) return withTime ? `${day} · ${time}` : day;
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}${withTime ? ` ${pad2(date.getHours())}:${pad2(date.getMinutes())}` : ''}`;
}
export function fmtTime(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const t = localeFmt(date, 'toLocaleTimeString', { hour: '2-digit', minute: '2-digit' });
  return t != null ? t : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// تاريخ اليوم بتوقيت فلسطين "YYYY-MM-DD" (احتياط: تاريخ الجهاز)
export function hebronToday() {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => parts.find(p => p.type === t)?.value;
    const y = get('year'), m = get('month'), dd = get('day');
    if (y && m && dd) return `${y}-${m}-${dd}`;
  } catch {}
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
// إزاحة يوم على "YYYY-MM-DD" بحساب UTC (بلا أثر للتوقيت الصيفي)
export function shiftYmd(ymd, days) {
  const [y, m, dd] = String(ymd).split('-').map(Number);
  const t = Date.UTC(y, (m || 1) - 1, dd || 1) + days * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
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

// أرقام عربية/فارسية → لاتينية
export const toLatinDigits = (t) => String(t ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
// تنسيق رقم الهاتف للعرض/الإدخال: 05X XXX XXXX (الأرقام الدولية التي تبدأ بـ + تبقى بلا تقسيم)
export function formatPhone(raw) {
  const t = toLatinDigits(raw).trim();
  if (t.startsWith('+')) return `+${t.replace(/\D/g, '').slice(0, 15)}`;
  const all = t.replace(/\D/g, '');
  if (!all.startsWith('0') && all.length > 10) return all.slice(0, 15); // رقم دولي بلا + (مثل 970...)
  const d = all.slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}
