import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Linking, Alert, ScrollView, RefreshControl, Animated, Easing } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import GradientHeader from '../components/GradientHeader';
import OrderMoney, { CashBadge } from '../components/OrderMoney';
import StatusBadge from '../components/StatusBadge';
import { Skeleton, SkeletonCard, FadeIn, PopIn, Pulse, Press, GradientButton, EmptyState, Burst, isReducedMotion } from '../components/Anim';
import api from '../utils/api';
import { useSocketEvent } from '../utils/socket';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { useDriverLocation } from '../context/LocationContext';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { SERVER_URL } from '../config';
import {
  isPersonal, isRide, isAccepted, pickupPoint, orderNo, orderTitle, money, cashToCollect,
  driverFee, tipOf, num,
} from '../utils/format';

const POLL_MS = 15000;

function getSteps(o) {
  const p = isPersonal(o);
  const ride = isRide(o);
  let pickupDesc;
  if (p) pickupDesc = 'توجّه إلى نقطة الاستلام';
  else if (o?.status === 'ready') pickupDesc = 'الطلب جاهز — توجّه للمطعم واستلمه';
  else if (o?.status === 'preparing') pickupDesc = 'المطعم يحضّر الطلب — توجّه إليه';
  else pickupDesc = 'توجّه إلى المطعم لاستلام الطلب';
  return [
    {
      next: 'on_the_way', icon: p ? 'flag' : 'storefront',
      label: p ? 'التوجّه لنقطة الاستلام' : 'التوجّه للمطعم',
      desc: pickupDesc,
      button: p ? (ride ? 'ركب الراكب — ابدأ الرحلة' : 'استلمت الطرد') : 'استلمت الطلب من المطعم',
    },
    {
      next: 'delivered', icon: 'bicycle',
      label: p ? 'في الطريق لنقطة التسليم' : 'في الطريق للزبون',
      desc: p ? 'توجّه إلى نقطة التسليم' : 'توجّه إلى موقع الزبون',
      button: p ? (ride ? 'وصلنا الوجهة' : 'تم تسليم الطرد') : 'تم التوصيل للزبون',
    },
    { next: null, icon: 'checkmark-done', label: p ? 'تم التسليم' : 'تم التوصيل', desc: 'اكتمل الطلب بنجاح', button: null },
  ];
}

const stepIndex = (status) => (status === 'on_the_way' ? 1 : status === 'delivered' ? 2 : 0);

