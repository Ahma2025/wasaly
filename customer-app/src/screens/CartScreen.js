import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Keyboard, Image, Animated, AppState, Platform } from 'react-native';
import { FadeIn, PopIn, Press, useBump } from '../components/Anim';
import { Chip, IconButton, AnimatedNumber, Burst } from '../components/UI';
import { Skeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { HeroDecor } from '../components/GradientHeader';
import RtlHScroll from '../components/RtlHScroll';
import { haptic, stagger, isReducedMotion, SPRING, SPRING_POP, EASE_OUT } from '../utils/motion';
import PressableScale from '../components/PressableScale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCart, linePrice } from '../context/CartContext';
import api, { isNetworkError } from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { startCardPayment, isCardUnavailable } from '../utils/payments';
import { useTheme } from '../context/ThemeContext';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset, useKeyboardVisible } from '../components/FloatingTabBar';
import { FREE_DELIVERY_THRESHOLD, POINT_VALUE, DEFAULT_DELIVERY_FEE } from '../config';
import { plural } from '../utils/plural';

const money = (v) => `${(Number(v) || 0).toFixed(2)}₪`;
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const addrLabel = (a) => a?.label || (a?.title && a.title !== a.address ? a.title : '') || 'عنوان';
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
// مفتاح منع التكرار لكل محاولة طلب (Idempotency-Key) — نفس المفتاح لإعادة نفس الطلب
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
});
// خطأ 409 سببه الكوبون (انتهى/استُخدم) → نشيله بدل ما نضل نرفض
const isCouponConflict = (e) => e?.field === 'coupon' || e?.code === 'coupon' || /كوبون|الكوبون|coupon/i.test(String(e?.message || ''));

// شكل الأصناف المرسَل للسيرفر (مشترك بين الطلب العادي والمجمّع)
const toOrderItems = (list) => list.map(i => ({
  id: i.id,
  quantity: i.quantity,
  notes: i.notes || '',
  // ids حتى يسعّر السيرفر الإضافات من قاعدة البيانات (السعر للتوافق فقط)
  options: (i.addons || i.selectedOptions || []).map(a => ({
    ...(a.id != null ? { id: a.id } : {}),
    ...(a.option_id != null ? { option_id: a.option_id } : {}),
    name: a.name,
    price: num(a.price),
    ...(a.group ? { group: a.group } : {}),
  })),
}));

// أخطاء الطلب المجمّع اللي ما إلها علاقة بمطعم معيّن ونعرضها بمكانها الخاص (الدفع/الاستلام)
const HIDDEN_GENERAL_CODES = ['card_not_allowed', 'pickup_not_allowed'];

