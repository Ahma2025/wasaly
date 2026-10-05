import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, RefreshControl, Dimensions, Animated, LayoutAnimation, Platform, UIManager, Alert, Linking, Easing,
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
import { FadeIn, Press } from '../components/Anim';
import { Chip, IconButton } from '../components/UI';
import EmptyState from '../components/EmptyState';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useHeaderTop, HeroDecor } from '../components/GradientHeader';
import { useTabBarInset } from '../components/FloatingTabBar';
import { addressLabel } from './AddressesScreen';
import { useReducedMotion, isReducedMotion, haptic, EASE_OUT, stagger } from '../utils/motion';

// تحية حسب الوقت
const greetingText = () => {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء الخير';
};

// تلميحات البحث المتبدّلة داخل شريط البحث
const SEARCH_HINTS = ['ابحث عن شاورما، بيتزا، برجر…', 'جرّب: حلويات 🍰', 'جرّب: قهوة ☕', 'جرّب: صيدلية 💊', 'جرّب: مشاوي 🔥'];

// تفعيل LayoutAnimation على Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');
const CARD_W = (width - 46) / 2;

// مسافة بالكيلومتر بين نقطتين (Haversine)
const distKm = (aLat, aLng, bLat, bLng) => {
  if (aLat == null || bLat == null || bLat === undefined) return Infinity;
  const R = 6371, toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR, dLng = (bLng - aLng) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const layoutAnim = () => {
  if (isReducedMotion()) return;
  LayoutAnimation.configureNext({
    duration: 260,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'spring', springDamping: 0.78 },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
};

/* ── شريط بحث متحرّك (تلميحات تتبدّل بانزلاق) ── */
function AnimatedSearchBar({ onPress, C }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => {
      Animated.timing(v, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setI(x => (x + 1) % SEARCH_HINTS.length);
        Animated.timing(v, { toValue: 1, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start();
      });
    }, 2800);
    return () => clearInterval(t);
  }, [reduce]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return (
    <Press onPress={onPress} scaleTo={0.98} accessibilityRole="search" accessibilityLabel="ابحث عن مطعم أو صنف"
      style={[hs.search, { backgroundColor: C.card }, C.shadow.card]}>
      <View style={[hs.searchIcon, { backgroundColor: C.tint }]}><Ionicons name="search" size={18} color={C.primary} /></View>
      <Animated.Text numberOfLines={1} style={[hs.searchTxt, { color: C.faint, opacity: v, transform: [{ translateY: ty }] }]}>{SEARCH_HINTS[i]}</Animated.Text>
      <View style={[hs.searchFilter, { borderColor: C.border }]}><Ionicons name="options-outline" size={18} color={C.text} /></View>
    </Press>
  );
}

/* ── قسم قابل للطي ── */
function CollapsibleSection({ title, subtitle, icon, children, defaultOpen = true, count }) {
  const { colors: C } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    haptic.select();
    layoutAnim();
    Animated.spring(rotation, { toValue: open ? 0 : 1, useNativeDriver: true, damping: 14, stiffness: 200 }).start();
    setOpen(o => !o);
  };
  const arrowRotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <View style={hs.section}>
      <TouchableOpacity style={hs.secHead} onPress={toggle} activeOpacity={0.75}
        accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title}>
        <View style={hs.secTitleRow}>
          {icon ? (
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hs.secIcon}>
              <Ionicons name={icon} size={14} color="#FFF" />
            </LinearGradient>
          ) : <View style={[hs.secBar, { backgroundColor: C.primary }]} />}
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            <Text style={[hs.secTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
            {!!subtitle && <Text style={[hs.secSub, { color: C.faint }]} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {!!count && <View style={[hs.secCount, { backgroundColor: C.tint }]}><Text style={{ color: C.primary, fontSize: 11, fontWeight: '800' }}>{count}</Text></View>}
        </View>
        <Animated.View style={[hs.secChevron, { backgroundColor: C.card, borderColor: C.border, transform: [{ rotate: arrowRotate }] }]}>
          <Ionicons name="chevron-down" size={16} color={C.text} />
        </Animated.View>
      </TouchableOpacity>
      {open && <View>{children}</View>}
    </View>
  );
}

/* ── كرت الشبكة ── */
function RCard({ r, onPress }) {
  const { colors: C } = useTheme();
  const rc = React.useMemo(() => makeRc(C), [C]);
  const disc = r.discount_percent || r.discount;
  return (
    <Press style={rc.wrap} onPress={onPress} scaleTo={0.96} haptic={false} accessibilityRole="button" accessibilityLabel={`${r.name_ar}${r.is_open ? '' : '، مغلق'}`}>
      <View style={rc.imgBox}>
        {(r.cover_image || r.logo)
          ? <Image source={{ uri: r.cover_image || r.logo }} style={rc.img} resizeMode="cover" />
          : <LinearGradient colors={C.gradients.sunset} style={[rc.img, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="restaurant" size={34} color="rgba(255,255,255,0.85)" /></LinearGradient>}
        <LinearGradient colors={C.gradients.scrim} style={rc.scrim} />
        {disc > 0 && (
          <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={rc.badge}>
            <Text style={rc.badgeTxt}>خصم {disc}%</Text>
          </LinearGradient>
        )}
        <View style={rc.ratePill}>
          <Ionicons name="star" size={10} color="#FFB020" />
          <Text style={rc.rateTxt}>{(Number(r.rating) || 0).toFixed(1)}</Text>
        </View>
        {!r.is_open && <View style={rc.overlay}><Ionicons name="moon" size={16} color="#FFF" /><Text style={rc.overlayTxt}>مغلق</Text></View>}
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
          <Ionicons name="time" size={12} color={C.primary} />
          <Text style={rc.metaTxt}>{r.delivery_time_min || 20}-{r.delivery_time_max || 40} د</Text>
        </View>
      </View>
    </Press>
  );
}

/* ── كرت أفقي ── */
function HCard({ r, onPress }) {
  const { colors: C } = useTheme();
  const hc = React.useMemo(() => makeHc(C), [C]);
  return (
    <Press style={hc.wrap} onPress={onPress} scaleTo={0.95} haptic={false} accessibilityRole="button" accessibilityLabel={r.name_ar}>
      <View style={hc.imgBox}>
        {(r.cover_image || r.logo)
          ? <Image source={{ uri: r.cover_image || r.logo }} style={hc.img} resizeMode="cover" />
          : <LinearGradient colors={C.gradients.sunset} style={[hc.img, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="restaurant" size={28} color="rgba(255,255,255,0.85)" /></LinearGradient>}
        <LinearGradient colors={C.gradients.scrim} style={hc.scrim} />
        {!r.is_open && <View style={hc.closed}><Text style={hc.closedTxt}>مغلق</Text></View>}
        <View style={hc.ratePill}>
          <Ionicons name="star" size={10} color="#FFB020" />
          <Text style={hc.rateTxt}>{(Number(r.rating) || 0).toFixed(1)}</Text>
        </View>
        {!!r.logo && <View style={hc.logoDot}><Image source={{ uri: r.logo }} style={hc.logoImg} /></View>}
      </View>
      <Text style={hc.name} numberOfLines={1}>{r.name_ar}</Text>
      <View style={hc.timeRow}>
        <Ionicons name="time-outline" size={11} color={C.faint} />
        <Text style={hc.time} numberOfLines={1}>{r.delivery_time_min || 20}-{r.delivery_time_max || 40} دقيقة</Text>
      </View>
    </Press>
  );
}

/* ── grid داخل قسم ── */
function SectionGrid({ list, onPress, limit = 4 }) {
  const { colors: C } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = list.slice(0, expanded ? list.length : limit);
  return (
    <>
      <View style={hs.grid}>
        {shown.map((r, i) => (
          <FadeIn key={r.id} delay={stagger(i % limit)} from={18}>
            <RCard r={r} onPress={() => onPress(r.id)} />
          </FadeIn>
        ))}
      </View>
      {list.length > limit && (
        <TouchableOpacity style={[hs.moreBtn, { backgroundColor: C.card, borderColor: C.border }]} activeOpacity={0.8}
          accessibilityRole="button" accessibilityState={{ expanded }}
          onPress={() => { haptic.light(); layoutAnim(); setExpanded(e => !e); }}>
          <Text style={[hs.moreTxt, { color: C.primary }]}>{expanded ? 'عرض أقل' : `اعرض المزيد (${list.length - limit})`}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.primary} />
        </TouchableOpacity>
      )}
    </>
  );
}

/* ── بطاقة خدمة فخمة (طلب شخصي / جماعي) ── */
function ServiceCard({ colors, icon, title, sub, tag, onPress, delay }) {
  return (
    <FadeIn delay={delay} from={20} style={{ flex: 1 }}>
      <Press onPress={onPress} scaleTo={0.96} accessibilityRole="button" accessibilityLabel={`${title} — ${sub}`} style={hs.svcShadow}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hs.svc}>
          <LinearGradient colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0.8 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={hs.svcOrb} />
          <View style={hs.svcBigIcon}><Ionicons name={icon} size={70} color="rgba(255,255,255,0.16)" /></View>
          <View style={hs.svcIcon}><Ionicons name={icon} size={20} color="#FFF" /></View>
          {!!tag && <View style={hs.svcTag}><Text style={hs.svcTagTxt}>{tag}</Text></View>}
          <Text style={hs.svcTitle} numberOfLines={1}>{title}</Text>
          <Text style={hs.svcSub} numberOfLines={2}>{sub}</Text>
          <View style={hs.svcGo}><Ionicons name="arrow-back" size={14} color="#14142B" /></View>
        </LinearGradient>
      </Press>
    </FadeIn>
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
  const [activeCat, setActiveCat] = useState(null);
  const suggestedRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [miniOn, setMiniOn] = useState(false);
  const miniRef = useRef(false);

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
    setActiveCat(null);
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
    layoutAnim();
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
    haptic.success();
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
  const openCount = restaurants.filter(r => r.is_open).length;

  useEffect(() => {
    if (suggested.length > 0) {
      const t = setTimeout(() => suggestedRef.current?.scrollToEnd({ animated: false }), 100);
      return () => clearTimeout(t);
    }
  }, [suggested.length]);

  const locText = defaultAddr ? `${addressLabel(defaultAddr)} · ${defaultAddr.address || ''}` : 'أضف عنوان التوصيل';
  const noMatches = restaurants.length > 0 && sorted.length === 0;
  const firstName = user?.name ? String(user.name).split(' ')[0] : '';
  const goAddress = () => navigation.navigate(defaultAddr ? 'Addresses' : 'AddAddress', defaultAddr ? undefined : { makeDefault: true });
  const openCat = (cat) => {
    setActiveCat(cat.id);
    haptic.select();
    setTimeout(() => navigation.navigate('Category', { categoryId: cat.id, categoryName: cat.name_ar }), isReducedMotion() ? 0 : 140);
  };

  // هيرو متدرّج: صف (إشعارات / عنوان / بحث) + تحية + شريط بحث متحرّك
  const heroScale = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.12, 1], extrapolate: 'clamp' });
  const greetFade = scrollY.interpolate({ inputRange: [0, 90], outputRange: [1, 0], extrapolate: 'clamp' });
  const greetShift = scrollY.interpolate({ inputRange: [0, 90], outputRange: [0, -14], extrapolate: 'clamp' });

  const Hero = (
    <View style={{ marginBottom: 28 }}>
      <Animated.View style={[s.heroBg, { transform: [{ scale: heroScale }] }]}>
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <HeroDecor />
      </Animated.View>
      <View style={{ paddingTop: headerTop, paddingHorizontal: 16 }}>
        <View style={s.headerRow}>
          <IconButton icon="notifications-outline" onPress={() => navigation.navigate('Notifications')} label="الإشعارات" onGradient />
          <Press style={s.locBtn} scaleTo={0.97} onPress={goAddress} accessibilityRole="button" accessibilityLabel={`عنوان التوصيل: ${locText}`}>
            <View style={s.locIcon}><Ionicons name="location" size={15} color={C.primary} /></View>
            <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
              <Text style={s.locCaption}>التوصيل إلى</Text>
              <Text style={s.locTxt} numberOfLines={1}>{locText}</Text>
            </View>
            <Ionicons name="chevron-down" size={15} color="rgba(255,255,255,0.9)" />
          </Press>
          <IconButton icon="heart-outline" onPress={() => navigation.navigate('Favorites')} label="المفضلة" onGradient />
        </View>
        <Animated.View style={[s.greetWrap, { opacity: greetFade, transform: [{ translateY: greetShift }] }]}>
          <Text style={s.greetHi}>{greetingText()}{firstName ? `، ${firstName}` : ''} 👋</Text>
          <Text style={s.greetSub}>شو نفسك تاكل اليوم؟{openCount ? ` · ${openCount} مطعم مفتوح الآن` : ''}</Text>
        </Animated.View>
      </View>
      <View style={s.searchDock}>
        <AnimatedSearchBar C={C} onPress={() => navigation.navigate('بحث')} />
      </View>
    </View>
  );

  // الهيدر المصغّر اللاصق (يظهر بعد التمرير)
  const miniOpacity = scrollY.interpolate({ inputRange: [110, 170], outputRange: [0, 1], extrapolate: 'clamp' });
  const miniShift = scrollY.interpolate({ inputRange: [110, 170], outputRange: [-16, 0], extrapolate: 'clamp' });
  const MiniHeader = (
    <Animated.View pointerEvents={miniOn ? 'auto' : 'none'}
      style={[s.mini, { paddingTop: headerTop - 4, opacity: miniOpacity, transform: [{ translateY: miniShift }] }]}>
      <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={C.gradients.sheen} style={[StyleSheet.absoluteFill, { height: 40 }]} pointerEvents="none" />
      <View style={s.headerRow}>
        <IconButton icon="search" size={38} onPress={() => navigation.navigate('بحث')} label="بحث" onGradient />
        <TouchableOpacity style={s.miniLoc} onPress={goAddress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`عنوان التوصيل: ${locText}`}>
          <Ionicons name="location" size={14} color="#FFF" />
          <Text style={s.miniLocTxt} numberOfLines={1}>{locText}</Text>
          <Ionicons name="chevron-down" size={13} color="#FFF" />
        </TouchableOpacity>
        <IconButton icon="notifications-outline" size={38} onPress={() => navigation.navigate('Notifications')} label="الإشعارات" onGradient />
      </View>
    </Animated.View>
  );

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {Hero}
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <Skeleton w={'100%'} h={180} r={26} style={{ marginBottom: 20 }} />
        <View style={{ flexDirection: 'row-reverse', gap: 14, marginBottom: 22 }}>
          {[0, 1, 2, 3].map(i => <View key={i} style={{ alignItems: 'center', gap: 8 }}><Skeleton w={68} h={68} r={24} /><Skeleton w={46} h={9} /></View>)}
        </View>
        <View style={{ flexDirection: 'row-reverse', gap: 12, marginBottom: 20 }}>
          <Skeleton w={CARD_W} h={130} r={24} /><Skeleton w={CARD_W} h={130} r={24} />
        </View>
      </View>
      <GridSkeleton count={4} />
    </View>
  );

  const SORTS = [
    { k: 'recommended', l: 'مقترح', icon: 'sparkles' },
    { k: 'nearest', l: 'الأقرب إليك', icon: 'navigate' },
    { k: 'rating', l: 'الأعلى تقييماً', icon: 'star' },
    { k: 'fastest', l: 'الأسرع توصيلاً', icon: 'flash' },
  ];

  return (
    <View style={s.container}>
      <Animated.ScrollView showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e) => {
            const on = e.nativeEvent.contentOffset.y > 140;
            if (on !== miniRef.current) { miniRef.current = on; setMiniOn(on); }
          },
        })}
        contentContainerStyle={{ paddingBottom: tabInset + 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" colors={[C.primary]} progressViewOffset={headerTop} />}>

        {Hero}

        <BannerSlider banners={banners} onPressBanner={onBannerPress} />

        {categories.length > 0 && (
          <View style={{ paddingTop: 18 }}>
            <View style={s.catHeader}>
              <Text style={s.catTitle}>اطلب حسب التصنيف</Text>
              <Text style={s.catHint}>{categories.length} تصنيف</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingVertical: 4 }}>
              {categories.map((cat, i) => {
                const on = activeCat === cat.id;
                return (
                  <FadeIn key={cat.id} delay={stagger(i, 45)} from={10}>
                    <Press style={s.quickCat} scaleTo={0.9} haptic={false} onPress={() => openCat(cat)} accessibilityRole="button" accessibilityLabel={cat.name_ar}>
                      <View style={[s.quickCircle, on && C.shadow.glow]}>
                        <LinearGradient colors={on ? C.gradients.sunset : [C.card, C.card]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 24 }]} />
                        <View style={[s.quickInner, { backgroundColor: on ? 'rgba(255,255,255,0.22)' : C.tint }]}>
                          <Text style={{ fontSize: 28 }}>{cat.icon || '🍽️'}</Text>
                        </View>
                      </View>
                      <Text style={[s.quickLbl, on && { color: C.primary }]} numberOfLines={1}>{cat.name_ar}</Text>
                    </Press>
                  </FadeIn>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* خدمات مميزة */}
        <View style={s.svcRow}>
          <ServiceCard colors={C.gradients.info} icon="cube" title="طلب شخصي" sub="وصّل طرد أو اطلب سائق · السعر حسب المسافة" tag="كاش"
            onPress={() => navigation.navigate('PersonalDelivery')} delay={80} />
          <ServiceCard colors={C.gradients.violet} icon="people" title="طلب جماعي" sub="اطلبوا سوا وكل واحد يشوف حسابه"
            onPress={() => navigation.navigate('GroupOrder')} delay={140} />
        </View>

        {/* فرز المطاعم + فاجئني + المفتوحة الآن */}
        <View style={s.sortHead}>
          <Text style={s.catTitle}>كل المطاعم</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8, paddingVertical: 6 }}>
          <Chip icon="dice" label="فاجئني" onPress={surpriseMe} tone={C.primary} />
          <Chip icon={openOnly ? 'radio-button-on' : 'radio-button-off'} label="المفتوحة الآن" selected={openOnly}
            onPress={() => { layoutAnim(); setOpenOnly(v => !v); }} />
          {SORTS.map(opt => (
            <Chip key={opt.k} icon={opt.icon} label={opt.l} selected={sortBy === opt.k} onPress={() => chooseSort(opt.k)} />
          ))}
        </ScrollView>

        {noMatches && (
          <View style={{ paddingVertical: 20 }}>
            <EmptyState emoji="🔎" title="ما في مطاعم بهالفلتر" subtitle="جرّب تلغي فلتر «المفتوحة الآن» أو رجّع بعد شوي"
              ctaLabel="إلغاء الفلاتر" onCta={() => { setOpenOnly(false); setSortBy('recommended'); }} />
          </View>
        )}

        {recentRests.length > 0 && (
          <CollapsibleSection title="اطلب مرة أخرى" subtitle="من مطاعمك الأخيرة" icon="repeat">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingBottom: 6 }}>
              {recentRests.map((r, i) => <FadeIn key={r.id} delay={stagger(i)} from={12}><HCard r={r} onPress={() => go(r.id)} /></FadeIn>)}
            </ScrollView>
          </CollapsibleSection>
        )}

        {suggested.length > 0 && (
          <CollapsibleSection title={sortBy === 'nearest' ? 'الأقرب إليك' : 'مطاعم مقترحة'} subtitle="مختارة إلك" icon="sparkles">
            <ScrollView
              ref={suggestedRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 14, paddingBottom: 6 }}>
              {suggested.map((r, i) => <FadeIn key={r.id} delay={stagger(i)} from={12}><HCard r={r} onPress={() => go(r.id)} /></FadeIn>)}
            </ScrollView>
          </CollapsibleSection>
        )}

        {topRated.length > 0 && !noMatches && (
          <CollapsibleSection title="الأعلى تقييماً" subtitle="الأكثر حبّاً من الزبائن" icon="star">
            <SectionGrid list={topRated} onPress={go} />
          </CollapsibleSection>
        )}

        {categories.map((cat) => {
          const list = byCat(cat);
          if (list.length === 0) return null;
          return (
            <CollapsibleSection key={cat.id} title={`${cat.icon ? cat.icon + ' ' : ''}${cat.name_ar}`} icon={null} count={list.length}>
              <SectionGrid list={list} onPress={go} />
            </CollapsibleSection>
          );
        })}

        {restaurants.length === 0 && (
          <View style={{ paddingVertical: 30 }}>
            <EmptyState emoji="🍽️" title="ما في مطاعم حاليًا" subtitle="جرّب تسحب للتحديث بعد شوي" ctaLabel="تحديث" onCta={onRefresh} />
          </View>
        )}
      </Animated.ScrollView>

      {MiniHeader}
      <SupportButton />
    </View>
  );
}

