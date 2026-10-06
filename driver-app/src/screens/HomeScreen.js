import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Animated, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { FadeIn, PopIn, Pulse, Skeleton, Press, CountUp, RadarRings, LoadingDots, GradientButton, haptic, isReducedMotion } from '../components/Anim';
import { money, num, orderTitle, orderIcon, orderNo, isPersonal, driverFee, tipOf } from '../utils/format';
import { groupNo, groupEarning, allPicked, nextStop, pickedCount } from '../utils/group';

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

const greetingFor = (h) => (h < 12 ? 'صباح الخير' : h < 18 ? 'نهارك سعيد' : 'مساء الخير');

// ───────── مفتاح الاتصال الكبير ─────────
const KNOB = 60;
function OnlineSwitch({ value, busy, onToggle }) {
  const v = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (isReducedMotion()) { v.setValue(value ? 1 : 0); return; }
    Animated.spring(v, { toValue: value ? 1 : 0, useNativeDriver: true, damping: 15, stiffness: 180 }).start();
  }, [value, v]);
  const travel = Math.max(0, w - 4 - KNOB - 16); // 4 = الحدود
  // غير متصل: المقبض يميناً · متصل: ينزلق يساراً
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] });
  const greenOpacity = v;
  const labelOn = v;
  const labelOff = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      onPress={() => { if (!busy) { haptic.medium(); onToggle(!value); } }}
      disabled={busy}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, busy }}
      accessibilityLabel={value ? 'أنت متصل، اضغط لإيقاف استقبال الطلبات' : 'أنت غير متصل، اضغط لبدء استقبال الطلبات'}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={styles.switch}>
      <LinearGradient colors={GRADIENTS.dark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: greenOpacity }]}>
        <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.switchSheen} pointerEvents="none" />

      {/* النصوص */}
      <Animated.View style={[styles.switchLabel, { left: 18, right: KNOB + 26, opacity: labelOff }]} pointerEvents="none">
        <Text style={styles.switchTitle}>غير متصل</Text>
        <Text style={styles.switchSub}>{busy ? 'جاري التحديث...' : 'اضغط لبدء استقبال الطلبات'}</Text>
      </Animated.View>
      <Animated.View style={[styles.switchLabel, { right: 18, left: KNOB + 26, opacity: labelOn }]} pointerEvents="none">
        <View style={[RTL.row, { gap: 6 }]}>
          <Pulse active={value && !busy} to={1.4}><View style={styles.liveDot} /></Pulse>
          <Text style={styles.switchTitle}>متصل</Text>
        </View>
        <Text style={styles.switchSub}>{busy ? 'جاري التحديث...' : 'تستقبل الطلبات القريبة الآن'}</Text>
      </Animated.View>

      {/* المقبض */}
      <Animated.View style={[styles.knobWrap, { transform: [{ translateX }] }]} pointerEvents="none">
        <RadarRings size={KNOB + 34} color="rgba(255,255,255,0.45)" active={value && !busy} duration={2200} rings={2}>
          <View style={[styles.knob, SHADOW.dark]}>
            {busy ? <LoadingDots color={value ? COLORS.green : COLORS.ink} size={6} />
              : <Ionicons name="power" size={28} color={value ? COLORS.green : COLORS.ink} />}
          </View>
        </RadarRings>
      </Animated.View>
    </Pressable>
  );
}

