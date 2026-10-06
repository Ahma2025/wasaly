// حالة السائق المركزية: الاتصال، الطلب النشط، عروض الطلبات، الإلغاء، السوكِت والإشعارات
// 🧺 + الطلب المجمّع (عدة مطاعم — سائق واحد): عرض واحد للمجموعة، مهمة نشطة واحدة، تحديث/إلغاء المحطات
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
import { isAccepted, isPersonal, isRide, orderNo, money } from '../utils/format';
import { gid, groupKey, normalizeGroup, isGroupAccepted, groupNo, groupEarning, pickedCount } from '../utils/group';
import { navigate, whenNavReady, closeDeliveryFor, closeDeliveryForGroup, currentRoute } from '../navigation/navRef';
import OfferModal from '../components/OfferModal';
import GroupOfferModal from '../components/GroupOfferModal';
import { ToastHost, showToast } from '../components/Toast';

const DriverContext = createContext({});

const OFFER_VIBRATION = [0, 700, 350, 700, 350, 700, 1200];
const CHIME_EVERY_MS = 3500;
const SEEN_TTL_MS = 10 * 60 * 1000;
const POLL_MS = 30000;

const handledResponses = new Set(); // ردود الإشعارات المعالجة (حتى لا تُعالج مرتين)

const sid = (v) => (v == null ? '' : String(v));
const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1';

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

// بصمة عرض المجموعة — لمعرفة إن تغيّر شيء يراه السائق (محطات/أجر/تحصيل)
const groupSig = (g) => (g ? [
  (g.stops || []).map(s => sid(s.order_id)).join(','), g.driver_fee, g.tip, g.cash_to_collect,
].join('|') : '');