/* ── Styles ── */
const hs = StyleSheet.create({
  search: { flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 20, height: 56, paddingHorizontal: 8, gap: 10 },
  searchIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  searchTxt: { flex: 1, fontSize: 14.5, fontWeight: '500', textAlign: 'right' },
  searchFilter: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 22 },
  secHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  secTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 9, flex: 1 },
  secIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  secBar: { width: 4, height: 20, borderRadius: 2 },
  secTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  secSub: { fontSize: 12, fontWeight: '500', textAlign: 'right', marginTop: 1 },
  secCount: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  secChevron: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  moreBtn: { marginTop: 14, marginHorizontal: 16, borderWidth: 1, borderRadius: 16, paddingVertical: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6 },
  moreTxt: { fontWeight: '800', fontSize: 14 },
  svcShadow: { borderRadius: 24, elevation: 8, shadowColor: '#14142B', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  svc: { borderRadius: 24, padding: 14, minHeight: 142, overflow: 'hidden', alignItems: 'flex-end' },
  svcOrb: { position: 'absolute', width: 120, height: 120, borderRadius: 60, top: -50, left: -40, backgroundColor: 'rgba(255,255,255,0.12)' },
  svcBigIcon: { position: 'absolute', bottom: -10, left: -6 },
  svcIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.24)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  svcTag: { position: 'absolute', top: 14, left: 14, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  svcTagTxt: { color: '#FFF', fontSize: 10.5, fontWeight: '800' },
  svcTitle: { color: '#FFF', fontSize: 16.5, fontWeight: '900', textAlign: 'right' },
  svcSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '500', textAlign: 'right', marginTop: 3, lineHeight: 17 },
  svcGo: { position: 'absolute', bottom: 12, left: 12, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
});

