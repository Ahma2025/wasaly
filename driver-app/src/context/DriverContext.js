// حالة السائق المركزية: الاتصال، الطلب النشط، عروض الطلبات، الإلغاء، السوكِت والإشعارات
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Alert, AppState, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import api from '../utils/api';
import { connectSocket, subscribe } from '../utils/socket';
import { playOfferChime } from '../utils/pushNotifications';
import { useAuth } from './AuthContext';
import { useDriverLocation } from './LocationContext';
import { ONLINE_KEY } from '../utils/storage';
import { DEFAULT_OFFER_SECONDS } from '../config';
import { isAccepted, isPersonal, isRide, orderNo } from '../utils/format';
import { navigate, whenNavReady, closeDeliveryFor, currentRoute } from '../navigation/navRef';
import OfferModal from '../components/OfferModal';

const DriverContext = createContext({});

const OFFER_VIBRATION = [0, 700, 350, 700, 350, 700, 1200];
const CHIME_EVERY_MS = 3500;
const SEEN_TTL_MS = 10 * 60 * 1000;
const POLL_MS = 30000;

const handledResponses = new Set(); // ردود الإشعارات المعالجة (حتى لا تُعالج مرتين)

const sid = (v) => (v == null ? '' : String(v));

function computeDeadline(payload, order, receivedAt) {
  const now = Date.now();
  const candidates = [];
  const exp = payload?.expires_at || order?.offer_expires_at || order?.expires_at;
  if (exp) {
    const t = Date.parse(exp);
    if (Number.isFinite(t)) candidates.push(t);
  }
  const secs = parseInt(payload?.offer_seconds, 10);
  if (Number.isFinite(secs) && secs > 0) candidates.push(receivedAt + secs * 1000);
  // الأقرب يفوز (يحمي من اختلاف ساعة الجهاز عن السيرفر)
  let deadline = candidates.length ? Math.min(...candidates) : receivedAt + DEFAULT_OFFER_SECONDS * 1000;
  deadline = Math.min(deadline, now + 120000);
  return deadline;
}

