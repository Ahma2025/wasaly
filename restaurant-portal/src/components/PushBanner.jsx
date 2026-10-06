import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { FiBell, FiBellOff, FiX } from 'react-icons/fi';
import { getPushPermission, enablePush } from '../utils/pushNotifications';
import { openAppSettings } from '../utils/printer';
import { Button } from './ui';

const DISMISS_KEY = 'wasaly_push_banner_dismissed';

// شريط تفعيل الإشعارات: الطلب يتم بضغطة المستخدم (يعمل على فايرفوكس وسفاري)، مع إرشاد عند الرفض
export default function PushBanner() {
  const [perm, setPerm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } });

  useEffect(() => {
    let alive = true;
    const check = () => getPushPermission().then(p => { if (alive) setPerm(p); }).catch(() => {});
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (dismissed || !perm || perm === 'granted' || perm === 'unsupported') return null;
  const native = Capacitor.isNativePlatform();
  const denied = perm === 'denied';

  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {} };
  const enable = async () => {
    setBusy(true);
    try { setPerm(await enablePush()); } finally { setBusy(false); }
  };

  return (
    <div role="status" className="mb-4 rounded-[18px] border border-warning/30 bg-gradient-to-l from-warning-soft to-white p-3.5 flex items-start gap-3 animate-fade-up">
      <span className="w-10 h-10 rounded-[12px] bg-white text-amber-600 flex items-center justify-center flex-shrink-0 shadow-soft">
        {denied ? <FiBellOff size={18} aria-hidden /> : <FiBell size={18} aria-hidden />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-extrabold text-amber-900">{denied ? 'إشعارات الطلبات محظورة' : 'فعّل إشعارات الطلبات'}</p>
        <p className="text-[12px] text-amber-900/80 mt-0.5 leading-relaxed">
          {denied
            ? (native ? 'اسمح بالإشعارات من إعدادات التطبيق حتى يصلك تنبيه بكل طلب جديد.' : 'اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح (رمز القفل بجانب العنوان) ثم أعد تحميل الصفحة.')
            : 'حتى يصلك تنبيه بكل طلب جديد حتى لو كانت الصفحة في الخلفية.'}
        </p>
        <div className="flex gap-2 mt-2.5">
          {!denied && <Button size="sm" loading={busy} onClick={enable} icon={FiBell}>تفعيل الإشعارات</Button>}
          {denied && native && <Button size="sm" onClick={openAppSettings}>فتح الإعدادات</Button>}
          <button onClick={dismiss} className="btn-ghost h-9 px-3 text-xs">لاحقًا</button>
        </div>
      </div>
      <button onClick={dismiss} aria-label="إغلاق" className="w-8 h-8 rounded-full text-amber-700 hover:bg-white/70 flex items-center justify-center flex-shrink-0"><FiX size={15} /></button>
    </div>
  );
}
