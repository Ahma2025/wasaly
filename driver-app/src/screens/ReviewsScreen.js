import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import GradientHeader from '../components/GradientHeader';
import { readCache, writeCache } from '../utils/cache';
import { FadeIn, PopIn, SkeletonCard, Skeleton, CountUp, AnimatedBar, EmptyState } from '../components/Anim';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { fmtDate, num } from '../utils/format';
import { arCount } from '../utils/plural';

// توزيع النجوم من السيرفر إن أرسله (على كل التقييمات) — وإلا نحسبه من القائمة المحمّلة ونوضّح ذلك
function normDist(src) {
  if (!src || typeof src !== 'object') return null;
  const d = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let any = false;
  if (Array.isArray(src)) src.forEach(r => { const s = Math.round(num(r?.rating ?? r?.stars)); if (s >= 1 && s <= 5) { d[s] += parseInt(r?.count, 10) || 0; any = true; } });
  else [1, 2, 3, 4, 5].forEach(s => { if (src[s] != null || src[String(s)] != null) { d[s] = parseInt(src[s] ?? src[String(s)], 10) || 0; any = true; } });
  return any ? d : null;
}

// نجوم آمنة: تقيّد التقييم بين ٠ و٥ (repeat بقيمة سالبة كان يرمي RangeError)
export const starStr = (n) => {
  const v = Math.max(0, Math.min(5, Math.round(num(n))));
  return '★'.repeat(v) + '☆'.repeat(5 - v);
};

// نجوم بأيقونات (تدعم أنصاف النجوم) — RTL: تمتلئ من اليمين
export function Stars({ value, size = 16, color = COLORS.star, empty = COLORS.line }) {
  const v = Math.max(0, Math.min(5, num(value)));
  return (
    <View style={{ flexDirection: 'row-reverse', gap: 2 }} accessibilityLabel={`${v.toFixed(1)} من ٥ نجوم`}>
      {[1, 2, 3, 4, 5].map(i => {
        const name = v >= i ? 'star' : v >= i - 0.5 ? 'star-half' : 'star';
        const c = v >= i - 0.5 ? color : empty;
        // نصف النجمة في Ionicons يملأ اليسار — نعكسها لتمتلئ من اليمين
        const flip = name === 'star-half' ? { transform: [{ scaleX: -1 }] } : null;
        return <Ionicons key={i} name={name} size={size} color={c} style={flip} />;
      })}
    </View>
  );
}

