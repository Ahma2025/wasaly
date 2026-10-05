// أدوات HTTP مشتركة: ردود أخطاء موحّدة (بلا تسريب تفاصيل) + تحقّق من معاملات الاستعلام
const GENERIC_500 = 'حدث خطأ، حاول مرة أخرى';
const BAD_VALUE = 'قيمة غير صالحة في الطلب';

// أكواد Postgres الناتجة عن مدخلات غير صالحة (ليست أعطال خادم) → 400
//   22P02 invalid_text_representation (مثلاً "abc" لعمود integer) | 22003 numeric_value_out_of_range
//   22007/22008 تاريخ/وقت غير صالح | 2201W/2201X LIMIT/OFFSET سالب | 22023 invalid_parameter_value | 22001 نص أطول من العمود
const PG_INPUT_ERRORS = new Set(['22P02', '22003', '22007', '22008', '2201W', '2201X', '22023', '22001']);
const isInputError = (e) => !!(e && e.code && PG_INPUT_ERRORS.has(String(e.code)));

/** رد خطأ موحّد: مدخلات غير صالحة → 400، غير ذلك → 500 برسالة عامة (والخطأ الحقيقي بالسجل فقط) */
function serverError(res, e, tag) {
  if (res.headersSent) return undefined;
  if (isInputError(e)) return res.status(400).json({ success: false, message: BAD_VALUE });
  console.error(`[${tag || (res.req && `${res.req.method} ${res.req.baseUrl || ''}${res.req.path || ''}`) || 'route'}]`, (e && (e.stack || e.message)) || e);
  return res.status(500).json({ success: false, message: GENERIC_500 });
}

// معامل استعلام صحيح موجب (أو صفر). يرجّع: undefined إن غاب، null إن كان غير صالح، وإلا رقماً
function intParam(v) {
  if (v === undefined || v === '') return undefined;
  if (Array.isArray(v) || typeof v === 'object') return null;
  const s = String(v).trim();
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = Number(s);
  return n <= 2147483647 ? n : null;
}

// limit/offset/page آمنة (لا قيم سالبة تُسقط الاستعلام بـ 500)
function clampInt(v, def, min, max) {
  const n = parseInt(Array.isArray(v) ? v[0] : v, 10);
  if (!Number.isFinite(n) || (n === 0 && min > 0)) return def; // نفس سلوك `parseInt(x) || def` القديم للصفر
  return Math.min(max, Math.max(min, n));
}

const strParam = (v) => (v === undefined || v === null ? undefined : String(Array.isArray(v) ? v[0] : v));

module.exports = { serverError, isInputError, intParam, clampInt, strParam, GENERIC_500, BAD_VALUE };
