import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Linking } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { io } from 'socket.io-client';
import api from '../utils/api';
import * as SecureStore from 'expo-secure-store';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759' };

const STATUS_STEPS = [
  { key: 'pending', label: 'في الانتظار', icon: 'time-outline' },
  { key: 'confirmed', label: 'تم القبول', icon: 'checkmark-circle-outline' },
  { key: 'preparing', label: 'يُحضَّر', icon: 'flame-outline' },
  { key: 'on_the_way', label: 'في الطريق', icon: 'bicycle-outline' },
  { key: 'delivered', label: 'تم التسليم', icon: 'gift-outline' }
];

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchOrder();
    setupSocket();
    startPulse();
    const interval = setInterval(fetchOrder, 30000);
    return () => { clearInterval(interval); socketRef.current?.disconnect(); };
  }, [id]);

  const startPulse = () => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
    ])).start();
  };

  const setupSocket = async () => {
    const token = await SecureStore.getItemAsync('token');
    const socket = io('http://localhost:5000', { auth: { token } });
    socketRef.current = socket;

    socket.on('order_status', ({ order_id, status }) => {
      if (order_id === id) setOrder(prev => ({ ...prev, status }));
    });

    socket.on('driver:location', ({ lat, lng }) => {
      setDriverLocation({ latitude: lat, longitude: lng });
    });
  };

  const fetchOrder = async () => {
    try {
      const data = await api.get(`/orders/${id}`);
      setOrder(data.data);
      if (data.data.driver_lat) {
        setDriverLocation({ latitude: parseFloat(data.data.driver_lat), longitude: parseFloat(data.data.driver_lng) });
      }
    } catch {}
  };

  const callDriver = () => {
    if (order?.driver_phone) Linking.openURL(`tel:${order.driver_phone}`);
  };

  if (!order) return <View style={styles.loading}><Text>جاري التحميل...</Text></View>;

  const currentStepIdx = STATUS_STEPS.findIndex(s => s.key === order.status);
  const isDelivered = order.status === 'delivered';

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ latitude: parseFloat(order.delivery_lat || 31.9), longitude: parseFloat(order.delivery_lng || 35.2), latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      >
        {driverLocation && (
          <Marker coordinate={driverLocation} title="المندوب">
            <View style={styles.driverMarker}><Text style={{ fontSize: 20 }}>🛵</Text></View>
          </Marker>
        )}
        {order.delivery_lat && (
          <Marker coordinate={{ latitude: parseFloat(order.delivery_lat), longitude: parseFloat(order.delivery_lng) }} title="موقعك">
            <View style={styles.destMarker}><Ionicons name="home" size={16} color="#FFF" /></View>
          </Marker>
        )}
      </MapView>

      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={COLORS.text} />
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderNum}>طلب #{order.order_number}</Text>
          <Text style={[styles.statusBadge, isDelivered && { backgroundColor: COLORS.green }]}>
            {STATUS_STEPS.find(s => s.key === order.status)?.label || order.status}
          </Text>
        </View>

        {/* Progress Steps */}
        <View style={styles.stepsRow}>
          {STATUS_STEPS.map((step, idx) => (
            <View key={step.key} style={styles.stepItem}>
              <View style={[styles.stepCircle, idx <= currentStepIdx && { backgroundColor: COLORS.primary }]}>
                <Ionicons name={step.icon} size={14} color={idx <= currentStepIdx ? '#FFF' : COLORS.gray} />
              </View>
              {idx < STATUS_STEPS.length - 1 && (
                <View style={[styles.stepLine, idx < currentStepIdx && { backgroundColor: COLORS.primary }]} />
              )}
            </View>
          ))}
        </View>

        <Text style={styles.stepLabel}>{STATUS_STEPS[currentStepIdx]?.label}</Text>
        <Text style={styles.eta}>الوصول المتوقع: {order.estimated_delivery_time ? new Date(order.estimated_delivery_time).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) : '35-45 دقيقة'}</Text>

        {/* Driver Info */}
        {order.driver_name && (
          <View style={styles.driverCard}>
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}><Text style={{ fontSize: 20 }}>👤</Text></View>
              <View>
                <Text style={styles.driverName}>{order.driver_name}</Text>
                <Text style={styles.driverVehicle}>{order.vehicle_type}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={callDriver}>
              <Ionicons name="call" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Actions */}
        {isDelivered && (
          <TouchableOpacity style={styles.rateBtn} onPress={() => router.push(`/rate/${id}`)}>
            <Text style={styles.rateBtnText}>⭐ قيّم طلبك</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1 },
  backBtn: { position: 'absolute', top: 50, left: 16, backgroundColor: '#FFF', borderRadius: 20, padding: 8, elevation: 4 },
  driverMarker: { backgroundColor: '#FFF', borderRadius: 20, padding: 4, elevation: 3 },
  destMarker: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 8 },
  bottomSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, elevation: 10 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  orderNum: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  statusBadge: { backgroundColor: COLORS.primary, color: '#FFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  stepsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E5E5EA' },
  stepLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  eta: { fontSize: 13, color: COLORS.gray, marginBottom: 16 },
  driverCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginBottom: 12 },
  driverInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E5EA', justifyContent: 'center', alignItems: 'center' },
  driverName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  driverVehicle: { fontSize: 12, color: COLORS.gray },
  callBtn: { backgroundColor: COLORS.primary, borderRadius: 20, padding: 10 },
  rateBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, alignItems: 'center' },
  rateBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 }
});
