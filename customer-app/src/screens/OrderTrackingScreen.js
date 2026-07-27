import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Animated, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';

import { useTheme } from '../context/ThemeContext';

const STATUS_STEPS = [
  { key: 'pending',    label: 'في الانتظار',  icon: 'time-outline',             desc: 'طلبك وصل للمطعم' },
  { key: 'confirmed',  label: 'تم القبول',    icon: 'checkmark-circle-outline',  desc: 'المطعم قبل طلبك' },
  { key: 'preparing',  label: 'يُحضَّر',       icon: 'flame-outline',             desc: 'يتم تحضير طعامك' },
  { key: 'ready',      label: 'جاهز',         icon: 'bag-check-outline',         desc: 'طلبك جاهز للاستلام' },
  { key: 'on_the_way', label: 'في الطريق',    icon: 'bicycle-outline',           desc: 'المندوب في طريقه إليك' },
  { key: 'delivered',  label: 'تم التسليم',   icon: 'gift-outline',              desc: 'استمتع بطعامك! 🎉' },
];

function buildMapHTML({ restLat, restLng, custLat, custLng, driverLat, driverLng }) {
  const safeRestLat = parseFloat(restLat) || null;
  const safeRestLng = parseFloat(restLng) || null;
  const safeCustLat = parseFloat(custLat) || null;
  const safeCustLng = parseFloat(custLng) || null;
  const safeDriverLat = parseFloat(driverLat) || null;
  const safeDriverLng = parseFloat(driverLng) || null;
  const cLat = safeDriverLat || safeRestLat || safeCustLat || 31.9;
  const cLng = safeDriverLng || safeRestLng || safeCustLng || 35.2;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#e8e0d8}
  .leaflet-control-zoom a{font-size:18px!important;width:36px!important;height:36px!important;line-height:36px!important}
  .custom-popup .leaflet-popup-content-wrapper{border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.18)}
  .custom-popup .leaflet-popup-content{font-family:system-ui;font-size:13px;font-weight:600;direction:rtl;text-align:right}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map',{
  center:[${cLat},${cLng}],
  zoom:14,
  zoomControl:true,
  dragging:true,
  touchZoom:true,
  doubleClickZoom:true,
  scrollWheelZoom:true,
  tap:true
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom:19,
  attribution:'© OpenStreetMap'
}).addTo(map);

// Position zoom control top-left
map.zoomControl.setPosition('topleft');

function mkIcon(emoji,size,bg){
  size=size||32;
  return L.divIcon({
    html:'<div style="width:'+size+'px;height:'+size+'px;background:'+(bg||'#fff')+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+(size*0.55)+'px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35)">'+emoji+'</div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2)],className:''
  });
}

var pts=[];
var driverMarker=null;
var curPos=null;              // الموقع المرسوم حالياً للسائق
var animFrame=null, startPos=null, endPos=null, animStart=0;
var ANIM_MS=5200;             // مدة انزلاق الدبوس بين نقطتين (أطول قليلاً من فترة الإرسال ليبقى متحركاً دائماً)
var followDriver=true;        // الكاميرا تتبع السائق مثل وضع الملاحة

${safeRestLat && safeRestLng ? `
L.marker([${safeRestLat},${safeRestLng}],{icon:mkIcon('🏪',40,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">🏪 المطعم</div>',{className:'custom-popup'});
pts.push([${safeRestLat},${safeRestLng}]);
` : ''}

${safeCustLat && safeCustLng ? `
L.marker([${safeCustLat},${safeCustLng}],{icon:mkIcon('📍',40,'#FF3B30')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">📍 موقع التوصيل</div>',{className:'custom-popup'});
pts.push([${safeCustLat},${safeCustLng}]);
` : ''}

${safeDriverLat && safeDriverLng ? `
driverMarker=L.marker([${safeDriverLat},${safeDriverLng}],{icon:mkIcon('🛵',44,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 السائق</div>',{className:'custom-popup'});
curPos=[${safeDriverLat},${safeDriverLng}];
pts.push([${safeDriverLat},${safeDriverLng}]);
` : ''}

