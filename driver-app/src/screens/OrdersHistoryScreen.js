import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import GradientHeader from '../components/GradientHeader';
import StatusBadge from '../components/StatusBadge';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { FadeIn, SkeletonCard, Press, LoadingDots, EmptyState } from '../components/Anim';
import { COLORS, SHADOW, RTL, RADIUS } from '../theme';
import { money, orderTitle, orderIcon, orderNo, isPersonal, fmtDate, driverFee, tipOf, isAccepted, statusInfo } from '../utils/format';

const LIMIT = 20;

const FILTERS = [
  { id: 'all', label: 'الكل', icon: 'apps-outline', test: () => true },
  { id: 'active', label: 'جارية', icon: 'bicycle-outline', test: (o) => isAccepted(o) },
  { id: 'delivered', label: 'مكتملة', icon: 'checkmark-done', test: (o) => o.status === 'delivered' },
  { id: 'cancelled', label: 'ملغاة', icon: 'close-circle-outline', test: (o) => o.status === 'cancelled' },
];

export default function OrdersHistoryScreen() {
  const navigation = useNavigation();
  const { contentPadding } = useTabBarOffset();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('all');
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

  const counts = useMemo(() => {
    const c = {};
    FILTERS.forEach(f => { c[f.id] = orders.filter(f.test).length; });
    return c;
  }, [orders]);
  const activeFilter = FILTERS.find(f => f.id === filter) || FILTERS[0];
  const shown = useMemo(() => orders.filter(activeFilter.test), [orders, activeFilter]);

  const renderItem = ({ item: o, index }) => {
    const personal = isPersonal(o);
    const inProgress = isAccepted(o);
    const earned = driverFee(o) + tipOf(o);
    const s = statusInfo(o.status);
    const cancelled = o.status === 'cancelled';
    return (
      <FadeIn delay={Math.min(index, 8) * 45}>
        <Press disabled={!inProgress} scaleTo={inProgress ? 0.97 : 1} hapticStyle={inProgress ? 'light' : null}
          onPress={() => navigation.navigate('Delivery', { orderId: o.id })}
          style={[styles.card, inProgress && styles.cardActive]}
          accessibilityLabel={`${orderTitle(o)}، رقم ${orderNo(o)}، ${s.label}، ${money(earned)}`}>
          <View style={[styles.stripe, { backgroundColor: s.color }]} />
          <View style={styles.cardTop}>
            <View style={[styles.iconBox, { backgroundColor: personal ? COLORS.blueSoft : COLORS.sec }]}>
              <Ionicons name={`${orderIcon(o)}-outline`} size={21} color={personal ? COLORS.blue : COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, RTL.text]} numberOfLines={1}>{orderTitle(o)}</Text>
              <Text style={[styles.sub, RTL.text]} numberOfLines={1}>#{orderNo(o)}{o.customer_name ? ` · ${o.customer_name}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-start', gap: 6 }}>
              <Text style={[styles.fee, cancelled && styles.feeCancelled]}>{money(earned)}</Text>
              <StatusBadge status={o.status} />
            </View>
          </View>
          {!!o.delivery_address && (
            <View style={[RTL.row, styles.addrRow]}>
              <Ionicons name="location-outline" size={15} color={COLORS.gray} />
              <Text style={[styles.address, RTL.text]} numberOfLines={1}>{o.delivery_address}</Text>
            </View>
          )}
          <View style={[RTL.row, { justifyContent: 'space-between', marginTop: 10 }]}>
            <View style={[RTL.row, { gap: 5 }]}>
              <Ionicons name="time-outline" size={13} color={COLORS.gray} />
              <Text style={styles.time}>{fmtDate(o.delivered_at || o.created_at)}</Text>
            </View>
            {inProgress && (
              <View style={styles.followChip}>
                <Text style={styles.followText}>متابعة</Text>
                <Ionicons name="chevron-back" size={13} color="#FFF" />
              </View>
            )}
          </View>
        </Press>
      </FadeIn>
    );
  };

  const header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}
      style={{ marginHorizontal: -16, marginBottom: 4, transform: [{ scaleX: -1 }] }}>
      {FILTERS.map(f => {
        const on = filter === f.id;
        return (
          <View key={f.id} style={{ transform: [{ scaleX: -1 }] }}>
          <Press onPress={() => setFilter(f.id)} hapticStyle="select" style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${f.label} (${counts[f.id] || 0})`}>
            <Ionicons name={f.icon} size={15} color={on ? '#FFF' : COLORS.sub} />
            <Text style={[styles.chipText, on && { color: '#FFF' }]}>{f.label}</Text>
            {counts[f.id] > 0 && (
              <View style={[styles.chipCount, on && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                <Text style={[styles.chipCountText, on && { color: '#FFF' }]}>{counts[f.id]}</Text>
              </View>
            )}
          </Press>
          </View>
        );
      })}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <GradientHeader title="سجل الطلبات" subtitle="كل توصيلاتك في مكان واحد" large showBack={false} />
      <FlatList
        data={loading && orders.length === 0 ? [] : shown}
        keyExtractor={i => String(i.id)}
        renderItem={renderItem}
        ListHeaderComponent={!loading || orders.length ? header : null}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: contentPadding, flexGrow: 1 }}
        onEndReached={onEnd}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListFooterComponent={loadingMore ? <View style={{ alignItems: 'center', paddingVertical: 14 }}><LoadingDots color={COLORS.primary} /></View> : null}
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 10 }}>{[0, 1, 2, 3].map(i => <SkeletonCard key={i} lines={3} />)}</View>
          ) : error ? (
            <EmptyState icon="cloud-offline-outline" tone="red" title="تعذّر تحميل السجل" text="تحقّق من الاتصال ثم أعد المحاولة" actionLabel="إعادة المحاولة" actionIcon="refresh" onAction={onRefresh} />
          ) : orders.length > 0 ? (
            <EmptyState icon="funnel-outline" tone="gray" title="لا طلبات بهذا التصنيف" text="جرّب تصنيفاً آخر" />
          ) : (
            <EmptyState icon="receipt-outline" title="لا توجد طلبات بعد" text="ستظهر هنا كل الطلبات التي تقبلها وتوصلها" />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  chips: { paddingHorizontal: 16, gap: 8, paddingVertical: 2 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: RADIUS.pill, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOW.glow },
  chipText: { fontSize: 13.5, fontWeight: '800', color: COLORS.sub },
  chipCount: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  chipCountText: { fontSize: 11, fontWeight: '900', color: COLORS.sub },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 14, paddingRight: 18, ...SHADOW.soft },
  cardActive: { borderWidth: 1.5, borderColor: COLORS.tintLine },
  stripe: { position: 'absolute', right: 0, top: 18, bottom: 18, width: 4, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  iconBox: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 12.5, color: COLORS.gray, marginTop: 2, fontWeight: '500' },
  fee: { fontSize: 17.5, fontWeight: '900', color: COLORS.text },
  feeCancelled: { color: COLORS.faint, textDecorationLine: 'line-through' },
  addrRow: { gap: 6, marginTop: 12, backgroundColor: COLORS.inputBg, borderRadius: RADIUS.xs, paddingHorizontal: 10, paddingVertical: 8 },
  address: { fontSize: 13, color: COLORS.sub, flex: 1, fontWeight: '500' },
  time: { fontSize: 11.5, color: COLORS.gray, fontWeight: '500' },
  followChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, backgroundColor: COLORS.primary, borderRadius: RADIUS.pill, paddingHorizontal: 12, height: 30 },
  followText: { fontSize: 12.5, color: '#FFF', fontWeight: '800' },
});
