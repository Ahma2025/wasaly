import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA', green: '#34C759' };

export default function OrdersHistoryScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => { fetchOrders(); }, [page]);

  const fetchOrders = async () => {
    try {
      const data = await api.get(`/drivers/orders?page=${page}&limit=20`);
      const newOrders = data.data || [];
      setOrders(prev => page === 1 ? newOrders : [...prev, ...newOrders]);
      if (newOrders.length < 20) setHasMore(false);
    } catch {} finally { setLoading(false); }
  };

  const renderItem = ({ item: o }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.restaurantName}>{o.restaurant_name}</Text>
          <Text style={styles.customerName}>{o.customer_name}</Text>
          <Text style={styles.address} numberOfLines={1}>{o.delivery_address}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.fee}>{parseFloat(o.delivery_fee || 0).toFixed(2)}₪</Text>
          <View style={styles.statusBadge}><Text style={styles.statusText}>مُوصَّل</Text></View>
        </View>
      </View>
      <Text style={styles.time}>{new Date(o.created_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}><Text style={styles.title}>سجل التوصيلات</Text></View>
      <FlatList
        data={orders}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onEndReached={() => hasMore && setPage(p => p + 1)}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={!loading && <View style={styles.empty}><Text style={styles.emptyIcon}>📦</Text><Text style={styles.emptyText}>لا توجد توصيلات بعد</Text></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, elevation: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  restaurantName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  customerName: { fontSize: 13, color: COLORS.gray, marginTop: 2 },
  address: { fontSize: 12, color: COLORS.gray, marginTop: 2, maxWidth: 220 },
  right: { alignItems: 'flex-end', gap: 6 },
  fee: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  statusBadge: { backgroundColor: '#E8F8EE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.green },
  time: { fontSize: 11, color: COLORS.gray },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: COLORS.gray, fontWeight: '600' },
});