export default function CartScreen() {
  const navigation = useNavigation();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const headerTop = useHeaderTop(10);
  const tabInset = useTabBarInset();
  const {
    items, total, count, removeItem, incrementItem, clearCart, restaurantId, restaurantName, updateItemNote, groupOrder,
    carts = [], removeRestaurant, multiConfig = {}, multiEnabled, maxRestaurants = 1, refreshMultiConfig, updateRestaurantInfo, markGroupOrdered,
  } = useCart();
  const multi = carts.length > 1; // طلب مجمّع: أكثر من مطعم بسائق واحد
  const kbVisible = useKeyboardVisible();
  // حد التوصيل المجاني من إعداد السيرفر (مش رقم ثابت بالكود)
  const freeThreshold = num(multiConfig.free_delivery_threshold, FREE_DELIVERY_THRESHOLD) || FREE_DELIVERY_THRESHOLD;
  const [cardOff, setCardOff] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const idemRef = useRef({ sig: null, key: null });
  const idemKeyFor = (body) => {
    const sig = JSON.stringify(body);
    if (idemRef.current.sig !== sig) idemRef.current = { sig, key: uuid() };
    return idemRef.current.key;
  };
  const incLine = useCallback((k) => { haptic.select(); incrementItem(k); }, [incrementItem]);
  const decLine = useCallback((k) => { haptic.select(); removeItem(k); }, [removeItem]);

  const [deliveryTypeSel, setDeliveryTypeRaw] = useState('delivery'); // 'delivery' | 'pickup'
  const deliveryType = multi ? 'delivery' : deliveryTypeSel;          // المجمّع للتوصيل فقط
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [paymentMethodSel, setPaymentMethod] = useState('cash');
  const paymentMethod = multi || cardOff ? 'cash' : paymentMethodSel; // المجمّع كاش فقط (+ المحفظة)؛ البطاقة معطّلة بالسيرفر → كاش
  const [restNotes, setRestNotes] = useState({});                    // ملاحظة لكل مطعم (المجمّع)
  const [createErrors, setCreateErrors] = useState([]);              // أخطاء من POST /orders/multi
  const [notes, setNotes] = useState('');
  const [tip, setTip] = useState(0);
  const [leaveAtDoor, setLeaveAtDoor] = useState(false);
  const [placing, setPlacing] = useState(false);
  const submittingRef = useRef(false);
  const [restaurantInfo, setRestaurantInfo] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState(null);      // الكود المُطبّق (يُعاد التحقق منه مع كل تغيير)
  const [localCoupon, setLocalCoupon] = useState({ discount: 0, error: '' });
  const [couponChecking, setCouponChecking] = useState(false);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  const [localFee, setLocalFee] = useState(null);
  const [feeLoading, setFeeLoading] = useState(false);
  // تسعير السيرفر
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const quoteSupported = useRef(true);
  const multiQuoteSupported = useRef(true);
  const quoteSeq = useRef(0);

  const selectedAddress = addresses.find(a => String(a.id) === String(selectedAddressId)) || null;

  const setDeliveryType = (t) => {
    setDeliveryTypeRaw(t);
    if (t === 'pickup') { setTip(0); setLeaveAtDoor(false); } // البقشيش وملاحظة الباب للتوصيل فقط
  };

  // ── تحديث المحفظة/النقاط/العناوين عند كل دخول للتبويب (التبويب يبقى مركّب) ──
  const refreshProfile = useCallback(async () => {
    try {
      const d = await api.get('/users/profile');
      setLoyaltyPoints(parseInt(d.data?.loyalty_points || 0, 10) || 0);
      setWalletBalance(num(d.data?.wallet_balance));
      writeCache('profile', d.data);
    } catch {}
  }, []);

  const fetchAddresses = useCallback(async () => {
    const cached = await readCache('addresses');
    // عنوان أضافه الزبون للتو من السلة (AddAddress يحفظ id) → يتحدد تلقائياً
    const fresh = await readCache('new_address');
    const freshId = fresh && Date.now() - (fresh.at || 0) < 10 * 60 * 1000 ? fresh.id : null;
    const apply = (list) => {
      setAddresses(list);
      setSelectedAddressId(prev => {
        if (freshId != null && list.some(a => sameId(a.id, freshId))) return list.find(a => sameId(a.id, freshId)).id;
        if (prev && list.some(a => String(a.id) === String(prev))) return prev;
        const def = list.find(a => a.is_default) || list[0];
        return def ? def.id : null;
      });
    };
    if (cached) apply(cached);
    try {
      const data = await api.get('/users/addresses');
      const list = data.data || [];
      apply(list);
      writeCache('addresses', list);
      if (freshId != null && list.some(a => sameId(a.id, freshId))) writeCache('new_address', null);
    } catch {}
  }, []);

  const checkFirstOrder = useCallback(async () => {
    try {
      const d = await api.get('/orders/my?limit=1');
      setIsFirstOrder((d.data || []).length === 0);
    } catch {}
  }, []);

  // ── معلومات كل مطاعم السلة (مفتوح/حد أدنى/لوجو) — تُجلب عند تغيّر المطاعم + كل رجوع للسلة + رجوع للتطبيق ──
  const [restInfos, setRestInfos] = useState({});
  const [restNonce, setRestNonce] = useState(0); // يدخل بمفتاح التسعيرة → إعادة تسعير بعد التحديث
  const [restRefreshing, setRestRefreshing] = useState(false);
  const cartsRef = useRef(carts);
  cartsRef.current = carts;
  const ridsKey = carts.map(c => c.restaurant?.id).join(',');
  const loadRestInfos = useCallback(async () => {
    await Promise.all(cartsRef.current.map(async (c) => {
      const rid = c.restaurant?.id;
      if (rid == null) return;
      const cached = await readCache('rest_' + rid);
      // الكاش للّوجو والحد الأدنى فقط — حالة الفتح/الإغلاق القديمة ما بتقفل زر الطلب
      if (cached?.restaurant) {
        const { is_open, ...rest } = cached.restaurant;
        setRestInfos(p => (p[rid] ? p : { ...p, [rid]: rest }));
      }
      try {
        const data = await api.get(`/restaurants/${rid}`);
        if (data?.data) {
          setRestInfos(p => ({ ...p, [rid]: data.data }));
          if (updateRestaurantInfo) updateRestaurantInfo(rid, data.data);
        }
      } catch {}
    }));
  }, [updateRestaurantInfo]);
  const refreshRestaurants = useCallback(async () => {
    setRestRefreshing(true);
    await loadRestInfos();
    setRestRefreshing(false);
    setRestNonce(n => n + 1);
  }, [loadRestInfos]);
  const ridsFirst = useRef(true);
  useEffect(() => {
    if (ridsFirst.current) { ridsFirst.current = false; return; } // أول مرة يتولاها useFocusEffect
    loadRestInfos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ridsKey]);
  useEffect(() => { setRestaurantInfo(restaurantId != null ? (restInfos[restaurantId] || null) : null); }, [restaurantId, restInfos]);

  useFocusEffect(useCallback(() => {
    refreshProfile(); fetchAddresses(); checkFirstOrder();
    if (refreshMultiConfig) refreshMultiConfig();
    isCardUnavailable().then(setCardOff).catch(() => {});
    if (cartsRef.current.length) refreshRestaurants();
    // رجوع للتطبيق والسلة مفتوحة → نحدّث حالة المطاعم (ممكن رجعت فتحت)
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && cartsRef.current.length) refreshRestaurants(); });
    return () => sub.remove();
  }, [refreshProfile, fetchAddresses, checkFirstOrder, refreshMultiConfig, refreshRestaurants]));

  // لو تفرّغت السلة نصفّر الاختيارات المؤقتة
  useEffect(() => {
    if (items.length === 0) { setQuote(null); setCouponCode(null); setLocalCoupon({ discount: 0, error: '' }); setUsePoints(false); setUseWallet(false); setRestNotes({}); setCreateErrors([]); }
  }, [items.length]);

  // التحويل بين عادي ↔ مجمّع: تسعيرة النوع الآخر ما بتنفع
  useEffect(() => { setQuote(null); setQuoteError(''); setCreateErrors([]); }, [multi]);

  // ── جسم الطلب (نفس الشكل لـ /orders/quote و /orders) ──
  const buildBody = useCallback(() => {
    const body = {
      restaurant_id: restaurantId,
      items: toOrderItems(items),
      payment_method: paymentMethod,
      coupon_code: couponCode || undefined,
      redeem_points: usePoints ? loyaltyPoints : 0,
      use_wallet: useWallet,
      notes: [notes.trim(), deliveryType === 'delivery' && leaveAtDoor ? '🚪 اترك الطلب على الباب' : ''].filter(Boolean).join(' — '),
      tip: deliveryType === 'delivery' ? (num(tip)) : 0,
      order_type: deliveryType,
    };
    if (deliveryType === 'delivery' && selectedAddress) {
      body.address_id = selectedAddress.id;
      body.delivery_address = selectedAddress.address;
      body.delivery_lat = selectedAddress.lat;
      body.delivery_lng = selectedAddress.lng;
    }
    return body;
  }, [restaurantId, items, paymentMethod, couponCode, usePoints, loyaltyPoints, useWallet, notes, deliveryType, leaveAtDoor, tip, selectedAddress]);

  // ── جسم الطلب المجمّع (نفس الشكل لـ /orders/multi/quote و /orders/multi) ──
  const buildMultiBody = useCallback(() => {
    const body = {
      carts: carts.map(c => {
        const n = (restNotes[c.restaurant.id] || '').trim();
        return { restaurant_id: c.restaurant.id, items: toOrderItems(c.items), ...(n ? { notes: n } : {}) };
      }),
      order_type: 'delivery',
      payment_method: 'cash',
      coupon_code: couponCode || undefined,
      redeem_points: usePoints ? loyaltyPoints : 0,
      use_wallet: useWallet,
      notes: [notes.trim(), leaveAtDoor ? '🚪 اترك الطلب على الباب' : ''].filter(Boolean).join(' — '),
      tip: num(tip),
    };
    if (selectedAddress) {
      body.address_id = selectedAddress.id;
      body.delivery_address = selectedAddress.address;
      body.delivery_lat = selectedAddress.lat;
      body.delivery_lng = selectedAddress.lng;
    }
    return body;
  }, [carts, restNotes, couponCode, usePoints, loyaltyPoints, useWallet, notes, leaveAtDoor, tip, selectedAddress]);

  const quoteKey = JSON.stringify([
    multi, items.map(i => [i._key, i.quantity]), restaurantId, deliveryType, selectedAddress?.id, selectedAddress?.lat, selectedAddress?.lng,
    couponCode, deliveryType === 'delivery' ? tip : 0, usePoints, loyaltyPoints, useWallet, walletBalance, restNonce, quoteNonce,
  ]);

  // ── POST /orders/quote أو /orders/multi/quote (مؤجّل) عند أي تغيير مؤثر على السعر ──
  useEffect(() => {
    setCreateErrors([]);
    const supported = multi ? multiQuoteSupported.current : quoteSupported.current;
    if (!items.length || !restaurantId || !supported) { ++quoteSeq.current; setQuoteLoading(false); return; }
    if (deliveryType === 'delivery' && !selectedAddress) { ++quoteSeq.current; setQuoteLoading(false); setQuote(null); return; }
    const seq = ++quoteSeq.current;
    const isMultiReq = multi;
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.post(isMultiReq ? '/orders/multi/quote' : '/orders/quote', isMultiReq ? buildMultiBody() : buildBody());
        if (seq !== quoteSeq.current) return;
        if (r?.data && typeof r.data === 'object' && r.data.total != null) { setQuote({ ...r.data, _multi: isMultiReq }); setQuoteError(''); }
        else { setQuote(null); }
      } catch (e) {
        if (seq !== quoteSeq.current) return;
        if (e?.status === 404) {
          if (isMultiReq) { multiQuoteSupported.current = false; setQuoteError('الطلب من أكثر من مطعم غير متاح حالياً — خلّي مطعم واحد بالسلة'); }
          else quoteSupported.current = false; // سيرفر قديم → حساب محلي
        } else setQuoteError(e?.status && e.status < 500 ? (e.message || '') : '');
        setQuote(null);
      } finally {
        if (seq === quoteSeq.current) setQuoteLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [quoteKey]);

  // التسعيرة صالحة فقط لنفس نوع السلة (عادي/مجمّع)
  const activeQuote = quote && !!quote._multi === multi ? quote : null;
  const usingLocal = !activeQuote;

  // ── احتياطي: رسوم التوصيل من إحداثيات العنوان المختار (مش GPS الهاتف) ──
  useEffect(() => {
    if (!usingLocal || deliveryType !== 'delivery') return;
    const rl = restaurantInfo?.lat, rg = restaurantInfo?.lng, al = selectedAddress?.lat, ag = selectedAddress?.lng;
    if (!rl || !rg || !al || !ag) { setLocalFee(DEFAULT_DELIVERY_FEE); return; } // نفس افتراض السيرفر
    let alive = true;
    setFeeLoading(true);
    api.get(`/delivery-zones/calculate?lat1=${rl}&lng1=${rg}&lat2=${al}&lng2=${ag}`)
      .then(d => { if (alive) setLocalFee(num(d.data?.fee, DEFAULT_DELIVERY_FEE) || DEFAULT_DELIVERY_FEE); })
      .catch(() => { if (alive) setLocalFee(DEFAULT_DELIVERY_FEE); })
      .finally(() => { if (alive) setFeeLoading(false); });
    return () => { alive = false; };
  }, [usingLocal, deliveryType, restaurantInfo?.lat, restaurantInfo?.lng, selectedAddress?.lat, selectedAddress?.lng]);

  // ── احتياطي: إعادة التحقق من الكوبون مع كل تغيير بالمجموع ──
  useEffect(() => {
    if (!usingLocal || !couponCode) { setLocalCoupon({ discount: 0, error: '' }); return; }
    let alive = true;
    setCouponChecking(true);
    const t = setTimeout(() => {
      api.post('/coupons/validate', { code: couponCode, subtotal: total })
        .then(res => { if (alive) setLocalCoupon({ discount: num(res.data?.discount), error: '' }); })
        .catch(e => { if (alive) setLocalCoupon({ discount: 0, error: e?.message || 'الكوبون غير صالح' }); })
        .finally(() => { if (alive) setCouponChecking(false); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [usingLocal, couponCode, total]);

  // ── الأرقام المعروضة: من السيرفر إن توفرت، وإلا حساب محلي مطابق لمنطق السيرفر ──
  const summary = useMemo(() => {
    if (activeQuote && multi) {
      const q = activeQuote;
      return {
        subtotal: num(q.subtotal, total),
        deliveryFee: num(q.delivery_fee),
        baseFee: num(q.base_fee),
        extraStopsFee: num(q.extra_stops_fee),
        extraStopUnit: num(q.extra_stop_fee, num(multiConfig.extra_stop_fee, 3)),
        stops: num(q.stops_count, carts.length),
        freeDelivery: !!q.free_delivery,
        firstOrderDiscount: num(q.first_order_discount),
        couponDiscount: num(q.coupon_discount),
        couponError: q.coupon_error || '',
        pointsValue: num(q.points_value),
        tip: num(q.tip),
        walletUsed: num(q.wallet_used),
        total: num(q.total),
        minOrder: 0,
        meetsMin: true,
        distanceKm: q.distance_km,
        valid: q.valid !== false,
        errors: Array.isArray(q.errors) ? q.errors : [],
        restaurants: Array.isArray(q.restaurants) ? q.restaurants : [],
        source: 'server',
      };
    }
    if (activeQuote) {
      const q = activeQuote;
      const minOrder = num(q.min_order, num(restaurantInfo?.min_order));
      return {
        extraStopsFee: 0, valid: true, errors: [], restaurants: [],
        subtotal: num(q.subtotal, total),
        deliveryFee: deliveryType === 'delivery' ? num(q.delivery_fee) : 0,
        freeDelivery: !!q.free_delivery,
        firstOrderDiscount: num(q.first_order_discount),
        couponDiscount: num(q.coupon_discount),
        couponError: q.coupon_error || '',
        pointsValue: num(q.points_value),
        tip: num(q.tip),
        walletUsed: num(q.wallet_used),
        total: num(q.total),
        minOrder,
        meetsMin: q.meets_min_order != null ? !!q.meets_min_order : num(q.subtotal, total) >= minOrder,
        distanceKm: q.distance_km,
        source: 'server',
      };
    }
    const subtotal = total;
    const isDel = deliveryType === 'delivery';
    const freeDelivery = isDel && subtotal >= freeThreshold;
    const deliveryFee = isDel ? (freeDelivery ? 0 : num(localFee, DEFAULT_DELIVERY_FEE)) : 0;
    const firstOrderDiscount = isFirstOrder ? Math.min(10, subtotal * 0.15) : 0;
    const couponDiscount = couponCode ? localCoupon.discount : 0;
    const discount = multi ? Math.min(subtotal, couponDiscount + firstOrderDiscount) : couponDiscount + firstOrderDiscount;
    // المجمّع: رسوم توقف إضافي لكل مطعم بعد الأول (التوصيل المجاني ما بيلغيها)
    const extraStopUnit = num(multiConfig.extra_stop_fee, 3);
    const extraStopsFee = multi ? extraStopUnit * (carts.length - 1) : 0;
    const pointsValue = usePoints ? Math.min(loyaltyPoints * POINT_VALUE, Math.max(0, subtotal + deliveryFee + extraStopsFee - discount)) : 0;
    const tipAmt = isDel ? num(tip) : 0;
    const due = Math.max(0, subtotal + deliveryFee + extraStopsFee - discount - pointsValue) + tipAmt;
    const walletUsed = useWallet ? Math.min(walletBalance, due) : 0;
    const minOrder = multi ? 0 : num(restaurantInfo?.min_order);
    return {
      subtotal, deliveryFee, baseFee: deliveryFee, extraStopsFee, extraStopUnit, stops: carts.length, freeDelivery, firstOrderDiscount, couponDiscount, couponError: couponCode ? localCoupon.error : '',
      pointsValue, tip: tipAmt, walletUsed, total: Math.max(0, due - walletUsed), minOrder, meetsMin: subtotal >= minOrder, source: 'local',
      valid: true, errors: [], restaurants: [],
    };
  }, [activeQuote, multi, carts.length, multiConfig.extra_stop_fee, total, deliveryType, localFee, isFirstOrder, couponCode, localCoupon, usePoints, loyaltyPoints, tip, useWallet, walletBalance, restaurantInfo?.min_order, freeThreshold]);

  // ── المجمّع: حالة كل مطعم (حد أدنى/مغلق/أخطاء التسعيرة) ──
  const allErrors = useMemo(() => [...(summary.errors || []), ...createErrors], [summary.errors, createErrors]);
  const restRows = useMemo(() => carts.map(c => {
    const rid = c.restaurant.id;
    const info = restInfos[rid] || {};
    const q = (summary.restaurants || []).find(r => sameId(r.restaurant_id, rid));
    const localSub = c.items.reduce((s, i) => s + linePrice(i) * i.quantity, 0);
    const subtotal = q ? num(q.subtotal, localSub) : localSub;
    const minOrder = num(q?.min_order, num(info.min_order, num(c.restaurant.min_order)));
    const meetsMin = q?.meets_min_order != null && !quoteLoading ? !!q.meets_min_order : subtotal >= minOrder;
    const errs = allErrors.filter(e => sameId(e?.restaurant_id, rid));
    // تكرار الرسائل (من التسعيرة ومن الإنشاء) يُحذف
    const errors = errs.filter((e, i) => errs.findIndex(x => x?.message === e?.message) === i);
    return {
      rid, cart: c, info,
      name: info.name_ar || c.restaurant.name_ar || 'مطعم',
      logo: info.logo || c.restaurant.logo,
      count: c.items.reduce((s, i) => s + i.quantity, 0),
      subtotal, minOrder, meetsMin,
      closed: info.is_open === false,
      sequence: q?.sequence,
      distanceKm: q?.distance_km,
      errors,
      tooFar: errors.some(e => e?.code === 'too_far'),
    };
  }), [carts, restInfos, summary.restaurants, allErrors, quoteLoading]);
  const generalErrors = useMemo(() => {
    const list = allErrors.filter(e => e && e.restaurant_id == null && !HIDDEN_GENERAL_CODES.includes(e.code));
    return list.filter((e, i) => list.findIndex(x => x.message === e.message) === i);
  }, [allErrors]);
  const multiBlocked = multi && (!multiEnabled || carts.length > maxRestaurants || !multiQuoteSupported.current);
  const multiProblem = multi && (
    restRows.some(r => !r.meetsMin && r.minOrder > 0) || restRows.some(r => r.closed) || summary.valid === false || createErrors.length > 0
  );

  const calculating = quoteLoading || (usingLocal && (feeLoading || couponChecking));
  const needsAddress = deliveryType === 'delivery' && !selectedAddress;
  const belowMin = !multi && !summary.meetsMin && summary.minOrder > 0;
  const restaurantClosed = !multi && restaurantInfo && restaurantInfo.is_open === false;
  // السعر عم ينحسب من جديد (عنوان/كوبون…) → ما منأكّد على سعر قديم
  const pricing = quoteLoading && (multi ? multiQuoteSupported.current : quoteSupported.current);
  // المجمّع: لازم تسعيرة من السيرفر (ما منأكّد على تقدير محلي)
  const multiNeedsQuote = multi && quoteSeq.current > 0 && !activeQuote && !quoteLoading && !multiBlocked && !needsAddress;
  const canOrder = !placing && !belowMin && !needsAddress && !restaurantClosed && items.length > 0
    && !pricing && !quoteError
    && !(multi && (multiBlocked || multiProblem || multiNeedsQuote));
  const retryQuote = () => { haptic.light(); setQuoteError(''); setQuoteNonce(n => n + 1); };

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    Keyboard.dismiss();
    setCouponCode(code);
  };
  const removeCoupon = () => { setCouponCode(null); setCouponInput(''); setLocalCoupon({ discount: 0, error: '' }); };

  const confirmClear = () => {
    Alert.alert('إفراغ السلة', 'بدك تحذف كل الأصناف من السلة؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'إفراغ', style: 'destructive', onPress: clearCart },
    ]);
  };

  /*
    انقطع الرد بعد ما السيرفر سجّل الطلب؟ قبل ما نرجّع الزر نتأكد من آخر طلب
    (يمنع طلب مكرر بخصم محفظة/نقاط مرتين). يرجّع الطلب/المجموعة لو انوجد.
  */
  const findJustPlaced = async (kind, startedAt) => {
    try {
      if (kind === 'multi') {
        const r = await api.get('/orders/groups/my?limit=1');
        const g = (r?.data || [])[0];
        if (g && new Date(g.created_at).getTime() >= startedAt - 60000) return { groupId: g.id };
        return null;
      }
      const r = await api.get('/orders/my?limit=1');
      const o = (r?.data || [])[0];
      if (o && !o.group_id && sameId(o.restaurant_id, restaurantId) && new Date(o.created_at).getTime() >= startedAt - 60000) return o;
    } catch {}
    return null;
  };

  // 409: السعر/الرصيد/الكوبون تغيّر بين التسعير والتأكيد → نعيد التسعير
  const handleConflict = (e) => {
    const coupon = isCouponConflict(e);
    if (coupon) { setCouponCode(null); setCouponInput(''); setLocalCoupon({ discount: 0, error: '' }); }
    Alert.alert('تغيّرت تفاصيل الطلب', `${e?.message || 'تغيّرت بيانات الطلب'}${coupon ? ' — شلنا الكوبون' : ''} — حدّثنا الأسعار، راجعها وأكّد من جديد.`);
    refreshProfile();
    setQuote(null);
    setQuoteNonce(n => n + 1);
  };

  const confirmRemoveRestaurant = (row) => {
    haptic.warning();
    Alert.alert('حذف المطعم من السلة', `بدك تحذف كل أصناف «${row.name}» (${plural(row.count, 'item')}) من السلة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'احذف', style: 'destructive', onPress: () => { removeRestaurant && removeRestaurant(row.rid); setRestNotes(p => { const n = { ...p }; delete n[row.rid]; return n; }); } },
    ]);
  };

  // ── إنشاء الطلب المجمّع: POST /orders/multi ──
  const placeMultiOrder = async () => {
    if (multiBlocked) return Alert.alert('الطلب المجمّع', !multiEnabled || !multiQuoteSupported.current
      ? 'الطلب من أكثر من مطعم غير متاح حالياً — خلّي مطعم واحد بالسلة'
      : `بتقدر تطلب من ${plural(maxRestaurants, 'restaurant')} كحد أقصى — احذف مطعم من السلة`);
    if (!activeQuote) { retryQuote(); return Alert.alert('حساب السعر', 'لسا عم نحسب السعر النهائي للطلب المجمّع — جرّب بعد لحظة.'); }
    const bad = restRows.find(r => r.closed || (!r.meetsMin && r.minOrder > 0) || r.errors.length);
    if (bad) {
      const msg = bad.errors[0]?.message || (bad.closed ? `«${bad.name}» مغلق حالياً، احذفه من السلة أو اطلب لاحقاً` : `الحد الأدنى للطلب من «${bad.name}» هو ${money(bad.minOrder)}`);
      return Alert.alert('راجع سلتك', msg);
    }
    if (generalErrors.length) return Alert.alert('راجع سلتك', generalErrors[0].message || 'تعذّر إتمام الطلب');
    submittingRef.current = true;
    setPlacing(true);
    try {
      // العقد: إعادة فحص الميزة قبل الدفع مباشرة
      if (refreshMultiConfig) {
        const fresh = await refreshMultiConfig();
        if (fresh && (!fresh.enabled || carts.length > fresh.max_restaurants)) {
          Alert.alert('الطلب المجمّع', !fresh.enabled
            ? 'الطلب من أكثر من مطعم غير متاح حالياً — خلّي مطعم واحد بالسلة'
            : `بتقدر تطلب من ${plural(fresh.max_restaurants, 'restaurant')} كحد أقصى — احذف مطعم من السلة`);
          return;
        }
      }
      const body = buildMultiBody();
      const key = idemKeyFor(body);
      const startedAt = Date.now();
      let groupId = null; let couponNote = '';
      try {
        const r = await api.post('/orders/multi', { ...body, client_ref: key }, { headers: { 'Idempotency-Key': key } });
        const g = r?.data || {};
        groupId = g.id || g.group_id;
        couponNote = r?.coupon_error || g.coupon_error || '';
      } catch (e) {
        // انقطع الرد؟ ممكن الطلب انسجّل — نتأكد قبل ما نخلّي الزبون يعيد
        const found = isNetworkError(e) ? await findJustPlaced('multi', startedAt) : null;
        if (!found) throw e;
        groupId = found.groupId;
      }
      idemRef.current = { sig: null, key: null };
      clearCart();
      setNotes(''); setTip(0); setLeaveAtDoor(false); setCouponCode(null); setCouponInput(''); setUsePoints(false); setUseWallet(false); setRestNotes({});
      refreshProfile();
      if (couponNote) Alert.alert('ملاحظة عن الكوبون', couponNote);
      if (groupId) navigation.navigate('GroupTracking', { groupId, fromCheckout: true });
      else navigation.navigate('Main', { screen: 'طلباتي' });
    } catch (e) {
      if (e?.status === 409) {
        handleConflict(e);
      } else if (Array.isArray(e?.errors) && e.errors.length) {
        setCreateErrors(e.errors);
        haptic.error && haptic.error();
        Alert.alert('راجع سلتك', e.message || e.errors[0]?.message || 'تعذّر إتمام الطلب');
      } else {
        Alert.alert('تعذّر إتمام الطلب', e?.message || 'فشل في إتمام الطلب، حاول مرة أخرى');
      }
    } finally {
      setPlacing(false);
      submittingRef.current = false;
    }
  };

  const placeOrder = async () => {
    if (submittingRef.current) return;
    if (needsAddress) return Alert.alert('عنوان التوصيل', 'الرجاء اختيار أو إضافة عنوان التوصيل');
    if (multi) return placeMultiOrder();
    if (belowMin) return Alert.alert('الحد الأدنى للطلب', `الحد الأدنى لهذا المطعم ${money(summary.minOrder)}`);
    if (restaurantClosed) return Alert.alert('المطعم مغلق', 'المطعم مغلق حالياً، جرّب لاحقاً');
    if (items.length === 0) return;
    if (pricing) return Alert.alert('حساب السعر', 'لحظة — عم نحسب السعر النهائي.');
    submittingRef.current = true;
    setPlacing(true);
    const group = groupOrder;
    const method = paymentMethod;
    try {
      const body = buildBody();
      const key = idemKeyFor(body);
      const startedAt = Date.now();
      let created = null;
      try {
        const data = await api.post('/orders', { ...body, client_ref: key }, { headers: { 'Idempotency-Key': key } });
        created = data?.data || data || {};
      } catch (e) {
        // انقطع الرد بعد ما السيرفر سجّل الطلب؟ نتأكد من آخر طلب قبل ما نسمح بإعادة (خصم مرتين)
        const found = isNetworkError(e) ? await findJustPlaced('single', startedAt) : null;
        if (!found) throw e;
        created = found;
      }
      idemRef.current = { sig: null, key: null };
      const orderId = created.id;
      clearCart();
      setNotes(''); setTip(0); setLeaveAtDoor(false); setCouponCode(null); setCouponInput(''); setUsePoints(false); setUseWallet(false);
      // السلة المشتركة تُقفل فقط بعد نجاح إنشاء الطلب + تنبيه بأي أصناف انضافت بعد النقل للسلة
      if (group?.id) {
        if (markGroupOrdered) markGroupOrdered(group.id);
        const warnExtra = (extra) => {
          if (!extra.length) return;
          Alert.alert('أصناف ما دخلت بالطلب', `${plural(extra.length, 'item')} من السلة المشتركة ما دخلت بطلبك:\n${extra.map(it => `• ${it.name}${it.user_name ? ` (${it.user_name})` : ''}`).join('\n')}\n\nخبّر أصحابك أو اطلبها بطلب ثاني.`);
        };
        api.post(`/group-orders/${group.id}/close`, { status: 'ordered', order_id: orderId, item_ids: group.itemIds })
          .then(r => {
            // السيرفر الأحدث بيحسبها بنفسه (وبيبلغ أصحابها)
            if (Array.isArray(r?.excluded)) { warnExtra(r.excluded); return; }
            if (!group.code || !Array.isArray(group.itemIds)) return;
            // سيرفر قديم: نقارن بأنفسنا الأصناف الحالية بالمنقولة للسلة
            api.get(`/group-orders/${group.code}`).then(gr => {
              const g = gr?.data || gr || {};
              const known = new Set(group.itemIds.map(String));
              warnExtra((g.items || []).filter(it => !known.has(String(it.id))));
            }).catch(() => {});
          })
          .catch(() => {});
      }
      refreshProfile();
      // نقرر الدفع حسب الطلب اللي رجع من السيرفر (مش حسب الاختيار) — بطاقة غير مفعّلة/المبلغ صفر → تتبع مباشرة
      const pm = created.payment_method || method;
      const due = created.total != null ? num(created.total) : summary.total;
      if (pm === 'card' && created.payment_status !== 'paid' && due > 0) {
        await startCardPayment(navigation, orderId);
      } else {
        if (method === 'card' && pm !== 'card') Alert.alert('الدفع', 'الدفع بالبطاقة غير متاح حالياً — طلبك كاش عند الاستلام.');
        // navigate (مش replace) حتى يبقى Main وتبويباته تحت شاشة التتبع
        navigation.navigate('OrderTracking', { orderId, fromCheckout: true });
      }
    } catch (e) {
      if (e?.status === 409) handleConflict(e);
      else Alert.alert('تعذّر إتمام الطلب', e?.message || 'فشل في إتمام الطلب، حاول مرة أخرى');
    } finally {
      setPlacing(false);
      submittingRef.current = false;
    }
  };

  const goHome = () => navigation.navigate('Main', { screen: 'الرئيسية' });

  // لحظة نجاح الكوبون (احتفال خفيف مرة واحدة لكل كود)
  const couponOk = !!couponCode && !calculating && !summary.couponError && summary.couponDiscount > 0;
  const [burstKey, setBurstKey] = useState(0);
  const celebrated = useRef(null);
  useEffect(() => {
    if (couponOk && celebrated.current !== couponCode) { celebrated.current = couponCode; haptic.success(); setBurstKey(k => k + 1); }
    if (!couponCode) celebrated.current = null;
  }, [couponOk, couponCode]);

  // هيدر السلة (يبقى حتى والسلة فاضية — أيقونات شريط الحالة البيضا تضل مقروءة)
  const header = (
    <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: headerTop }]}>
      <HeroDecor />
      <View style={styles.headerRow}>
        <IconButton icon="arrow-forward" onPress={goHome} label="رجوع للرئيسية" onGradient />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>سلّتي</Text>
          {items.length > 0 && (multi ? (
            <View style={styles.restPill}>
              <Ionicons name="git-network" size={12} color="#FFF" />
              <Text style={styles.headerSub} numberOfLines={1}>طلب مجمّع · {plural(carts.length, 'restaurant')} · {plural(count, 'item')}</Text>
            </View>
          ) : !!restaurantName && (
            <View style={styles.restPill}>
              <Ionicons name="storefront" size={12} color="#FFF" />
              <Text style={styles.headerSub} numberOfLines={1}>{restaurantName} · {plural(count, 'item')}</Text>
            </View>
          ))}
        </View>
        {items.length > 0
          ? <IconButton icon="trash-outline" onPress={confirmClear} label="إفراغ السلة" onGradient />
          : <View style={{ width: 42 }} />}
      </View>
    </LinearGradient>
  );

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={{ flex: 1, justifyContent: 'center', paddingBottom: tabInset }}>
          <EmptyState emoji="🛒" icon="bag-handle-outline" title="سلّتك فاضية" subtitle="استكشف أشهى المطاعم وابدأ طلبك الآن" ctaLabel="تصفّح المطاعم" onCta={goHome} />
        </View>
      </View>
    );
  }

  const subtotalForBars = summary.subtotal;
  // مع تسعيرة السيرفر: التوصيل المجاني حسب ردّه فقط (ما منعِد «مبروك» والرسوم محسوبة)
  const freeReached = activeQuote ? summary.freeDelivery : subtotalForBars >= freeThreshold;
  const rowIcon = (a) => (addrLabel(a).includes('عمل') ? 'briefcase' : addrLabel(a).includes('منزل') ? 'home' : 'location');
  const selectedAddrIdx = addresses.findIndex(a => String(a.id) === String(selectedAddressId));

  return (
    <View style={styles.container}>
      {header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={{ paddingBottom: kbVisible ? 24 : tabInset + 120 }}>

        {!!groupOrder?.code && (
          <FadeIn style={[styles.infoBanner, { backgroundColor: COLORS.tint, borderColor: COLORS.tintBorder }]}>
            <Ionicons name="people" size={18} color={COLORS.primary} />
            <Text style={styles.infoBannerTxt}>سلة مشتركة ({groupOrder.code}) — بتتقفل بعد تأكيد الطلب</Text>
          </FadeIn>
        )}

        {restaurantClosed && (
          <FadeIn style={[styles.infoBanner, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
            <Ionicons name="lock-closed" size={18} color={COLORS.red} />
            <Text style={[styles.infoBannerTxt, { color: COLORS.red }]}>المطعم مغلق حالياً — ما بنقدر نرسل الطلب الآن</Text>
            <TouchableOpacity onPress={refreshRestaurants} disabled={restRefreshing} style={styles.bannerAction} accessibilityRole="button"
              accessibilityLabel="تحديث حالة المطعم" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              {restRefreshing ? <ActivityIndicator size="small" color={COLORS.red} /> : <Ionicons name="refresh" size={14} color={COLORS.red} />}
              <Text style={styles.bannerActionTxt}>تحديث</Text>
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* الطلب المجمّع: شرح + تنبيه لو الميزة متوقفة */}
        {multi && (
          <FadeIn style={styles.multiHero}>
            <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={COLORS.gradients.sheen} style={styles.multiSheen} pointerEvents="none" />
            <View style={styles.multiHeroIcon}><Ionicons name="bicycle" size={22} color="#FFF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.multiHeroTitle}>طلب مجمّع من {plural(carts.length, 'restaurant')}</Text>
              <Text style={styles.multiHeroSub}>سائق واحد بيستلم من كل المطاعم وبيوصلك مرة وحدة 🛵</Text>
            </View>
          </FadeIn>
        )}
        {multiBlocked && (
          <FadeIn style={[styles.infoBanner, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
            <Ionicons name="alert-circle" size={18} color={COLORS.red} />
            <Text style={[styles.infoBannerTxt, { color: COLORS.red }]}>
              {!multiEnabled || !multiQuoteSupported.current
                ? 'الطلب من أكثر من مطعم غير متاح حالياً — احذف المطاعم الإضافية وخلّي مطعم واحد'
                : `بتقدر تطلب من ${plural(maxRestaurants, 'restaurant')} كحد أقصى بالطلب الواحد — احذف مطعم من السلة`}
            </Text>
          </FadeIn>
        )}

        {/* الأصناف — المجمّع: قسم لكل مطعم */}
        {multi && restRows.map((row, ri) => (
          <RestaurantSection key={String(row.rid)} row={row} index={ri} C={COLORS} styles={styles}
            note={restNotes[row.rid] || ''} onNote={(t) => setRestNotes(p => ({ ...p, [row.rid]: t }))}
            onRemove={() => confirmRemoveRestaurant(row)}
            onAddMore={() => navigation.navigate('Restaurant', { restaurantId: row.rid })}
            onInc={incLine}
            onDec={decLine}
            onItemNote={updateItemNote} />
        ))}
        {multi && carts.length < maxRestaurants && !multiBlocked && (
          <TouchableOpacity style={styles.addRestBtn} onPress={goHome} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.addMoreTxt}>أضف مطعم كمان (حتى {plural(maxRestaurants, 'restaurant')})</Text>
          </TouchableOpacity>
        )}

        {!multi && (
        <Section index={0} icon="receipt" title="طلباتك" C={COLORS} styles={styles}
          right={<View style={styles.countPill}><Text style={styles.countPillTxt}>{count}</Text></View>}>
          {items.map((item, i) => (
            <FadeIn key={item._key} delay={stagger(i, 40)} from={10}>
              <CartLine item={item} last={i === items.length - 1} C={COLORS} styles={styles}
                onInc={incLine} onDec={decLine} onNote={updateItemNote} />
            </FadeIn>
          ))}
          <TouchableOpacity style={styles.addMoreBtn} onPress={() => restaurantId && navigation.navigate('Restaurant', { restaurantId })} accessibilityRole="button">
            <Ionicons name="add-circle" size={18} color={COLORS.primary} />
            <Text style={styles.addMoreTxt}>أضف أصناف أخرى</Text>
          </TouchableOpacity>
          {multiEnabled && !groupOrder?.id && maxRestaurants > 1 && (
            <TouchableOpacity style={styles.multiTip} onPress={goHome} accessibilityRole="button" activeOpacity={0.8}>
              <Ionicons name="git-network-outline" size={16} color={COLORS.primary} />
              <Text style={styles.multiTipTxt}>بدك من مطعم ثاني كمان؟ ضيف حتى {plural(maxRestaurants, 'restaurant')} وسائق واحد بيجيبهم سوا</Text>
              <Ionicons name="chevron-back" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </Section>
        )}

        {/* الحد الأدنى للطلب */}
        {belowMin && (
          <FadeIn style={[styles.progressCard, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]}>
            <View style={styles.progressHead}>
              <Ionicons name="alert-circle" size={16} color={COLORS.warnFill} />
              <Text style={styles.progressText}>الحد الأدنى <Text style={{ fontWeight: '900' }}>{money(summary.minOrder)}</Text> — أضف <Text style={{ fontWeight: '900', color: COLORS.primary }}>{money(summary.minOrder - subtotalForBars)}</Text> للمتابعة</Text>
            </View>
            <ProgressBar pct={subtotalForBars / summary.minOrder} track={COLORS.warnBorder} colors={COLORS.gradients.gold} />
          </FadeIn>
        )}

        {/* التوصيل المجاني */}
        {deliveryType === 'delivery' && (
          <FadeIn style={[styles.progressCard, { backgroundColor: freeReached ? COLORS.successBg : COLORS.tint, borderColor: freeReached ? COLORS.successBorder : COLORS.tintBorder }]}>
            {freeReached ? (
              <PopIn style={styles.progressHead}>
                <Ionicons name="gift" size={18} color={COLORS.green} />
                <Text style={styles.freeDelivDone}>{multi ? 'مبروك! التوصيل الأساسي مجاني 🎉 (رسوم المطاعم الإضافية تبقى)' : 'مبروك! حصلت على توصيل مجاني 🎉'}</Text>
              </PopIn>
            ) : subtotalForBars < freeThreshold ? (
              <>
                <View style={styles.progressHead}>
                  <Ionicons name="bicycle" size={17} color={COLORS.primary} />
                  <Text style={styles.progressText}>أضف <Text style={{ fontWeight: '900', color: COLORS.primary }}>{money(freeThreshold - subtotalForBars)}</Text> واحصل على توصيل مجاني</Text>
                </View>
                <ProgressBar pct={subtotalForBars / freeThreshold} track={COLORS.tintBorder} colors={COLORS.gradients.sunset} />
              </>
            ) : (
              <View style={styles.progressHead}>
                <Ionicons name="information-circle" size={17} color={COLORS.primary} />
                <Text style={styles.progressText}>رسوم التوصيل محسوبة حسب المسافة لعنوانك</Text>
              </View>
            )}
          </FadeIn>
        )}

        {/* طريقة الاستلام */}
        <Section index={1} icon="navigate" title="طريقة الاستلام" C={COLORS} styles={styles}>
          {multi ? (
            <View style={[styles.feeBox, { marginBottom: 10 }]}>
              <Ionicons name="information-circle" size={17} color={COLORS.primary} />
              <Text style={styles.feeLabel}>الطلب المجمّع للتوصيل فقط — السائق بيجمع طلبك من كل المطاعم</Text>
            </View>
          ) : (
          <View style={styles.toggleRow}>
            {[
              { k: 'delivery', l: 'توصيل لعنواني', s: 'لباب البيت', i: 'bicycle' },
              { k: 'pickup', l: 'استلام من المحل', s: 'بدون رسوم', i: 'storefront' },
            ].map(o => (
              <SelectCard key={o.k} on={deliveryType === o.k} icon={o.i} title={o.l} sub={o.s} C={COLORS} styles={styles}
                onPress={() => setDeliveryType(o.k)} style={{ flex: 1 }} vertical />
            ))}
          </View>
          )}

          {deliveryType === 'delivery' ? (
            <View style={styles.feeBox}>
              <Ionicons name="location" size={16} color={COLORS.primary} />
              <Text style={styles.feeLabel} numberOfLines={1}>رسوم التوصيل {selectedAddress ? `إلى «${addrLabel(selectedAddress)}»` : ''}</Text>
              {needsAddress
                ? <Text style={[styles.feeValue, { fontSize: 13, color: COLORS.gray }]}>اختر عنوان</Text>
                : calculating && summary.deliveryFee === 0 && !summary.freeDelivery
                  ? <Skeleton w={54} h={16} r={8} />
                  : summary.deliveryFee === 0
                    ? <Text style={[styles.feeValue, { color: COLORS.green }]}>مجاني</Text>
                    : <AnimatedNumber value={summary.deliveryFee} suffix="₪" style={styles.feeValue} />}
            </View>
          ) : (
            <View style={[styles.feeBox, { backgroundColor: COLORS.successBg }]}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
              <Text style={[styles.feeLabel, { color: COLORS.successText, fontWeight: '700' }]}>ستستلم طلبك من المطعم — بدون رسوم توصيل</Text>
            </View>
          )}
        </Section>

        {/* عنوان التوصيل */}
        {deliveryType === 'delivery' && (
          <Section index={2} icon="location" title="عنوان التوصيل" C={COLORS} styles={styles}
            right={addresses.length > 0 ? <TouchableOpacity onPress={() => navigation.navigate('Addresses')} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.linkBtn}><Text style={styles.linkTxt}>إدارة</Text></TouchableOpacity> : null}>
            {addresses.length > 0 && (
              <RtlHScroll activeIndex={selectedAddrIdx >= 0 ? selectedAddrIdx : null} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
                {addresses.map(addr => (
                  <SelectCard key={addr.id} on={String(selectedAddressId) === String(addr.id)} icon={rowIcon(addr)}
                    title={`${addrLabel(addr)}${addr.is_default ? ' · افتراضي' : ''}`} sub={addr.address} C={COLORS} styles={styles}
                    onPress={() => setSelectedAddressId(addr.id)} style={{ width: 210 }} />
                ))}
              </RtlHScroll>
            )}
            {needsAddress && <Text style={styles.warnTxt}>أضف عنوان التوصيل حتى نقدر نحسب الرسوم ونرسل طلبك</Text>}
            <TouchableOpacity style={styles.addMoreBtn} onPress={() => navigation.navigate('AddAddress', { prevIds: addresses.map(a => a.id), makeDefault: addresses.length === 0 })} accessibilityRole="button">
              <Ionicons name="add-circle" size={18} color={COLORS.primary} />
              <Text style={styles.addMoreTxt}>إضافة عنوان جديد</Text>
            </TouchableOpacity>
          </Section>
        )}

        {/* الدفع */}
        <Section index={3} icon="wallet" title="طريقة الدفع" C={COLORS} styles={styles}>
          <View style={{ gap: 8 }}>
            {[
              { id: 'cash', label: 'كاش عند الاستلام', sub: 'ادفع للسائق أو بالمحل', icon: 'cash' },
              { id: 'card', label: 'بطاقة ائتمان', sub: 'دفع آمن ومشفّر', icon: 'card' },
            ].map(pm => {
              const off = (multi || cardOff) && pm.id === 'card';
              return (
                <SelectCard key={pm.id} on={paymentMethod === pm.id && !off} icon={pm.icon} title={pm.label} C={COLORS} styles={styles}
                  sub={off ? (multi ? 'غير متاح للطلب المجمّع حالياً' : 'غير متاح حالياً') : pm.sub} disabled={off}
                  onPress={() => (off
                    ? Alert.alert('الدفع بالبطاقة', multi
                      ? 'الدفع بالبطاقة غير متاح للطلب المجمّع حالياً — اختر كاش عند الاستلام (وبتقدر تستخدم رصيد محفظة وصلّي).'
                      : 'الدفع بالبطاقة غير متاح حالياً — اختر كاش عند الاستلام.')
                    : setPaymentMethod(pm.id))} />
              );
            })}
          </View>
          {multi && (
            <View style={styles.payNote}>
              <Ionicons name="information-circle-outline" size={15} color={COLORS.gray} />
              <Text style={styles.payNoteTxt}>الطلب المجمّع بيندفع كاش للسائق مرة وحدة — وبتقدر تدفع جزء أو الكل من محفظة وصلّي</Text>
            </View>
          )}
        </Section>

        {/* خيارات التوصيل (للتوصيل فقط) */}
        {deliveryType === 'delivery' && (
          <Section index={4} icon="heart" title="إكرامية السائق" C={COLORS} styles={styles}>
            <Text style={styles.tipLabel}>اختياري — يروح كامل للسائق 💛</Text>
            <View style={styles.chipsRow}>
              {[0, 2, 5, 10].map(v => (
                <Chip key={v} label={v === 0 ? 'بدون' : `${v}₪`} selected={tip === v} onPress={() => setTip(v)} style={{ flex: 1 }} />
              ))}
            </View>
            <ToggleRow on={leaveAtDoor} onPress={() => setLeaveAtDoor(v => !v)} icon="home" label="اترك الطلب على الباب" C={COLORS} styles={styles} />
          </Section>
        )}

        {/* ملاحظات */}
        <Section index={5} icon="create" title={multi ? 'ملاحظة عامة للطلب' : 'ملاحظات للمطعم'} C={COLORS} styles={styles}>
          <TextInput
            style={styles.notesInput}
            placeholder={multi ? 'للسائق ولكل المطاعم (مثلاً: رقم الشقة، اتصل قبل ما توصل...)' : 'أي طلبات خاصة...'}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholderTextColor={COLORS.faint}
            textAlign="right"
            maxLength={300}
          />
        </Section>

        {/* النقاط والمحفظة */}
        {(loyaltyPoints >= 100 || walletBalance > 0) && (
          <Section index={6} icon="trophy" title="نقاطي ومحفظتي" C={COLORS} styles={styles}>
            {loyaltyPoints >= 100 && (
              <ToggleRow on={usePoints} onPress={() => setUsePoints(v => !v)} icon="star" C={COLORS} styles={styles}
                label={`استخدم نقاطي (${plural(loyaltyPoints, 'point')} ≈ ${(loyaltyPoints * POINT_VALUE).toFixed(1)}₪)`} />
            )}
            {walletBalance > 0 && (
              <ToggleRow on={useWallet} onPress={() => setUseWallet(v => !v)} icon="wallet" C={COLORS} styles={styles}
                label={`ادفع من محفظة وصلّي (رصيدك ${money(walletBalance)})`} />
            )}
          </Section>
        )}

        {/* كود الخصم */}
        <Section index={7} icon="pricetag" title="كود الخصم" C={COLORS} styles={styles}>
          {couponCode ? (
            <PopIn from={0.94} style={[styles.couponApplied, summary.couponError ? { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder } : null]}>
              <View style={[styles.couponIcon, { backgroundColor: summary.couponError ? COLORS.red : COLORS.green }]}>
                <Ionicons name={summary.couponError ? 'alert' : 'checkmark'} size={16} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.couponCodeTxt, summary.couponError && { color: COLORS.red }]}>{couponCode}</Text>
                <Text style={[styles.couponAppliedTxt, summary.couponError && { color: COLORS.red }]}>
                  {summary.couponError ? summary.couponError : calculating ? 'جاري التحقق…' : `وفّرت ${money(summary.couponDiscount)} 🎉`}
                </Text>
              </View>
              <TouchableOpacity onPress={removeCoupon} accessibilityLabel="إزالة الكوبون" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close-circle" size={22} color={COLORS.gray} /></TouchableOpacity>
              {burstKey > 0 && couponOk && <Burst key={burstKey} style={{ left: '50%', top: '50%' }} radius={90} count={14} />}
            </PopIn>
          ) : (
            <View style={styles.couponRow}>
              <View style={styles.couponInputWrap}>
                <Ionicons name="ticket-outline" size={18} color={COLORS.faint} />
                <TextInput
                  style={styles.couponInput}
                  placeholder="أدخل كود الخصم"
                  value={couponInput}
                  onChangeText={setCouponInput}
                  autoCapitalize="characters"
                  placeholderTextColor={COLORS.faint}
                  textAlign="right"
                  onSubmitEditing={applyCoupon}
                  returnKeyType="done"
                />
              </View>
              <Press style={[styles.couponBtn, !couponInput.trim() && { opacity: 0.5 }]} onPress={applyCoupon} disabled={!couponInput.trim()} accessibilityRole="button" accessibilityLabel="تطبيق الكوبون">
                <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.couponBtnTxt}>تطبيق</Text>
              </Press>
            </View>
          )}
        </Section>

        {/* الملخص */}
        <Section index={8} icon="calculator" title="ملخص الطلب" C={COLORS} styles={styles}
          right={calculating ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}>
          <SummaryRow C={COLORS} styles={styles} label="المجموع الفرعي" value={summary.subtotal} />
          {deliveryType === 'delivery' && (
            <SummaryRow C={COLORS} styles={styles} label="رسوم التوصيل" text={needsAddress ? '—' : (summary.deliveryFee === 0 ? 'مجاني' : null)}
              value={summary.deliveryFee} green={!needsAddress && summary.deliveryFee === 0} />
          )}
          {multi && summary.extraStopsFee > 0 && (
            <SummaryRow C={COLORS} styles={styles} value={summary.extraStopsFee}
              label={`رسوم مطعم إضافي (${Math.max(1, (summary.stops || carts.length) - 1)} × ${money(summary.extraStopUnit)})`} />
          )}
          {summary.firstOrderDiscount > 0 && <SummaryRow C={COLORS} styles={styles} label="🎁 خصم أول طلب" value={summary.firstOrderDiscount} minus green />}
          {summary.couponDiscount > 0 && <SummaryRow C={COLORS} styles={styles} label="خصم الكوبون" value={summary.couponDiscount} minus green />}
          {summary.pointsValue > 0 && <SummaryRow C={COLORS} styles={styles} label="خصم النقاط" value={summary.pointsValue} minus green />}
          {summary.tip > 0 && <SummaryRow C={COLORS} styles={styles} label="إكرامية السائق" value={summary.tip} />}
          {summary.walletUsed > 0 && <SummaryRow C={COLORS} styles={styles} label="من محفظة وصلّي" value={summary.walletUsed} minus green />}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>الإجمالي</Text>
            <AnimatedNumber value={summary.total} suffix="₪" style={styles.totalVal} />
          </View>
          {summary.subtotal > 0 && (
            <View style={styles.cashback}>
              <Ionicons name="sparkles" size={13} color={COLORS.primary} />
              <Text style={styles.cashbackHint}>بتربح كاش باك ≈ {money(summary.subtotal * 0.02)} لمحفظتك على هالطلب</Text>
            </View>
          )}
          {multi && generalErrors.map((e, i) => (
            <View key={`ge${i}`} style={[styles.errRow, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
              <Ionicons name="alert-circle" size={15} color={COLORS.red} />
              <Text style={styles.errTxt}>{e.message}</Text>
            </View>
          ))}
          {multi && restRows.some(r => r.errors.length) && (
            <Text style={styles.warnTxt}>في ملاحظات على بعض المطاعم بالأعلى — راجعها قبل التأكيد</Text>
          )}
          {!!quoteError && (
            <View style={[styles.errRow, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
              <Ionicons name="alert-circle" size={15} color={COLORS.red} />
              <Text style={styles.errTxt}>{quoteError}</Text>
              <TouchableOpacity onPress={retryQuote} style={styles.errAction} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.errActionTxt}>حاول مجدداً</Text>
              </TouchableOpacity>
            </View>
          )}
          {summary.source === 'local' && !quoteLoading && (
            <Text style={styles.estimateHint}>الأرقام تقديرية — المبلغ النهائي يحدده النظام عند التأكيد</Text>
          )}
        </Section>
      </ScrollView>

      {/* الفوتر يختفي وقت الكتابة (ما يغطي حقل الكوبون/الملاحظات) */}
      {!kbVisible && (
      <View style={[styles.footer, { bottom: tabInset + 10 }]} pointerEvents="box-none">
        {(belowMin || needsAddress || !!quoteError || multiNeedsQuote || (multi && !placing && (multiBlocked || multiProblem))) && (
          <FadeIn from={8} style={[styles.footerHint, { backgroundColor: COLORS.card, borderColor: quoteError ? COLORS.dangerBorder : COLORS.border }]}>
            <Ionicons name={quoteError ? 'alert-circle' : 'information-circle'} size={16} color={quoteError ? COLORS.red : COLORS.primary} />
            <Text style={[styles.footerHintTxt, !!quoteError && { color: COLORS.red }]} numberOfLines={2}>
              {needsAddress ? 'اختر عنوان التوصيل للمتابعة'
                : quoteError ? quoteError
                  : multiNeedsQuote ? 'تعذّر حساب سعر الطلب المجمّع'
                    : multi ? (multiBlocked ? 'خلّي مطعم واحد أو قلّل عدد المطاعم' : 'راجع ملاحظات المطاعم بالسلة')
                      : `أضف ${money(summary.minOrder - summary.subtotal)} للوصول للحد الأدنى`}
            </Text>
            {(multiNeedsQuote || !!quoteError) && (
              <TouchableOpacity onPress={retryQuote} accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.linkTxt, { fontSize: 12.5 }]}>إعادة المحاولة</Text>
              </TouchableOpacity>
            )}
          </FadeIn>
        )}
        <PressableScale style={[styles.orderBtn, !canOrder && { opacity: 0.55 }]} onPress={placeOrder} disabled={!canOrder}
          accessibilityRole="button" accessibilityLabel={pricing ? 'جاري حساب السعر' : `تأكيد الطلب ${money(summary.total)}`}>
          <LinearGradient colors={canOrder ? COLORS.gradients.sunset : [COLORS.gray, COLORS.faint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orderBtnGrad}>
            <LinearGradient colors={COLORS.gradients.sheen} style={styles.orderSheen} pointerEvents="none" />
            {placing
              ? <ActivityIndicator color="#FFF" />
              : pricing ? (
                <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ionicons name="calculator" size={19} color="#FFF" />
                  <Text style={styles.orderBtnText}>جاري حساب السعر…</Text>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                    <Ionicons name={paymentMethod === 'card' ? 'card' : 'checkmark-circle'} size={20} color="#FFF" />
                    <Text style={styles.orderBtnText}>{paymentMethod === 'card' ? 'تأكيد والدفع' : multi ? 'تأكيد الطلب المجمّع' : 'تأكيد الطلب'}</Text>
                  </View>
                  <View style={styles.orderTotalPill}>
                    <AnimatedNumber value={summary.total} suffix="₪" style={styles.orderBtnText} />
                  </View>
                </>
              )}
          </LinearGradient>
        </PressableScale>
      </View>
      )}
    </View>
  );
}

/* سطر صنف بالسلة (memo — ما يُعاد رسمه مع كل تغيير بالصفحة) */
const CartLine = memo(function CartLine({ item, last, C, styles, onInc, onDec, onNote }) {
  return (
    <View style={[styles.itemRow, last && { borderBottomWidth: 0 }]}>
      {item.image
        ? <Image source={{ uri: item.image }} style={styles.itemImg} />
        : <View style={[styles.itemImg, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="fast-food-outline" size={22} color={C.primary} /></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName} numberOfLines={2}>{item.name_ar || item.name}</Text>
        {item.addons?.length > 0 && (
          <Text style={styles.itemOptions} numberOfLines={2}>{item.addons.map(a => a.name).join(' • ')}</Text>
        )}
        <View style={styles.itemBottom}>
          <AnimatedNumber value={linePrice(item) * item.quantity} suffix="₪" style={styles.itemPrice} />
          <LineQty item={item} C={C} styles={styles} onInc={() => onInc(item._key)} onDec={() => onDec(item._key)} />
        </View>
        <NoteInput itemKey={item._key} value={item.notes || ''} onCommit={onNote} C={C} styles={styles} />
      </View>
    </View>
  );
});

/*
  حقل ملاحظة الصنف: حالة محلية (الكتابة ما بتعيد رسم السلة كلها مع كل حرف)
  يحفظ بالسلة بعد توقف الكتابة 500ms أو عند مغادرة الحقل
*/
const NoteInput = memo(function NoteInput({ itemKey, value, onCommit, C, styles, placeholder, style, maxLength = 200 }) {
  const [text, setText] = useState(value);
  const timer = useRef(null);
  const latest = useRef(value);
  useEffect(() => { if (value !== latest.current) { latest.current = value; setText(value); } }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (t) => { clearTimeout(timer.current); if (t !== latest.current) { latest.current = t; onCommit(itemKey, t); } };
  return (
    <TextInput
      style={[styles.itemNoteInput, style]}
      placeholder={placeholder || 'ملاحظة (بدون بصل، حار زيادة...)'}
      placeholderTextColor={C.faint}
      value={text}
      onChangeText={(t) => { setText(t); clearTimeout(timer.current); timer.current = setTimeout(() => commit(t), 500); }}
      onBlur={() => commit(text)}
      textAlign="right"
      maxLength={maxLength}
    />
  );
});

/* ═══ مكوّنات السلة (على مستوى الملف حتى ما يُعاد تركيبها) ═══ */
function Section({ icon, title, right, children, C, styles, index = 0 }) {
  return (
    <FadeIn delay={stagger(index, 40)} from={14} style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardIcon}><Ionicons name={icon} size={15} color={C.primary} /></View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </FadeIn>
  );
}

/* قسم مطعم داخل السلة المجمّعة: لوجو/اسم/أصناف/مجموع/حد أدنى/أخطاء التسعيرة/حذف المطعم */
const RestaurantSection = memo(function RestaurantSection({ row, index, C, styles, note, onNote, onRemove, onAddMore, onInc, onDec, onItemNote }) {
  const items = row.cart.items;
  const short = row.minOrder > 0 && !row.meetsMin ? Math.max(0, row.minOrder - row.subtotal) : 0;
  const hasIssue = row.closed || short > 0 || row.errors.length > 0;
  return (
    <FadeIn delay={stagger(index, 50)} from={14} style={[styles.card, hasIssue && { borderColor: C.dangerBorder, borderWidth: 1 }]}>
      <View style={styles.rsHead}>
        <View style={styles.rsLogoWrap}>
          {row.logo
            ? <Image source={{ uri: row.logo }} style={styles.rsLogo} />
            : <View style={[styles.rsLogo, { alignItems: 'center', justifyContent: 'center', backgroundColor: C.tint }]}><Ionicons name="storefront" size={20} color={C.primary} /></View>}
          <View style={[styles.rsSeq, { borderColor: C.card }]}><Text style={styles.rsSeqTxt}>{index + 1}</Text></View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rsName} numberOfLines={1}>{row.name}</Text>
          <Text style={styles.rsMeta} numberOfLines={1}>
            {plural(row.count, 'item')}{row.distanceKm != null ? ` · يبعد ${Number(row.distanceKm).toFixed(1)} كم عنك` : ''}{row.closed ? ' · مغلق الآن' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onRemove} style={styles.rsRemove} accessibilityRole="button" accessibilityLabel={`حذف ${row.name} من السلة`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={17} color={C.red} />
        </TouchableOpacity>
      </View>

      {items.map((item, i) => (
        <CartLine key={item._key} item={item} last={i === items.length - 1} C={C} styles={styles}
          onInc={onInc} onDec={onDec} onNote={onItemNote} />
      ))}

      <NoteInput itemKey={row.rid} value={note} onCommit={(_, t) => onNote(t)} C={C} styles={styles}
        placeholder={`ملاحظة لـ ${row.name} (اختياري)`} style={{ marginTop: 4 }} maxLength={300} />

      {/* الحالة: حد أدنى / مغلق / أخطاء من السيرفر بجانب المطعم نفسه */}
      {short > 0 && (
        <View style={[styles.errRow, { backgroundColor: C.warnBg, borderColor: C.warnBorder }]}>
          <Ionicons name="alert-circle" size={15} color={C.warnFill} />
          <Text style={[styles.errTxt, { color: C.text }]}>الحد الأدنى من هالمطعم {money(row.minOrder)} — أضف {money(short)} كمان</Text>
        </View>
      )}
      {row.closed && !row.errors.some(e => e?.code === 'restaurant_closed') && (
        <View style={[styles.errRow, { backgroundColor: C.dangerBg, borderColor: C.dangerBorder }]}>
          <Ionicons name="lock-closed" size={14} color={C.red} />
          <Text style={styles.errTxt}>المطعم مغلق حالياً — احذفه من السلة أو اطلب لاحقاً</Text>
        </View>
      )}
      {row.errors.filter(e => !(short > 0 && e?.code === 'min_order')).map((e, i) => (
        <View key={`e${i}`} style={[styles.errRow, { backgroundColor: C.dangerBg, borderColor: C.dangerBorder }]}>
          <Ionicons name={e?.code === 'too_far' ? 'navigate-circle' : 'alert-circle'} size={15} color={C.red} />
          <Text style={styles.errTxt}>{e?.message || 'في مشكلة بهالمطعم'}</Text>
          {(e?.code === 'too_far' || e?.code === 'restaurant_closed' || e?.code === 'restaurant_unavailable' || e?.code === 'restaurant_location') && (
            <TouchableOpacity onPress={onRemove} style={styles.errAction} accessibilityRole="button">
              <Text style={styles.errActionTxt}>احذفه</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={styles.rsFoot}>
        <TouchableOpacity style={[styles.addMoreBtn, { paddingTop: 0 }]} onPress={onAddMore} accessibilityRole="button">
          <Ionicons name="add-circle" size={18} color={C.primary} />
          <Text style={styles.addMoreTxt}>أضف أصناف</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
          <Text style={styles.rsSubLbl}>المجموع</Text>
          <AnimatedNumber value={row.subtotal} suffix="₪" style={styles.rsSubVal} />
        </View>
      </View>
    </FadeIn>
  );
});

function SelectCard({ on, icon, title, sub, onPress, C, styles, style, vertical, disabled }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(v, { toValue: on ? 1 : 0, ...SPRING_POP }).start(); }, [on]);
  const dot = v.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  return (
    <Press onPress={() => { haptic.select(); onPress(); }} haptic={false} scaleTo={0.97} accessibilityRole="radio" accessibilityLabel={sub ? `${title}، ${sub}` : title}
      accessibilityState={{ checked: !!on, selected: !!on, disabled: !!disabled }}
      style={[styles.selCard, vertical && styles.selCardV, on && styles.selCardOn, disabled && { opacity: 0.5 }, style]}>
      <View style={[styles.selIcon, on && { backgroundColor: C.primary }]}>
        <Ionicons name={on ? icon : `${icon}-outline`} size={19} color={on ? '#FFF' : C.primary} />
      </View>
      <View style={vertical ? { alignItems: 'center' } : { flex: 1 }}>
        <Text style={[styles.selTitle, vertical && { textAlign: 'center' }, on && { color: C.primary }]} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={[styles.selSub, vertical && { textAlign: 'center' }]} numberOfLines={1}>{sub}</Text>}
      </View>
      {!vertical && (
        <View style={[styles.radio, on && { borderColor: C.primary }]}>
          <Animated.View style={[styles.radioDot, { backgroundColor: C.primary, transform: [{ scale: dot }] }]} />
        </View>
      )}
    </Press>
  );
}

function ToggleRow({ on, onPress, icon, label, C, styles }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(v, { toValue: on ? 1 : 0, ...SPRING, useNativeDriver: false }).start(); }, [on]);
  const knobX = v.interpolate({ inputRange: [0, 1], outputRange: [22, 2] }); // RTL: التشغيل لليسار
  const bg = v.interpolate({ inputRange: [0, 1], outputRange: [C.border, C.primary] });
  return (
    <TouchableOpacity style={styles.checkRow} activeOpacity={0.8} onPress={() => { haptic.select(); onPress(); }}
      accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <View style={styles.toggleIcon}><Ionicons name={icon} size={16} color={C.primary} /></View>
      <Text style={styles.checkText}>{label}</Text>
      <Animated.View style={[styles.switch, { backgroundColor: bg }]}>
        <Animated.View style={[styles.knob, { left: knobX }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

function LineQty({ item, onInc, onDec, C, styles }) {
  const bump = useBump(item.quantity, 1.3);
  return (
    <View style={styles.qtyControl}>
      <TouchableOpacity onPress={onInc} style={[styles.qtyBtn, { backgroundColor: C.primary, borderColor: C.primary }]} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        accessibilityRole="button" accessibilityLabel={`زيادة ${item.name_ar}`} disabled={item.quantity >= 99}>
        <Ionicons name="add" size={16} color="#FFF" />
      </TouchableOpacity>
      <Animated.Text style={[styles.qty, bump]} accessibilityLabel={`الكمية ${item.quantity}`}>{item.quantity}</Animated.Text>
      <TouchableOpacity onPress={onDec} style={styles.qtyBtn} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel={item.quantity === 1 ? `حذف ${item.name_ar}` : `إنقاص ${item.name_ar}`}>
        <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={15} color={item.quantity === 1 ? C.red : C.primary} />
      </TouchableOpacity>
    </View>
  );
}

function ProgressBar({ pct, track, colors }) {
  const v = useRef(new Animated.Value(0)).current;
  const p = Math.min(1, Math.max(0, Number(pct) || 0));
  useEffect(() => { Animated.timing(v, { toValue: p, duration: isReducedMotion() ? 0 : 600, easing: EASE_OUT, useNativeDriver: false }).start(); }, [p]);
  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row-reverse', backgroundColor: track, marginTop: 8 }}>
      <Animated.View style={{ width, height: '100%', borderRadius: 4, overflow: 'hidden' }}>
        <LinearGradient colors={colors} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function SummaryRow({ label, value, text, green, minus, C, styles }) {
  const col = green ? C.green : C.text;
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, green && { color: C.green }]}>{label}</Text>
      {text != null
        ? <Text style={[styles.summaryVal, { color: col }]}>{text}</Text>
        : <AnimatedNumber value={value} prefix={minus ? '-' : ''} suffix="₪" style={[styles.summaryVal, { color: col }]} />}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 14, paddingBottom: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  restPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, maxWidth: '92%' },
  headerSub: { fontSize: 12, color: '#FFF', fontWeight: '700', flexShrink: 1 },
  infoBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 12, borderRadius: 16, padding: 12, borderWidth: 1 },
  infoBannerTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'right' },
  card: { backgroundColor: C.card, marginHorizontal: 14, marginTop: 12, borderRadius: 24, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cardIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  countPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  countPillTxt: { color: C.primary, fontWeight: '800', fontSize: 12 },
  linkTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  itemRow: { flexDirection: 'row-reverse', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, gap: 12 },
  itemImg: { width: 62, height: 62, borderRadius: 16, backgroundColor: C.tint },
  itemBottom: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  qtyControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.inputBg, borderRadius: 999, padding: 3 },
  qtyBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.card, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  bannerAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: C.dangerBorder },
  bannerActionTxt: { color: C.red, fontWeight: '900', fontSize: 12 },
  qty: { fontSize: 15, fontWeight: '900', color: C.text, minWidth: 22, textAlign: 'center' },
  itemName: { fontSize: 14.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  itemOptions: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  itemPrice: { fontSize: 15, color: C.primary, fontWeight: '900' },
  itemNoteInput: { marginTop: 8, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12.5, color: C.text, backgroundColor: C.inputBg },
  addMoreBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingTop: 12 },
  addMoreTxt: { color: C.primary, fontWeight: '800', fontSize: 13.5 },
  progressCard: { marginHorizontal: 14, marginTop: 12, borderRadius: 18, padding: 12, borderWidth: 1 },
  progressHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  progressText: { fontSize: 13, color: C.text, textAlign: 'center', fontWeight: '500', flexShrink: 1 },
  freeDelivDone: { fontSize: 13.5, color: C.successText, fontWeight: '800', textAlign: 'center' },
  toggleRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  feeBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.tint, borderRadius: 14, padding: 12 },
  feeLabel: { flex: 1, fontSize: 13, color: C.text, textAlign: 'right', fontWeight: '500' },
  feeValue: { fontSize: 16, fontWeight: '900', color: C.primary },
  selCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  selCardV: { flexDirection: 'column', paddingVertical: 14, gap: 8 },
  selCardOn: { borderColor: C.primary, backgroundColor: C.tint },
  selIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  selTitle: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  selSub: { fontSize: 11.5, color: C.gray, fontWeight: '500', textAlign: 'right', marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  tipLabel: { fontSize: 13, color: C.gray, marginBottom: 10, textAlign: 'right', fontWeight: '500' },
  chipsRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 8 },
  checkRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 8 },
  toggleIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 14, color: C.text, fontWeight: '700', flex: 1, textAlign: 'right' },
  switch: { width: 46, height: 26, borderRadius: 13, justifyContent: 'center' },
  knob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', ...C.shadow.soft },
  notesInput: { borderRadius: 16, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: C.text, backgroundColor: C.inputBg, fontWeight: '500' },
  couponRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  couponInputWrap: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 12, backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  couponInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: C.text, fontWeight: '700' },
  couponBtn: { borderRadius: 16, paddingHorizontal: 20, height: 48, alignItems: 'center', justifyContent: 'center', minWidth: 84, overflow: 'hidden' },
  couponBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  couponApplied: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: C.successBg, borderRadius: 16, padding: 12, borderWidth: 1.5, borderColor: C.successBorder, borderStyle: 'dashed' },
  couponIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  couponCodeTxt: { fontSize: 15, fontWeight: '900', color: C.successText, textAlign: 'right' },
  couponAppliedTxt: { fontSize: 12.5, fontWeight: '700', color: C.successText, textAlign: 'right', marginTop: 1 },
  summaryRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  summaryLabel: { fontSize: 14, color: C.gray, fontWeight: '500' },
  summaryVal: { fontSize: 14.5, fontWeight: '800', color: C.text },
  totalRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontWeight: '900', fontSize: 17, color: C.text },
  totalVal: { fontWeight: '900', fontSize: 22, color: C.primary },
  divider: { height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.border, marginVertical: 10 },
  cashback: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 10, backgroundColor: C.tint, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  cashbackHint: { fontSize: 12, color: C.primary, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  estimateHint: { fontSize: 11.5, color: C.faint, fontWeight: '500', marginTop: 6, textAlign: 'right' },
  warnTxt: { fontSize: 12.5, color: C.red, fontWeight: '700', marginTop: 6, textAlign: 'right' },
  // الطلب المجمّع
  multiHero: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginHorizontal: 14, marginTop: 12, borderRadius: 22, padding: 14, overflow: 'hidden', ...C.shadow.float },
  multiSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 34 },
  multiHeroIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  multiHeroTitle: { color: '#FFF', fontSize: 15.5, fontWeight: '900', textAlign: 'right' },
  multiHeroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 12.5, fontWeight: '500', textAlign: 'right', marginTop: 2, lineHeight: 18 },
  multiTip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: C.tint, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: C.tintBorder },
  multiTipTxt: { flex: 1, fontSize: 12.5, color: C.text, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  addRestBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 14, marginTop: 12, paddingVertical: 12, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.tintBorder, backgroundColor: C.card },
  rsHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rsLogoWrap: { width: 48, height: 48 },
  rsLogo: { width: 48, height: 48, borderRadius: 15, backgroundColor: C.inputBg },
  rsSeq: { position: 'absolute', bottom: -4, left: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: C.primary, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rsSeqTxt: { color: '#FFF', fontSize: 10.5, fontWeight: '900' },
  rsName: { fontSize: 15.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  rsMeta: { fontSize: 12, color: C.gray, fontWeight: '500', textAlign: 'right', marginTop: 2 },
  rsRemove: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.dangerBg, alignItems: 'center', justifyContent: 'center' },
  rsFoot: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rsSubLbl: { fontSize: 12.5, color: C.gray, fontWeight: '600' },
  rsSubVal: { fontSize: 16, color: C.primary, fontWeight: '900' },
  errRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginTop: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  errTxt: { flex: 1, fontSize: 12.5, color: C.red, fontWeight: '700', textAlign: 'right', lineHeight: 18 },
  errAction: { backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  errActionTxt: { color: '#FFF', fontSize: 11.5, fontWeight: '900' },
  payNote: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 10 },
  payNoteTxt: { flex: 1, fontSize: 12, color: C.gray, fontWeight: '500', textAlign: 'right', lineHeight: 18 },
  footer: { position: 'absolute', left: 16, right: 16, zIndex: 30 },
  footerHint: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, ...C.shadow.soft },
  footerHintTxt: { fontSize: 12.5, color: C.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  orderBtn: { borderRadius: 22, overflow: 'hidden', ...C.shadow.float },
  orderBtnGrad: { height: 60, paddingHorizontal: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderRadius: 22, overflow: 'hidden' },
  orderSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 30 },
  orderTotalPill: { backgroundColor: 'rgba(0,0,0,0.14)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  orderBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