function StatTile({ icon, color, bg, label, children, delay }) {
  return (
    <PopIn delay={delay} style={{ flex: 1 }}>
      <View style={styles.statCard}>
        <View style={[styles.statIcon, { backgroundColor: bg }]}><Ionicons name={icon} size={18} color={color} /></View>
        <View style={{ flex: 1 }}>
          {children}
          <Text style={[styles.statLabel, RTL.text]}>{label}</Text>
        </View>
      </View>
    </PopIn>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { contentPadding } = useTabBarOffset();
  const { user } = useAuth();
  const { isOnline, onlineBusy, setOnline, driver, activeOrder, activeGroup, refreshDriver, refreshActiveOrder } = useDriver();
  const busyJob = !!(activeOrder || activeGroup);
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
  const firstName = String(name).trim().split(/\s+/)[0] || name;
  const stage = activeOrder ? activeStage(activeOrder) : null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: contentPadding + 72 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} progressViewOffset={insets.top} />}>
        {/* الترويسة */}
        <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <View style={styles.orbA} />
          <View style={styles.orbB} />
          <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
          <FadeIn from={8}>
            <View style={styles.headerRow}>
              <Press onPress={() => navigation.navigate('حسابي')} accessibilityLabel="حسابي" style={styles.avatar}>
                <Text style={styles.avatarText}>{name?.[0] || 'م'}</Text>
                {rating > 0 && (
                  <View style={styles.avatarRating}>
                    <Ionicons name="star" size={9} color={COLORS.star} />
                    <Text style={styles.avatarRatingText}>{rating.toFixed(1)}</Text>
                  </View>
                )}
              </Press>
              <View style={{ flex: 1 }}>
                <Text style={[styles.greeting, RTL.text]}>{greetingFor(new Date().getHours())}</Text>
                <Text style={[styles.driverName, RTL.text]} numberOfLines={1}>{firstName} 👋</Text>
              </View>
              <Press onPress={onRefresh} style={styles.headerBtn} accessibilityLabel="تحديث" hitSlop={8}>
                <Ionicons name="refresh" size={20} color="#FFF" />
              </Press>
            </View>
          </FadeIn>

          <PopIn delay={80}>
            <OnlineSwitch value={isOnline} busy={onlineBusy} onToggle={setOnline} />
          </PopIn>
        </LinearGradient>

        {isOnline && permission === 'denied' && (
          <FadeIn>
            <View style={styles.warn}>
              <View style={styles.warnIcon}><Ionicons name="location" size={16} color="#FFF" /></View>
              <Text style={[styles.warnText, RTL.text]}>إذن الموقع غير مفعّل — لن تصلك الطلبات القريبة. فعّله من إعدادات الجهاز.</Text>
            </View>
          </FadeIn>
        )}

        {/* أرباح اليوم */}
        <View style={styles.section}>
          <PopIn delay={120}>
            <View style={styles.earnCard}>
              <View style={[RTL.row, { justifyContent: 'space-between' }]}>
                <View style={[RTL.row, { gap: 8 }]}>
                  <View style={[styles.statIcon, { backgroundColor: COLORS.greenSoft }]}><Ionicons name="wallet" size={18} color={COLORS.greenDeep} /></View>
                  <Text style={styles.earnLabel}>أرباح اليوم</Text>
                </View>
                <Press onPress={() => navigation.navigate('الأرباح')} style={styles.linkChip} accessibilityLabel="عرض الأرباح">
                  <Text style={styles.linkChipText}>التفاصيل</Text>
                  <Ionicons name="chevron-back" size={14} color={COLORS.primary} />
                </Press>
              </View>
              {stats == null
                ? <Skeleton width={170} height={40} radius={12} style={{ alignSelf: 'flex-end', marginTop: 12 }} />
                : <CountUp value={stats.earnings} format={money} style={styles.earnValue} adjustsFontSizeToFit />}
            </View>
          </PopIn>

          <View style={styles.statsRow}>
            <StatTile icon="cube" color={COLORS.blue} bg={COLORS.blueSoft} label="توصيلات اليوم" delay={180}>
              {stats == null ? <Skeleton width={40} height={22} style={{ alignSelf: 'flex-end', marginBottom: 2 }} />
                : <CountUp value={stats.deliveries} style={[styles.statVal, RTL.text]} />}
            </StatTile>
            <StatTile icon="star" color={COLORS.star} bg={COLORS.amberSoft} label="تقييمك" delay={240}>
              {driver == null ? <Skeleton width={40} height={22} style={{ alignSelf: 'flex-end', marginBottom: 2 }} />
                : rating > 0 ? <CountUp value={rating} format={(n) => n.toFixed(1)} style={[styles.statVal, RTL.text]} />
                  : <Text style={[styles.statVal, RTL.text]}>—</Text>}
            </StatTile>
          </View>
        </View>

        {/* الطلب النشط */}
        {activeOrder && (
          <FadeIn style={styles.section}>
            <Press onPress={() => navigation.navigate('Delivery', { orderId: activeOrder.id })} scaleTo={0.98} hapticStyle="medium"
              style={[styles.activeShadow]} accessibilityLabel={`طلب نشط رقم ${orderNo(activeOrder)}، افتح التفاصيل والتنقل`}>
              <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activeCard}>
                <View style={styles.activeGlow} />
                <View style={[RTL.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
                  <View style={[RTL.row, { gap: 8 }]}>
                    <Pulse to={1.5}><View style={styles.activeLive} /></Pulse>
                    <Text style={styles.activeTitle}>طلب نشط #{orderNo(activeOrder)}</Text>
                  </View>
                  <StatusBadge status={activeOrder.status} label={stage.badge} onDark />
                </View>

                <View style={styles.activeRoute}>
                  <View style={[RTL.row, { gap: 10 }]}>
                    <View style={styles.activeDotWrap}><Ionicons name={orderIcon(activeOrder)} size={13} color={COLORS.primary} /></View>
                    <Text style={[styles.activeText, RTL.text]} numberOfLines={1}>{orderTitle(activeOrder)}</Text>
                  </View>
                  <View style={styles.activeLine} />
                  <View style={[RTL.row, { gap: 10 }]}>
                    <View style={styles.activeDotWrap}><Ionicons name="location" size={13} color={COLORS.red} /></View>
                    <Text style={[styles.activeText, RTL.text]} numberOfLines={1}>{activeOrder.delivery_address || (isPersonal(activeOrder) ? 'نقطة التسليم' : 'عنوان الزبون')}</Text>
                  </View>
                </View>

                <View style={[RTL.row, { justifyContent: 'space-between', marginTop: 12 }]}>
                  <Text style={[styles.activeHint, RTL.text]} numberOfLines={2}>{stage.hint}</Text>
                  <View style={styles.feePill}>
                    <Text style={styles.feeLabel}>أجرك</Text>
                    <Text style={styles.feeValue}>{money(driverFee(activeOrder) + tipOf(activeOrder))}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 12 }}><CashBadge order={activeOrder} size="sm" /></View>
                <View style={styles.navBtn}>
                  <Ionicons name="navigate" size={19} color={COLORS.primary} />
                  <Text style={styles.navBtnText}>التنقل والتفاصيل</Text>
                </View>
              </LinearGradient>
            </Press>
          </FadeIn>
        )}

        {/* 🧺 الطلب المجمّع النشط */}
        {activeGroup && !activeOrder && (() => {
          const g = activeGroup;
          const toCustomer = allPicked(g);
          const nx = nextStop(g);
          const total = (g.stops || []).length;
          return (
            <FadeIn style={styles.section}>
              <Press onPress={() => navigation.navigate('Delivery', { groupId: g.id })} scaleTo={0.98} hapticStyle="medium"
                style={[styles.activeShadow]} accessibilityLabel={`طلب مجمّع نشط رقم ${groupNo(g)}، افتح التفاصيل والتنقل`}>
                <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activeCard}>
                  <View style={styles.activeGlow} />
                  <View style={[RTL.row, { justifyContent: 'space-between', marginBottom: 14 }]}>
                    <View style={[RTL.row, { gap: 8, flex: 1 }]}>
                      <Pulse to={1.5}><View style={styles.activeLive} /></Pulse>
                      <Text style={styles.activeTitle} numberOfLines={1}>طلب مجمّع #{groupNo(g)}</Text>
                    </View>
                    <StatusBadge status={toCustomer ? 'on_the_way' : 'preparing'} label={toCustomer ? 'في الطريق للزبون' : `استلمت ${pickedCount(g)} من ${total}`} onDark />
                  </View>

                  <View style={styles.activeRoute}>
                    <View style={[RTL.row, { gap: 10 }]}>
                      <View style={styles.activeDotWrap}><Ionicons name="layers" size={13} color={COLORS.primary} /></View>
                      <Text style={[styles.activeText, RTL.text]} numberOfLines={1}>{(g.stops || []).map(s => s.name).join(' • ') || `${total} مطاعم`}</Text>
                    </View>
                    <View style={styles.activeLine} />
                    <View style={[RTL.row, { gap: 10 }]}>
                      <View style={styles.activeDotWrap}><Ionicons name="location" size={13} color={COLORS.red} /></View>
                      <Text style={[styles.activeText, RTL.text]} numberOfLines={1}>{g.dropoff?.address || g.delivery_address || 'عنوان الزبون'}</Text>
                    </View>
                  </View>

                  <View style={[RTL.row, { justifyContent: 'space-between', marginTop: 12 }]}>
                    <Text style={[styles.activeHint, RTL.text]} numberOfLines={2}>
                      {toCustomer ? 'استلمت كل الطلبات — توجّه إلى الزبون' : nx ? `التالي: ${nx.name}` : 'توجّه للمطاعم لاستلام الطلبات'}
                    </Text>
                    <View style={styles.feePill}>
                      <Text style={styles.feeLabel}>أجرك</Text>
                      <Text style={styles.feeValue}>{money(groupEarning(g))}</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 12 }}><CashBadge order={g} size="sm" /></View>
                  <View style={styles.navBtn}>
                    <Ionicons name="navigate" size={19} color={COLORS.primary} />
                    <Text style={styles.navBtnText}>التنقل والتفاصيل</Text>
                  </View>
                </LinearGradient>
              </Press>
            </FadeIn>
          );
        })()}

        {/* حالة الانتظار / عدم الاتصال */}
        {!busyJob && !isOnline && (
          <FadeIn style={styles.section}>
            <View style={styles.stateBox}>
              <View style={styles.stateArt}>
                <LinearGradient colors={['#E6E8F0', '#F4F5F9']} style={styles.stateBlob} />
                <MaterialCommunityIcons name="moped-outline" size={52} color={COLORS.sub} />
              </View>
              <Text style={styles.stateTitle}>أنت غير متصل</Text>
              <Text style={styles.stateText}>فعّل الاتصال لبدء استقبال الطلبات القريبة منك</Text>
              <GradientButton label="ابدأ الآن" icon="power" colors={GRADIENTS.green} shadow={SHADOW.green} onPress={() => setOnline(true)} disabled={onlineBusy} loading={onlineBusy} height={52} style={{ marginTop: 18, minWidth: 190 }} />
            </View>
          </FadeIn>
        )}
        {!busyJob && isOnline && (
          <FadeIn style={styles.section}>
            <View style={[styles.stateBox, styles.waitingBox]}>
              <RadarRings size={150} color="rgba(29,185,84,0.35)" duration={2600}>
                <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.radarCore, SHADOW.green]}>
                  <Ionicons name="radio" size={34} color="#FFF" />
                </LinearGradient>
              </RadarRings>
              <Text style={[styles.stateTitle, { color: COLORS.greenDeep }]}>نبحث لك عن طلبات...</Text>
              <Text style={[styles.stateText, { color: COLORS.greenDeep }]}>سيظهر أي طلب قريب منك فوراً مع تنبيه صوتي واهتزاز</Text>
              <View style={[RTL.row, styles.tipRow]}>
                <Ionicons name="bulb-outline" size={15} color={COLORS.greenDeep} />
                <Text style={[styles.tipText, RTL.text]}>ابقَ قرب المطاعم النشطة لتصلك طلبات أكثر</Text>
              </View>
            </View>
          </FadeIn>
        )}

        {/* إجراءات سريعة */}
        <View style={[styles.quickActions]}>
          {[
            { icon: 'wallet-outline', label: 'أرباحي', onPress: () => navigation.navigate('الأرباح') },
            { icon: 'receipt-outline', label: 'طلباتي', onPress: () => navigation.navigate('الطلبات') },
            { icon: 'star-outline', label: 'تقييماتي', onPress: () => navigation.navigate('Reviews') },
          ].map((a, i) => (
            <FadeIn key={a.label} delay={300 + i * 50} style={{ flex: 1 }}>
              <Press style={styles.quickBtn} onPress={a.onPress} accessibilityLabel={a.label}>
                <View style={styles.quickIcon}><Ionicons name={a.icon} size={22} color={COLORS.primary} /></View>
                <Text style={styles.quickLabel}>{a.label}</Text>
              </Press>
            </FadeIn>
          ))}
        </View>
      </ScrollView>
      <SupportButton />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingBottom: 20, borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#FF5E3A', ...SHADOW.float },
  orbA: { position: 'absolute', top: -70, left: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbB: { position: 'absolute', bottom: -50, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 18 },
  greeting: { fontSize: 13.5, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },
  driverName: { fontSize: 24, fontWeight: '900', color: '#FFF', marginTop: 1 },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.24)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  avatarRating: { position: 'absolute', bottom: -7, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFF', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  avatarRatingText: { fontSize: 10, fontWeight: '900', color: COLORS.text },
  headerBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },

  switch: { height: 84, borderRadius: 42, overflow: 'hidden', justifyContent: 'center', backgroundColor: COLORS.ink, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  switchSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  switchLabel: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  switchTitle: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  switchSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500', marginTop: 1, textAlign: 'center' },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFF' },
  knobWrap: { position: 'absolute', right: 8 - 17, top: (80 - (KNOB + 34)) / 2, width: KNOB + 34, height: KNOB + 34, alignItems: 'center', justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },

  warn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, backgroundColor: COLORS.amberSoft, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: '#FFE3A3' },
  warnIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.amber, alignItems: 'center', justifyContent: 'center' },
  warnText: { flex: 1, color: COLORS.text, fontSize: 12.5, fontWeight: '700', lineHeight: 19 },

  section: { marginHorizontal: 16, marginTop: 16 },
  earnCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 2, padding: 16, ...SHADOW.card },
  earnLabel: { fontSize: 14, fontWeight: '800', color: COLORS.sub },
  earnValue: { fontSize: 38, fontWeight: '900', color: COLORS.text, textAlign: 'right', marginTop: 8 },
  linkChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, backgroundColor: COLORS.sec, borderRadius: RADIUS.pill, paddingHorizontal: 12, height: 32 },
  linkChipText: { color: COLORS.primary, fontWeight: '800', fontSize: 12.5 },
  statsRow: { flexDirection: 'row-reverse', gap: 10, marginTop: 10 },
  statCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: RADIUS.md + 2, padding: 14, ...SHADOW.soft },
  statIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statVal: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  statLabel: { fontSize: 11.5, color: COLORS.gray, fontWeight: '500' },

  activeShadow: { borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, ...SHADOW.float },
  activeCard: { borderRadius: RADIUS.lg, padding: 18, overflow: 'hidden' },
  activeGlow: { position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)' },
  activeLive: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFF' },
  activeTitle: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  activeRoute: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  activeDotWrap: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  activeLine: { width: 2, height: 12, backgroundColor: 'rgba(255,255,255,0.5)', alignSelf: 'flex-end', marginRight: 12, marginVertical: 3 },
  activeText: { color: '#FFF', fontSize: 14, flex: 1, fontWeight: '700' },
  activeHint: { flex: 1, color: '#FFF', fontSize: 13.5, fontWeight: '800', marginLeft: 10 },
  feePill: { alignItems: 'center', backgroundColor: 'rgba(20,20,43,0.22)', borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 6 },
  feeLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700' },
  feeValue: { color: '#FFF', fontSize: 17, fontWeight: '900' },
  navBtn: { backgroundColor: '#FFF', borderRadius: RADIUS.md - 2, height: 52, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 2 },
  navBtnText: { color: COLORS.primary, fontWeight: '900', fontSize: 15 },

  stateBox: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 24, alignItems: 'center', ...SHADOW.soft },
  stateArt: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stateBlob: { position: 'absolute', width: 110, height: 110, borderRadius: 55, transform: [{ rotate: '18deg' }] },
  waitingBox: { backgroundColor: COLORS.greenSoft, borderWidth: 1, borderColor: COLORS.greenLine, elevation: 0, shadowOpacity: 0, paddingTop: 12 },
  radarCore: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  stateTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, marginBottom: 6, textAlign: 'center' },
  stateText: { fontSize: 13.5, color: COLORS.gray, textAlign: 'center', lineHeight: 21, fontWeight: '500' },
  tipRow: { gap: 6, marginTop: 14, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 7 },
  tipText: { color: COLORS.greenDeep, fontSize: 12, fontWeight: '700' },

  quickActions: { flexDirection: 'row-reverse', marginHorizontal: 16, marginTop: 16, gap: 10 },
  quickBtn: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: 'center', gap: 6, ...SHADOW.soft },
  quickIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 12.5, fontWeight: '800', color: COLORS.text },
});
