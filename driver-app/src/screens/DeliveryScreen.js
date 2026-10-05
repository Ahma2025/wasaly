import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import GradientHeader from '../components/GradientHeader';
import OrderMoney from '../components/OrderMoney';
import StatusBadge from '../components/StatusBadge';
import { Skeleton, SkeletonCard } from '../components/Anim';
import api from '../utils/api';
import { useSocketEvent } from '../utils/socket';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { useDriverLocation } from '../context/LocationContext';
import { COLORS, GRADIENTS, SHADOW, RTL } from '../theme';
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
      next: 'on_the_way', icon: '🏍️',
      label: p ? 'التوجّه لنقطة الاستلام' : 'التوجّه للمطعم',
      desc: pickupDesc,
      button: p ? (ride ? 'ركب الراكب — ابدأ الرحلة' : 'استلمت الطرد') : 'استلمت الطلب من المطعم',
    },
    {
      next: 'delivered', icon: '📦',
      label: p ? 'في الطريق لنقطة التسليم' : 'في الطريق للزبون',
      desc: p ? 'توجّه إلى نقطة التسليم' : 'توجّه إلى موقع الزبون',
      button: p ? (ride ? 'وصلنا الوجهة' : 'تم تسليم الطرد') : 'تم التوصيل للزبون',
    },
    { next: null, icon: '✅', label: p ? 'تم التسليم' : 'تم التوصيل', desc: 'اكتمل الطلب بنجاح', button: null },
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

  return (
    <View style={styles.container}>
      <GradientHeader
        title={order ? `${personal ? 'طلب' : 'توصيل'} #${orderNo(order)}` : 'تفاصيل التوصيل'}
        subtitle={order ? orderTitle(order) : undefined}
        right={order ? <Ionicons name="refresh" size={20} color="#FFF" onPress={onRefresh} /> : null}
      />

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
        {current === 1 && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>مباشر</Text>
          </View>
        )}
        <TouchableOpacity style={styles.recenterBtn} onPress={() => webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }))}>
          <Ionicons name="locate" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        {order && current < 2 && (
          <TouchableOpacity style={styles.navBtn} onPress={() => openMaps(target.lat, target.lng)} activeOpacity={0.9}>
            <Ionicons name="navigate" size={16} color="#FFF" />
            <Text style={styles.navBtnText}>{current === 0 ? (personal ? 'ملاحة لنقطة الاستلام' : 'ملاحة للمطعم') : (personal ? 'ملاحة لنقطة التسليم' : 'ملاحة للزبون')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}>
        {!order ? (
          loadError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>تعذّر تحميل الطلب</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadOrder}><Text style={styles.retryText}>إعادة المحاولة</Text></TouchableOpacity>
            </View>
          ) : (<><SkeletonCard lines={4} /><SkeletonCard lines={3} /></>)
        ) : (
          <>
            {/* جاهزية المطعم */}
            {!personal && current === 0 && (order.status === 'ready' ? (
              <View style={[styles.banner, { backgroundColor: COLORS.greenSoft }]}>
                <Ionicons name="checkmark-done-circle" size={22} color={COLORS.greenDeep} />
                <Text style={[styles.bannerText, { color: COLORS.greenDeep }, RTL.text]}>المطعم جاهز — الطلب بانتظارك</Text>
              </View>
            ) : (
              <View style={[styles.banner, { backgroundColor: COLORS.amberSoft }]}>
                <Ionicons name="time" size={22} color={COLORS.amber} />
                <Text style={[styles.bannerText, { color: COLORS.text }, RTL.text]}>المطعم ما زال يحضّر الطلب</Text>
              </View>
            ))}

            {/* التقدّم */}
            <View style={[styles.card, SHADOW.soft]}>
              <View style={[RTL.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                <Text style={styles.cardTitle}>تقدّم {personal ? 'الطلب' : 'التوصيل'}</Text>
                <StatusBadge status={order.status} />
              </View>
              {steps.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepCircle, i < current && styles.stepDone, i === current && styles.stepActive]}>
                    <Text style={{ fontSize: 16 }}>{i < current ? '✅' : s.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepLabel, RTL.text, i === current && { color: COLORS.primary, fontWeight: '900' }]}>{s.label}</Text>
                    {i === current && <Text style={[styles.stepDesc, RTL.text]}>{s.desc}</Text>}
                  </View>
                </View>
              ))}
            </View>

            {/* المال */}
            <View style={[styles.card, SHADOW.soft]}>
              <Text style={[styles.cardTitle, RTL.text, { marginBottom: 10 }]}>الحساب</Text>
              <OrderMoney order={order} />
            </View>

            {/* التفاصيل */}
            <View style={[styles.card, SHADOW.soft]}>
              {personal ? (
                <>
                  <InfoRow icon={isRide(order) ? 'people-outline' : 'cube-outline'} label="نوع الطلب"
                    value={isRide(order) ? `توصيل راكب (${order.passengers || 1})` : 'توصيل طرد'} />
                  <InfoRow icon="person-outline" label="صاحب الطلب" value={order.customer_name || '-'} />
                  <InfoRow icon="ellipse" iconColor={COLORS.green} label="نقطة الاستلام" value={order.pickup_address || 'محدّدة على الخريطة'} />
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
              <InfoRow icon="location-outline" iconColor={COLORS.red} label={personal ? 'نقطة التسليم' : 'عنوان الزبون'} value={order.delivery_address || '-'} last />
            </View>

            {/* اتصال */}
            <View style={styles.actionsRow}>
              <ActionBtn icon="call" label={personal ? 'اتصل بصاحب الطلب' : 'اتصل بالزبون'} onPress={() => callNumber(order.customer_phone)} />
              {personal
                ? (!isRide(order) && order.recipient_phone ? <ActionBtn icon="call-outline" label="اتصل بالمستلِم" onPress={() => callNumber(order.recipient_phone)} /> : null)
                : <ActionBtn icon="restaurant" label="اتصل بالمطعم" onPress={() => callNumber(order.restaurant_phone)} />}
            </View>
          </>
        )}
      </ScrollView>

      {order && step?.button && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
          {cash > 0 && current === 1 && (
            <Text style={[styles.footerCash, RTL.text]}>💵 حصّل {money(cash)} من الزبون قبل التأكيد</Text>
          )}
          <TouchableOpacity onPress={onStepPress} disabled={updating} activeOpacity={0.9} style={[styles.nextWrap, updating && { opacity: 0.7 }]}>
            <LinearGradient colors={current === 1 ? GRADIENTS.green : GRADIENTS.sunset} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.nextBtn}>
              {updating ? <ActivityIndicator color="#FFF" /> : <Ionicons name="checkmark-circle" size={22} color="#FFF" />}
              <Text style={styles.nextBtnText}>{updating ? 'جاري التحديث...' : step.button}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {order && current === 2 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) + 12 }]}>
          <View style={styles.doneBox}>
            <Text style={styles.doneText}>✅ {personal ? 'اكتمل الطلب بنجاح!' : 'تم التوصيل بنجاح!'}</Text>
            <Text style={styles.doneSubText}>أُضيف {money(driverFee(order) + tipOf(order))} لمحفظتك</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function InfoRow({ icon, iconColor, label, value, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}><Ionicons name={icon} size={icon === 'ellipse' ? 12 : 18} color={iconColor || COLORS.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, RTL.text]}>{label}</Text>
        <Text style={[styles.infoValue, RTL.text]}>{value}</Text>
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={[styles.actionBtn, SHADOW.soft]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.actionIcon}><Ionicons name={icon} size={20} color={COLORS.primary} /></View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapWrap: { height: 250, marginTop: 10, marginHorizontal: 14, borderRadius: 22, overflow: 'hidden', backgroundColor: COLORS.skeleton },
  map: { flex: 1 },
  liveBadge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: COLORS.red, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11 },
  recenterBtn: { position: 'absolute', top: 10, left: 56, backgroundColor: '#FFF', borderRadius: 12, padding: 9, zIndex: 10, ...SHADOW.soft },
  navBtn: { position: 'absolute', bottom: 12, right: 10, backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, zIndex: 10, ...SHADOW.float },
  navBtnText: { color: '#FFF', fontWeight: '800', fontSize: 12.5 },
  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: 16, padding: 14 },
  bannerText: { flex: 1, fontWeight: '800', fontSize: 14 },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stepCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: COLORS.sec, borderWidth: 2, borderColor: COLORS.primary },
  stepDone: { backgroundColor: COLORS.greenSoft },
  stepLabel: { fontSize: 14, fontWeight: '700', color: COLORS.gray },
  stepDesc: { fontSize: 12, color: COLORS.primary, marginTop: 2, fontWeight: '600' },
  infoRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  infoIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11.5, color: COLORS.gray, marginBottom: 2, fontWeight: '600' },
  infoValue: { fontSize: 14, fontWeight: '800', color: COLORS.text, lineHeight: 20 },
  actionsRow: { flexDirection: 'row-reverse', gap: 10 },
  actionBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 14, alignItems: 'center', gap: 6 },
  actionIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  footerCash: { color: COLORS.amber, fontWeight: '800', fontSize: 13, marginBottom: 8 },
  nextWrap: { borderRadius: 18, overflow: 'hidden', ...SHADOW.float },
  nextBtn: { borderRadius: 18, paddingVertical: 17, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nextBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  doneBox: { backgroundColor: COLORS.greenSoft, borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#C3F0D6' },
  doneText: { fontSize: 18, fontWeight: '900', color: COLORS.greenDeep },
  doneSubText: { fontSize: 13, color: COLORS.greenDeep, marginTop: 4, fontWeight: '600' },
  errorBox: { backgroundColor: COLORS.redSoft, borderRadius: 16, padding: 18, alignItems: 'center' },
  errorText: { color: COLORS.red, fontWeight: '800', marginBottom: 10 },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 9 },
  retryText: { color: '#FFF', fontWeight: '800' },
});