${safeRestLat && safeCustLat ? `
L.polyline([[${safeRestLat},${safeRestLng}],[${safeCustLat},${safeCustLng}]],{
  color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.7
}).addTo(map);
` : ''}

if(pts.length===1){map.setView(pts[0],15);}
else if(pts.length>1){map.fitBounds(pts,{padding:[50,50]});}

// لو سحب المستخدم الخريطة يدوياً نوقف التتبع التلقائي حتى يضغط زر التوسيط
map.on('dragstart',function(){ followDriver=false; });

// إطار الحركة: ينزلق الدبوس تدريجياً من نقطته الحالية للنقطة الجديدة
function animStep(){
  var t=(Date.now()-animStart)/ANIM_MS;
  if(t>1)t=1;
  var lat=startPos[0]+(endPos[0]-startPos[0])*t;
  var lng=startPos[1]+(endPos[1]-startPos[1])*t;
  curPos=[lat,lng];
  driverMarker.setLatLng(curPos);
  if(followDriver) map.panTo(curPos,{animate:false});
  if(t<1){ animFrame=requestAnimationFrame(animStep); }
}

// استقبال موقع جديد: إنشاء الدبوس أول مرة، أو بدء انزلاق ناعم للنقطة الجديدة
function moveDriver(lat,lng){
  var ll=[lat,lng];
  if(isNaN(lat)||isNaN(lng)) return;
  if(!driverMarker){
    driverMarker=L.marker(ll,{icon:mkIcon('🛵',44,'#FF6B00')}).addTo(map)
      .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 السائق</div>',{className:'custom-popup'});
    curPos=ll;
    if(followDriver) map.setView(ll,16,{animate:true});
    return;
  }
  startPos=curPos ? [curPos[0],curPos[1]] : [lat,lng];
  endPos=[lat,lng];
  animStart=Date.now();
  if(animFrame) cancelAnimationFrame(animFrame);
  animStep();
}

