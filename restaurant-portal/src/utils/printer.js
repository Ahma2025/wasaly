// ═══════════════════════════════════════════════════════════════
//  طباعة الطلبات على ماكنة الإيصالات (ESC/POS)
//  - يعمل داخل تطبيق أندرويد (Capacitor) فقط، ويتجاهل بأمان على المتصفح
//  - يدعم: بلوتوث / USB / شبكة (TCP)
//  - يطبع الإيصال كـ«صورة» لضمان ظهور العربية 100% مهما كانت الماكنة
//  - الربط ذاتي: كل مطعم يختار ماكنته مرة وحدة من الإعدادات
//  يعتمد على إضافة: thermal-printer-cordova-plugin
// ═══════════════════════════════════════════════════════════════

const PKEY = 'wasaly_printer';
const AUTOKEY = 'wasaly_printer_autoprint';

// الوصول للإضافة وقت التشغيل فقط (بدون import) — عشان نسخة الويب تبقى تبني نظيف
const TP = () => {
  if (typeof window === 'undefined') return null;
  return window.ThermalPrinter
    || (window.cordova && window.cordova.plugins && window.cordova.plugins.ThermalPrinter)
    || null;
};

export const isPrinterSupported = () => !!TP();

// ─── حفظ/استرجاع الماكنة المختارة (لكل جهاز) ───
export const getSavedPrinter = () => { try { return JSON.parse(localStorage.getItem(PKEY) || 'null'); } catch { return null; } };
export const savePrinter = (p) => { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {} };
export const clearPrinter = () => { try { localStorage.removeItem(PKEY); } catch {} };
export const isAutoPrint = () => { try { return localStorage.getItem(AUTOKEY) !== '0'; } catch { return true; } };
export const setAutoPrint = (v) => { try { localStorage.setItem(AUTOKEY, v ? '1' : '0'); } catch {} };

// ─── صلاحيات (USB/بلوتوث) ───
export function requestPermissions(type = 'bluetooth') {
  const t = TP();
  if (!t || !t.requestPermissions) return Promise.resolve();
  return new Promise((res) => t.requestPermissions({ type }, res, res));
}

// ─── بحث عن الماكنات المتاحة (بلوتوث/USB فقط) ───
export function listPrinters(type = 'bluetooth') {
  const t = TP();
  return new Promise((resolve, reject) => {
    if (!t) return resolve([]);
    t.listPrinters(
      { type },
      (list) => resolve((list || []).map((d) => ({
        type,
        name: d.name || d.deviceName || d.productName || 'طابعة',
        address: d.address || d.macAddress || d.id || d.deviceId || d.target,
      }))),
      (e) => reject(e)
    );
  });
}

// ─── طابعة شبكة: تُحفظ يدويًا بالـ IP ───
export function makeNetworkPrinter(ip, port = 9100) {
  return { type: 'tcp', name: 'شبكة ' + ip, address: ip, port: Number(port) || 9100 };
}

function parseOpts(it) {
  try { return typeof it.options === 'string' ? JSON.parse(it.options) : (it.options || []); } catch { return []; }
}

// ─── رسم الإيصال كصورة (RTL عربي) عبر canvas ───
export function renderTicketImage(order, restaurant, items = []) {
  const W = 576;               // عرض ورق 80mm ≈ 576px
  const pad = 20;
  const R = W - pad;
  let y = 46;
  const c = document.createElement('canvas');
  const g0 = c.getContext ? c : document.createElement('canvas');
  // ارتفاع تقديري
  const optCount = items.reduce((n, it) => n + parseOpts(it).length + (it.notes ? 1 : 0), 0);
  c.width = W;
  c.height = 520 + items.length * 40 + optCount * 30;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';

  const center = (txt, size, bold) => { g.textAlign = 'center'; g.font = `${bold ? 'bold ' : ''}${size}px "Tajawal", Arial, sans-serif`; g.fillText(txt, W / 2, y); };
  const right = (txt, size, bold) => { g.textAlign = 'right'; g.font = `${bold ? 'bold ' : ''}${size}px "Tajawal", Arial, sans-serif`; g.fillText(txt, R, y); };
  const priceLeft = (txt, size) => { g.textAlign = 'left'; g.font = `bold ${size}px "Tajawal", Arial, sans-serif`; g.fillText(txt, pad, y); };
  const hr = () => { g.fillRect(pad, y - 10, W - 2 * pad, 2); };

  center(restaurant?.name_ar || 'وصلّي', 38, true); y += 46;
  center('طلب #' + (order.order_number || order.id || ''), 30, true); y += 40;
  center(new Date(order.created_at || Date.now()).toLocaleString('ar-EG'), 20); y += 34;
  hr(); y += 30;

  right('الزبون: ' + (order.customer_name || '—'), 24, true); y += 34;
  if (order.customer_phone) { right('الهاتف: ' + order.customer_phone, 22); y += 32; }
  right('النوع: ' + (order.order_type === 'delivery' ? 'توصيل 🛵' : 'استلام 🏃'), 22); y += 32;
  if (order.delivery_address) { right('العنوان: ' + order.delivery_address, 20); y += 32; }
  if (order.notes) { right('ملاحظة: ' + order.notes, 20); y += 32; }
  hr(); y += 32;

  items.forEach((it) => {
    right(`${it.quantity}× ${it.name_ar || it.name || ''}`, 26, true);
    priceLeft(`${parseFloat(it.subtotal || (it.price * it.quantity) || 0).toFixed(2)}`, 26);
    y += 36;
    parseOpts(it).forEach((o) => { right('   + ' + (o.name_ar || o.name || o.label || ''), 20); y += 30; });
    if (it.notes) { right('   * ' + it.notes, 20); y += 30; }
  });

  hr(); y += 38;
  right('الإجمالي:', 30, true);
  priceLeft(parseFloat(order.total || 0).toFixed(2) + ' ₪', 32);
  y += 48;
  center('وصلّي — نتمنى لكم التوفيق 🙏', 20); y += 30;

  return c.toDataURL('image/png');
}

// ─── طباعة صورة على الماكنة ───
export function printImageBase64(base64, printer) {
  const t = TP();
  const p = printer || getSavedPrinter();
  return new Promise((resolve, reject) => {
    if (!t) return reject(new Error('الطباعة غير متاحة — افتح التطبيق على جهاز الأندرويد'));
    if (!p) return reject(new Error('لم يتم ربط أي ماكنة'));
    const img = String(base64).replace(/^data:image\/\w+;base64,/, '');
    const text = `[C]<img>${img}</img>\n\n\n`;
    const opts = p.type === 'tcp'
      ? { type: 'tcp', address: p.address, port: p.port || 9100, text, mmFeedPaper: 5 }
      : { type: p.type || 'bluetooth', id: p.address, text, mmFeedPaper: 5 };
    const fn = t.printFormattedTextAndCut || t.printFormattedText;
    fn.call(t, opts, () => resolve(true), (e) => reject(e));
  });
}

// ─── طباعة طلب كامل ───
export async function printOrder(order, restaurant, items) {
  const base64 = renderTicketImage(order, restaurant, items || order.items || []);
  return printImageBase64(base64);
}

// ─── طباعة تجريبية ───
export async function testPrint(restaurant, printer) {
  const sample = {
    order_number: 'TEST', id: 'TEST', created_at: Date.now(),
    customer_name: 'طباعة تجريبية', order_type: 'delivery', total: 0,
  };
  const base64 = renderTicketImage(sample, restaurant, [
    { quantity: 1, name_ar: 'صنف تجريبي', price: 0, subtotal: 0, options: [] },
  ]);
  return printImageBase64(base64, printer);
}
