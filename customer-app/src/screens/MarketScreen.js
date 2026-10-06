import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, FlatList, StyleSheet, Image, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { quietLocation } from '../utils/location';
import { plural } from '../utils/plural';
import RtlHScroll from '../components/RtlHScroll';
import { FadeIn, Press } from '../components/Anim';
import { HeroDecor } from '../components/GradientHeader';
import { haptic, stagger } from '../utils/motion';
import EmptyState from '../components/EmptyState';
import { GridSkeleton } from '../components/Skeleton';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useTheme } from '../context/ThemeContext';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';
import { fetchStoreTypes, readStoreTypesCache, mergeStoreTypes, normStoreType, storeTypeMeta } from '../utils/storeTypes';

const { width } = Dimensions.get('window');
const CARD_W = (width - 46) / 2;
const ALL = { key: 'all', name: 'الكل', icon: 'apps', emoji: '🏪', color: '#FF6B00' };
const SECTION_PREVIEW = 4; // عدد المتاجر بكل قسم في عرض «الكل»

// قسم المتجر: store_type من الخادم (market القديمة = سوبرماركت). الخادم القديم بلا store_type → تخمين من الاسم
const typeOf = (r) => {
  if (r.store_type && normStoreType(r.store_type) !== 'restaurant') return normStoreType(r.store_type);
  const n = r.name_ar || '';
  if (n.includes('صيدل') || n.includes('دواء')) return 'pharmacy';
  if (n.includes('مخبز') || n.includes('خبز') || n.includes('فرن') || n.includes('حلويات')) return 'sweets';
  if (n.includes('بقال')) return 'grocery';
  return 'supermarket';
};

// موقع الزبون بدون طلب إذن (utils/location → quietLocation) — لحساب المسافة ورسوم التوصيل الصحيحة
const locQs = (loc) => (loc ? `&lat=${loc.lat.toFixed(5)}&lng=${loc.lng.toFixed(5)}` : '');

/* أيقونة القسم: Ionicons إن وُجدت وإلا الإيموجي */
function TypeGlyph({ t, size, color }) {
  if (t.icon) return <Ionicons name={t.icon} size={size} color={color} />;
  return <Text style={{ fontSize: size - 2 }}>{t.emoji}</Text>;
}

// ستايلات الكرت مشتركة بين كل الكروت (مش نسخة لكل كرت)
const scCache = new WeakMap();
const scFor = (C) => { let v = scCache.get(C); if (!v) { v = makeSc(C); scCache.set(C, v); } return v; };

const StoreCard = React.memo(function StoreCard({ r, t, onPress }) {
  const { colors: C } = useTheme();
  const sc = scFor(C);
  return (
    <Press style={sc.wrap} onPress={onPress} scaleTo={0.96} haptic={false} accessibilityRole="button" accessibilityLabel={`${r.name_ar}، ${t.name}${r.is_open ? '' : '، مغلق'}`}>
      <View style={sc.imgBox}>
        {(r.cover_image || r.logo)
          ? <Image source={{ uri: r.cover_image || r.logo }} style={sc.img} resizeMode="cover" />
          : <LinearGradient colors={[t.color + '33', t.color + '11']} style={[sc.img, { alignItems: 'center', justifyContent: 'center' }]}><TypeGlyph t={t} size={38} color={t.color} /></LinearGradient>}
        <LinearGradient colors={C.gradients.scrim} style={sc.scrim} pointerEvents="none" />
        <View style={[sc.typeTag, { backgroundColor: t.color }]}><Text style={sc.typeTagEmoji}>{t.emoji}</Text><Text style={sc.typeTagTxt} numberOfLines={1}>{t.name}</Text></View>
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
          {r.distance_km != null && <Text style={sc.metaTxt}>· {Number(r.distance_km).toFixed(1)} كم</Text>}
        </View>
      </View>
    </Press>
  );
});

