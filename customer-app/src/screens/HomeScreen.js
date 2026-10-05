import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, RefreshControl, Dimensions, Animated, Pressable, LayoutAnimation, Platform, UIManager, Alert, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import * as Location from 'expo-location';
import BannerSlider from '../components/BannerSlider';
import { Skeleton, GridSkeleton } from '../components/Skeleton';
import SupportButton from '../components/SupportButton';
import { FadeIn, PopIn } from '../components/Anim';
import { Press } from '../components/Anim';
import EmptyState from '../components/EmptyState';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useHeaderTop } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';
import { addressLabel } from './AddressesScreen';

// تحية حسب الوقت
const greetingText = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء الخير';
};

// تفعيل LayoutAnimation على Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');
const CARD_W = (width - 48) / 2;

// مسافة بالكيلومتر بين نقطتين (Haversine)
const distKm = (aLat, aLng, bLat, bLng) => {
  if (aLat == null || bLat == null || bLat === undefined) return Infinity;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
// ألوان الثيم تأتي من useTheme

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
  const { colors: C } = useTheme();
  const cs = React.useMemo(() => makeCs(C), [C]);
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
      <TouchableOpacity style={cs.head} onPress={toggle} activeOpacity={0.75}
        accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title}>
        {/* يسار: سهم */}
        <Animated.View style={{ transform: [{ rotate: arrowRotate }] }}>
          <Ionicons name="chevron-down" size={20} color={C.primary} />
        </Animated.View>
        {/* يمين: عنوان + أيقونة بشارة */}
        <View style={cs.titleRow}>
          <Text style={cs.title}>{title}</Text>
          {icon ? <View style={cs.iconBadge}><Ionicons name={icon} size={16} color={C.primary} /></View> : null}
        </View>
      </TouchableOpacity>
      {open && <View style={cs.body}>{children}</View>}
    </View>
  );
}

