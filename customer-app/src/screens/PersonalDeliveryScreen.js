import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import MapPicker from '../components/MapPicker';
import { Skeleton } from '../components/Skeleton';

const normalizePhone = (p) => (p || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

export default function PersonalDeliveryScreen({ navigation }) {
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [cfg, setCfg] = useState(null);
  const [serviceType, setServiceType] = useState('parcel'); // 'parcel' | 'ride'
  const [mode, setMode] = useState('pickup');                // أي نقطة نحددها الآن على الخريطة
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [pickupAddr, setPickupAddr] = useState('');
  const [dropAddr, setDropAddr] = useState('');
  const [centerTouched, setCenterTouched] = useState(false);
  const [locating, setLocating] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
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
  const [quoteErr, setQuoteErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const mapRef = useRef(null);
  const centerRef = useRef(null);

  useEffect(() => {
    api.get('/orders/personal/config')
      .then(d => setCfg(d?.data || { enabled: false }))
      .catch(() => setCfg({ enabled: false, error: true }));
  }, []);

  const onCenterChange = useCallback((c, byUser) => {
    centerRef.current = c;
    if (byUser) setCenterTouched(true);
  }, []);

  const setPoint = (which, c) => {
    if (which === 'pickup') { setPickup(c); if (!dropoff) setMode('dropoff'); }
    else setDropoff(c);
    setCenterTouched(false);
  };

  const confirmHere = () => {
    if (!centerTouched || !centerRef.current) {
      Alert.alert('حدّد النقطة', 'حرّك الخريطة لحتى يصير الدبوس فوق المكان، أو اضغط "موقعي"');
      return;
    }
    setPoint(mode, centerRef.current);
  };

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('إذن الموقع', 'فعّل إذن الموقع، أو حرّك الخريطة وحدد النقطة يدوياً'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      mapRef.current?.setView(c.lat, c.lng, 17);
      centerRef.current = c;
      setPoint(mode, c);
    } catch { Alert.alert('خطأ', 'تعذّر تحديد موقعك — حدّد النقطة يدوياً على الخريطة'); }
    finally { setLocating(false); }
  }, [mode, dropoff]);

  const switchMode = (m) => {
    setMode(m);
    setCenterTouched(false);
    const p = m === 'pickup' ? pickup : dropoff;
    if (p) mapRef.current?.setView(p.lat, p.lng, 16);
  };

  // تسعير فوري عند توفر النقطتين
  useEffect(() => {
    if (!pickup || !dropoff) { setQuote(null); setQuoteErr(''); return; }
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api.post('/orders/personal/quote', {
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        service_type: serviceType, passengers, parcel_size: parcelSize,
      }).then(d => { if (alive) { setQuote(d?.data || null); setQuoteErr(''); } })
        .catch(e => { if (alive) { setQuote(null); setQuoteErr(e?.message || 'تعذّر حساب السعر'); } })
        .finally(() => { if (alive) setQuoting(false); });
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [pickup, dropoff, serviceType, passengers, parcelSize]);

  const submit = async () => {
    if (!pickup) { switchMode('pickup'); return Alert.alert('تنبيه', 'حدّد نقطة الاستلام على الخريطة'); }
    if (!dropoff) { switchMode('dropoff'); return Alert.alert('تنبيه', 'حدّد نقطة التسليم على الخريطة'); }
    if (serviceType === 'parcel' && normalizePhone(recipientPhone).length < 9) return Alert.alert('تنبيه', 'أدخل رقم هاتف المستلِم بشكل صحيح');
    setSubmitting(true);
    try {
      const d = await api.post('/orders/personal', {
        service_type: serviceType,
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickupAddr.trim(),
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, delivery_address: dropAddr.trim(),
        recipient_name: recipientName.trim(), recipient_phone: normalizePhone(recipientPhone),
        parcel_desc: parcelDesc.trim(), parcel_size: parcelSize,
        passengers, notes: notes.trim(), payment_method: 'cash',
      });
      const order = d?.data;
      Alert.alert('✅ تم إرسال الطلب', 'عم نبحث عن سائق قريب منك...', [
        { text: 'تتبّع الطلب', onPress: () => navigation.replace('OrderTracking', { orderId: order?.id, fromCheckout: true }) },
      ], { cancelable: false });
    } catch (e) {
      Alert.alert('خطأ', e?.message || 'تعذّر إنشاء الطلب');
    } finally { setSubmitting(false); }
  };

  if (!cfg) {
    return (
      <View style={styles.container}>
        <GradientHeader title="طلب شخصي" />
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton w={'100%'} h={50} r={16} />
          <Skeleton w={'100%'} h={260} r={18} />
          <Skeleton w={'100%'} h={120} r={18} />
        </View>
      </View>
    );
  }

  if (cfg.enabled === false) {
    return (
      <View style={styles.container}>
        <GradientHeader title="طلب شخصي" />
        <View style={styles.centered}>
          <Ionicons name={cfg.error ? 'cloud-offline-outline' : 'time-outline'} size={60} color={C.faint} />
          <Text style={styles.emptyTxt}>{cfg.error ? 'تعذّر الاتصال — حاول مرة ثانية' : 'خدمة التوصيل الشخصي غير متاحة حالياً'}</Text>
        </View>
      </View>
    );
  }

  // دالة (مش مكوّن) حتى ما يفقد حقل الوصف التركيز مع كل حرف
  const renderPointRow = ({ which, point, addr, setAddr, color, label }) => (
    <View style={[styles.pointRow, mode === which && { borderColor: C.primary, backgroundColor: C.tint }]}>
      <TouchableOpacity style={styles.pointHead} onPress={() => switchMode(which)} accessibilityRole="button" accessibilityLabel={`تحديد ${label}`}>
        <View style={[styles.pointDot, { backgroundColor: color }]} />
        <Text style={styles.pointLabel}>{label}</Text>
        <Text style={[styles.pointState, { color: point ? C.green : C.faint }]}>{point ? '✓ محددة' : 'غير محددة'}</Text>
        <Ionicons name="create-outline" size={16} color={C.primary} />
      </TouchableOpacity>
      <TextInput style={styles.input} placeholder={`وصف ${label} (اختياري)`} placeholderTextColor={C.faint}
        value={addr} onChangeText={setAddr} textAlign="right" maxLength={150} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GradientHeader title="طلب شخصي" subtitle="وصّل طرد أو اطلب سائق يوصّلك" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>

        {/* نوع الخدمة */}
        <View style={styles.segment}>
          {[['parcel', '📦 توصيل طرد'], ['ride', '🧍 توصيل راكب']].map(([k, l]) => (
            <TouchableOpacity key={k} style={[styles.segBtn, serviceType === k && styles.segActive]} onPress={() => setServiceType(k)}
              accessibilityRole="radio" accessibilityState={{ selected: serviceType === k }}>
              <Text style={[styles.segTxt, serviceType === k && styles.segTxtActive]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* خريطة واحدة + تبديل الاستلام/التسليم */}
        <View style={styles.card}>
          <View style={styles.modeToggle}>
            {[['pickup', '🟢 الاستلام'], ['dropoff', '🏁 التسليم']].map(([k, l]) => (
              <TouchableOpacity key={k} style={[styles.modeBtn, mode === k && styles.modeBtnOn]} onPress={() => switchMode(k)}
                accessibilityRole="tab" accessibilityState={{ selected: mode === k }}>
                <Text style={[styles.modeTxt, mode === k && { color: '#FFF' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>حرّك الخريطة لحد ما يصير الدبوس 📍 فوق {mode === 'pickup' ? 'نقطة الاستلام' : 'نقطة التسليم'}، ثم اضغط تثبيت</Text>
          <MapPicker
            ref={mapRef}
            height={260}
            onCenterChange={onCenterChange}
            markers={{ pickup, dropoff }}
            onTouchStart={() => setScrollEnabled(false)}
            onTouchEnd={() => setScrollEnabled(true)}
          />
          <View style={styles.mapActions}>
            <TouchableOpacity style={[styles.confirmBtn, !centerTouched && { opacity: 0.55 }]} onPress={confirmHere} accessibilityRole="button">
              <Ionicons name="pin" size={16} color="#FFF" />
              <Text style={styles.confirmTxt}>ثبّت {mode === 'pickup' ? 'الاستلام' : 'التسليم'} هنا</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.miniBtn} onPress={locate} disabled={locating} accessibilityRole="button" accessibilityLabel="استخدم موقعي">
              {locating ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="locate" size={16} color={C.primary} />}
              <Text style={styles.miniBtnTxt}>موقعي</Text>
            </TouchableOpacity>
          </View>
          {renderPointRow({ which: 'pickup', point: pickup, addr: pickupAddr, setAddr: setPickupAddr, color: C.green, label: 'نقطة الاستلام' })}
          {renderPointRow({ which: 'dropoff', point: dropoff, addr: dropAddr, setAddr: setDropAddr, color: C.red, label: 'نقطة التسليم' })}
        </View>

        {/* تفاصيل حسب النوع */}
        {serviceType === 'parcel' ? (
          <View style={styles.card}>
            <Text style={styles.label}>تفاصيل الطرد</Text>
            <TextInput style={styles.input} placeholder="وصف الطرد (مثال: ظرف / كيس أدوية)" placeholderTextColor={C.faint}
              value={parcelDesc} onChangeText={setParcelDesc} textAlign="right" maxLength={150} />
            <View style={styles.sizeRow}>
              {[['small', 'صغير'], ['medium', 'وسط'], ['large', 'كبير']].map(([k, l]) => (
                <TouchableOpacity key={k} style={[styles.sizeBtn, parcelSize === k && styles.sizeActive]} onPress={() => setParcelSize(k)}>
                  <Text style={[styles.sizeTxt, parcelSize === k && { color: '#fff' }]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="اسم المستلِم" placeholderTextColor={C.faint}
              value={recipientName} onChangeText={setRecipientName} textAlign="right" maxLength={60} />
            <TextInput style={styles.input} placeholder="رقم هاتف المستلِم *" placeholderTextColor={C.faint}
              value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" textAlign="right" maxLength={15} />
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
              value={notes} onChangeText={setNotes} textAlign="right" maxLength={200} />
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
            <Text style={[styles.fareSub, quoteErr && { color: C.red }]}>{quoteErr || 'حدّد نقطتي الاستلام والتسليم لعرض السعر'}</Text>
          )}
        </View>

        <TouchableOpacity activeOpacity={0.9} onPress={submit} disabled={submitting || !quote} accessibilityRole="button">
          <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.submit, (submitting || !quote) && { opacity: 0.6 }]}>
            {submitting ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.submitTxt}>اطلب الآن {quote ? `· ${quote.fare} ₪` : ''}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyTxt: { color: C.sub, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  segment: { flexDirection: 'row-reverse', backgroundColor: C.card, borderRadius: 16, padding: 5, gap: 5, borderWidth: 1, borderColor: C.border },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  segActive: { backgroundColor: C.primary },
  segTxt: { fontWeight: '800', color: C.sub, fontSize: 14 },
  segTxtActive: { color: '#fff' },
  card: { backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 12, borderWidth: 1, borderColor: C.border, ...C.shadow.soft },
  modeToggle: { flexDirection: 'row-reverse', backgroundColor: C.inputBg, borderRadius: 14, padding: 4, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  modeBtnOn: { backgroundColor: C.primary },
  modeTxt: { fontWeight: '800', color: C.text, fontSize: 13.5 },
  hint: { fontSize: 12, color: C.sub, textAlign: 'right', lineHeight: 18 },
  mapActions: { flexDirection: 'row-reverse', gap: 8 },
  confirmBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 12 },
  confirmTxt: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  miniBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: C.sec, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.tintBorder },
  miniBtnTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  pointRow: { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 10, gap: 8 },
  pointHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  pointDot: { width: 12, height: 12, borderRadius: 6 },
  pointLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  pointState: { fontSize: 12, fontWeight: '800' },
  label: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'right' },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 14, backgroundColor: C.inputBg, color: C.text },
  sizeRow: { flexDirection: 'row-reverse', gap: 8 },
  sizeBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.inputBg },
  sizeActive: { backgroundColor: C.primary, borderColor: C.primary },
  sizeTxt: { fontWeight: '800', color: C.text, fontSize: 14 },
  fareLabel: { color: C.sub, fontSize: 13, fontWeight: '600' },
  fare: { color: C.primary, fontSize: 34, fontWeight: '900', marginVertical: 2 },
  fareSub: { color: C.faint, fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  submit: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', ...C.shadow.float },
  submitTxt: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
