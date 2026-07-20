import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, RefreshControl, Dimensions, StatusBar, Animated, Pressable, LayoutAnimation, Platform, UIManager, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import BannerSlider from '../components/BannerSlider';
import SkeletonCard from '../components/SkeletonCard';

// تفعيل LayoutAnimation على Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;
const C = { primary: '#FF6B00', bg: '#F2F2F7', white: '#FFF', text: '#1A1A2E', gray: '#6B6B6B', sec: '#FFF8F4' };

/* ── كرت مع موشن ضغط ── */
function AnimCard({ children, style, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50 }).start();
  const release = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={press} onPressOut={release}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* ── قسم قابل للطي مع موشن ── */
function CollapsibleSection({ title, icon, bg, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.7 },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    Animated.spring(rotation, {
      toValue: open ? 0 : 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
    }).start();
    setOpen(o => !o);
  };

  const arrowRotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={[cs.wrap, { backgroundColor: bg }]}>
      <TouchableOpacity style={cs.head} onPress={toggle} activeOpacity={0.75}>
        {/* يسار: سهم */}
        <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
          <Ionicons name="chevron-down" size={20} color={C.primary} />
        </Animated.View>
        {/* يمين: عنوان + أيقونة */}
        <View style={cs.titleRow}>
          <Text style={cs.title}>{title}</Text>
          {icon ? <Ionicons name={icon} size={20} color={C.primary} style={{ marginLeft: 6 }} /> : null}
        </View>
      </TouchableOpacity>
      {open && <View style={cs.body}>{children}</View>}
    </View>
  );
}

/* ── كرت الشبكة ── */
function RCard({ r, onPress }) {
  return (
    <AnimCard style={rc.wrap} onPress={onPress}>
      <View style={rc.imgBox}>
        <Image source={{ uri: r.cover_image || r.logo }} style={rc.img} resizeMode="cover" />
        {(r.discount_percent > 0 || r.discount > 0) && (
          <View style={rc.badge}><Text style={rc.badgeTxt}>خصم {r.discount_percent || r.discount}%</Text></View>
        )}
        {!r.is_open && <View style={rc.overlay}><Text style={rc.overlayTxt}>مغلق</Text></View>}
        <View style={rc.logoCircle}>
          <Image source={{ uri: r.logo }} style={rc.logoImg} resizeMode="cover" />
        </View>
      </View>
      <View style={rc.body}>
        <Text style={rc.name} numberOfLines={1}>{r.name_ar}</Text>
        <Text style={rc.addr} numberOfLines={1}>{r.address || r.city || ''}</Text>
        <View style={rc.meta}>
          <Ionicons name="star" size={12} color="#FFB800" />
          <Text style={rc.metaTxt}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
          <Text style={rc.sep}>·</Text>
          <Ionicons name="time-outline" size={12} color={C.gray} />
          <Text style={rc.metaTxt}>{r.delivery_time_min}-{r.delivery_time_max} د</Text>
        </View>
      </View>
    </AnimCard>
  );
}

/* ── كرت أفقي ── */
function HCard({ r, onPress }) {
  return (
    <AnimCard style={hc.wrap} onPress={onPress}>
      <Image source={{ uri: r.logo || r.cover_image }} style={hc.img} resizeMode="cover" />
      {!r.is_open && <View style={hc.closed}><Text style={hc.closedTxt}>مغلق</Text></View>}
      <Text style={hc.name} numberOfLines={2}>{r.name_ar}</Text>
      <View style={hc.row}>
        <Ionicons name="star" size={12} color="#FFB800" />
        <Text style={hc.rating}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
      </View>
    </AnimCard>
  );
}

