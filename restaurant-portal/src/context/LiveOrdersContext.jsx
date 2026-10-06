import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FiBellOff, FiChevronLeft } from 'react-icons/fi';
import api from '../utils/api';
import { SERVER_URL } from '../utils/config';
import { setupPush, showBrowserNotification } from '../utils/pushNotifications';
import * as Printer from '../utils/printer';
import { useRestaurant } from './RestaurantContext';
import { isGroupOrder, groupStops, orderNumberOf } from '../utils/format';
import { pl } from '../utils/plural';
import { canLeave } from '../utils/navGuard';

const LiveCtx = createContext({ tick: 0, socket: null, pendingCount: 0, connected: false, refreshNow: () => {} });

const POLL_MS = 20000;
// تكرار نغمة التنبيه طالما يوجد طلب بانتظار القبول (حتى لا يفوت المطبخ طلبًا)
const CHIME_REPEAT_MS = 20000;
const PENDING_TOAST_ID = 'pending-alert';
// أنواع إشعارات FCM التي يعرضها الـ socket أصلًا — لا نكررها بتنبيه ثانٍ
const SOCKET_HANDLED = new Set(['new_order', 'order_cancelled', 'order_status', 'order_updated', 'group_status', 'group_updated', 'group_cancelled']);

// ─── نغمة تنبيه (Web Audio) — سياق صوت واحد يُفعَّل عند أول لمسة ───
let audioCtx = null;
function getAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch { return null; }
}
function playNewOrderChime() {
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain); gain.connect(ctx.destination);
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    };
    beep(880, 0, 0.18); beep(1174, 0.2, 0.18); beep(880, 0.5, 0.18); beep(1174, 0.7, 0.22);
    beep(880, 1.3, 0.18); beep(1174, 1.5, 0.26);
  } catch {}
}
const vibrate = () => { try { navigator.vibrate && navigator.vibrate([350, 120, 350, 120, 350]); } catch {} };

// طباعة تلقائية للطلب الجديد (إن كانت الماكنة مربوطة ومفعّلة) — الطباعة تمر عبر طابور (printer.js)
async function autoPrintOrder(orderId, restaurant) {
  try {
    if (!Printer.isPrinterSupported() || !Printer.getSavedPrinter() || !Printer.isAutoPrint()) return;
    const r = await api.get(`/orders/${orderId}`);
    const full = r?.data || r;
    await Printer.printOrder(full, restaurant, full.items || []);
  } catch (e) {
    toast.error(`تعذّرت الطباعة التلقائية: ${Printer.printerError(e).message}`, { id: 'autoprint-err', duration: 6000 });
  }
}

// تنبيه دائم أعلى الشاشة طالما يوجد طلب بانتظار القبول
function PendingToast({ t, count, muted, onOpen, onMute }) {
  return (
    <div className="flex items-center gap-2.5" dir="rtl">
      <span className="w-2.5 h-2.5 rounded-full bg-coral pulse-dot flex-shrink-0" aria-hidden />
      <span className="flex-1 min-w-0 leading-snug">لديك {pl(count, 'order')} بانتظار القبول</span>
      {!muted && (
        <button onClick={onMute} aria-label="إسكات التنبيه حتى يصل طلب جديد" title="إسكات حتى يصل طلب جديد"
          className="w-8 h-8 rounded-full bg-surface text-ink-2 flex items-center justify-center flex-shrink-0"><FiBellOff size={14} aria-hidden /></button>
      )}
      <button onClick={() => { toast.dismiss(t.id); onOpen(); }}
        className="h-8 px-3 rounded-full bg-coral text-white text-[12px] font-extrabold flex items-center gap-1 flex-shrink-0">عرض <FiChevronLeft size={13} aria-hidden /></button>
    </div>
  );
}