/* زر قسم كبير (أيقونة بمربع ملوّن + عدد) — المؤشر النشط مرسوم داخل الزر نفسه (إطار + تعبئة) */
function TypeTile({ t, on, count, onPress, C }) {
  return (
    <Press onPress={onPress} scaleTo={0.92} haptic={false} accessibilityRole="tab" accessibilityState={{ selected: !!on }}
      accessibilityLabel={`${t.name}${count ? `، ${plural(count, 'store')}` : ''}`}
      style={[ts.tile, { backgroundColor: C.card, borderColor: on ? t.color : C.border }, on && { shadowColor: t.color, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }]}>
      <View style={[ts.iconBox, { backgroundColor: on ? t.color : t.color + '1A' }]}>
        <TypeGlyph t={t} size={22} color={on ? '#FFF' : t.color} />
      </View>
      <Text style={[ts.label, { color: on ? t.color : C.text }]} numberOfLines={2}>{t.name}</Text>
      {count > 0 && <View style={[ts.count, { backgroundColor: on ? t.color : C.inputBg }]}><Text style={[ts.countTxt, { color: on ? '#FFF' : C.sub }]}>{count}</Text></View>}
    </Press>
  );
}

const ts = StyleSheet.create({
  tile: { width: 88, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 22, borderWidth: 1.5, gap: 7 },
  iconBox: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 15 },
  count: { position: 'absolute', top: 6, left: 6, minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  countTxt: { fontSize: 10.5, fontWeight: '900' },
});

