import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, ScrollView, Switch, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { writeCache } from '../utils/cache';
import { KB_TOOLBAR_H } from '../config';
import { useTheme } from '../context/ThemeContext';
import GradientHeader from '../components/GradientHeader';
import MapPicker from '../components/MapPicker';
import FloatingField from '../components/FloatingField';
import { FadeIn, PopIn, GradientButton } from '../components/Anim';
import { Chip } from '../components/UI';

const LABELS = [{ k: 'المنزل', e: '🏠' }, { k: 'العمل', e: '💼' }, { k: 'أخرى', e: '📍' }];

export default function AddAddressScreen({ navigation, route }) {
  const editing = route?.params?.address || null;
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const initialLabel = editing?.label && LABELS.some(l => l.k === editing.label) ? editing.label : (editing?.label ? 'أخرى' : 'المنزل');
  const [label, setLabel] = useState(initialLabel);
  const [customLabel, setCustomLabel] = useState(editing?.label && !LABELS.some(l => l.k === editing.label) ? editing.label : '');
  const [details, setDetails] = useState(editing?.address || '');
  const [floor, setFloor] = useState(editing?.floor ? String(editing.floor) : '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [isDefault, setIsDefault] = useState(editing ? !!editing.is_default : !!route?.params?.makeDefault);
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState(editing?.lat && editing?.lng ? { lat: parseFloat(editing.lat), lng: parseFloat(editing.lng) } : null);
  const [locating, setLocating] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const mapRef = useRef(null);

  // تحريك الخريطة من المستخدم = اختيار صريح للموقع (لا تعبئة تلقائية بمركز افتراضي)
  const onCenterChange = useCallback((c, byUser) => { if (byUser) setCoords(c); }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('إذن الموقع', 'فعّل إذن الموقع، أو حرّك الخريطة وحدد موقعك يدوياً'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setCoords(c);
      mapRef.current?.setView(c.lat, c.lng, 17);
    } catch { Alert.alert('خطأ', 'تعذّر تحديد موقعك — حرّك الخريطة وحدد الموقع يدوياً'); }
    finally { setLocating(false); }
  };

  const save = async () => {
    if (!coords) return Alert.alert('حدّد الموقع', 'حرّك الخريطة حتى يصير الدبوس فوق عنوانك، أو اضغط "موقعي الحالي"');
    if (!details.trim()) return Alert.alert('تفاصيل العنوان', 'أدخل تفاصيل العنوان (الشارع، المبنى، المنطقة)');
    const finalLabel = label === 'أخرى' ? (customLabel.trim() || 'أخرى') : label;
    setSaving(true);
    const body = {
      label: finalLabel, title: finalLabel, address: details.trim(),
      floor: floor.trim() || null, notes: notes.trim() || null,
      lat: coords.lat, lng: coords.lng, is_default: isDefault,
    };
    try {
      let newId = null;
      if (editing) await api.put(`/users/addresses/${editing.id}`, body);
      else {
        const r = await api.post('/users/addresses', body);
        newId = r?.data?.id ?? r?.id ?? null;
      }
      let list = null;
      try { const d = await api.get('/users/addresses'); list = d.data || []; writeCache('addresses', list); } catch {}
      // سيرفر ما رجّع id؟ العنوان الجديد = اللي ما كان موجود قبل
      if (!editing && newId == null && Array.isArray(list)) {
        const before = new Set((route?.params?.prevIds || []).map(String));
        const fresh = list.filter(a => !before.has(String(a.id)));
        if (fresh.length === 1 || (fresh.length && !before.size)) newId = fresh.sort((a, b) => Number(b.id) - Number(a.id))[0].id;
      }
      // السلة بتختار العنوان الجديد تلقائياً (بدل ما ينبعت الطلب عالعنوان القديم)
      if (newId != null) writeCache('new_address', { id: newId, at: Date.now() });
      navigation.goBack();
    } catch (e) { Alert.alert('تعذّر حفظ العنوان', e?.message || 'حاول مرة أخرى'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? KB_TOOLBAR_H : 0}>
      <GradientHeader title={editing ? 'تعديل العنوان' : 'إضافة عنوان'} subtitle="حرّك الخريطة لوضع الدبوس على موقعك" />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEnabled={scrollEnabled}>
        <View style={styles.card}>
          <MapPicker
            ref={mapRef}
            initial={coords}
            height={250}
            onCenterChange={onCenterChange}
            onTouchStart={() => setScrollEnabled(false)}
            onTouchEnd={() => setScrollEnabled(true)}
          />
          <View style={styles.mapFooter}>
            <View style={{ flex: 1 }}>
              <PopIn key={coords ? 'ok' : 'no'} from={0.9} style={[styles.statePill, { backgroundColor: coords ? COLORS.successBg : COLORS.inputBg }]}>
                <Ionicons name={coords ? 'checkmark-circle' : 'location-outline'} size={14} color={coords ? COLORS.green : COLORS.gray} />
                <Text style={[styles.mapState, { color: coords ? COLORS.successText : COLORS.gray }]}>{coords ? 'تم تحديد الموقع' : 'لم يتم تحديد الموقع بعد'}</Text>
              </PopIn>
              <Text style={styles.mapHint}>حرّك الخريطة أو استخدم موقعك الحالي</Text>
            </View>
            <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locating} accessibilityRole="button" accessibilityLabel="استخدم موقعي الحالي">
              {locating ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="locate" size={18} color={COLORS.primary} />}
              <Text style={styles.locBtnTxt}>موقعي الحالي</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FadeIn delay={80}>
          <Text style={styles.sectionTitle}>نوع العنوان</Text>
          <View style={styles.labelRow}>
            {LABELS.map(l => (
              <Chip key={l.k} emoji={l.e} label={l.k} selected={label === l.k} onPress={() => setLabel(l.k)} style={{ flex: 1 }} accessibilityLabel={l.k} />
            ))}
          </View>
          {label === 'أخرى' && (
            <FloatingField style={{ marginTop: 10 }} icon="pricetag-outline" label="اسم العنوان (مثال: بيت أهلي)"
              value={customLabel} onChangeText={setCustomLabel} maxLength={30} />
          )}
        </FadeIn>

        <FadeIn delay={120} style={{ gap: 12 }}>
          <FloatingField icon="map-outline" label="تفاصيل العنوان *" placeholder="الشارع، المبنى، المنطقة..."
            value={details} onChangeText={setDetails} multiline maxLength={250} valid={details.trim().length > 3} />
          <FloatingField icon="business-outline" label="الطابق / الشقة" placeholder="مثال: الطابق 3، شقة 5"
            value={floor} onChangeText={setFloor} maxLength={40} />
          <FloatingField icon="chatbox-ellipses-outline" label="ملاحظات للسائق" placeholder="مثال: اتصل عند الوصول..."
            value={notes} onChangeText={setNotes} multiline maxLength={200} />
        </FadeIn>

        {/* نفس ترتيب باقي صفوف الإعدادات (RTL): أيقونة يمين ← نص ← مفتاح يسار */}
        <FadeIn delay={160} style={styles.defaultRow}>
          <View style={styles.defIcon}><Ionicons name="star" size={16} color={COLORS.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.defaultTitle}>العنوان الافتراضي</Text>
            <Text style={styles.defaultSub}>يُختار تلقائياً بالسلة ويظهر بالرئيسية</Text>
          </View>
          <Switch value={isDefault} onValueChange={setIsDefault} trackColor={{ true: COLORS.primary, false: COLORS.border }} thumbColor="#FFF" accessibilityLabel="العنوان الافتراضي" />
        </FadeIn>

        <GradientButton title={editing ? 'حفظ التعديلات' : 'حفظ العنوان'} onPress={save} loading={saving}
          icon={<Ionicons name="checkmark-circle" size={20} color="#FFF" />} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 10, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  statePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, alignSelf: 'flex-end', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  defIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  mapFooter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingBottom: 2 },
  mapState: { fontSize: 13.5, fontWeight: '800', textAlign: 'right' },
  mapHint: { fontSize: 11.5, color: C.faint, marginTop: 4, textAlign: 'right' },
  locBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.sec, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.tintBorder },
  locBtnTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 10, textAlign: 'right' },
  labelRow: { flexDirection: 'row-reverse', gap: 8 },
  labelBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', backgroundColor: C.card },
  labelBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  labelText: { fontWeight: '700', color: C.text, fontSize: 13 },
  fieldLabel: { fontSize: 13, color: C.gray, marginBottom: 6, textAlign: 'right', fontWeight: '600' },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 12, fontSize: 14, backgroundColor: C.inputBg, color: C.text },
  defaultRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  defaultTitle: { fontSize: 14.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  defaultSub: { fontSize: 12, color: C.gray, marginTop: 2, textAlign: 'right' },
  saveBtn: { borderRadius: 18, padding: 17, alignItems: 'center', ...C.shadow.float },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
