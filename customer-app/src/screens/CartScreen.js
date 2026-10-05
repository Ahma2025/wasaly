import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, Keyboard } from 'react-native';
import PressableScale from '../components/PressableScale';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useCart, linePrice } from '../context/CartContext';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { startCardPayment } from '../utils/payments';
import { useTheme } from '../context/ThemeContext';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';
import { FREE_DELIVERY_THRESHOLD, POINT_VALUE, DEFAULT_DELIVERY_FEE } from '../config';

const money = (v) => `${(Number(v) || 0).toFixed(2)}₪`;
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const addrLabel = (a) => a?.label || (a?.title && a.title !== a.address ? a.title : '') || 'عنوان';

export default function CartScreen() {
  const navigation = useNavigation();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const headerTop = useHeaderTop(10);
  const tabInset = useTabBarInset();
  const { items, total, count, removeItem, incrementItem, clearCart, restaurantId, restaurantName, updateItemNote, groupOrder } = useCart();

  const [deliveryType, setDeliveryTypeRaw] = useState('delivery'); // 'delivery' | 'pickup'
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
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
    const apply = (list) => {
      setAddresses(list);
      setSelectedAddressId(prev => {
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
    } catch {}
  }, []);

  const checkFirstOrder = useCallback(async () => {
    try {
      const d = await api.get('/orders/my?limit=1');
      setIsFirstOrder((d.data || []).length === 0);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    refreshProfile(); fetchAddresses(); checkFirstOrder();
  }, [refreshProfile, fetchAddresses, checkFirstOrder]));

  // ── معلومات المطعم تُجلب من جديد كلما تغيّر مطعم السلة ──
  useEffect(() => {
    let alive = true;
    setRestaurantInfo(null);
    if (!restaurantId) return;
    (async () => {
      const cached = await readCache('rest_' + restaurantId);
      if (alive && cached?.restaurant) setRestaurantInfo(cached.restaurant);
      try {
        const data = await api.get(`/restaurants/${restaurantId}`);
        if (alive) setRestaurantInfo(data.data);
      } catch {}
    })();
    return () => { alive = false; };
  }, [restaurantId]);

  // لو تفرّغت السلة نصفّر الاختيارات المؤقتة
  useEffect(() => {
    if (items.length === 0) { setQuote(null); setCouponCode(null); setLocalCoupon({ discount: 0, error: '' }); setUsePoints(false); setUseWallet(false); }
  }, [items.length]);

  // ── جسم الطلب (نفس الشكل لـ /orders/quote و /orders) ──
  const buildBody = useCallback(() => {
    const body = {
      restaurant_id: restaurantId,
      items: items.map(i => ({
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
      })),
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

  const quoteKey = JSON.stringify([
    items.map(i => [i._key, i.quantity]), restaurantId, deliveryType, selectedAddress?.id, selectedAddress?.lat, selectedAddress?.lng,
    couponCode, deliveryType === 'delivery' ? tip : 0, usePoints, loyaltyPoints, useWallet, walletBalance,
  ]);

  // ── POST /orders/quote (مؤجّل) عند أي تغيير مؤثر على السعر ──
  useEffect(() => {
    if (!items.length || !restaurantId || !quoteSupported.current) return;
    if (deliveryType === 'delivery' && !selectedAddress) { setQuote(null); return; }
    const seq = ++quoteSeq.current;
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.post('/orders/quote', buildBody());
        if (seq !== quoteSeq.current) return;
        if (r?.data && typeof r.data === 'object' && r.data.total != null) { setQuote(r.data); setQuoteError(''); }
        else { setQuote(null); }
      } catch (e) {
        if (seq !== quoteSeq.current) return;
        if (e?.status === 404) quoteSupported.current = false; // سيرفر قديم → حساب محلي
        else setQuoteError(e?.status && e.status < 500 ? (e.message || '') : '');
        setQuote(null);
      } finally {
        if (seq === quoteSeq.current) setQuoteLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [quoteKey]);

  const usingLocal = !quote;

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
    if (quote) {
      const q = quote;
      const minOrder = num(q.min_order, num(restaurantInfo?.min_order));
      return {
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
    const freeDelivery = isDel && subtotal >= FREE_DELIVERY_THRESHOLD;
    const deliveryFee = isDel ? (freeDelivery ? 0 : num(localFee, DEFAULT_DELIVERY_FEE)) : 0;
    const firstOrderDiscount = isFirstOrder ? Math.min(10, subtotal * 0.15) : 0;
    const couponDiscount = couponCode ? localCoupon.discount : 0;
    const discount = couponDiscount + firstOrderDiscount;
    const pointsValue = usePoints ? Math.min(loyaltyPoints * POINT_VALUE, Math.max(0, subtotal + deliveryFee - discount)) : 0;
    const tipAmt = isDel ? num(tip) : 0;
    const due = Math.max(0, subtotal + deliveryFee - discount - pointsValue) + tipAmt;
    const walletUsed = useWallet ? Math.min(walletBalance, due) : 0;
    const minOrder = num(restaurantInfo?.min_order);
    return {
      subtotal, deliveryFee, freeDelivery, firstOrderDiscount, couponDiscount, couponError: couponCode ? localCoupon.error : '',
      pointsValue, tip: tipAmt, walletUsed, total: Math.max(0, due - walletUsed), minOrder, meetsMin: subtotal >= minOrder, source: 'local',
    };
  }, [quote, total, deliveryType, localFee, isFirstOrder, couponCode, localCoupon, usePoints, loyaltyPoints, tip, useWallet, walletBalance, restaurantInfo?.min_order]);

  const calculating = quoteLoading || (usingLocal && (feeLoading || couponChecking));
  const needsAddress = deliveryType === 'delivery' && !selectedAddress;
  const belowMin = !summary.meetsMin && summary.minOrder > 0;
  const restaurantClosed = restaurantInfo && restaurantInfo.is_open === false;
  const canOrder = !placing && !belowMin && !needsAddress && !restaurantClosed && items.length > 0;

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

  const placeOrder = async () => {
    if (submittingRef.current) return;
    if (needsAddress) return Alert.alert('عنوان التوصيل', 'الرجاء اختيار أو إضافة عنوان التوصيل');
    if (belowMin) return Alert.alert('الحد الأدنى للطلب', `الحد الأدنى لهذا المطعم ${money(summary.minOrder)}`);
    if (restaurantClosed) return Alert.alert('المطعم مغلق', 'المطعم مغلق حالياً، جرّب لاحقاً');
    if (items.length === 0) return;
    submittingRef.current = true;
    setPlacing(true);
    const group = groupOrder;
    const method = paymentMethod;
    try {
      const data = await api.post('/orders', buildBody());
      const orderId = data.data?.id || data.id;
      clearCart();
      setNotes(''); setTip(0); setLeaveAtDoor(false); setCouponCode(null); setCouponInput(''); setUsePoints(false); setUseWallet(false);
      // الطلب الجماعي يُقفل فقط بعد نجاح إنشاء الطلب
      if (group?.id) api.post(`/group-orders/${group.id}/close`, { status: 'ordered', order_id: orderId }).catch(() => {});
      refreshProfile();
      if (method === 'card') {
        await startCardPayment(navigation, orderId);
      } else {
        // navigate (مش replace) حتى يبقى Main وتبويباته تحت شاشة التتبع
        navigation.navigate('OrderTracking', { orderId, fromCheckout: true });
      }
    } catch (e) {
      Alert.alert('تعذّر إتمام الطلب', e?.message || 'فشل في إتمام الطلب، حاول مرة أخرى');
    } finally {
      setPlacing(false);
      submittingRef.current = false;
    }
  };

  const goHome = () => navigation.navigate('Main', { screen: 'الرئيسية' });

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIconWrap}><Text style={{ fontSize: 58 }}>🛒</Text></View>
        <Text style={styles.emptyTitle}>سلّتك فاضية</Text>
        <Text style={styles.emptySub}>استكشف أشهى المطاعم وابدأ طلبك الآن</Text>
        <TouchableOpacity activeOpacity={0.9} onPress={goHome} style={styles.shopBtn} accessibilityRole="button">
          <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shopBtnGrad}>
            <Text style={styles.shopBtnText}>تصفّح المطاعم</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  const SummaryRow = ({ label, value, green, bold }) => (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, green && { color: COLORS.green }, bold && styles.totalLabel]}>{label}</Text>
      <Text style={[styles.summaryVal, green && { color: COLORS.green }, bold && styles.totalVal]}>{value}</Text>
    </View>
  );

  const subtotalForBars = summary.subtotal;

  return (
    <View style={styles.container}>
      <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={goHome} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="رجوع للرئيسية">
          <Ionicons name="arrow-forward" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>سلّتي ({count})</Text>
          {!!restaurantName && <Text style={styles.headerSub} numberOfLines={1}>{restaurantName}</Text>}
        </View>
        <TouchableOpacity onPress={confirmClear} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="إفراغ السلة">
          <Ionicons name="trash-outline" size={20} color="#FFF" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: tabInset + 110 }}>

        {!!groupOrder?.code && (
          <View style={[styles.infoBanner, { backgroundColor: COLORS.tint, borderColor: COLORS.tintBorder }]}>
            <Ionicons name="people" size={18} color={COLORS.primary} />
            <Text style={styles.infoBannerTxt}>طلب جماعي ({groupOrder.code}) — المجموعة تُقفل بعد تأكيد الطلب</Text>
          </View>
        )}

        {restaurantClosed && (
          <View style={[styles.infoBanner, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
            <Ionicons name="lock-closed" size={18} color={COLORS.red} />
            <Text style={[styles.infoBannerTxt, { color: COLORS.red }]}>المطعم مغلق حالياً — ما بنقدر نرسل الطلب الآن</Text>
          </View>
        )}

        {/* الأصناف */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🧾 طلباتك</Text>
          {items.map(item => (
            <View key={item._key} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name_ar || item.name}</Text>
                {item.addons?.length > 0 && (
                  <Text style={styles.itemOptions}>{item.addons.map(a => a.name).join(' • ')}</Text>
                )}
                <Text style={styles.itemPrice}>{money(linePrice(item) * item.quantity)}</Text>
                <TextInput
                  style={styles.itemNoteInput}
                  placeholder="ملاحظة (بدون بصل، حار زيادة...)"
                  placeholderTextColor={COLORS.faint}
                  value={item.notes || ''}
                  onChangeText={(t) => updateItemNote(item._key, t)}
                  textAlign="right"
                  maxLength={200}
                />
              </View>
              <View style={styles.qtyControl}>
                <TouchableOpacity onPress={() => incrementItem(item._key)} style={[styles.qtyBtn, { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                  accessibilityRole="button" accessibilityLabel={`زيادة ${item.name_ar}`} disabled={item.quantity >= 99}>
                  <Ionicons name="add" size={17} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => removeItem(item._key)} style={styles.qtyBtn} accessibilityRole="button" accessibilityLabel={`إنقاص ${item.name_ar}`}>
                  <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={16} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addMoreBtn} onPress={() => restaurantId && navigation.navigate('Restaurant', { restaurantId })}>
            <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.addMoreTxt}>أضف أصناف أخرى</Text>
          </TouchableOpacity>
        </View>

        {/* الحد الأدنى للطلب */}
        {belowMin && (
          <View style={[styles.progressCard, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]}>
            <Text style={styles.progressText}>الحد الأدنى للطلب <Text style={{ fontWeight: '900' }}>{money(summary.minOrder)}</Text> — أضف <Text style={{ fontWeight: '900', color: COLORS.primary }}>{money(summary.minOrder - subtotalForBars)}</Text> للمتابعة</Text>
            <View style={[styles.progressBar, { backgroundColor: COLORS.warnBorder }]}>
              <View style={[styles.progressFill, { backgroundColor: COLORS.warnFill, width: `${Math.min(100, (subtotalForBars / summary.minOrder) * 100)}%` }]} />
            </View>
          </View>
        )}

        {/* التوصيل المجاني */}
        {deliveryType === 'delivery' && (
          <View style={[styles.progressCard, { backgroundColor: COLORS.tint, borderColor: COLORS.tintBorder }]}>
            {(summary.freeDelivery || subtotalForBars >= FREE_DELIVERY_THRESHOLD) ? (
              <Text style={styles.freeDelivDone}>🎉 مبروك! حصلت على توصيل مجاني</Text>
            ) : (
              <>
                <Text style={styles.progressText}>أضف <Text style={{ fontWeight: '900', color: COLORS.primary }}>{money(FREE_DELIVERY_THRESHOLD - subtotalForBars)}</Text> واحصل على توصيل مجاني 🚚</Text>
                <View style={[styles.progressBar, { backgroundColor: COLORS.tintBorder }]}>
                  <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={[styles.progressFill, { width: `${Math.min(100, (subtotalForBars / FREE_DELIVERY_THRESHOLD) * 100)}%` }]} />
                </View>
              </>
            )}
          </View>
        )}

        {/* طريقة الاستلام */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚚 طريقة الاستلام</Text>
          <View style={styles.toggleRow}>
            {[
              { k: 'delivery', l: 'توصيل لعنواني', i: 'bicycle-outline' },
              { k: 'pickup', l: 'استلام من المحل', i: 'storefront-outline' },
            ].map(o => {
              const on = deliveryType === o.k;
              return (
                <TouchableOpacity key={o.k} style={[styles.toggleBtn, on && styles.toggleBtnActive]} onPress={() => setDeliveryType(o.k)}
                  accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Ionicons name={o.i} size={20} color={on ? '#FFF' : COLORS.gray} />
                  <Text style={[styles.toggleText, on && { color: '#FFF' }]}>{o.l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {deliveryType === 'delivery' ? (
            <View style={styles.feeBox}>
              <Ionicons name="location-outline" size={16} color={COLORS.primary} />
              <Text style={styles.feeLabel}>رسوم التوصيل {selectedAddress ? `إلى «${addrLabel(selectedAddress)}»` : ''}</Text>
              {needsAddress
                ? <Text style={[styles.feeValue, { fontSize: 13, color: COLORS.gray }]}>اختر عنوان</Text>
                : calculating && summary.deliveryFee === 0 && !summary.freeDelivery
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : summary.deliveryFee === 0
                    ? <Text style={[styles.feeValue, { color: COLORS.green }]}>مجاني 🎉</Text>
                    : <Text style={styles.feeValue}>{money(summary.deliveryFee)}</Text>}
            </View>
          ) : (
            <View style={[styles.feeBox, { backgroundColor: COLORS.successBg }]}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
              <Text style={[styles.feeLabel, { color: COLORS.successText, fontWeight: '700' }]}>ستستلم طلبك من المطعم — بدون رسوم توصيل</Text>
            </View>
          )}
        </View>

        {/* عنوان التوصيل */}
        {deliveryType === 'delivery' && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>📍 عنوان التوصيل</Text>
              {addresses.length > 0 && (
                <TouchableOpacity onPress={() => navigation.navigate('Addresses')}><Text style={styles.linkTxt}>إدارة</Text></TouchableOpacity>
              )}
            </View>
            {addresses.map(addr => {
              const on = String(selectedAddressId) === String(addr.id);
              return (
                <TouchableOpacity key={addr.id} style={[styles.option, on && styles.optionActive]} onPress={() => setSelectedAddressId(addr.id)}
                  accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? COLORS.primary : COLORS.gray} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addrTitle}>{addrLabel(addr)}{addr.is_default ? '  · افتراضي' : ''}</Text>
                    <Text style={styles.addrText} numberOfLines={1}>{addr.address}</Text>
                  </View>
                  <Ionicons name={addrLabel(addr).includes('عمل') ? 'briefcase-outline' : addrLabel(addr).includes('منزل') ? 'home-outline' : 'location-outline'} size={18} color={on ? COLORS.primary : COLORS.gray} />
                </TouchableOpacity>
              );
            })}
            {needsAddress && <Text style={styles.warnTxt}>أضف عنوان التوصيل حتى نقدر نحسب الرسوم ونرسل طلبك</Text>}
            <TouchableOpacity style={styles.addMoreBtn} onPress={() => navigation.navigate('AddAddress')}>
              <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
              <Text style={styles.addMoreTxt}>إضافة عنوان جديد</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* الدفع */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💳 طريقة الدفع</Text>
          {[
            { id: 'cash', label: 'كاش عند الاستلام', icon: 'cash-outline' },
            { id: 'card', label: 'بطاقة ائتمان (دفع آمن)', icon: 'card-outline' },
          ].map(pm => {
            const on = paymentMethod === pm.id;
            return (
              <TouchableOpacity key={pm.id} style={[styles.option, on && styles.optionActive]} onPress={() => setPaymentMethod(pm.id)}
                accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? COLORS.primary : COLORS.gray} />
                <Text style={[styles.payLabel, on && { color: COLORS.primary, fontWeight: '800' }]}>{pm.label}</Text>
                <Ionicons name={pm.icon} size={20} color={on ? COLORS.primary : COLORS.gray} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* خيارات التوصيل (للتوصيل فقط) */}
        {deliveryType === 'delivery' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🛵 خيارات التوصيل</Text>
            <Text style={styles.tipLabel}>بقشيش للسائق (اختياري — يروح كامل للسائق)</Text>
            <View style={styles.chipsRow}>
              {[0, 2, 5, 10].map(v => (
                <TouchableOpacity key={v} onPress={() => setTip(v)} style={[styles.chip, tip === v && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: tip === v }}>
                  <Text style={[styles.chipTxt, tip === v && { color: '#FFF' }]}>{v === 0 ? 'بدون' : `${v}₪`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.checkRow} onPress={() => setLeaveAtDoor(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: leaveAtDoor }}>
              <Ionicons name={leaveAtDoor ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
              <Text style={styles.checkText}>اترك الطلب على الباب 🚪</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ملاحظات */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 ملاحظات للمطعم</Text>
          <TextInput
            style={styles.notesInput}
            placeholder="أي طلبات خاصة..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholderTextColor={COLORS.faint}
            textAlign="right"
            maxLength={300}
          />
        </View>

        {/* النقاط والمحفظة */}
        {(loyaltyPoints >= 100 || walletBalance > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏆 نقاطي ومحفظتي</Text>
            {loyaltyPoints >= 100 && (
              <TouchableOpacity style={styles.checkRow} onPress={() => setUsePoints(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: usePoints }}>
                <Ionicons name={usePoints ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
                <Text style={styles.checkText}>استخدم نقاطي ({loyaltyPoints} نقطة ≈ {(loyaltyPoints * POINT_VALUE).toFixed(1)}₪)</Text>
              </TouchableOpacity>
            )}
            {walletBalance > 0 && (
              <TouchableOpacity style={styles.checkRow} onPress={() => setUseWallet(v => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: useWallet }}>
                <Ionicons name={useWallet ? 'checkbox' : 'square-outline'} size={22} color={COLORS.primary} />
                <Text style={styles.checkText}>ادفع من محفظتي (رصيدك {money(walletBalance)})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* كود الخصم */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎟️ كود الخصم</Text>
          {couponCode ? (
            <View style={[styles.couponApplied, summary.couponError ? { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder } : null]}>
              <Ionicons name={summary.couponError ? 'alert-circle' : 'pricetag'} size={18} color={summary.couponError ? COLORS.red : COLORS.green} />
              <Text style={[styles.couponAppliedTxt, summary.couponError && { color: COLORS.red }]}>
                {couponCode} — {summary.couponError ? summary.couponError : calculating ? 'جاري التحقق…' : `خصم ${money(summary.couponDiscount)}`}
              </Text>
              <TouchableOpacity onPress={removeCoupon} accessibilityLabel="إزالة الكوبون"><Ionicons name="close-circle" size={22} color={COLORS.gray} /></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.couponRow}>
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
              <TouchableOpacity style={[styles.couponBtn, !couponInput.trim() && { opacity: 0.5 }]} onPress={applyCoupon} disabled={!couponInput.trim()}>
                <Text style={styles.couponBtnTxt}>تطبيق</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* الملخص */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>🧮 ملخص الطلب</Text>
            {calculating && <ActivityIndicator size="small" color={COLORS.primary} />}
          </View>
          <SummaryRow label="المجموع الفرعي" value={money(summary.subtotal)} />
          {deliveryType === 'delivery' && (
            <SummaryRow label="رسوم التوصيل" value={needsAddress ? '—' : (summary.deliveryFee === 0 ? 'مجاني' : money(summary.deliveryFee))} green={!needsAddress && summary.deliveryFee === 0} />
          )}
          {summary.firstOrderDiscount > 0 && <SummaryRow label="🎁 خصم أول طلب" value={`-${money(summary.firstOrderDiscount)}`} green />}
          {summary.couponDiscount > 0 && <SummaryRow label="خصم الكوبون" value={`-${money(summary.couponDiscount)}`} green />}
          {summary.pointsValue > 0 && <SummaryRow label="خصم النقاط" value={`-${money(summary.pointsValue)}`} green />}
          {summary.tip > 0 && <SummaryRow label="بقشيش السائق" value={money(summary.tip)} />}
          {summary.walletUsed > 0 && <SummaryRow label="من المحفظة" value={`-${money(summary.walletUsed)}`} green />}
          <View style={styles.divider} />
          <SummaryRow label="الإجمالي" value={money(summary.total)} bold />
          {summary.subtotal > 0 && (
            <Text style={styles.cashbackHint}>💰 بتربح كاش باك ≈ {money(summary.subtotal * 0.02)} لمحفظتك على هالطلب</Text>
          )}
          {!!quoteError && <Text style={styles.warnTxt}>{quoteError}</Text>}
          {summary.source === 'local' && !quoteSupported.current && (
            <Text style={styles.estimateHint}>الأرقام تقديرية — المبلغ النهائي يحدده النظام عند التأكيد</Text>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { bottom: tabInset + 10 }]} pointerEvents="box-none">
        {(belowMin || needsAddress) && (
          <View style={[styles.footerHint, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}>
            <Ionicons name="information-circle" size={16} color={COLORS.primary} />
            <Text style={styles.footerHintTxt}>
              {needsAddress ? 'اختر عنوان التوصيل للمتابعة' : `أضف ${money(summary.minOrder - summary.subtotal)} للوصول للحد الأدنى`}
            </Text>
          </View>
        )}
        <PressableScale style={[styles.orderBtn, !canOrder && { opacity: 0.55 }]} onPress={placeOrder} disabled={!canOrder}
          accessibilityRole="button" accessibilityLabel={`تأكيد الطلب ${money(summary.total)}`}>
          <LinearGradient colors={canOrder ? COLORS.gradients.sunset : [COLORS.gray, COLORS.faint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orderBtnGrad}>
            {placing
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.orderBtnText}>{paymentMethod === 'card' ? 'تأكيد والدفع' : 'تأكيد الطلب'} • {money(summary.total)}</Text>}
          </LinearGradient>
        </PressableScale>
      </View>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, ...C.shadow.float },
  headerBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600', marginTop: 2 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: C.bg },
  emptyIconWrap: { width: 120, height: 120, borderRadius: 40, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: C.text },
  emptySub: { fontSize: 14, color: C.gray, fontWeight: '600', marginTop: -6, textAlign: 'center', paddingHorizontal: 40 },
  shopBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 6, ...C.shadow.float },
  shopBtnGrad: { paddingHorizontal: 30, paddingVertical: 15, borderRadius: 18 },
  shopBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  infoBanner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, margin: 12, marginBottom: 0, borderRadius: 14, padding: 12, borderWidth: 1 },
  infoBannerTxt: { flex: 1, fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'right' },
  card: { backgroundColor: C.card, margin: 12, marginBottom: 0, borderRadius: 20, padding: 16, ...C.shadow.soft },
  cardHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: C.text, marginBottom: 12, textAlign: 'right' },
  linkTxt: { color: C.primary, fontWeight: '800', fontSize: 13, marginBottom: 12 },
  itemRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, gap: 12 },
  qtyControl: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.tint, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.tintBorder },
  qty: { fontSize: 15, fontWeight: '800', color: C.text, minWidth: 22, textAlign: 'center' },
  itemName: { fontSize: 14, fontWeight: '700', color: C.text, textAlign: 'right' },
  itemOptions: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  itemPrice: { fontSize: 13, color: C.primary, fontWeight: '800', marginTop: 3, textAlign: 'right' },
  itemNoteInput: { marginTop: 6, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, color: C.text, backgroundColor: C.inputBg },
  addMoreBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingTop: 10 },
  addMoreTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  progressCard: { margin: 12, marginBottom: 0, borderRadius: 14, padding: 12, borderWidth: 1 },
  progressText: { fontSize: 13, color: C.text, textAlign: 'center', marginBottom: 8 },
  freeDelivDone: { fontSize: 13, color: C.green, fontWeight: '800', textAlign: 'center' },
  progressBar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row-reverse' },
  progressFill: { height: '100%', borderRadius: 4 },
  toggleRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 10 },
  toggleBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg },
  toggleBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  toggleText: { fontSize: 13, fontWeight: '700', color: C.gray },
  feeBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.tint, borderRadius: 10, padding: 10 },
  feeLabel: { flex: 1, fontSize: 13, color: C.text, textAlign: 'right' },
  feeValue: { fontSize: 16, fontWeight: '900', color: C.primary },
  option: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, marginBottom: 8 },
  optionActive: { borderColor: C.primary, backgroundColor: C.tint },
  addrTitle: { fontSize: 13.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  addrText: { fontSize: 12, color: C.gray, marginTop: 1, textAlign: 'right' },
  payLabel: { flex: 1, fontSize: 14, color: C.text, textAlign: 'right' },
  tipLabel: { fontSize: 13, color: C.gray, marginBottom: 8, textAlign: 'right' },
  chipsRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipTxt: { fontSize: 14, fontWeight: '800', color: C.text },
  checkRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 8 },
  checkText: { fontSize: 14, color: C.text, fontWeight: '700', flex: 1, textAlign: 'right' },
  notesInput: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, minHeight: 75, textAlignVertical: 'top', fontSize: 14, color: C.text, backgroundColor: C.inputBg },
  couponRow: { flexDirection: 'row-reverse', gap: 8, alignItems: 'center' },
  couponInput: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: C.text, backgroundColor: C.inputBg, letterSpacing: 1 },
  couponBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 78 },
  couponBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  couponApplied: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.successBg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.successBorder },
  couponAppliedTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: C.successText, textAlign: 'right' },
  summaryRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: C.gray },
  summaryVal: { fontSize: 14, fontWeight: '700', color: C.text },
  totalLabel: { fontWeight: '900', fontSize: 16, color: C.text },
  totalVal: { fontWeight: '900', fontSize: 18, color: C.primary },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 6 },
  cashbackHint: { fontSize: 12, color: C.primary, fontWeight: '700', marginTop: 4, textAlign: 'right' },
  estimateHint: { fontSize: 11.5, color: C.faint, fontWeight: '600', marginTop: 6, textAlign: 'right' },
  warnTxt: { fontSize: 12.5, color: C.red, fontWeight: '700', marginTop: 6, textAlign: 'right' },
  footer: { position: 'absolute', left: 16, right: 16, zIndex: 30 },
  footerHint: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, ...C.shadow.soft },
  footerHintTxt: { fontSize: 12.5, color: C.text, fontWeight: '700' },
  orderBtn: { borderRadius: 20, overflow: 'hidden', elevation: 12, shadowColor: C.primary, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 } },
  orderBtnGrad: { padding: 18, alignItems: 'center', borderRadius: 20 },
  orderBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16, letterSpacing: 0.3 },
});
