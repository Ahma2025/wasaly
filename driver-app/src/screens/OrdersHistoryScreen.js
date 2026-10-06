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
import { money, orderTitle, orderIcon, orderNo, isPersonal, fmtDate, driverFee, tipOf, isAccepted, statusInfo, num, GROUP_CHIP } from '../utils/format';
import { arCount } from '../utils/plural';

// 🧺 أبناء الطلب المجمّع يصلون منفصلين — نعرضهم توصيلة واحدة بأجرها (المال على "الابن الحامل" فقط)
const earnOf = (o) => (o.driver_earning != null ? num(o.driver_earning) : driverFee(o) + tipOf(o));
function mergeGroups(list) {
  const out = [];
  const rows = new Map();
  list.forEach((o) => {
    if (!o.group_id) { out.push(o); return; }
    const k = String(o.group_id);
    let row = rows.get(k);
    if (!row) {
      row = { id: `g${k}`, is_group_row: true, group_id: o.group_id, children: [] };
      rows.set(k, row);
      out.push(row);
    }
    row.children.push(o);
  });
  rows.forEach((row) => {
    const kids = row.children.slice().sort((a, b) => (a.stop_sequence || 99) - (b.stop_sequence || 99));
    const live = kids.filter(k => k.status !== 'cancelled');
    // D-35: مجمّع ما زال يُجمع = "تجمع الطلبات" (picking_up) لا "قيد التحضير" — group_status من السيرفر إن وُجد
    const gs = kids.find(k => k.group_status)?.group_status;
    row.status = gs && ['picking_up', 'on_the_way', 'delivered', 'cancelled'].includes(gs) ? gs
      : !live.length ? 'cancelled'
        : live.every(k => k.status === 'delivered') ? 'delivered'
          : live.every(k => ['on_the_way', 'delivered'].includes(k.status)) ? 'on_the_way' : 'picking_up';
    // D-24: أرقام على مستوى المجموعة من السيرفر (لا تتأثر بانقسام المجموعة بين صفحتين)، وإلا نجمع الأبناء المحمّلين
    const gEarn = kids.find(k => k.group_driver_earning != null)?.group_driver_earning;
    row.earned = gEarn != null ? num(gEarn) : kids.reduce((sum, k) => sum + earnOf(k), 0);
    row.names = (live.length ? live : kids).map(k => k.restaurant_name).filter(Boolean);
    const gk = kids.find(k => k.group_stops_count != null || k.group_stops_total != null);
    const gStops = parseInt(gk ? (gk.group_stops_count ?? gk.group_stops_total) : NaN, 10);
    row.stops = Number.isFinite(gStops) && gStops > 0 ? gStops : (live.length ? live : kids).length;
    row.customer_name = kids[0].customer_name;
    row.delivery_address = kids[0].delivery_address;
    row.created_at = kids.reduce((m, k) => (!m || (k.created_at && k.created_at < m) ? k.created_at : m), null);
    row.delivered_at = kids.reduce((m, k) => (k.delivered_at && (!m || k.delivered_at > m) ? k.delivered_at : m), null);
    row.inProgress = !['delivered', 'cancelled'].includes(row.status) && kids.some(k => !!k.driver_assigned_at);
  });
  return out;
}
const rowActive = (o) => (o.is_group_row ? o.inProgress : isAccepted(o));

const LIMIT = 20;

