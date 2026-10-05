import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Animated, Pressable, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import GradientHeader from '../components/GradientHeader';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { FadeIn, Skeleton, Press, CountUp, AnimatedBar, EmptyState, haptic, isReducedMotion } from '../components/Anim';
import { readCache, writeCache } from '../utils/cache';
import { money, num, fmtDay } from '../utils/format';

const PERIODS = [{ id: 'today', label: 'اليوم' }, { id: 'week', label: 'الأسبوع' }, { id: 'month', label: 'الشهر' }];
const CHART_H = 120;
const CHART_DAYS = 14;

// ───────── مبدّل الفترة بمؤشر منزلق ─────────
function Segmented({ value, onChange }) {
  const [w, setW] = useState(0);
  const n = PERIODS.length;
  const segW = w > 0 ? (w - 10) / n : 0;
  const idx = Math.max(0, PERIODS.findIndex(p => p.id === value));
  const x = useRef(new Animated.Value(0)).current;
  const ready = useRef(false);
  useEffect(() => {
    if (!segW) return;
    const to = (n - 1 - idx) * segW; // row-reverse: الأول يميناً
    if (!ready.current || isReducedMotion()) { x.setValue(to); ready.current = true; return; }
    Animated.spring(x, { toValue: to, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
  }, [idx, segW, n, x]);
  return (
    <View style={styles.seg} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {segW > 0 && (
        <Animated.View pointerEvents="none" style={[styles.segIndicator, { width: segW, transform: [{ translateX: x }] }]}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.segPill, SHADOW.glow]} />
        </Animated.View>
      )}
      {PERIODS.map(p => {
        const on = value === p.id;
        return (
          <Pressable key={p.id} style={styles.segBtn} onPress={() => { if (!on) { haptic.select(); onChange(p.id); } }}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={p.label}>
            <Text style={[styles.segText, on && { color: '#FFF', fontWeight: '900' }]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────── رسم أعمدة يومي (Views فقط) ─────────
function Bar({ pct, index, selected, isMax, onPress, label }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isReducedMotion()) { v.setValue(1); return; }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 650, delay: Math.min(index, 14) * 35, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
  }, [pct, index, v]);
  const h = Math.max(6, pct * CHART_H);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [h, 0] });
  const colors = selected ? GRADIENTS.sunset : isMax ? ['#FFB680', '#FF8A3D'] : ['#FFD9BF', '#FFC59E'];
  return (
    <Pressable style={styles.barCol} onPress={onPress} accessibilityLabel={label} hitSlop={4}>
      <View style={styles.barTrack}>
        <Animated.View style={{ height: h, transform: [{ translateY }], borderRadius: 8, overflow: 'hidden' }}>
          <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

function DailyChart({ daily }) {
  const days = useMemo(() => [...daily].filter(d => d && d.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-CHART_DAYS), [daily]);
  const [sel, setSel] = useState(null);
  useEffect(() => { setSel(days.length ? days.length - 1 : null); }, [days]);
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map(d => num(d.earnings)));
  const maxIdx = days.reduce((m, d, i) => (num(d.earnings) > num(days[m].earnings) ? i : m), 0);
  const s = sel != null ? days[sel] : null;
  return (
    <View style={[styles.chartCard, SHADOW.soft]}>
      <View style={[RTL.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
        <View>
          <Text style={[styles.chartTitle, RTL.text]}>آخر {days.length} يوم</Text>
          <Text style={[styles.chartSub, RTL.text]}>{s ? fmtDay(s.date) : ''}</Text>
        </View>
        {s && (
          <View style={styles.chartValPill}>
            <Text style={styles.chartVal}>{money(s.earnings)}</Text>
            <Text style={styles.chartValSub}>{parseInt(s.count, 10) || 0} توصيلة</Text>
          </View>
        )}
      </View>
      <View style={styles.chartArea}>
        <View style={[styles.gridLine, { top: 0 }]} />
        <View style={[styles.gridLine, { top: CHART_H / 2 }]} />
        <View style={[styles.chartRow, { height: CHART_H }]}>
          {days.map((d, i) => (
            <Bar key={d.date} index={i} pct={num(d.earnings) / max} selected={sel === i} isMax={i === maxIdx}
              label={`${fmtDay(d.date)}: ${money(d.earnings)}`}
              onPress={() => { haptic.select(); setSel(i); }} />
          ))}
        </View>
      </View>
      <View style={styles.chartRow}>
        {days.map((d, i) => (
          <Text key={d.date} style={[styles.barLabel, sel === i && { color: COLORS.primary, fontWeight: '900' }]} numberOfLines={1}>
            {String(d.date).slice(8, 10).replace(/^0/, '')}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function EarningsScreen() {
  const navigation = useNavigation();
  const { contentPadding } = useTabBarOffset();
  const [period, setPeriod] = useState('today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const reqId = useRef(0);

  const fetchEarnings = useCallback(async (p) => {
    const id = ++reqId.current;
    setHasError(false);
    try {
      const res = await api.get(`/drivers/earnings?period=${p}`);
      if (id !== reqId.current) return; // تجاهل استجابة فترة قديمة
      setData(res?.data || null);
      writeCache('driver_earnings_' + p, res?.data || null);
    } catch {
      if (id === reqId.current) setHasError(true);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // عند تغيير الفترة: كاش فوري (إن وُجد) وإلا هيكل تحميل — لا نعرض أرقام فترة أخرى
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    (async () => {
      const cached = await readCache('driver_earnings_' + period);
      if (alive && cached) { setData(cached); setLoading(false); }
      fetchEarnings(period);
    })();
    return () => { alive = false; };
  }, [period, fetchEarnings]);

  // تحديث عند العودة للتبويب (بعد توصيل جديد مثلاً)
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    fetchEarnings(period);
  }, [period, fetchEarnings]));

  const onRefresh = async () => { setRefreshing(true); await fetchEarnings(period); setRefreshing(false); };

  const showSkeleton = loading && !data;
  const daily = Array.isArray(data?.daily) ? data.daily : [];
  const maxDay = Math.max(1, ...daily.map(d => num(d.earnings)));
  const earnings = num(data?.stats?.earnings);
  const deliveries = parseInt(data?.stats?.deliveries, 10) || 0;
  const avg = deliveries > 0 ? earnings / deliveries : 0;

  return (
    <View style={styles.container}>
      <GradientHeader title="أرباحي" subtitle="تابع دخلك ورصيد محفظتك" large showBack={false} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: contentPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}>
        <Segmented value={period} onChange={setPeriod} />

        {hasError && (
          <FadeIn>
            <View style={styles.errorBox}>
              <Ionicons name="cloud-offline-outline" size={20} color={COLORS.red} />
              <Text style={[styles.errorText, RTL.text]}>تعذّر تحميل الأرباح</Text>
              <Press style={styles.retryBtn} onPress={() => fetchEarnings(period)} accessibilityLabel="إعادة المحاولة">
                <Ionicons name="refresh" size={14} color="#FFF" />
                <Text style={styles.retryBtnText}>إعادة</Text>
              </Press>
            </View>
          </FadeIn>
        )}

        <FadeIn key={period}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
            <View style={styles.summaryGlow} />
            <View style={styles.summaryGlow2} />
            <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
            <View style={styles.summaryChip}>
              <Ionicons name="trending-up" size={14} color="#FFF" />
              <Text style={styles.summaryTitle}>إجمالي الأرباح · {PERIODS.find(p => p.id === period)?.label}</Text>
            </View>
            {showSkeleton ? (
              <>
                <Skeleton width={180} height={48} tone="dark" style={{ marginVertical: 10 }} radius={14} />
                <Skeleton width={200} height={44} tone="dark" radius={14} />
              </>
            ) : (
              <>
                <CountUp value={earnings} format={money} style={styles.summaryAmount} adjustsFontSizeToFit />
                <View style={[RTL.row, styles.summaryStats]}>
                  <View style={styles.summaryStat}>
                    <CountUp value={deliveries} style={styles.summaryStatVal} />
                    <Text style={styles.summaryStatLabel}>توصيلة</Text>
                  </View>
                  <View style={styles.summarySep} />
                  <View style={styles.summaryStat}>
                    <CountUp value={avg} format={money} style={styles.summaryStatVal} />
                    <Text style={styles.summaryStatLabel}>متوسط الطلب</Text>
                  </View>
                </View>
              </>
            )}
          </LinearGradient>
        </FadeIn>

        <FadeIn delay={80}>
          <View style={[styles.walletCard, SHADOW.soft]}>
            <View style={[RTL.row, { gap: 12, flex: 1 }]}>
              <LinearGradient colors={GRADIENTS.dark} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.walletIcon}>
                <Ionicons name="wallet" size={22} color={COLORS.amber} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[styles.walletLabel, RTL.text]}>رصيد المحفظة</Text>
                {showSkeleton ? <Skeleton width={100} height={22} style={{ marginTop: 4, alignSelf: 'flex-end' }} />
                  : <CountUp value={num(data?.wallet_balance)} format={money} style={[styles.walletAmount, RTL.text]} />}
              </View>
            </View>
            <Press style={styles.withdrawBtn} onPress={() => navigation.navigate('SupportChat')} accessibilityLabel="طلب سحب الرصيد">
              <Ionicons name="arrow-down-circle" size={17} color={COLORS.primary} />
              <Text style={styles.withdrawBtnText}>طلب سحب</Text>
            </Press>
          </View>
        </FadeIn>

        {showSkeleton ? (
          <View style={[styles.chartCard, SHADOW.soft]}>
            <Skeleton width="40%" height={14} style={{ alignSelf: 'flex-end', marginBottom: 14 }} />
            <View style={[styles.chartRow, { height: CHART_H, alignItems: 'flex-end' }]}>
              {[0.4, 0.7, 0.5, 0.9, 0.3, 0.6, 0.8].map((p, i) => <View key={i} style={styles.barCol}><Skeleton height={CHART_H * p} radius={8} /></View>)}
            </View>
          </View>
        ) : daily.length > 0 ? (
          <FadeIn delay={140}><DailyChart daily={daily} /></FadeIn>
        ) : null}

        <Text style={[styles.sectionTitle, RTL.text]}>سجل آخر ٣٠ يوماً</Text>
        {showSkeleton ? (
          [0, 1, 2].map(i => <Skeleton key={i} height={64} radius={16} style={{ marginBottom: 8 }} />)
        ) : daily.length === 0 ? (
          <EmptyState icon="bar-chart-outline" title="لا توجد توصيلات مكتملة بعد" text="ستظهر أرباحك اليومية هنا بعد أول توصيلة" />
        ) : daily.map((day, i) => (
          <FadeIn key={day.date || i} delay={Math.min(i, 8) * 45}>
            <View style={[styles.dayRow, SHADOW.soft]}>
              <View style={styles.dayIcon}><Ionicons name="calendar-outline" size={17} color={COLORS.primary} /></View>
              <View style={{ flex: 1 }}>
                <View style={[RTL.row, { justifyContent: 'space-between' }]}>
                  <Text style={[styles.dayDate, RTL.text]}>{fmtDay(day.date)}</Text>
                  <Text style={styles.dayEarnings}>{money(day.earnings)}</Text>
                </View>
                <View style={{ marginTop: 8 }}>
                  <AnimatedBar pct={Math.max(0.05, num(day.earnings) / maxDay)} colors={['#FF8A00', '#FF5E3A']} height={6} delay={Math.min(i, 8) * 45} />
                </View>
                <Text style={[styles.dayCount, RTL.text]}>{parseInt(day.count, 10) || 0} توصيلة</Text>
              </View>
            </View>
          </FadeIn>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  seg: { flexDirection: 'row-reverse', marginBottom: 16, backgroundColor: COLORS.card, borderRadius: RADIUS.md + 2, padding: 5, height: 54, borderWidth: 1, borderColor: COLORS.line, ...SHADOW.soft },
  segIndicator: { position: 'absolute', top: 5, bottom: 5, left: 5 },
  segPill: { flex: 1, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  segText: { fontWeight: '700', color: COLORS.sub, fontSize: 14.5 },
  summaryCard: { borderRadius: RADIUS.lg, padding: 22, alignItems: 'center', marginBottom: 14, overflow: 'hidden', backgroundColor: '#FF5E3A', ...SHADOW.float },
  summaryGlow: { position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.12)' },
  summaryGlow2: { position: 'absolute', bottom: -50, left: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.07)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  summaryChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 },
  summaryTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  summaryAmount: { color: '#FFF', fontSize: 46, fontWeight: '900', marginVertical: 6, textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10 },
  summaryStats: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: RADIUS.md, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  summaryStat: { flex: 1, alignItems: 'center' },
  summarySep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.3)' },
  summaryStatVal: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  summaryStatLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 11.5, fontWeight: '500' },
  walletCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 14 },
  walletIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  walletLabel: { fontSize: 12.5, color: COLORS.gray, fontWeight: '500' },
  walletAmount: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  withdrawBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: COLORS.sec, borderRadius: RADIUS.sm, paddingHorizontal: 14, height: 46, borderWidth: 1.5, borderColor: COLORS.tintLine },
  withdrawBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 13.5 },
  chartCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 16, marginBottom: 18 },
  chartTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  chartSub: { fontSize: 12, color: COLORS.gray, marginTop: 2, fontWeight: '500' },
  chartValPill: { alignItems: 'flex-start', backgroundColor: COLORS.sec, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 6 },
  chartVal: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  chartValSub: { fontSize: 11, color: COLORS.sub, fontWeight: '500' },
  chartArea: { height: CHART_H },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.line },
  chartRow: { flexDirection: 'row-reverse', gap: 5 },
  barCol: { flex: 1, justifyContent: 'flex-end' },
  barTrack: { height: CHART_H, justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 8 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 10, color: COLORS.gray, marginTop: 6, fontWeight: '500' },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text, marginBottom: 12 },
  dayRow: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  dayIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  dayDate: { fontSize: 14, color: COLORS.text, fontWeight: '700', flex: 1 },
  dayEarnings: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  dayCount: { fontSize: 11.5, color: COLORS.gray, marginTop: 6, fontWeight: '500' },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: COLORS.redSoft, borderRadius: RADIUS.md, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FBC9C4' },
  errorText: { flex: 1, color: COLORS.red, fontWeight: '800' },
  retryBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: COLORS.red, borderRadius: RADIUS.xs, paddingHorizontal: 14, height: 40 },
  retryBtnText: { color: '#FFF', fontWeight: '800' },
});