// مزوّد عام داخل Layout: اتصال Socket.IO واحد + تنبيهات الطلبات الجديدة على كل الصفحات
export function LiveOrdersProvider({ children }) {
  const { restaurant } = useRestaurant();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const restRef = useRef(restaurant);
  restRef.current = restaurant;
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const [tick, setTick] = useState(0);
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const seenPending = useRef(null);      // معرفات الطلبات المعلّقة المعروفة (null قبل أول قراءة)
  const pendingKey = useRef('');          // بصمة الطلبات المعلّقة الحالية (لكتم التكرار حتى يصل طلب جديد)
  const [mutedKey, setMutedKey] = useState(null);
  const mutedRef = useRef(null);
  mutedRef.current = mutedKey;
  const alerted = useRef(new Set());      // لمنع تكرار التنبيه/الطباعة لنفس الطلب
  const polling = useRef(false);

  const bump = useCallback(() => setTick(t => t + 1), []);
  const goOrders = useCallback(() => { canLeave().then(ok => { if (ok) navRef.current('/orders'); }); }, []);

  const alertNewOrder = useCallback((orderId, orderNumber, info = null) => {
    const key = String(orderId ?? orderNumber ?? '');
    if (!key || alerted.current.has(key)) return;
    alerted.current.add(key);
    playNewOrderChime();
    vibrate();
    const label = orderNumber || orderNumberOf({ order_id: orderId });
    const grouped = isGroupOrder(info);
    if (grouped) {
      // طلب مجمّع: سائق واحد يجمع من عدة مطاعم — التأخير يؤخّر الجميع
      const n = groupStops(info);
      toast(`طلب مجمّع جديد #${label}${n > 1 ? ` (من ${pl(n, 'restaurantGen')})` : ''} — سائق واحد يجمع من عدة مطاعم، التزم بالوقت`, {
        id: `new-${key}`, icon: '🛎️', duration: 12000,
        style: { fontWeight: 800, border: '1.5px solid #5EEAD4' },
      });
    } else {
      toast(`طلب جديد #${label} بانتظار موافقتك`, {
        id: `new-${key}`, icon: '🛎️', duration: 9000,
        style: { fontWeight: 800, border: '1.5px solid #FFCBA3' },
      });
    }
    showBrowserNotification(grouped ? 'طلب مجمّع جديد!' : 'طلب جديد!',
      grouped ? `طلب #${label} (ضمن طلب مجمّع — سائق واحد) ينتظر موافقتك` : `طلب #${label} ينتظر موافقتك`,
      { order_id: orderId }, () => navRef.current('/orders'));
    if (orderId) autoPrintOrder(orderId, restRef.current);
  }, []);

  // شبكة أمان: قراءة الطلبات المعلّقة لاكتشاف أي طلب فات الـ socket
  const pollPending = useCallback(async () => {
    const rid = restRef.current?.id;
    if (!rid || polling.current) return;
    polling.current = true;
    try {
      const r = await api.get(`/restaurants/${rid}/orders`, { params: { status: 'pending', limit: 50 } });
      const list = Array.isArray(r?.data) ? r.data : [];
      setPendingCount(list.length);
      pendingKey.current = list.map(o => String(o.id)).sort().join(',');
      if (seenPending.current === null) {
        seenPending.current = new Set(list.map(o => String(o.id)));
        list.forEach(o => alerted.current.add(String(o.id)));
        // طلبات كانت تنتظر قبل فتح التطبيق: نغمة فورًا (التنبيه الدائم يظهر من حالة pendingCount)
        if (list.length) { playNewOrderChime(); vibrate(); }
        return;
      }
      for (const o of list) {
        const id = String(o.id);
        if (!seenPending.current.has(id)) {
          seenPending.current.add(id);
          alertNewOrder(o.id, o.order_number, o);
          bump();
        }
      }
    } catch { /* نتجاهل — المحاولة التالية بعد 20 ثانية */ }
    finally { polling.current = false; }
  }, [alertNewOrder, bump]);

  const refreshNow = useCallback(() => { bump(); pollPending(); }, [bump, pollPending]);

  // تفعيل الصوت بعد أول تفاعل (سياسات المتصفح)
  useEffect(() => {
    const unlock = () => { getAudio(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  // ─── تنبيه متكرر + شريط دائم طالما يوجد طلب بانتظار القبول ───
  const muted = !!mutedKey && mutedKey === pendingKey.current;
  useEffect(() => {
    if (pendingCount <= 0) { toast.dismiss(PENDING_TOAST_ID); return; }
    // في صفحة الطلبات القائمة نفسها ظاهرة — لا داعي للشريط
    if (pathname.startsWith('/orders')) { toast.dismiss(PENDING_TOAST_ID); return; }
    toast((t) => (
      <PendingToast t={t} count={pendingCount} muted={muted} onOpen={goOrders}
        onMute={() => { setMutedKey(pendingKey.current); toast('تم إسكات التنبيه — سيرنّ مجددًا عند وصول طلب جديد', { id: 'mute-hint', icon: '🔕', duration: 3500 }); }} />
    ), { id: PENDING_TOAST_ID, duration: Infinity, style: { border: '1.5px solid #FFCBA3', maxWidth: 440 } });
  }, [pendingCount, pathname, muted, goOrders]);
  useEffect(() => () => toast.dismiss(PENDING_TOAST_ID), []);

  useEffect(() => {
    const t = setInterval(() => {
      if (!pendingKey.current) return;
      if (mutedRef.current && mutedRef.current === pendingKey.current) return;
      playNewOrderChime();
      vibrate();
    }, CHIME_REPEAT_MS);
    return () => clearInterval(t);
  }, []);

  // اتصال Socket.IO واحد للتطبيق كله
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const s = io(SERVER_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    socketRef.current = s;
    let stopped = false;
    let retry = 0;
    let retryTimer = null;

    // السيرفر يرسل new_order لغرفة صاحب المطعم فقط — لا نفلتر على restaurant_id
    s.on('new_order', (p = {}) => {
      const id = p.order_id ?? p.id;
      if (id != null && seenPending.current) seenPending.current.add(String(id));
      alertNewOrder(id, p.order_number, p);
      bump();
      setTimeout(pollPending, 800);
    });
    s.on('order_status', () => { bump(); pollPending(); });
    s.on('order_updated', () => { bump(); pollPending(); });
    s.on('driver_assigned', () => bump());
    s.on('order_cancelled', (p = {}) => {
      if (p.by && p.by !== 'restaurant') {
        // طلب ضمن مجمّع: نفس معرّف التنبيه مع group_cancelled حتى لا يتكرر التنبيه
        toast(`${p.by === 'customer' ? 'الزبون ألغى' : 'الإدارة ألغت'} الطلب #${orderNumberOf(p)}${p.group_id ? ' (ضمن طلب مجمّع)' : ''}`,
          { icon: '⚠️', duration: 7000, id: p.group_id ? `grp-cancel-${p.group_id}` : `cancel-${p.order_id}` });
      }
      bump(); pollPending();
    });
    // ─── أحداث الطلب المجمّع (سائق واحد لعدة مطاعم) ───
    s.on('group_status', (p = {}) => {
      if (p.status === 'picking_up') {
        toast(`سائق قبل الطلب المجمّع ${p.group_number || ''} وهو في طريقه لجمع الطلبات — جهّز طلبك في وقته`, { icon: '🛵', duration: 7000, id: `grp-${p.group_id}-picking` });
      }
      bump(); pollPending();
    });
    s.on('group_updated', (p = {}) => {
      if (p.reason === 'restaurant_cancelled' && String(p.restaurant_id) !== String(restRef.current?.id)) {
        toast(`${p.restaurant_name ? `«${p.restaurant_name}»` : 'أحد المطاعم'} انسحب من الطلب المجمّع ${p.group_number || ''} — الطلب مستمر مع باقي المطاعم`, { icon: 'ℹ️', duration: 7000, id: `grp-upd-${p.group_id}-${p.order_id}` });
      }
      bump(); pollPending();
    });
    s.on('group_cancelled', (p = {}) => {
      if (p.by !== 'restaurant') {
        toast(`${p.by === 'customer' ? 'الزبون ألغى' : p.by === 'admin' ? 'الإدارة ألغت' : 'تم إلغاء'} الطلب المجمّع ${p.group_number || ''}`, { icon: '⚠️', duration: 7000, id: `grp-cancel-${p.group_id}` });
      }
      bump(); pollPending();
    });
    s.on('connect', () => { retry = 0; setConnected(true); bump(); pollPending(); });
    s.on('disconnect', () => setConnected(false));
    // رفض السيرفر للاتصال (مثلًا عطل لحظي في التحقق) يوقف إعادة الاتصال التلقائية في socket.io —
    // نعيد المحاولة بأنفسنا بتأخير متزايد (2ث → 30ث) بالتوكن الحالي
    s.on('connect_error', () => {
      setConnected(false);
      if (stopped || s.active) return; // إعادة الاتصال التلقائية تعمل
      clearTimeout(retryTimer);
      const delay = Math.min(30000, 2000 * 2 ** Math.min(retry, 4));
      retry += 1;
      retryTimer = setTimeout(() => {
        if (stopped || s.connected) return;
        const t = localStorage.getItem('token');
        if (!t) return;
        s.auth = { token: t };
        s.connect();
      }, delay);
    });
    setSocket(s);
    return () => {
      stopped = true; clearTimeout(retryTimer);
      s.removeAllListeners(); s.disconnect();
      socketRef.current = null; setSocket(null); setConnected(false);
    };
  }, [alertNewOrder, bump, pollPending]);

  // تحديث دوري كل 20 ثانية طالما التطبيق ظاهر + فور العودة للتطبيق
  useEffect(() => {
    pollPending();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') { bump(); pollPending(); }
    }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      bump(); pollPending();
      // عند العودة للتطبيق: إن كان الاتصال المباشر مقطوعًا نعيد المحاولة فورًا
      const s = socketRef.current;
      if (s && !s.connected && !s.active) { const tk = localStorage.getItem('token'); if (tk) { s.auth = { token: tk }; s.connect(); } }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [bump, pollPending, restaurant?.id]);

  // إشعارات FCM / الويب — ما يعرضه الـ socket لا نكرره (إشعاران متتاليان لنفس الحدث)
  useEffect(() => {
    setupPush({
      onReceive: (n) => {
        const data = n?.data || {};
        const type = data.type;
        bump(); pollPending();
        if (SOCKET_HANDLED.has(type) && socketRef.current?.connected) return;
        // طلب جديد: pollPending يكتشفه وينبّه (بنفس معرّف تنبيه الـ socket)
        if (type === 'new_order') return;
        const title = n?.title || data.title;
        const body = n?.body || data.body;
        if (!title && !body) return;
        const id = type === 'order_cancelled'
          ? (data.group_id ? `grp-cancel-${data.group_id}` : `cancel-${data.order_id}`)
          : (data.order_id ? `push-${type || 'n'}-${data.order_id}` : undefined);
        toast(`${title || ''}${title && body ? ' — ' : ''}${body || ''}`, { icon: '🔔', duration: 6000, id });
      },
      onAction: () => { goOrders(); bump(); pollPending(); },
    });
  }, [bump, pollPending, goOrders]);

  const value = useMemo(() => ({ tick, socket, connected, pendingCount, refreshNow }), [tick, socket, connected, pendingCount, refreshNow]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export const useLiveOrders = () => useContext(LiveCtx);
