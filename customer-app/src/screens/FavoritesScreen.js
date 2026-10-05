import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import { CardRowSkeleton } from '../components/Skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../components/Anim';
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

  const fetchFavs = async () => {
    try {
      const data = await api.get('/users/favorites');
      const list = data.data || data || [];
      setFavs(list);
      writeCache('favorites', list);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => {
    (async () => {
      const cached = await readCache('favorites');
      if (cached) { setFavs(cached); setLoading(false); }
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
      <GradientHeader title="مطاعمي المفضلة ❤️" />
      <View style={{ padding: 8 }}>{[0,1,2,3,4].map(i => <CardRowSkeleton key={i} />)}</View>
    </View>
  );

  return (
    <View style={styles.container}>
      <GradientHeader title="مطاعمي المفضلة ❤️" />

      {favs.length === 0 ? (
        <EmptyState
          emoji="💔"
          title="ما في مفضّلة بعد"
          subtitle="اضغط ❤️ على أي مطعم بتحبه ليظهر هون"
          ctaLabel="تصفّح المطاعم"
          onCta={() => navigation.navigate('Main', { screen: 'الرئيسية' })}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFavs(); }} tintColor={COLORS.primary} />}>
          {favs.map((r, i) => (
            <FadeIn key={r.id} delay={Math.min(i, 8) * 55}>
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={r.name_ar}>
              {(r.logo || r.cover_image) ? <Image source={{ uri: r.logo || r.cover_image }} style={styles.logo} /> : <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 26 }}>🍽️</Text></View>}
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.name} numberOfLines={1}>{r.name_ar}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="star" size={12} color="#FFB800" />
                  <Text style={styles.meta}>{(Number(r.rating) || 0).toFixed(1)}</Text>
                  <Text style={styles.sep}>·</Text>
                  <Text style={styles.meta}>{r.delivery_time_min || 20}-{r.delivery_time_max || 45} د</Text>
                  {!r.is_open && <Text style={[styles.meta, { color: COLORS.red }]}> · مغلق</Text>}
                </View>
              </View>
              <TouchableOpacity onPress={() => removeFav(r.id)} style={{ padding: 6 }} accessibilityLabel={`إزالة ${r.name_ar} من المفضلة`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="heart" size={22} color="#FF3B30" />
              </TouchableOpacity>
            </TouchableOpacity>
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
  card: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 20, padding: 12, marginBottom: 12, ...COLORS.shadow.soft },
  logo: { width: 62, height: 62, borderRadius: 16, backgroundColor: COLORS.inputBg },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, textAlign: 'right' },
  metaRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  sep: { color: COLORS.gray },
});
