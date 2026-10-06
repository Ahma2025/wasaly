// ═══════════════════════════════════════════════════════════════
//  طباعة الطلبات على ماكنة الإيصالات (ESC/POS)
//  - يعمل داخل تطبيق أندرويد (Capacitor) فقط، ويتجاهل بأمان على المتصفح
//  - يدعم: بلوتوث / USB / شبكة (TCP)
//  - يرسم الإيصال كصورة (لضمان العربية) ثم يحوّلها لصيغة hex الخاصة بالماكنة
//    عبر bitmapToHexadecimalString، ويقطّعها لشرائح ≤ 256px (حد مكتبة DantSu)
//  يعتمد على: thermal-printer-cordova-plugin + إضافة أذونات محلية (PrinterPermissions)
// ═══════════════════════════════════════════════════════════════
import { Capacitor, registerPlugin } from '@capacitor/core';
import { orderNo, num, parseOptions, optionName, optionPrice, paymentLabel, isGroupOrder, groupLabel } from './format';

const PKEY = 'wasaly_printer';
const AUTOKEY = 'wasaly_printer_autoprint';
const PAPERKEY = 'wasaly_printer_paper';

const DPI = 203;
const SLICE_H = 240; // ≤ 256px لكل صورة
// 80mm: مساحة طباعة 72mm / 48 حرف — 58mm: مساحة طباعة 48mm / 32 حرف
export const PAPERS = {
  '80': { label: '80 مم', widthMM: 72, chars: 48 },
  '58': { label: '58 مم', widthMM: 48, chars: 32 },
};

// إضافة أندرويد محلية لطلب أذونات البلوتوث (Android 12+) و USB
const NativePerms = registerPlugin('PrinterPermissions');

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
export const getPaperSize = () => { try { return PAPERS[localStorage.getItem(PAPERKEY)] ? localStorage.getItem(PAPERKEY) : '80'; } catch { return '80'; } };
export const setPaperSize = (v) => { try { localStorage.setItem(PAPERKEY, PAPERS[v] ? v : '80'); } catch {} };

// ─── رسائل أخطاء مفهومة بالعربي ───
const PERMISSION_MSG = 'اسمح للتطبيق بإذن «الأجهزة القريبة» (Nearby devices) من: الإعدادات ← التطبيقات ← وصلّي مطعم ← الأذونات، ثم حاول مرة ثانية';

function rawError(e) {
  if (!e) return 'خطأ غير معروف';
  if (typeof e === 'string') return e;
  if (e.error) return String(e.error);
  if (e.message) return String(e.message);
  try { return JSON.stringify(e); } catch { return String(e); }
}