const FILTERS = [
  { id: 'all', label: 'الكل', icon: 'apps-outline', test: () => true },
  { id: 'active', label: 'جارية', icon: 'bicycle-outline', test: (o) => rowActive(o) },
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

  // merge=true (عند العودة للتبويب): نحدّث الصفحة الأولى ونُبقي الصفحات المحمّلة بعدها (D-28)
  const fetchPage = useCallback(async (page, { merge = false } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (page > 1) setLoadingMore(true);
    let more = false;
    let tailGroup = false;
    try {
      const r = await api.get(`/drivers/orders?page=${page}&limit=${LIMIT}`);
      const list = Array.isArray(r?.data) ? r.data : [];
      setError(false);
      const keepPages = merge && page === 1 && pageRef.current > 1;
      setOrders(prev => {
        if (page === 1 && !keepPages) return list;
        if (page === 1) {
          const fresh = new Set(list.map(o => String(o.id)));
          return [...list, ...prev.filter(o => !fresh.has(String(o.id)))];
        }
        const ids = new Set(prev.map(o => String(o.id)));
        return [...prev, ...list.filter(o => !ids.has(String(o.id)))];
      });
      if (page === 1) writeCache('driver_orders', list);
      if (!keepPages) pageRef.current = page;
      more = list.length >= LIMIT;
      if (!keepPages) setHasMore(more);
      // D-24: الصفحة انتهت بابن طلب مجمّع → غالباً بقية أبنائه في الصفحة التالية؛ نحمّلها فوراً حتى لا يظهر بأجر/محطات ناقصة
      tailGroup = more && !keepPages && !!list[list.length - 1]?.group_id;
    } catch {
      if (page === 1) setError(true);
    } finally {
      busyRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
    if (tailGroup) fetchPage(page + 1);
  }, []);

  // تحديث كل مرة يُفتح التبويب — بلا فقدان الصفحات المحمّلة وموضع التمرير
  useFocusEffect(useCallback(() => {
    (async () => {
      if (!cacheLoaded.current) {
        cacheLoaded.current = true;
        const cached = await readCache('driver_orders');
        if (Array.isArray(cached) && cached.length) { setOrders(cached); setLoading(false); }
      }
      fetchPage(1, { merge: true });
    })();
  }, [fetchPage]));

  const onRefresh = async () => { setRefreshing(true); busyRef.current = false; await fetchPage(1); setRefreshing(false); };
  const onEnd = () => { if (hasMore && !busyRef.current && !loading) fetchPage(pageRef.current + 1); };

  const rows = useMemo(() => mergeGroups(orders), [orders]);
  const counts = useMemo(() => {
    const c = {};
    FILTERS.forEach(f => { c[f.id] = rows.filter(f.test).length; });
    return c;
  }, [rows]);
  // D-28: العدّادات دقيقة فقط بعد تحميل كل السجل (وإلا تُخفى بدل عرض أرقام ناقصة)
  const showCounts = !hasMore && !loading;
  const activeFilter = FILTERS.find(f => f.id === filter) || FILTERS[0];
  const shown = useMemo(() => rows.filter(activeFilter.test), [rows, activeFilter]);

  const renderGroup = (o, index) => {
    const s = statusInfo(o.status);
    const cancelled = o.status === 'cancelled';
    return (
      <FadeIn delay={Math.min(index, 8) * 45}>
        <Press disabled={!o.inProgress} scaleTo={o.inProgress ? 0.97 : 1} hapticStyle={o.inProgress ? 'light' : null}
          onPress={() => navigation.navigate('Delivery', { groupId: o.group_id })}
          style={[styles.card, o.inProgress && styles.cardActive]}
          accessibilityLabel={`طلب مجمّع من ${arCount(o.stops, 'restaurant')}، ${s.label}، ${money(o.earned)}`}>
          <View style={[styles.stripe, { backgroundColor: s.color }]} />
          <View style={styles.cardTop}>
            <View style={[styles.iconBox, { backgroundColor: GROUP_CHIP.bg }]}>
              <Ionicons name={GROUP_CHIP.icon} size={21} color={GROUP_CHIP.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={[RTL.row, { gap: 6 }]}>
                <Text style={[styles.title, RTL.text, { flexShrink: 1 }]} numberOfLines={1}>طلب مجمّع</Text>
                <View style={styles.groupChip}><Text style={styles.groupChipText}>{arCount(o.stops, 'restaurant')}</Text></View>
              </View>
              <Text style={[styles.sub, RTL.text]} numberOfLines={1}>{o.names.join(' • ') || '—'}{o.customer_name ? ` · ${o.customer_name}` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-start', gap: 6 }}>
              <Text style={[styles.fee, cancelled && styles.feeCancelled]}>{money(o.earned)}</Text>
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
            {o.inProgress && (
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

  const renderItem = ({ item: o, index }) => {
    if (o.is_group_row) return renderGroup(o, index);
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
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={showCounts ? `${f.label} (${counts[f.id] || 0})` : f.label}>
            <Ionicons name={f.icon} size={15} color={on ? '#FFF' : COLORS.sub} />
            <Text style={[styles.chipText, on && { color: '#FFF' }]}>{f.label}</Text>
            {showCounts && counts[f.id] > 0 && (
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
  groupChip: { backgroundColor: GROUP_CHIP.bg, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  groupChipText: { fontSize: 11, fontWeight: '900', color: GROUP_CHIP.fg },
});