/* ── كرت الشبكة ── */
function RCard({ r, onPress }) {
  const { colors: C } = useTheme();
  const rc = React.useMemo(() => makeRc(C), [C]);
  return (
    <AnimCard style={rc.wrap} onPress={onPress}>
      <View style={rc.imgBox}>
        <Image source={{ uri: r.cover_image || r.logo }} style={rc.img} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(10,10,20,0.55)']} style={rc.scrim} />
        {(r.discount_percent > 0 || r.discount > 0) && (
          <View style={rc.badge}><Text style={rc.badgeTxt}>خصم {r.discount_percent || r.discount}%</Text></View>
        )}
        {!r.is_open && <View style={rc.overlay}><Text style={rc.overlayTxt}>مغلق</Text></View>}
        {!!r.logo && (
          <View style={rc.logoCircle}>
            <Image source={{ uri: r.logo }} style={rc.logoImg} resizeMode="cover" />
          </View>
        )}
      </View>
      <View style={rc.body}>
        <Text style={rc.name} numberOfLines={1}>{r.name_ar}</Text>
        <Text style={rc.addr} numberOfLines={1}>{r.address || r.city || ''}</Text>
        <View style={rc.meta}>
          <Ionicons name="star" size={12} color="#FFB800" />
          <Text style={rc.metaTxt}>{(Number(r.rating) || 0).toFixed(1)}</Text>
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
  const { colors: C } = useTheme();
  const hc = React.useMemo(() => makeHc(C), [C]);
  return (
    <AnimCard style={hc.wrap} onPress={onPress}>
      <View style={hc.imgBox}>
        <Image source={{ uri: r.cover_image || r.logo }} style={hc.img} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(10,10,20,0.5)']} style={hc.scrim} />
        {!r.is_open && <View style={hc.closed}><Text style={hc.closedTxt}>مغلق</Text></View>}
        <View style={hc.ratePill}>
          <Ionicons name="star" size={10} color="#FFB800" />
          <Text style={hc.rateTxt}>{(Number(r.rating) || 0).toFixed(1)}</Text>
        </View>
        {!!r.logo && <View style={hc.logoDot}><Image source={{ uri: r.logo }} style={hc.logoImg} /></View>}
      </View>
      <Text style={hc.name} numberOfLines={1}>{r.name_ar}</Text>
      <Text style={hc.time} numberOfLines={1}>{r.delivery_time_min}-{r.delivery_time_max} دقيقة</Text>
    </AnimCard>
  );
}

/* ── grid داخل قسم ── */
function SectionGrid({ list, onPress, limit = 4 }) {
  const { colors: C } = useTheme();
  const s = React.useMemo(() => makeS(C), [C]);
  const [expanded, setExpanded] = useState(false);
  const shown = list.slice(0, expanded ? list.length : limit);
  return (
    <>
      <View style={s.grid}>
        {shown.map((r, i) => (
          <PopIn key={r.id} delay={Math.min(i, 8) * 55}>
            <RCard r={r} onPress={() => onPress(r.id)} />
          </PopIn>
        ))}
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
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const s = React.useMemo(() => makeS(C), [C]);
  const headerTop = useHeaderTop(10);
  const tabInset = useTabBarInset();
  const [defaultAddr, setDefaultAddr] = useState(null);
  const [banners, setBanners]       = useState([]);
  const [categories, setCategories] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recommended');
  const [openOnly, setOpenOnly] = useState(false);
  const [userLoc, setUserLoc] = useState(null);
  const [recentRests, setRecentRests] = useState([]);
  const suggestedRef = useRef(null);

  useEffect(() => {
    // اعرض من الكاش فوراً (بدون تحميل) ثم حدّث بالخلفية
    (async () => {
      const cached = await readCache('home');
      if (cached) {
        if (cached.restaurants) setRestaurants(cached.restaurants);
        if (cached.categories) setCategories(cached.categories);
        if (cached.banners) setBanners(cached.banners);
        if (cached.recentRests) setRecentRests(cached.recentRests);
        setLoading(false);
      }
      load();
    })();
  }, []);

  // العنوان الافتراضي للشريط العلوي — يتحدّث عند كل رجوع للرئيسية
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const pick = (list) => (list || []).find(a => a.is_default) || (list || [])[0] || null;
      const cached = await readCache('addresses');
      if (alive && cached) setDefaultAddr(pick(cached));
      try {
        const d = await api.get('/users/addresses');
        if (!alive) return;
        setDefaultAddr(pick(d.data));
        writeCache('addresses', d.data || []);
      } catch {}
    })();
    return () => { alive = false; };
  }, []));

  // موقع المستخدم لترتيب "الأقرب إليك" — بدون طلب إذن مزعج عند الفتح (فقط لو مسموح مسبقاً)
  const fetchUserLoc = async (ask) => {
    try {
      const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return { denied: true, canAskAgain: perm.canAskAgain };
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setUserLoc(c);
      return { loc: c };
    } catch { return { error: true }; }
  };
  useEffect(() => { fetchUserLoc(false); }, []);

  const chooseSort = async (k) => {
    if (k === 'nearest' && !userLoc) {
      const r = await fetchUserLoc(true);
      if (!r.loc) {
        Alert.alert('الموقع غير متاح', 'حتى نرتّب المطاعم حسب الأقرب لك، فعّل إذن الموقع للتطبيق.', [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'الإعدادات', onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
    }
    setSortBy(k);
  };

  const onBannerPress = (a) => {
    if (!a) return;
    if (a.type === 'url') { Linking.openURL(a.url).catch(() => {}); return; }
    if (a.type === 'tab') { navigation.navigate(a.screen); return; }
    navigation.navigate(a.screen, a.params);
  };

  const load = async () => {
    try {
      const [r, c, b] = await Promise.allSettled([
        api.get('/restaurants?limit=60'),
        api.get('/categories'),
        api.get('/banners'),
      ]);
      const allRests = r.status === 'fulfilled' ? (r.value?.data || []) : [];
      const cats = c.status === 'fulfilled' ? (c.value?.data || []) : [];
      const bans = b.status === 'fulfilled' ? (b.value?.data || []) : [];
      if (r.status === 'fulfilled') setRestaurants(allRests);
      if (c.status === 'fulfilled') setCategories(cats);
      if (b.status === 'fulfilled') setBanners(bans);

      // مطاعم طلبت منها مؤخراً
      let recent = [];
      try {
        const my = await api.get('/orders/my');
        const orders = my?.data || [];
        const seen = new Set();
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

      // خزّن للعرض الفوري في المرة الجاية
      if (allRests.length || cats.length || bans.length) {
        writeCache('home', { restaurants: allRests, categories: cats, banners: bans, recentRests: recent });
      }
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
    else if (sortBy === 'nearest' && userLoc) arr.sort((a, b) =>
      distKm(userLoc.lat, userLoc.lng, a.lat, a.lng) - distKm(userLoc.lat, userLoc.lng, b.lat, b.lng));
    return arr;
  }, [restaurants, sortBy, openOnly, userLoc]);

  const surpriseMe = () => {
    const pool = restaurants.filter(r => r.is_open);
    const list = pool.length ? pool : restaurants;
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    go(pick.id);
  };
  // مطابقة المطعم مع فئة حسب فئات المنيو الموجودة داخله
  const matchesCat = (r, catName) => {
    if (!catName) return false;
    return (r.menu_cats || []).some(mc => mc && (mc.includes(catName) || catName.includes(mc)));
  };
  const byCat = (cat) => sorted.filter(r => matchesCat(r, cat.name_ar));
  const topRated = [...restaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
  const suggested = sorted.slice(0, 8);

  useEffect(() => {
    if (suggested.length > 0) {
      const t = setTimeout(() => suggestedRef.current?.scrollToEnd({ animated: false }), 100);
      return () => clearTimeout(t);
    }
  }, [suggested.length]);

  const locText = defaultAddr ? `${addressLabel(defaultAddr)} · ${defaultAddr.address || ''}` : 'أضف عنوان التوصيل';
  const noMatches = restaurants.length > 0 && sorted.length === 0;

  const Header = (
    <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: headerTop }]}>
      <LinearGradient colors={C.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={s.sheen} pointerEvents="none" />
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => navigation.navigate('بحث')} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="بحث">
          <Ionicons name="search-outline" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={s.locBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`عنوان التوصيل: ${locText}`}
          onPress={() => navigation.navigate(defaultAddr ? 'Addresses' : 'AddAddress', defaultAddr ? undefined : { makeDefault: true })}>
          <Ionicons name="location" size={17} color="#FFF" />
          <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
            <Text style={s.locCaption}>التوصيل إلى</Text>
            <Text style={s.locTxt} numberOfLines={1}>{locText}</Text>
          </View>
          <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="الإشعارات">
          <Ionicons name="notifications-outline" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>
      <View style={s.greetWrap}>
        <Text style={s.greetHi}>{greetingText()}{user?.name ? ` ${String(user.name).split(' ')[0]}` : ''} 👋</Text>
        <Text style={s.greetSub}>شو نفسك تاكل اليوم؟</Text>
      </View>
    </LinearGradient>
  );

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {Header}
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Skeleton w={'100%'} h={176} r={24} style={{ marginBottom: 16 }} />
        <View style={{ flexDirection: 'row-reverse', gap: 14, marginBottom: 18 }}>
          {[0, 1, 2, 3].map(i => <View key={i} style={{ alignItems: 'center', gap: 6 }}><Skeleton w={64} h={64} r={24} /><Skeleton w={44} h={9} /></View>)}
        </View>
      </View>
      <GridSkeleton count={4} />
    </View>
  );

  const CtaCard = ({ colors, emoji, title, sub, onPress }) => (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ marginHorizontal: 16, marginBottom: 12 }} accessibilityRole="button" accessibilityLabel={title}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cta}>
        <Text style={{ fontSize: 26 }}>{emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.ctaTitle}>{title}</Text>
          <Text style={s.ctaSub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-back" size={20} color="#FFF" />
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      {Header}

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabInset + 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />}>

        <BannerSlider banners={banners} onPressBanner={onBannerPress} />

        {categories.length > 0 && (
          <View style={{ paddingTop: 14, paddingBottom: 18 }}>
            <View style={s.catHeader}>
              <Text style={s.catTitle}>اطلب حسب التصنيف</Text>
              <Text style={s.catEmoji}>🍴</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 16 }}>
              {categories.map((cat, i) => (
                <FadeIn key={cat.id} delay={i * 45} from={10}>
                  <Press style={s.quickCat} onPress={() => navigation.navigate('Category', { categoryId: cat.id, categoryName: cat.name_ar })}>
                    <LinearGradient colors={[C.sec, C.tint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.quickCircle}>
                      <View style={s.quickInner}>
                        <Text style={{ fontSize: 30 }}>{cat.icon || '🍽️'}</Text>
                      </View>
                    </LinearGradient>
                    <Text style={s.quickLbl} numberOfLines={1}>{cat.name_ar}</Text>
                  </Press>
                </FadeIn>
              ))}
            </ScrollView>
          </View>
        )}

        <CtaCard colors={C.gradients.brand} emoji="🧑‍🤝‍🧑" title="اطلبوا سوا — كل واحد يشوف حسابه" sub="عندك كود مجموعة؟ انضم واطلبوا مع بعض" onPress={() => navigation.navigate('GroupOrder')} />
        <CtaCard colors={C.gradients.sunset} emoji="📦" title="طلب شخصي — راكب أو طرد" sub="وصّل طرد أو اطلب سائق يوصّلك · السعر حسب المسافة" onPress={() => navigation.navigate('PersonalDelivery')} />

        <View style={s.divider} />

        {/* فرز المطاعم + فاجئني + المفتوحة الآن */}
        <View style={{ backgroundColor: C.card, paddingVertical: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8 }}>
            <TouchableOpacity onPress={surpriseMe} style={[s.sortChip, { backgroundColor: C.tint, borderColor: C.primary }]}>
              <Text style={[s.sortChipTxt, { color: C.primary }]}>فاجئني 🎲</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpenOnly(v => !v)} style={[s.sortChip, openOnly && s.sortChipOn]} accessibilityState={{ selected: openOnly }}>
              <Text style={[s.sortChipTxt, openOnly && s.sortChipTxtOn]}>المفتوحة الآن 🟢</Text>
            </TouchableOpacity>
            {[
              { k: 'recommended', l: 'مقترح ✨' },
              { k: 'nearest', l: 'الأقرب إليك 📍' },
              { k: 'rating', l: 'الأعلى تقييماً ⭐' },
              { k: 'fastest', l: 'الأسرع توصيلاً 🛵' },
            ].map(opt => (
              <TouchableOpacity key={opt.k} onPress={() => chooseSort(opt.k)}
                style={[s.sortChip, sortBy === opt.k && s.sortChipOn]} accessibilityState={{ selected: sortBy === opt.k }}>
                <Text style={[s.sortChipTxt, sortBy === opt.k && s.sortChipTxtOn]}>{opt.l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {noMatches && (
          <View style={{ paddingVertical: 30 }}>
            <EmptyState emoji="🔎" title="ما في مطاعم بهالفلتر" subtitle="جرّب تلغي فلتر «المفتوحة الآن» أو رجّع بعد شوي"
              ctaLabel="إلغاء الفلاتر" onCta={() => { setOpenOnly(false); setSortBy('recommended'); }} />
          </View>
        )}

        {recentRests.length > 0 && (
          <>
            <View style={s.divider} />
            <CollapsibleSection title="اطلب مرة أخرى" icon="repeat" bg={C.card}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingBottom: 4 }}>
                {recentRests.map(r => <HCard key={r.id} r={r} onPress={() => go(r.id)} />)}
              </ScrollView>
            </CollapsibleSection>
          </>
        )}

        {suggested.length > 0 && (
          <CollapsibleSection title={sortBy === 'nearest' ? 'الأقرب إليك' : 'مطاعم مقترحة'} icon="sparkles" bg={C.sec}>
            <ScrollView
              ref={suggestedRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingBottom: 4 }}>
              {suggested.map(r => <HCard key={r.id} r={r} onPress={() => go(r.id)} />)}
            </ScrollView>
          </CollapsibleSection>
        )}

        {topRated.length > 0 && !noMatches && (
          <>
            <View style={s.divider} />
            <CollapsibleSection title="الأعلى تقييماً" icon="star" bg={C.card}>
              <SectionGrid list={topRated} onPress={go} />
            </CollapsibleSection>
          </>
        )}

        {categories.map((cat, ci) => {
          const list = byCat(cat);
          if (list.length === 0) return null;
          return (
            <React.Fragment key={cat.id}>
              <View style={s.divider} />
              <CollapsibleSection title={cat.name_ar} icon={null} bg={ci % 2 === 0 ? C.sec : C.card}>
                <SectionGrid list={list} onPress={go} />
              </CollapsibleSection>
            </React.Fragment>
          );
        })}

        {restaurants.length === 0 && (
          <View style={{ paddingVertical: 40 }}>
            <EmptyState emoji="🍽️" title="ما في مطاعم حاليًا" subtitle="جرّب تسحب للتحديث بعد شوي" ctaLabel="تحديث" onCta={onRefresh} />
          </View>
        )}
      </ScrollView>

      <SupportButton />
    </View>
  );
}

