import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { SERVER_URL } from '../utils/config';
import { setupPush, showBrowserNotification } from '../utils/pushNotifications';
import * as Printer from '../utils/printer';
import { useRestaurant } from './RestaurantContext';

const LiveCtx = createContext({ tick: 0, socket: null, pendingCount: 0, connected: false, refreshNow: () => {} });

const POLL_MS = 20000;

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

// طباعة تلقائية للطلب الجديد (إن كانت الماكنة مربوطة ومفعّلة)
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

// مزوّد عام داخل Layout: اتصال Socket.IO واحد + تنبيهات الطلبات الجديدة على كل الصفحات
export function LiveOrdersProvider({ children }) {
  const { restaurant } = useRestaurant();
  const navigate = useNavigate();
  const restRef = useRef(restaurant);
  restRef.current = restaurant;
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const [tick, setTick] = useState(0);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const seenPending = useRef(null);      // معرفات الطلبات المعلّقة المعروفة (null قبل أول قراءة)
  const alerted = useRef(new Set());      // لمنع تكرار التنبيه/الطباعة لنفس الطلب
  const polling = useRef(false);

  const bump = useCallback(() => setTick(t => t + 1), []);

  const alertNewOrder = useCallback((orderId, orderNumber) => {
    const key = String(orderId ?? orderNumber ?? '');
    if (!key || alerted.current.has(key)) return;
    alerted.current.add(key);
    playNewOrderChime();
    try { navigator.vibrate && navigator.vibrate([350, 120, 350, 120, 350]); } catch {}
    const label = orderNumber || orderId;
    toast(`طلب جديد #${label} بانتظار موافقتك`, {
      id: `new-${key}`, icon: '🛎️', duration: 9000,
      style: { fontWeight: 800, border: '1.5px solid #FFCBA3' },
    });
    showBrowserNotification('طلب جديد!', `طلب #${label} ينتظر موافقتك`, { order_id: orderId }, () => navRef.current('/orders'));
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
      if (seenPending.current === null) {
        seenPending.current = new Set(list.map(o => String(o.id)));
        list.forEach(o => alerted.current.add(String(o.id)));
        if (list.length) toast(`لديك ${list.length === 1 ? 'طلب واحد' : list.length + ' طلبات'} بانتظار القبول`, { id: 'pending-start', icon: '⏳' });
        return;
      }
      for (const o of list) {
        const id = String(o.id);
        if (!seenPending.current.has(id)) {
          seenPending.current.add(id);
          alertNewOrder(o.id, o.order_number);
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
    // السيرفر يرسل new_order لغرفة صاحب المطعم فقط — لا نفلتر على restaurant_id
    s.on('new_order', (p = {}) => {
      const id = p.order_id ?? p.id;
      if (id != null && seenPending.current) seenPending.current.add(String(id));
      alertNewOrder(id, p.order_number);
      bump();
      setTimeout(pollPending, 800);
    });
    s.on('order_status', () => { bump(); pollPending(); });
    s.on('order_updated', () => { bump(); pollPending(); });
    s.on('driver_assigned', () => bump());
    s.on('order_cancelled', (p = {}) => {
      if (p.by && p.by !== 'restaurant') {
        toast(`${p.by === 'customer' ? 'الزبون ألغى' : 'الإدارة ألغت'} الطلب #${p.order_number || p.order_id}`, { icon: '⚠️', duration: 7000, id: `cancel-${p.order_id}` });
      }
      bump(); pollPending();
    });
    s.on('connect', () => { setConnected(true); bump(); pollPending(); });
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => { s.removeAllListeners(); s.disconnect(); setSocket(null); setConnected(false); };
  }, [alertNewOrder, bump, pollPending]);

  // تحديث دوري كل 20 ثانية طالما التطبيق ظاهر + فور العودة للتطبيق
  useEffect(() => {
    pollPending();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') { bump(); pollPending(); }
    }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') { bump(); pollPending(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [bump, pollPending, restaurant?.id]);

  // إشعارات FCM / الويب
  useEffect(() => {
    setupPush({
      onReceive: (n) => {
        const title = n?.title || n?.data?.title;
        const body = n?.body || n?.data?.body;
        if (title || body) toast(`${title || ''}${title && body ? ' — ' : ''}${body || ''}`, { icon: '🔔', duration: 6000 });
        bump(); pollPending();
      },
      onAction: () => { navRef.current('/orders'); bump(); pollPending(); },
    });
  }, [bump, pollPending]);

  const value = useMemo(() => ({ tick, socket, connected, pendingCount, refreshNow }), [tick, socket, connected, pendingCount, refreshNow]);
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export const useLiveOrders = () => useContext(LiveCtx);
