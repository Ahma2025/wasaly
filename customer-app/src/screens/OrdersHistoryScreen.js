import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, ActivityIndicator, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { Skeleton } from '../components/Skeleton';
import { FadeIn, Press, Pulse } from '../components/Anim';
import { Chip } from '../components/UI';
import { LinearGradient } from 'expo-linear-gradient';
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

  const [filter, setFilter] = useState('all');
  const shownHistory = filter === 'all' ? history
    : filter === 'delivered' ? history.filter(o => o.status === 'delivered')
      : history.filter(o => o.status === 'cancelled');

  return (
    <View style={styles.container}>
      <GradientHeader title="طلباتي" hideBack subtitle={active.length ? `${active.length} طلب جاري الآن` : (orders.length ? `${orders.length} طلب` : undefined)} />

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>{[0, 1, 2, 3].map(i => (
          <View key={i} style={styles.skelCard}>
            <View style={{ flexDirection: 'row-reverse', gap: 10, alignItems: 'center' }}>
              <Skeleton w={48} h={48} r={14} />
              <View style={{ flex: 1, gap: 8, alignItems: 'flex-end' }}><Skeleton w={'55%'} h={14} /><Skeleton w={'35%'} h={11} /></View>
            </View>
            <Skeleton w={'30%'} h={16} style={{ marginTop: 12 }} />
          </View>
        ))}</View>
      ) : orders.length === 0 ? (
        <EmptyState emoji="🧾" title="ما في طلبات بعد" subtitle="أول طلب إلك عليه خصم 15% 🎁" ctaLabel="اطلب الآن" onCta={() => navigation.navigate('الرئيسية')} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabInset + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.card} />}
        >
          <View style={styles.section}>
            <View style={styles.secHead}>
              <View style={styles.liveDotWrap}>{active.length > 0 && <Pulse to={1.6}><View style={styles.liveDot} /></Pulse>}</View>
              <Text style={styles.sectionTitle}>الطلبات الحالية</Text>
            </View>
            {active.length === 0 ? (
              <FadeIn style={styles.emptyBox}>
                <View style={styles.emptyIcon}><Ionicons name="restaurant-outline" size={28} color={COLORS.primary} /></View>
                <Text style={styles.emptyText}>لا توجد طلبات حالية</Text>
                <TouchableOpacity style={styles.orderNowBtn} onPress={() => navigation.navigate('الرئيسية')} accessibilityRole="button">
                  <Text style={styles.orderNowText}>اطلب الآن</Text>
                  <Ionicons name="arrow-back" size={14} color="#FFF" />
                </TouchableOpacity>
              </FadeIn>
            ) : (
              active.map((o, i) => <FadeIn key={o.id} index={i}><ActiveCard order={o} navigation={navigation} styles={styles} C={COLORS} /></FadeIn>)
            )}
          </View>

          {history.length > 0 && (
            <View style={styles.section}>
              <View style={[styles.secHead, { justifyContent: 'space-between' }]}>
                <Text style={styles.sectionTitle}>الطلبات السابقة</Text>
              </View>
              <View style={styles.filters}>
                {[['all', 'الكل'], ['delivered', 'مكتملة'], ['cancelled', 'ملغاة']].map(([k, l]) => (
                  <Chip key={k} size="sm" label={l} selected={filter === k} onPress={() => setFilter(k)} />
                ))}
              </View>
              {shownHistory.length === 0 ? (
                <Text style={styles.noneTxt}>ما في طلبات بهالتصنيف</Text>
              ) : shownHistory.map((o, i) => (
                <FadeIn key={`${filter}-${o.id}`} index={i}>
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

const PROGRESS = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered'];

/* بطاقة طلب جاري: متدرّجة مع شريط مراحل مصغّر */
function ActiveCard({ order, navigation, styles, C }) {
  const meta = statusMeta(order.status);
  const personal = isPersonalOrder(order);
  const idx = Math.max(0, PROGRESS.indexOf(order.status));
  return (
    <Press onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })} scaleTo={0.97}
      accessibilityRole="button" accessibilityLabel={`${orderTitle(order)}، ${statusLabel(order.status, order)}، اضغط للتتبع`}
      style={styles.activeShadow}>
      <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activeCard}>
        <LinearGradient colors={C.gradients.sheen} style={styles.activeSheen} pointerEvents="none" />
        <View style={styles.cardTop}>
          {!personal && order.restaurant_logo
            ? <Image source={{ uri: order.restaurant_logo }} style={[styles.logo, { borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }]} />
            : <View style={[styles.logo, styles.logoGlass]}><Ionicons name={personal ? 'bicycle' : 'restaurant'} size={20} color="#FFF" /></View>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.restaurantName, { color: '#FFF' }]} numberOfLines={1}>{orderTitle(order)}</Text>
            <Text style={[styles.orderDate, { color: 'rgba(255,255,255,0.85)' }]}>{order.order_number ? `#${order.order_number}` : ''}</Text>
          </View>
          <View style={styles.activeStatus}>
            <Ionicons name={meta.icon} size={13} color={C.primary} />
            <Text style={[styles.statusText, { color: C.primary }]}>{statusLabel(order.status, order)}</Text>
          </View>
        </View>
        {!personal && (
          <View style={styles.miniSteps}>
            {PROGRESS.slice(0, 5).map((s, i) => (
              <View key={s} style={[styles.miniStep, { backgroundColor: i <= idx ? '#FFF' : 'rgba(255,255,255,0.3)' }]} />
            ))}
          </View>
        )}
        <View style={styles.activeBottom}>
          <Text style={styles.activeTotal}>{parseFloat(order.total || 0).toFixed(2)}₪</Text>
          <View style={styles.trackPill}>
            <Ionicons name="navigate" size={13} color={C.primary} />
            <Text style={[styles.trackText, { color: C.primary }]}>تتبّع الطلب</Text>
          </View>
        </View>
      </LinearGradient>
    </Press>
  );
}