const makeRc = (C) => StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.card, borderRadius: 22, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  imgBox: { width: '100%', height: 120, position: 'relative', backgroundColor: C.inputBg },
  img: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },
  badge: { position: 'absolute', top: 8, left: 8, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { color: '#FFF', fontSize: 10.5, fontWeight: '800' },
  ratePill: { position: 'absolute', top: 8, right: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 2, backgroundColor: 'rgba(11,11,18,0.6)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  rateTxt: { fontSize: 11, fontWeight: '800', color: '#FFF' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,18,0.55)', justifyContent: 'center', alignItems: 'center', gap: 2 },
  overlayTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  logoCircle: { position: 'absolute', bottom: -16, right: 10, width: 36, height: 36, borderRadius: 12, borderWidth: 2.5, borderColor: C.card, overflow: 'hidden', backgroundColor: C.card, ...C.shadow.soft },
  logoImg: { width: '100%', height: '100%' },
  body: { paddingHorizontal: 11, paddingTop: 20, paddingBottom: 12 },
  name: { fontSize: 14.5, fontWeight: '800', color: C.text, textAlign: 'right' },
  addr: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', marginTop: 7, gap: 4, alignSelf: 'flex-end', backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  metaTxt: { fontSize: 11.5, color: C.primary, fontWeight: '800' },
});