function handleMsg(e){
  try{
    var d=JSON.parse(e.data||e);
    if(d.type==='driver_location'){
      moveDriver(parseFloat(d.lat),parseFloat(d.lng));
    } else if(d.type==='recenter'){
      followDriver=true;
      if(curPos) map.setView(curPos,16,{animate:true});
    }
  }catch(err){}
}
window.addEventListener('message',handleMsg);
document.addEventListener('message',function(e){handleMsg(e.data);});
</script>
</body>
</html>`;
}

export default function OrderTrackingScreen() {
  const route = useRoute();
  const id = route.params?.orderId;
  const navigation = useNavigation();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);

  const [order, setOrder] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapKey, setMapKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  const webViewRef = useRef(null);
  const socketRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetchOrder();
    setupSocket();
    startPulse();
    const interval = setInterval(fetchOrder, 30000);
    return () => { clearInterval(interval); socketRef.current?.disconnect(); };
  }, [id]);

  useEffect(() => {
    if (!driverLoc || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'driver_location', lat: driverLoc.lat, lng: driverLoc.lng }));
  }, [driverLoc]);

  const startPulse = () => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ])).start();
  };

  const setupSocket = async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) return;
      const socket = io('https://burger-app-production.up.railway.app', {
        auth: { token }, transports: ['websocket']
      });
      socketRef.current = socket;
      socket.on('driver:location', ({ lat, lng, orderId }) => {
        if (!orderId || String(orderId) === String(id)) {
          setDriverLoc({ lat: parseFloat(lat), lng: parseFloat(lng) });
        }
      });
      socket.on('order_status', ({ order_id, status }) => {
        if (String(order_id) === String(id)) {
          setOrder(prev => prev ? { ...prev, status } : prev);
        }
      });
    } catch {}
  };

  const fetchOrder = async () => {
    try {
      const data = await api.get(`/orders/${id}`);
      const o = data.data || data;
      setOrder(o);
      if (o.driver_lat && o.driver_lng) {
        setDriverLoc({ lat: parseFloat(o.driver_lat), lng: parseFloat(o.driver_lng) });
      }
    } catch (e) { console.error('fetchOrder error:', e); }
    finally { setLoading(false); }
  };

  // كل الـ hooks يجب أن تُستدعى قبل أي return مبكّر (قاعدة ترتيب React hooks)
  const showMap = ['confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'].includes(order?.status);
  // تُبنى الخريطة مرة واحدة فقط؛ حركة السائق تتم عبر postMessage (انزلاق ناعم) لا بإعادة البناء كل 5 ثواني
  const mapHtml = React.useMemo(
    () => showMap ? buildMapHTML({
      restLat: order.restaurant_lat, restLng: order.restaurant_lng,
      custLat: order.delivery_lat,   custLng: order.delivery_lng,
      driverLat: order.driver_lat,   driverLng: order.driver_lng,
    }) : null,
    [showMap, order?.restaurant_lat, order?.restaurant_lng, order?.delivery_lat, order?.delivery_lng]
  );

  if (loading) return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>جاري تحميل طلبك...</Text>
    </View>
  );

  if (!order) return (
    <View style={styles.loadingWrap}>
      <Text style={{ fontSize: 48 }}>😕</Text>
      <Text style={styles.loadingText}>لم يُعثر على الطلب</Text>
    </View>
  );

  const currentIdx = STATUS_STEPS.findIndex(s => s.key === order.status);
  const currentStep = STATUS_STEPS[Math.max(currentIdx, 0)];
  const isDelivered = order.status === 'delivered';
  const isCancelled = order.status === 'cancelled';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'الرئيسية' })} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تتبع الطلب #{order.order_number || id}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* MAP — outside ScrollView so gestures work freely */}
      {showMap && mapHtml ? (
        <View style={styles.mapWrap}>
          <WebView
            key={mapKey}
            ref={webViewRef}
            source={{ html: mapHtml }}
            style={styles.map}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            onMessage={() => {}}
            onLoadEnd={() => {
              const dl = driverLoc || (order.driver_lat && { lat: order.driver_lat, lng: order.driver_lng });
              if (dl) webViewRef.current?.postMessage(JSON.stringify({ type: 'driver_location', lat: dl.lat, lng: dl.lng }));
            }}
          />
          {order.status === 'on_the_way' && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          {/* Re-center button — يعيد التتبع للسائق بنعومة بدون إعادة تحميل الخريطة */}
          <TouchableOpacity style={styles.recenterBtn} onPress={() => webViewRef.current?.postMessage(JSON.stringify({ type: 'recenter' }))}>
            <Ionicons name="locate" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.noMapStatus}>
          <Animated.Text style={[styles.bigEmoji, { transform: [{ scale: pulseAnim }] }]}>
            {isCancelled ? '❌' : order.status === 'preparing' ? '👨‍🍳' : order.status === 'on_the_way' ? '🛵' : order.status === 'delivered' ? '🎉' : '⏳'}
          </Animated.Text>
        </View>
      )}

      {/* Scrollable content BELOW map */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>

        {/* Status Card */}
        <View style={[styles.statusCard, isCancelled && { borderColor: COLORS.red }, isDelivered && { borderColor: COLORS.green }]}>
          <Text style={[styles.statusTitle, isCancelled && { color: COLORS.red }, isDelivered && { color: COLORS.green }]}>
            {isCancelled ? '❌ تم إلغاء الطلب' : currentStep?.label}
          </Text>
          <Text style={styles.statusDesc}>{isCancelled ? 'للاستفسار تواصل مع الدعم' : currentStep?.desc}</Text>
          {!isCancelled && !isDelivered && order.estimated_delivery_time && (() => {
            const mins = Math.round((new Date(order.estimated_delivery_time).getTime() - now) / 60000);
            return (
              <View style={styles.etaBox}>
                <Ionicons name="time" size={16} color={COLORS.primary} />
                <Text style={styles.etaText}>
                  {mins > 0 ? `الوصول المتوقّع خلال ~${mins} دقيقة` : 'طلبك في طريقه، وصولك قريب جداً 🎉'}
                </Text>
              </View>
            );
          })()}
        </View>

        {/* Progress Steps */}
        {!isCancelled && (
          <View style={styles.card}>
            {STATUS_STEPS.map((step, idx) => {
              const done = idx <= currentIdx;
              const active = idx === currentIdx;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View style={[styles.stepCircle, done && { backgroundColor: COLORS.primary }, isDelivered && idx === STATUS_STEPS.length - 1 && { backgroundColor: COLORS.green }]}>
                    <Ionicons name={step.icon} size={13} color={done ? '#FFF' : COLORS.gray} />
                  </View>
                  {idx < STATUS_STEPS.length - 1 && (
                    <View style={[styles.stepLine, idx < currentIdx && { backgroundColor: COLORS.primary }]} />
                  )}
                  <Text style={[styles.stepLabel, active && { color: COLORS.primary, fontWeight: '800' }, done && !active && { color: COLORS.green }]}>
                    {step.label}
                  </Text>
                  {active && <View style={styles.activeDot} />}
                </View>
              );
            })}
          </View>
        )}

        {/* Driver Card */}
        {!!order.driver_name && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}><Text style={{ fontSize: 26 }}>🛵</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{order.driver_name}</Text>
              <Text style={styles.driverSub}>{order.vehicle_type || 'دراجة نارية'}</Text>
              {driverLoc && order.status === 'on_the_way' && <Text style={styles.driverLive}>🟢 يتحرك الآن</Text>}
            </View>
            {!!order.driver_phone && (
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${order.driver_phone}`)}>
                <Ionicons name="call" size={20} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Order Details */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="restaurant-outline" size={16} color={COLORS.primary} />
            <Text style={styles.infoLabel}>المطعم</Text>
            <Text style={styles.infoVal}>{order.restaurant_name}</Text>
          </View>
          {order.delivery_address ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.primary} />
              <Text style={styles.infoLabel}>عنوان التوصيل</Text>
              <Text style={styles.infoVal} numberOfLines={2}>{order.delivery_address}</Text>
            </View>
          ) : null}
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="cash-outline" size={16} color={COLORS.green} />
            <Text style={styles.infoLabel}>الإجمالي</Text>
            <Text style={[styles.infoVal, { color: COLORS.primary, fontWeight: '900', fontSize: 16 }]}>
              {parseFloat(order.total || 0).toFixed(2)}₪
            </Text>
          </View>
        </View>

        {/* Items */}
        {order.items?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🧾 تفاصيل الطلب</Text>
            {order.items.map((item, i) => (
              <View key={i} style={styles.orderItem}>
                <Text style={styles.orderItemName}>{item.name_ar || item.name} × {item.quantity}</Text>
                <Text style={styles.orderItemPrice}>{(parseFloat(item.price) * item.quantity).toFixed(2)}₪</Text>
              </View>
            ))}
          </View>
        )}

        {isDelivered && (
          <TouchableOpacity style={styles.rateBtn} onPress={() => navigation.navigate('Rating', {
            orderId: id,
            restaurantName: order?.restaurant_name || order?.restaurant?.name_ar,
            driverName: order?.driver_name,
          })}>
            <Text style={styles.rateBtnText}>⭐ قيّم تجربتك</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: COLORS.bg },
  loadingText: { fontSize: 15, color: COLORS.gray, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.inputBg },
  headerTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  mapWrap: { height: 280, position: 'relative' },
  map: { flex: 1 },
  liveBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.red, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  recenterBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: COLORS.card, borderRadius: 10, padding: 8, elevation: 4, zIndex: 10 },
  noMapStatus: { height: 130, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.tint },
  bigEmoji: { fontSize: 64 },
  statusCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: '#FFE0CC', elevation: 2 },
  statusTitle: { fontSize: 20, fontWeight: '900', color: COLORS.primary, marginBottom: 6 },
  statusDesc: { fontSize: 13, color: COLORS.gray },
  etaBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: COLORS.tint, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  etaText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  stepLine: { position: 'absolute', left: 13, top: 28, width: 2, height: 10, backgroundColor: COLORS.border },
  stepLabel: { flex: 1, fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  driverCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.tint, alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  driverSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  driverLive: { fontSize: 11, color: COLORS.green, fontWeight: '700', marginTop: 3 },
  callBtn: { backgroundColor: COLORS.primary, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  infoLabel: { fontSize: 12, color: COLORS.gray, width: 85 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  orderItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  orderItemName: { fontSize: 13, color: COLORS.text, flex: 1 },
  orderItemPrice: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  rateBtn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center', elevation: 3 },
  rateBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});