/* ── grid داخل قسم ── */
function SectionGrid({ list, onPress, limit = 4 }) {
  const [expanded, setExpanded] = useState(false);
  const shown = list.slice(0, expanded ? list.length : limit);
  return (
    <>
      <View style={s.grid}>
        {shown.map(r => <RCard key={r.id} r={r} onPress={() => onPress(r.id)} />)}
      </View>
      {list.length > limit && (
        <TouchableOpacity style={s.moreBtn} onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpanded(e => !e);
        }}>
          <Text style={s.moreTxt}>{expanded ? 'عرض أقل ▲' : 'اعرض المزيد ▼'}</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const [banners, setBanners]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recommended');
  const [openOnly, setOpenOnly] = useState(false);
  const [recentRests, setRecentRests] = useState([]);
  const suggestedRef = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [r, c, b] = await Promise.allSettled([
        api.get('/restaurants?limit=60'),
        api.get('/categories'),
        api.get('/banners'),
      ]);
      const allRests = r.status === 'fulfilled' ? (r.value?.data || []) : [];
      if (r.status === 'fulfilled') setRestaurants(allRests);
      if (c.status === 'fulfilled') setCategories(c.value?.data || []);
      if (b.status === 'fulfilled') setBanners(b.value?.data || []);

      // مطاعم طلبت منها مؤخراً
      try {
        const my = await api.get('/orders/my');
        const orders = my?.data || [];
        const seen = new Set();
        const recent = [];
        for (const o of orders) {
          if (o.restaurant_id && !seen.has(o.restaurant_id)) {
            seen.add(o.restaurant_id);
            const rest = allRests.find(x => x.id === o.restaurant_id);
            if (rest) recent.push(rest);
          }
          if (recent.length >= 8) break;
        }
        setRecentRests(recent);
      } catch {}
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, []);

  const go = (id) => navigation.navigate('Restaurant', { restaurantId: id });
  const sorted = React.useMemo(() => {
    let arr = [...restaurants];
    if (openOnly) arr = arr.filter(r => r.is_open);
    if (sortBy === 'rating') arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sortBy === 'fastest') arr.sort((a, b) => (a.delivery_time_min || 99) - (b.delivery_time_min || 99));
    return arr;
  }, [restaurants, sortBy, openOnly]);

  const surpriseMe = () => {
    const pool = restaurants.filter(r => r.is_open);
    const list = pool.length ? pool : restaurants;
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    go(pick.id);
  };
  const byCat = (id) => sorted.filter(r => r.category_id === id);
  const topRated = [...restaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
  const suggested = sorted.slice(0, 8);

  useEffect(() => {
    if (suggested.length > 0) {
      const t = setTimeout(() => suggestedRef.current?.scrollToEnd({ animated: false }), 100);
      return () => clearTimeout(t);
    }
  }, [suggested.length]);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: 60, paddingHorizontal: 16 }}>
      <View style={{ height: 200, backgroundColor: '#E5E5EA', borderRadius: 18, marginBottom: 16 }} />
      {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
    </View>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={C.white} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={s.iconBtn}>
          <Ionicons name="notifications-outline" size={24} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.locBtn} onPress={() => navigation.navigate('AddAddress')}>
          <Ionicons name="chevron-down" size={16} color={C.gray} />
          <Text style={s.locTxt} numberOfLines={1}>حدد موقعك</Text>
          <Ionicons name="location" size={18} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('بحث')} style={s.iconBtn}>
          <Ionicons name="search-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}>

        {/* Banner */}
        <BannerSlider banners={banners} />

        {/* تصنيفات */}
        <View style={{ backgroundColor: C.white, paddingVertical: 16 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 12 }}>
            {categories.map(cat => (
              <TouchableOpacity key={cat.id} style={s.quickCat} onPress={() => { const first = byCat(cat.id)[0]; if (first) go(first.id); }}>
                <View style={s.quickCircle}>
                  <Text style={{ fontSize: 28 }}>{cat.icon || '🍽️'}</Text>
                </View>
                <Text style={s.quickLbl}>{cat.name_ar}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={s.divider} />

        {/* فرز المطاعم + فاجئني + المفتوحة الآن */}
        <View style={{ backgroundColor: C.white, paddingVertical: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8 }}>
            <TouchableOpacity onPress={surpriseMe} style={[s.sortChip, { backgroundColor: '#FFF0E8', borderColor: C.primary }]}>
              <Text style={[s.sortChipTxt, { color: C.primary }]}>فاجئني 🎲</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpenOnly(v => !v)} style={[s.sortChip, openOnly && s.sortChipOn]}>
              <Text style={[s.sortChipTxt, openOnly && s.sortChipTxtOn]}>المفتوحة الآن 🟢</Text>
            </TouchableOpacity>
            {[
              { k: 'recommended', l: 'مقترح ✨' },
              { k: 'rating', l: 'الأعلى تقييماً ⭐' },
              { k: 'fastest', l: 'الأسرع توصيلاً 🛵' },
            ].map(opt => (
              <TouchableOpacity key={opt.k} onPress={() => setSortBy(opt.k)}
                style={[s.sortChip, sortBy === opt.k && s.sortChipOn]}>
                <Text style={[s.sortChipTxt, sortBy === opt.k && s.sortChipTxtOn]}>{opt.l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* اطلب مرة أخرى */}
        {recentRests.length > 0 && (
          <>
            <View style={s.divider} />
            <CollapsibleSection title="اطلب مرة أخرى" icon="repeat" bg={C.white}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingBottom: 4 }}>
                {recentRests.map(r => <HCard key={r.id} r={r} onPress={() => go(r.id)} />)}
              </ScrollView>
            </CollapsibleSection>
          </>
        )}

        {/* مطاعم مقترحة */}
        {suggested.length > 0 && (
          <CollapsibleSection title="مطاعم مقترحة" icon="sparkles" bg={C.sec}>
            <ScrollView
              ref={suggestedRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingBottom: 4 }}>
              {suggested.map(r => <HCard key={r.id} r={r} onPress={() => go(r.id)} />)}
            </ScrollView>
          </CollapsibleSection>
        )}

        <View style={s.divider} />

        {/* الأعلى تقييماً */}
        {topRated.length > 0 && (
          <CollapsibleSection title="الأعلى تقييماً" icon="star" bg={C.white}>
            <SectionGrid list={topRated} onPress={go} />
          </CollapsibleSection>
        )}

        {/* أقسام التصنيفات */}
        {categories.map((cat, ci) => {
          const list = byCat(cat.id);
          if (list.length === 0) return null;
          return (
            <React.Fragment key={cat.id}>
              <View style={s.divider} />
              <CollapsibleSection title={cat.name_ar} icon={null} bg={ci % 2 === 0 ? C.sec : C.white}>
                <SectionGrid list={list} onPress={go} />
              </CollapsibleSection>
            </React.Fragment>
          );
        })}

        {restaurants.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 52 }}>🍽️</Text>
            <Text style={{ color: C.gray, marginTop: 12, fontSize: 17, fontWeight: '600' }}>لا توجد مطاعم حالياً</Text>
          </View>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

/* ── Styles ── */
const cs = StyleSheet.create({
  wrap: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: C.text },
  body: { paddingBottom: 16 },
});