/* ── Styles ── */
const makeCs = (C) => StyleSheet.create({
  wrap: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '900', color: C.text },
  iconBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  body: { paddingBottom: 16 },
});

const makeRc = (C) => StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  imgBox: { width: '100%', height: 118, position: 'relative' },
  img: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  badge: { position: 'absolute', top: 8, right: 8, backgroundColor: C.primary, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, elevation: 3, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  badgeTxt: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,20,35,0.5)', justifyContent: 'center', alignItems: 'center' },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  logoCircle: { position: 'absolute', bottom: -14, left: 10, width: 34, height: 34, borderRadius: 17, borderWidth: 2.5, borderColor: C.card, overflow: 'hidden', backgroundColor: C.card, elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  logoImg: { width: '100%', height: '100%' },
  body: { paddingHorizontal: 10, paddingTop: 18, paddingBottom: 10 },
  name: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 12, color: C.gray, marginTop: 2, textAlign: 'right' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 5, gap: 3 },
  metaTxt: { fontSize: 12, color: C.text, fontWeight: '600' },
  sep: { color: C.gray },
});

const makeHc = (C) => StyleSheet.create({
  wrap: { width: 128 },
  imgBox: { width: 128, height: 96, borderRadius: 20, overflow: 'hidden', position: 'relative', backgroundColor: C.inputBg, ...C.shadow.soft },
  img: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 44 },
  closed: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  closedTxt: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  ratePill: { position: 'absolute', top: 8, right: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  rateTxt: { fontSize: 11, fontWeight: '800', color: C.text },
  logoDot: { position: 'absolute', bottom: 6, left: 6, width: 26, height: 26, borderRadius: 9, borderWidth: 2, borderColor: C.card, overflow: 'hidden', backgroundColor: C.card },
  logoImg: { width: '100%', height: '100%' },
  name: { fontSize: 13.5, fontWeight: '800', color: C.text, textAlign: 'right', marginTop: 7 },
  time: { fontSize: 11.5, color: C.gray, textAlign: 'right', marginTop: 1, fontWeight: '600' },
});

