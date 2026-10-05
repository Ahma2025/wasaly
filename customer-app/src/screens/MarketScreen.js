import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PopIn } from '../components/Anim';
import EmptyState from '../components/EmptyState';
import { GridSkeleton } from '../components/Skeleton';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';

const { width } = Dimensions.get('window');
const CARD_W = (width - 46) / 2;

const TYPES = [
  { id: 'all',         label: 'الكل',      icon: 'apps',       color: '#FF6B00' },
  { id: 'supermarket', label: 'سوبرماركت', icon: 'cart',       color: '#2E9E44' },
  { id: 'pharmacy',    label: 'صيدلية',    icon: 'medical',    color: '#2F7FE0' },
  { id: 'bakery',      label: 'مخبز',      icon: 'restaurant', color: '#E89A0C' },
  { id: 'grocery',     label: 'بقالة',     icon: 'storefront', color: '#8E44C9' },
];

// تصنيف المتجر: market_type من السيرفر أولاً، ثم تخمين من الاسم
const typeOf = (r) => {
  if (r.market_type) return r.market_type;
  const n = r.name_ar || '';
  if (n.includes('صيدل') || n.includes('دواء')) return 'pharmacy';
  if (n.includes('مخبز') || n.includes('خبز') || n.includes('فرن')) return 'bakery';
  if (n.includes('بقال')) return 'grocery';
  return 'supermarket';
};

