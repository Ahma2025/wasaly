import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', green: '#34C759', red: '#FF3B30', bg: '#F8F9FA' };

const STATUS_MAP = {
  pending:    { label: 'في الانتظار', color: '#FF9500', bg: '#FFF5E6', icon: 'time-outline' },
  confirmed:  { label: 'تم القبول',   color: '#007AFF', bg: '#EBF4FF', icon: 'checkmark-circle-outline' },
  preparing:  { label: 'يُحضَّر',      color: '#AF52DE', bg: '#F5EEFF', icon: 'flame-outline' },
  ready:      { label: 'جاهز',        color: '#34C759', bg: '#EDFFF4', icon: 'bag-check-outline' },
  on_the_way: { label: 'في الطريق',   color: '#FF6B00', bg: '#FFF0E8', icon: 'bicycle-outline' },
  delivered:  { label: 'تم التسليم',  color: '#34C759', bg: '#EDFFF4', icon: 'gift-outline' },
  cancelled:  { label: 'ملغي',        color: '#FF3B30', bg: '#FFF0EE', icon: 'close-circle-outline' },
};

const ACTIVE = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'];

export default function OrdersHistoryScreen() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { fetchOrders(); }, []));

  const fetchOrders = async () => {
    try {
      const data = await api.get('/orders/my');
      setOrders(data.data || data || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  const active = orders.filter(o => ACTIVE.includes(o.status));
  const history = orders.filter(o => !ACTIVE.includes(o.status));

  if (loading) return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>طلباتي 📦</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} tintColor={COLORS.primary} />}
      >
        {/* Active */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الطلبات الحالية</Text>
          {active.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>لا توجد طلبات حالية</Text>
              <TouchableOpacity style={styles.orderNowBtn} onPress={() => navigation.navigate('Main', { screen: 'الرئيسية' })}>
                <Text style={styles.orderNowText}>اطلب الآن</Text>
              </TouchableOpacity>
            </View>
          ) : (
            active.map(o => <OrderCard key={o.id} order={o} navigation={navigation} isActive />)
          )}
        </View>

        {/* History */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الطلبات السابقة</Text>
            {history.map(o => <OrderCard key={o.id} order={o} navigation={navigation} />)}
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function OrderCard({ order, navigation, isActive }) {
  const s = STATUS_MAP[order.status] || { label: order.status, color: COLORS.gray, bg: '#F5F5F5', icon: 'help-circle-outline' };
  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.activeCard]}
      onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.restaurantName}>{order.restaurant_name}</Text>
          <Text style={styles.orderDate}>
            {new Date(order.created_at).toLocaleString('ar', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Ionicons name={s.icon} size={12} color={s.color} />
          <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.itemsCount}>{order.items_count ? `${order.items_count} عناصر` : ''}</Text>
        <Text style={styles.totalAmount}>{parseFloat(order.total || 0).toFixed(2)}₪</Text>
      </View>

      {isActive && (
        <View style={styles.trackRow}>
          <Ionicons name="navigate-circle-outline" size={14} color={COLORS.primary} />
          <Text style={styles.trackText}>اضغط لتتبع طلبك على الخريطة</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  section: { padding: 16, paddingBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  emptyBox: { backgroundColor: '#FFF', borderRadius: 18, padding: 30, alignItems: 'center', marginBottom: 12, elevation: 1 },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 15, color: COLORS.gray, fontWeight: '600', marginBottom: 14 },
  orderNowBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 },
  orderNowText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6 },
  activeCard: { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  restaurantName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  orderDate: { fontSize: 11, color: COLORS.gray, marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemsCount: { fontSize: 12, color: COLORS.gray },
  totalAmount: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  trackText: { flex: 1, fontSize: 12, color: COLORS.primary, fontWeight: '700' },
});
