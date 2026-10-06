// حالة السائق المركزية: الاتصال، الطلب النشط، عروض الطلبات، الإلغاء، السوكِت والإشعارات
// 🧺 + الطلب المجمّع (عدة مطاعم — سائق واحد): عرض واحد للمجموعة، مهمة نشطة واحدة، تحديث/إلغاء المحطات
import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Alert, AppState, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import api, { serverToDevice, noteServerNow } from '../utils/api';
import { connectSocket, subscribe } from '../utils/socket';
import { playOfferChime } from '../utils/pushNotifications';
import { useAuth, setActiveJobProbe } from './AuthContext';
import { useDriverLocation, useDriverCoords } from './LocationContext';
import { ONLINE_KEY } from '../utils/storage';
import { DEFAULT_OFFER_SECONDS } from '../config';
import { isAccepted, isPersonal, isRide, orderNo, money } from '../utils/format';
import { arCount } from '../utils/plural';
import { gid, groupKey, normalizeGroup, isGroupAccepted, groupNo, groupEarning, pickedCount } from '../utils/group';
import { navigate, whenNavReady, closeDeliveryFor, closeDeliveryForGroup, currentRoute } from '../navigation/navRef';
import OfferModal from '../components/OfferModal';
import GroupOfferModal from '../components/GroupOfferModal';
import { ToastHost, showToast } from '../components/Toast';

const DriverContext = createContext({});

const OFFER_VIBRATION = [0, 700, 350, 700, 350, 700, 1200];
const CHIME_EVERY_MS = 3500;
const SEEN_FALLBACK_TTL_MS = 60 * 1000; // عرض بلا expires_at (حمولة قديمة): نتجاهل تكراره دقيقة فقط
const LOADING_STUCK_MS = 15000;
const POLL_MS = 30000;
const SUPPORT_UNREAD_KEY = 'driver_support_unread';

// حالات نهائية لعرض سابق — يُقبل بعدها عرض جديد لنفس الطلب إن كان "نسخة" جديدة (expires_at مختلف)
const TERMINAL = new Set(['rejected', 'expired', 'gone', 'failed', 'replaced', 'offline', 'closed', 'stale', 'taken']);

const handledResponses = new Set(); // ردود الإشعارات المعالجة (حتى لا تُعالج مرتين)