const makeHc = (C) => StyleSheet.create({
  wrap: { width: 138 },
  imgBox: { width: 138, height: 104, borderRadius: 22, overflow: 'hidden', position: 'relative', backgroundColor: C.inputBg, ...C.shadow.soft },
  img: { width: '100%', height: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  closed: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  closedTxt: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  ratePill: { position: 'absolute', top: 8, right: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  rateTxt: { fontSize: 11, fontWeight: '800', color: '#14142B' },
  logoDot: { position: 'absolute', bottom: 7, left: 7, width: 28, height: 28, borderRadius: 10, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden', backgroundColor: C.card },
  logoImg: { width: '100%', height: '100%' },
  name: { fontSize: 14, fontWeight: '800', color: C.text, textAlign: 'right', marginTop: 8 },
  timeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, marginTop: 2 },
  time: { fontSize: 11.5, color: C.gray, textAlign: 'right', fontWeight: '500' },
});

const makeS = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  heroBg: { ...StyleSheet.absoluteFillObject, bottom: 28, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  locBtn: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 22, paddingVertical: 7, paddingHorizontal: 8 },
  locIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  locCaption: { fontSize: 10.5, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  locTxt: { fontSize: 13.5, fontWeight: '800', color: '#FFF', textAlign: 'right' },
  greetWrap: { marginTop: 18, paddingHorizontal: 2, alignItems: 'flex-end' },
  greetHi: { color: '#FFF', fontSize: 25, fontWeight: '900', textAlign: 'right' },
  greetSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13.5, fontWeight: '500', marginTop: 3, textAlign: 'right' },
  searchDock: { paddingHorizontal: 16, marginTop: 18, marginBottom: -28 },
  mini: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, paddingBottom: 10, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden', ...C.shadow.float },
  miniLoc: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 5, marginHorizontal: 10 },
  miniLocTxt: { color: '#FFF', fontWeight: '800', fontSize: 13.5, flexShrink: 1 },
  catHeader: { flexDirection: 'row-reverse', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  catTitle: { fontSize: 18, fontWeight: '900', color: C.text, textAlign: 'right' },
  catHint: { fontSize: 12, fontWeight: '500', color: C.faint },
  quickCat: { alignItems: 'center', gap: 8, width: 76 },
  quickCircle: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, ...C.shadow.soft },
  quickInner: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickLbl: { fontSize: 12.5, fontWeight: '800', color: C.text, textAlign: 'center' },
  svcRow: { flexDirection: 'row-reverse', gap: 12, paddingHorizontal: 16, marginTop: 24 },
  sortHead: { paddingHorizontal: 16, marginTop: 26, marginBottom: 6, alignItems: 'flex-end' },
});
