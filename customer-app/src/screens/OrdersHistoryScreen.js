import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { useCart } from '../context/CartContext';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA', green: '#34C759' };
const STATUS_LABELS = { pending: 'انتظار', confirmed: 'مؤكد', preparing: 'جاري التحضير', ready: 'جاهز', picked_up: 'في الطريق', delivered: 'تم التوصيل', cancelled: 'ملغي' };
const STATUS_COLORS = { pending: '#FF9500', confirmed: '#007AFF', preparing: '#AF52DE', ready: '#00C7BE', picked_up: COLORS.primary, delivered: COLORS.green, cancelled: '#FF3B30' };

export default function OrdersHistoryScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const { clearAndAddItems } = useCart();

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try {
      const data = await api.get('/orders/my');
      setOrders(data.data);
    } catch {} finally { setLoading(false); }
  };

  const reorder = async (orderId) => {
    try {
      const data = await api.post(`/orders/${orderId}/reorder`);
      clearAndAddItems(data.items);
      Alert.alert('تم!', 'تم إضافة الطلب إلى سلة المشتريات', [{ text: 'عرض السلة', onPress: () => navigation.navigate('Cart') }, { text: 'متابعة', style: 'cancel' }]);
    } catch { Alert.alert('خطأ', 'تعذر إعادة الطلب'); }
  };

  const renderItem = ({ item: o }) => (
    <TouchableOpacity style={styles.card} onPress={() => o.status !== 'delivered' && o.status !== 'cancelled' && navigation.navigate('OrderTracking', { orderId: o.id })}>
      <View style={styles.cardTop}>
        <View style={styles.restaurantInfo}>
          <Text style={styles.restaurantName}>{o.restaurant_name}</Text>
          <Text style={styles.date}>{new Date(o.created_at).toLocaleDateString('ar-SA')}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[o.status] + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[o.status] }]}>{STATUS_LABELS[o.status]}</Text>
        </View>
      </View>

      <Text style={styles.items} numberOfLines={1}>{o.items?.map(i => i.name).join('، ')}</Text>

      <View style={styles.cardBottom}>
        <Text style={styles.total}>{parseFloat(o.total_amount).toFixed(2)}₪</Text>
        <View style={styles.actions}>
          {(o.status === 'delivered' || o.status === 'cancelled') && (
            <TouchableOpacity style={styles.reorderBtn} onPress={() => reorder(o.id)}>
              <Ionicons name="refresh" size={14} color={COLORS.primary} />
              <Text style={styles.reorderText}>إعادة الطلب</Text>
            </TouchableOpacity>
          )}
          {o.status !== 'delivered' && o.status !== 'cancelled' && (
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>تتبع مباشر</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>طلباتي</Text></View>
      <FlatList
        data={orders}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        onRefresh={fetchOrders}
        refreshing={loading}
        ListEmptyComponent={!loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>لا طلبات بعد</Text>
            <Text style={styles.emptyText}>ابدأ بطلب وجبتك المفضلة!</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  card: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, elevation: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  restaurantInfo: {},
  restaurantName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  date: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: '700' },
  items: { fontSize: 13, color: COLORS.gray, marginBottom: 12 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  actions: {},
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF5EE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: COLORS.primary },
  reorderText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.green },
  liveText: { fontSize: 12, color: COLORS.green, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 60, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.gray, marginTop: 6 },
});
