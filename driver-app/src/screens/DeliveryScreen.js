import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', bg: '#F8F9FA', red: '#FF3B30' };
const SOCKET_URL = 'https://burger-app-production.up.railway.app';

const STEPS = [
  { status: 'confirmed', nextStatus: 'on_the_way', label: 'انطلق للمطعم', icon: '🏍️', desc: 'توجّه إلى المطعم لاستلام الطلب', buttonLabel: 'وصلت المطعم - استلمت الطلب' },
  { status: 'on_the_way', nextStatus: 'delivered', label: 'في الطريق للزبون', icon: '📦', desc: 'انطلق إلى موقع الزبون', buttonLabel: 'تم التوصيل للزبون ✅' },
  { status: 'delivered', nextStatus: null, label: 'تم التوصيل', icon: '✅', desc: 'أكمل التوصيل بنجاح', buttonLabel: null },
];

function buildDriverMapHTML({ restLat, restLng, custLat, custLng, driverLat, driverLng }) {
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
map.zoomControl.setPosition('topleft');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);

function mkIcon(emoji,size,bg){
  return L.divIcon({
    html:'<div style="width:'+size+'px;height:'+size+'px;background:'+(bg||'#fff')+';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:'+(size*0.55)+'px;border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35)">'+emoji+'</div>',
    iconSize:[size,size],iconAnchor:[size/2,size/2],popupAnchor:[0,-(size/2)],className:''
  });
}

var pts=[];
var driverMarker=null;

${restLat && restLng ? `
L.marker([${restLat},${restLng}],{icon:mkIcon('🏪',40,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">🏪 المطعم</div>');
pts.push([${restLat},${restLng}]);
` : ''}

${custLat && custLng ? `
L.marker([${custLat},${custLng}],{icon:mkIcon('📍',40,'#FF3B30')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700">📍 موقع الزبون</div>');
pts.push([${custLat},${custLng}]);
` : ''}

${driverLat && driverLng ? `
driverMarker=L.marker([${driverLat},${driverLng}],{icon:mkIcon('🛵',46,'#FF6B00')}).addTo(map)
  .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 موقعك الحالي</div>');
pts.push([${driverLat},${driverLng}]);
` : ''}

${restLat && custLat ? `
L.polyline([[${restLat},${restLng}],[${custLat},${custLng}]],{color:'#FF6B00',weight:4,dashArray:'10 6',opacity:0.7}).addTo(map);
` : ''}

if(pts.length===1){map.setView(pts[0],15);}
else if(pts.length>1){map.fitBounds(pts,{padding:[50,50]});}