export default function ReviewsScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState([]);
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [serverDist, setServerDist] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get('/reviews/driver/me');
      const data = Array.isArray(d?.data) ? d.data : [];
      const dist = normDist(d?.distribution);
      setList(data); setAvg(num(d?.avg_rating)); setCount(parseInt(d?.count, 10) || data.length); setServerDist(dist);
      setError(false);
      writeCache('driver_reviews', { data, avg: num(d?.avg_rating), count: parseInt(d?.count, 10) || data.length, dist });
    } catch { setError(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await readCache('driver_reviews');
      if (cached) { setList(cached.data || []); setAvg(num(cached.avg)); setCount(cached.count || 0); setServerDist(cached.dist || null); setLoading(false); }
      load();
    })();
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // D-26: توزيع التقييمات — من السيرفر (كل التقييمات) أو من آخر ما حُمّل مع توضيح ذلك
  const dist = useMemo(() => {
    if (serverDist) return serverDist;
    const d = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    list.forEach(r => { const s = Math.round(num(r.driver_rating)); if (s >= 1 && s <= 5) d[s] += 1; });
    return d;
  }, [list, serverDist]);
  const partialDist = !serverDist && count > list.length && list.length > 0;
  const distMax = Math.max(1, ...Object.values(dist));

  const header = (
    <PopIn>
      <LinearGradient colors={GRADIENTS.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
        <View style={styles.orb} />
        <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
        <View style={styles.summaryTop}>
          <View style={{ alignItems: 'center', minWidth: 110 }}>
            {loading && !avg ? <Skeleton width={80} height={48} tone="dark" radius={12} />
              : <CountUp value={avg} format={(n) => (avg > 0 ? n.toFixed(1) : '—')} style={styles.avg} />}
            <Stars value={avg} size={17} color="#FFF" empty="rgba(255,255,255,0.4)" />
            <Text style={styles.count}>{count > 0 ? arCount(count, 'review') : 'لا تقييمات'}</Text>
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            {[5, 4, 3, 2, 1].map((s, i) => (
              <View key={s} style={[RTL.row, { gap: 6 }]}>
                <Text style={styles.distLabel}>{s}</Text>
                <Ionicons name="star" size={10} color="#FFF" />
                <View style={{ flex: 1 }}>
                  <AnimatedBar pct={dist[s] / distMax} color="#FFF" track="rgba(255,255,255,0.3)" height={6} delay={i * 60} />
                </View>
              </View>
            ))}
            {partialDist && <Text style={styles.distNote}>التوزيع حسب آخر {arCount(list.length, 'review')}</Text>}
          </View>
        </View>
      </LinearGradient>
    </PopIn>
  );

  return (
    <View style={styles.container}>
      <GradientHeader title="تقييماتي" subtitle="آراء الزبائن في خدمتك" />
      <FlatList
        data={loading ? [] : list}
        keyExtractor={(r, i) => String(r.id ?? i)}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} tintColor={COLORS.primary} />}
        ListEmptyComponent={loading ? (
          <View style={{ gap: 10 }}>{[0, 1, 2].map(i => <SkeletonCard key={i} lines={3} />)}</View>
        ) : error ? (
          <EmptyState icon="cloud-offline-outline" tone="red" title="تعذّر تحميل التقييمات" text="تحقّق من الاتصال ثم أعد المحاولة" actionLabel="إعادة المحاولة" actionIcon="refresh" onAction={() => { setLoading(true); load(); }} />
        ) : (
          <EmptyState icon="star-outline" tone="gold" title="لا توجد تقييمات بعد" text="بعد كل توصيلة يمكن للزبون تقييم خدمتك — ستظهر التقييمات هنا" />
        )}
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, 8) * 45}>
            <View style={[styles.card, SHADOW.soft]}>
              <View style={[RTL.row, { gap: 10 }]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{(item.customer_name || 'ز')[0]}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, RTL.text]} numberOfLines={1}>{item.customer_name || 'زبون'}</Text>
                  <Text style={[styles.rest, RTL.text]} numberOfLines={1}>
                    {[item.restaurant_name || (item.order_type === 'personal' ? 'طلب توصيل' : null), fmtDate(item.created_at, false)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <View style={styles.ratePill}>
                  <Ionicons name="star" size={12} color={COLORS.star} />
                  <Text style={styles.rateText}>{Math.max(0, Math.min(5, Math.round(num(item.driver_rating))))}</Text>
                </View>
              </View>
              <View style={{ marginTop: 10, alignItems: 'flex-end' }}><Stars value={Math.round(num(item.driver_rating))} size={15} /></View>
              {!!item.comment && (
                <View style={styles.comment}>
                  <Ionicons name="chatbubble-ellipses-outline" size={14} color={COLORS.gray} style={{ marginTop: 3 }} />
                  <Text style={[styles.commentText, RTL.text]}>{item.comment}</Text>
                </View>
              )}
            </View>
          </FadeIn>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  summary: { borderRadius: RADIUS.lg, padding: 18, marginBottom: 16, overflow: 'hidden', backgroundColor: COLORS.amber, ...SHADOW.card },
  orb: { position: 'absolute', top: -50, left: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.14)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 70 },
  summaryTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 16 },
  avg: { color: '#FFF', fontSize: 48, fontWeight: '900', lineHeight: 56, textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  count: { color: '#FFF', fontSize: 12.5, marginTop: 6, fontWeight: '700' },
  distLabel: { color: '#FFF', fontSize: 12, fontWeight: '800', width: 10, textAlign: 'center' },
  distNote: { color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontWeight: '700', textAlign: 'right', marginTop: 2 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md + 2, padding: 14, marginBottom: 10 },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.sec, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  name: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  rest: { fontSize: 12, color: COLORS.gray, marginTop: 2, fontWeight: '500' },
  ratePill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: COLORS.amberSoft, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3 },
  rateText: { fontSize: 13, fontWeight: '900', color: COLORS.amberDeep },
  comment: { flexDirection: 'row-reverse', gap: 8, marginTop: 10, backgroundColor: COLORS.inputBg, borderRadius: RADIUS.sm, padding: 12 },
  commentText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 21 },
});