const makeS = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden', ...C.shadow.float },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  cta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderRadius: 18, padding: 15, ...C.shadow.float },
  ctaTitle: { color: '#FFF', fontWeight: '900', fontSize: 15, textAlign: 'right' },
  ctaSub: { color: 'rgba(255,255,255,0.92)', fontSize: 11.5, marginTop: 2, textAlign: 'right' },
  locCaption: { fontSize: 10.5, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  greetWrap: { marginTop: 14, paddingHorizontal: 2, alignItems: 'flex-end' },
  greetHi: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  greetSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  locBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.20)', borderRadius: 22, paddingVertical: 9, paddingHorizontal: 12 },
  locTxt: { fontSize: 13.5, fontWeight: '800', color: '#FFF', textAlign: 'right' },
  divider: { height: 8, backgroundColor: C.divider },
  catHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 14 },
  catTitle: { fontSize: 17, fontWeight: '900', color: C.text },
  catEmoji: { fontSize: 16 },
  quickCat: { alignItems: 'center', gap: 8, width: 74 },
  quickCircle: { width: 70, height: 70, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...C.shadow.soft, shadowColor: '#FF6B00' },
  quickInner: { width: 58, height: 58, borderRadius: 20, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  quickLbl: { fontSize: 12.5, fontWeight: '800', color: C.text, textAlign: 'center' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  moreBtn: { marginTop: 14, marginHorizontal: 16, borderWidth: 1.5, borderColor: C.primary, borderRadius: 14, paddingVertical: 11, alignItems: 'center', backgroundColor: C.sec },
  moreTxt: { color: C.primary, fontWeight: '800', fontSize: 15 },
  sortChip: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 22, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border },
  sortChipOn: { backgroundColor: C.primary, borderColor: C.primary, elevation: 3, shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
  sortChipTxt: { fontSize: 13, fontWeight: '700', color: C.text },
  sortChipTxtOn: { color: '#FFF' },
});
