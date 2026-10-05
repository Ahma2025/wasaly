import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, Image, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { FadeIn } from '../components/Anim';
import EmptyState from '../components/EmptyState';
import { CardRowSkeleton } from '../components/Skeleton';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';

const POPULAR = ['برجر', 'بيتزا', 'شاورما', 'سوشي', 'دجاج', 'فلافل', 'مشاوي', 'حلويات'];

const itemPrice = (it) => {
  const p = parseFloat(it.price) || 0;
  const d = parseFloat(it.discount_price) || 0;
  return d > 0 && d < p ? { now: d, old: p } : { now: p, old: null };
};

export default function SearchScreen() {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const headerTop = useHeaderTop(12);
  const tabInset = useTabBarInset();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const seqRef = useRef(0);

  // إلغاء الطلب القديم حتى ما تكتب نتيجة قديمة فوق نتيجة أحدث
  const search = async (q) => {
    const text = q.trim();
    abortRef.current?.abort?.();
    if (!text) { setResults(null); setLoading(false); setError(''); return; }
    const seq = ++seqRef.current;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    abortRef.current = ctrl;
    setLoading(true); setError('');
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(text)}`, ctrl ? { signal: ctrl.signal } : undefined);
      if (seq !== seqRef.current) return;
      setResults(data.data || { restaurants: [], items: [] });
    } catch (e) {
      if (e?.canceled || seq !== seqRef.current) return;
      setError(e?.message === 'Network error' ? 'تعذّر الاتصال — تأكد من الإنترنت' : 'تعذّر البحث، حاول مرة ثانية');
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  useEffect(() => () => { clearTimeout(timerRef.current); abortRef.current?.abort?.(); }, []);

  const onChangeText = (text) => {
    setQuery(text);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(text), 400);
  };

  const clear = () => { clearTimeout(timerRef.current); abortRef.current?.abort?.(); seqRef.current++; setQuery(''); setResults(null); setLoading(false); setError(''); };

  const renderRestaurant = (item) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={item.name_ar || item.name}>
      {item.logo || item.cover_image
        ? <Image source={{ uri: item.logo || item.cover_image }} style={styles.logo} />
        : <View style={styles.logo}><Text style={{ fontSize: 28 }}>🏪</Text></View>}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name_ar || item.name}</Text>
        <Text style={styles.cardSub}>{item.delivery_time_min || 20}-{item.delivery_time_max || 45} دقيقة{item.is_open === false ? ' · مغلق' : ''}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.rating}>⭐ {(Number(item.rating) || 0).toFixed(1)}</Text>
          <Text style={styles.fee}>🛵 التوصيل حسب المسافة</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderItem = (item) => {
    const pr = itemPrice(item);
    return (
      <TouchableOpacity style={styles.itemCard} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.restaurant_id })}
        accessibilityRole="button" accessibilityLabel={`${item.name_ar || item.name} من ${item.restaurant_name || ''}`}>
        {item.image
          ? <Image source={{ uri: item.image }} style={styles.itemImg} />
          : <View style={styles.itemImg}><Text style={{ fontSize: 24 }}>🍽️</Text></View>}
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name_ar || item.name}</Text>
          <Text style={styles.cardSub} numberOfLines={1}>{item.restaurant_name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.itemPrice}>{pr.now.toFixed(2)}₪</Text>
            {pr.old != null && <Text style={styles.itemOld}>{pr.old.toFixed(2)}₪</Text>}
          </View>
        </View>
        <Ionicons name="chevron-back" size={16} color={COLORS.faint} />
      </TouchableOpacity>
    );
  };

  const data = results ? [
    ...(results.restaurants?.length ? [{ type: 'header', key: 'h-r', title: `مطاعم (${results.restaurants.length})` }] : []),
    ...(results.restaurants || []).map(r => ({ type: 'restaurant', key: `r-${r.id}`, ...r })),
    ...(results.items?.length ? [{ type: 'header', key: 'h-i', title: `أصناف (${results.items.length})` }] : []),
    ...(results.items || []).map((i, idx) => ({ type: 'item', key: `i-${i.id ?? idx}-${i.restaurant_id ?? ''}`, ...i })),
  ] : [];

  return (
    <View style={styles.container}>
      <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>شو نفسك تاكل؟ 🍴</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={COLORS.primary} />
          <TextInput style={styles.input} placeholder="ابحث عن مطعم أو طعام..." placeholderTextColor={COLORS.faint}
            value={query} onChangeText={onChangeText} returnKeyType="search" textAlign="right"
            onSubmitEditing={() => { clearTimeout(timerRef.current); search(query); }} accessibilityLabel="بحث" />
          {query ? <TouchableOpacity onPress={clear} accessibilityLabel="مسح البحث"><Ionicons name="close-circle" size={18} color={COLORS.gray} /></TouchableOpacity> : null}
        </View>
      </LinearGradient>

      {loading && !results && (
        <View style={{ padding: 8 }}>{[0, 1, 2, 3].map(i => <CardRowSkeleton key={i} />)}</View>
      )}

      {!query && !results && (
        <View style={styles.popularSection}>
          <Text style={styles.sectionTitle}>عمليات بحث شائعة</Text>
          <View style={styles.tagsWrap}>
            {POPULAR.map((p, i) => (
              <FadeIn key={p} delay={i * 40} from={8}>
                <TouchableOpacity style={styles.tag} onPress={() => { setQuery(p); search(p); Keyboard.dismiss(); }} activeOpacity={0.7}>
                  <Text style={styles.tagText}>{p}</Text>
                </TouchableOpacity>
              </FadeIn>
            ))}
          </View>
        </View>
      )}

      {!!error && !loading && (
        <View style={{ paddingTop: 30 }}><EmptyState emoji="📡" title="تعذّر البحث" subtitle={error} ctaLabel="حاول مرة ثانية" onCta={() => search(query)} /></View>
      )}

      {results && !error && (
        <FlatList
          data={data}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            if (item.type === 'header') return <Text style={styles.sectionTitle}>{item.title}</Text>;
            if (item.type === 'restaurant') return renderRestaurant(item);
            if (item.type === 'item') return renderItem(item);
            return null;
          }}
          contentContainerStyle={{ padding: 16, paddingBottom: tabInset + 20, opacity: loading ? 0.6 : 1 }}
          ListEmptyComponent={!loading ? <View style={{ paddingTop: 40 }}><EmptyState emoji="🔍" title="ما في نتائج" subtitle={`ما لقينا شي لـ "${query}" — جرّب كلمة ثانية`} /></View> : null}
        />
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, ...C.shadow.float },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF', marginBottom: 12, textAlign: 'right' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 4, minHeight: 48, ...C.shadow.soft },
  input: { flex: 1, fontSize: 15, color: C.text, paddingVertical: 8 },
  popularSection: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginVertical: 12, textAlign: 'right' },
  tagsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: C.sec, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 9, borderWidth: 1, borderColor: C.tint },
  tagText: { fontSize: 13, color: C.primary, fontWeight: '700' },
  card: { flexDirection: 'row-reverse', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 12, marginBottom: 12, alignItems: 'center', ...C.shadow.soft },
  logo: { width: 56, height: 56, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '800', color: C.text, textAlign: 'right' },
  cardSub: { fontSize: 12, color: C.gray, marginTop: 2, textAlign: 'right' },
  cardMeta: { flexDirection: 'row-reverse', gap: 10, marginTop: 6 },
  rating: { fontSize: 12, fontWeight: '700', color: '#FF9500' },
  fee: { fontSize: 12, color: C.gray },
  itemCard: { flexDirection: 'row-reverse', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 8, alignItems: 'center', ...C.shadow.soft },
  itemImg: { width: 52, height: 52, borderRadius: 12, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 4 },
  itemPrice: { fontSize: 14, fontWeight: '800', color: C.primary },
  itemOld: { fontSize: 12, color: C.faint, textDecorationLine: 'line-through' },
});