export function printerError(e) {
  if (e && e.__friendly) return e;
  const raw = rawError(e);
  let msg = raw;
  let needsSettings = false;
  if (/BLUETOOTH_CONNECT|BLUETOOTH_SCAN|SecurityException|Missing permission|permission/i.test(raw)) { msg = PERMISSION_MSG; needsSettings = true; }
  else if (/not enabled Bluetooth/i.test(raw)) msg = 'البلوتوث مطفأ — شغّله من إعدادات الجهاز وحاول مرة ثانية';
  else if (/doesn't support Bluetooth/i.test(raw)) msg = 'هذا الجهاز لا يدعم البلوتوث';
  else if (/Device not found|not connected/i.test(raw)) msg = 'لم نجد الماكنة — تأكد أنها مشغّلة ومقترنة بالبلوتوث أو موصولة بالـ USB';
  else if (/connect|ECONNREFUSED|timed? ?out|EHOSTUNREACH|socket/i.test(raw)) msg = 'تعذّر الاتصال بالماكنة — تأكد أنها مشغّلة وقريبة (أو على نفس شبكة الواي فاي)';
  const err = new Error(msg);
  err.__friendly = true;
  err.raw = raw;
  err.needsSettings = needsSettings;
  return err;
}

// ─── أذونات ───
const isAndroid = () => Capacitor.getPlatform() === 'android';

// طلب إذن «الأجهزة القريبة» (BLUETOOTH_CONNECT/SCAN) على أندرويد 12+
export async function ensureBluetoothPermission() {
  if (!isAndroid()) return true;
  try {
    const r = await NativePerms.requestBluetooth();
    return !!r?.granted;
  } catch {
    // الإضافة غير موجودة في هذا البناء — نجرب مباشرة ونعرض إرشادًا عند الخطأ
    return true;
  }
}

export async function ensureUsbPermission(deviceId) {
  if (!isAndroid() || deviceId == null) return true;
  try {
    const r = await NativePerms.requestUsb({ deviceId: Number(deviceId) });
    return !!r?.granted;
  } catch { return true; }
}

export async function openAppSettings() {
  try { await NativePerms.openAppSettings(); } catch {}
}

// للتوافق مع الكود القديم
export async function requestPermissions(type = 'bluetooth') {
  if (type === 'bluetooth') return ensureBluetoothPermission();
  return true;
}

function call(method, opts) {
  const t = TP();
  return new Promise((resolve, reject) => {
    if (!t || typeof t[method] !== 'function') return reject(printerError('الطباعة غير متاحة — افتح التطبيق على جهاز الأندرويد'));
    try {
      t[method](opts, (res) => resolve(res), (e) => reject(printerError(e)));
    } catch (e) { reject(printerError(e)); }
  });
}

// ─── بحث عن الماكنات المتاحة (بلوتوث/USB) ───
export async function listPrinters(type = 'bluetooth') {
  if (!TP()) return [];
  if (type === 'bluetooth') {
    const ok = await ensureBluetoothPermission();
    if (!ok) throw printerError('SecurityException: BLUETOOTH_CONNECT');
  }
  const list = await call('listPrinters', { type });
  return (Array.isArray(list) ? list : []).map((d) => ({
    type,
    name: d.name || d.deviceName || d.productName || (type === 'usb' ? 'طابعة USB' : 'طابعة'),
    address: String(d.address || d.macAddress || d.deviceId || d.id || d.target || ''),
  })).filter(p => p.address);
}

// ─── طابعة شبكة ───
export const isValidIp = (ip) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(ip || '').trim());
export function makeNetworkPrinter(ip, port = 9100) {
  const p = Number(port) || 9100;
  return { type: 'tcp', name: `شبكة ${ip}:${p}`, address: String(ip).trim(), port: p };
}

function connectionOpts(p) {
  const paper = PAPERS[getPaperSize()];
  const o = {
    type: p.type || 'bluetooth',
    printerDpi: DPI,
    printerWidthMM: paper.widthMM,
    printerNbrCharactersPerLine: paper.chars,
  };
  if (o.type === 'tcp') { o.id = p.address; o.address = p.address; o.port = Number(p.port) || 9100; }
  else o.id = String(p.address);
  return o;
}