const sid = (v) => (v == null ? '' : String(v));
const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';
// هوية "نسخة" العرض = وقت انتهائها بتوقيت السيرفر (من offer_id "id|expires_at" أو expires_at)
// تُقارن بتسامح ٤ ثوانٍ: السوكِت/الإشعار يحسب expires_at في JS والعرض من القاعدة بفارق أجزاء من الثانية،
// بينما أي إعادة عرض حقيقية لنفس الطلب تأتي بعد ١٢ ثانية على الأقل
const expOf = (...srcs) => {
  for (const s of srcs) {
    if (!s) continue;
    const oid = s.offer_id != null ? String(s.offer_id) : '';
    const raw = oid.includes('|') ? oid.slice(oid.lastIndexOf('|') + 1) : (s.expires_at || s.offer_expires_at);
    const t = raw ? Date.parse(raw) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return null;
};
const sameInst = (a, b) => a != null && b != null && Math.abs(a - b) < 4000;
const secsOf = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// مهلة العرض بساعة الجهاز (D-02): نعتمد على "الثواني المتبقية" من السيرفر محسوبةً من لحظة الاستلام،
// لا على expires_at الخام (ساعة الموبايل قد تكون مقدّمة/متأخرة فتختفي العروض كلها)
//  - payload.offer_seconds + receivedAt (سوكِت/إشعار)
//  - view.offer_seconds + viewAt (GET /orders/:id أو /drivers/me — الأدق لأنه محسوب لحظة الرد)
//  - expires_at مصحّحاً بفرق الساعة (server_now / هيدر Date) فقط إن لم تتوفر الثواني
function computeDeadline({ payload, view, receivedAt, viewAt }) {
  const now = Date.now();
  const cands = [];
  const sp = secsOf(payload?.offer_seconds);
  if (sp != null && sp > 0) cands.push(receivedAt + sp * 1000);
  const sv = secsOf(view?.offer_seconds);
  if (sv != null && viewAt) cands.push(viewAt + sv * 1000);
  if (!cands.length) {
    const exp = expOf(payload, view); // ms بتوقيت السيرفر
    if (exp != null && Number.isFinite(exp)) {
      const local = serverToDevice(exp);
      if (local != null) cands.push(local);
      else if (exp > now - 5000 && exp < now + 130000) cands.push(exp); // معقول بساعة الجهاز
    }
  }
  const deadline = cands.length ? Math.min(...cands) : receivedAt + DEFAULT_OFFER_SECONDS * 1000;
  return Math.min(deadline, now + 120000);
}

// بصمة عرض المجموعة — لمعرفة إن تغيّر شيء يراه السائق (محطات/أجر/تحصيل)
const groupSig = (g) => (g ? [
  (g.stops || []).map(s => sid(s.order_id)).join(','), g.driver_fee, g.tip, g.cash_to_collect,
].join('|') : '');

// نوافذ العروض في مكوّن منفصل: هو فقط من يتابع الإحداثيات والعدّاد (لا يعاد رسم كل التطبيق كل ثانية)
function OfferLayer({ offer, remaining, onAccept, onReject, accepting, rejecting }) {
  const coords = useDriverCoords();
  const singleOffer = offer && !offer.isGroup ? offer : null;
  const groupOffer = offer && offer.isGroup ? offer : null;
  return (
    <>
      <OfferModal offer={singleOffer} remaining={singleOffer ? remaining : 0} onAccept={onAccept} onReject={onReject}
        accepting={accepting} rejecting={rejecting} coords={coords} />
      <GroupOfferModal offer={groupOffer} remaining={groupOffer ? remaining : 0} onAccept={onAccept} onReject={onReject}
        accepting={accepting} rejecting={rejecting} coords={coords} />
    </>
  );
}

export function DriverProvider({ children }) {
  const { user } = useAuth();
  const location = useDriverLocation();

  const [isOnline, setIsOnline] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [driver, setDriver] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeGroup, setActiveGroupState] = useState(null);
  const [offer, setOffer] = useState(null); // { order, deadline, totalSec, key, exp, isGroup? }
  const [remaining, setRemaining] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [supportUnread, setSupportUnread] = useState(false);

  const onlineRef = useRef(false);
  const onlineBusyRef = useRef(false);
  const activeRef = useRef(null);
  const activeGroupRef = useRef(null);
  const doneGroupsRef = useRef(new Set()); // مجموعات انتهت (سُلّمت/أُلغيت) — لا نعيدها من استجابة قديمة
  const offerRef = useRef(null);
  const seenRef = useRef(new Map());       // key → { state, at, exp, rejectOk? }
  const cancelledRef = useRef(new Set());
  const timerRef = useRef(null);
  const chimeRef = useRef(null);
  const acceptingRef = useRef(false);
  const rejectingRef = useRef(false);
  const refreshingRef = useRef(null);
  const lastAcceptRef = useRef(0);         // D-14: وقت آخر قبول — نتجاهل نتائج تحديث بدأ قبله
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

  // التتبّع يتبع المهمة الحالية: مجموعة (أي ابن + group_id) أو طلب عادي
  const syncTracking = useCallback(() => {
    const g = activeGroupRef.current;
    if (g) {
      const child = (g.stops || [])[0]?.order_id || (g.orders || [])[0]?.id || null;
      locRef.current.setTracking({ activeOrderId: child ? sid(child) : groupKey(g.id), activeGroupId: g.id });
      return;
    }
    const o = activeRef.current;
    locRef.current.setTracking({ activeOrderId: o ? o.id : null, activeGroupId: null });
  }, []);

  const setActive = useCallback((o) => {
    const next = o && isAccepted(o) ? o : null;
    activeRef.current = next;
    setActiveOrder(next);
    syncTracking();
  }, [syncTracking]);

  const setGroup = useCallback((g) => {
    let next = g && isGroupAccepted(g) ? g : null;
    if (next && doneGroupsRef.current.has(groupKey(next.id))) next = null;
    activeGroupRef.current = next;
    setActiveGroupState(next);
    syncTracking();
  }, [syncTracking]);

  const markGroupDone = useCallback((id) => {
    if (id == null) return;
    doneGroupsRef.current.add(groupKey(id));
    if (activeGroupRef.current && gid(activeGroupRef.current.id) === gid(id)) setGroup(null);
  }, [setGroup]);

  // X-01: AuthContext يسألنا قبل تسجيل الخروج الإجباري إن كان هناك توصيل جارٍ
  useEffect(() => {
    setActiveJobProbe(() => !!(activeRef.current || activeGroupRef.current));
    return () => setActiveJobProbe(null);
  }, []);

  // ── 💬 رسائل الدعم غير المقروءة (D-11) ──
  useEffect(() => {
    AsyncStorage.getItem(SUPPORT_UNREAD_KEY).then(v => { if (v === '1') setSupportUnread(true); }).catch(() => {});
  }, []);
  const markSupportUnread = useCallback(() => {
    if (currentRoute()?.name === 'SupportChat') return; // المحادثة مفتوحة أصلاً
    setSupportUnread(true);
    AsyncStorage.setItem(SUPPORT_UNREAD_KEY, '1').catch(() => {});
  }, []);
  const markSupportRead = useCallback(() => {
    setSupportUnread(false);
    AsyncStorage.removeItem(SUPPORT_UNREAD_KEY).catch(() => {});
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
    if (cur) seenRef.current.set(cur.key || sid(cur.order.id), { state: reason, at: Date.now(), exp: cur.exp || null });
    offerRef.current = null;
    setOffer(null);
    setRemaining(0);
  }, [stopAttention]);

  // هل نتجاهل عرضاً واصلاً؟ (D-01) — نفس "نسخة" العرض (نفس expires_at) تُتجاهل؛ نسخة جديدة تُفتح
  const shouldSkipSeen = useCallback((key, exp, rejectUrl) => {
    const seen = seenRef.current.get(key);
    if (!seen) return false;
    const age = Date.now() - seen.at;
    if (seen.state === 'loading') return age < LOADING_STUCK_MS;
    if (!TERMINAL.has(seen.state)) return age < SEEN_FALLBACK_TTL_MS; // accepted/group/open/cancelled
    if (exp && seen.exp) {
      if (!sameInst(exp, seen.exp)) return false; // عرض جديد لنفس الطلب (أُعيد إرساله بعد رفض/انتهاء)
      // نفس النسخة التي رفضناها ولم يصل الرفض للسيرفر → نعيد الرفض حتى يتحرر الطلب لسائق آخر
      if (seen.state === 'rejected' && !seen.rejectOk && rejectUrl) {
        api.post(rejectUrl).then(() => { seen.rejectOk = true; }).catch(() => {});
      }
      return true;
    }
    if (exp && !seen.exp) return age < 3000;
    return age < SEEN_FALLBACK_TTL_MS;
  }, []);

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

  const startOfferTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const cur = offerRef.current;
      if (!cur) return;
      const left = Math.max(0, Math.ceil((cur.deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !acceptingRef.current) {
        closeOffer('expired');
        showToast('انتهت مهلة العرض — سنرسل لك الطلب التالي فور توفّره', { tone: 'warn', icon: 'timer-outline' }); // D-22
      }
    }, 500);
  }, [closeOffer]);

  const isSingleOffer = (id) => !!(offerRef.current && !offerRef.current.isGroup && sid(offerRef.current.order.id) === sid(id));

  // ── الإلغاء ──
  const handleCancelled = useCallback((orderId, by) => {
    const id = sid(orderId);
    if (!id || cancelledRef.current.has(id)) return;
    const isOffer = isSingleOffer(id);
    const isActive = activeRef.current && sid(activeRef.current.id) === id;
    const r = currentRoute();
    const onDelivery = r?.name === 'Delivery' && !r.params?.groupId && sid(r.params?.orderId) === id;
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

  // 🧺 إلغاء الطلب المجمّع كاملاً → خروج هادئ مع رسالة
  const handleGroupCancelled = useCallback((groupId, by, reason) => {
    const id = gid(groupId);
    const key = groupKey(id);
    if (!id || cancelledRef.current.has(key)) return;
    const isOffer = !!(offerRef.current?.isGroup && offerRef.current.key === key);
    const isActive = !!(activeGroupRef.current && gid(activeGroupRef.current.id) === id);
    const r = currentRoute();
    const onDelivery = r?.name === 'Delivery' && gid(r.params?.groupId) === id;
    if (!isOffer && !isActive && !onDelivery) return;
    cancelledRef.current.add(key);
    doneGroupsRef.current.add(key);
    seenRef.current.set(key, { state: 'cancelled', at: Date.now() });
    const g = isOffer ? offerRef.current.order : activeGroupRef.current;
    const hadPicked = !isOffer && pickedCount(g) > 0;
    if (isOffer) closeOffer('cancelled');
    if (isActive) setGroup(null);
    closeDeliveryForGroup(id);
    try { Vibration.vibrate([0, 450, 200, 450]); } catch {}
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    const who = by === 'customer' ? 'ألغى الزبون الطلب المجمّع'
      : by === 'restaurant' ? 'اعتذرت كل المطاعم عن الطلب المجمّع'
        : by === 'admin' ? 'ألغت الإدارة الطلب المجمّع' : 'تم إلغاء الطلب المجمّع';
    const lines = [`${who} #${g ? groupNo(g) : id}.`];
    if (reason && by !== 'restaurant') lines.push(`السبب: ${reason}`);
    lines.push(isOffer ? 'لم يعد العرض متاحاً.' : 'لا داعي لإكمال الاستلام أو التوصيل.');
    if (hadPicked) lines.push('إن كنت استلمت طلبات من المطاعم، تواصل مع الإدارة لترتيب إرجاعها.');
    Alert.alert('تم إلغاء الطلب', lines.join('\n'));
  }, [closeOffer, setGroup]);

  // عرض لم يعد صالحاً قبل ظهوره (انتهت مهلته أثناء الوصول) — لا نسقطه بصمت (D-02)
  const noteMissedOffer = useCallback(() => {
    showToast('فاتك عرض طلب — انتهت مهلته قبل أن يصل لجهازك. ابقَ متصلاً وسيصلك التالي.', { tone: 'warn', icon: 'timer-outline', ms: 5000 });
  }, []);

  const openOffer = useCallback(async (payload, { receivedAt = Date.now(), preloaded = null, preloadedAt = null } = {}) => {
    const id = sid(payload?.order_id ?? payload?.id);
    if (!id) return;
    const incomingExp = expOf(payload, preloaded);
    // نفس العرض ظاهر (سوكِت + إشعار لنفس الطلب) → لا نعيد ضبط المؤقت
    if (isSingleOffer(id)) {
      const cur = offerRef.current;
      const d = computeDeadline({ payload, view: preloaded, receivedAt, viewAt: preloadedAt });
      if (incomingExp && cur.exp && !sameInst(incomingExp, cur.exp) && d > Date.now() + 2000) {
        // نسخة أحدث من العرض (أُعيد إرساله) → نعتمد مهلتها الجديدة
        offerRef.current = { ...cur, exp: incomingExp, deadline: d, totalSec: Math.max(1, Math.round((d - Date.now()) / 1000)) };
        setOffer(offerRef.current);
      } else if (d < cur.deadline - 1000) {
        offerRef.current = { ...cur, deadline: d };
        setOffer(offerRef.current);
      }
      return;
    }
    if (activeRef.current && sid(activeRef.current.id) === id) return;
    if (cancelledRef.current.has(id)) return;
    if (shouldSkipSeen(id, incomingExp, `/orders/${id}/reject`)) return;
    seenRef.current.set(id, { state: 'loading', at: Date.now(), exp: incomingExp });

    let order = null;
    let viewAt = null;
    let fetched = false;
    let netFail = false;
    for (let attempt = 0; attempt < 2 && !fetched; attempt++) {
      try {
        const t0 = Date.now();
        const r = await api.get(`/orders/${id}`);
        order = r?.data || null;
        viewAt = Math.round((t0 + Date.now()) / 2); // الثواني المتبقية محسوبة لحظة الرد تقريباً
        fetched = !!order;
        netFail = false;
        break;
      } catch (e) {
        netFail = !e?.status || e.status >= 500;
        if (!netFail || attempt > 0) break;
        await new Promise(r => setTimeout(r, 1200)); // خطأ شبكة عابر → محاولة ثانية واحدة
      }
    }
    if (!fetched) { order = preloaded; viewAt = preloadedAt; }
    const exp = expOf(order, payload) || incomingExp;
    const mark = (state) => seenRef.current.set(id, { state, at: Date.now(), exp });
    if (!order) {
      seenRef.current.delete(id);
      // لا نُسقط العرض بصمت (D-02): نخبر السائق، والاستطلاع/إعادة الإرسال سيعيد فتحه إن بقي متاحاً
      if (netFail) showToast('وصلك عرض طلب لكن تعذّر تحميل تفاصيله — تحقّق من الإنترنت', { tone: 'warn', icon: 'cloud-offline-outline', ms: 5000 });
      return;
    }
    // ابن طلب مجمّع وصلنا كعرض عادي (توافق) → يُعالج كمجموعة
    if (order.group_id || order.is_group) { mark('group'); return; }

    if (['cancelled', 'delivered', 'on_the_way', 'pending'].includes(order.status)) { mark('stale'); return; }
    if (isAccepted(order)) { mark('accepted'); setActive(order); return; }
    const me = userRef.current?.id;
    if (order.driver_id && me && sid(order.driver_id) !== sid(me)) { mark('taken'); return; }
    // السيرفر لم يعد يعرضه على أحد (انتهت مهلته أو رُفض) — عرض قديم
    if (fetched && !order.driver_id) { mark('gone'); return; }

    const deadline = computeDeadline({ payload, view: order, receivedAt, viewAt });
    if (deadline - Date.now() < 2000) { mark('expired'); noteMissedOffer(); return; }

    if (offerRef.current) closeOffer('replaced');
    const totalSec = Math.max(1, Math.round((deadline - Date.now()) / 1000));
    offerRef.current = { order, deadline, totalSec, openedAt: Date.now(), key: id, exp };
    mark('open');
    setOffer(offerRef.current);
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    startOfferTimer();
    startAttention();
  }, [closeOffer, setActive, startAttention, startOfferTimer, shouldSkipSeen, noteMissedOffer]);

  // ── 🧺 عرض الطلب المجمّع ──
  // تحديث العرض الظاهر في مكانه (نفس المجموعة): محطات/أجر/مهلة — بلا إعادة رنين
  const updateGroupOffer = useCallback((key, src, { payload = null, receivedAt = Date.now(), view = null, viewAt = null, note = null, flag = true } = {}) => {
    const cur = offerRef.current;
    if (!cur || !cur.isGroup || cur.key !== key) return false;
    const group = src ? normalizeGroup(src, cur.order) : cur.order;
    let { deadline, totalSec, exp } = cur;
    const incomingExp = expOf(payload, view);
    if ((payload && (payload.expires_at || payload.offer_seconds)) || (view && view.offer_seconds != null)) {
      const d = computeDeadline({ payload, view, receivedAt, viewAt });
      const newInstance = incomingExp && exp && !sameInst(incomingExp, exp);
      if (newInstance && d > Date.now() + 2000) {
        deadline = d; exp = incomingExp;
        totalSec = Math.max(1, Math.round((d - Date.now()) / 1000));
      } else if (d < deadline - 1000) deadline = d;
      // إعادة إرسال حقيقية من السيرفر (بتفاصيل كاملة) بمهلة أطول → نمدّد
      else if (Array.isArray(payload?.stops) && d > deadline + 1500) {
        deadline = d;
        totalSec = Math.max(totalSec, Math.round((d - Date.now()) / 1000));
      }
    }
    const changed = groupSig(group) !== groupSig(cur.order);
    const next = { ...cur, order: group, deadline, totalSec, exp };
    if (flag && (changed || note)) {
      next.updatedAt = Date.now();
      const fewer = (group.stops || []).length < (cur.order.stops || []).length;
      next.updatedNote = note || (fewer
        ? `اعتذر أحد المطاعم — العرض الآن ${arCount((group.stops || []).length, 'restaurant')}، أرباحك ${money(groupEarning(group))}`
        : 'تم تحديث تفاصيل العرض');
    }
    offerRef.current = next;
    setOffer(next);
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    return true;
  }, []);

  const fetchGroupView = useCallback(async (id) => {
    const r = await api.get(`/orders/groups/${id}`);
    return r?.data || null;
  }, []);

  // إثراء العرض بتفاصيل كاملة (هاتف المطعم، عدد الأصناف...) — بصمت
  const enrichGroupOffer = useCallback((id) => {
    const key = groupKey(id);
    const t0 = Date.now();
    fetchGroupView(id).then((v) => {
      if (!v) return;
      if (v.status === 'cancelled') { handleGroupCancelled(v.id, v.cancelled_by, v.cancel_reason); return; }
      if (v.is_offer !== true && !isGroupAccepted(v)) { if (offerRef.current?.key === key && !acceptingRef.current) closeOffer('gone'); return; }
      updateGroupOffer(key, v, { flag: true, view: v, viewAt: Math.round((t0 + Date.now()) / 2) });
    }).catch((e) => {
      if ((e?.status === 403 || e?.status === 404) && offerRef.current?.key === key && !acceptingRef.current) closeOffer('gone');
    });
  }, [fetchGroupView, updateGroupOffer, closeOffer, handleGroupCancelled]);

  const openGroupOffer = useCallback(async (payload, { receivedAt = Date.now(), view = null, viewAt = null } = {}) => {
    const id = gid(payload?.group_id ?? view?.id ?? view?.group_id);
    if (!id) return;
    const key = groupKey(id);
    // نفس المجموعة ظاهرة → تحديث في مكانه (عرض مُعاد/محدّث)
    if (offerRef.current?.isGroup && offerRef.current.key === key) {
      const hasDetails = Array.isArray(payload?.stops) || !!view;
      updateGroupOffer(key, hasDetails ? (view || payload) : null, { payload, receivedAt, view, viewAt });
      return;
    }
    if (activeGroupRef.current && gid(activeGroupRef.current.id) === id) return;
    if (cancelledRef.current.has(key) || doneGroupsRef.current.has(key)) return;
    const incomingExp = expOf(payload, view);
    if (shouldSkipSeen(key, incomingExp, `/orders/groups/${id}/reject`)) return;
    seenRef.current.set(key, { state: 'loading', at: Date.now(), exp: incomingExp });

    let v = view;
    let vAt = viewAt;
    let fromPayload = false;
    if (!v) {
      if (Array.isArray(payload?.stops) && payload.stops.length) {
        v = payload; fromPayload = true; // حمولة السوكِت كافية للعرض فوراً
      } else {
        try {
          const t0 = Date.now();
          v = await fetchGroupView(id);
          vAt = Math.round((t0 + Date.now()) / 2);
        } catch (e) {
          if (e?.status === 403 || e?.status === 404) seenRef.current.set(key, { state: 'stale', at: Date.now(), exp: incomingExp });
          else seenRef.current.delete(key);
          return;
        }
      }
    }
    if (!v) { seenRef.current.delete(key); return; }
    const exp = (fromPayload ? null : expOf(v)) || incomingExp;
    const mark = (state) => seenRef.current.set(key, { state, at: Date.now(), exp });

    if (!fromPayload) {
      if (['cancelled', 'delivered'].includes(v.status)) { mark('stale'); return; }
      const me = userRef.current?.id;
      if (isGroupAccepted(v)) {
        if (!me || sid(v.driver_id) === sid(me)) { mark('accepted'); setGroup(normalizeGroup(v)); }
        else mark('taken');
        return;
      }
      if (v.is_offer !== true || v.status !== 'confirmed') { mark('stale'); return; }
    }

    const deadline = computeDeadline({ payload, view: fromPayload ? null : v, receivedAt, viewAt: vAt });
    if (deadline - Date.now() < 2000) { mark('expired'); noteMissedOffer(); return; }

    if (offerRef.current) closeOffer('replaced');
    const totalSec = Math.max(1, Math.round((deadline - Date.now()) / 1000));
    offerRef.current = { isGroup: true, key, order: normalizeGroup(v), deadline, totalSec, openedAt: Date.now(), exp };
    mark('open');
    setOffer(offerRef.current);
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    startOfferTimer();
    startAttention();
    if (fromPayload) enrichGroupOffer(id);
  }, [closeOffer, setGroup, startAttention, startOfferTimer, updateGroupOffer, fetchGroupView, enrichGroupOffer, shouldSkipSeen, noteMissedOffer]);

  // ── 🧺 تحديث المجموعة النشطة من السيرفر ──
  const refreshActiveGroup = useCallback(async () => {
    const cur = activeGroupRef.current;
    if (!cur) return null;
    try {
      const v = await fetchGroupView(cur.id);
      if (!v) return null;
      if (v.status === 'cancelled') { handleGroupCancelled(v.id, v.cancelled_by, v.cancel_reason); return v; }
      if (v.status === 'delivered') { markGroupDone(v.id); return v; }
      if (activeGroupRef.current && gid(activeGroupRef.current.id) === gid(v.id)) setGroup(normalizeGroup(v, activeGroupRef.current));
      return v;
    } catch (e) {
      if (e?.status === 403 || e?.status === 404) setGroup(null);
      return null;
    }
  }, [fetchGroupView, handleGroupCancelled, markGroupDone, setGroup]);

  // مطعم ضمن المجموعة اعتذر (group_updated): نحذف محطته محلياً فوراً ثم نزامن مع السيرفر
  const handleGroupUpdated = useCallback((d) => {
    const id = gid(d?.group_id);
    if (!id) return;
    const key = groupKey(id);
    const name = d.restaurant_name || 'أحد المطاعم';
    const totals = d.totals || {};
    const patch = (base) => {
      const stops = (base.stops || []).filter(s => sid(s.order_id) !== sid(d.order_id));
      const unpaid = base.payment_method !== 'card';
      return normalizeGroup({
        stops,
        driver_fee: totals.driver_fee != null ? totals.driver_fee : base.driver_fee,
        tip: totals.tip != null ? totals.tip : base.tip,
        total: totals.total != null ? totals.total : base.total,
        cash_to_collect: totals.total != null ? (unpaid ? totals.total : 0) : base.cash_to_collect,
      }, base);
    };
    const cur = offerRef.current;
    if (cur?.isGroup && cur.key === key) {
      const next = patch(cur.order);
      updateGroupOffer(key, next, {
        note: `اعتذر مطعم ${name} — العرض الآن ${arCount((next.stops || []).length, 'restaurant')}، أرباحك ${money(groupEarning(next))}`,
      });
      enrichGroupOffer(id);
      return;
    }
    const ag = activeGroupRef.current;
    if (ag && gid(ag.id) === id) {
      const next = patch(ag);
      setGroup(next);
      try { Vibration.vibrate([0, 250, 120, 250]); } catch {}
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      showToast(`مطعم ${name} ألغى طلبه — لا داعي للمرور عليه. أرباحك الآن ${money(groupEarning(next))}`, { tone: 'warn', icon: 'storefront', ms: 6000 });
      refreshActiveGroup();
    }
  }, [updateGroupOffer, enrichGroupOffer, setGroup, refreshActiveGroup]);

  // ابن واحد أُلغي (order_cancelled مع group_id) = محطة سقطت، لا المهمة كلها → نزامن فقط
  const handleGroupChildChanged = useCallback((groupId) => {
    const id = gid(groupId);
    if (!id) return;
    const key = groupKey(id);
    if (offerRef.current?.isGroup && offerRef.current.key === key) { enrichGroupOffer(id); return; }
    if (activeGroupRef.current && gid(activeGroupRef.current.id) === id) refreshActiveGroup();
  }, [enrichGroupOffer, refreshActiveGroup]);

  // هل هذا الطلب محطة ضمن المجموعة النشطة؟ (إشعار "الطلب جاهز" لا يحمل group_id في السيرفر الحالي)
  const groupHasChild = useCallback((orderId) => {
    const g = activeGroupRef.current;
    return !!(g && orderId != null && (g.stops || []).some(s => sid(s.order_id) === sid(orderId)));
  }, []);

  // ── تحديث من السيرفر ──
  const refreshDriver = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    refreshingRef.current = (async () => {
      try {
        const startedAt = Date.now();
        const r = await api.get('/drivers/me');
        const respAt = Date.now();
        const d = r?.data || null;
        if (!d) return null;
        setDriver(d);
        const online = !!(d.is_online || d.isOnline);
        if (online !== onlineRef.current) applyOnline(online);
        // D-14: قبلنا طلباً بعد بدء هذا الطلب → لقطة قديمة، لا نلمس المهمة الحالية
        const staleSnapshot = startedAt <= lastAcceptRef.current || acceptingRef.current;
        let ao = d.active_order || null;
        if (ao && d.is_offer != null && ao.is_offer == null) ao = { ...ao, is_offer: !!d.is_offer };
        // 🧺 السيرفر الجديد: active_group له الأولوية؛ ابن المجموعة في active_order يُتجاهل
        const ag = d.active_group || null;
        if (ao && (ao.group_id || ao.is_group)) ao = null;
        // العرض الظاهر لم يعد مُسنداً لنا (انتهت مهلته على السيرفر) → أغلقه
        // D-13: فقط عروض فُتحت قبل بدء هذا الطلب (وإلا قد نغلق عرضاً صحيحاً وصل أثناءه)
        const curOffer = offerRef.current;
        if (curOffer && !acceptingRef.current && (curOffer.openedAt || 0) < startedAt - 1000) {
          const still = curOffer.isGroup
            ? !!(ag && ag.is_offer && gid(ag.id) === gid(curOffer.order.id))
            : !!(ao && sid(ao.id) === sid(curOffer.order.id));
          if (!still) {
            closeOffer('gone');
            showToast('لم يعد العرض متاحاً — انتهت مهلته', { tone: 'warn', icon: 'timer-outline' });
          }
        }

        if (ag) {
          if (isGroupAccepted(ag)) {
            const prev = activeGroupRef.current && gid(activeGroupRef.current.id) === gid(ag.id) ? activeGroupRef.current : null;
            setGroup(normalizeGroup(ag, prev));
          } else if (ag.is_offer && ag.status === 'confirmed' && !acceptingRef.current) {
            openGroupOffer({ group_id: ag.id }, { view: ag, viewAt: respAt, receivedAt: respAt });
          }
        } else if (activeGroupRef.current && !staleSnapshot) {
          // D-03: المجموعة النشطة غابت عن الرد — لا نحذفها إلا بتأكيد من السيرفر (خطأ مؤقت ≠ انتهاء المهمة)
          const prevG = activeGroupRef.current;
          let pv = null; let unknown = false; let gone = false;
          try { pv = await fetchGroupView(prevG.id); } catch (e) {
            if (e?.status === 403 || e?.status === 404) gone = true; else unknown = true;
          }
          const stillSame = activeGroupRef.current && gid(activeGroupRef.current.id) === gid(prevG.id);
          if (stillSame && !unknown) {
            const me = userRef.current?.id;
            if (gone || !pv) setGroup(null);
            else if (pv.status === 'cancelled') handleGroupCancelled(prevG.id, pv.cancelled_by, pv.cancel_reason);
            else if (pv.status === 'delivered') markGroupDone(prevG.id);
            else if (pv.driver_id && me && sid(pv.driver_id) !== sid(me)) setGroup(null);
            else if (isGroupAccepted(pv)) setGroup(normalizeGroup(pv, prevG)); // ما زالت مهمتنا
            else setGroup(null);
          }
        }

        if (ao && isAccepted(ao)) {
          setActive(activeRef.current && sid(activeRef.current.id) === sid(ao.id) ? { ...activeRef.current, ...ao } : ao);
        } else {
          const prev = activeRef.current;
          // D-14: نفس الطلب يظهر "غير مقبول" في لقطة قديمة → نبقيه (التحقق التالي سيصحّح)
          const sameAsPrev = prev && ao && sid(ao.id) === sid(prev.id);
          if (prev && !sameAsPrev && !staleSnapshot) {
            // كان عندنا طلب نشط واختفى؟ نتحقق قبل الحذف
            let pr = null; let unknown = false; let gone = false;
            try { pr = (await api.get(`/orders/${prev.id}`))?.data || null; } catch (e) {
              if (e?.status === 403 || e?.status === 404) gone = true; else unknown = true;
            }
            const stillSame = activeRef.current && sid(activeRef.current.id) === sid(prev.id);
            if (stillSame && !unknown) {
              const me = userRef.current?.id;
              if (gone || !pr) setActive(null);
              else if (pr.status === 'cancelled') { handleCancelled(prev.id, pr.cancelled_by); if (activeRef.current && sid(activeRef.current.id) === sid(prev.id)) setActive(null); }
              else if (pr.status === 'delivered') setActive(null);
              else if (pr.driver_id && me && sid(pr.driver_id) !== sid(me)) setActive(null);
              else if (isAccepted(pr)) setActive({ ...prev, ...pr });
              else setActive(null);
            }
          }
          if (ao && ['confirmed', 'preparing', 'ready'].includes(ao.status) && !isAccepted(ao) && !acceptingRef.current
            && !(activeRef.current && sid(activeRef.current.id) === sid(ao.id))) {
            openOffer({ order_id: ao.id }, { preloaded: ao, preloadedAt: respAt, receivedAt: respAt });
          }
        }
        return d;
      } catch { return null; } finally { refreshingRef.current = null; }
    })();
    return refreshingRef.current;
  }, [applyOnline, setActive, setGroup, openOffer, openGroupOffer, handleCancelled, handleGroupCancelled, markGroupDone, closeOffer, fetchGroupView]);

  const refreshActiveOrder = useCallback(async () => {
    if (activeGroupRef.current && !activeRef.current) return refreshActiveGroup();
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
  }, [refreshDriver, refreshActiveGroup, handleCancelled, setActive]);

  // ── قبول/رفض ──
  const acceptOffer = useCallback(async () => {
    const cur = offerRef.current;
    if (!cur || acceptingRef.current || rejectingRef.current) return;
    acceptingRef.current = true;
    lastAcceptRef.current = Date.now();
    setAccepting(true);
    stopAttention();
    const o = cur.order;
    try {
      if (cur.isGroup) {
        const r = await api.post(`/orders/groups/${o.id}/accept`);
        const data = r?.data || {};
        lastAcceptRef.current = Date.now();
        closeOffer('accepted');
        const next = normalizeGroup({
          ...(Array.isArray(data.stops) ? { stops: data.stops } : {}),
          status: 'picking_up', is_offer: false,
          driver_assigned_at: o.driver_assigned_at || new Date().toISOString(),
          driver_id: userRef.current?.id ?? o.driver_id,
        }, o);
        setGroup(next);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const n = (next.stops || []).length;
        // D-16: إشعار القبول كـ Toast (لا نافذة تتراكب مع نافذة إذن الموقع بالخلفية على iOS)
        setTimeout(() => {
          navigate('Delivery', { groupId: o.id });
          showToast(`تم قبول الطلب المجمّع ✅ استلم من ${arCount(n, 'restaurant')} حسب المسار المقترح، ثم سلّم الكل للزبون دفعة واحدة.`, { tone: 'success', icon: 'checkmark-circle', ms: 6000 });
        }, 650);
        return;
      }
      await api.post(`/orders/${o.id}/accept`);
      lastAcceptRef.current = Date.now();
      closeOffer('accepted');
      setActive({ ...o, is_offer: false, status: o.status === 'confirmed' ? 'preparing' : o.status, driver_assigned_at: o.driver_assigned_at || new Date().toISOString() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const msg = isPersonal(o)
        ? (isRide(o) ? 'انطلق الآن إلى نقطة الاستلام لتوصيل الراكب' : 'انطلق الآن إلى نقطة الاستلام لاستلام الطرد')
        : 'انطلق الآن إلى المطعم لاستلام الطلب';
      // ننتظر حتى تُغلق نافذة العرض تماماً (iOS يرفض فتح شاشة أثناء إغلاق Modal)
      setTimeout(() => {
        navigate('Delivery', { orderId: o.id });
        showToast(`تم قبول الطلب ✅ ${msg}`, { tone: 'success', icon: 'checkmark-circle', ms: 5000 });
      }, 650);
    } catch (e) {
      closeOffer('failed'); // لا نترك بطاقة لطلب لم يعد متاحاً
      Alert.alert('تعذّر قبول الطلب', e?.message || 'الطلب لم يعد متاحاً');
      refreshDriver();
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  }, [closeOffer, setActive, setGroup, stopAttention, refreshDriver]);

  const rejectOffer = useCallback(async () => {
    const cur = offerRef.current;
    if (!cur || acceptingRef.current || rejectingRef.current) return;
    rejectingRef.current = true;
    setRejecting(true);
    stopAttention();
    const url = cur.isGroup ? `/orders/groups/${cur.order.id}/reject` : `/orders/${cur.order.id}/reject`;
    let ok = false;
    try { await api.post(url); ok = true; } catch {}
    closeOffer('rejected');
    const seen = seenRef.current.get(cur.key || sid(cur.order.id));
    if (seen) seen.rejectOk = ok;
    rejectingRef.current = false;
    setRejecting(false);
  }, [closeOffer, stopAttention]);

  // ── الاتصال (أونلاين/أوفلاين) ──
  const setOnline = useCallback(async (value) => {
    if (onlineBusyRef.current) return;
    if (!value && (activeRef.current || activeGroupRef.current)) {
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
      if (e?.status === 409) { Alert.alert('عندك طلب نشط', e?.message || 'أكمل التوصيل الحالي قبل إيقاف استقبال الطلبات.'); refreshDriver(); }
      else Alert.alert('خطأ', e?.message || 'فشل في تغيير الحالة');
    } finally {
      onlineBusyRef.current = false;
      setOnlineBusy(false);
    }
  }, [applyOnline, closeOffer, refreshDriver]);

  // تتبّع الخلفية فقط أثناء توصيل نشط (طلب عادي أو مجمّع)
  // D-16: نطلب إذن الخلفية بعد إغلاق نافذة العرض والانتقال للتوصيل (لا يتراكب مع أي نافذة أخرى)
  const activeId = activeOrder?.id || (activeGroup ? groupKey(activeGroup.id) : null);
  useEffect(() => {
    if (!activeId) { locRef.current.stopBackground(); return undefined; }
    const t = setTimeout(() => { locRef.current.ensureBackgroundTracking(); }, 1600);
    return () => clearTimeout(t);
  }, [activeId]);

  // ── معالجة الإشعارات ──
  const handleNotificationData = useCallback((data, receivedAt) => {
    if (!data || data._offerChime) return;
    const groupId = data.group_id ? sid(data.group_id) : '';
    if (data.type === 'support') { markSupportUnread(); return; }
    if (data.type === 'new_order_request' && groupId && (truthy(data.is_group) || !data.order_id)) {
      openGroupOffer(data, { receivedAt: receivedAt || Date.now() });
    } else if (data.type === 'new_order_request' && data.order_id) {
      openOffer(data, { receivedAt: receivedAt || Date.now() });
    } else if (groupId) {
      // تحديث/إلغاء محطة/إلغاء مجموعة: المصدر الموثوق هو السيرفر
      handleGroupChildChanged(groupId);
    } else if (data.order_id && groupHasChild(data.order_id)) {
      // D-15: محطة ضمن مجموعتنا (مثلاً "الطلب جاهز") بلا group_id في الحمولة
      refreshActiveGroup();
    } else if (data.type === 'order_cancelled' || (data.type === 'order_status' && data.status === 'cancelled')) {
      handleCancelled(data.order_id, data.by);
    } else if (data.order_id && activeRef.current && sid(activeRef.current.id) === sid(data.order_id)) {
      refreshActiveOrder();
    }
  }, [openOffer, openGroupOffer, handleCancelled, handleGroupChildChanged, refreshActiveOrder, refreshActiveGroup, groupHasChild, markSupportUnread]);

  const handleResponse = useCallback((response) => {
    if (!response) return;
    const rid = response.notification?.request?.identifier || `${response.notification?.date}`;
    if (handledResponses.has(rid)) return;
    handledResponses.add(rid);
    const data = response.notification?.request?.content?.data || {};
    if (data._offerChime) return;
    const at = Number(response.notification?.date) || Date.now();
    // D-11: رد الدعم → فتح المحادثة مباشرة
    if (data.type === 'support') { navigate('SupportChat'); return; }
    handleNotificationData(data, at);
    if (data.type === 'new_order_request') return;
    const g = activeGroupRef.current;
    if (g && ((data.group_id && gid(g.id) === gid(data.group_id)) || groupHasChild(data.order_id))) {
      navigate('Delivery', { groupId: g.id }); // D-15
    } else if (data.order_id && activeRef.current && sid(activeRef.current.id) === sid(data.order_id)) {
      navigate('Delivery', { orderId: activeRef.current.id });
    }
  }, [handleNotificationData, groupHasChild]);

  // ── الإقلاع: كاش، سوكِت، مستمعين ──
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ONLINE_KEY).then(v => { if (alive && v === '1' && !onlineRef.current) setIsOnline(true); }).catch(() => {});
    refreshDriver();
    connectSocket();

    const unsubs = [
      subscribe('new_order_request', (d) => {
        if (d?.server_now) noteServerNow(d.server_now); // تصحيح فرق ساعة الجهاز (D-02)
        if (d && (d.is_group || (d.group_id && Array.isArray(d.stops)))) openGroupOffer(d, { receivedAt: Date.now() });
        else openOffer(d, { receivedAt: Date.now() });
      }),
      subscribe('order_cancelled', (d) => {
        if (d?.group_id) { handleGroupChildChanged(d.group_id); return; } // محطة سقطت — ليست المهمة كلها
        handleCancelled(d?.order_id, d?.by);
      }),
      subscribe('order_status', (d) => {
        if (!d) return;
        // حالة ابن ضمن مجموعتنا (المطعم جهّز طلبه مثلاً) → نحدّث المحطة
        if (groupHasChild(d.order_id)) {
          const g = activeGroupRef.current;
          if (d.status === 'cancelled') { refreshActiveGroup(); return; }
          setGroup({ ...g, stops: g.stops.map(s => (sid(s.order_id) === sid(d.order_id) ? { ...s, status: d.status, picked: s.picked || d.status === 'on_the_way' || d.status === 'delivered' } : s)) });
          return;
        }
        if (d.status === 'cancelled') { handleCancelled(d.order_id, d.by); return; }
        if (activeRef.current && sid(activeRef.current.id) === sid(d.order_id)) {
          if (d.status === 'delivered') { setActive(null); return; }
          setActive({ ...activeRef.current, status: d.status });
          refreshActiveOrder();
        }
      }),
      // 🧺 أحداث الطلب المجمّع
      subscribe('group_status', (d) => {
        const id = gid(d?.group_id);
        if (!id) return;
        const g = activeGroupRef.current;
        if (d.status === 'cancelled') {
          // group_cancelled يصل بعده بسبب ومَن ألغى؛ احتياط إن لم يصل
          setTimeout(() => { if (!cancelledRef.current.has(groupKey(id))) handleGroupChildChanged(id); }, 2000);
          return;
        }
        if (g && gid(g.id) === id) {
          if (d.status === 'delivered') { markGroupDone(id); return; }
          setGroup({ ...g, status: d.status || g.status, status_label: d.status_label || g.status_label, picked_count: d.picked_count ?? g.picked_count });
          refreshActiveGroup();
        }
      }),
      subscribe('group_updated', (d) => handleGroupUpdated(d)),
      subscribe('group_cancelled', (d) => handleGroupCancelled(d?.group_id, d?.by, d?.reason)),
      subscribe('order_updated', () => refreshActiveOrder()), // توافق مع السيرفر القديم
      subscribe('support_message', () => markSupportUnread()), // D-11
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

  // D-19: قيمة السياق ثابتة ما لم يتغيّر شيء يخص المستهلكين (العدّاد "remaining" ليس هنا)
  const value = useMemo(() => ({
    isOnline, onlineBusy, setOnline,
    driver, refreshDriver,
    activeOrder, setActive, refreshActiveOrder,
    activeGroup, setActiveGroup: setGroup, refreshActiveGroup, markGroupDone,
    offer,
    supportUnread, markSupportRead,
    notifyCancelled: handleCancelled,
    notifyGroupCancelled: handleGroupCancelled,
  }), [isOnline, onlineBusy, setOnline, driver, refreshDriver, activeOrder, setActive, refreshActiveOrder,
    activeGroup, setGroup, refreshActiveGroup, markGroupDone, offer, supportUnread, markSupportRead, handleCancelled, handleGroupCancelled]);

  return (
    <DriverContext.Provider value={value}>
      {children}
      <OfferLayer offer={offer} remaining={remaining} onAccept={acceptOffer} onReject={rejectOffer} accepting={accepting} rejecting={rejecting} />
      <ToastHost />
    </DriverContext.Provider>
  );
}

export const useDriver = () => useContext(DriverContext);
