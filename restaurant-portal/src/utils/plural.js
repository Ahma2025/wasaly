// ═══════════════════════════════════════════════════════════════
//  صيغ العدد العربية (مفرد / مثنى / جمع قلة / تمييز مفرد منصوب)
//  1 → «طلب واحد» · 2 → «طلبان» · 3-10 → «3 طلبات» · 11-99 → «11 طلبًا» · 100 → «100 طلب»
//  القاعدة على آخر رقمين (CLDR): 3-10 جمع، 11-99 مفرد منصوب، والباقي (100، 101، 102…) مفرد مجرور
// ═══════════════════════════════════════════════════════════════

/**
 * @param {number} n
 * @param {{one:string,two:string,few:string,many:string,other:string,zero?:string}} w
 */
export function plural(n, w) {
  const c = Math.abs(Math.trunc(Number(n) || 0));
  if (c === 0) return w.zero != null ? w.zero : `0 ${w.other}`;
  if (c === 1) return w.one;
  if (c === 2) return w.two;
  const r = c % 100;
  if (r >= 3 && r <= 10) return `${c} ${w.few}`;
  if (r >= 11 && r <= 99) return `${c} ${w.many}`;
  return `${c} ${w.other}`;
}

// كلمات جاهزة (الرفع للمثنى حيث يكون العدد فاعلًا/مبتدأ، والجر بعد «من»)
export const W = {
  order: { one: 'طلب واحد', two: 'طلبان', few: 'طلبات', many: 'طلبًا', other: 'طلب' },
  orderGen: { one: 'طلب واحد', two: 'طلبين', few: 'طلبات', many: 'طلبًا', other: 'طلب' },
  restaurant: { one: 'مطعم واحد', two: 'مطعمان', few: 'مطاعم', many: 'مطعمًا', other: 'مطعم' },
  restaurantGen: { one: 'مطعم واحد', two: 'مطعمين', few: 'مطاعم', many: 'مطعمًا', other: 'مطعم' },
  stop: { one: 'محطة واحدة', two: 'محطتان', few: 'محطات', many: 'محطة', other: 'محطة' },
  day: { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يومًا', other: 'يوم' },
  dayGen: { one: 'يوم واحد', two: 'يومين', few: 'أيام', many: 'يومًا', other: 'يوم' },
  review: { one: 'تقييم واحد', two: 'تقييمان', few: 'تقييمات', many: 'تقييمًا', other: 'تقييم' },
  reviewGen: { one: 'تقييم واحد', two: 'تقييمين', few: 'تقييمات', many: 'تقييمًا', other: 'تقييم' },
  item: { one: 'صنف واحد', two: 'صنفان', few: 'أصناف', many: 'صنفًا', other: 'صنف' },
  category: { one: 'فئة واحدة', two: 'فئتان', few: 'فئات', many: 'فئة', other: 'فئة' },
  piece: { one: 'قطعة واحدة', two: 'قطعتان', few: 'قطع', many: 'قطعة', other: 'قطعة' },
  minute: { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة', other: 'دقيقة' },
  message: { one: 'رسالة واحدة', two: 'رسالتان', few: 'رسائل', many: 'رسالة', other: 'رسالة' },
};

// اختصار: pl(3, 'order') → «3 طلبات»
export const pl = (n, key) => plural(n, W[key] || W.order);

// اسم المعدود فقط حسب العدد (عندما يُعرض الرقم منفصلًا بخط كبير): 1 طلب، 2 طلب، 3 طلبات، 11 طلبًا
export function noun(n, key) {
  const w = W[key] || W.order;
  const c = Math.abs(Math.trunc(Number(n) || 0));
  const r = c % 100;
  if (c >= 3 && r >= 3 && r <= 10) return w.few;
  if (r >= 11 && r <= 99) return w.many;
  return w.other;
}
