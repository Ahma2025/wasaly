import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { FadeIn } from '../components/Anim';
import EmptyState from '../components/EmptyState';

const POPULAR = ['برجر', 'بيتزا', 'شاورما', 'سوشي', 'دجاج', 'فلافل', 'مشاوي', 'حلويات'];

export default function SearchScreen() {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
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

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const onChangeText = (text) => {
    setQuery(text);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(text), 400);
  };

  const RestaurantItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} activeOpacity={0.85}>
      {item.logo || item.cover_image
        ? <Image source={{ uri: item.logo || item.cover_image }} style={styles.logo} />
        : <View style={styles.logo}><Text style={{ fontSize: 28 }}>🏪</Text></View>}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.name_ar || item.name}</Text>
        <Text style={styles.cardSub}>{item.delivery_time_min}-{item.delivery_time_max} دقيقة</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.rating}>⭐ {parseFloat(item.rating || 0).toFixed(1)}</Text>
          <Text style={styles.fee}>🛵 {item.delivery_fee ?? 0}₪</Text>
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
      <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text style={styles.headerTitle}>وش نفسك تاكل؟ 🍴</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.primary} />
          <TextInput style={styles.input} placeholder="ابحث عن مطعم أو طعام..." placeholderTextColor={COLORS.gray} value={query} onChangeText={onChangeText} autoFocus returnKeyType="search" />
          {query ? <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}><Ionicons name="close-circle" size={18} color={COLORS.gray} /></TouchableOpacity> : null}
        </View>
      </LinearGradient>

      {loading && <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />}

      {!query && !results && (
        <View style={styles.popularSection}>
          <Text style={styles.sectionTitle}>عمليات بحث شائعة</Text>
          <View style={styles.tagsWrap}>
            {POPULAR.map((p, i) => (
              <FadeIn key={p} delay={i * 40} from={8}>
                <TouchableOpacity style={styles.tag} onPress={() => { setQuery(p); search(p); }} activeOpacity={0.7}>
                  <Text style={styles.tagText}>{p}</Text>
                </TouchableOpacity>
              </FadeIn>
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
          ListEmptyComponent={<View style={{ paddingTop: 40 }}><EmptyState emoji="🔍" title="ما في نتائج" subtitle={`ما لقينا شي لـ "${query}" — جرّب كلمة ثانية`} /></View>}
        />
      )}
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, ...COLORS.shadow.float },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, ...COLORS.shadow.soft },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  popularSection: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginVertical: 12 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.sec, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.tint },
  tagText: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  card: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.card, borderRadius: 18, padding: 12, marginBottom: 12, ...COLORS.shadow.soft },
  logo: { width: 56, height: 56, borderRadius: 14, backgroundColor: COLORS.tint, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: 10, marginTop: 6 },
  rating: { fontSize: 12, fontWeight: '700', color: '#FF9500' },
  fee: { fontSize: 12, color: COLORS.gray },
  itemCard: { flexDirection: 'row', gap: 12, backgroundColor: COLORS.card, borderRadius: 16, padding: 12, marginBottom: 8, elevation: 1 },
  itemEmoji: { width: 48, height: 48, borderRadius: 12, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  itemPrice: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 16, color: COLORS.gray },
});
