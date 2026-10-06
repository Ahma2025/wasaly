// حدود اليوم/الأسبوع/الشهر بتوقيت فلسطين (Asia/Hebron) كنطاقات نصف مفتوحة [start, end)
// تُرجَع كنص UTC "naive" ('YYYY-MM-DD HH:MM:SS.mmm') لأن أعمدة TIMESTAMP (بلا منطقة) مخزّنة بتوقيت UTC.
// الاستعمال: `created_at >= $1::timestamp AND created_at < $2::timestamp` → يستخدم الفهارس (sargable)
// بدل `(created_at AT TIME ZONE ...)::date = ...` الذي يحوّل كل صف.
const TZ = 'Asia/Hebron';

const _fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function localParts(date) {
  const p = {};
  for (const { type, value } of _fmt.formatToParts(date)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour === 24 ? 0 : +p.hour, mi: +p.minute, s: +p.second };
}
// فرق التوقيت (ms) للمنطقة عند لحظة UTC معيّنة
function offsetAt(utcMs) {
  const p = localParts(new Date(utcMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}
// منتصف ليل محلي (y,m,d) → لحظة UTC (مع مراعاة التوقيت الصيفي)
function localMidnightUtc(y, m, d) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // تكرار ثانٍ لتصحيح الانتقال الصيفي/الشتوي
  return t;
}
const naive = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');

/**
 * @param kind 'day' | 'week' (آخر 7 أيام تقويمية تشمل اليوم) | 'month' (الشهر الحالي)
 * @param now  Date (للاختبار)
 */
function hebronRange(kind = 'day', now = new Date()) {
  const p = localParts(now);
  let start, end;
  if (kind === 'month') {
    start = localMidnightUtc(p.y, p.m, 1);
    const ny = p.m === 12 ? p.y + 1 : p.y, nm = p.m === 12 ? 1 : p.m + 1;
    end = localMidnightUtc(ny, nm, 1);
  } else {
    const dayStart = new Date(Date.UTC(p.y, p.m - 1, p.d));
    const next = new Date(dayStart.getTime() + 24 * 3600 * 1000);
    end = localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
    if (kind === 'week') {
      const w = new Date(dayStart.getTime() - 6 * 24 * 3600 * 1000);
      start = localMidnightUtc(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate());
    } else {
      start = localMidnightUtc(p.y, p.m, p.d);
    }
  }
  return { start: naive(start), end: naive(end) };
}

/** آخر n تواريخ تقويمية بتوقيت فلسطين ('YYYY-MM-DD') تصاعدياً — تنتهي باليوم (حساب تقويمي، لا يتأثر بالتوقيت الصيفي) */
function lastLocalDates(n, now = new Date()) {
  const p = localParts(now);
  const base = Date.UTC(p.y, p.m - 1, p.d, 12);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 24 * 3600 * 1000).toISOString().slice(0, 10));
  return out;
}
/** آخر n أشهر بتوقيت فلسطين ('YYYY-MM') تصاعدياً — تنتهي بالشهر الحالي */
function lastLocalMonths(n, now = new Date()) {
  const p = localParts(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(p.y, p.m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}
/** تعبئة صفوف مجمّعة حسب مفتاح تاريخ بأصفار للمفاتيح الناقصة */
function fillSeries(keys, rows, keyField, zero) {
  const m = new Map((rows || []).map(r => [String(r[keyField]), r]));
  return keys.map(k => m.get(k) || { [keyField]: k, ...zero });
}

// منتصف ليل محلي (y, m, d) كنص UTC naive للمقارنة مع أعمدة TIMESTAMP (d قد يتجاوز الشهر → يلتف تلقائياً)
const localMidnightNaive = (y, m, d) => naive(localMidnightUtc(y, m, d));

module.exports = { hebronRange, TZ, lastLocalDates, lastLocalMonths, fillSeries, localParts, localMidnightNaive };
