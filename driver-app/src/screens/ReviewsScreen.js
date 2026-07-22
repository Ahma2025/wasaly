import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA', star: '#FFB800' };

const starStr = (n) => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));

export default function ReviewsScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/reviews/driver/me')
      .then(d => { setList(d.data || []); setAvg(d.avg_rating || 0); setCount(d.count || 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>تقييماتي</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.summary}>
        <Text style={styles.avg}>{parseFloat(avg).toFixed(1)} ⭐</Text>
        <Text style={styles.count}>{count} تقييم من الزبائن</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} size="large" />
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 52 }}>⭐</Text>
          <Text style={styles.emptyText}>لا توجد تقييمات بعد</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={r => String(r.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.rowB}>
                <Text style={styles.name}>{item.customer_name || 'زبون'}</Text>
                <Text style={styles.stars}>{starStr(parseInt(item.driver_rating))}</Text>
              </View>
              <Text style={styles.rest}>{[item.restaurant_name, new Date(item.created_at).toLocaleDateString('ar')].filter(Boolean).join(' · ')}</Text>
              {!!item.comment && <Text style={styles.comment}>{item.comment}</Text>}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  summary: { backgroundColor: COLORS.primary, margin: 16, borderRadius: 20, padding: 22, alignItems: 'center', elevation: 6, shadowColor: COLORS.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  avg: { color: '#FFF', fontSize: 42, fontWeight: '900' },
  count: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 40, gap: 10 },
  emptyText: { color: COLORS.gray, fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  rowB: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  stars: { fontSize: 15, color: COLORS.star },
  rest: { fontSize: 12, color: COLORS.gray, marginTop: 3 },
  comment: { fontSize: 14, color: COLORS.text, marginTop: 8, backgroundColor: '#F8F8F8', borderRadius: 10, padding: 10 },
});
