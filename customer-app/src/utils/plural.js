/*
  صيغ العدد + المعدود بالعربي (مفرد / مثنى / جمع / تمييز مفرد بعد 10)
    1  → «مطعم واحد»     2 → «مطعمين»     3..10 → «3 مطاعم»     11+ و 0 → «11 مطعم»
  الاستخدام: plural(n, 'restaurant')  أو  plural(n, ['صنف', 'صنفين', 'أصناف'])
  bare: true → بدون «واحد» مع المفرد (مثلاً «مطعم» فقط)
*/

// [مفرد، مثنى، جمع، مؤنث؟]
export const NOUNS = {
  restaurant:  ['مطعم', 'مطعمين', 'مطاعم'],
  store:       ['متجر', 'متجرين', 'متاجر'],
  item:        ['صنف', 'صنفين', 'أصناف'],
  piece:       ['قطعة', 'قطعتين', 'قطع', true],
  order:       ['طلب', 'طلبين', 'طلبات'],
  stop:        ['محطة', 'محطتين', 'محطات', true],
  day:         ['يوم', 'يومين', 'أيام'],
  review:      ['تقييم', 'تقييمين', 'تقييمات'],
  point:       ['نقطة', 'نقطتين', 'نقاط', true],
  minute:      ['دقيقة', 'دقيقتين', 'دقائق', true],
  participant: ['مشارك', 'مشاركين', 'مشاركين'],
  category:    ['تصنيف', 'تصنيفين', 'تصنيفات'],
  section:     ['قسم', 'قسمين', 'أقسام'],
  address:     ['عنوان', 'عنوانين', 'عناوين'],
  passenger:   ['راكب', 'راكبين', 'ركّاب'],
  notification:['إشعار', 'إشعارين', 'إشعارات'],
  delivery:    ['توصيلة', 'توصيلتين', 'توصيلات', true],
  choice:      ['اختيار', 'اختيارين', 'اختيارات'],
};

const toInt = (n) => {
  const x = Math.floor(Math.abs(Number(n) || 0));
  return Number.isFinite(x) ? x : 0;
};

/** الاسم فقط بالصيغة الصحيحة للعدد (بدون الرقم) */
export function pluralNoun(n, key) {
  const f = Array.isArray(key) ? key : (NOUNS[key] || [String(key), String(key), String(key)]);
  const c = toInt(n);
  if (c === 2) return f[1];
  if (c >= 3 && c <= 10) return f[2];
  return f[0];
}

/** العدد + المعدود: «مطعم واحد» / «مطعمين» / «3 مطاعم» / «11 مطعم» */
export function plural(n, key, { bare = false } = {}) {
  const f = Array.isArray(key) ? key : (NOUNS[key] || [String(key), String(key), String(key)]);
  const c = toInt(n);
  if (c === 1) return bare ? f[0] : `${f[0]} ${f[3] ? 'واحدة' : 'واحد'}`;
  if (c === 2) return f[1];
  if (c >= 3 && c <= 10) return `${c} ${f[2]}`;
  return `${c} ${f[0]}`;
}

/** «مطعم 3 من 4» — يخفي «من N» لو الترتيب أكبر من المجموع (بيانات غير متّسقة) */
export function ordinalOf(x, n) {
  const a = toInt(x), b = toInt(n);
  if (!a) return '';
  if (!b || a > b) return String(a);
  return `${a} من ${b}`;
}
