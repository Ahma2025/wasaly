import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

const LABELS = ['المنزل', 'العمل', 'أخرى'];

export default function AddAddressScreen({ navigation }) {
  const [coords, setCoords] = useState({ latitude: 31.9, longitude: 35.2 });
  const [label, setLabel] = useState('المنزل');
  const [details, setDetails] = useState('');
  const [floor, setFloor] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);

  const useMyLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { latitude, longitude } = loc.coords;
    setCoords({ latitude, longitude });
    mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
  };

  const save = async () => {
    if (!details.trim()) return Alert.alert('خطأ', 'أدخل تفاصيل العنوان');
    setSaving(true);
    try {
      await api.post('/users/addresses', {
        label, address: details, floor, notes,
        lat: coords.latitude, lng: coords.longitude
      });
      navigation.goBack();
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          onRegionChangeComplete={r => setCoords({ latitude: r.latitude, longitude: r.longitude })}
        >
          <Marker coordinate={coords} />
        </MapView>
        <TouchableOpacity style={styles.locationBtn} onPress={useMyLocation}>
          <Ionicons name="locate" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Form */}
      <ScrollView style={styles.form}>
        <Text style={styles.sectionTitle}>نوع العنوان</Text>
        <View style={styles.labelRow}>
          {LABELS.map(l => (
            <TouchableOpacity key={l} style={[styles.labelBtn, label === l && styles.labelBtnActive]} onPress={() => setLabel(l)}>
              <Text style={[styles.labelText, label === l && { color: '#FFF' }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>تفاصيل العنوان</Text>
        <TextInput style={styles.input} placeholder="الشارع، المبنى..." value={details} onChangeText={setDetails} multiline numberOfLines={2} />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.fieldLabel}>الطابق</Text>
            <TextInput style={styles.input} placeholder="مثال: 3" value={floor} onChangeText={setFloor} keyboardType="number-pad" />
          </View>
        </View>

        <Text style={styles.fieldLabel}>ملاحظات للسائق</Text>
        <TextInput style={styles.input} placeholder="مثال: اتصل عند الوصول..." value={notes} onChangeText={setNotes} multiline />

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'جاري الحفظ...' : 'حفظ العنوان'}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  mapContainer: { height: 280, position: 'relative' },
  map: { flex: 1 },
  locationBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: '#FFF', borderRadius: 12, padding: 10, elevation: 3 },
  form: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 16, marginBottom: 10 },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  labelBtn: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', alignItems: 'center', backgroundColor: '#FFF' },
  labelBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  labelText: { fontWeight: '700', color: COLORS.text, fontSize: 13 },
  fieldLabel: { fontSize: 13, color: COLORS.gray, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 12, padding: 12, fontSize: 14, backgroundColor: '#FFF', color: COLORS.text },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  saveBtn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
