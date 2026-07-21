import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, Vibration, ScrollView, Modal } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', red: '#FF3B30', bg: '#F8F9FA' };

function calcDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(1);
}

export default function DriverHome() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(false);
  const [location, setLocation] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [todayStats, setTodayStats] = useState({ deliveries: 0, earnings: 0 });
  const [driverRating, setDriverRating] = useState(0);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [orderTimer, setOrderTimer] = useState(60);
  const socketRef = useRef(null);
  const locationInterval = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    requestLocation();
    fetchStats();
    fetchDriverStatus();
    setupSocket();

    // When driver taps a push notification (app was backgrounded/killed)
    const notifSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'new_order_request' && data?.order_id) {
        try {
          const r = await api.get(`/orders/${data.order_id}`);
          const order = r.data;
          if (order) {
            setPendingOrder(order);
            startOrderTimer();
          }
        } catch {}
      }
    });

    // Show banner when notification arrives while app is foregrounded
    const foregroundSub = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data;
      if (data?.type === 'new_order_request' && data?.order_id && !pendingOrder) {
        try {
          const r = await api.get(`/orders/${data.order_id}`);
          const order = r.data;
          if (order) {
            Vibration.vibrate([0, 500, 200, 500, 200, 500]);
            setPendingOrder(order);
            startOrderTimer();
          }
        } catch {}
      }
    });

    return () => {
      locationInterval.current && clearInterval(locationInterval.current);
      timerRef.current && clearInterval(timerRef.current);
      socketRef.current?.disconnect();
      notifSub.remove();
      foregroundSub.remove();
    };
  }, []);

  const fetchDriverStatus = async () => {
    try {
      const r = await api.get('/drivers/me');
      const driver = r.data || r;
      const online = !!(driver.is_online || driver.isOnline);
      setIsOnline(online);
      if (driver.rating != null) setDriverRating(parseFloat(driver.rating) || 0);
      if (online) startLocationInterval();
    } catch {}
  };

  const startLocationInterval = () => {
    locationInterval.current && clearInterval(locationInterval.current);
    locationInterval.current = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation(loc.coords);
        await api.patch('/drivers/location', { lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {}
    }, 10000);
  };

  // Refresh active order whenever screen comes into focus (e.g. returning from DeliveryScreen)
  useFocusEffect(
    React.useCallback(() => {
      fetchActiveOrder();
      fetchStats();
    }, [])
  );

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('تنبيه', 'نحتاج إذن الموقع لاستقبال الطلبات');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocation(loc.coords);
  };

  const fetchActiveOrder = async () => {
    try {
      const r = await api.get('/drivers/me');
      const active = r.data?.active_order || null;
      // If there's a 'confirmed' order assigned to this driver but not yet accepted, show it as pending
      if (active && active.status === 'confirmed' && !pendingOrder) {
        setPendingOrder(active);
        startOrderTimer();
      } else {
        setActiveOrder(active);
      }
    } catch {}
  };

  const setupSocket = async () => {
    try {
      const token = await AsyncStorage.getItem('driver_token');
      const socket = io('https://burger-app-production.up.railway.app', {
        auth: { token }, transports: ['websocket']
      });
      socketRef.current = socket;

      // Backend sends 'new_order_request' event
      socket.on('new_order_request', async (data) => {
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
        try {
          const r = await api.get(`/orders/${data.order_id}`);
          const order = r.data;
          setPendingOrder(order);
          startOrderTimer();
        } catch {}
      });

      socket.on('order_updated', () => fetchActiveOrder());
    } catch {}
  };

  const startOrderTimer = () => {
    setOrderTimer(60);
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setOrderTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setPendingOrder(null);
          return 60;
        }
        return t - 1;
      });
    }, 1000);
  };

  const toggleOnline = async (value) => {
    try {
      await api.patch('/drivers/status', {
        is_online: value,
        lat: location?.latitude,
        lng: location?.longitude
      });
      setIsOnline(value);
      if (value) {
        startLocationInterval();
      } else {
        locationInterval.current && clearInterval(locationInterval.current);
      }
    } catch { Alert.alert('خطأ', 'فشل في تغيير الحالة'); }
  };

  const acceptOrder = async () => {
    if (!pendingOrder) return;
    try {
      await api.post(`/orders/${pendingOrder.id}/accept`);
      setActiveOrder(pendingOrder);
      setPendingOrder(null);
      timerRef.current && clearInterval(timerRef.current);
      Alert.alert('✅ تم قبول الطلب!', 'انطلق الآن إلى المطعم');
      navigation.navigate('Delivery', { orderId: pendingOrder.id });
    } catch (e) {
      Alert.alert('خطأ', e.message || 'فشل في قبول الطلب');
    }
  };

  const rejectOrder = async () => {
    if (!pendingOrder) return;
    try {
      await api.post(`/orders/${pendingOrder.id}/reject`);
    } catch {}
    setPendingOrder(null);
    timerRef.current && clearInterval(timerRef.current);
  };

  const fetchStats = async () => {
    try {
      const data = await api.get('/drivers/earnings?period=today');
      setTodayStats({
        deliveries: data.data?.stats?.deliveries || 0,
        earnings: parseFloat(data.data?.stats?.earnings || 0)
      });
    } catch (e) { console.error('fetchStats error:', e); }
  };

  const distToRestaurant = pendingOrder && location
    ? calcDistance(location.latitude, location.longitude, pendingOrder.restaurant_lat, pendingOrder.restaurant_lng)
    : null;

  const distToCustomer = pendingOrder
    ? calcDistance(pendingOrder.restaurant_lat, pendingOrder.restaurant_lng, pendingOrder.delivery_lat, pendingOrder.delivery_lng)
    : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>مرحباً 👋</Text>
          <Text style={styles.driverName}>{user?.name || 'المندوب'}</Text>
        </View>
        <TouchableOpacity onPress={fetchStats}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0] || 'م'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Online Toggle Card */}
      <View style={[styles.onlineCard, { borderColor: isOnline ? COLORS.green : '#E5E5EA' }]}>
        <View style={styles.onlineLeft}>
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.green : '#C7C7CC' }]} />
          <View>
            <Text style={styles.onlineTitle}>{isOnline ? 'أنت متصل الآن' : 'أنت غير متصل'}</Text>
            <Text style={styles.onlineSub}>{isOnline ? 'جاهز لاستقبال الطلبات' : 'فعّل للبدء'}</Text>
          </View>
        </View>
        <Switch
          value={isOnline}
          onValueChange={toggleOnline}
          trackColor={{ false: '#E5E5EA', true: '#34C75966' }}
          thumbColor={isOnline ? COLORS.green : '#FFF'}
        />
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>📦</Text>
          <Text style={styles.statVal}>{todayStats.deliveries}</Text>
          <Text style={styles.statLabel}>توصيلات اليوم</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>💰</Text>
          <Text style={styles.statVal}>{todayStats.earnings.toFixed(2)}₪</Text>
          <Text style={styles.statLabel}>أرباح اليوم</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⭐</Text>
          <Text style={styles.statVal}>{driverRating > 0 ? driverRating.toFixed(1) : '—'}</Text>
          <Text style={styles.statLabel}>تقييمك</Text>
        </View>
      </View>

      {/* Active Order */}
      {activeOrder && !pendingOrder && (
        <View style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <Text style={styles.activeTitle}>📦 طلب نشط</Text>
            <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>قيد التوصيل</Text></View>
          </View>
          <View style={styles.activeRow}>
            <Ionicons name="restaurant-outline" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.activeText}>{activeOrder.restaurant_name}</Text>
          </View>
          <View style={styles.activeRow}>
            <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.activeText}>{activeOrder.delivery_address || 'عنوان التوصيل'}</Text>
          </View>
          <TouchableOpacity style={styles.navBtn}
            onPress={() => navigation.navigate('Delivery', { orderId: activeOrder.id })}>
            <Ionicons name="navigate-outline" size={18} color={COLORS.primary} />
            <Text style={styles.navBtnText}>التنقل والتفاصيل</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pending Order Alert */}
      {pendingOrder && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingBell}>🔔</Text>
          <Text style={styles.pendingTitle}>طلب جديد!</Text>

          <View style={styles.pendingInfo}>
            <View style={styles.pendingRow}>
              <Ionicons name="restaurant-outline" size={16} color={COLORS.primary} />
              <Text style={styles.pendingRestaurant}>{pendingOrder.restaurant_name}</Text>
            </View>
            <View style={styles.pendingRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.gray} />
              <Text style={styles.pendingAddr} numberOfLines={1}>{pendingOrder.delivery_address || 'عنوان التوصيل'}</Text>
            </View>
            <View style={styles.pendingFeeRow}>
              <View style={styles.pendingFeeBox}>
                <Text style={styles.pendingFeeLabel}>أجر التوصيل</Text>
                <Text style={styles.pendingFeeVal}>{parseFloat(pendingOrder.delivery_fee || 0).toFixed(2)}₪</Text>
              </View>
              {distToCustomer && (
                <View style={styles.pendingFeeBox}>
                  <Text style={styles.pendingFeeLabel}>مسافة التوصيل</Text>
                  <Text style={styles.pendingFeeVal}>{distToCustomer} كم</Text>
                </View>
              )}
              {distToRestaurant && (
                <View style={styles.pendingFeeBox}>
                  <Text style={styles.pendingFeeLabel}>المطعم بُعدك</Text>
                  <Text style={styles.pendingFeeVal}>{distToRestaurant} كم</Text>
                </View>
              )}
            </View>
          </View>

          {/* Timer */}
          <View style={styles.timerRow}>
            <View style={[styles.timerBar, { width: `${(orderTimer / 60) * 100}%`, backgroundColor: orderTimer > 20 ? COLORS.green : COLORS.red }]} />
            <Text style={styles.timerText}>ينتهي خلال {orderTimer}ث</Text>
          </View>

          <View style={styles.pendingBtns}>
            <TouchableOpacity style={styles.acceptBtn} onPress={acceptOrder}>
              <Text style={styles.acceptBtnText}>✅ قبول</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={rejectOrder}>
              <Text style={styles.rejectBtnText}>❌ رفض</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Offline Message */}
      {!isOnline && !activeOrder && !pendingOrder && (
        <View style={styles.offlineBox}>
          <Text style={styles.offlineEmoji}>🏍️</Text>
          <Text style={styles.offlineTitle}>غير متصل</Text>
          <Text style={styles.offlineText}>فعّل زر "متصل" أعلاه لبدء استقبال الطلبات</Text>
        </View>
      )}

      {isOnline && !activeOrder && !pendingOrder && (
        <View style={styles.waitingBox}>
          <Text style={styles.waitingEmoji}>🟢</Text>
          <Text style={styles.waitingTitle}>جاهز لاستقبال الطلبات</Text>
          <Text style={styles.waitingText}>في انتظار الطلبات القريبة منك...</Text>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('الأرباح')}>
          <Ionicons name="wallet-outline" size={24} color={COLORS.primary} />
          <Text style={styles.quickLabel}>أرباحي</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('الطلبات')}>
          <Ionicons name="list-outline" size={24} color={COLORS.primary} />
          <Text style={styles.quickLabel}>طلباتي</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={fetchStats}>
          <Ionicons name="refresh-outline" size={24} color={COLORS.primary} />
          <Text style={styles.quickLabel}>تحديث</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: '#FFF' },
  greeting: { fontSize: 13, color: COLORS.gray },
  driverName: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF6B0020', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  onlineCard: { margin: 16, backgroundColor: '#FFF', borderRadius: 20, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 2, elevation: 2 },
  onlineLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  onlineDot: { width: 12, height: 12, borderRadius: 6 },
  onlineTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  onlineSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 16, alignItems: 'center', elevation: 3, shadowColor: '#1A1A2E', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statVal: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 3 },
  activeCard: { margin: 16, backgroundColor: COLORS.primary, borderRadius: 20, padding: 16, elevation: 6, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  activeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  activeTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  activeBadge: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  activeText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, flex: 1 },
  navBtn: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  navBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 14 },
  pendingCard: { margin: 16, backgroundColor: '#FFF', borderRadius: 20, padding: 16, borderWidth: 2, borderColor: COLORS.primary, elevation: 8, alignItems: 'center' },
  pendingBell: { fontSize: 40, marginBottom: 4 },
  pendingTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 12 },
  pendingInfo: { width: '100%', backgroundColor: '#FFF8F5', borderRadius: 14, padding: 12, marginBottom: 12 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pendingRestaurant: { fontSize: 14, fontWeight: '800', color: COLORS.text, flex: 1 },
  pendingAddr: { fontSize: 12, color: COLORS.gray, flex: 1 },
  pendingFeeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pendingFeeBox: { flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FFE0CC' },
  pendingFeeLabel: { fontSize: 9, color: COLORS.gray, marginBottom: 2 },
  pendingFeeVal: { fontSize: 14, fontWeight: '900', color: COLORS.primary },
  timerRow: { width: '100%', marginBottom: 12 },
  timerBar: { height: 4, borderRadius: 2, marginBottom: 4 },
  timerText: { fontSize: 11, color: COLORS.gray, textAlign: 'center' },
  pendingBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  acceptBtn: { flex: 1, backgroundColor: COLORS.green, borderRadius: 14, padding: 15, alignItems: 'center', elevation: 5, shadowColor: COLORS.green, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  acceptBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  rejectBtn: { flex: 1, backgroundColor: '#FFE5E5', borderRadius: 14, padding: 14, alignItems: 'center' },
  rejectBtnText: { color: COLORS.red, fontWeight: '800', fontSize: 15 },
  offlineBox: { margin: 16, backgroundColor: '#FFF', borderRadius: 20, padding: 32, alignItems: 'center', elevation: 1 },
  offlineEmoji: { fontSize: 56, marginBottom: 12 },
  offlineTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  offlineText: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 20 },
  waitingBox: { margin: 16, backgroundColor: '#EDFFF3', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#C3F5D8' },
  waitingEmoji: { fontSize: 36, marginBottom: 8 },
  waitingTitle: { fontSize: 16, fontWeight: '800', color: '#1A5C33', marginBottom: 4 },
  waitingText: { fontSize: 12, color: '#2D8B55', textAlign: 'center' },
  quickActions: { flexDirection: 'row', margin: 16, gap: 12 },
  quickBtn: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', gap: 6, elevation: 2, shadowColor: '#1A1A2E', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  quickLabel: { fontSize: 12, fontWeight: '700', color: COLORS.text },
});

