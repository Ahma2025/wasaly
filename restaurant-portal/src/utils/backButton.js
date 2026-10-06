// ═══════════════════════════════════════════════════════════════
//  زر الرجوع في أندرويد
//  الترتيب: يغلق أعلى نافذة مفتوحة ← يرجع صفحة للخلف ← من الصفحة الرئيسية: ضغطتان للخروج.
//
//  @capacitor/app غير مثبّت في هذا المشروع، لذلك:
//   1) MainActivity.java يعترض زر الرجوع ويستدعي window.__wasalyHandleBack() ويتصرف حسب النتيجة
//      ('handled' = لا شيء، 'exit' = يرسل التطبيق للخلفية ليبقى استقبال الطلبات شغّالًا).
//   2) إذا أُضيفت إضافة App لاحقًا (Capacitor.Plugins.App) نسجّل مستمع backButton عليها تلقائيًا.
// ═══════════════════════════════════════════════════════════════
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { closeTopOverlay } from '../components/ui';
import { canLeave, hasLeaveGuard } from './navGuard';

const EXIT_WINDOW_MS = 2000;
let lastRootPress = 0;
let ctx = { navigate: null, getPath: () => '/' };

const ROOTS = new Set(['/', '/login']);

function goBack() {
  const { navigate, getPath } = ctx;
  if (!navigate) return;
  const idx = window.history.state && typeof window.history.state.idx === 'number' ? window.history.state.idx : 0;
  if (idx > 0) navigate(-1);
  else if (getPath() !== '/' && getPath() !== '/login') navigate('/', { replace: true });
}

// يعيد: 'handled' | 'exit'
export function handleBack() {
  // 1) نافذة مفتوحة (تفاصيل طلب، تأكيد، محرر صنف، الدعم…)
  if (closeTopOverlay()) return 'handled';

  const path = ctx.getPath();
  // 2) صفحة غير رئيسية → رجوع (مع حارس التغييرات غير المحفوظة)
  if (!ROOTS.has(path)) {
    if (hasLeaveGuard()) { canLeave().then(ok => { if (ok) goBack(); }); return 'handled'; }
    goBack();
    return 'handled';
  }

  // 3) الصفحة الرئيسية: ضغطتان متتاليتان للخروج
  const now = Date.now();
  if (now - lastRootPress < EXIT_WINDOW_MS) {
    lastRootPress = 0;
    toast.dismiss('exit-hint');
    return 'exit';
  }
  lastRootPress = now;
  toast('اضغط رجوع مرة أخرى للخروج', { id: 'exit-hint', duration: EXIT_WINDOW_MS, icon: '↩️' });
  return 'handled';
}

let pluginListener = null;

export function installBackHandler(navigate, getPath) {
  ctx = { navigate, getPath };
  window.__wasalyHandleBack = handleBack;

  // إن كانت إضافة App متوفرة في البناء الأصلي نستخدمها (لا نستوردها — غير مثبّتة حاليًا)
  try {
    const App = Capacitor.isNativePlatform() ? Capacitor.Plugins?.App : null;
    if (App && typeof App.addListener === 'function' && !pluginListener) {
      pluginListener = App.addListener('backButton', () => {
        if (handleBack() === 'exit') {
          if (typeof App.minimizeApp === 'function') App.minimizeApp();
          else if (typeof App.exitApp === 'function') App.exitApp();
        }
      });
    }
  } catch { /* بدون إضافة: MainActivity يتولى الأمر */ }

  return () => { ctx = { navigate: null, getPath: () => '/' }; };
}
