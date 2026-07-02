import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

const POPULAR = ['برجر', 'بيتزا', 'شاورما', 'سوشي', 'دجاج', 'فلافل', 'مشاوي', 'حلويات'];

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();
  const timerRef = useRef(null);

  const search = async (q) => {
    if (!q.trim()) { setResults(null); return; }
    setLoading(true);
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.data);
    } catch {} finally { setLoading(false); }
  };

  const onChangeText = (text) => {
    setQuery(text);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(text), 400);
  };

  const RestaurantItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })}>
      <View style={styles.logo}><Text style={{ fontSize: 28 }}>🏪</Text></View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.name_ar || item.name}</Text>
        <Text style={styles.cardSub}>{item.delivery_time_min}-{item.delivery_time_max} دقيقة</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.rating}>⭐ {parseFloat(item.rating || 0).toFixed(1)}</Text>
          <Text style={styles.fee}>🛵 {item.delivery_fee}₪</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const ItemResult = ({ item }) => (
    <TouchableOpacity style={styles.itemCard} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.restaurant_id })}>
      <View style={styles.itemEmoji}><Text style={{ fontSize: 24 }}>🍽️</Text></View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.name_ar || item.name}</Text>
        <Text style={styles.cardSub}>{item.restaurant_name}</Text>
        <Text style={styles.itemPrice}>{item.price}₪</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.gray} />
          <TextInput style={styles.input} placeholder="ابحث عن مطعم أو طعام..." value={query} onChangeText={onChangeText} autoFocus returnKeyType="search" />
          {query ? <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}><Ionicons name="close-circle" size={18} color={COLORS.gray} /></TouchableOpacity> : null}
        </View>
      </View>

      {loading && <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />}

      {!query && !results && (
        <View style={styles.popularSection}>
          <Text style={styles.sectionTitle}>عمليات بحث شائعة</Text>
          <View style={styles.tagsWrap}>
            {POPULAR.map(p => (
              <TouchableOpacity key={p} style={styles.tag} onPress={() => { setQuery(p); search(p); }}>
                <Text style={styles.tagText}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {results && !loading && (
        <FlatList
          data={[
            ...(results.restaurants?.length ? [{ type: 'header', key: 'rh', title: `مطاعم (${results.restaurants.length})` }] : []),
            ...(results.restaurants || []).map(r => ({ type: 'restaurant', ...r })),
            ...(results.items?.length ? [{ type: 'header', key: 'ih', title: `أصناف (${results.items.length})` }] : []),
            ...(results.items || []).map(i => ({ type: 'item', ...i })),
          ]}
          keyExtractor={(item, i) => item.id || item.key || String(i)}
          renderItem={({ item }) => {
            if (item.type === 'header') return <Text style={styles.sectionTitle}>{item.title}</Text>;
            if (item.type === 'restaurant') return <RestaurantItem item={item} />;
            if (item.type === 'item') return <ItemResult item={item} />;
            return null;
          }}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>🔍</Text><Text style={styles.emptyText}>لا نتائج لـ "{query}"</Text></View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { backgroundColor: '#FFF', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F2F2F7', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  popularSection: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginVertical: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#E5E5EA' },
  tagText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 10, elevation: 2 },
  logo: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#FFF5EE', alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 10, marginTop: 6 },
  rating: { fontSize: 12, fontWeight: '700', color: '#FF9500' },
  fee: { fontSize: 12, color: COLORS.gray },
  itemCard: { flexDirection: 'row', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 8, elevation: 1 },
  itemEmoji: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#F2F2F7', alignItems: 'center', justifyContent: 'center' },
  itemPrice: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 16, color: COLORS.gray },
});