function buildDriverMapHTML({ restLat, restLng, custLat, custLng, driverLat, driverLng, pickupText, pickupEmoji, dropText }) {
  const cLat = driverLat || restLat || custLat || 31.9;
  const cLng = driverLng || restLng || custLng || 35.2;
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" onerror="this.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>if(!window.L){document.write('<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\\/script>');}</script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#EDE7E1}
  .leaflet-control-zoom a{font-size:18px!important;width:36px!important;height:36px!important;line-height:36px!important}
  #err{display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-family:sans-serif;color:#6B7280;font-size:14px;text-align:center;padding:20px;direction:rtl}
</style>
</head>
<body>
<div id="map"></div>
<div id="err">تعذّر تحميل الخريطة — استخدم زر الملاحة</div>
<script>
if(!window.L){ document.getElementById('err').style.display='flex'; }
else {
var map = L.map('map',{center:[${cLat},${cLng}],zoom:14,zoomControl:true,tap:true});
map.zoomControl.setPosition('topleft');
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
function mkIcon(emoji,size,bg){
  return L.divIcon({
    html:'<div style="width:'+size+'px;height:'+size+'px;background:'+(bg||'#fff')+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+(size*0.55)+'px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35)">'+emoji+'</div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2)],className:''
  });
}
var pts=[],driverMarker=null,curPos=null,animFrame=null,startPos=null,endPos=null,animStart=0,ANIM_MS=4800,followDriver=true;
${restLat && restLng ? `
L.marker([${restLat},${restLng}],{icon:mkIcon('${pickupEmoji}',40,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">${pickupEmoji} ${pickupText}</div>');
pts.push([${restLat},${restLng}]);` : ''}
${custLat && custLng ? `
L.marker([${custLat},${custLng}],{icon:mkIcon('📍',40,'#FF3B30')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">📍 ${dropText}</div>');
pts.push([${custLat},${custLng}]);` : ''}
${driverLat && driverLng ? `
driverMarker=L.marker([${driverLat},${driverLng}],{icon:mkIcon('🛵',46,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 موقعك الحالي</div>');
curPos=[${driverLat},${driverLng}];pts.push(curPos);` : ''}
${restLat && custLat ? `
L.polyline([[${restLat},${restLng}],[${custLat},${custLng}]],{color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.7}).addTo(map);` : ''}
if(pts.length===1){map.setView(pts[0],15);} else if(pts.length>1){map.fitBounds(pts,{padding:[50,50]});}
map.on('dragstart',function(){followDriver=false;});
function animStep(){
  var t=(Date.now()-animStart)/ANIM_MS; if(t>1)t=1;
  curPos=[startPos[0]+(endPos[0]-startPos[0])*t,startPos[1]+(endPos[1]-startPos[1])*t];
  driverMarker.setLatLng(curPos);
  if(followDriver) map.panTo(curPos,{animate:false});
  if(t<1){animFrame=requestAnimationFrame(animStep);}
}
function moveDriver(lat,lng){
  if(isNaN(lat)||isNaN(lng)) return;
  var ll=[lat,lng];
  if(!driverMarker){
    driverMarker=L.marker(ll,{icon:mkIcon('🛵',46,'#FF6B00')}).addTo(map).bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 موقعك الحالي</div>');
    curPos=ll; if(followDriver) map.setView(ll,16,{animate:true}); return;
  }
  startPos=curPos?[curPos[0],curPos[1]]:ll; endPos=ll; animStart=Date.now();
  if(animFrame) cancelAnimationFrame(animFrame);
  animStep();
}
function handleMsg(e){
  try{
    var d=JSON.parse(e.data||e);
    if(d.type==='driver_location'){moveDriver(parseFloat(d.lat),parseFloat(d.lng));}
    else if(d.type==='recenter'){followDriver=true; if(curPos) map.setView(curPos,16,{animate:true}); else if(pts.length) map.fitBounds(pts,{padding:[50,50]});}
  }catch(err){}
}
window.addEventListener('message',handleMsg);
document.addEventListener('message',function(e){handleMsg(e.data);});
}
</script>
</body>
</html>`;
}

export default function DeliveryScreen({ route, navigation }) {
  const { orderId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { setActive, notifyCancelled } = useDriver();
  const { coords } = useDriverLocation();
  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const webViewRef = useRef(null);
  const updatingRef = useRef(false);
  const mounted = useRef(true);
  const leftRef = useRef(false);

  useEffect(() => () => { mounted.current = false; }, []);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate('Main');
  }, [navigation]);

  const loadOrder = useCallback(async () => {
    if (!orderId) return null;
    try {
      const r = await api.get(`/orders/${orderId}`);
      const o = r?.data || null;
      if (!mounted.current || !o) return o;
      setLoadError(false);
      setOrder(o);
      if (o.status === 'cancelled') {
        notifyCancelled(o.id);
        if (navigation.isFocused()) leave(); // احتياط إن كان التنبيه ظهر سابقاً
        return o;
      }
      if (o.driver_id && user?.id && String(o.driver_id) !== String(user.id)) {
        Alert.alert('الطلب غير متاح', 'لم يعد هذا الطلب مُسنداً إليك.');
        setActive(null);
        leave();
        return o;
      }
      if (isAccepted(o)) setActive(o);
      return o;
    } catch (e) {
      if (mounted.current) setLoadError(true);
      if (e?.status === 403 || e?.status === 404) {
        Alert.alert('الطلب غير متاح', e?.message || 'لم يعد بإمكانك عرض هذا الطلب.');
        setActive(null);
        leave();
      }
      return null;
    }
  }, [orderId, user?.id, notifyCancelled, setActive, leave, navigation]);

  // تحديث عند التركيز + كل ١٥ ثانية (احتياط إن فات حدث السوكِت)
  useFocusEffect(useCallback(() => {
    loadOrder();
    const t = setInterval(loadOrder, POLL_MS);
    return () => clearInterval(t);
  }, [loadOrder]));

  useSocketEvent('order_status', (d) => {
    if (String(d?.order_id) !== String(orderId)) return;
    if (d.status) setOrder(o => (o ? { ...o, status: d.status } : o));
    loadOrder();
  });
  useSocketEvent('order_updated', (d) => { if (!d || String(d.order_id) === String(orderId)) loadOrder(); });
  useSocketEvent('__reconnected', () => loadOrder());

  // موقع السائق من مسار الموقع الموحّد → الخريطة
  useEffect(() => {
    if (!coords || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'driver_location', lat: coords.lat, lng: coords.lng }));
  }, [coords]);

  const personal = isPersonal(order);
  const steps = getSteps(order);
  const current = stepIndex(order?.status);
  const step = steps[current];
  const pick = pickupPoint(order);
  const dropLat = num(order?.delivery_lat) || null;
  const dropLng = num(order?.delivery_lng) || null;
  const cash = cashToCollect(order);

  const initialCoords = useRef(null);
  if (!initialCoords.current && coords) initialCoords.current = coords;
  const mapHtml = useMemo(() => buildDriverMapHTML({
    restLat: pick.lat, restLng: pick.lng, custLat: dropLat, custLng: dropLng,
    driverLat: initialCoords.current?.lat, driverLng: initialCoords.current?.lng,
    pickupText: personal ? 'نقطة الاستلام' : 'المطعم',
    pickupEmoji: personal ? '🟢' : '🏪',
    dropText: personal ? 'نقطة التسليم' : 'موقع الزبون',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pick.lat, pick.lng, dropLat, dropLng, personal]);

  const doAdvance = async (next) => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    try {
      await api.patch(`/orders/${order.id}/status`, { status: next });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (next === 'delivered') {
        setOrder(o => ({ ...o, status: 'delivered' }));
        setActive(null);
        setCelebrate(true);
        const earned = driverFee(order) + tipOf(order);
        Alert.alert('رائع! 🎉', `${personal ? 'تم إكمال الطلب' : 'تم إكمال التوصيل'} بنجاح\nأُضيف أجرك ${money(earned)} لمحفظتك`, [
          { text: 'حسناً', onPress: leave },
        ], { cancelable: false });
      } else {
        setOrder(o => ({ ...o, status: next }));
        await loadOrder();
      }
    } catch (e) {
      Alert.alert('تعذّر التحديث', e?.message || 'حاول مرة أخرى');
      loadOrder();
    } finally {
      updatingRef.current = false;
      if (mounted.current) setUpdating(false);
    }
  };

  const onStepPress = () => {
    if (!order || !step?.next || updatingRef.current) return;
    if (order.status === 'cancelled') { notifyCancelled(order.id); return; }
    if (step.next === 'on_the_way' && !personal && order.status !== 'ready') {
      Alert.alert('الطلب لسا قيد التحضير', 'المطعم لم يعلن أن الطلب جاهز بعد. متأكد إنك استلمته؟', [
        { text: 'لا', style: 'cancel' },
        { text: 'نعم، استلمته', onPress: () => doAdvance('on_the_way') },
      ]);
      return;
    }
    if (step.next === 'delivered' && cash > 0) {
      Alert.alert('تأكيد التحصيل', `هل استلمت ${money(cash)} من الزبون؟`, [
        { text: 'ليس بعد', style: 'cancel' },
        { text: 'نعم، استلمت', onPress: () => doAdvance('delivered') },
      ]);
      return;
    }
    doAdvance(step.next);
  };

  const openMaps = (lat, lng) => {
    if (!lat || !lng) return Alert.alert('الموقع غير متوفر', 'لا توجد إحداثيات لهذه النقطة');
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`)
      .catch(() => Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}`).catch(() => {}));
  };
  const callNumber = (phone) => {
    if (!phone) return Alert.alert('غير متوفر', 'رقم الهاتف غير متوفر');
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const target = current === 0 ? pick : { lat: dropLat, lng: dropLng };
  const onRefresh = async () => { setRefreshing(true); await loadOrder(); setRefreshing(false); };

  const earnedTotal = order ? driverFee(order) + tipOf(order) : 0;

  return (
    <View style={styles.container}>
      <GradientHeader
        title={order ? `${personal ? 'طلب' : 'توصيل'} #${orderNo(order)}` : 'تفاصيل التوصيل'}
        subtitle={order ? orderTitle(order) : undefined}
        rightIcon={order ? 'refresh' : undefined}
        onRightPress={onRefresh}
        rightLabel="تحديث الطلب"
      />

      {/* الخريطة */}
      <View style={[styles.mapShell, SHADOW.card]}>
        <View style={styles.mapWrap}>
          {order ? (
            <WebView
              ref={webViewRef}
              source={{ html: mapHtml, baseUrl: SERVER_URL }}
              style={styles.map}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={['*']}
              mixedContentMode="always"
              onMessage={() => {}}
              onLoadEnd={() => {
                if (coords) webViewRef.current?.postMessage(JSON.stringify({ type: 'driver_location', lat: coords.lat, lng: coords.lng }));
              }}
            />
          ) : <Skeleton height="100%" radius={0} />}
          <LinearGradient colors={['rgba(20,20,43,0.28)', 'rgba(20,20,43,0)']} style={styles.mapScrim} pointerEvents="none" />
          {current === 1 && (
            <View style={styles.liveBadge} accessibilityLabel="تتبّع مباشر">
              <Pulse to={1.6} duration={700}><View style={styles.liveDot} /></Pulse>
              <Text style={styles.liveText}>مباشر</Text>
            </View>
          )}
          <Press style={styles.recenterBtn} onPress={() => webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }))} accessibilityLabel="توسيط الخريطة على موقعي">
            <Ionicons name="locate" size={21} color={COLORS.primary} />
          </Press>
          {order && current < 2 && (
            <Press style={[styles.navBtn, SHADOW.float]} onPress={() => openMaps(target.lat, target.lng)} hapticStyle="medium"
              accessibilityLabel={current === 0 ? 'ملاحة إلى نقطة الاستلام' : 'ملاحة إلى نقطة التسليم'}>
              <LinearGradient colors={GRADIENTS.sunset} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.navBtnGrad}>
                <Ionicons name="navigate" size={17} color="#FFF" />
                <Text style={styles.navBtnText}>{current === 0 ? (personal ? 'ملاحة لنقطة الاستلام' : 'ملاحة للمطعم') : (personal ? 'ملاحة لنقطة التسليم' : 'ملاحة للزبون')}</Text>
              </LinearGradient>
            </Press>
          )}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}>
        {!order ? (
          loadError ? (
            <EmptyState icon="cloud-offline-outline" tone="red" title="تعذّر تحميل الطلب" text="تحقّق من الاتصال بالإنترنت ثم أعد المحاولة" actionLabel="إعادة المحاولة" actionIcon="refresh" onAction={loadOrder} />
          ) : (<><SkeletonCard lines={2} /><SkeletonCard lines={4} /><SkeletonCard lines={3} /></>)
        ) : (
          <>
            {/* مبلغ التحصيل — أول ما تراه العين */}
            {current < 2 && (
              <FadeIn>
                <CashBadge order={order} />
              </FadeIn>
            )}

            {/* جاهزية المطعم */}
            {!personal && current === 0 && (
              <FadeIn key={order.status}>
                {order.status === 'ready' ? (
                  <View style={[styles.banner, { backgroundColor: COLORS.greenSoft, borderColor: COLORS.greenLine }]}>
                    <View style={[styles.bannerIcon, { backgroundColor: COLORS.green }]}><Ionicons name="bag-check" size={18} color="#FFF" /></View>
                    <Text style={[styles.bannerText, { color: COLORS.greenDeep }, RTL.text]}>المطعم جاهز — الطلب بانتظارك</Text>
                  </View>
                ) : (
                  <View style={[styles.banner, { backgroundColor: COLORS.amberSoft, borderColor: '#FFE3A3' }]}>
                    <Pulse to={1.1}><View style={[styles.bannerIcon, { backgroundColor: COLORS.amber }]}><Ionicons name="flame" size={18} color="#FFF" /></View></Pulse>
                    <Text style={[styles.bannerText, { color: COLORS.text }, RTL.text]}>المطعم ما زال يحضّر الطلب</Text>
                  </View>
                )}
              </FadeIn>
            )}

            {/* التقدّم */}
            <FadeIn delay={60}>
              <View style={[styles.card, SHADOW.soft]}>
                <View style={[RTL.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
                  <Text style={styles.cardTitle}>تقدّم {personal ? 'الطلب' : 'التوصيل'}</Text>
                  <StatusBadge status={order.status} size="lg" />
                </View>
                {steps.map((s, i) => (
                  <StepRow key={i} step={s} index={i} current={current} last={i === steps.length - 1} />
                ))}
              </View>
            </FadeIn>

            {/* المال */}
            <FadeIn delay={120}>
              <View style={[styles.card, SHADOW.soft]}>
                <Text style={[styles.cardTitle, RTL.text, { marginBottom: 12 }]}>الحساب</Text>
                <OrderMoney order={order} showCash={current === 2} />
              </View>
            </FadeIn>

            {/* التفاصيل */}
            <FadeIn delay={180}>
              <View style={[styles.card, SHADOW.soft, { paddingVertical: 6 }]}>
                {personal ? (
                  <>
                    <InfoRow icon={isRide(order) ? 'people-outline' : 'cube-outline'} label="نوع الطلب"
                      value={isRide(order) ? `توصيل راكب (${order.passengers || 1})` : 'توصيل طرد'} />
                    <InfoRow icon="person-outline" label="صاحب الطلب" value={order.customer_name || '-'} />
                    <InfoRow icon="flag" iconColor={COLORS.green} label="نقطة الاستلام" value={order.pickup_address || 'محدّدة على الخريطة'} />
                    {!isRide(order) && (order.parcel_desc || order.recipient_name || order.recipient_phone) ? (
                      <InfoRow icon="reader-outline" label="تفاصيل الطرد"
                        value={[order.parcel_desc, order.recipient_name, order.recipient_phone].filter(Boolean).join(' · ')} />
                    ) : null}
                  </>
                ) : (
                  <>
                    <InfoRow icon="restaurant-outline" label="المطعم" value={order.restaurant_name || '-'} />
                    <InfoRow icon="person-outline" label="الزبون" value={order.customer_name || '-'} />
                  </>
                )}
                <InfoRow icon="location" iconColor={COLORS.red} label={personal ? 'نقطة التسليم' : 'عنوان الزبون'} value={order.delivery_address || '-'} last />
              </View>
            </FadeIn>

            {/* اتصال */}
            <FadeIn delay={240}>
              <View style={styles.actionsRow}>
                <ActionBtn icon="call" tone="green" label={personal ? 'اتصل بصاحب الطلب' : 'اتصل بالزبون'} onPress={() => callNumber(order.customer_phone)} />
                {personal
                  ? (!isRide(order) && order.recipient_phone ? <ActionBtn icon="call-outline" tone="blue" label="اتصل بالمستلِم" onPress={() => callNumber(order.recipient_phone)} /> : null)
                  : <ActionBtn icon="restaurant" tone="brand" label="اتصل بالمطعم" onPress={() => callNumber(order.restaurant_phone)} />}
              </View>
            </FadeIn>
          </>
        )}
      </ScrollView>

      {order && step?.button && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
          {cash > 0 && current === 1 && (
            <View style={[RTL.row, styles.footerCash]}>
              <Ionicons name="cash" size={16} color={COLORS.amberDeep} />
              <Text style={[styles.footerCashText, RTL.text]}>حصّل {money(cash)} من الزبون قبل التأكيد</Text>
            </View>
          )}
          <GradientButton
            label={step.button}
            icon="checkmark-circle"
            onPress={onStepPress}
            loading={updating}
            loadingLabel="جاري التحديث..."
            colors={current === 1 ? GRADIENTS.green : GRADIENTS.sunset}
            shadow={current === 1 ? SHADOW.green : SHADOW.float}
            height={62}
            hapticStyle="medium"
          />
        </View>
      )}

      {order && current === 2 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
          <PopIn>
            <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.doneBox}>
              <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.doneSheen} pointerEvents="none" />
              <View style={styles.doneIcon}><Ionicons name="checkmark-done" size={26} color={COLORS.green} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.doneText, RTL.text]}>{personal ? 'اكتمل الطلب بنجاح!' : 'تم التوصيل بنجاح!'}</Text>
                <Text style={[styles.doneSubText, RTL.text]}>أُضيف {money(earnedTotal)} لمحفظتك</Text>
              </View>
            </LinearGradient>
          </PopIn>
        </View>
      )}

      <Burst play={celebrate} />
    </View>
  );
}