// ═══ رسم الإيصال ═══
const FONT = '"Tajawal", "Segoe UI", Arial, sans-serif';
const stripEmoji = (s) => {
  try { return String(s ?? '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim(); }
  catch { return String(s ?? ''); }
};

function wrapText(g, text, maxW) {
  const words = stripEmoji(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const pushLong = (w) => { // كلمة أطول من السطر — نكسرها حرفيًا
    let part = '';
    for (const ch of w) {
      if (g.measureText(part + ch).width > maxW && part) { lines.push(part); part = ch; }
      else part += ch;
    }
    return part;
  };
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width <= maxW) { line = test; continue; }
    if (line) lines.push(line);
    line = g.measureText(w).width > maxW ? pushLong(w) : w;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// يبني الإيصال على canvas بعرض الماكنة الفعلي ويعيد الـ canvas
export function renderTicketCanvas(order, restaurant, items = []) {
  const paper = PAPERS[getPaperSize()];
  const W = Math.round(paper.widthMM * DPI / 25.4); // 575px لـ 80mm، 378px لـ 58mm
  const k = W / 576;
  const pad = Math.round(14 * k);
  const inner = W - pad * 2;
  const S = (n) => Math.max(14, Math.round(n * k));

  const meas = document.createElement('canvas').getContext('2d');
  const ops = [];
  const font = (size, bold) => `${bold ? 'bold ' : ''}${size}px ${FONT}`;

  const text = (t, { size = 22, bold = false, align = 'right', price = null, gapAfter = 6 } = {}) => {
    const sz = S(size);
    meas.font = font(sz, bold);
    const priceW = price ? meas.measureText(price).width + S(14) : 0;
    const lines = wrapText(meas, t, inner - priceW);
    const lh = Math.round(sz * 1.32);
    lines.forEach((ln, i) => ops.push({ kind: 'text', text: ln, size: sz, bold, align, price: i === 0 ? price : null, h: lh }));
    if (gapAfter) ops.push({ kind: 'gap', h: Math.round(gapAfter * k) });
  };
  const hr = (dashed = false) => ops.push({ kind: 'hr', dashed, h: Math.round(18 * k) });
  const banner = (t, size = 26) => ops.push({ kind: 'banner', text: stripEmoji(t), size: S(size), h: Math.round(S(size) * 1.8) + Math.round(8 * k) });
  const gap = (h) => ops.push({ kind: 'gap', h: Math.round(h * k) });

  const isDelivery = order.order_type === 'delivery';
  gap(10);
  text(restaurant?.name_ar || 'وصلّي', { size: 34, bold: true, align: 'center' });
  text(`طلب #${orderNo(order)}`, { size: 44, bold: true, align: 'center', gapAfter: 8 });
  banner(isDelivery ? 'توصيل' : 'استلام من المحل');
  if (isGroupOrder(order)) {
    banner(groupLabel(order), 24);
    text('سائق واحد يجمع من عدة مطاعم — جهّز الطلب في وقته', { size: 20, align: 'center' });
  }
  const d = new Date(order.created_at || Date.now());
  text(`${d.toLocaleDateString('ar-EG')}  ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}`, { size: 22, align: 'center' });
  hr();

  text(`الزبون: ${order.customer_name || '—'}`, { size: 24, bold: true });
  if (order.customer_phone) text(`الهاتف: ${order.customer_phone}`, { size: 22 });
  if (isDelivery && order.delivery_address) text(`العنوان: ${order.delivery_address}`, { size: 22 });
  if (order.notes) text(`ملاحظة الطلب: ${order.notes}`, { size: 22, bold: true });
  hr();

  (items || []).forEach((it) => {
    const qty = parseInt(it.quantity) || 1;
    const line = num(it.subtotal) || num(it.price) * qty;
    text(`${qty}× ${it.name_ar || it.name || ''}`, { size: 26, bold: true, price: line.toFixed(2), gapAfter: 2 });
    parseOptions(it).forEach((o) => {
      const p = optionPrice(o);
      text(`  + ${optionName(o)}`, { size: 21, price: p > 0 ? `+${p.toFixed(2)}` : null, gapAfter: 0 });
    });
    if (it.notes) text(`  ملاحظة: ${it.notes}`, { size: 21, gapAfter: 0 });
    gap(10);
  });
  hr();

  const subtotal = order.subtotal != null ? num(order.subtotal)
    : (items || []).reduce((s, it) => s + (num(it.subtotal) || num(it.price) * (parseInt(it.quantity) || 1)), 0);
  text('المجموع الفرعي', { size: 23, price: subtotal.toFixed(2), gapAfter: 2 });
  if (isDelivery && !isGroupOrder(order)) text('رسوم التوصيل', { size: 23, price: num(order.delivery_fee).toFixed(2), gapAfter: 2 });
  const discounts = [
    ['الخصم', order.discount],
    ['خصم الكوبون', order.coupon_discount],
    ['خصم الطلب الأول', order.first_order_discount],
    ['نقاط الولاء', order.points_value],
    ['من المحفظة', order.wallet_used],
  ];
  discounts.forEach(([l, v]) => { if (num(v) > 0) text(l, { size: 23, price: `-${num(v).toFixed(2)}`, gapAfter: 2 }); });
  if (num(order.tip) > 0) text('إكرامية السائق', { size: 23, price: num(order.tip).toFixed(2), gapAfter: 2 });
  hr(true);
  text('الإجمالي', { size: 32, bold: true, price: `${num(order.total).toFixed(2)} ₪` });
  const paid = order.payment_status === 'paid';
  text(`الدفع: ${paymentLabel(order.payment_method)}${paid ? ' (مدفوع)' : ''}`, { size: 22, bold: true });
  hr();
  text('وصلّي — شكراً لكم', { size: 20, align: 'center' });
  gap(16);

  const H = ops.reduce((s, o) => s + o.h, 0);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.max(H, 40);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, c.height);
  g.fillStyle = '#000';
  g.textBaseline = 'alphabetic';

  let y = 0;
  for (const o of ops) {
    if (o.kind === 'text') {
      g.font = font(o.size, o.bold);
      const base = y + Math.round(o.size * 1.02);
      g.direction = 'rtl';
      if (o.align === 'center') { g.textAlign = 'center'; g.fillText(o.text, W / 2, base); }
      else { g.textAlign = 'right'; g.fillText(o.text, W - pad, base); }
      if (o.price) {
        g.direction = 'ltr';
        g.textAlign = 'left';
        g.font = font(o.size, true);
        g.fillText(o.price, pad, base);
      }
    } else if (o.kind === 'hr') {
      const ly = y + Math.round(o.h / 2);
      if (o.dashed) { for (let x = pad; x < W - pad; x += 14) g.fillRect(x, ly, 8, 2); }
      else g.fillRect(pad, ly, inner, 2);
    } else if (o.kind === 'banner') {
      const bh = Math.round(o.size * 1.8);
      g.fillRect(pad, y, inner, bh);
      g.fillStyle = '#fff';
      g.font = font(o.size, true);
      g.direction = 'rtl';
      g.textAlign = 'center';
      g.fillText(o.text, W / 2, y + Math.round(bh / 2 + o.size * 0.36));
      g.fillStyle = '#000';
    }
    y += o.h;
  }
  return c;
}

// للتوافق: يعيد PNG كـ data URL
export function renderTicketImage(order, restaurant, items = []) {
  return renderTicketCanvas(order, restaurant, items).toDataURL('image/png');
}

// تقطيع الصورة لشرائح ≤ 256px
function sliceCanvas(c) {
  const out = [];
  for (let y = 0; y < c.height; y += SLICE_H) {
    const h = Math.min(SLICE_H, c.height - y);
    const s = document.createElement('canvas');
    s.width = c.width; s.height = h;
    const g = s.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, s.width, h);
    g.drawImage(c, 0, y, c.width, h, 0, 0, c.width, h);
    out.push(s.toDataURL('image/png'));
  }
  return out;
}

// ─── طباعة canvas على الماكنة ───
export async function printCanvas(canvas, printer) {
  if (!TP()) throw printerError('الطباعة غير متاحة — افتح التطبيق على جهاز الأندرويد');
  const p = printer || getSavedPrinter();
  if (!p) throw printerError('لم يتم ربط أي ماكنة — اربطها من الإعدادات');

  if (p.type === 'bluetooth') {
    const ok = await ensureBluetoothPermission();
    if (!ok) throw printerError('SecurityException: BLUETOOTH_CONNECT');
  } else if (p.type === 'usb') {
    const ok = await ensureUsbPermission(p.address);
    if (!ok) throw printerError('لم يتم السماح للتطبيق باستخدام ماكنة الـ USB — وافق على الإذن عند ظهوره');
  }

  const opts = connectionOpts(p);
  const hexes = [];
  for (const b64 of sliceCanvas(canvas)) {
    const hex = await call('bitmapToHexadecimalString', { ...opts, base64: b64 });
    hexes.push(String(hex));
  }
  const text = hexes.map(h => `[C]<img>${h}</img>\n`).join('') + '[L]\n';
  const fn = TP().printFormattedTextAndCut ? 'printFormattedTextAndCut' : 'printFormattedText';
  await call(fn, { ...opts, text, mmFeedPaper: 12 });
  return true;
}

// للتوافق مع الكود القديم: طباعة صورة base64 (PNG)
export async function printImageBase64(base64, printer) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = base64; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return printCanvas(c, printer);
}

// ─── طباعة طلب كامل ───
export async function printOrder(order, restaurant, items) {
  try { await document.fonts?.ready; } catch {}
  return printCanvas(renderTicketCanvas(order, restaurant, items || order.items || []));
}

// ─── طباعة تجريبية ───
export async function testPrint(restaurant, printer) {
  try { await document.fonts?.ready; } catch {}
  const sample = {
    order_number: 'TEST', id: 'TEST', created_at: Date.now(), order_type: 'delivery',
    customer_name: 'طباعة تجريبية', customer_phone: '0590000000',
    delivery_address: 'عنوان تجريبي طويل للتأكد من التفاف النص بشكل صحيح على عرض الورق',
    notes: 'بدون بصل لو سمحت',
    subtotal: 30, delivery_fee: 7, discount: 2, total: 35, payment_method: 'cash',
  };
  return printCanvas(renderTicketCanvas(sample, restaurant, [
    { quantity: 2, name_ar: 'برجر كلاسيك', subtotal: 24, options: [{ name: 'جبنة إضافية', price: 2 }, { name: 'صوص حار', price: 0 }], notes: 'استواء كامل' },
    { quantity: 1, name_ar: 'بطاطا', subtotal: 6, options: [] },
  ]), printer);
}
