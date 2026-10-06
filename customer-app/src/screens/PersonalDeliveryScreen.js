import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { isNetworkError, NETWORK_MESSAGE } from '../utils/api';
import { KB_TOOLBAR_H } from '../config';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import MapPicker from '../components/MapPicker';
import { Skeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { FadeIn, PopIn, Press, GradientButton } from '../components/Anim';
import { Chip, AnimatedNumber } from '../components/UI';
import { haptic } from '../utils/motion';

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
  const idemRef = useRef({ sig: null, key: null });

  const loadConfig = useCallback(() => {
    setCfg(null);
    api.get('/orders/personal/config')
      .then(d => setCfg(d?.data || { enabled: false }))
      .catch((e) => setCfg({ enabled: false, error: true, message: isNetworkError(e) ? NETWORK_MESSAGE : (e?.message || '') }));
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);

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

  // تسعير فوري عند توفر النقطتين — السعر حسب المسافة فقط (عدد الركاب/حجم الطرد ما بيغيّروه)
  const [quoteNonce, setQuoteNonce] = useState(0);
  const extrasRef = useRef({});
  extrasRef.current = { service_type: serviceType, passengers, parcel_size: parcelSize };
  useEffect(() => {
    if (!pickup || !dropoff) { setQuote(null); setQuoteErr(''); setQuoting(false); return; }
    let alive = true;
    setQuoting(true);
    const t = setTimeout(() => {
      api.post('/orders/personal/quote', {
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        ...extrasRef.current,
      }).then(d => { if (alive) { setQuote(d?.data || null); setQuoteErr(''); } })
        .catch(e => { if (alive) { setQuote(null); setQuoteErr(isNetworkError(e) ? NETWORK_MESSAGE : (e?.message || 'تعذّر حساب السعر')); } })
        .finally(() => { if (alive) setQuoting(false); });
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, quoteNonce]);

  const submit = async () => {
    if (!pickup) { switchMode('pickup'); return Alert.alert('تنبيه', 'حدّد نقطة الاستلام على الخريطة'); }
    if (!dropoff) { switchMode('dropoff'); return Alert.alert('تنبيه', 'حدّد نقطة التسليم على الخريطة'); }
    if (serviceType === 'parcel' && normalizePhone(recipientPhone).length < 9) return Alert.alert('تنبيه', 'أدخل رقم هاتف المستلِم بشكل صحيح');
    setSubmitting(true);
    try {
      const body = {
        service_type: serviceType,
        pickup_lat: pickup.lat, pickup_lng: pickup.lng, pickup_address: pickupAddr.trim(),
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng, delivery_address: dropAddr.trim(),
        recipient_name: recipientName.trim(), recipient_phone: normalizePhone(recipientPhone),
        parcel_desc: parcelDesc.trim(), parcel_size: parcelSize,
        passengers, notes: notes.trim(), payment_method: 'cash',
      };
      // نفس المفتاح لإعادة نفس الطلب (انقطع الرد؟ السيرفر بيرجّع نفس الطلب بدل طلب مكرر)
      const sig = JSON.stringify(body);
      if (idemRef.current.sig !== sig) idemRef.current = { sig, key: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` };
      const key = idemRef.current.key;
      const d = await api.post('/orders/personal', { ...body, client_ref: key }, { headers: { 'Idempotency-Key': key } });
      idemRef.current = { sig: null, key: null };
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
        <EmptyState emoji={cfg.error ? '📡' : '🛵'} icon={cfg.error ? 'cloud-offline-outline' : 'time-outline'} tone={cfg.error ? 'error' : undefined}
          title={cfg.error ? 'تعذّر الاتصال' : 'الخدمة غير متاحة حالياً'}
          subtitle={cfg.error ? (cfg.message || 'تأكد من الإنترنت وحاول مرة ثانية') : 'خدمة التوصيل الشخصي متوقفة مؤقتاً، رجّع بعد شوي'}
          ctaLabel={cfg.error ? 'إعادة المحاولة' : 'رجوع'} onCta={cfg.error ? loadConfig : () => navigation.goBack()} />
        {cfg.error && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginBottom: insets.bottom + 30, padding: 8 }} accessibilityRole="button">
            <Text style={{ color: C.gray, fontWeight: '700', fontSize: 14 }}>رجوع</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // دالة (مش مكوّن) حتى ما يفقد حقل الوصف التركيز مع كل حرف
  const renderPointRow = ({ which, point, addr, setAddr, color, label }) => (
    <View style={[styles.pointRow, mode === which && { borderColor: C.primary, backgroundColor: C.tint }]}>
      <TouchableOpacity style={styles.pointHead} onPress={() => switchMode(which)} accessibilityRole="button" accessibilityLabel={`تحديد ${label}`}>
        <View style={[styles.pointDot, { backgroundColor: color }]} />
        <Text style={styles.pointLabel}>{label}</Text>
        <View style={[styles.statePill, { backgroundColor: point ? C.successBg : C.inputBg }]}>
          <Ionicons name={point ? 'checkmark-circle' : 'ellipse-outline'} size={12} color={point ? C.green : C.faint} />
          <Text style={[styles.pointState, { color: point ? C.successText : C.faint }]}>{point ? 'محددة' : 'غير محددة'}</Text>
        </View>
        <Ionicons name="create-outline" size={16} color={C.primary} />
      </TouchableOpacity>
      <TextInput style={styles.input} placeholder={`وصف ${label} (اختياري)`} placeholderTextColor={C.faint}
        value={addr} onChangeText={setAddr} textAlign="right" maxLength={150} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? KB_TOOLBAR_H : 0}>
      <GradientHeader title="طلب شخصي" subtitle="وصّل طرد أو اطلب سائق يوصّلك" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 16 }} keyboardShouldPersistTaps="handled" scrollEnabled={scrollEnabled}>

        {/* نوع الخدمة */}
        <FadeIn style={styles.segment}>
          {[['parcel', 'توصيل طرد', 'cube', 'ظرف، أغراض، أدوية'], ['ride', 'توصيل راكب', 'person', 'سائق يوصّلك لوجهتك']].map(([k, l, ic, sub]) => {
            const on = serviceType === k;
            return (
              <Press key={k} style={[styles.segBtn, on && styles.segActive]} scaleTo={0.96} onPress={() => { haptic.select(); setServiceType(k); }}
                accessibilityRole="radio" accessibilityLabel={l}>
                {on && <LinearGradient colors={C.gradients.info} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                <View style={[styles.segIcon, on && { backgroundColor: 'rgba(255,255,255,0.25)' }]}><Ionicons name={ic} size={20} color={on ? '#FFF' : C.info} /></View>
                <Text style={[styles.segTxt, on && styles.segTxtActive]}>{l}</Text>
                <Text style={[styles.segSub, on && { color: 'rgba(255,255,255,0.88)' }]} numberOfLines={1}>{sub}</Text>
              </Press>
            );
          })}
        </FadeIn>

        {/* خريطة واحدة + تبديل الاستلام/التسليم */}
        <View style={styles.card}>
          <View style={styles.modeToggle}>
            {[['pickup', 'الاستلام', 'radio-button-on', C.green], ['dropoff', 'التسليم', 'flag', C.red]].map(([k, l, ic, col]) => (
              <TouchableOpacity key={k} style={[styles.modeBtn, mode === k && styles.modeBtnOn]} onPress={() => { haptic.select(); switchMode(k); }}
                accessibilityRole="tab" accessibilityState={{ selected: mode === k }}>
                <Ionicons name={ic} size={14} color={mode === k ? '#FFF' : col} />
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
                <Chip key={k} label={l} icon="cube-outline" selected={parcelSize === k} onPress={() => setParcelSize(k)} style={{ flex: 1 }} />
              ))}
            </View>
            <TextInput style={styles.input} placeholder="اسم المستلِم" placeholderTextColor={C.faint}
              value={recipientName} onChangeText={setRecipientName} textAlign="right" maxLength={60} />
            <TextInput style={styles.input} placeholder="رقم جوال المستلِم *" placeholderTextColor={C.faint}
              value={recipientPhone} onChangeText={setRecipientPhone} keyboardType="phone-pad" textAlign="right" maxLength={15} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>عدد الركّاب</Text>
            <View style={styles.sizeRow}>
              {[1, 2, 3, 4].map(n => (
                <Chip key={n} label={String(n)} icon="person-outline" selected={passengers === n} onPress={() => setPassengers(n)} style={{ flex: 1 }} />
              ))}
            </View>
            <TextInput style={styles.input} placeholder="ملاحظات للسائق (اختياري)" placeholderTextColor={C.faint}
              value={notes} onChangeText={setNotes} textAlign="right" maxLength={200} />
          </View>
        )}

        {/* السعر */}
        {quote && !quoting ? (
          <PopIn from={0.94}>
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fareCard}>
              <LinearGradient colors={C.gradients.sheen} style={styles.fareSheen} pointerEvents="none" />
              <Text style={styles.fareLabel}>السعر التقديري</Text>
              <AnimatedNumber value={parseFloat(quote.fare) || 0} decimals={(parseFloat(quote.fare) || 0) % 1 ? 2 : 0} suffix=" ₪" style={styles.fare} />
              <View style={styles.fareChips}>
                <View style={styles.fareChip}><Ionicons name="navigate" size={12} color="#FFF" /><Text style={styles.fareChipTxt}>≈ {quote.distance_km} كم</Text></View>
                <View style={styles.fareChip}><Ionicons name="cash" size={12} color="#FFF" /><Text style={styles.fareChipTxt}>دفع كاش</Text></View>
              </View>
            </LinearGradient>
          </PopIn>
        ) : (
          <View style={[styles.card, { alignItems: 'center' }]}>
            {quoting ? <Skeleton w={140} h={34} r={12} /> : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Ionicons name={quoteErr ? 'alert-circle-outline' : 'map-outline'} size={26} color={quoteErr ? C.red : C.faint} />
                <Text style={[styles.fareSub, quoteErr && { color: C.red }]}>{quoteErr || 'حدّد نقطتي الاستلام والتسليم لعرض السعر'}</Text>
                {!!quoteErr && pickup && dropoff && (
                  <TouchableOpacity onPress={() => setQuoteNonce(n => n + 1)} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ color: C.primary, fontWeight: '800', fontSize: 13 }}>حاول مجدداً</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* السعر القديم ما بينعرض والزر معطّل وهو عم يحسب السعر الجديد */}
        <GradientButton title={quoting ? 'جاري حساب السعر…' : `اطلب الآن${quote ? ` · ${quote.fare} ₪` : ''}`} onPress={submit} loading={submitting} disabled={!quote || quoting}
          icon={<Ionicons name="flash" size={18} color="#FFF" />} height={58} textStyle={{ fontSize: 17 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyTxt: { color: C.sub, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  segment: { flexDirection: 'row-reverse', gap: 10 },
  segBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 10, borderRadius: 22, alignItems: 'center', gap: 6, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden' },
  segActive: { borderColor: 'transparent', ...C.shadow.card },
  segIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: C.infoBg, alignItems: 'center', justifyContent: 'center' },
  segSub: { fontSize: 11, color: C.faint, fontWeight: '500' },
  segTxt: { fontWeight: '900', color: C.text, fontSize: 14.5 },
  segTxtActive: { color: '#fff' },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  statePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  fareCard: { borderRadius: 26, padding: 20, alignItems: 'center', overflow: 'hidden', ...C.shadow.float },
  fareSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 50 },
  fareChips: { flexDirection: 'row-reverse', gap: 8, marginTop: 8 },
  fareChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.14)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  fareChipTxt: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  modeToggle: { flexDirection: 'row-reverse', backgroundColor: C.inputBg, borderRadius: 14, padding: 4, gap: 4 },
  modeBtn: { flex: 1, flexDirection: 'row-reverse', paddingVertical: 10, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 5 },
  modeBtnOn: { backgroundColor: C.primary },
  modeTxt: { fontWeight: '800', color: C.text, fontSize: 13.5 },
  hint: { fontSize: 12, color: C.sub, textAlign: 'right', lineHeight: 18 },
  mapActions: { flexDirection: 'row-reverse', gap: 8 },
  confirmBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, ...C.shadow.glow },
  confirmTxt: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  miniBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: C.sec, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.tintBorder },
  miniBtnTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  pointRow: { borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 10, gap: 8 },
  pointHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  pointDot: { width: 12, height: 12, borderRadius: 6 },
  pointLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  pointState: { fontSize: 12, fontWeight: '800' },
  label: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, fontSize: 14, backgroundColor: C.inputBg, color: C.text },
  sizeRow: { flexDirection: 'row-reverse', gap: 8 },
  sizeBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.inputBg },
  sizeActive: { backgroundColor: C.primary, borderColor: C.primary },
  sizeTxt: { fontWeight: '800', color: C.text, fontSize: 14 },
  fareLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
  fare: { color: '#FFF', fontSize: 38, fontWeight: '900', marginVertical: 2 },
  fareSub: { color: C.faint, fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  submit: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', ...C.shadow.float },
  submitTxt: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
