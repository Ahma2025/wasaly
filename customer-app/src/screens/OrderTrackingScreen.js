import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, Animated, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', bg: '#F8F9FA', red: '#FF3B30' };

const STATUS_STEPS = [
  { key: 'pending',    label: 'في الانتظار',  icon: 'time-outline',             desc: 'طلبك وصل للمطعم' },
  { key: 'confirmed',  label: 'تم القبول',    icon: 'checkmark-circle-outline',  desc: 'المطعم قبل طلبك' },
  { key: 'preparing',  label: 'يُحضَّر',       icon: 'flame-outline',             desc: 'يتم تحضير طعامك' },
  { key: 'ready',      label: 'جاهز',         icon: 'bag-check-outline',         desc: 'طلبك جاهز للاستلام' },
  { key: 'on_the_way', label: 'في الطريق',    icon: 'bicycle-outline',           desc: 'المندوب في طريقه إليك' },
  { key: 'delivered',  label: 'تم التسليم',   icon: 'gift-outline',              desc: 'استمتع بطعامك! 🎉' },
];

function buildMapHTML({ restLat, restLng, custLat, custLng, driverLat, driverLng }) {
  const cLat = driverLat || restLat || custLat || 31.9;
  const cLng = driverLng || restLng || custLng || 35.2;

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

${restLat && restLng ? `
L.marker([${restLat},${restLng}],{icon:mkIcon('🏪',40,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">🏪 المطعم</div>',{className:'custom-popup'});
pts.push([${restLat},${restLng}]);
` : ''}

${custLat && custLng ? `
L.marker([${custLat},${custLng}],{icon:mkIcon('📍',40,'#FF3B30')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">📍 موقع التوصيل</div>',{className:'custom-popup'});
pts.push([${custLat},${custLng}]);
` : ''}

${driverLat && driverLng ? `
driverMarker=L.marker([${driverLat},${driverLng}],{icon:mkIcon('🛵',44,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 السائق</div>',{className:'custom-popup'});
pts.push([${driverLat},${driverLng}]);
` : ''}

${restLat && custLat ? `
L.polyline([[${restLat},${restLng}],[${custLat},${custLng}]],{
  color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.7
}).addTo(map);
` : ''}

if(pts.length===1){map.setView(pts[0],15);}
else if(pts.length>1){map.fitBounds(pts,{padding:[50,50]});}

// Receive driver live location from React Native
function handleMsg(e){
  try{
    var d=JSON.parse(e.data||e);
    if(d.type==='driver_location'){
      var ll=[parseFloat(d.lat),parseFloat(d.lng)];
      if(!driverMarker){
        driverMarker=L.marker(ll,{icon:mkIcon('🛵',44,'#FF6B00')}).addTo(map)
          .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 السائق</div>',{className:'custom-popup'});
      } else {
        driverMarker.setLatLng(ll);
      }
      map.panTo(ll,{animate:true,duration:0.6});
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

  const [order, setOrder] = useState(null);
  const [driverLoc, setDriverLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mapKey, setMapKey] = useState(0);
  const webViewRef = useRef(null);
  const socketRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

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
      const socket = io('https://snareless-diatonic-emmalynn.ngrok-free.dev', {
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
    } catch {}
    finally { setLoading(false); }
  };

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
  const showMap = ['confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'].includes(order.status);

  const mapHtml = showMap ? buildMapHTML({
    restLat: order.restaurant_lat, restLng: order.restaurant_lng,
    custLat: order.delivery_lat,   custLng: order.delivery_lng,
    driverLat: driverLoc?.lat || order.driver_lat,
    driverLng: driverLoc?.lng || order.driver_lng,
  }) : null;

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
          />
          {order.status === 'on_the_way' && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          {/* Re-center button */}
          <TouchableOpacity style={styles.recenterBtn} onPress={() => setMapKey(k => k + 1)}>
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
          <TouchableOpacity style={styles.rateBtn} onPress={() => navigation.navigate('Rating', { orderId: id })}>
            <Text style={styles.rateBtnText}>⭐ قيّم تجربتك</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: COLORS.gray, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F5F5F5' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  mapWrap: { height: 280, position: 'relative' },
  map: { flex: 1 },
  liveBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.red, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  recenterBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 8, elevation: 4, zIndex: 10 },
  noMapStatus: { height: 130, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF5EE' },
  bigEmoji: { fontSize: 64 },
  statusCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: '#FFE0CC', elevation: 2 },
  statusTitle: { fontSize: 20, fontWeight: '900', color: COLORS.primary, marginBottom: 6 },
  statusDesc: { fontSize: 13, color: COLORS.gray },
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  stepLine: { position: 'absolute', left: 13, top: 28, width: 2, height: 10, backgroundColor: '#E5E5EA' },
  stepLabel: { flex: 1, fontSize: 13, color: COLORS.gray, fontWeight: '600' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  driverCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, elevation: 1 },
  driverAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF5EE', alignItems: 'center', justifyContent: 'center' },
  driverName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  driverSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  driverLive: { fontSize: 11, color: COLORS.green, fontWeight: '700', marginTop: 3 },
  callBtn: { backgroundColor: COLORS.primary, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoLabel: { fontSize: 12, color: COLORS.gray, width: 85 },
  infoVal: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text },
  orderItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  orderItemName: { fontSize: 13, color: COLORS.text, flex: 1 },
  orderItemPrice: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  rateBtn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center', elevation: 3 },
  rateBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
