import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../utils/api';
import { useSocket } from '../utils/socket';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', bg: '#F8F9FA' };

const STEPS = [
  { status: 'confirmed', label: 'انطلق للمطعم', icon: '🏍️' },
  { status: 'picked_up', label: 'استلم الطلب', icon: '📦' },
  { status: 'delivered', label: 'تم التوصيل', icon: '✅' },
];

export default function DeliveryScreen({ route, navigation }) {
  const { order } = route.params;
  const [location, setLocation] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const mapRef = useRef(null);
  const socket = useSocket();

  useEffect(() => {
    const interval = setInterval(async () => {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setLocation({ latitude, longitude });
      socket?.emit('driver:location', { orderId: order.id, lat: latitude, lng: longitude });
    }, 5000);
    return () => clearInterval(interval);
  }, [order.id]);

  const nextStep = async () => {
    const step = STEPS[currentStep];
    try {
      await api.patch(`/orders/${order.id}/status`, { status: step.status });
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(c => c + 1);
      } else {
        Alert.alert('رائع!', 'تم إكمال التوصيل بنجاح', [{ text: 'حسناً', onPress: () => navigation.goBack() }]);
      }
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
  };

  const callCustomer = () => Linking.openURL(`tel:${order.customer_phone}`);
  const callRestaurant = () => Linking.openURL(`tel:${order.restaurant_phone}`);
  const openMaps = (lat, lng, label) => Linking.openURL(`https://maps.google.com/?daddr=${lat},${lng}&label=${label}`);

  const restaurantCoord = { latitude: parseFloat(order.restaurant_lat), longitude: parseFloat(order.restaurant_lng) };
  const deliveryCoord = { latitude: parseFloat(order.delivery_lat), longitude: parseFloat(order.delivery_lng) };
  const target = currentStep === 0 ? restaurantCoord : deliveryCoord;

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map} provider={PROVIDER_GOOGLE} initialRegion={{ ...target, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
        {location && <Marker coordinate={location} title="أنت"><View style={styles.driverMarker}><Text style={{ fontSize: 18 }}>🏍️</Text></View></Marker>}
        <Marker coordinate={restaurantCoord} title={order.restaurant_name}><View style={styles.markerBox}><Text style={{ fontSize: 16 }}>🏪</Text></View></Marker>
        <Marker coordinate={deliveryCoord} title="موقع التوصيل"><View style={styles.markerBox}><Text style={{ fontSize: 16 }}>📍</Text></View></Marker>
        {location && <Polyline coordinates={[location, target]} strokeColor={COLORS.primary} strokeWidth={3} lineDashPattern={[6, 3]} />}
      </MapView>

      {/* Order Card */}
      <View style={styles.card}>
        {/* Steps */}
        <View style={styles.stepsRow}>
          {STEPS.map((s, i) => (
            <View key={i} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= currentStep && { backgroundColor: COLORS.primary }]}>
                <Text style={{ fontSize: 10 }}>{s.icon}</Text>
              </View>
              <Text style={[styles.stepLabel, i <= currentStep && { color: COLORS.primary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Order Info */}
        <View style={styles.orderInfo}>
          <View>
            <Text style={styles.restaurantName}>{order.restaurant_name}</Text>
            <Text style={styles.customerName}>زبون: {order.customer_name}</Text>
            <Text style={styles.address} numberOfLines={2}>{order.delivery_address}</Text>
          </View>
          <Text style={styles.amount}>{parseFloat(order.delivery_fee || 0).toFixed(2)}₪</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.iconBtn} onPress={callCustomer}>
            <Ionicons name="call" size={20} color={COLORS.primary} />
            <Text style={styles.iconBtnText}>الزبون</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={callRestaurant}>
            <Ionicons name="restaurant" size={20} color={COLORS.primary} />
            <Text style={styles.iconBtnText}>المطعم</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => openMaps(target.latitude, target.longitude, 'الوجهة')}>
            <Ionicons name="navigate" size={20} color={COLORS.primary} />
            <Text style={styles.iconBtnText}>خريطة</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={nextStep}>
          <Text style={styles.nextBtnText}>{currentStep < STEPS.length - 1 ? STEPS[currentStep].label : 'تم التوصيل ✅'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  driverMarker: { backgroundColor: COLORS.primary, padding: 6, borderRadius: 20, borderWidth: 2, borderColor: '#FFF' },
  markerBox: { backgroundColor: '#FFF', padding: 6, borderRadius: 10, elevation: 3 },
  card: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34, elevation: 20 },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontSize: 9, color: COLORS.gray, textAlign: 'center', fontWeight: '600' },
  orderInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  restaurantName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  customerName: { fontSize: 13, color: COLORS.gray, marginTop: 2 },
  address: { fontSize: 12, color: COLORS.gray, marginTop: 4, maxWidth: 220 },
  amount: { fontSize: 22, fontWeight: '900', color: COLORS.primary },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  iconBtn: { flex: 1, alignItems: 'center', backgroundColor: '#FFF5EE', borderRadius: 12, padding: 10, gap: 4, borderWidth: 1, borderColor: '#FFE0CC' },
  iconBtnText: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  nextBtn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center' },
  nextBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
