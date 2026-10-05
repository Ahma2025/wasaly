import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { Skeleton } from '../components/Skeleton';
import { FadeIn } from '../components/Anim';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';
import { useTabBarInset } from '../components/FloatingTabBar';
import { useCart } from '../context/CartContext';
import { useTheme } from '../context/ThemeContext';
import { ACTIVE_STATUSES, statusLabel, statusMeta, softBg, isPersonalOrder } from '../utils/status';

const orderTitle = (o) => (isPersonalOrder(o)
  ? (o.service_type === 'ride' ? '🧍 توصيل راكب' : '📦 توصيل طرد')
  : (o.restaurant_name || 'طلب'));

export default function OrdersHistoryScreen() {
  const navigation = useNavigation();
  const { reorder, items: cartItems } = useCart();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const tabInset = useTabBarInset();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reordering, setReordering] = useState(null);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api.get('/orders/my?limit=50');
      const list = data.data || [];
      setOrders(list);
      writeCache('orders_my', list);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    (async () => {
      const cached = await readCache('orders_my');
      if (cached) { setOrders(cached); setLoading(false); }
      fetchOrders();
    })();
  }, [fetchOrders]));

  const doReorder = async (order) => {
    setReordering(order.id);
    try {
      const data = await api.get(`/orders/${order.id}`);
      const full = data.data || data;
      const items = (full.items || []).map(it => {
        let opts = [];
        try { opts = typeof it.options === 'string' ? JSON.parse(it.options) : (it.options || []); } catch {}
        if (!Array.isArray(opts)) opts = [];
        const addonsSum = opts.reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
        const base = Math.max(0, (parseFloat(it.price) || 0) - addonsSum); // السعر المخزّن يشمل الإضافات
        return {
          id: it.menu_item_id || it.item_id || it.id,
          name_ar: it.name_ar,
          price: base,
          addons: opts,
          quantity: it.quantity || 1,
          notes: it.notes || '',
        };
      });
      if (items.length === 0) { Alert.alert('تنبيه', 'تعذّر إعادة الطلب'); return; }
      reorder(items, { id: full.restaurant_id, name_ar: full.restaurant_name });
      navigation.navigate('سلتي');
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
    finally { setReordering(null); }
  };

  const handleReorder = (order) => {
    if (cartItems.length > 0) {
      Alert.alert('إعادة الطلب', 'سلتك الحالية فيها أصناف ورح تُستبدل بأصناف هذا الطلب. متأكد؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'استبدل السلة', style: 'destructive', onPress: () => doReorder(order) },
      ]);
    } else doReorder(order);
  };

  const active = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
  const history = orders.filter(o => !ACTIVE_STATUSES.includes(o.status));

  return (
    <View style={styles.container}>
      <GradientHeader title="طلباتي 📦" hideBack subtitle={active.length ? `${active.length} طلب جاري` : undefined} />

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>{[0, 1, 2, 3].map(i => (
          <View key={i} style={styles.skelCard}>
            <Skeleton w={'55%'} h={14} style={{ alignSelf: 'flex-end' }} />
            <Skeleton w={'35%'} h={11} style={{ marginTop: 8, alignSelf: 'flex-end' }} />
            <Skeleton w={'25%'} h={16} style={{ marginTop: 10 }} />
          </View>
        ))}</View>
      ) : orders.length === 0 ? (
        <EmptyState emoji="🧾" title="ما في طلبات بعد" subtitle="أول طلب إلك عليه خصم 15% 🎁" ctaLabel="اطلب الآن" onCta={() => navigation.navigate('الرئيسية')} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabInset + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>الطلبات الحالية</Text>
            {active.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🍽️</Text>
                <Text style={styles.emptyText}>لا توجد طلبات حالية</Text>
                <TouchableOpacity style={styles.orderNowBtn} onPress={() => navigation.navigate('الرئيسية')}>
                  <Text style={styles.orderNowText}>اطلب الآن</Text>
                </TouchableOpacity>
              </View>
            ) : (
              active.map((o, i) => <FadeIn key={o.id} delay={i * 60}><OrderCard order={o} navigation={navigation} isActive styles={styles} C={COLORS} /></FadeIn>)
            )}
          </View>

          {history.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>الطلبات السابقة</Text>
              {history.map((o, i) => (
                <FadeIn key={o.id} delay={Math.min(i, 8) * 50}>
                  <OrderCard order={o} navigation={navigation} onReorder={handleReorder} reordering={reordering === o.id} styles={styles} C={COLORS} />
                </FadeIn>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function OrderCard({ order, navigation, isActive, onReorder, reordering, styles, C }) {
  const meta = statusMeta(order.status);
  const personal = isPersonalOrder(order);
  const date = order.created_at ? new Date(order.created_at) : null;
  return (
    <TouchableOpacity
      style={[styles.card, isActive && styles.activeCard]}
      onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${orderTitle(order)}، ${statusLabel(order.status, order)}`}
    >
      <View style={styles.cardTop}>
        {!personal && order.restaurant_logo
          ? <Image source={{ uri: order.restaurant_logo }} style={styles.logo} />
          : <View style={[styles.logo, styles.logoFallback]}><Text style={{ fontSize: 20 }}>{personal ? '🛵' : '🍽️'}</Text></View>}
        <View style={{ flex: 1 }}>
          <Text style={styles.restaurantName} numberOfLines={1}>{orderTitle(order)}</Text>
          <Text style={styles.orderDate}>
            {date ? date.toLocaleString('ar', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}
            {order.order_number ? `  ·  #${order.order_number}` : ''}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: softBg(meta.color) }]}>
          <Ionicons name={meta.icon} size={12} color={meta.color} />
          <Text style={[styles.statusText, { color: meta.color }]}>{statusLabel(order.status, order)}</Text>
        </View>
      </View>

      <View style={styles.cardBottom}>
        <Text style={styles.itemsCount}>{order.items_count ? `${order.items_count} صنف` : (personal ? 'طلب شخصي' : '')}</Text>
        <Text style={styles.totalAmount}>{parseFloat(order.total || 0).toFixed(2)}₪</Text>
      </View>

      {isActive && (
        <View style={styles.trackRow}>
          <Ionicons name="navigate-circle-outline" size={15} color={C.primary} />
          <Text style={styles.trackText}>اضغط لتتبع طلبك</Text>
          <Ionicons name="chevron-back" size={14} color={C.primary} />
        </View>
      )}

      {!isActive && onReorder && !personal && order.restaurant_id && (
        <TouchableOpacity style={styles.reorderBtn} onPress={() => onReorder(order)} disabled={reordering} activeOpacity={0.8}>
          {reordering ? (
            <ActivityIndicator size="small" color={C.primary} />
          ) : (
            <>
              <Ionicons name="repeat" size={16} color={C.primary} />
              <Text style={styles.reorderText}>أعد الطلب</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  skelCard: { backgroundColor: C.card, borderRadius: 18, padding: 14 },
  section: { padding: 16, paddingBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: C.text, marginBottom: 10, textAlign: 'right' },
  emptyBox: { backgroundColor: C.card, borderRadius: 20, padding: 26, alignItems: 'center', marginBottom: 12, ...C.shadow.soft },
  emptyEmoji: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 15, color: C.gray, fontWeight: '600', marginBottom: 14 },
  orderNowBtn: { backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 },
  orderNowText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 10, ...C.shadow.soft },
  activeCard: { borderRightWidth: 4, borderRightColor: C.primary },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.inputBg },
  logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.tint },
  restaurantName: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'right' },
  orderDate: { fontSize: 11.5, color: C.gray, marginTop: 3, textAlign: 'right' },
  statusBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 11.5, fontWeight: '800' },
  cardBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  itemsCount: { fontSize: 12.5, color: C.gray },
  totalAmount: { fontSize: 16, fontWeight: '900', color: C.primary },
  trackRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line },
  trackText: { flex: 1, fontSize: 12.5, color: C.primary, fontWeight: '800', textAlign: 'right' },
  reorderBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: C.primary, backgroundColor: C.tint },
  reorderText: { fontSize: 14, color: C.primary, fontWeight: '800' },
});
