import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import GradientHeader from '../components/GradientHeader';
import { readCache, writeCache } from '../utils/cache';
import { FadeIn, SkeletonCard } from '../components/Anim';
import { COLORS, GRADIENTS, SHADOW, RTL } from '../theme';
import { fmtDate, num } from '../utils/format';

// نجوم آمنة: تقيّد التقييم بين ٠ و٥ (repeat بقيمة سالبة كان يرمي RangeError)
export const starStr = (n) => {
  const v = Math.max(0, Math.min(5, Math.round(num(n))));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
};

export default function ReviewsScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState([]);
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/reviews/driver/me');
      const data = Array.isArray(d?.data) ? d.data : [];
      setList(data); setAvg(num(d?.avg_rating)); setCount(parseInt(d?.count, 10) || data.length);
      writeCache('driver_reviews', { data, avg: num(d?.avg_rating), count: parseInt(d?.count, 10) || data.length });
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await readCache('driver_reviews');
      if (cached) { setList(cached.data || []); setAvg(num(cached.avg)); setCount(cached.count || 0); setLoading(false); }
      load();
    })();
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const header = (
    <LinearGradient colors={GRADIENTS.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
      <Text style={styles.avg}>{avg > 0 ? avg.toFixed(1) : '—'}</Text>
      <Text style={styles.stars}>{starStr(avg)}</Text>
      <Text style={styles.count}>{count} تقييم من الزبائن</Text>
    </LinearGradient>
  );

  return (
    <View style={styles.container}>
      <GradientHeader title="تقييماتي" />
      <FlatList
        data={loading ? [] : list}
        keyExtractor={(r, i) => String(r.id ?? i)}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListEmptyComponent={loading ? (
          <View style={{ gap: 10 }}>{[0, 1, 2].map(i => <SkeletonCard key={i} lines={3} />)}</View>
        ) : (
          <View style={styles.empty}>
            <Text style={{ fontSize: 52 }}>⭐</Text>
            <Text style={styles.emptyText}>لا توجد تقييمات بعد</Text>
          </View>
        )}
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, 8) * 45}>
            <View style={styles.card}>
              <View style={[RTL.row, { justifyContent: 'space-between' }]}>
                <Text style={styles.name}>{item.customer_name || 'زبون'}</Text>
                <Text style={styles.itemStars}>{starStr(item.driver_rating)}</Text>
              </View>
              <Text style={[styles.rest, RTL.text]}>
                {[item.restaurant_name || (item.order_type === 'personal' ? 'طلب توصيل' : null), fmtDate(item.created_at, false)].filter(Boolean).join(' · ')}
              </Text>
              {!!item.comment && <Text style={[styles.comment, RTL.text]}>{item.comment}</Text>}
            </View>
          </FadeIn>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  summary: { borderRadius: 24, padding: 22, alignItems: 'center', marginBottom: 16, ...SHADOW.card },
  avg: { color: '#FFF', fontSize: 44, fontWeight: '900' },
  stars: { color: '#FFF', fontSize: 22, letterSpacing: 2 },
  count: { color: 'rgba(255,255,255,0.92)', fontSize: 14, marginTop: 4, fontWeight: '700' },
  empty: { alignItems: 'center', marginTop: 30, gap: 10 },
  emptyText: { color: COLORS.gray, fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, marginBottom: 10, ...SHADOW.soft },
  name: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  itemStars: { fontSize: 15, color: COLORS.star },
  rest: { fontSize: 12, color: COLORS.gray, marginTop: 4 },
  comment: { fontSize: 14, color: COLORS.text, marginTop: 8, backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 10, lineHeight: 20 },
});
