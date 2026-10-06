import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api, { isNetworkError, NETWORK_MESSAGE } from '../utils/api';
import { plural } from '../utils/plural';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import { CardRowSkeleton } from '../components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn, Press } from '../components/Anim';
import { haptic } from '../utils/motion';
import GradientHeader from '../components/GradientHeader';
import EmptyState from '../components/EmptyState';

export default function FavoritesScreen() {
  const navigation = useNavigation();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const insets = useSafeAreaInsets();
  const [favs, setFavs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fromCache, setFromCache] = useState(false);

  const fetchFavs = async () => {
    try {
      const data = await api.get('/users/favorites');
      const list = data.data || data || [];
      setFavs(Array.isArray(list) ? list : []);
      setLoadError(''); setFromCache(false);
      writeCache('favorites', list);
    } catch (e) {
      setLoadError(isNetworkError(e) ? NETWORK_MESSAGE : (e?.message || 'تعذّر تحميل المفضلة'));
    }
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    (async () => {
      const cached = await readCache('favorites');
      if (cached) { setFavs(cached); setFromCache(true); setLoading(false); }
      fetchFavs();
    })();
  }, []));

  const removeFav = async (id) => {
    const before = favs;
    setFavs(prev => prev.filter(r => r.id !== id));
    try { await api.delete(`/users/favorites/${id}`); writeCache('favorites', before.filter(r => r.id !== id)); }
    catch { setFavs(before); }
  };

  if (loading) return (
    <View style={styles.container}>
      <GradientHeader title="مطاعمي المفضلة" />
      <View style={{ padding: 16 }}>{[0,1,2,3,4].map(i => <CardRowSkeleton key={i} />)}</View>
    </View>
  );

  return (
    <View style={styles.container}>
      <GradientHeader title="مطاعمي المفضلة" subtitle={favs.length ? plural(favs.length, 'restaurant') : undefined} />

      {favs.length === 0 && loadError ? (
        <EmptyState emoji="📡" tone="error" title="تعذّر تحميل المفضلة" subtitle={loadError}
          ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchFavs(); }} />
      ) : favs.length === 0 ? (
        <EmptyState
          emoji="💔"
          title="ما في مفضّلة بعد"
          subtitle="اضغط ❤️ على أي مطعم بتحبه ليظهر هون"
          ctaLabel="تصفّح المطاعم"
          onCta={() => navigation.navigate('Main', { screen: 'الرئيسية' })}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFavs(); }} tintColor={COLORS.primary} colors={[COLORS.primary]} progressBackgroundColor={COLORS.card} />}>
          {!!loadError && fromCache && (
            <View style={styles.stale}><Ionicons name="cloud-offline-outline" size={15} color={COLORS.text} /><Text style={styles.staleTxt}>آخر نسخة محفوظة — {loadError}</Text></View>
          )}
          {favs.map((r, i) => (
            <FadeIn key={r.id} index={i} from={16}>
            <Press style={styles.card} scaleTo={0.97} haptic={false} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} accessible={false}>
              <View style={styles.cardMain} accessible accessibilityRole="button" accessibilityLabel={`${r.name_ar}${r.is_open ? '' : '، مغلق'}`}
                onAccessibilityTap={() => navigation.navigate('Restaurant', { restaurantId: r.id })}
                accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => navigation.navigate('Restaurant', { restaurantId: r.id })}>
              {(r.logo || r.cover_image) ? <Image source={{ uri: r.logo || r.cover_image }} style={styles.logo} /> : <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.tint }]}><Ionicons name="restaurant" size={26} color={COLORS.primary} /></View>}
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.name} numberOfLines={1}>{r.name_ar}</Text>
                <View style={styles.metaRow}>
                  {(Number(r.rating) || 0) > 0 && <Ionicons name="star" size={12} color="#FFB800" />}
                  <Text style={styles.meta}>{(Number(r.rating) || 0) > 0 ? Number(r.rating).toFixed(1) : 'جديد ✨'}</Text>
                  <Text style={styles.sep}>·</Text>
                  <Text style={styles.meta}>{r.delivery_time_min || 20}-{r.delivery_time_max || 45} د</Text>
                  {!r.is_open && <Text style={[styles.meta, { color: COLORS.red }]}> · مغلق</Text>}
                </View>
              </View>
              </View>
              <TouchableOpacity accessibilityRole="button" onPress={() => { haptic.light(); removeFav(r.id); }} style={styles.heartBtn} accessibilityLabel={`إزالة ${r.name_ar} من المفضلة`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="heart" size={20} color={COLORS.red} />
              </TouchableOpacity>
            </Press>
            </FadeIn>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  emptyText: { fontSize: 15, color: COLORS.gray, fontWeight: '600' },
  browseBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 },
  browseText: { color: '#FFF', fontWeight: '800' },
  card: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 22, padding: 12, marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, ...COLORS.shadow.soft },
  cardMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center' },
  stale: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderRadius: 14, padding: 10, marginBottom: 12, backgroundColor: COLORS.warnBg, borderWidth: 1, borderColor: COLORS.warnBorder },
  staleTxt: { flex: 1, fontSize: 12.5, fontWeight: '700', color: COLORS.text, textAlign: 'right' },
  heartBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.dangerBg, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 66, height: 66, borderRadius: 18, backgroundColor: COLORS.inputBg },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  sep: { color: COLORS.gray },
});
