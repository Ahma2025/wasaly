import React, { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import GradientHeader from '../components/GradientHeader';
import StatusBadge from '../components/StatusBadge';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { FadeIn, SkeletonCard } from '../components/Anim';
import { COLORS, SHADOW, RTL } from '../theme';
import { money, orderTitle, orderIcon, orderNo, isPersonal, fmtDate, driverFee, tipOf, isAccepted } from '../utils/format';

const LIMIT = 20;

export default function OrdersHistoryScreen() {
  const navigation = useNavigation();
  const { contentPadding } = useTabBarOffset();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const pageRef = useRef(1);
  const busyRef = useRef(false);
  const cacheLoaded = useRef(false);

  const fetchPage = useCallback(async (page) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (page > 1) setLoadingMore(true);
    try {
      const r = await api.get(`/drivers/orders?page=${page}&limit=${LIMIT}`);
      const list = Array.isArray(r?.data) ? r.data : [];
      setError(false);
      setOrders(prev => {
        if (page === 1) return list;
        const ids = new Set(prev.map(o => String(o.id)));
        return [...prev, ...list.filter(o => !ids.has(String(o.id)))];
      });
      if (page === 1) writeCache('driver_orders', list);
      pageRef.current = page;
      setHasMore(list.length >= LIMIT);
    } catch {
      if (page === 1) setError(true);
    } finally {
      busyRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // تحديث كل مرة يُفتح التبويب
  useFocusEffect(useCallback(() => {
    (async () => {
      if (!cacheLoaded.current) {
        cacheLoaded.current = true;
        const cached = await readCache('driver_orders');
        if (Array.isArray(cached) && cached.length) { setOrders(cached); setLoading(false); }
      }
      fetchPage(1);
    })();
  }, [fetchPage]));

  const onRefresh = async () => { setRefreshing(true); busyRef.current = false; await fetchPage(1); setRefreshing(false); };
  const onEnd = () => { if (hasMore && !busyRef.current && !loading) fetchPage(pageRef.current + 1); };

  const renderItem = ({ item: o, index }) => {
    const personal = isPersonal(o);
    const inProgress = isAccepted(o);
    const earned = driverFee(o) + tipOf(o);
    return (
      <FadeIn delay={Math.min(index, 8) * 40}>
        <TouchableOpacity activeOpacity={inProgress ? 0.85 : 1} disabled={!inProgress}
          onPress={() => navigation.navigate('Delivery', { orderId: o.id })} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={[styles.iconBox, { backgroundColor: personal ? COLORS.blueSoft : COLORS.sec }]}>
              <Ionicons name={`${orderIcon(o)}-outline`} size={20} color={personal ? COLORS.blue : COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, RTL.text]} numberOfLines={1}>{orderTitle(o)}</Text>
              <Text style={[styles.sub, RTL.text]} numberOfLines={1}>#{orderNo(o)}{o.customer_name ? ` · ${o.customer_name}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-start', gap: 6 }}>
              <Text style={[styles.fee, o.status === 'cancelled' && { color: COLORS.faint, textDecorationLine: 'line-through' }]}>{money(earned)}</Text>
              <StatusBadge status={o.status} />
            </View>
          </View>
          {!!o.delivery_address && (
            <View style={[RTL.row, { gap: 6, marginTop: 10 }]}>
              <Ionicons name="location-outline" size={14} color={COLORS.gray} />
              <Text style={[styles.address, RTL.text]} numberOfLines={1}>{o.delivery_address}</Text>
            </View>
          )}
          <View style={[RTL.row, { justifyContent: 'space-between', marginTop: 10 }]}>
            <Text style={styles.time}>{fmtDate(o.delivered_at || o.created_at)}</Text>
            {inProgress && <Text style={styles.openLink}>متابعة ‹</Text>}
          </View>
        </TouchableOpacity>
      </FadeIn>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader title="سجل الطلبات" showBack={false} />
      <FlatList
        data={loading && orders.length === 0 ? [] : orders}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: contentPadding, flexGrow: 1 }}
        onEndReached={onEnd}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} /> : null}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 10 }}>{[0, 1, 2, 3].map(i => <SkeletonCard key={i} lines={3} />)}</View>
          ) : error ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={44} color={COLORS.faint} />
              <Text style={styles.emptyText}>تعذّر تحميل السجل</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}><Text style={styles.retryText}>إعادة المحاولة</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyText}>لا توجد طلبات بعد</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 14, ...SHADOW.soft },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 12.5, color: COLORS.gray, marginTop: 2 },
  fee: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  address: { fontSize: 12.5, color: COLORS.sub, flex: 1 },
  time: { fontSize: 11.5, color: COLORS.gray, fontWeight: '600' },
  openLink: { fontSize: 12, color: COLORS.primary, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: COLORS.gray, fontWeight: '700' },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 9 },
  retryText: { color: '#FFF', fontWeight: '800' },
});
