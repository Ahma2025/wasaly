// صيغ العدد العربية الصحيحة (مفرد/مثنى/جمع/تمييز منصوب) — بدل "2 مطاعم" و"1 مطاعم" و"5 يوم"
// arCount(n, 'restaurant') → "مطعم واحد" · "مطعمين" · "3 مطاعم" · "11 مطعماً" · "100 مطعم"
// الأرقام لاتينية دائماً (متوافقة مع الأسعار وأرقام الطلبات)

export const WORDS = {
  //            مفرد        مثنى         جمع (3-10)  تمييز (11-99)  "واحد" مؤنث؟
  restaurant: { one: 'مطعم', two: 'مطعمين', few: 'مطاعم', many: 'مطعماً', fem: false },
  stop:       { one: 'محطة', two: 'محطتين', few: 'محطات', many: 'محطة', fem: true },
  day:        { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوماً', fem: false },
  review:     { one: 'تقييم', two: 'تقييمين', few: 'تقييمات', many: 'تقييماً', fem: false },
  order:      { one: 'طلب', two: 'طلبين', few: 'طلبات', many: 'طلباً', fem: false },
  delivery:   { one: 'توصيلة', two: 'توصيلتين', few: 'توصيلات', many: 'توصيلة', fem: true },
  piece:      { one: 'قطعة', two: 'قطعتين', few: 'قطع', many: 'قطعة', fem: true },
  item:       { one: 'صنف', two: 'صنفين', few: 'أصناف', many: 'صنفاً', fem: false },
  second:     { one: 'ثانية', two: 'ثانيتين', few: 'ثوانٍ', many: 'ثانية', fem: true },
  minute:     { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة', fem: true },
};

const toInt = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(0, v) : 0;
};

/**
 * @param {number} n العدد
 * @param {string|object} word مفتاح من WORDS أو كائن { one, two, few, many, fem }
 * @param {object} [opts] { zero: نص للصفر، bare: بدون "واحد/واحدة" للمفرد }
 */
export function arCount(n, word, opts = {}) {
  const w = typeof word === 'string' ? WORDS[word] : word;
  if (!w) return String(n);
  const v = toInt(n);
  if (v === 0) return opts.zero != null ? opts.zero : `0 ${w.many}`;
  if (v === 1) return opts.bare ? w.one : `${w.one} ${w.fem ? 'واحدة' : 'واحد'}`;
  if (v === 2) return w.two;
  const r = v % 100;
  if (r >= 3 && r <= 10) return `${v} ${w.few}`;
  if (r >= 11) return `${v} ${w.many}`;
  return `${v} ${w.one}`; // 100، 101، 102، 200 ...
}

// اسم المعدود فقط حسب العدد (للعناوين التي تعرض الرقم منفصلاً بخط كبير)
export function arNoun(n, word) {
  const w = typeof word === 'string' ? WORDS[word] : word;
  if (!w) return '';
  const v = toInt(n);
  if (v === 2) return w.two;
  const r = v % 100;
  if (v !== 0 && r >= 3 && r <= 10) return w.few;
  if (v === 1 || r <= 2) return w.one;
  return w.many;
}
