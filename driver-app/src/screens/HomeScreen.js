import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, Vibration } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import Toast from 'react-native-toast-message';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', red: '#FF3B30' };

export default function DriverHome() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [todayStats, setTodayStats] = useState({ deliveries: 0, earnings: 0 });
  const [pendingOrder, setPendingOrder] = useState(null);
  const socketRef = useRef(null);
  const mapRef = useRef(null);
  const locationInterval = useRef(null);

  useEffect(() => {
    requestLocation();
    fetchStats();
    setupSocket();
    return () => {
      locationInterval.current && clearInterval(locationInterval.current);
      socketRef.current?.disconnect();
    };
  }, []);

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('خطأ', 'نحتاج إذن الموقع'); return; }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation(loc.coords);
  };

  const setupSocket = async () => {
    const token = await SecureStore.getItemAsync('token');
    const socket = io('http://localhost:5000', { auth: { token } });
    socketRef.current = socket;

    socket.on('new_order_available', (order) => {
      Vibration.vibrate([0, 500, 200, 500]);
      setPendingOrder(order);
      Toast.show({ type: 'info', text1: '🔔 طلب جديد!', text2: `${order.restaurant_name} → ${order.delivery_address}` });
    });
  };

  const toggleOnline = async (value) => {
    try {
      await api.patch('/drivers/status', { is_online: value, lat: location?.latitude, lng: location?.longitude });
      setIsOnline(value);

      if (value) {
        locationInterval.current = setInterval(async () => {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setLocation(loc.coords);
          await api.patch('/drivers/location', { lat: loc.coords.latitude, lng: loc.coords.longitude });
        }, 10000);
      } else {
        locationInterval.current && clearInterval(locationInterval.current);
      }
    } catch { Alert.alert('خطأ', 'فشل في تغيير الحالة'); }
  };

  const acceptOrder = async () => {
    try {
      await api.post(`/drivers/orders/${pendingOrder.id}/accept`);
      setActiveOrder(pendingOrder);
      setPendingOrder(null);
      Toast.show({ type: 'success', text1: 'تم قبول الطلب!' });
    } catch { Alert.alert('خطأ', 'فشل في قبول الطلب'); }
  };

  const fetchStats = async () => {
    try {
      const data = await api.get('/drivers/earnings?period=today');
      setTodayStats({ deliveries: data.data.stats.deliveries || 0, earnings: parseFloat(data.data.stats.earnings || 0) });
    } catch {}
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{ latitude: location?.latitude || 31.9, longitude: location?.longitude || 35.2, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        showsUserLocation
      >
        {location && (
          <Circle center={{ latitude: location.latitude, longitude: location.longitude }} radius={500} fillColor={isOnline ? 'rgba(52, 199, 89, 0.15)' : 'rgba(142, 142, 147, 0.15)'} strokeColor={isOnline ? COLORS.green : COLORS.gray} strokeWidth={2} />
        )}
      </MapView>

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>مرحباً 👋</Text>
          <Text style={[styles.status, { color: isOnline ? COLORS.green : COLORS.gray }]}>{isOnline ? '🟢 أنت متصل' : '⚫ غير متصل'}</Text>
        </View>
        <Switch value={isOnline} onValueChange={toggleOnline} trackColor={{ false: '#E5E5EA', true: '#34C75966' }} thumbColor={isOnline ? COLORS.green : '#FFF'} />
      </View>

      {/* Stats */}
      <View style={styles.statsBar}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{todayStats.deliveries}</Text>
          <Text style={styles.statLabel}>توصيلات</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statVal}>{todayStats.earnings.toFixed(2)}₪</Text>
          <Text style={styles.statLabel}>أرباح اليوم</Text>
        </View>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.stat} onPress={() => router.push('/earnings')}>
          <Ionicons name="wallet-outline" size={22} color={COLORS.primary} />
          <Text style={[styles.statLabel, { color: COLORS.primary }]}>المحفظة</Text>
        </TouchableOpacity>
      </View>

      {/* Active Order */}
      {activeOrder && (
        <View style={styles.activeOrderCard}>
          <Text style={styles.activeOrderTitle}>📦 طلب نشط</Text>
          <Text style={styles.activeOrderText}>من: {activeOrder.restaurant_name}</Text>
          <Text style={styles.activeOrderText}>إلى: {activeOrder.delivery_address}</Text>
          <TouchableOpacity style={styles.navigateBtn} onPress={() => router.push(`/order-delivery/${activeOrder.id}`)}>
            <Text style={styles.navigateBtnText}>🗺️ التنقل والتفاصيل</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pending Order Alert */}
      {pendingOrder && (
        <View style={styles.pendingAlert}>
          <Text style={styles.pendingTitle}>🔔 طلب جديد!</Text>
          <Text style={styles.pendingRestaurant}>{pendingOrder.restaurant_name}</Text>
          <Text style={styles.pendingAddr}>{pendingOrder.delivery_address}</Text>
          <Text style={styles.pendingAmount}>الأجر: {pendingOrder.delivery_fee}₪</Text>
          <View style={styles.pendingBtns}>
            <TouchableOpacity style={styles.acceptBtn} onPress={acceptOrder}><Text style={styles.acceptBtnText}>✅ قبول</Text></TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => setPendingOrder(null)}><Text style={styles.rejectBtnText}>❌ رفض</Text></TouchableOpacity>
          </View>
        </View>
      )}

      {!isOnline && !activeOrder && (
        <View style={styles.offlineMsg}>
          <Text style={styles.offlineMsgText}>فعّل "متصل" لبدء استقبال الطلبات</Text>
        </View>
      )}

      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topBar: { position: 'absolute', top: 50, left: 16, right: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 6 },
  greeting: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  status: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  statsBar: { position: 'absolute', top: 130, left: 16, right: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', elevation: 4 },
  stat: { alignItems: 'center', gap: 4 },
  statVal: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.gray },
  divider: { width: 1, height: 30, backgroundColor: '#E5E5EA' },
  activeOrderCard: { position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: COLORS.primary, borderRadius: 20, padding: 16 },
  activeOrderTitle: { color: '#FFF', fontWeight: '800', fontSize: 16, marginBottom: 6 },
  activeOrderText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 4 },
  navigateBtn: { backgroundColor: '#FFF', borderRadius: 12, padding: 10, alignItems: 'center', marginTop: 8 },
  navigateBtnText: { color: COLORS.primary, fontWeight: '800' },
  pendingAlert: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: '#FFF', borderRadius: 20, padding: 16, elevation: 10, borderWidth: 2, borderColor: COLORS.primary },
  pendingTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  pendingRestaurant: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  pendingAddr: { fontSize: 13, color: COLORS.gray, marginVertical: 4 },
  pendingAmount: { fontSize: 15, fontWeight: '800', color: COLORS.primary, marginBottom: 12 },
  pendingBtns: { flexDirection: 'row', gap: 10 },
  acceptBtn: { flex: 1, backgroundColor: COLORS.green, borderRadius: 12, padding: 12, alignItems: 'center' },
  acceptBtnText: { color: '#FFF', fontWeight: '800' },
  rejectBtn: { flex: 1, backgroundColor: '#FFE5E5', borderRadius: 12, padding: 12, alignItems: 'center' },
  rejectBtnText: { color: COLORS.red, fontWeight: '800' },
  offlineMsg: { position: 'absolute', bottom: 30, left: 40, right: 40, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, padding: 12, alignItems: 'center' },
  offlineMsgText: { color: '#FFF', fontSize: 13, fontWeight: '600' }
});
