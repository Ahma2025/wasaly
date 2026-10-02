import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';

// خريطة اختيار موقع (Leaflet داخل WebView) — الدبّوس ثابت بالنص، الخريطة تتحرك
const pickerHTML = (lat, lng) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{height:100%;margin:0}#pin{position:fixed;top:50%;left:50%;transform:translate(-50%,-100%);font-size:34px;z-index:999;pointer-events:none;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}</style>
</head><body>
<div id="m"></div><div id="pin">📍</div>
<script>
var map=L.map('m',{zoomControl:false}).setView([${lat||31.9},${lng||35.2}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
function send(){var c=map.getCenter();(window.ReactNativeWebView||window).postMessage&&window.ReactNativeWebView.postMessage(JSON.stringify({lat:c.lat,lng:c.lng}));}
map.on('moveend',send);setTimeout(send,400);
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.lat){map.setView([d.lat,d.lng],16);}}catch(_){}});
window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.lat){map.setView([d.lat,d.lng],16);}}catch(_){}});
</script></body></html>`;

function MapPicker({ colors: C, coords, onPick, mapRef }) {
  return (
    <View style={{ height: 190, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
      <WebView
        ref={mapRef}
        originWhitelist={['*']}
        source={{ html: pickerHTML(coords?.lat, coords?.lng) }}
        onMessage={(e) => {
          try { const d = JSON.parse(e.nativeEvent.data); if (d && d.lat) onPick({ lat: d.lat, lng: d.lng }); } catch (_) {}
        }}
        style={{ flex: 1, backgroundColor: '#e8eef5' }}
        scrollEnabled={false}
      />
    </View>
  );
}

export default function PersonalDeliveryScreen({ navigation }) {
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  const [cfg, setCfg] = useState(null);
  const [serviceType, setServiceType] = useState('parcel'); // 'parcel' | 'ride'
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [pickupAddr, setPickupAddr] = useState('');
  const [dropAddr, setDropAddr] = useState('');
  // parcel
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [parcelDesc, setParcelDesc] = useState('');
  const [parcelSize, setParcelSize] = useState('small');
  // ride
  const [passengers, setPassengers] = useState(1);
  const [notes, setNotes] = useState('');

  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pickupMap = useRef(null);
  const dropMap = useRef(null);

  useEffect(() => {
    api.get('/orders/personal/config')
      .then(d => setCfg(d?.data || null))
      .catch(() => setCfg({ enabled: false }));
  }, []);

  const locate = useCallback(async (which) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('تنبيه', 'نحتاج إذن الموقع');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      const msg = JSON.stringify(c);
      if (which === 'pickup') { setPickup(c); pickupMap.current?.postMessage(msg); }
      else { setDropoff(c); dropMap.current?.postMessage(msg); }
    } catch { Alert.alert('خطأ', 'تعذّر تحديد الموقع'); }
  }, []);

  // تسعير فوري عند توفر النقطتين
  useEffect(() => {
    if (!pickup || !dropoff) { setQuote(null); return; }
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api.post('/orders/personal/quote', {
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
      }).then(d => { if (alive) setQuote(d?.data || null); })
        .catch(() => { if (alive) setQuote(null); })
        .finally(() => { if (alive) setQuoting(false); });
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [pickup, dropoff]);

  const submit = async () => {
    if (!pickup) return Alert.alert('تنبيه', 'حدّد نقطة الاستلام على الخريطة');
    if (!dropoff) return Alert.alert('تنبيه', 'حدّد نقطة التسليم على الخريطة');
    if (serviceType === 'parcel' && !recipientPhone.trim()) return Alert.alert('تنبيه', 'أدخل رقم هاتف المستلِم');
    setSubmitting(true);
    try {
      const d = await api.post('/orders/personal', {
        service_type: serviceType,
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickupAddr,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, delivery_address: dropAddr,
        recipient_name: recipientName, recipient_phone: recipientPhone,
        parcel_desc: parcelDesc, parcel_size: parcelSize,
        passengers, notes, payment_method: 'cash',
      });
      const order = d?.data;
      Alert.alert('✅ تم إرسال الطلب', 'جاري البحث عن سائق قريب منك...', [
        { text: 'تتبّع الطلب', onPress: () => navigation.replace('OrderTracking', { orderId: order?.id }) },
      ]);
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذّر إنشاء الطلب');
    } finally { setSubmitting(false); }
  };

  if (cfg && cfg.enabled === false) {
    return (
      <View style={styles.container}>
        <GradientHeader title="طلب شخصي" />
        <View style={styles.centered}>
          <Ionicons name="time-outline" size={60} color={C.faint} />
          <Text style={styles.emptyTxt}>خدمة التوصيل الشخصي غير متاحة حالياً</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GradientHeader title="طلب شخصي" subtitle="وصّل طرد أو اطلب سائق يوصّلك" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }} keyboardShouldPersistTaps="handled">

        {/* نوع الخدمة */}
        <View style={styles.segment}>
          {[['parcel', '📦 توصيل طرد'], ['ride', '🧍 توصيل راكب']].map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.segBtn, serviceType === k && styles.segActive]} onPress={() => setServiceType(k)}>
              <Text style={[styles.segTxt, serviceType === k && styles.segTxtActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* نقطة الاستلام */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>🟢 نقطة الاستلام</Text>
            <TouchableOpacity style={styles.miniBtn} onPress={() => locate('pickup')}>
              <Ionicons name="locate" size={15} color={C.primary} />
              <Text style={styles.miniBtnTxt}>موقعي</Text>
            </TouchableOpacity>
          </View>
          <MapPicker colors={C} coords={pickup} onPick={setPickup} mapRef={pickupMap} />
          <TextInput style={styles.input} placeholder="وصف نقطة الاستلام (اختياري)" placeholderTextColor={C.faint}
            value={pickupAddr} onChangeText={setPickupAddr} textAlign="right" />
        </View>

        {/* نقطة التسليم */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>🔴 نقطة التسليم</Text>
            <TouchableOpacity style={styles.miniBtn} onPress={() => locate('dropoff')}>
              <Ionicons name="locate" size={15} color={C.primary} />
              <Text style={styles.miniBtnTxt}>موقعي</Text>
            </TouchableOpacity>
          </View>
          <MapPicker colors={C} coords={dropoff} onPick={setDropoff} mapRef={dropMap} />
          <TextInput style={styles.input} placeholder="وصف نقطة التسليم (اختياري)" placeholderTextColor={C.faint}
            value={dropAddr} onChangeText={setDropAddr} textAlign="right" />
        </View>

        {/* تفاصيل حسب النوع */}
        {serviceType === 'parcel' ? (
          <View style={styles.card}>
            <Text style={styles.label}>تفاصيل الطرد</Text>
            <TextInput style={styles.input} placeholder="وصف الطرد (مثال: ظرف / كيس أدوية)" placeholderTextColor={C.faint}
              value={parcelDesc} onChangeText={setParcelDesc} textAlign="right" />
            <View style={styles.sizeRow}>
              {[['small', 'صغير'], ['medium', 'وسط'], ['large', 'كبير']].map(([k, l]) => (
                <TouchableOpacity key={k} style={[styles.sizeBtn, parcelSize === k && styles.sizeActive]} onPress={() => setParcelSize(k)}>
                  <Text style={[styles.sizeTxt, parcelSize === k && { color: '#fff' }]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="اسم المستلِم" placeholderTextColor={C.faint}
              value={recipientName} onChangeText={setRecipientName} textAlign="right" />
            <TextInput style={styles.input} placeholder="رقم هاتف المستلِم *" placeholderTextColor={C.faint}
              value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" textAlign="right" />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>عدد الركّاب</Text>
            <View style={styles.sizeRow}>
              {[1, 2, 3, 4].map(n => (
                <TouchableOpacity key={n} style={[styles.sizeBtn, passengers === n && styles.sizeActive]} onPress={() => setPassengers(n)}>
                  <Text style={[styles.sizeTxt, passengers === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="ملاحظات للسائق (اختياري)" placeholderTextColor={C.faint}
              value={notes} onChangeText={setNotes} textAlign="right" />
          </View>
        )}

        {/* السعر */}
        <View style={[styles.card, { alignItems: 'center' }]}>
          {quoting ? (
            <ActivityIndicator color={C.primary} />
          ) : quote ? (
            <>
              <Text style={styles.fareLabel}>السعر التقديري</Text>
              <Text style={styles.fare}>{quote.fare} ₪</Text>
              <Text style={styles.fareSub}>المسافة ≈ {quote.distance_km} كم · دفع كاش</Text>
            </>
          ) : (
            <Text style={styles.fareSub}>حدّد النقطتين لعرض السعر</Text>
          )}
        </View>

        <TouchableOpacity activeOpacity={0.9} onPress={submit} disabled={submitting || !quote}>
          <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.submit, (submitting || !quote) && { opacity: 0.6 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.submitTxt}>اطلب الآن {quote ? `· ${quote.fare} ₪` : ''}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt: { color: C.sub, fontSize: 15, fontWeight: '600' },
  segment: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, padding: 5, gap: 5, borderWidth: 1, borderColor: C.border },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  segActive: { backgroundColor: C.primary },
  segTxt: { fontWeight: '800', color: C.sub, fontSize: 14 },
  segTxtActive: { color: '#fff' },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border, ...C.shadow.soft },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 15, fontWeight: '800', color: C.text },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.sec, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  miniBtnTxt: { color: C.primary, fontWeight: '800', fontSize: 12 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 14, backgroundColor: C.inputBg, color: C.text },
  sizeRow: { flexDirection: 'row', gap: 8 },
  sizeBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.inputBg },
  sizeActive: { backgroundColor: C.primary, borderColor: C.primary },
  sizeTxt: { fontWeight: '800', color: C.text, fontSize: 14 },
  fareLabel: { color: C.sub, fontSize: 13, fontWeight: '600' },
  fare: { color: C.primary, fontSize: 34, fontWeight: '900', marginVertical: 2 },
  fareSub: { color: C.faint, fontSize: 12.5, fontWeight: '600' },
  submit: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', ...C.shadow.float },
  submitTxt: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