export function DriverProvider({ children }) {
  const { user } = useAuth();
  const location = useDriverLocation();

  const [isOnline, setIsOnline] = useState(false);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [driver, setDriver] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [activeGroup, setActiveGroupState] = useState(null);
  const [offer, setOffer] = useState(null); // { order, deadline, totalSec, key, isGroup? }
  const [remaining, setRemaining] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const onlineRef = useRef(false);
  const onlineBusyRef = useRef(false);
  const activeRef = useRef(null);
  const activeGroupRef = useRef(null);
  const doneGroupsRef = useRef(new Set()); // مجموعات انتهت (سُلّمت/أُلغيت) — لا نعيدها من استجابة قديمة
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

  // ── عرض الطلب ──
  const stopAttention = useCallback(() => {
    try { Vibration.cancel(); } catch {}
    if (chimeRef.current) { clearInterval(chimeRef.current); chimeRef.current = null; }
  }, []);

  const closeOffer = useCallback((reason = 'closed') => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopAttention();
    const cur = offerRef.current;
    if (cur) seenRef.current.set(cur.key || sid(cur.order.id), { state: reason, at: Date.now() });
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

  const startOfferTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const cur = offerRef.current;
      if (!cur) return;
      const left = Math.max(0, Math.ceil((cur.deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !acceptingRef.current) closeOffer('expired');
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

  const openOffer = useCallback(async (payload, { receivedAt = Date.now(), preloaded = null } = {}) => {
    const id = sid(payload?.order_id ?? payload?.id);
    if (!id) return;
    // نفس العرض ظاهر (سوكِت + إشعار لنفس الطلب) → لا نعيد ضبط المؤقت
    if (isSingleOffer(id)) {
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
    // ابن طلب مجمّع وصلنا كعرض عادي (توافق) → يُعالج كمجموعة
    if (order.group_id || order.is_group) { seenRef.current.set(id, { state: 'group', at: Date.now() }); return; }

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
    offerRef.current = { order, deadline, totalSec, openedAt: Date.now(), key: id };
    seenRef.current.set(id, { state: 'open', at: Date.now() });
    setOffer(offerRef.current);
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    startOfferTimer();
    startAttention();
  }, [closeOffer, setActive, startAttention, startOfferTimer]);

  // ── 🧺 عرض الطلب المجمّع ──
  // تحديث العرض الظاهر في مكانه (نفس المجموعة): محطات/أجر/مهلة — بلا إعادة رنين
  const updateGroupOffer = useCallback((key, src, { payload = null, receivedAt = Date.now(), note = null, flag = true } = {}) => {
    const cur = offerRef.current;
    if (!cur || !cur.isGroup || cur.key !== key) return false;
    const group = src ? normalizeGroup(src, cur.order) : cur.order;
    let { deadline, totalSec } = cur;
    if (payload && (payload.expires_at || payload.offer_seconds)) {
      const d = computeDeadline(payload, null, receivedAt);
      if (d < deadline - 500) deadline = d;
      // إعادة إرسال حقيقية من السيرفر (بتفاصيل كاملة) بمهلة أطول → نمدّد
      else if (Array.isArray(payload.stops) && d > deadline + 1500) {
        deadline = d;
        totalSec = Math.max(totalSec, Math.round((d - Date.now()) / 1000));
      }
    }
    const changed = groupSig(group) !== groupSig(cur.order);
    const next = { ...cur, order: group, deadline, totalSec };
    if (flag && (changed || note)) {
      next.updatedAt = Date.now();
      const fewer = (group.stops || []).length < (cur.order.stops || []).length;
      next.updatedNote = note || (fewer
        ? `اعتذر أحد المطاعم — العرض الآن ${(group.stops || []).length} مطاعم، أرباحك ${money(groupEarning(group))}`
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
    fetchGroupView(id).then((v) => {
      if (!v) return;
      if (v.status === 'cancelled') { handleGroupCancelled(v.id, v.cancelled_by, v.cancel_reason); return; }
      if (v.is_offer !== true && !isGroupAccepted(v)) { if (offerRef.current?.key === key && !acceptingRef.current) closeOffer('gone'); return; }
      updateGroupOffer(key, v, { flag: true });
    }).catch((e) => {
      if ((e?.status === 403 || e?.status === 404) && offerRef.current?.key === key && !acceptingRef.current) closeOffer('gone');
    });
  }, [fetchGroupView, updateGroupOffer, closeOffer, handleGroupCancelled]);

  const openGroupOffer = useCallback(async (payload, { receivedAt = Date.now(), view = null } = {}) => {
    const id = gid(payload?.group_id ?? view?.id ?? view?.group_id);
    if (!id) return;
    const key = groupKey(id);
    // نفس المجموعة ظاهرة → تحديث في مكانه (عرض مُعاد/محدّث)
    if (offerRef.current?.isGroup && offerRef.current.key === key) {
      const hasDetails = Array.isArray(payload?.stops) || !!view;
      updateGroupOffer(key, hasDetails ? (view || payload) : null, { payload, receivedAt });
      return;
    }
    if (activeGroupRef.current && gid(activeGroupRef.current.id) === id) return;
    if (cancelledRef.current.has(key) || doneGroupsRef.current.has(key)) return;
    const seen = seenRef.current.get(key);
    if (seen && (seen.state === 'loading' || Date.now() - seen.at < SEEN_TTL_MS)) return;
    seenRef.current.set(key, { state: 'loading', at: Date.now() });

    let v = view;
    let fromPayload = false;
    if (!v) {
      if (Array.isArray(payload?.stops) && payload.stops.length) {
        v = payload; fromPayload = true; // حمولة السوكِت كافية للعرض فوراً
      } else {
        try { v = await fetchGroupView(id); } catch (e) {
          if (e?.status === 403 || e?.status === 404) seenRef.current.set(key, { state: 'stale', at: Date.now() });
          else seenRef.current.delete(key);
          return;
        }
      }
    }
    if (!v) { seenRef.current.delete(key); return; }

    if (!fromPayload) {
      if (['cancelled', 'delivered'].includes(v.status)) { seenRef.current.set(key, { state: 'stale', at: Date.now() }); return; }
      const me = userRef.current?.id;
      if (isGroupAccepted(v)) {
        if (!me || sid(v.driver_id) === sid(me)) { seenRef.current.set(key, { state: 'accepted', at: Date.now() }); setGroup(normalizeGroup(v)); }
        else seenRef.current.set(key, { state: 'taken', at: Date.now() });
        return;
      }
      if (v.is_offer !== true || v.status !== 'confirmed') { seenRef.current.set(key, { state: 'stale', at: Date.now() }); return; }
    }

    const deadline = computeDeadline(payload, fromPayload ? null : v, receivedAt);
    if (deadline - Date.now() < 2000) { seenRef.current.set(key, { state: 'expired', at: Date.now() }); return; }

    if (offerRef.current) closeOffer('replaced');
    const totalSec = Math.max(1, Math.round((deadline - receivedAt) / 1000));
    offerRef.current = { isGroup: true, key, order: normalizeGroup(v), deadline, totalSec, openedAt: Date.now() };
    seenRef.current.set(key, { state: 'open', at: Date.now() });
    setOffer(offerRef.current);
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    startOfferTimer();
    startAttention();
    if (fromPayload) enrichGroupOffer(id);
  }, [closeOffer, setGroup, startAttention, startOfferTimer, updateGroupOffer, fetchGroupView, enrichGroupOffer]);

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
        note: `اعتذر مطعم ${name} — العرض الآن ${(next.stops || []).length} مطاعم، أرباحك ${money(groupEarning(next))}`,
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
        // 🧺 السيرفر الجديد: active_group له الأولوية؛ ابن المجموعة في active_order يُتجاهل
        const ag = d.active_group || null;
        if (ao && (ao.group_id || ao.is_group)) ao = null;
        // العرض الظاهر لم يعد مُسنداً لنا (انتهت مهلته على السيرفر) → أغلقه
        const curOffer = offerRef.current;
        if (curOffer && !acceptingRef.current && Date.now() - (curOffer.openedAt || 0) > 5000) {
          const still = curOffer.isGroup
            ? !!(ag && ag.is_offer && gid(ag.id) === gid(curOffer.order.id))
            : !!(ao && sid(ao.id) === sid(curOffer.order.id));
          if (!still) closeOffer('gone');
        }

        if (ag) {
          if (isGroupAccepted(ag)) {
            const prev = activeGroupRef.current && gid(activeGroupRef.current.id) === gid(ag.id) ? activeGroupRef.current : null;
            setGroup(normalizeGroup(ag, prev));
          } else if (ag.is_offer && ag.status === 'confirmed' && !acceptingRef.current) {
            openGroupOffer({ group_id: ag.id, expires_at: ag.expires_at, offer_seconds: ag.offer_seconds }, { view: ag });
          }
        } else if (activeGroupRef.current) {
          // كانت عندنا مجموعة نشطة واختفت؟ تحقّق إن كانت أُلغيت
          const prevG = activeGroupRef.current;
          try {
            const pv = await fetchGroupView(prevG.id);
            if (pv?.status === 'cancelled') handleGroupCancelled(prevG.id, pv.cancelled_by, pv.cancel_reason);
            else if (pv?.status === 'delivered') markGroupDone(prevG.id);
          } catch {}
          setGroup(null);
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
    setAccepting(true);
    stopAttention();
    const o = cur.order;
    try {
      if (cur.isGroup) {
        const r = await api.post(`/orders/groups/${o.id}/accept`);
        const data = r?.data || {};
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
        setTimeout(() => {
          navigate('Delivery', { groupId: o.id });
          Alert.alert('✅ تم قبول الطلب المجمّع', `استلم من ${n} مطاعم حسب المسار المقترح، ثم سلّم الكل للزبون دفعة واحدة.`);
        }, 650);
        return;
      }
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
  }, [closeOffer, setActive, setGroup, stopAttention, refreshDriver]);

  const rejectOffer = useCallback(async () => {
    const cur = offerRef.current;
    if (!cur || acceptingRef.current || rejectingRef.current) return;
    rejectingRef.current = true;
    setRejecting(true);
    stopAttention();
    const url = cur.isGroup ? `/orders/groups/${cur.order.id}/reject` : `/orders/${cur.order.id}/reject`;
    try { await api.post(url); } catch {}
    closeOffer('rejected');
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
      Alert.alert('خطأ', e?.message || 'فشل في تغيير الحالة');
    } finally {
      onlineBusyRef.current = false;
      setOnlineBusy(false);
    }
  }, [applyOnline, closeOffer]);

  // تتبّع الخلفية فقط أثناء توصيل نشط (طلب عادي أو مجمّع)
  const activeId = activeOrder?.id || (activeGroup ? groupKey(activeGroup.id) : null);
  useEffect(() => {
    if (activeId) locRef.current.ensureBackgroundTracking();
    else locRef.current.stopBackground();
  }, [activeId]);

  // ── معالجة الإشعارات ──
  const handleNotificationData = useCallback((data, receivedAt) => {
    if (!data || data._offerChime) return;
    const groupId = data.group_id ? sid(data.group_id) : '';
    if (data.type === 'new_order_request' && groupId && (truthy(data.is_group) || !data.order_id)) {
      openGroupOffer(data, { receivedAt: receivedAt || Date.now() });
    } else if (data.type === 'new_order_request' && data.order_id) {
      openOffer(data, { receivedAt: receivedAt || Date.now() });
    } else if (groupId) {
      // تحديث/إلغاء محطة/إلغاء مجموعة: المصدر الموثوق هو السيرفر
      handleGroupChildChanged(groupId);
    } else if (data.type === 'order_cancelled' || (data.type === 'order_status' && data.status === 'cancelled')) {
      handleCancelled(data.order_id, data.by);
    } else if (data.order_id && activeRef.current && sid(activeRef.current.id) === sid(data.order_id)) {
      refreshActiveOrder();
    }
  }, [openOffer, openGroupOffer, handleCancelled, handleGroupChildChanged, refreshActiveOrder]);

  const handleResponse = useCallback((response) => {
    if (!response) return;
    const rid = response.notification?.request?.identifier || `${response.notification?.date}`;
    if (handledResponses.has(rid)) return;
    handledResponses.add(rid);
    const data = response.notification?.request?.content?.data || {};
    if (data._offerChime) return;
    const at = Number(response.notification?.date) || Date.now();
    handleNotificationData(data, at);
    if (data.type === 'new_order_request') return;
    if (data.group_id && activeGroupRef.current && gid(activeGroupRef.current.id) === gid(data.group_id)) {
      navigate('Delivery', { groupId: activeGroupRef.current.id });
    } else if (data.order_id && activeRef.current && sid(activeRef.current.id) === sid(data.order_id)) {
      navigate('Delivery', { orderId: activeRef.current.id });
    }
  }, [handleNotificationData]);

  // ── الإقلاع: كاش، سوكِت، مستمعين ──
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ONLINE_KEY).then(v => { if (alive && v === '1' && !onlineRef.current) setIsOnline(true); }).catch(() => {});
    refreshDriver();
    connectSocket();

    const groupHasChild = (orderId) => {
      const g = activeGroupRef.current;
      return !!(g && (g.stops || []).some(s => sid(s.order_id) === sid(orderId)));
    };

    const unsubs = [
      subscribe('new_order_request', (d) => {
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
    activeGroup, setActiveGroup: setGroup, refreshActiveGroup, markGroupDone,
    offer, remaining,
    notifyCancelled: handleCancelled,
    notifyGroupCancelled: handleGroupCancelled,
  };

  const singleOffer = offer && !offer.isGroup ? offer : null;
  const groupOffer = offer && offer.isGroup ? offer : null;

  return (
    <DriverContext.Provider value={value}>
      {children}
      <OfferModal
        offer={singleOffer}
        remaining={remaining}
        onAccept={acceptOffer}
        onReject={rejectOffer}
        accepting={accepting}
        rejecting={rejecting}
        coords={location.coords}
      />
      <GroupOfferModal
        offer={groupOffer}
        remaining={remaining}
        onAccept={acceptOffer}
        onReject={rejectOffer}
        accepting={accepting}
        rejecting={rejecting}
        coords={location.coords}
      />
      <ToastHost />
    </DriverContext.Provider>
  );
}

export const useDriver = () => useContext(DriverContext);