const rc = StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.white, borderRadius: 18, overflow: 'hidden', elevation: 4, shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  imgBox: { width: '100%', height: 115, position: 'relative' },
  img: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 8, right: 8, backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center', alignItems: 'center' },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  logoCircle: { position: 'absolute', bottom: -14, left: 10, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden', backgroundColor: '#FFF', elevation: 4 },
  logoImg: { width: '100%', height: '100%' },
  body: { paddingHorizontal: 10, paddingTop: 18, paddingBottom: 10 },
  name: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 12, color: C.gray, marginTop: 2, textAlign: 'right' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, gap: 3 },
  metaTxt: { fontSize: 12, color: C.text, fontWeight: '600' },
  sep: { color: C.gray },
});

const hc = StyleSheet.create({
  wrap: { width: 105, alignItems: 'center' },
  img: { width: 82, height: 82, borderRadius: 41, backgroundColor: '#EEE' },
  closed: { position: 'absolute', top: 0, left: 11, right: 11, height: 82, borderRadius: 41, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', alignItems: 'center' },
  closedTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '700', color: C.text, textAlign: 'center', marginTop: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rating: { fontSize: 12, color: C.text, fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#EBEBF0' },
  iconBtn: { padding: 4 },
  locBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  locTxt: { fontSize: 15, fontWeight: '800', color: C.text },
  divider: { height: 8, backgroundColor: '#EBEBF0' },
  quickCat: { alignItems: 'center', gap: 7 },
  quickCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  quickLbl: { fontSize: 13, fontWeight: '700', color: C.text },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  moreBtn: { marginTop: 14, marginHorizontal: 16, borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  moreTxt: { color: C.primary, fontWeight: '800', fontSize: 15 },
  sortChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: '#E5E5EA' },
  sortChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  sortChipTxt: { fontSize: 13, fontWeight: '700', color: C.text },
  sortChipTxtOn: { color: '#FFF' },
});