// خطوة في خط التقدّم: دائرة + خط واصل يمتلئ بحركة عند الإنجاز
function StepRow({ step, index, current, last }) {
  const done = index < current;
  const active = index === current;
  const final = active && last; // اكتمل الطلب
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRail}>
        {active && !final ? (
          <Pulse to={1.08}>
            <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.stepCircle, SHADOW.glow]}>
              <Ionicons name={step.icon} size={19} color="#FFF" />
            </LinearGradient>
          </Pulse>
        ) : (
          <View style={[styles.stepCircle, (done || final) ? styles.stepDone : styles.stepTodo]}>
            <Ionicons name={(done || final) ? 'checkmark' : step.icon} size={(done || final) ? 20 : 18} color={(done || final) ? '#FFF' : COLORS.faint} />
          </View>
        )}
        {!last && <Connector filled={done} delay={index * 120} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 18, paddingTop: 2 }}>
        <Text style={[styles.stepLabel, RTL.text, active && { color: final ? COLORS.greenDeep : COLORS.text, fontWeight: '900' }, done && { color: COLORS.sub }]}>{step.label}</Text>
        {active && <Text style={[styles.stepDesc, RTL.text, final && { color: COLORS.greenDeep }]}>{step.desc}</Text>}
        {done && <Text style={[styles.stepDoneText, RTL.text]}>تم ✓</Text>}
      </View>
    </View>
  );
}

