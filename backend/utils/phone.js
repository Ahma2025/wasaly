// ═══════════════════════════════════════════════════════════════
//  C-22: رقم جوال موحّد — نفس الشخص = نفس الحساب مهما كتب الرقم
//  أرقام عربية-هندية → لاتينية، حذف أي رمز غير رقمي، 00970/00972/970/972 → 0، و9 أرقام تبدأ بـ5 → 05XXXXXXXX
//  (نفس القواعد في migration التوحيد بـ config/migrations.js)
// ═══════════════════════════════════════════════════════════════
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function digitsOnly(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(FA_DIGITS.indexOf(d)))
    .replace(/\D/g, '');
}

function canonicalPhone(v) {
  const d = digitsOnly(v);
  if (/^00(970|972)5\d{8}$/.test(d)) return '0' + d.slice(5);
  if (/^(970|972)5\d{8}$/.test(d)) return '0' + d.slice(3);
  if (/^5\d{8}$/.test(d)) return '0' + d;
  return d;
}

// رقم جوال فلسطيني/داخل صالح للتسجيل الذاتي
const isMobile = (p) => /^05\d{8}$/.test(String(p || ''));

/** قيم البحث عن مستخدم برقمه: الموحّد + الأرقام الخام (حسابات قديمة لم تُوحَّد لتعارض) */
function phoneCandidates(v) {
  const c = canonicalPhone(v), d = digitsOnly(v);
  return [...new Set([c, d].filter(Boolean))];
}

module.exports = { canonicalPhone, digitsOnly, isMobile, phoneCandidates };
