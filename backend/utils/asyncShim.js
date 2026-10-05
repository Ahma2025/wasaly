// 🛡️ Express 4 لا يلتقط أخطاء الدوال async — أي رفض (rejection) داخل route كان يعلّق الطلب للأبد.
// هذا الـ shim يلفّ كل Layer: لو رجّع المعالج Promise مرفوض نمرّر الخطأ لـ next() → معالج الأخطاء المركزي.
// يجب تحميله مرة واحدة قبل تسجيل أي route (أول سطر بعد dotenv في server.js).
const Layer = require('express/lib/router/layer');

if (!Layer.prototype.__wasalyAsyncPatched) {
  const original = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handleRequestAsyncSafe(req, res, next) {
    const fn = this.handle;
    // معالجات الأخطاء (4 وسائط) تمرّ على المسار الأصلي
    if (typeof fn !== 'function' || fn.length > 3) return original.call(this, req, res, next);
    try {
      const ret = fn(req, res, next);
      if (ret && typeof ret.then === 'function') {
        ret.then(undefined, (err) => next(err || new Error('Unhandled async route error')));
      }
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__wasalyAsyncPatched = true;
}

module.exports = true;