function Connector({ filled, delay }) {
  const [h, setH] = useState(0);
  const v = useRef(new Animated.Value(filled ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion()) { v.setValue(filled ? 1 : 0); return; }
    Animated.timing(v, { toValue: filled ? 1 : 0, duration: 520, delay, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
  }, [filled, v, delay]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-h, 0] });
  return (
    <View style={styles.connector} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.green, transform: [{ translateY }] }]} />
    </View>
  );
}

function InfoRow({ icon, iconColor, label, value, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={17} color={iconColor || COLORS.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, RTL.text]}>{label}</Text>
        <Text style={[styles.infoValue, RTL.text]}>{value}</Text>
      </View>
    </View>
  );
}

const TONES = {
  green: { bg: COLORS.greenSoft, c: COLORS.greenDeep },
  blue: { bg: COLORS.blueSoft, c: COLORS.blue },
  brand: { bg: COLORS.sec, c: COLORS.primary },
};
function ActionBtn({ icon, label, onPress, tone = 'brand' }) {
  const t = TONES[tone] || TONES.brand;
  return (
    <Press style={[styles.actionBtn, SHADOW.soft]} onPress={onPress} hapticStyle="medium" accessibilityLabel={label}>
      <View style={[styles.actionIcon, { backgroundColor: t.bg }]}><Ionicons name={icon} size={21} color={t.c} /></View>
      <Text style={styles.actionLabel} numberOfLines={2}>{label}</Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapShell: { height: 250, marginTop: 12, marginHorizontal: 14, borderRadius: RADIUS.lg, backgroundColor: COLORS.card },
  mapWrap: { flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.skeleton, borderWidth: 1, borderColor: COLORS.line },
  map: { flex: 1 },
  mapScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 56 },
  liveBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: COLORS.red, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 5, zIndex: 10, ...SHADOW.soft },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  recenterBtn: { position: 'absolute', top: 10, left: 56, width: 46, height: 46, backgroundColor: '#FFF', borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', zIndex: 10, ...SHADOW.card },
  navBtn: { position: 'absolute', bottom: 12, right: 12, borderRadius: RADIUS.pill, zIndex: 10, backgroundColor: COLORS.primary },
  navBtnGrad: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 16, borderRadius: RADIUS.pill },
  navBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13.5 },
  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: RADIUS.md, padding: 12, borderWidth: 1 },
  bannerIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bannerText: { flex: 1, fontWeight: '800', fontSize: 14.5 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'stretch', gap: 12 },
  stepRail: { width: 42, alignItems: 'center' },
  stepCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  stepTodo: { backgroundColor: COLORS.inputBg, borderWidth: 1.5, borderColor: COLORS.line },
  stepDone: { backgroundColor: COLORS.green },
  connector: { flex: 1, width: 3, minHeight: 16, borderRadius: 2, backgroundColor: COLORS.line, overflow: 'hidden', marginVertical: 3 },
  stepLabel: { fontSize: 15, fontWeight: '700', color: COLORS.gray },
  stepDesc: { fontSize: 13, color: COLORS.primary, marginTop: 3, fontWeight: '700', lineHeight: 19 },
  stepDoneText: { fontSize: 12, color: COLORS.greenDeep, marginTop: 2, fontWeight: '700' },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  infoIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 12, color: COLORS.gray, marginBottom: 2, fontWeight: '500' },
  infoValue: { fontSize: 14.5, fontWeight: '800', color: COLORS.text, lineHeight: 21 },
  actionsRow: { flexDirection: 'row-reverse', gap: 10 },
  actionBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, alignItems: 'center', gap: 8, minHeight: 96, justifyContent: 'center' },
  actionIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 13, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, ...SHADOW.card },
  footerCash: { gap: 6, alignSelf: 'stretch', backgroundColor: COLORS.amberSoft, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  footerCashText: { flex: 1, color: COLORS.amberDeep, fontWeight: '800', fontSize: 13.5 },
  doneBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderRadius: RADIUS.md + 2, padding: 16, overflow: 'hidden' },
  doneSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  doneIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  doneSubText: { fontSize: 13.5, color: 'rgba(255,255,255,0.95)', marginTop: 3, fontWeight: '700' },
});