export function DriverProvider({ children }) {
  const { user } = useAuth();
  const location = useDriverLocation();

  const [isOnline, setIsOnline] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [driver, setDriver] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [offer, setOffer] = useState(null); // { order, deadline, totalSec }
  const [remaining, setRemaining] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const onlineRef = useRef(false);
  const onlineBusyRef = useRef(false);
  const activeRef = useRef(null);
  const offerRef = useRef(null);
  const seenRef = useRef(new Map());
  const cancelledRef = useRef(new Set());
  const timerRef = useRef(null);
  const chimeRef = useRef(null);
  const acceptingRef = useRef(false);
  const rejectingRef = useRef(false);
  const refreshingRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  const locRef = useRef(location);
  locRef.current = location;

  // ── الحالة: اتصال وطلب نشط ──
  const applyOnline = useCallback((value) => {
    onlineRef.current = value;
    setIsOnline(value);
    AsyncStorage.setItem(ONLINE_KEY, value ? '1' : '0').catch(() => {});
    locRef.current.setTracking({ online: value });
  }, []);

  const setActive = useCallback((o) => {
    const next = o && isAccepted(o) ? o : null;
    activeRef.current = next;
    setActiveOrder(next);
    locRef.current.setTracking({ activeOrderId: next ? next.id : null });
  }, []);

  // ── عرض الطلب ──
  const stopAttention = useCallback(() => {
    try { Vibration.cancel(); } catch {}
    if (chimeRef.current) { clearInterval(chimeRef.current); chimeRef.current = null; }
  }, []);

  const closeOffer = useCallback((reason = 'closed') => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopAttention();
    const cur = offerRef.current;
    if (cur) seenRef.current.set(sid(cur.order.id), { state: reason, at: Date.now() });
    offerRef.current = null;
    setOffer(null);
    setRemaining(0);
  }, [stopAttention]);

  const startAttention = useCallback(() => {
    stopAttention();
    try { Vibration.vibrate(OFFER_VIBRATION, true); } catch {}
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    playOfferChime();
    chimeRef.current = setInterval(() => {
      if (!offerRef.current) return;
      if (AppState.currentState === 'active') playOfferChime();
    }, CHIME_EVERY_MS);
  }, [stopAttention]);

  const openOffer = useCallback(async (payload, { receivedAt = Date.now(), preloaded = null } = {}) => {
    const id = sid(payload?.order_id ?? payload?.id);
    if (!id) return;
    // نفس العرض ظاهر (سوكِت + إشعار لنفس الطلب) → لا نعيد ضبط المؤقت
    if (offerRef.current && sid(offerRef.current.order.id) === id) {
      const d = computeDeadline(payload, offerRef.current.order, receivedAt);
      if (payload?.expires_at && d < offerRef.current.deadline) {
        offerRef.current = { ...offerRef.current, deadline: d };
        setOffer(offerRef.current);
      }
      return;
    }
    if (activeRef.current && sid(activeRef.current.id) === id) return;
    if (cancelledRef.current.has(id)) return;
    const seen = seenRef.current.get(id);
    if (seen && (seen.state === 'loading' || Date.now() - seen.at < SEEN_TTL_MS)) return;
    seenRef.current.set(id, { state: 'loading', at: Date.now() });

    let order = null;
    try {
      const r = await api.get(`/orders/${id}`);
      order = r?.data || null;
    } catch { order = preloaded; }
    if (!order) { seenRef.current.delete(id); return; }

    if (['cancelled', 'delivered', 'on_the_way', 'pending'].includes(order.status)) {
      seenRef.current.set(id, { state: 'stale', at: Date.now() }); return;
    }
    if (isAccepted(order)) { seenRef.current.set(id, { state: 'accepted', at: Date.now() }); setActive(order); return; }
    const me = userRef.current?.id;
    if (order.driver_id && me && sid(order.driver_id) !== sid(me)) {
      seenRef.current.set(id, { state: 'taken', at: Date.now() }); return;
    }
    const deadline = computeDeadline(payload, order, receivedAt);
    if (deadline - Date.now() < 2000) { seenRef.current.set(id, { state: 'expired', at: Date.now() }); return; }

    if (offerRef.current) closeOffer('replaced');
    const totalSec = Math.max(1, Math.round((deadline - receivedAt) / 1000));
    offerRef.current = { order, deadline, totalSec, openedAt: Date.now() };
    seenRef.current.set(id, { state: 'open', at: Date.now() });
    setOffer(offerRef.current);
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const cur = offerRef.current;
      if (!cur) return;
      const left = Math.max(0, Math.ceil((cur.deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !acceptingRef.current) closeOffer('expired');
    }, 500);
    startAttention();
  }, [closeOffer, setActive, startAttention]);

  // ── الإلغاء ──
  const handleCancelled = useCallback((orderId, by) => {
    const id = sid(orderId);
    if (!id || cancelledRef.current.has(id)) return;
    const isOffer = offerRef.current && sid(offerRef.current.order.id) === id;
    const isActive = activeRef.current && sid(activeRef.current.id) === id;
    const r = currentRoute();
    const onDelivery = r?.name === 'Delivery' && sid(r.params?.orderId) === id;
    if (!isOffer && !isActive && !onDelivery) return;
    cancelledRef.current.add(id);
    seenRef.current.set(id, { state: 'cancelled', at: Date.now() });
    const order = isOffer ? offerRef.current.order : activeRef.current;
    if (isOffer) closeOffer('cancelled');
    if (isActive) setActive(null);
    closeDeliveryFor(id);
    try { Vibration.vibrate([0, 450, 200, 450]); } catch {}
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    const who = by === 'customer' ? (isPersonal(order) ? 'ألغى صاحب الطلب الطلب' : 'ألغى الزبون الطلب')
      : by === 'restaurant' ? 'ألغى المطعم الطلب'
        : by === 'admin' ? 'ألغت الإدارة الطلب' : 'تم إلغاء هذا الطلب';
    const no = order ? ` #${orderNo(order)}` : ` #${id}`;
    Alert.alert('تم إلغاء الطلب', `${who}${no}.\n${isOffer ? 'لم يعد العرض متاحاً.' : 'لا داعي لإكمال التوصيل.'}`);
  }, [closeOffer, setActive]);

  // ── تحديث من السيرفر ──
  const refreshDriver = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    refreshingRef.current = (async () => {
      try {
        const r = await api.get('/drivers/me');
        const d = r?.data || null;
        if (!d) return null;
        setDriver(d);
        const online = !!(d.is_online || d.isOnline);
        if (online !== onlineRef.current) applyOnline(online);
        let ao = d.active_order || null;
        if (ao && d.is_offer != null && ao.is_offer == null) ao = { ...ao, is_offer: !!d.is_offer };
        // العرض الظاهر لم يعد مُسنداً لنا (انتهت مهلته على السيرفر) → أغلقه
        const curOffer = offerRef.current;
        if (curOffer && !acceptingRef.current && (!ao || sid(ao.id) !== sid(curOffer.order.id))
          && Date.now() - (curOffer.openedAt || 0) > 5000) {
          closeOffer('gone');
        }
        if (ao && isAccepted(ao)) {
          setActive(activeRef.current && sid(activeRef.current.id) === sid(ao.id) ? { ...activeRef.current, ...ao } : ao);
        } else {
          // كان عندنا طلب نشط واختفى؟ تحقّق إن كان أُلغي
          const prev = activeRef.current;
          if (prev && (!ao || sid(ao.id) !== sid(prev.id))) {
            try {
              const pr = await api.get(`/orders/${prev.id}`);
              if (pr?.data?.status === 'cancelled') handleCancelled(prev.id);
            } catch {}
          }
          setActive(null);
          if (ao && ['confirmed', 'preparing', 'ready'].includes(ao.status)) {
            openOffer({ order_id: ao.id }, { preloaded: ao });
          }
        }
        return d;
      } catch { return null; } finally { refreshingRef.current = null; }
    })();
    return refreshingRef.current;
  }, [applyOnline, setActive, openOffer, handleCancelled, closeOffer]);

  const refreshActiveOrder = useCallback(async () => {
    const cur = activeRef.current;
    if (!cur) return refreshDriver();
    try {
      const r = await api.get(`/orders/${cur.id}`);
      const o = r?.data;
      if (!o) return null;
      if (o.status === 'cancelled') { handleCancelled(o.id); return o; }
      if (o.status === 'delivered') { setActive(null); return o; }
      if (activeRef.current && sid(activeRef.current.id) === sid(o.id)) setActive({ ...activeRef.current, ...o });
      return o;
    } catch { return null; }
  }, [refreshDriver, handleCancelled, setActive]);

  // ── قبول/رفض ──
  const acceptOffer = useCallback(async () => {
    const cur = offerRef.current;
    if (!cur || acceptingRef.current || rejectingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    stopAttention();
    const o = cur.order;
    try {
      await api.post(`/orders/${o.id}/accept`);
      closeOffer('accepted');
      setActive({ ...o, is_offer: false, status: o.status === 'confirmed' ? 'preparing' : o.status, driver_assigned_at: o.driver_assigned_at || new Date().toISOString() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const msg = isPersonal(o)
        ? (isRide(o) ? 'انطلق الآن إلى نقطة الاستلام لتوصيل الراكب' : 'انطلق الآن إلى نقطة الاستلام لاستلام الطرد')
        : 'انطلق الآن إلى المطعم لاستلام الطلب';
      // ننتظر حتى تُغلق نافذة العرض تماماً (iOS يرفض فتح شاشة أثناء إغلاق Modal)
      setTimeout(() => {
        navigate('Delivery', { orderId: o.id });
        Alert.alert('✅ تم قبول الطلب', msg);
      }, 650);
    } catch (e) {
      closeOffer('failed'); // لا نترك بطاقة لطلب لم يعد متاحاً
      Alert.alert('تعذّر قبول الطلب', e?.message || 'الطلب لم يعد متاحاً');
      refreshDriver();
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  }, [closeOffer, setActive, stopAttention, refreshDriver]);

  const rejectOffer = useCallback(async () => {
    const cur = offerRef.current;
    if (!cur || acceptingRef.current || rejectingRef.current) return;
    rejectingRef.current = true;
    setRejecting(true);
    stopAttention();
    try { await api.post(`/orders/${cur.order.id}/reject`); } catch {}
    closeOffer('rejected');
    rejectingRef.current = false;
    setRejecting(false);
  }, [closeOffer, stopAttention]);

  // ── الاتصال (أونلاين/أوفلاين) ──
  const setOnline = useCallback(async (value) => {
    if (onlineBusyRef.current) return;
    if (!value && activeRef.current) {
      Alert.alert('عندك طلب نشط', 'أكمل التوصيل الحالي قبل إيقاف استقبال الطلبات.');
      return;
    }
    onlineBusyRef.current = true;
    setOnlineBusy(true);
    try {
      const body = { is_online: !!value };
      let fix = null;
      if (value) {
        fix = await locRef.current.getFix({ timeoutMs: 8000 });
        if (fix && Number.isFinite(fix.lat) && Number.isFinite(fix.lng)) { body.lat = fix.lat; body.lng = fix.lng; }
      }
      await api.patch('/drivers/status', body);
      applyOnline(!!value);
      if (!value) {
        closeOffer('offline');
        locRef.current.stopBackground();
      } else if (body.lat == null) {
        Alert.alert('تعذّر تحديد موقعك', 'فعّل خدمة الموقع (GPS) واسمح للتطبيق بالوصول لموقعك حتى تصلك الطلبات القريبة.');
      }
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'فشل في تغيير الحالة');
    } finally {
      onlineBusyRef.current = false;
      setOnlineBusy(false);
    }
  }, [applyOnline, closeOffer]);

  // تتبّع الخلفية فقط أثناء توصيل نشط
  const activeId = activeOrder?.id;
  useEffect(() => {
    if (activeId) locRef.current.ensureBackgroundTracking();
    else locRef.current.stopBackground();
  }, [activeId]);

  // ── معالجة الإشعارات ──
  const handleNotificationData = useCallback((data, receivedAt) => {
    if (!data || data._offerChime) return;
    if (data.type === 'new_order_request' && data.order_id) {
      openOffer(data, { receivedAt: receivedAt || Date.now() });
    } else if (data.type === 'order_cancelled' || (data.type === 'order_status' && data.status === 'cancelled')) {
      handleCancelled(data.order_id, data.by);
    } else if (data.order_id && activeRef.current && sid(activeRef.current.id) === sid(data.order_id)) {
      refreshActiveOrder();
    }
  }, [openOffer, handleCancelled, refreshActiveOrder]);

  const handleResponse = useCallback((response) => {
    if (!response) return;
    const rid = response.notification?.request?.identifier || `${response.notification?.date}`;
    if (handledResponses.has(rid)) return;
    handledResponses.add(rid);
    const data = response.notification?.request?.content?.data || {};
    if (data._offerChime) return;
    const at = Number(response.notification?.date) || Date.now();
    handleNotificationData(data, at);
    if (data.type !== 'new_order_request' && data.order_id && activeRef.current && sid(activeRef.current.id) === sid(data.order_id)) {
      navigate('Delivery', { orderId: activeRef.current.id });
    }
  }, [handleNotificationData]);

  // ── الإقلاع: كاش، سوكِت، مستمعين ──
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ONLINE_KEY).then(v => { if (alive && v === '1' && !onlineRef.current) setIsOnline(true); }).catch(() => {});
    refreshDriver();
    connectSocket();

    const unsubs = [
      subscribe('new_order_request', (d) => openOffer(d, { receivedAt: Date.now() })),
      subscribe('order_cancelled', (d) => handleCancelled(d?.order_id, d?.by)),
      subscribe('order_status', (d) => {
        if (!d) return;
        if (d.status === 'cancelled') { handleCancelled(d.order_id, d.by); return; }
        if (activeRef.current && sid(activeRef.current.id) === sid(d.order_id)) {
          if (d.status === 'delivered') { setActive(null); return; }
          setActive({ ...activeRef.current, status: d.status });
          refreshActiveOrder();
        }
      }),
      subscribe('order_updated', () => refreshActiveOrder()), // توافق مع السيرفر القديم
      subscribe('__reconnected', () => refreshDriver()),       // التقاط ما فاتنا أثناء الانقطاع
    ];

    const recvSub = Notifications.addNotificationReceivedListener((n) => {
      handleNotificationData(n?.request?.content?.data, Number(n?.date) || Date.now());
    });
    const respSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // نقرة إشعار فتحت التطبيق من الإغلاق التام
    whenNavReady().then(() => Notifications.getLastNotificationResponseAsync())
      .then(resp => { if (alive && resp) handleResponse(resp); })
      .catch(() => {});

    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') { connectSocket(); refreshDriver(); }
    });

    return () => {
      alive = false;
      unsubs.forEach(u => u());
      recvSub.remove();
      respSub.remove();
      appSub.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      stopAttention();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // استطلاع احتياطي (إن فات السوكِت والإشعار شيء)
  useEffect(() => {
    if (!isOnline) return undefined;
    const t = setInterval(() => {
      if (AppState.currentState === 'active' && !offerRef.current) refreshDriver();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [isOnline, refreshDriver]);

  const value = {
    isOnline, onlineBusy, setOnline,
    driver, refreshDriver,
    activeOrder, setActive, refreshActiveOrder,
    offer, remaining,
    notifyCancelled: handleCancelled,
  };

  return (
    <DriverContext.Provider value={value}>
      {children}
      <OfferModal
        offer={offer}
        remaining={remaining}
        onAccept={acceptOffer}
        onReject={rejectOffer}
        accepting={accepting}
        rejecting={rejecting}
        coords={location.coords}
      />
    </DriverContext.Provider>
  );
}

export const useDriver = () => useContext(DriverContext);
