import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { readCache } from '../utils/cache';
import { GridSkeleton } from '../components/Skeleton';
import RestaurantCard from '../components/RestaurantCard';
import GradientHeader from '../components/GradientHeader';
import { FadeIn } from '../components/Anim';
import EmptyState from '../components/EmptyState';
import { useTheme } from '../context/ThemeContext';

export default function CategoryScreen({ route, navigation }) {
  const { categoryId, categoryName } = route.params || {};
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cn = categoryName || '';
    const applyFilter = (all) => setList((all || []).filter(r => (r.menu_cats || []).some(mc => mc && (mc.includes(cn) || cn.includes(mc)))));
    (async () => {
      const cached = await readCache('home'); // نستخدم مطاعم الرئيسية المخزّنة للعرض الفوري
      if (cached?.restaurants?.length) { applyFilter(cached.restaurants); setLoading(false); }
      try { const d = await api.get('/restaurants?limit=100'); applyFilter(d.data || []); } catch {}
      finally { setLoading(false); }
    })();
  }, [categoryId, categoryName]);

  return (
    <View style={styles.container}>
      <GradientHeader title={categoryName || 'المطاعم'} />

      {loading ? (
        <View style={{ paddingTop: 12 }}><GridSkeleton count={6} /></View>
      ) : list.length === 0 ? (
        <EmptyState emoji="🍽️" title="ما في مطاعم هون" subtitle={`لا توجد مطاعم في «${categoryName}» حالياً`} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={r => String(r.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          ListHeaderComponent={<Text style={styles.count}>{list.length} مطعم</Text>}
          renderItem={({ item, index }) => (
            <FadeIn delay={Math.min(index, 8) * 50}>
              <RestaurantCard restaurant={item} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} />
            </FadeIn>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  empty: { fontSize: 15, color: COLORS.gray, fontWeight: '600', textAlign: 'center' },
  count: { fontSize: 13, color: COLORS.gray, fontWeight: '700', marginBottom: 12 },
});