function handleMsg(e){
  try{
    var d=JSON.parse(e.data||e);
    if(d.type==='driver_location'){
      var ll=[parseFloat(d.lat),parseFloat(d.lng)];
      if(!driverMarker){
        driverMarker=L.marker(ll,{icon:mkIcon('🛵',46,'#FF6B00')}).addTo(map)
          .bindPopup('<div style="direction:rtl;font-weight:700;color:#FF6B00">🛵 موقعك الحالي</div>');
      } else {
        driverMarker.setLatLng(ll);
      }
      map.panTo(ll,{animate:true,duration:0.5});
    }
  }catch(err){}
}
window.addEventListener('message',handleMsg);
document.addEventListener('message',function(e){handleMsg(e.data);});
</script>
</body>
</html>`;
}

export default function DeliveryScreen({ route, navigation }) {
  const { orderId } = route.params || {};
  const [orderData, setOrderData] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [driverLoc, setDriverLoc] = useState(null);
  const [mapKey, setMapKey] = useState(0);
  const [updating, setUpdating] = useState(false);
  const locationInterval = useRef(null);
  const socketRef = useRef(null);
  const webViewRef = useRef(null);

  useEffect(() => {
    loadOrder();
    initSocket();
    startLocationTracking();
    return () => {
      locationInterval.current && clearInterval(locationInterval.current);
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!driverLoc || !webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ type: 'driver_location', lat: driverLoc.lat, lng: driverLoc.lng }));
  }, [driverLoc]);

  const initSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('driver_token');
      if (!token) return;
      const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
      socketRef.current = socket;
    } catch {}
  };

  const loadOrder = async () => {
    if (!orderId) return;
    try {
      const r = await api.get(`/orders/${orderId}`);
      const order = r.data || r;
      setOrderData(order);
      if (order.status === 'on_the_way') setCurrentStep(1);
      else if (order.status === 'delivered') setCurrentStep(2);
      else setCurrentStep(0);
    } catch {}
  };

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = loc.coords;
      setDriverLoc({ lat, lng });
      emitLocation(lat, lng);

      locationInterval.current = setInterval(async () => {
        try {
          const newLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const { latitude, longitude } = newLoc.coords;
          setDriverLoc({ lat: latitude, lng: longitude });
          emitLocation(latitude, longitude);
        } catch {}
      }, 5000);
    } catch {}
  };

  const emitLocation = (lat, lng) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('driver:location', { lat, lng, orderId });
    }
    api.patch('/drivers/location', { lat, lng }).catch(() => {});
  };

  const nextStep = async () => {
    if (!orderData || updating) return;
    const step = STEPS[currentStep];
    if (!step.nextStatus) return;
    setUpdating(true);
    try {
      await api.patch(`/orders/${orderData.id}/status`, { status: step.nextStatus });
      if (step.nextStatus === 'delivered') {
        Alert.alert('رائع! 🎉', 'تم إكمال التوصيل بنجاح\nتم إضافة أجر التوصيل لمحفظتك', [
          { text: 'حسناً', onPress: () => navigation.goBack() }
        ]);
        setCurrentStep(2);
      } else {
        setCurrentStep(c => c + 1);
        await loadOrder();
      }
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
    finally { setUpdating(false); }
  };

  const openMaps = (lat, lng, label = '') => {
    if (!lat || !lng) return Alert.alert('خطأ', 'الموقع غير متوفر');
    Linking.openURL(`https://maps.google.com/?daddr=${lat},${lng}&q=${encodeURIComponent(label)}`);
  };

  const callNumber = (phone) => {
    if (!phone) return Alert.alert('خطأ', 'رقم الهاتف غير متوفر');
    Linking.openURL(`tel:${phone}`);
  };

  const currentStep_obj = STEPS[currentStep];

  const mapTarget = currentStep === 0
    ? { lat: orderData?.restaurant_lat, lng: orderData?.restaurant_lng }
    : { lat: orderData?.delivery_lat, lng: orderData?.delivery_lng };

  const mapHtml = buildDriverMapHTML({
    restLat: orderData?.restaurant_lat,
    restLng: orderData?.restaurant_lng,
    custLat: orderData?.delivery_lat,
    custLng: orderData?.delivery_lng,
    driverLat: driverLoc?.lat,
    driverLng: driverLoc?.lng,
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>توصيل #{orderData?.id || orderId}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* MAP — outside ScrollView for free pan/zoom */}
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
        {/* Live badge */}
        {currentStep === 1 && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        {/* Re-center */}
        <TouchableOpacity style={styles.recenterBtn} onPress={() => setMapKey(k => k + 1)}>
          <Ionicons name="locate" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        {/* Navigate to destination */}
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => openMaps(mapTarget.lat, mapTarget.lng)}
        >
          <Ionicons name="navigate" size={16} color="#FFF" />
          <Text style={styles.navBtnText}>{currentStep === 0 ? 'ملاحة للمطعم' : 'ملاحة للزبون'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 14, paddingBottom: 120, gap: 12 }}>

        {/* Step Progress */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>تقدم التوصيل</Text>
          {STEPS.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepCircle, i < currentStep && styles.stepDone, i === currentStep && styles.stepActive]}>
                <Text style={{ fontSize: 16 }}>{i < currentStep ? '✅' : s.icon}</Text>
              </View>
              <View style={styles.stepInfo}>
                <Text style={[styles.stepLabel, i === currentStep && { color: COLORS.primary, fontWeight: '800' }]}>{s.label}</Text>
                {i === currentStep && <Text style={styles.stepDesc2}>{s.desc}</Text>}
              </View>
            </View>
          ))}
        </View>

        {/* Order Info */}
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="restaurant-outline" size={18} color={COLORS.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>المطعم</Text>
              <Text style={styles.infoValue}>{orderData?.restaurant_name || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="person-outline" size={18} color={COLORS.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>الزبون</Text>
              <Text style={styles.infoValue}>{orderData?.customer_name || '-'}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={COLORS.primary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>عنوان التوصيل</Text>
              <Text style={styles.infoValue}>{orderData?.delivery_address || '-'}</Text>
            </View>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="cash-outline" size={18} color={COLORS.green} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>أجر التوصيل لك</Text>
              <Text style={[styles.infoValue, { color: COLORS.green, fontSize: 20 }]}>
                {parseFloat(orderData?.delivery_fee || 0).toFixed(2)}₪
              </Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => callNumber(orderData?.customer_phone)}>
            <Ionicons name="call" size={22} color={COLORS.primary} />
            <Text style={styles.actionLabel}>اتصل بالزبون</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => callNumber(orderData?.restaurant_phone)}>
            <Ionicons name="restaurant" size={22} color={COLORS.primary} />
            <Text style={styles.actionLabel}>اتصل بالمطعم</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {currentStep < STEPS.length - 1 && currentStep_obj?.buttonLabel && (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.nextBtn, updating && { opacity: 0.6 }]} onPress={nextStep} disabled={updating}>
            <Text style={styles.nextBtnText}>{updating ? 'جاري التحديث...' : currentStep_obj.buttonLabel}</Text>
            <Ionicons name="checkmark-circle" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {currentStep === STEPS.length - 1 && (
        <View style={styles.footer}>
          <View style={styles.doneBox}>
            <Text style={styles.doneText}>✅ تم التوصيل بنجاح!</Text>
            <Text style={styles.doneSubText}>تم إضافة {parseFloat(orderData?.delivery_fee || 0).toFixed(2)}₪ لمحفظتك</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F5F5F5' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  mapWrap: { height: 260, position: 'relative' },
  map: { flex: 1 },
  liveBadge: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.red, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, zIndex: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  liveText: { color: '#FFF', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  recenterBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: '#FFF', borderRadius: 10, padding: 8, elevation: 4, zIndex: 10 },
  navBtn: { position: 'absolute', bottom: 10, right: 10, backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, elevation: 4, zIndex: 10 },
  navBtnText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  scroll: { flex: 1 },
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  stepCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  stepActive: { backgroundColor: '#FFF5EE', borderWidth: 2, borderColor: COLORS.primary },
  stepDone: { backgroundColor: '#EDFFF3' },
  stepInfo: { flex: 1 },
  stepLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray },
  stepDesc2: { fontSize: 11, color: COLORS.primary, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, color: COLORS.gray, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 14, alignItems: 'center', gap: 6, elevation: 1 },
  actionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  footer: { padding: 16, paddingBottom: 30, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  nextBtn: { backgroundColor: COLORS.primary, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nextBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  doneBox: { backgroundColor: '#EDFFF3', borderRadius: 18, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: '#C3F5D8' },
  doneText: { fontSize: 18, fontWeight: '900', color: '#1A5C33' },
  doneSubText: { fontSize: 13, color: '#2D8B55', marginTop: 4 },
});

