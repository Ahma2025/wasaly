import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Alert, ScrollView, Keyboard, Platform, Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };
const LABELS = ['المنزل', 'العمل', 'أخرى'];

export default function AddAddressScreen({ navigation }) {
  const [label, setLabel] = useState('المنزل');
  const [details, setDetails] = useState('');
  const [floor, setFloor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);
  const [kbVisible, setKbVisible] = useState(false);

  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEv, e => {
      setKbHeight(e.endCoordinates.height);
      setKbVisible(true);
    });
    const hide = Keyboard.addListener(hideEv, () => setKbVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('تنبيه', 'نحتاج إذن الموقع'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      Alert.alert('✅', 'تم تحديد موقعك الحالي');
    } catch { Alert.alert('خطأ', 'فشل في تحديد الموقع'); }
    finally { setLocating(false); }
  };

  const save = async () => {
    if (!details.trim()) return Alert.alert('خطأ', 'أدخل تفاصيل العنوان');
    setSaving(true);
    try {
      await api.post('/users/addresses', {
        label, address: details, floor, notes,
        lat: coords?.lat || 31.9, lng: coords?.lng || 35.2
      });
      Alert.alert('✅', 'تم حفظ العنوان', [{ text: 'حسناً', onPress: () => navigation.goBack() }]);
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إضافة عنوان</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <TouchableOpacity style={styles.locBtn} onPress={useMyLocation} disabled={locating}>
          <Ionicons name="locate-outline" size={22} color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.locBtnTitle}>{locating ? 'جاري التحديد...' : 'استخدم موقعي الحالي'}</Text>
            {coords && <Text style={styles.locBtnSub}>📍 تم تحديد الموقع</Text>}
          </View>
          {coords && <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />}
        </TouchableOpacity>

        <View>
          <Text style={styles.sectionTitle}>نوع العنوان</Text>
          <View style={styles.labelRow}>
            {LABELS.map(l => (
              <TouchableOpacity key={l} style={[styles.labelBtn, label === l && styles.labelBtnActive]} onPress={() => setLabel(l)}>
                <Text style={[styles.labelText, label === l && { color: '#FFF' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>تفاصيل العنوان *</Text>
          <TextInput
            style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
            placeholder="الشارع، المبنى، المنطقة..."
            value={details} onChangeText={setDetails}
            multiline numberOfLines={3} textAlign="right"
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>الطابق</Text>
            <TextInput style={styles.input} placeholder="مثال: 3"
              value={floor} onChangeText={setFloor} keyboardType="number-pad" textAlign="right" />
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>ملاحظات للسائق</Text>
          <TextInput style={styles.input} placeholder="مثال: اتصل عند الوصول..."
            value={notes} onChangeText={setNotes} multiline textAlign="right" />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : 'حفظ العنوان'}</Text>
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* iOS-style keyboard toolbar */}
      {kbVisible && (
        <View style={[styles.kbToolbar, { bottom: kbHeight }]}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>تم</Text>
          </TouchableOpacity>
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
  locBtn: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#FFE0CC', elevation: 1 },
  locBtnTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  locBtnSub: { fontSize: 12, color: COLORS.primary, marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  labelRow: { flexDirection: 'row', gap: 8 },
  labelBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', alignItems: 'center', backgroundColor: '#FFF' },
  labelBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  labelText: { fontWeight: '700', color: COLORS.text, fontSize: 13 },
  fieldLabel: { fontSize: 13, color: COLORS.gray, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 12, padding: 12, fontSize: 14, backgroundColor: '#FFF', color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  kbToolbar: {
    position: 'absolute', left: 0, right: 0, height: 44,
    backgroundColor: '#D1D5DB',
    borderTopWidth: 0.5, borderTopColor: '#A0A0A8',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8,
  },
  doneBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  doneBtnText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
});