function StoreCard({ r, onPress }) {
  const { colors: C } = useTheme();
  const sc = React.useMemo(() => makeSc(C), [C]);
  return (
    <TouchableOpacity style={sc.wrap} onPress={onPress} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel={`${r.name_ar}${r.is_open ? '' : '، مغلق'}`}>
      <View style={sc.imgBox}>
        {(r.cover_image || r.logo)
          ? <Image source={{ uri: r.cover_image || r.logo }} style={sc.img} resizeMode="cover" />
          : <View style={[sc.img, { backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ fontSize: 34 }}>🏪</Text></View>}
        {!r.is_open && <View style={sc.overlay}><Text style={sc.overlayTxt}>مغلق</Text></View>}
        {!!r.logo && (
          <View style={sc.logoCircle}>
            <Image source={{ uri: r.logo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
        )}
      </View>
      <View style={sc.body}>
        <Text style={sc.name} numberOfLines={1}>{r.name_ar}</Text>
        <Text style={sc.addr} numberOfLines={1}>{r.address || r.city || ''}</Text>
        <View style={sc.meta}>
          <Ionicons name="time-outline" size={12} color={C.gray} />
          <Text style={sc.metaTxt}>{r.delivery_time_min || 20}-{r.delivery_time_max || 45} د</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MarketScreen() {
  const navigation = useNavigation();
  const { colors: C } = useTheme();
  const s = React.useMemo(() => makeS(C), [C]);
  const headerTop = useHeaderTop(12);
  const tabInset = useTabBarInset();
  const [stores, setStores] = useState([]);
  const [selected, setSelected] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const cached = await readCache('market');
      if (cached) { setStores(cached); setLoading(false); }
      load();
    })();
  }, []);

  const load = async () => {
    try {
      const r = await api.get('/restaurants?limit=60&store_type=market');
      const list = r.data || [];
      setStores(list);
      setFailed(false);
      writeCache('market', list);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };

  const counts = useMemo(() => {
    const c = { all: stores.length };
    stores.forEach(r => { const t = typeOf(r); c[t] = (c[t] || 0) + 1; });
    return c;
  }, [stores]);

  // لا نعرض متاجر من نوع آخر لو القسم فاضي (كانت الصيدلية تعرض سوبرماركت)
  const displayList = selected === 'all' ? stores : stores.filter(r => typeOf(r) === selected);
  const selectedType = TYPES.find(t => t.id === selected);

  return (
    <View style={s.container}>
      <LinearGradient colors={['#2F7FE0', '#1E5BB8', '#163F87']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: headerTop }]}>
        <LinearGradient colors={C.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={s.sheen} pointerEvents="none" />
        <View style={s.headerInner}>
          <Ionicons name="storefront" size={24} color="#FFF" />
          <Text style={s.headerTitle}>الماركت</Text>
        </View>
        <Text style={s.headerSub}>سوبرماركت · صيدليات · مخابز · بقاليات — كلها بضغطة</Text>
      </LinearGradient>

      <View style={s.typesWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typesRow}>
          {TYPES.map(t => {
            const on = selected === t.id;
            return (
              <TouchableOpacity key={t.id} style={[s.typeBtn, on && { backgroundColor: t.color, borderColor: t.color }]} onPress={() => setSelected(t.id)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Ionicons name={t.icon} size={17} color={on ? '#FFF' : t.color} />
                <Text style={[s.typeLabel, on && { color: '#FFF' }]}>{t.label}</Text>
                {counts[t.id] > 0 && <View style={[s.countPill, on && { backgroundColor: 'rgba(255,255,255,0.3)' }]}><Text style={[s.countTxt, on && { color: '#FFF' }]}>{counts[t.id]}</Text></View>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabInset + 24, paddingTop: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={C.primary} colors={[C.primary]} />}>

        {loading ? (
          <GridSkeleton count={6} />
        ) : displayList.length === 0 ? (
          <View style={{ paddingVertical: 30 }}>
            {failed && stores.length === 0 ? (
              <EmptyState emoji="📡" title="تعذّر تحميل المتاجر" subtitle="تأكد من الإنترنت وحاول مرة ثانية" ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); load(); }} />
            ) : stores.length === 0 ? (
              <EmptyState emoji="🏪" title="ما في متاجر حاليًا" subtitle="عم نضيف متاجر جديدة، رجّع بعد شوي" />
            ) : (
              <EmptyState emoji="🔎" title={`ما في ${selectedType?.label || 'متاجر'} حالياً`} subtitle="جرّب قسم ثاني أو شوف كل المتاجر" ctaLabel="عرض الكل" onCta={() => setSelected('all')} />
            )}
          </View>
        ) : (
          <>
            <Text style={s.listTitle}>{selected === 'all' ? 'كل المتاجر' : `${selectedType?.label} المتاحة`} ({displayList.length})</Text>
            <View style={s.grid}>
              {displayList.map((r, i) => (
                <PopIn key={r.id} delay={Math.min(i, 8) * 55}>
                  <StoreCard r={r} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} />
                </PopIn>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeSc = (C) => StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.card, borderRadius: 18, overflow: 'hidden', ...C.shadow.soft },
  imgBox: { width: '100%', height: 110, position: 'relative' },
  img: { width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center', alignItems: 'center' },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  logoCircle: { position: 'absolute', bottom: -13, right: 10, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: C.card, overflow: 'hidden', backgroundColor: C.card },
  body: { paddingHorizontal: 10, paddingTop: 16, paddingBottom: 10 },
  name: { fontSize: 13.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, gap: 3 },
  metaTxt: { fontSize: 11.5, color: C.text, fontWeight: '600' },
});

const makeS = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden', ...C.shadow.card },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  headerInner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 23, fontWeight: '900', color: '#FFF' },
  headerSub: { fontSize: 12.5, color: 'rgba(255,255,255,0.9)', textAlign: 'right', marginTop: 4, fontWeight: '600' },
  typesWrap: { marginTop: 12 },
  typesRow: { flexDirection: 'row-reverse', paddingHorizontal: 14, gap: 8 },
  typeBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  typeLabel: { fontSize: 13, fontWeight: '800', color: C.text },
  countPill: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countTxt: { fontSize: 11, fontWeight: '900', color: C.sub },
  listTitle: { fontSize: 17, fontWeight: '900', color: C.text, textAlign: 'right', paddingHorizontal: 16, marginBottom: 12 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
});
