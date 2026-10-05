import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, Image, Keyboard, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { FadeIn, Press } from '../components/Anim';
import { Chip } from '../components/UI';
import EmptyState from '../components/EmptyState';
import { CardRowSkeleton } from '../components/Skeleton';
import { useHeaderTop, HeroDecor } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';
import { haptic, stagger, isReducedMotion } from '../utils/motion';

const POPULAR = [
  { t: 'برجر', e: '🍔' }, { t: 'بيتزا', e: '🍕' }, { t: 'شاورما', e: '🌯' }, { t: 'سوشي', e: '🍣' },
  { t: 'دجاج', e: '🍗' }, { t: 'فلافل', e: '🧆' }, { t: 'مشاوي', e: '🔥' }, { t: 'حلويات', e: '🍰' },
];
const RECENT_KEY = 'recent_searches';

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
  const [recent, setRecent] = useState([]);
  const [focused, setFocused] = useState(false);
  const navigation = useNavigation();
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const seqRef = useRef(0);
  const focusV = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(v => { try { const a = JSON.parse(v || '[]'); if (Array.isArray(a)) setRecent(a.slice(0, 8)); } catch {} }).catch(() => {});
  }, []);
  useEffect(() => {
    Animated.timing(focusV, { toValue: focused ? 1 : 0, duration: isReducedMotion() ? 0 : 200, useNativeDriver: false }).start();
  }, [focused]);

  // حفظ عمليات البحث الأخيرة (محلياً فقط)
  const remember = (text) => {
    const t = (text || '').trim();
    if (t.length < 2) return;
    setRecent(prev => {
      const next = [t, ...prev.filter(x => x !== t)].slice(0, 8);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const clearRecent = () => { haptic.light(); setRecent([]); AsyncStorage.removeItem(RECENT_KEY).catch(() => {}); };

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
      const res = data.data || { restaurants: [], items: [] };
      setResults(res);
      if ((res.restaurants?.length || 0) + (res.items?.length || 0) > 0) remember(text);
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

  const clear = () => { haptic.light(); clearTimeout(timerRef.current); abortRef.current?.abort?.(); seqRef.current++; setQuery(''); setResults(null); setLoading(false); setError(''); };
  const runQuick = (p) => { haptic.select(); setQuery(p); search(p); Keyboard.dismiss(); };

  const renderRestaurant = (item, index) => (
    <FadeIn delay={stagger(index, 40)} from={14}>
      <Press style={styles.card} scaleTo={0.97} haptic={false} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.id })}
        accessibilityRole="button" accessibilityLabel={item.name_ar || item.name}>
        <View>
          {item.logo || item.cover_image
            ? <Image source={{ uri: item.logo || item.cover_image }} style={styles.logo} />
            : <LinearGradient colors={COLORS.gradients.sunset} style={styles.logo}><Ionicons name="restaurant" size={24} color="#FFF" /></LinearGradient>}
          {item.is_open !== false && <View style={[styles.openDot, { borderColor: COLORS.card }]} />}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name_ar || item.name}</Text>
          <View style={styles.cardMeta}>
            <View style={styles.metaChip}><Ionicons name="star" size={11} color="#FFB020" /><Text style={styles.metaTxt}>{(Number(item.rating) || 0).toFixed(1)}</Text></View>
            <View style={styles.metaChip}><Ionicons name="time-outline" size={11} color={COLORS.primary} /><Text style={styles.metaTxt}>{item.delivery_time_min || 20}-{item.delivery_time_max || 45} د</Text></View>
            {item.is_open === false && <View style={[styles.metaChip, { backgroundColor: COLORS.dangerBg }]}><Text style={[styles.metaTxt, { color: COLORS.red }]}>مغلق</Text></View>}
          </View>
          <Text style={styles.fee}>التوصيل حسب المسافة</Text>
        </View>
        <View style={styles.chev}><Ionicons name="chevron-back" size={16} color={COLORS.primary} /></View>
      </Press>
    </FadeIn>
  );

  const renderItem = (item, index) => {
    const pr = itemPrice(item);
    return (
      <FadeIn delay={stagger(index, 40)} from={14}>
        <Press style={styles.itemCard} scaleTo={0.97} haptic={false} onPress={() => navigation.navigate('Restaurant', { restaurantId: item.restaurant_id })}
          accessibilityRole="button" accessibilityLabel={`${item.name_ar || item.name} من ${item.restaurant_name || ''}`}>
          {item.image
            ? <Image source={{ uri: item.image }} style={styles.itemImg} />
            : <View style={styles.itemImg}><Ionicons name="fast-food-outline" size={24} color={COLORS.primary} /></View>}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name_ar || item.name}</Text>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <Ionicons name="storefront-outline" size={11} color={COLORS.faint} />
              <Text style={styles.cardSub} numberOfLines={1}>{item.restaurant_name}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.itemPrice}>{pr.now.toFixed(2)}₪</Text>
              {pr.old != null && <Text style={styles.itemOld}>{pr.old.toFixed(2)}₪</Text>}
            </View>
          </View>
          <View style={styles.chev}><Ionicons name="chevron-back" size={16} color={COLORS.primary} /></View>
        </Press>
      </FadeIn>
    );
  };

  let rIdx = 0, iIdx = 0;
  const data = results ? [
    ...(results.restaurants?.length ? [{ type: 'header', key: 'h-r', title: 'مطاعم', count: results.restaurants.length, icon: 'restaurant' }] : []),
    ...(results.restaurants || []).map(r => ({ type: 'restaurant', key: `r-${r.id}`, _i: rIdx++, ...r })),
    ...(results.items?.length ? [{ type: 'header', key: 'h-i', title: 'أصناف', count: results.items.length, icon: 'fast-food' }] : []),
    ...(results.items || []).map((i, idx) => ({ type: 'item', key: `i-${i.id ?? idx}-${i.restaurant_id ?? ''}`, _i: iIdx++, ...i })),
  ] : [];

  const boxBorder = focusV.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)'] });

  return (
    <View style={styles.container}>
      <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: headerTop }]}>
        <HeroDecor />
        <FadeIn from={8}>
          <Text style={styles.headerTitle}>شو نفسك تاكل؟</Text>
          <Text style={styles.headerSub}>ابحث بين المطاعم والأصناف بلحظة</Text>
        </FadeIn>
        <Animated.View style={[styles.searchBox, { borderColor: boxBorder }]}>
          <View style={styles.searchIcon}><Ionicons name="search" size={18} color={COLORS.primary} /></View>
          <TextInput style={styles.input} placeholder="ابحث عن مطعم أو طعام..." placeholderTextColor={COLORS.faint}
            value={query} onChangeText={onChangeText} returnKeyType="search" textAlign="right"
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onSubmitEditing={() => { clearTimeout(timerRef.current); search(query); }} accessibilityLabel="بحث" />
          {loading ? <View style={styles.spinDot}><Ionicons name="ellipsis-horizontal" size={18} color={COLORS.primary} /></View> : null}
          {query ? (
            <TouchableOpacity onPress={clear} accessibilityLabel="مسح البحث" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={20} color={COLORS.faint} />
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      </LinearGradient>

      {loading && !results && (
        <View style={{ padding: 16 }}>{[0, 1, 2, 3].map(i => <CardRowSkeleton key={i} />)}</View>
      )}

      {!query && !results && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: tabInset + 20 }} keyboardShouldPersistTaps="handled">
          {recent.length > 0 && (
            <FadeIn from={10}>
              <View style={styles.secRow}>
                <View style={styles.secTitleRow}>
                  <Ionicons name="time-outline" size={17} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>عمليات بحثك الأخيرة</Text>
                </View>
                <TouchableOpacity onPress={clearRecent} accessibilityRole="button" accessibilityLabel="مسح السجل" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.clearTxt}>مسح</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tagsWrap}>
                {recent.map(r => <Chip key={r} size="sm" icon="refresh" label={r} onPress={() => runQuick(r)} />)}
              </View>
            </FadeIn>
          )}

          <View style={[styles.secRow, { marginTop: recent.length ? 22 : 4 }]}>
            <View style={styles.secTitleRow}>
              <Ionicons name="trending-up" size={17} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>عمليات بحث شائعة</Text>
            </View>
          </View>
          <View style={styles.popGrid}>
            {POPULAR.map((p, i) => (
              <FadeIn key={p.t} delay={stagger(i, 40)} from={12} style={styles.popCell}>
                <Press style={styles.popCard} scaleTo={0.94} onPress={() => runQuick(p.t)} accessibilityRole="button" accessibilityLabel={`بحث عن ${p.t}`}>
                  <View style={styles.popEmoji}><Text style={{ fontSize: 24 }}>{p.e}</Text></View>
                  <Text style={styles.popTxt}>{p.t}</Text>
                </Press>
              </FadeIn>
            ))}
          </View>
        </ScrollView>
      )}

      {!!error && !loading && (
        <View style={{ paddingTop: 20, flex: 1 }}><EmptyState emoji="📡" title="تعذّر البحث" subtitle={error} ctaLabel="حاول مرة ثانية" onCta={() => search(query)} /></View>
      )}

      {results && !error && (
        <FlatList
          data={data}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => {
            if (item.type === 'header') return (
              <FadeIn from={6} style={styles.resHead}>
                <View style={styles.resHeadIcon}><Ionicons name={item.icon} size={13} color="#FFF" /></View>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <View style={styles.resCount}><Text style={styles.resCountTxt}>{item.count}</Text></View>
              </FadeIn>
            );
            if (item.type === 'restaurant') return renderRestaurant(item, item._i);
            if (item.type === 'item') return renderItem(item, item._i);
            return null;
          }}
          contentContainerStyle={{ padding: 16, paddingBottom: tabInset + 20, opacity: loading ? 0.6 : 1 }}
          ListEmptyComponent={!loading ? <View style={{ paddingTop: 20 }}><EmptyState emoji="🔍" title="ما في نتائج" subtitle={`ما لقينا شي لـ "${query}" — جرّب كلمة ثانية`} /></View> : null}
        />
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFF', textAlign: 'right' },
  headerSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.9)', textAlign: 'right', marginTop: 2, marginBottom: 14 },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 8, minHeight: 56, borderWidth: 2, ...C.shadow.card },
  searchIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  spinDot: { paddingHorizontal: 2 },
  input: { flex: 1, fontSize: 15.5, color: C.text, paddingVertical: 8, fontWeight: '500' },
  secRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  secTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: C.text, textAlign: 'right' },
  clearTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  tagsWrap: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  popGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', marginHorizontal: -5 },
  popCell: { width: '25%', padding: 5 },
  popCard: { alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 20, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  popEmoji: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  popTxt: { fontSize: 12.5, fontWeight: '800', color: C.text },
  resHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 12 },
  resHeadIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  resCount: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  resCountTxt: { color: C.primary, fontWeight: '800', fontSize: 12 },
  card: { flexDirection: 'row-reverse', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 12, marginBottom: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  logo: { width: 62, height: 62, borderRadius: 18, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  openDot: { position: 'absolute', bottom: -2, left: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: C.green, borderWidth: 2.5 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  cardSub: { fontSize: 12, color: C.gray, textAlign: 'right', fontWeight: '500' },
  cardMeta: { flexDirection: 'row-reverse', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: C.inputBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  metaTxt: { fontSize: 11.5, fontWeight: '800', color: C.sub },
  fee: { fontSize: 11.5, color: C.faint, marginTop: 5, textAlign: 'right', fontWeight: '500' },
  chev: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  itemCard: { flexDirection: 'row-reverse', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 10, marginBottom: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.soft },
  itemImg: { width: 60, height: 60, borderRadius: 16, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 4 },
  itemPrice: { fontSize: 15, fontWeight: '900', color: C.primary },
  itemOld: { fontSize: 12, color: C.faint, textDecorationLine: 'line-through' },
});
