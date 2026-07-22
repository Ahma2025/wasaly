import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import RestaurantCard from '../components/RestaurantCard';
import { useTheme } from '../context/ThemeContext';

export default function CategoryScreen({ route, navigation }) {
  const { categoryId, categoryName } = route.params || {};
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/restaurants?limit=100')
      .then(d => {
        const all = d.data || [];
        setList(all.filter(r => String(r.category_id) === String(categoryId)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [categoryId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{categoryName || 'المطاعم'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 52 }}>🍽️</Text>
          <Text style={styles.empty}>لا توجد مطاعم في «{categoryName}» حالياً</Text>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={r => String(r.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          ListHeaderComponent={<Text style={styles.count}>{list.length} مطعم</Text>}
          renderItem={({ item }) => (
            <RestaurantCard restaurant={item} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} />
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