export default function MarketScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors: C } = useTheme();
  const s = React.useMemo(() => makeS(C), [C]);
  const headerTop = useHeaderTop(12);
  const tabInset = useTabBarInset();
  const [stores, setStores] = useState([]);            // كل المتاجر غير المطاعم
  const [byType, setByType] = useState({});            // key → متاجر القسم (من الخادم مباشرة)
  const [types, setTypes] = useState(() => mergeStoreTypes(null));
  const [selected, setSelected] = useState(route.params?.storeType || 'all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const locRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [cached, cachedTypes] = await Promise.all([readCache('market'), readStoreTypesCache()]);
      if (cachedTypes) setTypes(cachedTypes);
      if (cached) { setStores(cached); setLoading(false); }
      locRef.current = await quietLocation();
      load();
    })();
  }, []);

  // اختيار قسم من الرئيسية («تسوّق حسب القسم») — t يضمن إعادة الاختيار لنفس القسم
  useEffect(() => {
    const k = route.params?.storeType;
    if (k) {
      setSelected(k);
      const r = scrollRef.current;
      if (r?.scrollToOffset) r.scrollToOffset({ offset: 0, animated: false });
      else r?.scrollTo?.({ y: 0, animated: false });
    }
  }, [route.params?.storeType, route.params?.t]);

  // متاجر القسم المختار من الخادم (?store_type=<key>) — نعرض المحلي فوراً ثم نحدّث
  useEffect(() => {
    if (selected === 'all') return;
    let alive = true;
    api.get(`/restaurants?limit=60&store_type=${encodeURIComponent(selected)}${locQs(locRef.current)}`)
      .then(r => { if (alive && Array.isArray(r?.data)) setByType(m => ({ ...m, [selected]: r.data })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [selected]);

  const load = async () => {
    // store_type=market = كل الأقسام غير المطاعم (متوافق مع الخادم القديم والجديد)
    const [r, t] = await Promise.allSettled([
      api.get(`/restaurants?limit=100&store_type=market${locQs(locRef.current)}`),
      fetchStoreTypes(),
    ]);
    if (t.status === 'fulfilled' && t.value) setTypes(t.value);
    if (r.status === 'fulfilled') {
      const list = r.value?.data || [];
      setStores(list);
      setByType({});
      setFailed(false);
      writeCache('market', list);
    } else setFailed(true);
    setLoading(false);
  };

  const localCounts = useMemo(() => {
    const c = { all: stores.length };
    stores.forEach(r => { const k = typeOf(r); c[k] = (c[k] || 0) + 1; });
    return c;
  }, [stores]);

  // شريط الأقسام: فقط الأقسام التي فيها متاجر (عدد الخادم، أو العدد المحلي إن لم يتوفر)
  const rail = useMemo(() => {
    const list = types.filter(t => t.key !== 'restaurant').map(t => ({ ...t, n: t.count != null ? Math.max(t.count, localCounts[t.key] || 0) : (localCounts[t.key] || 0) }));
    // أي قسم موجود بالمتاجر وغير معروف بالقائمة (خادم أحدث) يظهر أيضاً
    Object.keys(localCounts).forEach(k => { if (k !== 'all' && !list.some(t => t.key === k)) list.push({ ...storeTypeMeta(k, types), n: localCounts[k] }); });
    return list.filter(t => t.n > 0 || t.key === selected);
  }, [types, localCounts, selected]);

  const metaOf = (r) => storeTypeMeta(typeOf(r), types);
  const selectedType = selected === 'all' ? ALL : storeTypeMeta(selected, types);
  const displayList = useMemo(() => {
    if (selected === 'all') return stores;
    const local = stores.filter(r => typeOf(r) === selected);
    const srv = byType[selected];
    if (!srv) return local;
    const ids = new Set(srv.map(x => x.id));
    return [...srv, ...local.filter(x => !ids.has(x.id))]; // دمج (خادم قديم قد لا يطابق القيم القديمة)
  }, [selected, stores, byType]);
  const allTotal = Math.max(stores.length, rail.reduce((a, t) => a + (t.n || 0), 0));

  // عرض «الكل»: أقسام مجمّعة (قسم → أول المتاجر + «عرض الكل»)
  const sections = useMemo(() => rail.map(t => ({ t, list: stores.filter(r => typeOf(r) === t.key) })).filter(x => x.list.length), [rail, stores]);

  const pick = (k) => { haptic.select(); setSelected(k); };
  const open = (r) => navigation.navigate('Restaurant', { restaurantId: r.id });

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
          <Text style={s.headerSub}>سوبرماركت · صيدليات · موبايلات · حيوانات أليفة والمزيد — كلها بضغطة</Text>
          <View style={s.headerStats}>
            <View style={s.statPill}><Ionicons name="storefront-outline" size={13} color="#FFF" /><Text style={s.statTxt}>{plural(stores.length, 'store')}</Text></View>
            <View style={s.statPill}><Ionicons name="grid-outline" size={12} color="#FFF" /><Text style={s.statTxt}>{plural(rail.length, 'section')}</Text></View>
            <View style={s.statPill}><Ionicons name="radio-button-on" size={11} color="#B6FFD0" /><Text style={s.statTxt}>مفتوح الآن: {stores.filter(x => x.is_open).length}</Text></View>
          </View>
        </FadeIn>
      </LinearGradient>

      {(() => {
        const railItems = [ALL, ...rail];
        const activeIdx = Math.max(0, railItems.findIndex(t => t.key === selected));
        const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.card} />;
        // شريط الأقسام: يبدأ من اليمين، والقسم المختار (مثلاً جاي من الرئيسية) يظهر بالنص
        const typesRail = (
          <RtlHScroll activeIndex={activeIdx} contentContainerStyle={s.typesRow} accessibilityRole="tablist">
            {railItems.map((t, i) => (
              <FadeIn key={t.key} delay={stagger(i, 40)} from={10}>
                <TypeTile t={t} C={C} on={selected === t.key} count={t.key === 'all' ? allTotal : t.n}
                  onPress={() => pick(t.key)} />
              </FadeIn>
            ))}
          </RtlHScroll>
        );
        const listMode = !loading && displayList.length > 0 && !(selected === 'all' && sections.length > 1);
        // قائمة قسم واحد: FlatList بعمودين (يرسم الظاهر فقط بدل 100 كرت مرة وحدة)
        if (listMode) {
          return (
            <FlatList
              key={`list-${selected}`}
              ref={scrollRef}
              data={displayList}
              keyExtractor={(r) => String(r.id)}
              numColumns={2}
              columnWrapperStyle={s.gridRow}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: tabInset + 24 }}
              refreshControl={refresh}
              initialNumToRender={8}
              windowSize={7}
              ListHeaderComponent={(
                <>
                  {typesRail}
                  <View style={s.listHead}>
                    <Text style={s.listTitle}>{selected === 'all' ? 'كل المتاجر' : `${selectedType.emoji} ${selectedType.name}`}</Text>
                    <View style={[s.listCount, { backgroundColor: C.tint }]}><Text style={{ color: C.primary, fontWeight: '800', fontSize: 12 }}>{displayList.length}</Text></View>
                  </View>
                </>
              )}
              renderItem={({ item: r, index: i }) => (
                <FadeIn index={i} from={18} style={{ marginBottom: 14 }}>
                  <StoreCard r={r} t={metaOf(r)} onPress={() => open(r)} />
                </FadeIn>
              )}
            />
          );
        }
        return (
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabInset + 24 }}
        refreshControl={refresh}>

        {typesRail}

        {loading ? (
          <GridSkeleton count={6} />
        ) : displayList.length === 0 ? (
          <View style={{ paddingVertical: 20 }}>
            {failed && stores.length === 0 ? (
              <EmptyState emoji="📡" title="تعذّر تحميل المتاجر" subtitle="تأكد من الإنترنت وحاول مرة ثانية" ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); load(); }} />
            ) : stores.length === 0 ? (
              <EmptyState emoji="🏪" title="ما في متاجر حاليًا" subtitle="عم نضيف متاجر جديدة، رجّع بعد شوي" />
            ) : (
              <EmptyState emoji={selectedType.emoji || '🔎'} title={`ما في ${selectedType.name} حالياً`} subtitle="جرّب قسم ثاني أو شوف كل المتاجر" ctaLabel="عرض الكل" onCta={() => setSelected('all')} />
            )}
          </View>
        ) : (
          sections.map(({ t, list }, si) => (
            <View key={t.key} style={{ marginTop: si ? 18 : 4 }}>
              <View style={s.secHead}>
                <View style={[s.secIcon, { backgroundColor: t.color + '1A' }]}><Text style={{ fontSize: 17 }}>{t.emoji}</Text></View>
                <Text style={s.listTitle} numberOfLines={1}>{t.name}</Text>
                <View style={[s.listCount, { backgroundColor: t.color + '1A' }]}><Text style={{ color: t.color, fontWeight: '800', fontSize: 12 }}>{list.length}</Text></View>
                <View style={{ flex: 1 }} />
                {list.length > SECTION_PREVIEW && (
                  <Press onPress={() => pick(t.key)} haptic={false} scaleTo={0.94} style={s.seeAll} accessibilityRole="button" accessibilityLabel={`عرض كل ${t.name}`}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={[s.seeAllTxt, { color: t.color }]}>عرض الكل</Text>
                    <Ionicons name="chevron-back" size={14} color={t.color} />
                  </Press>
                )}
              </View>
              <View style={s.grid}>
                {list.slice(0, SECTION_PREVIEW).map((r, i) => (
                  <FadeIn key={r.id} delay={stagger(i)} from={18}>
                    <StoreCard r={r} t={t} onPress={() => open(r)} />
                  </FadeIn>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
        );
      })()}
    </View>
  );
}

const makeSc = (C) => StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  imgBox: { width: '100%', height: 116, position: 'relative', backgroundColor: C.inputBg },
  img: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  typeTag: { position: 'absolute', top: 8, left: 8, maxWidth: CARD_W - 16, flexDirection: 'row-reverse', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  typeTagEmoji: { fontSize: 9.5 },
  typeTagTxt: { color: '#FFF', fontSize: 10, fontWeight: '800', flexShrink: 1 },
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
  headerStats: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statTxt: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  typesRow: { paddingHorizontal: 16, gap: 10, paddingTop: 16, paddingBottom: 10 },
  listHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 8, marginBottom: 12 },
  secHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  secIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  seeAll: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 4 },
  seeAllTxt: { fontSize: 12.5, fontWeight: '800' },
  listTitle: { fontSize: 18, fontWeight: '900', color: C.text, textAlign: 'right', flexShrink: 1 },
  listCount: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  gridRow: { flexDirection: 'row-reverse', gap: 14, paddingHorizontal: 16 },
});
