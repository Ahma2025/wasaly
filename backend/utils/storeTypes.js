// ═══════════════════════════════════════════════════════════════
//  أقسام المتاجر (store types) — مصدر الحقيقة الوحيد بالخادم
//  المفاتيح ≤ 20 حرفاً (restaurants.store_type VARCHAR(20))
//  'market' اسم قديم = supermarket (تطبيقات قديمة تطلب store_type=market لكل المتاجر غير المطاعم)
// ═══════════════════════════════════════════════════════════════
const STORE_TYPES = [
  { key: 'restaurant',  name_ar: 'مطاعم',            name_en: 'Restaurants',     emoji: '🍽️', icon: 'restaurant-outline', sort: 0 },
  { key: 'supermarket', name_ar: 'سوبرماركت',        name_en: 'Supermarkets',    emoji: '🛒', icon: 'cart-outline',       sort: 1 },
  { key: 'grocery',     name_ar: 'بقالة',            name_en: 'Grocery',         emoji: '🧺', icon: 'basket-outline',     sort: 2 },
  { key: 'pharmacy',    name_ar: 'صيدليات',          name_en: 'Pharmacies',      emoji: '💊', icon: 'medkit-outline',     sort: 3 },
  { key: 'telecom',     name_ar: 'اتصالات وموبايلات', name_en: 'Mobiles & Telecom', emoji: '📱', icon: 'phone-portrait-outline', sort: 4 },
  { key: 'pets',        name_ar: 'حيوانات أليفة',     name_en: 'Pets',            emoji: '🐾', icon: 'paw-outline',        sort: 5 },
  { key: 'sweets',      name_ar: 'حلويات ومخابز',     name_en: 'Sweets & Bakeries', emoji: '🧁', icon: 'ice-cream-outline', sort: 6 },
  { key: 'flowers',     name_ar: 'ورد وهدايا',        name_en: 'Flowers & Gifts', emoji: '💐', icon: 'flower-outline',     sort: 7 },
  { key: 'beauty',      name_ar: 'عطور وتجميل',       name_en: 'Beauty & Perfume', emoji: '💄', icon: 'sparkles-outline',  sort: 8 },
];
const KEYS = STORE_TYPES.map(t => t.key);
const BY_KEY = Object.fromEntries(STORE_TYPES.map(t => [t.key, t]));
const ALIASES = { market: 'supermarket' };
const LEGACY_MARKET = 'market'; // فلتر قديم: كل الأقسام غير المطاعم

// يطبّع قيمة (من الطلب أو القاعدة) إلى مفتاح معروف، أو null إن كانت غير معروفة
function normalize(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  const k = ALIASES[s] || s;
  return BY_KEY[k] ? k : null;
}
const isValid = (v) => normalize(v) !== null;

// قيم القاعدة المطابقة لمفتاح (supermarket يشمل القيمة القديمة market)
function dbValuesFor(key) {
  if (key === 'supermarket') return ['supermarket', 'market'];
  return [key];
}

/**
 * يحوّل ?store_type= إلى شرط SQL.
 *  - غير مرسل → null (المسار يقرّر الافتراضي)
 *  - 'market' (قديم) → كل الأنواع غير المطاعم
 *  - 'a,b' → قائمة؛ مفتاح واحد → تطابق تام
 * @returns {{ values: string[], includeNull: boolean } | { invalid: true } | null}
 */
function parseFilter(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const parts = String(raw).split(',').map(s => s.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (!parts.length) return null;
  const values = new Set();
  let includeNull = false;
  for (const p of parts) {
    if (p === LEGACY_MARKET) {
      for (const k of KEYS) if (k !== 'restaurant') dbValuesFor(k).forEach(v => values.add(v));
      continue;
    }
    const k = normalize(p);
    if (!k) return { invalid: true };
    dbValuesFor(k).forEach(v => values.add(v));
    if (k === 'restaurant') includeNull = true; // NULL = مطعم (بيانات قديمة)
  }
  return { values: [...values], includeNull };
}

// شكل عام للعميل
const publicList = () => STORE_TYPES.map(({ key, name_ar, name_en, emoji, icon, sort }) => ({ key, name_ar, name_en, emoji, icon, sort }));

module.exports = { STORE_TYPES, KEYS, BY_KEY, ALIASES, normalize, isValid, dbValuesFor, parseFilter, publicList };
