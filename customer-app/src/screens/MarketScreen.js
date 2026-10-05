import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn, Press } from '../components/Anim';
import { HeroDecor } from '../components/GradientHeader';
import { haptic, stagger } from '../utils/motion';
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
  const t = TYPES.find(x => x.id === typeOf(r)) || TYPES[1];
  return (
    <Press style={sc.wrap} onPress={onPress} scaleTo={0.96} haptic={false} accessibilityRole="button" accessibilityLabel={`${r.name_ar}${r.is_open ? '' : '، مغلق'}`}>
      <View style={sc.imgBox}>
        {(r.cover_image || r.logo)
          ? <Image source={{ uri: r.cover_image || r.logo }} style={sc.img} resizeMode="cover" />
          : <LinearGradient colors={[t.color + '33', t.color + '11']} style={[sc.img, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name={t.icon} size={38} color={t.color} /></LinearGradient>}
        <LinearGradient colors={C.gradients.scrim} style={sc.scrim} pointerEvents="none" />
        <View style={[sc.typeTag, { backgroundColor: t.color }]}><Ionicons name={t.icon} size={10} color="#FFF" /><Text style={sc.typeTagTxt}>{t.label}</Text></View>
        {!r.is_open && <View style={sc.overlay}><Ionicons name="moon" size={16} color="#FFF" /><Text style={sc.overlayTxt}>مغلق</Text></View>}
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
          <Ionicons name="time" size={11} color={C.primary} />
          <Text style={sc.metaTxt}>{r.delivery_time_min || 20}-{r.delivery_time_max || 45} د</Text>
        </View>
      </View>
    </Press>
  );
}

/* زر قسم كبير (أيقونة بمربع ملوّن + عدد) — يرتد ويتلوّن عند الاختيار */
function TypeTile({ t, on, count, onPress, C }) {
  return (
    <Press onPress={onPress} scaleTo={0.92} haptic={false} accessibilityRole="tab" accessibilityLabel={`${t.label}${count ? `، ${count}` : ''}`}
      style={[ts.tile, { backgroundColor: C.card, borderColor: on ? t.color : C.border }, on && { shadowColor: t.color, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }]}>
      <View style={[ts.iconBox, { backgroundColor: on ? t.color : t.color + '1A' }]}>
        <Ionicons name={t.icon} size={22} color={on ? '#FFF' : t.color} />
      </View>
      <Text style={[ts.label, { color: on ? t.color : C.text }]} numberOfLines={1}>{t.label}</Text>
      {count > 0 && <View style={[ts.count, { backgroundColor: on ? t.color : C.inputBg }]}><Text style={[ts.countTxt, { color: on ? '#FFF' : C.sub }]}>{count}</Text></View>}
    </Press>
  );
}

const ts = StyleSheet.create({
  tile: { width: 84, alignItems: 'center', paddingVertical: 12, borderRadius: 22, borderWidth: 1.5, gap: 7 },
  iconBox: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12.5, fontWeight: '800' },
  count: { position: 'absolute', top: 6, left: 6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countTxt: { fontSize: 10.5, fontWeight: '900' },
});

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
      <LinearGradient colors={C.gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: headerTop }]}>
        <HeroDecor />
        <View style={s.headerIconBig} pointerEvents="none"><Ionicons name="basket" size={110} color="rgba(255,255,255,0.13)" /></View>
        <FadeIn from={8}>
          <View style={s.headerInner}>
            <View style={s.headerIcon}><Ionicons name="storefront" size={20} color="#FFF" /></View>
            <Text style={s.headerTitle}>الماركت</Text>
          </View>
          <Text style={s.headerSub}>سوبرماركت · صيدليات · مخابز · بقاليات — كلها بضغطة</Text>
          <View style={s.headerStats}>
            <View style={s.statPill}><Ionicons name="storefront-outline" size={13} color="#FFF" /><Text style={s.statTxt}>{stores.length} متجر</Text></View>
            <View style={s.statPill}><Ionicons name="radio-button-on" size={11} color="#B6FFD0" /><Text style={s.statTxt}>{stores.filter(x => x.is_open).length} مفتوح الآن</Text></View>
          </View>
        </FadeIn>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabInset + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.card} />}>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.typesRow} accessibilityRole="tablist">
          {TYPES.map((t, i) => (
            <FadeIn key={t.id} delay={stagger(i, 40)} from={10}>
              <TypeTile t={t} C={C} on={selected === t.id} count={counts[t.id] || 0}
                onPress={() => { haptic.select(); setSelected(t.id); }} />
            </FadeIn>
          ))}
        </ScrollView>

        {loading ? (
          <GridSkeleton count={6} />
        ) : displayList.length === 0 ? (
          <View style={{ paddingVertical: 20 }}>
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
            <View style={s.listHead}>
              <Text style={s.listTitle}>{selected === 'all' ? 'كل المتاجر' : `${selectedType?.label} المتاحة`}</Text>
              <View style={[s.listCount, { backgroundColor: C.tint }]}><Text style={{ color: C.primary, fontWeight: '800', fontSize: 12 }}>{displayList.length}</Text></View>
            </View>
            <View style={s.grid} key={selected}>
              {displayList.map((r, i) => (
                <FadeIn key={r.id} delay={stagger(i)} from={18}>
                  <StoreCard r={r} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} />
                </FadeIn>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeSc = (C) => StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  imgBox: { width: '100%', height: 116, position: 'relative', backgroundColor: C.inputBg },
  img: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  typeTag: { position: 'absolute', top: 8, left: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  typeTagTxt: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,18,0.52)', justifyContent: 'center', alignItems: 'center', gap: 2 },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  logoCircle: { position: 'absolute', bottom: -15, right: 10, width: 34, height: 34, borderRadius: 12, borderWidth: 2.5, borderColor: C.card, overflow: 'hidden', backgroundColor: C.card, ...C.shadow.soft },
  body: { paddingHorizontal: 11, paddingTop: 19, paddingBottom: 12 },
  name: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 7, gap: 4, alignSelf: 'flex-end', backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  metaTxt: { fontSize: 11.5, color: C.primary, fontWeight: '800' },
});

const makeS = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  headerIconBig: { position: 'absolute', left: -10, bottom: -20 },
  headerInner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  headerIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 25, fontWeight: '900', color: '#FFF' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'right', marginTop: 6, fontWeight: '500' },
  headerStats: { flexDirection: 'row-reverse', gap: 8, marginTop: 12 },
  statPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statTxt: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  typesRow: { flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 10, paddingTop: 16, paddingBottom: 10 },
  listHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 8, marginBottom: 12 },
  listTitle: { fontSize: 18, fontWeight: '900', color: C.text, textAlign: 'right' },
  listCount: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
});
