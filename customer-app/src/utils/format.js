/*
  تنسيقات مشتركة:
  - تواريخ/أوقات بأرقام لاتينية وتوقيت فلسطين (نفس أرقام الأسعار وأرقام الطلبات)
  - عزل الأرقام/الهواتف LTR داخل النص العربي (ما تنقلب «059 903 9704»)
  - توحيد رقم الجوال (00970 / +972 / 5XXXXXXXX → 05XXXXXXXX)
*/

const LOCALE = 'ar-EG-u-ca-gregory-nu-latn';
const TZ = 'Asia/Hebron';

const toDate = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? null : x;
};

// يجرّب مع المنطقة الزمنية ثم بدونها (بعض محرّكات Intl ما بتدعم timeZone)
function intl(date, opts, kind = 'toLocaleString') {
  try { return date[kind](LOCALE, { ...opts, timeZone: TZ }); } catch {}
  try { return date[kind](LOCALE, opts); } catch {}
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** «14:30» */
export function fmtTime(d) {
  const date = toDate(d);
  if (!date) return '';
  return intl(date, { hour: '2-digit', minute: '2-digit', hour12: false }, 'toLocaleTimeString')
    || `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** «5 أكتوبر» (month: 'long' | 'short') */
export function fmtDate(d, { month = 'long', year = false } = {}) {
  const date = toDate(d);
  if (!date) return '';
  return intl(date, { day: 'numeric', month, ...(year ? { year: 'numeric' } : {}) }, 'toLocaleDateString')
    || `${date.getDate()} ${MONTHS[date.getMonth()]}${year ? ` ${date.getFullYear()}` : ''}`;
}

/** «5 أكتوبر · 14:30» */
export function fmtDateTime(d, { month = 'long' } = {}) {
  const date = toDate(d);
  if (!date) return '';
  return `${fmtDate(date, { month })} · ${fmtTime(date)}`;
}

/** عزل نص LTR (أرقام هواتف/أكواد) داخل جملة عربية */
export const ltr = (s) => `‪${s == null ? '' : s}‬`;

// ── أرقام الجوال ──
export const toLatinDigits = (s) => String(s || '')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/**
  رقم موحّد: 00970/00972/+970/+972/970/972 → 0 ، و 9 أرقام تبدأ بـ 5 → 05XXXXXXXX
  partial=true (أثناء الكتابة): لا نحوّل البادئة إلا لو بعدها أرقام، ولا نضيف 0 لرقم ناقص
*/
export function canonicalPhone(raw, { partial = false } = {}) {
  let d = toLatinDigits(raw).replace(/\D/g, '');
  const m = d.match(/^(?:00)?(970|972)(\d*)$/);
  if (m && (!partial || m[2].length > 0)) d = '0' + m[2].replace(/^0+/, '');
  if (!partial && /^5\d{8}$/.test(d)) d = '0' + d;
  return d;
}

export const isMobilePhone = (d) => /^05\d{8}$/.test(String(d || ''));

/** «059 903 9704» */
export function prettyPhone(raw) {
  const d = canonicalPhone(raw);
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return d;
}
