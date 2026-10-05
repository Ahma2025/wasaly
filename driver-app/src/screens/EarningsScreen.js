import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import GradientHeader from '../components/GradientHeader';
import { useTabBarOffset } from '../components/FloatingTabBar';
import { COLORS, GRADIENTS, SHADOW, RTL } from '../theme';
import { FadeIn, Skeleton } from '../components/Anim';
import { readCache, writeCache } from '../utils/cache';
import { money, num, fmtDay } from '../utils/format';

const PERIODS = [{ id: 'today', label: 'اليوم' }, { id: 'week', label: 'الأسبوع' }, { id: 'month', label: 'الشهر' }];

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

  return (
    <View style={styles.container}>
      <GradientHeader title="أرباحي" showBack={false} />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: contentPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}>
        <View style={styles.periodRow}>
          {PERIODS.map(p => {
            const on = period === p.id;
            return (
              <TouchableOpacity key={p.id} style={[styles.periodBtn, on && styles.periodBtnActive]} onPress={() => setPeriod(p.id)} activeOpacity={0.85}>
                <Text style={[styles.periodText, on && { color: '#FFF' }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {hasError && (
          <View style={styles.errorBox}>
            <Ionicons name="cloud-offline-outline" size={22} color={COLORS.red} />
            <Text style={styles.errorText}>تعذّر تحميل الأرباح</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchEarnings(period)}>
              <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        )}

        <FadeIn key={period}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summaryCard}>
            <View style={styles.summaryGlow} />
            <Text style={styles.summaryTitle}>إجمالي الأرباح · {PERIODS.find(p => p.id === period)?.label}</Text>
            {showSkeleton ? (
              <>
                <Skeleton width={160} height={44} style={{ marginVertical: 8, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <Skeleton width={90} height={14} style={{ backgroundColor: 'rgba(255,255,255,0.3)' }} />
              </>
            ) : (
              <>
                <Text style={styles.summaryAmount}>{money(data?.stats?.earnings)}</Text>
                <Text style={styles.summaryDeliveries}>{parseInt(data?.stats?.deliveries, 10) || 0} توصيلة</Text>
              </>
            )}
          </LinearGradient>
        </FadeIn>

        <View style={styles.walletCard}>
          <View style={[RTL.row, { gap: 12 }]}>
            <View style={styles.walletIcon}><Ionicons name="wallet" size={22} color={COLORS.primary} /></View>
            <View>
              <Text style={[styles.walletLabel, RTL.text]}>رصيد المحفظة</Text>
              {showSkeleton ? <Skeleton width={90} height={20} style={{ marginTop: 4 }} />
                : <Text style={[styles.walletAmount, RTL.text]}>{money(data?.wallet_balance)}</Text>}
            </View>
          </View>
          <TouchableOpacity style={styles.withdrawBtn} onPress={() => navigation.navigate('SupportChat')} activeOpacity={0.85}>
            <Text style={styles.withdrawBtnText}>طلب سحب</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, RTL.text]}>آخر ٣٠ يوماً</Text>
        {showSkeleton ? (
          [0, 1, 2].map(i => <Skeleton key={i} height={56} radius={14} style={{ marginBottom: 8 }} />)
        ) : daily.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 38 }}>📊</Text>
            <Text style={styles.emptyText}>لا توجد توصيلات مكتملة بعد</Text>
          </View>
        ) : daily.map((day, i) => (
          <FadeIn key={day.date || i} delay={Math.min(i, 8) * 40}>
            <View style={styles.dayRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dayDate, RTL.text]}>{fmtDay(day.date)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.max(6, (num(day.earnings) / maxDay) * 100)}%` }]} />
                </View>
              </View>
              <View style={{ alignItems: 'flex-start', marginRight: 14 }}>
                <Text style={styles.dayEarnings}>{money(day.earnings)}</Text>
                <Text style={styles.dayCount}>{parseInt(day.count, 10) || 0} توصيلة</Text>
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
  periodRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 16, backgroundColor: COLORS.card, borderRadius: 18, padding: 5, ...SHADOW.soft },
  periodBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center' },
  periodBtnActive: { backgroundColor: COLORS.primary, ...SHADOW.glow },
  periodText: { fontWeight: '800', color: COLORS.sub, fontSize: 13.5 },
  summaryCard: { borderRadius: 24, padding: 26, alignItems: 'center', marginBottom: 16, overflow: 'hidden', ...SHADOW.float },
  summaryGlow: { position: 'absolute', top: -40, right: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.12)' },
  summaryTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700' },
  summaryAmount: { color: '#FFF', fontSize: 42, fontWeight: '900', marginVertical: 4 },
  summaryDeliveries: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
  walletCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 16, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, ...SHADOW.soft },
  walletIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  walletLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  walletAmount: { fontSize: 21, fontWeight: '900', color: COLORS.text },
  withdrawBtn: { backgroundColor: COLORS.sec, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1.5, borderColor: COLORS.primary },
  withdrawBtnText: { color: COLORS.primary, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, marginBottom: 12 },
  dayRow: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 8, ...SHADOW.soft },
  dayDate: { fontSize: 13.5, color: COLORS.text, fontWeight: '700' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.inputBg, marginTop: 8, overflow: 'hidden', flexDirection: 'row-reverse' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: COLORS.primary },
  dayEarnings: { fontSize: 15, fontWeight: '900', color: COLORS.primary },
  dayCount: { fontSize: 11.5, color: COLORS.gray, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: COLORS.gray, fontWeight: '700' },
  errorBox: { backgroundColor: COLORS.redSoft, borderRadius: 16, padding: 16, marginBottom: 16, alignItems: 'center', gap: 6 },
  errorText: { color: COLORS.red, fontWeight: '800' },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  retryBtnText: { color: '#FFF', fontWeight: '800' },
});