function OrderCard({ order, navigation, onReorder, reordering, styles, C }) {
  const meta = statusMeta(order.status);
  const personal = isPersonalOrder(order);
  const date = order.created_at ? new Date(order.created_at) : null;
  return (
    <Press
      style={styles.card}
      onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
      scaleTo={0.98}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={`${orderTitle(order)}، ${statusLabel(order.status, order)}`}
    >
      <View style={styles.cardTop}>
        {!personal && order.restaurant_logo
          ? <Image source={{ uri: order.restaurant_logo }} style={styles.logo} />
          : <View style={[styles.logo, styles.logoFallback]}><Ionicons name={personal ? 'bicycle' : 'restaurant'} size={20} color={C.primary} /></View>}
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

      {onReorder && !personal && order.restaurant_id && (
        <TouchableOpacity style={styles.reorderBtn} onPress={() => onReorder(order)} disabled={reordering} activeOpacity={0.8} accessibilityRole="button">
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
    </Press>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  skelCard: { backgroundColor: C.card, borderRadius: 22, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  section: { paddingHorizontal: 16, paddingTop: 18 },
  secHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  liveDotWrap: { width: 10, alignItems: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: C.text, textAlign: 'right' },
  filters: { flexDirection: 'row-reverse', gap: 8, marginBottom: 12 },
  noneTxt: { textAlign: 'center', color: C.gray, fontWeight: '600', paddingVertical: 20 },
  emptyBox: { backgroundColor: C.card, borderRadius: 24, padding: 22, alignItems: 'center', marginBottom: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyText: { fontSize: 15, color: C.gray, fontWeight: '600', marginBottom: 14 },
  orderNowBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 14 },
  orderNowText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  activeShadow: { marginBottom: 12, borderRadius: 24, ...C.shadow.float },
  activeCard: { borderRadius: 24, padding: 16, overflow: 'hidden' },
  activeSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 50 },
  logoGlass: { backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  activeStatus: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  miniSteps: { flexDirection: 'row-reverse', gap: 5, marginTop: 2, marginBottom: 12 },
  miniStep: { flex: 1, height: 5, borderRadius: 3 },
  activeBottom: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  activeTotal: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  trackPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: '#FFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  cardTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 10 },
  logo: { width: 48, height: 48, borderRadius: 15, backgroundColor: C.inputBg },
  logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.tint },
  restaurantName: { fontSize: 15.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  orderDate: { fontSize: 11.5, color: C.gray, marginTop: 3, textAlign: 'right', fontWeight: '500' },
  statusBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontSize: 11.5, fontWeight: '800' },
  cardBottom: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  itemsCount: { fontSize: 12.5, color: C.gray, fontWeight: '500' },
  totalAmount: { fontSize: 16, fontWeight: '900', color: C.primary },
  trackText: { fontSize: 12.5, fontWeight: '800', textAlign: 'right' },
  reorderBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: C.tintBorder, backgroundColor: C.tint },
  reorderText: { fontSize: 14, color: C.primary, fontWeight: '800' },
});
