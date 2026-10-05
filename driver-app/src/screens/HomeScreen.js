import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDriver } from '../context/DriverContext';
import { useDriverLocation } from '../context/LocationContext';
import api from '../utils/api';
import SupportButton from '../components/SupportButton';
import StatusBadge from '../components/StatusBadge';
import { CashBadge } from '../components/OrderMoney';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { COLORS, GRADIENTS, SHADOW, RTL } from '../theme';
import { FadeIn, PopIn, Pulse, Skeleton } from '../components/Anim';
import { money, num, orderTitle, orderIcon, orderNo, isPersonal, driverFee, tipOf } from '../utils/format';

// وصف المرحلة الحالية للطلب النشط حسب الحالة الحقيقية
function activeStage(o) {
  const p = isPersonal(o);
  switch (o?.status) {
    case 'on_the_way': return { badge: p ? 'في الطريق للتسليم' : 'في الطريق للزبون', hint: p ? 'توجّه إلى نقطة التسليم' : 'توجّه إلى موقع الزبون' };
    case 'ready': return { badge: p ? 'بانتظار الاستلام' : 'المطعم جاهز', hint: p ? 'توجّه إلى نقطة الاستلام' : 'الطلب جاهز — توجّه للمطعم واستلمه' };
    case 'preparing': return { badge: p ? 'بانتظار الاستلام' : 'قيد التحضير', hint: p ? 'توجّه إلى نقطة الاستلام' : 'المطعم يحضّر الطلب — توجّه إليه' };
    default: return { badge: 'طلب نشط', hint: p ? 'توجّه إلى نقطة الاستلام' : 'توجّه إلى المطعم' };
  }
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { contentPadding } = useTabBarOffset();
  const { user } = useAuth();
  const { isOnline, onlineBusy, setOnline, driver, activeOrder, refreshDriver, refreshActiveOrder } = useDriver();
  const { permission } = useDriverLocation();
  const [stats, setStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const r = await api.get('/drivers/earnings?period=today');
      setStats({ deliveries: parseInt(r?.data?.stats?.deliveries, 10) || 0, earnings: num(r?.data?.stats?.earnings) });
    } catch { setStats(s => s || { deliveries: 0, earnings: 0 }); }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshDriver(), fetchStats(), refreshActiveOrder()]);
  }, [refreshDriver, fetchStats, refreshActiveOrder]);

  useFocusEffect(useCallback(() => { refreshAll(); }, [refreshAll]));

  const onRefresh = async () => { setRefreshing(true); await refreshAll(); setRefreshing(false); };

  const rating = num(driver?.rating);
  const name = user?.name || driver?.name || 'المندوب';
  const stage = activeOrder ? activeStage(activeOrder) : null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: contentPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} progressViewOffset={insets.top} />}>
        {/* Header */}
        <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerGlow} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, RTL.text]}>مرحباً 👋</Text>
              <Text style={[styles.driverName, RTL.text]} numberOfLines={1}>{name}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('حسابي')} activeOpacity={0.85}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{name?.[0] || 'م'}</Text></View>
            </TouchableOpacity>
          </View>

          {/* Online card */}
          <View style={styles.onlineCard}>
            <View style={[RTL.row, { gap: 12, flex: 1 }]}>
              <Pulse active={isOnline}>
                <View style={[styles.onlineDot, { backgroundColor: isOnline ? COLORS.green : COLORS.faint }]} />
              </Pulse>
              <View style={{ flex: 1 }}>
                <Text style={[styles.onlineTitle, RTL.text]}>{isOnline ? 'أنت متصل الآن' : 'أنت غير متصل'}</Text>
                <Text style={[styles.onlineSub, RTL.text]}>
                  {onlineBusy ? 'جاري تحديث الحالة...' : isOnline ? 'جاهز لاستقبال الطلبات' : 'فعّل الاتصال لبدء استقبال الطلبات'}
                </Text>
              </View>
            </View>
            {onlineBusy ? <ActivityIndicator color={COLORS.primary} style={{ marginHorizontal: 12 }} /> : (
              <Switch
                value={isOnline}
                onValueChange={setOnline}
                disabled={onlineBusy}
                trackColor={{ false: COLORS.line, true: 'rgba(37,194,110,0.45)' }}
                thumbColor={isOnline ? COLORS.green : '#FFF'}
              />
            )}
          </View>
        </LinearGradient>

        {isOnline && permission === 'denied' && (
          <View style={styles.warn}>
            <Ionicons name="warning" size={18} color={COLORS.amber} />
            <Text style={[styles.warnText, RTL.text]}>إذن الموقع غير مفعّل — لن تصلك الطلبات القريبة. فعّله من إعدادات الجهاز.</Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { icon: 'cube', color: COLORS.blue, bg: COLORS.blueSoft, val: stats ? String(stats.deliveries) : null, label: 'توصيلات اليوم' },
            { icon: 'wallet', color: COLORS.green, bg: COLORS.greenSoft, val: stats ? money(stats.earnings) : null, label: 'أرباح اليوم' },
            { icon: 'star', color: COLORS.star, bg: COLORS.amberSoft, val: driver ? (rating > 0 ? rating.toFixed(1) : '—') : null, label: 'تقييمك' },
          ].map((s, i) => (
            <PopIn key={s.label} delay={i * 70} style={{ flex: 1 }}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: s.bg }]}><Ionicons name={s.icon} size={18} color={s.color} /></View>
                {s.val == null ? <Skeleton width={54} height={20} style={{ marginVertical: 3 }} /> : <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit>{s.val}</Text>}
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </PopIn>
          ))}
        </View>

        {/* Active order */}
        {activeOrder && (
          <FadeIn>
            <TouchableOpacity activeOpacity={0.92} onPress={() => navigation.navigate('Delivery', { orderId: activeOrder.id })}>
              <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activeCard}>
                <View style={styles.activeGlow} />
                <View style={[RTL.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
                  <Text style={styles.activeTitle}>طلب نشط #{orderNo(activeOrder)}</Text>
                  <StatusBadge status={activeOrder.status} label={stage.badge} onDark />
                </View>
                <View style={[RTL.row, styles.activeRow]}>
                  <Ionicons name={`${orderIcon(activeOrder)}-outline`} size={16} color="rgba(255,255,255,0.85)" />
                  <Text style={[styles.activeText, RTL.text]} numberOfLines={1}>{orderTitle(activeOrder)}</Text>
                </View>
                <View style={[RTL.row, styles.activeRow]}>
                  <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.85)" />
                  <Text style={[styles.activeText, RTL.text]} numberOfLines={1}>{activeOrder.delivery_address || (isPersonal(activeOrder) ? 'نقطة التسليم' : 'عنوان الزبون')}</Text>
                </View>
                <View style={[RTL.row, styles.activeRow]}>
                  <Ionicons name="bicycle-outline" size={16} color="rgba(255,255,255,0.85)" />
                  <Text style={[styles.activeText, RTL.text]}>أجرك {money(driverFee(activeOrder) + tipOf(activeOrder))}</Text>
                </View>
                <Text style={[styles.activeHint, RTL.text]}>{stage.hint}</Text>
                <View style={{ marginTop: 10 }}><CashBadge order={activeOrder} size="sm" /></View>
                <View style={styles.navBtn}>
                  <Ionicons name="navigate" size={18} color={COLORS.primary} />
                  <Text style={styles.navBtnText}>التنقل والتفاصيل</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </FadeIn>
        )}

        {/* Empty states */}
        {!activeOrder && !isOnline && (
          <FadeIn style={styles.stateBox}>
            <View style={[styles.stateIcon, { backgroundColor: COLORS.inputBg }]}><Text style={{ fontSize: 40 }}>🛵</Text></View>
            <Text style={styles.stateTitle}>غير متصل</Text>
            <Text style={styles.stateText}>فعّل زر الاتصال في الأعلى لبدء استقبال الطلبات</Text>
            <TouchableOpacity style={styles.stateBtn} onPress={() => setOnline(true)} disabled={onlineBusy}>
              <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.stateBtnGrad}>
                <Ionicons name="power" size={18} color="#FFF" />
                <Text style={styles.stateBtnText}>ابدأ الآن</Text>
              </LinearGradient>
            </TouchableOpacity>
          </FadeIn>
        )}
        {!activeOrder && isOnline && (
          <FadeIn style={[styles.stateBox, styles.waitingBox]}>
            <Pulse>
              <View style={[styles.stateIcon, { backgroundColor: '#D6F7E5' }]}><Ionicons name="radio" size={38} color={COLORS.green} /></View>
            </Pulse>
            <Text style={[styles.stateTitle, { color: COLORS.greenDeep }]}>جاهز لاستقبال الطلبات</Text>
            <Text style={[styles.stateText, { color: COLORS.greenDeep }]}>سيظهر أي طلب قريب منك هنا فوراً مع تنبيه صوتي</Text>
          </FadeIn>
        )}

        {/* Quick actions */}
        <View style={styles.quickActions}>
          {[
            { icon: 'wallet-outline', label: 'أرباحي', onPress: () => navigation.navigate('الأرباح') },
            { icon: 'list-outline', label: 'طلباتي', onPress: () => navigation.navigate('الطلبات') },
            { icon: 'refresh-outline', label: 'تحديث', onPress: onRefresh },
          ].map(a => (
            <TouchableOpacity key={a.label} style={styles.quickBtn} onPress={a.onPress} activeOpacity={0.85}>
              <View style={styles.quickIcon}><Ionicons name={a.icon} size={22} color={COLORS.primary} /></View>
              <Text style={styles.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <SupportButton />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingBottom: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', ...SHADOW.float },
  headerGlow: { position: 'absolute', top: -70, left: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.10)' },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 16 },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  driverName: { fontSize: 22, fontWeight: '900', color: '#FFF', marginTop: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)' },
  avatarText: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  onlineCard: { backgroundColor: COLORS.card, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, ...SHADOW.soft },
  onlineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: '#FFF', ...SHADOW.soft },
  onlineTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  onlineSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  warn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: COLORS.amberSoft, borderRadius: 14, padding: 12 },
  warnText: { flex: 1, color: COLORS.text, fontSize: 12.5, fontWeight: '600' },
  statsRow: { flexDirection: 'row-reverse', gap: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  statCard: { backgroundColor: COLORS.card, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', ...SHADOW.soft },
  statIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statVal: { fontSize: 19, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 2, fontWeight: '600' },
  activeCard: { margin: 16, marginBottom: 4, borderRadius: 24, padding: 18, overflow: 'hidden', ...SHADOW.float },
  activeGlow: { position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)' },
  activeTitle: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  activeRow: { gap: 8, marginBottom: 6 },
  activeText: { color: 'rgba(255,255,255,0.95)', fontSize: 13.5, flex: 1, fontWeight: '600' },
  activeHint: { color: '#FFF', fontSize: 13, fontWeight: '800', marginTop: 4 },
  navBtn: { backgroundColor: '#FFF', borderRadius: 14, padding: 13, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  navBtnText: { color: COLORS.primary, fontWeight: '900', fontSize: 14 },
  stateBox: { margin: 16, marginBottom: 4, backgroundColor: COLORS.card, borderRadius: 24, padding: 26, alignItems: 'center', ...SHADOW.soft },
  waitingBox: { backgroundColor: COLORS.greenSoft, borderWidth: 1, borderColor: '#C3F0D6', elevation: 0, shadowOpacity: 0 },
  stateIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stateTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, marginBottom: 6 },
  stateText: { fontSize: 13, color: COLORS.gray, textAlign: 'center', lineHeight: 20 },
  stateBtn: { marginTop: 16, borderRadius: 16, overflow: 'hidden', ...SHADOW.green },
  stateBtnGrad: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 26, paddingVertical: 12 },
  stateBtnText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  quickActions: { flexDirection: 'row-reverse', margin: 16, gap: 10 },
  quickBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 6, ...SHADOW.soft },
  quickIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12, fontWeight: '800', color: COLORS.text },
});
