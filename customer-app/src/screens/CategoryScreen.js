import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { readCache } from '../utils/cache';
import { HeroCardSkeleton } from '../components/Skeleton';
import RestaurantCard from '../components/RestaurantCard';
import GradientHeader from '../components/GradientHeader';
import { FadeIn } from '../components/Anim';
import { Ionicons } from '@expo/vector-icons';
import { stagger } from '../utils/motion';
import EmptyState from '../components/EmptyState';
import { useTheme } from '../context/ThemeContext';

// مطابقة احتياطية بالاسم مع أقسام المنيو (للسيرفر/البيانات اللي ما فيها category_id)
const fuzzy = (all, cn) => (all || []).filter(r => (r.menu_cats || []).some(mc => mc && cn && (mc.includes(cn) || cn.includes(mc))));
const byId = (all, id) => (all || []).filter(r => id != null && String(r.category_id) === String(id));
// الأولوية لتطابق التصنيف الدقيق؛ المطابقة بالاسم فقط لو ما في نتائج دقيقة
const pick = (exact, loose) => (exact.length ? exact : loose);

export default function CategoryScreen({ route, navigation }) {
  const { categoryId, categoryName } = route.params || {};
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    const cn = categoryName || '';
    try {
      // 1) فلتر السيرفر الدقيق بالتصنيف
      let exact = [];
      if (categoryId != null) {
        try { const d = await api.get(`/restaurants?limit=100&category_id=${encodeURIComponent(categoryId)}`); exact = byId(d.data || [], categoryId); } catch {}
      }
      // 2) احتياط: سيرفر قديم أو تصنيف بدون مطاعم مربوطة → مطابقة بأقسام المنيو
      let res = exact;
      if (!res.length) { const all = await api.get('/restaurants?limit=100'); res = pick(byId(all.data || [], categoryId), fuzzy(all.data || [], cn)); }
      setList(res);
      setFailed(false);
    } catch { setFailed(true); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => {
    (async () => {
      const cached = await readCache('home');
      if (cached?.restaurants?.length) {
        setList(pick(byId(cached.restaurants, categoryId), fuzzy(cached.restaurants, categoryName || '')));
        setLoading(false);
      }
      load();
    })();
  }, [categoryId, categoryName]);

  const sorted = [...list].sort((a, b) => (b.is_open ? 1 : 0) - (a.is_open ? 1 : 0));
  const openCount = sorted.filter(r => r.is_open).length;

  return (
    <View style={styles.container}>
      <GradientHeader title={categoryName || 'المطاعم'} subtitle={!loading && list.length ? `${list.length} مطعم` : undefined} />

      {loading ? (
        <View style={{ padding: 16 }}>{[0, 1, 2].map(i => <HeroCardSkeleton key={i} />)}</View>
      ) : sorted.length === 0 ? (
        failed
          ? <EmptyState emoji="📡" title="تعذّر التحميل" subtitle="تأكد من الإنترنت وحاول مرة ثانية" ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); load(); }} />
          : <EmptyState emoji="🍽️" title="ما في مطاعم هون" subtitle={`لا توجد مطاعم في «${categoryName || ''}» حالياً`} ctaLabel="تصفّح كل المطاعم" onCta={() => navigation.navigate('Main', { screen: 'الرئيسية' })} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={r => String(r.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.card} />}
          renderItem={({ item, index }) => (
            <FadeIn delay={stagger(index)} from={20}>
              <RestaurantCard restaurant={item} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} />
            </FadeIn>
          )}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={(
            <FadeIn from={8} style={styles.summary}>
              <View style={[styles.sumChip, { backgroundColor: COLORS.successBg }]}>
                <Ionicons name="radio-button-on" size={11} color={COLORS.green} />
                <Text style={[styles.sumTxt, { color: COLORS.successText }]}>{openCount} مفتوح الآن</Text>
              </View>
              <View style={[styles.sumChip, { backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1 }]}>
                <Ionicons name="restaurant-outline" size={12} color={COLORS.primary} />
                <Text style={[styles.sumTxt, { color: COLORS.sub }]}>{sorted.length} مطعم</Text>
              </View>
            </FadeIn>
          )}
        />
      )}
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  summary: { flexDirection: 'row-reverse', gap: 8, marginBottom: 14 },
  sumChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  sumTxt: { fontSize: 12.5, fontWeight: '800' },
});
