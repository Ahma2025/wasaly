import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Animated, Alert, Share, Dimensions, Easing, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useCart, MAX_QTY } from '../context/CartContext';
import ItemCard from '../components/ItemCard';
import PressableScale from '../components/PressableScale';
import { Skeleton, CardRowSkeleton } from '../components/Skeleton';
import CartBar from '../components/CartBar';
import EmptyState from '../components/EmptyState';
import { FadeIn, Press, useBump } from '../components/Anim';
import { BottomSheet, Chip, IconButton, AnimatedNumber } from '../components/UI';
import { useTheme } from '../context/ThemeContext';
import { haptic, isReducedMotion, SPRING, SPRING_POP, EASE_OUT, stagger } from '../utils/motion';

const { width: SW, height: SH } = Dimensions.get('window');
const TABS_H = 54;

// تحويل خيارات الصنف من السيرفر → مجموعات إضافات (مع ids حتى يسعّرها السيرفر من قاعدة البيانات)
const toAddonGroups = (item) => (item.options || []).filter(o => o && o.id).map(o => {
  const max = Math.max(1, parseInt(o.max_selections, 10) || 1);
  return {
    key: String(o.id),
    option_id: o.id,
    name: o.name_ar || o.name_en || '',
    required: !!o.is_required,
    max,
    multi_select: max > 1,
    options: (o.values || []).filter(v => v && v.id).map(v => ({
      id: v.id,
      option_id: o.id,
      name: v.name_ar || v.name_en || '',
      price: parseFloat(v.extra_price || v.price || 0) || 0,
    })),
  };
});

/* صف إضافة بمؤشر اختيار يرتد */
function AddonRow({ opt, selected, multi, onPress, C, styles }) {
  const v = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => { Animated.spring(v, { toValue: selected ? 1 : 0, ...SPRING_POP }).start(); }, [selected]);
  const checkScale = v.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  return (
    <Press onPress={() => { haptic.select(); onPress(); }} haptic={false} scaleTo={0.98}
      accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityLabel={opt.name}
      style={[styles.addonRow, selected && styles.addonRowSelected]}>
      <View style={[styles.addonCheck, !multi && { borderRadius: 12 }, selected && { borderColor: C.primary }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: v, transform: [{ scale: checkScale }] }]}>
          <LinearGradient colors={C.gradients.sunset} style={[StyleSheet.absoluteFill, { borderRadius: multi ? 6 : 12 }]} />
          <Ionicons name="checkmark" size={14} color="#FFF" />
        </Animated.View>
      </View>
      <Text style={[styles.addonName, selected && { fontWeight: '800' }]}>{opt.name}</Text>
      {parseFloat(opt.price || 0) > 0
        ? <Text style={styles.addonPrice}>+{parseFloat(opt.price).toFixed(2)}₪</Text>
        : <Text style={[styles.addonPrice, { color: C.faint, fontWeight: '500' }]}>مجاناً</Text>}
    </Press>
  );
}

/* عدّاد كمية بارتداد الرقم */
function QtyStepper({ qty, setQty, C, styles }) {
  const bump = useBump(qty, 1.3);
  const change = (d) => {
    const next = Math.max(1, Math.min(MAX_QTY, qty + d));
    if (next === qty) { haptic.warning(); return; }
    haptic.select();
    setQty(next);
  };
  return (
    <View style={styles.qtyRow}>
      <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: C.card }]} onPress={() => change(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="زيادة الكمية">
        <Ionicons name="add" size={20} color={C.primary} />
      </TouchableOpacity>
      <Animated.Text style={[styles.qtyValue, bump]} accessibilityLabel={`الكمية ${qty}`}>{qty}</Animated.Text>
      <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: qty <= 1 ? 'transparent' : C.card }]} onPress={() => change(-1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="إنقاص الكمية">
        <Ionicons name="remove" size={20} color={qty <= 1 ? C.faint : C.primary} />
      </TouchableOpacity>
    </View>
  );
}

/* طيران صورة الصنف نحو شريط السلة */
function FlyToCart({ shot, onDone, bottomInset, C }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shot) return;
    if (isReducedMotion()) { onDone(); return; }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 650, easing: Easing.bezier(0.5, 0, 0.3, 1), useNativeDriver: true }).start(() => onDone());
  }, [shot?.k]);
  if (!shot) return null;
  const startX = SW / 2 - 28, startY = SH * 0.62;
  const endX = SW - 16 - 14 - 42, endY = SH - bottomInset - 16 - 56;
  const tx = v.interpolate({ inputRange: [0, 1], outputRange: [startX, endX] });
  const ty = v.interpolate({ inputRange: [0, 0.35, 1], outputRange: [startY, startY - 110, endY] });
  const sc = v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.1, 0.35] });
  const op = v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={[fly.wrap, C.shadow.float, { opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }]}>
      {shot.image
        ? <Image source={{ uri: shot.image }} style={fly.img} />
        : <LinearGradient colors={C.gradients.sunset} style={[fly.img, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="fast-food" size={24} color="#FFF" /></LinearGradient>}
    </Animated.View>
  );
}
const fly = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: '#FFF', overflow: 'hidden', zIndex: 50 },
  img: { width: '100%', height: '100%' },
});

export default function RestaurantScreen() {
  const route = useRoute();
  const id = route.params?.restaurantId;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const { addItem, count, total, clearAndAdd } = useCart();
  const groupId = route.params?.groupId;      // وضع الطلب الجماعي (إن وُجد)
  const groupCode = route.params?.groupCode;
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sheetItem, setSheetItem] = useState(null); // يبقى معروض أثناء حركة الإغلاق
  const [selectedAddons, setSelectedAddons] = useState({});
  const [qty, setQty] = useState(1);
  const [dietFilter, setDietFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [flyShot, setFlyShot] = useState(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const tabsRef = useRef(null);
  const stickyTabsRef = useRef(null);
  const sectionY = useRef({});
  const menuY = useRef(0);
  const [tabsY, setTabsY] = useState(0);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const lockSpy = useRef(0);
  const tabLayouts = useRef({});
  const indX = useRef(new Animated.Value(0)).current;
  const indW = useRef(new Animated.Value(0)).current;
  const heartV = useRef(new Animated.Value(1)).current;

  const TOP_BAR = insets.top + 56;
  const COVER_H = 250 + insets.top * 0.4;

  useEffect(() => {
    if (!id) { navigation.goBack(); return; }
    (async () => {
      const cached = await readCache('rest_' + id);
      if (cached?.restaurant) {
        // نعيد بناء مجموعات الإضافات من البيانات الخام (الكاش القديم ما كان فيه ids)
        const m = (cached.menu || []).map(cat => ({ ...cat, items: (cat.items || []).map(it => ({ ...it, addon_groups: toAddonGroups(it) })) }));
        setRestaurant(cached.restaurant); setMenu(m); setLoading(false);
      }
      fetchRestaurant();
    })();
  }, [id]);

  useEffect(() => { if (selectedItem) setSheetItem(selectedItem); }, [selectedItem]);

  const fetchRestaurant = async () => {
    setError(null);
    try {
      const data = await api.get(`/restaurants/${id}`);
      const r = data.data;
      if (!r) throw { message: 'المطعم غير موجود' };
      const m = (r.menu || []).map(cat => ({
        ...cat,
        items: (cat.items || []).map(item => ({ ...item, addon_groups: toAddonGroups(item) })),
      }));
      setRestaurant(r);
      setMenu(m);
      if (typeof r.is_favorite !== 'undefined') setIsFavorite(!!r.is_favorite);
      writeCache('rest_' + id, { restaurant: r, menu: m });
    } catch (e) {
      setError(e?.message === 'Network error' ? 'تعذّر الاتصال — تأكد من الإنترنت' : (e?.message || 'تعذّر تحميل المطعم'));
    } finally { setLoading(false); }
  };

  const openItem = (item) => {
    if (restaurant && !restaurant.is_open) {
      haptic.warning();
      Alert.alert('المطعم مغلق', 'المطعم مغلق حالياً ولا يستقبل طلبات. جرّب لاحقاً 🕐');
      return;
    }
    haptic.light();
    setSelectedItem(item); setSelectedAddons({}); setQty(1);
  };

  const itemBasePrice = (it) => parseFloat(it?.discount_price || it?.price || 0);

  const toggleAddon = (group, addon) => {
    setSelectedAddons(prev => {
      const current = prev[group.key] || [];
      const exists = current.find(a => a.id === addon.id);
      if (group.multi_select) {
        if (exists) return { ...prev, [group.key]: current.filter(a => a.id !== addon.id) };
        if (current.length >= group.max) {
          haptic.warning();
          Alert.alert('الحد الأقصى', `تقدر تختار ${group.max} كحد أقصى من "${group.name}"`);
          return prev;
        }
        return { ...prev, [group.key]: [...current, addon] };
      }
      // اختيار واحد: الضغط مرة ثانية يلغي الاختيار (إذا مش مطلوب)
      if (exists && !group.required) return { ...prev, [group.key]: [] };
      return { ...prev, [group.key]: [addon] };
    });
  };

  const getAddonPrice = () => Object.values(selectedAddons).reduce((s, g) => s + g.reduce((x, a) => x + (parseFloat(a.price) || 0), 0), 0);

  const createGroup = async () => {
    try {
      const r = await api.post('/group-orders', { restaurant_id: restaurant.id, restaurant_name: restaurant.name_ar });
      const g = r.data || r;
      navigation.navigate('GroupOrder', { code: g.code });
    } catch { Alert.alert('خطأ', 'تعذّر بدء المجموعة، حاول مرة ثانية'); }
  };

  const confirmAddItem = async () => {
    if (!selectedItem || adding) return;
    const groups = selectedItem.addon_groups || [];
    const missing = groups.find(g => g.required && !(selectedAddons[g.key] && selectedAddons[g.key].length > 0));
    if (missing) {
      haptic.warning();
      Alert.alert('اختيار مطلوب', `الرجاء اختيار "${missing.name}" قبل الإضافة`);
      return;
    }
    const addonsFlat = groups.flatMap(g => (selectedAddons[g.key] || []).map(a => ({ group: g.name, id: a.id, option_id: a.option_id, name: a.name, price: a.price })));
    if (groupId) {
      setAdding(true);
      try {
        await api.post(`/group-orders/${groupId}/items`, {
          menu_item_id: selectedItem.id,
          name: selectedItem.name_ar,
          image: selectedItem.image,
          price: itemBasePrice(selectedItem),
          quantity: qty,
          options: addonsFlat,
        });
        haptic.success();
        setSelectedItem(null);
      } catch (e) { Alert.alert('خطأ', e?.message || 'تعذّر إضافة الصنف للمجموعة'); }
      finally { setAdding(false); }
      return;
    }
    // نخزّن السعر الأساسي فقط؛ الإضافات تُحسب مرة واحدة في CartContext (تجنّب الحساب المزدوج)
    const { addon_groups, options, ...base } = selectedItem;
    const itemWithAddons = { ...base, addons: addonsFlat };
    const result = addItem(itemWithAddons, restaurant, qty);
    if (result?.conflict) {
      Alert.alert('مطعم مختلف', `سلتك فيها أصناف من ${result.restaurant || 'مطعم آخر'}. بدك تفرّغها وتبدأ من هون؟`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'نعم، ابدأ من جديد', style: 'destructive', onPress: () => { clearAndAdd(itemWithAddons, restaurant, qty); setSelectedItem(null); setFlyShot({ k: Date.now(), image: selectedItem.image }); } },
      ]);
    } else {
      haptic.success();
      setSelectedItem(null);
      setFlyShot({ k: Date.now(), image: selectedItem.image });
    }
  };

  const toggleFavorite = async () => {
    const next = !isFavorite;
    setIsFavorite(next);
    if (next) haptic.success(); else haptic.light();
    if (!isReducedMotion()) {
      Animated.sequence([
        Animated.spring(heartV, { toValue: 1.45, ...SPRING_POP, stiffness: 400 }),
        Animated.spring(heartV, { toValue: 1, ...SPRING_POP }),
      ]).start();
    }
    try {
      if (next) await api.post(`/users/favorites/${id}`);
      else await api.delete(`/users/favorites/${id}`);
    } catch { setIsFavorite(!next); }
  };

  const share = () => Share.share({ message: `جرّب ${restaurant?.name_ar || ''} على تطبيق وصلّي 🛵` }).catch(() => {});
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'الرئيسية' }));

  /* ═══ القوائم المعروضة حسب الفلتر ═══ */
  const passes = (item) => dietFilter === 'all'
    || (dietFilter === 'spicy' && item.is_spicy)
    || (dietFilter === 'veg' && item.is_vegetarian)
    || (dietFilter === 'offers' && parseFloat(item.discount_price) > 0);
  const sections = menu.map((cat, idx) => ({ cat, idx, items: (cat.items || []).filter(passes) }));
  const visibleSections = sections.filter(sct => sct.items.length > 0);

  /* ═══ مؤشر التبويب المتحرّك ═══ */
  const moveIndicator = (idx, animated = true) => {
    const l = tabLayouts.current[idx];
    if (!l) return;
    if (!animated || isReducedMotion()) { indX.setValue(l.x); indW.setValue(l.width); }
    else {
      Animated.parallel([
        Animated.spring(indX, { toValue: l.x, damping: 18, stiffness: 220, mass: 0.9, useNativeDriver: false }),
        Animated.spring(indW, { toValue: l.width, damping: 18, stiffness: 220, mass: 0.9, useNativeDriver: false }),
      ]).start();
    }
    const scrollTo = Math.max(0, l.x - SW / 2 + l.width / 2);
    stickyTabsRef.current?.scrollTo({ x: scrollTo, animated });
    tabsRef.current?.scrollTo({ x: scrollTo, animated });
  };
  useEffect(() => { moveIndicator(activeCategory); }, [activeCategory]);

  const onTabPress = (idx) => {
    haptic.select();
    setActiveCategory(idx);
    const y = sectionY.current[idx];
    if (y != null) {
      lockSpy.current = Date.now() + 650;
      scrollRef.current?.scrollTo({ y: Math.max(0, menuY.current + y - TOP_BAR - TABS_H - 6), animated: true });
    }
  };

  // متابعة القسم الظاهر أثناء التمرير (scroll-spy) + إظهار التبويبات اللاصقة
  const onScrollJS = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    const isStuck = tabsY > 0 && y >= tabsY - TOP_BAR;
    if (isStuck !== stuckRef.current) { stuckRef.current = isStuck; setStuck(isStuck); }
    if (Date.now() < lockSpy.current) return;
    const probe = y + TOP_BAR + TABS_H + 24 - menuY.current;
    let cur = visibleSections[0]?.idx ?? 0;
    for (const sct of visibleSections) {
      const sy = sectionY.current[sct.idx];
      if (sy != null && sy <= probe) cur = sct.idx;
    }
    if (cur !== activeCategory) setActiveCategory(cur);
  };

  /* ═══ حركات الغلاف والهيدر ═══ */
  const coverTranslate = scrollY.interpolate({ inputRange: [-200, 0, COVER_H], outputRange: [0, 0, -COVER_H * 0.45], extrapolate: 'clamp' });
  const coverScale = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [1.6, 1], extrapolate: 'clamp' });
  const coverFade = scrollY.interpolate({ inputRange: [0, COVER_H - TOP_BAR], outputRange: [1, 0.3], extrapolate: 'clamp' });
  const barOpacity = scrollY.interpolate({ inputRange: [COVER_H - TOP_BAR - 70, COVER_H - TOP_BAR - 10], outputRange: [0, 1], extrapolate: 'clamp' });
  const titleShift = scrollY.interpolate({ inputRange: [COVER_H - TOP_BAR - 70, COVER_H - TOP_BAR - 10], outputRange: [10, 0], extrapolate: 'clamp' });
  const stickyOpacity = tabsY > 0
    ? scrollY.interpolate({ inputRange: [tabsY - TOP_BAR - 1, tabsY - TOP_BAR], outputRange: [0, 1], extrapolate: 'clamp' })
    : 0;

  const TopButtons = (
    <View style={[styles.topBar, { paddingTop: insets.top + 6, height: TOP_BAR }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: barOpacity }]} pointerEvents="none">
        <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={COLORS.gradients.sheen} style={[StyleSheet.absoluteFill, { height: 40 }]} />
      </Animated.View>
      <TouchableOpacity style={styles.roundBtn} onPress={goBack} accessibilityRole="button" accessibilityLabel="رجوع">
        <Ionicons name="arrow-forward" size={21} color="#FFF" />
      </TouchableOpacity>
      <Animated.Text style={[styles.topTitle, { opacity: barOpacity, transform: [{ translateY: titleShift }] }]} numberOfLines={1}>{restaurant?.name_ar || ''}</Animated.Text>
      {restaurant ? (
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <TouchableOpacity style={styles.roundBtn} onPress={share} accessibilityRole="button" accessibilityLabel="مشاركة المطعم">
            <Ionicons name="share-social-outline" size={19} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.roundBtn} onPress={toggleFavorite} accessibilityRole="button" accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}>
            <Animated.View style={{ transform: [{ scale: heartV }] }}>
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? '#FF4D5E' : '#FFF'} />
            </Animated.View>
          </TouchableOpacity>
        </View>
      ) : <View style={{ width: 40 }} />}
    </View>
  );

  if (loading && !restaurant) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Skeleton w={'100%'} h={COVER_H} r={0} />
      <View style={[styles.infoCard, { marginTop: -40 }]}>
        <Skeleton w={76} h={76} r={22} />
        <View style={{ flex: 1, gap: 8, alignItems: 'flex-end', marginRight: 12 }}><Skeleton w={'60%'} h={18} /><Skeleton w={'80%'} h={12} /><Skeleton w={'50%'} h={12} /></View>
      </View>
      <View style={{ flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 16, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => <Skeleton key={i} w={80} h={36} r={18} />)}
      </View>
      <View style={{ paddingHorizontal: 16 }}>{[0, 1, 2].map(i => <CardRowSkeleton key={i} />)}</View>
      {TopButtons}
    </View>
  );

  if (!restaurant) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <LinearGradient colors={COLORS.gradients.sunset} style={{ height: TOP_BAR }} />
      <EmptyState emoji="😕" title="تعذّر فتح المطعم" subtitle={error || 'حاول مرة ثانية بعد شوي'}
        ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchRestaurant(); }} />
      <TouchableOpacity onPress={goBack} style={{ alignSelf: 'center', marginBottom: insets.bottom + 30 }} accessibilityRole="button">
        <Text style={{ color: COLORS.gray, fontWeight: '700', fontSize: 14 }}>رجوع</Text>
      </TouchableOpacity>
      {TopButtons}
    </View>
  );

  const rating = Number(restaurant.rating) || 0;
  const DIETS = [
    { k: 'all', l: 'الكل', icon: 'apps' },
    { k: 'offers', l: 'عروض', icon: 'pricetag' },
    { k: 'spicy', l: 'حار', emoji: '🌶️' },
    { k: 'veg', l: 'نباتي', icon: 'leaf' },
  ];

  // شريط تبويبات الأقسام (يُرسم مرتين: داخل الصفحة + لاصق بالأعلى)
  const renderTabs = (ref, isSticky) => (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsContent} accessibilityRole="tablist">
      <View style={{ flexDirection: 'row-reverse' }}>
        {/* المؤشر: حبّة متدرّجة خلف التبويب النشط */}
        <Animated.View pointerEvents="none" style={[styles.indicator, { width: indW, transform: [{ translateX: indX }] }]}>
          <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {menu.map((cat, idx) => {
          const on = activeCategory === idx;
          const has = sections[idx]?.items.length > 0;
          return (
            <TouchableOpacity key={cat.id ?? idx} activeOpacity={0.75} onPress={() => has && onTabPress(idx)}
              onLayout={isSticky ? undefined : (e) => {
                tabLayouts.current[idx] = e.nativeEvent.layout;
                if (idx === activeCategory) moveIndicator(idx, false);
              }}
              style={[styles.catTab, !has && { opacity: 0.35 }]} accessibilityRole="tab" accessibilityState={{ selected: on, disabled: !has }}>
              <Text style={[styles.catTabText, on && styles.catTabTextActive]} numberOfLines={1}>{cat.name_ar}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const cartVisible = !groupId && count > 0;
  const sheetTotal = (itemBasePrice(sheetItem) + getAddonPrice()) * qty;
  const requiredLeft = (sheetItem?.addon_groups || []).filter(g => g.required && !((selectedAddons[g.key] || []).length)).length;

  return (
    <View style={styles.container}>
      {/* الغلاف (بارالاكس + تكبير عند السحب للأسفل) */}
      <Animated.View style={[styles.cover, { height: COVER_H, opacity: coverFade, transform: [{ translateY: coverTranslate }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: coverScale }] }]}>
          {restaurant.cover_image ? (
            <Image source={{ uri: restaurant.cover_image }} style={styles.coverImg} resizeMode="cover" />
          ) : restaurant.logo ? (
            <View style={styles.logoBg}>
              <Image source={{ uri: restaurant.logo }} style={styles.coverImg} resizeMode="cover" blurRadius={10} />
              <View style={styles.logoBgOverlay} />
            </View>
          ) : (
            <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.logoBg, { justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="restaurant" size={72} color="rgba(255,255,255,0.35)" />
            </LinearGradient>
          )}
        </Animated.View>
        <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.45)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: onScrollJS })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: COVER_H - 56 }}
      >
        <FadeIn from={24}>
          <View style={styles.infoCard}>
            {restaurant.logo
              ? <Image source={{ uri: restaurant.logo }} style={styles.logo} />
              : <LinearGradient colors={COLORS.gradients.sunset} style={[styles.logo, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="restaurant" size={30} color="#FFF" /></LinearGradient>}
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                <Text style={styles.name} numberOfLines={2}>{restaurant.name_ar}</Text>
                <View style={[styles.openPill, { backgroundColor: restaurant.is_open ? COLORS.successBg : COLORS.dangerBg }]}>
                  <View style={[styles.openDot, { backgroundColor: restaurant.is_open ? COLORS.green : COLORS.red }]} />
                  <Text style={[styles.openTxt, { color: restaurant.is_open ? COLORS.successText : COLORS.red }]}>{restaurant.is_open ? 'مفتوح' : 'مغلق'}</Text>
                </View>
              </View>
              {!!restaurant.description_ar && <Text style={styles.desc} numberOfLines={2}>{restaurant.description_ar}</Text>}
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={styles.statTop}><Ionicons name="star" size={15} color="#FFB020" /><Text style={styles.statVal}>{rating.toFixed(1)}</Text></View>
              <Text style={styles.statLbl}>التقييم</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statBox}>
              <View style={styles.statTop}><Ionicons name="time" size={15} color={COLORS.primary} /><Text style={styles.statVal}>{restaurant.delivery_time_min || 20}-{restaurant.delivery_time_max || 45}</Text></View>
              <Text style={styles.statLbl}>دقيقة</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.statBox}>
              <View style={styles.statTop}><Ionicons name="bicycle" size={16} color={COLORS.primary} /><Text style={[styles.statVal, { fontSize: 13 }]}>حسب المسافة</Text></View>
              <Text style={styles.statLbl}>التوصيل</Text>
            </View>
          </View>
          {parseFloat(restaurant.min_order) > 0 && (
            <View style={styles.minOrderRow}>
              <Ionicons name="information-circle" size={15} color={COLORS.primary} />
              <Text style={styles.minOrder}>الحد الأدنى للطلب: {parseFloat(restaurant.min_order).toFixed(0)}₪ · توصيل مجاني فوق 50₪</Text>
            </View>
          )}
        </FadeIn>

        {!!error && (
          <TouchableOpacity style={[styles.notice, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]} onPress={fetchRestaurant} accessibilityRole="button">
            <Ionicons name="cloud-offline-outline" size={16} color={COLORS.text} />
            <Text style={[styles.noticeTxt, { color: COLORS.text }]}>معروض من آخر تحديث — اضغط للتحديث</Text>
          </TouchableOpacity>
        )}

        {!restaurant.is_open && (
          <View style={[styles.notice, { backgroundColor: COLORS.dangerBg, borderColor: COLORS.dangerBorder }]}>
            <Ionicons name="lock-closed" size={16} color={COLORS.red} />
            <Text style={[styles.noticeTxt, { color: COLORS.red }]}>المطعم مغلق حالياً — لا يستقبل طلبات</Text>
          </View>
        )}

        {/* 👥 الطلب الجماعي */}
        {groupId ? (
          <Press style={styles.groupModeBanner} onPress={() => navigation.navigate('GroupOrder', { code: groupCode })} accessibilityRole="button">
            <LinearGradient colors={COLORS.gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Ionicons name="people" size={16} color="#FFF" />
            <Text style={styles.groupModeTxt}>أنت تضيف لمجموعة {groupCode} — اضغط للرجوع</Text>
          </Press>
        ) : restaurant.is_open ? (
          <Press style={styles.groupCta} onPress={createGroup} scaleTo={0.97} accessibilityRole="button" accessibilityLabel="ابدأ طلب جماعي">
            <LinearGradient colors={COLORS.gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.groupIcon}>
              <Ionicons name="people" size={20} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupCtaTitle}>اطلبوا سوا — كل واحد يشوف حسابه</Text>
              <Text style={styles.groupCtaSub}>افتح مجموعة، وكل واحد يزيد أكله من موبايله</Text>
            </View>
            <Ionicons name="chevron-back" size={18} color={COLORS.faint} />
          </Press>
        ) : null}

        {/* فلاتر */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8, paddingTop: 6, paddingBottom: 12 }}>
          {DIETS.map(f => (
            <Chip key={f.k} size="sm" icon={f.icon} emoji={f.emoji} label={f.l} selected={dietFilter === f.k} onPress={() => setDietFilter(f.k)} />
          ))}
        </ScrollView>

        {/* تبويبات الأقسام (داخل الصفحة) */}
        {menu.length > 0 && (
          <View style={styles.tabsBar} onLayout={e => setTabsY(e.nativeEvent.layout.y)}>
            {renderTabs(tabsRef, false)}
          </View>
        )}

        {menu.length === 0 ? (
          <View style={styles.noItems}>
            <View style={styles.noItemsIcon}><Ionicons name="document-text-outline" size={34} color={COLORS.primary} /></View>
            <Text style={styles.noItemsTxt}>المنيو قيد التجهيز — رجّع بعد شوي</Text>
          </View>
        ) : visibleSections.length === 0 ? (
          <View style={styles.noItems}>
            <View style={styles.noItemsIcon}><Ionicons name="funnel-outline" size={32} color={COLORS.primary} /></View>
            <Text style={styles.noItemsTxt}>ما في أصناف بهالفلتر</Text>
            <TouchableOpacity onPress={() => setDietFilter('all')} accessibilityRole="button"><Text style={{ color: COLORS.primary, fontWeight: '800', marginTop: 4 }}>عرض الكل</Text></TouchableOpacity>
          </View>
        ) : (
          <View onLayout={e => { menuY.current = e.nativeEvent.layout.y; }}>
            {visibleSections.map(({ cat, idx, items }) => (
              <View key={cat.id ?? idx} style={styles.menuSection} onLayout={e => { sectionY.current[idx] = e.nativeEvent.layout.y; }}>
                <View style={styles.catTitleRow}>
                  <Text style={styles.catTitle}>{cat.name_ar}</Text>
                  <View style={styles.catCountPill}><Text style={styles.catCountTxt}>{items.length}</Text></View>
                </View>
                {items.map((item, i) => (
                  <FadeIn key={item.id} delay={idx === visibleSections[0].idx ? stagger(i) : 0} from={16}>
                    <ItemCard item={item} onAdd={() => openItem(item)} onPress={() => openItem(item)} />
                  </FadeIn>
                ))}
              </View>
            ))}
          </View>
        )}
      </Animated.ScrollView>

      {/* التبويبات اللاصقة تحت الهيدر */}
      {menu.length > 0 && tabsY > 0 && (
        <Animated.View pointerEvents={stuck ? 'auto' : 'none'} style={[styles.stickyTabs, { top: TOP_BAR, opacity: stickyOpacity }]}>
          {renderTabs(stickyTabsRef, true)}
        </Animated.View>
      )}

      {TopButtons}

      {groupId ? (
        <Pressable style={[styles.groupReturnBar, { paddingBottom: insets.bottom + 16 }]} onPress={() => navigation.navigate('GroupOrder', { code: groupCode })} accessibilityRole="button">
          <LinearGradient colors={COLORS.gradients.violet} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.groupReturnTxt}>خلّصت؟ ارجع للمجموعة</Text>
        </Pressable>
      ) : cartVisible && <CartBar count={count} total={total} onPress={() => navigation.navigate('Main', { screen: 'سلتي' })} />}

      <FlyToCart shot={flyShot} onDone={() => setFlyShot(null)} bottomInset={insets.bottom} C={COLORS} />

      {/* شيت الصنف */}
      <BottomSheet visible={!!selectedItem} onClose={() => setSelectedItem(null)} maxHeight={0.9} scrollable
        footer={(
          <View style={styles.sheetFooter}>
            <QtyStepper qty={qty} setQty={setQty} C={COLORS} styles={styles} />
            <PressableScale style={[styles.addBtn, { flex: 1 }, adding && { opacity: 0.7 }]} onPress={confirmAddItem} disabled={adding}>
              <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtnGrad}>
                <LinearGradient colors={COLORS.gradients.sheen} style={styles.addSheen} pointerEvents="none" />
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={groupId ? 'people' : 'bag-add'} size={18} color="#FFF" />
                  <Text style={styles.addBtnText}>{adding ? 'جاري الإضافة…' : groupId ? 'أضف للمجموعة' : 'إضافة للسلة'}</Text>
                </View>
                <AnimatedNumber value={sheetTotal} suffix="₪" style={styles.addBtnPrice} />
              </LinearGradient>
            </PressableScale>
          </View>
        )}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }} bounces={false}>
          {sheetItem?.image ? (
            <View style={styles.sheetHeroWrap}>
              <Image source={{ uri: sheetItem.image }} style={styles.sheetHeroImg} />
              <LinearGradient colors={['transparent', 'rgba(10,10,20,0.35)']} style={styles.sheetHeroScrim} />
            </View>
          ) : null}
          <View style={styles.sheetTitleBlock}>
            <View style={styles.sheetTitleRow}>
              <Text style={styles.sheetItemName}>{sheetItem?.name_ar}</Text>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={styles.sheetItemPrice}>{itemBasePrice(sheetItem).toFixed(2)}₪</Text>
                {sheetItem?.discount_price && parseFloat(sheetItem.discount_price) < parseFloat(sheetItem.price) ? (
                  <Text style={styles.sheetItemPriceOld}>{parseFloat(sheetItem.price).toFixed(2)}₪</Text>
                ) : null}
              </View>
            </View>
            {sheetItem?.description_ar ? <Text style={styles.sheetItemDesc}>{sheetItem.description_ar}</Text> : null}
            {requiredLeft > 0 && (
              <View style={styles.reqHint}>
                <Ionicons name="alert-circle" size={14} color={COLORS.primary} />
                <Text style={styles.reqHintTxt}>{requiredLeft === 1 ? 'في اختيار مطلوب واحد' : `في ${requiredLeft} اختيارات مطلوبة`}</Text>
              </View>
            )}
          </View>

          {sheetItem?.addon_groups?.map((group) => {
            const picked = (selectedAddons[group.key] || []).length;
            const done = group.required && picked > 0;
            return (
              <View key={group.key} style={styles.addonGroup}>
                <View style={styles.addonGroupHeader}>
                  <Text style={styles.addonGroupTitle}>{group.name}</Text>
                  <View style={[styles.addonGroupSub, group.required && picked === 0 && { backgroundColor: COLORS.tint }, done && { backgroundColor: COLORS.successBg }]}>
                    {done && <Ionicons name="checkmark-circle" size={12} color={COLORS.successText} />}
                    <Text style={[styles.addonGroupSubTxt, group.required && picked === 0 && { color: COLORS.primary }, done && { color: COLORS.successText }]}>
                      {group.required ? 'مطلوب' : 'اختياري'} · {group.multi_select ? `حتى ${group.max} (${picked}/${group.max})` : 'اختيار واحد'}
                    </Text>
                  </View>
                </View>
                {group.options?.map((opt) => (
                  <AddonRow key={opt.id} opt={opt} multi={group.multi_select} C={COLORS} styles={styles}
                    selected={!!(selectedAddons[group.key] || []).find(a => a.id === opt.id)}
                    onPress={() => toggleAddon(group, opt)} />
                ))}
              </View>
            );
          })}

          {(!sheetItem?.addon_groups || sheetItem.addon_groups.length === 0) && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: COLORS.gray, fontSize: 14, fontWeight: '500' }}>لا توجد إضافات لهذه الوجبة</Text>
            </View>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  logoBg: { width: '100%', height: '100%', backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  logoBgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10, zIndex: 20, overflow: 'hidden' },
  topTitle: { flex: 1, color: '#FFF', fontSize: 16.5, fontWeight: '900', textAlign: 'center' },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  infoCard: { backgroundColor: C.card, marginHorizontal: 16, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 16, paddingBottom: 12, flexDirection: 'row-reverse', alignItems: 'center' },
  logo: { width: 76, height: 76, borderRadius: 22, borderWidth: 3, borderColor: C.card, backgroundColor: C.inputBg, marginTop: -44, ...C.shadow.card },
  name: { fontSize: 20, fontWeight: '900', color: C.text, textAlign: 'right', flexShrink: 1 },
  desc: { fontSize: 13, color: C.gray, marginTop: 3, textAlign: 'right', fontWeight: '500', lineHeight: 19 },
  openPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openTxt: { fontSize: 11, fontWeight: '800' },
  statsRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.card, marginHorizontal: 16, paddingHorizontal: 8, paddingBottom: 14, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, ...C.shadow.card },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 16, paddingVertical: 10, marginHorizontal: 4 },
  statTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  statVal: { fontSize: 15, fontWeight: '900', color: C.text },
  statLbl: { fontSize: 11, fontWeight: '500', color: C.faint, marginTop: 2 },
  statSep: { width: 0 },
  minOrderRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginHorizontal: 16, marginTop: 12, backgroundColor: C.tint, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  minOrder: { fontSize: 12, color: C.primary, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  notice: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1 },
  noticeTxt: { fontWeight: '800', fontSize: 13.5 },
  groupCta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: C.card, marginHorizontal: 16, marginTop: 12, borderRadius: 20, padding: 12, borderWidth: 1, borderColor: C.border, ...C.shadow.soft },
  groupIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  groupCtaTitle: { fontSize: 14, fontWeight: '900', color: C.text, textAlign: 'right' },
  groupCtaSub: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  groupModeBanner: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, borderRadius: 16, paddingVertical: 12, overflow: 'hidden' },
  groupModeTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  groupReturnBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 16, overflow: 'hidden', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  groupReturnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  tabsBar: { height: TABS_H, backgroundColor: C.bg, justifyContent: 'center' },
  stickyTabs: { position: 'absolute', left: 0, right: 0, height: TABS_H, backgroundColor: C.card, justifyContent: 'center', zIndex: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, ...C.shadow.soft },
  tabsContent: { paddingHorizontal: 12, alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' },
  catTab: { paddingHorizontal: 16, height: 38, justifyContent: 'center', borderRadius: 19, zIndex: 2 },
  catTabText: { fontSize: 13.5, color: C.sub, fontWeight: '700' },
  catTabTextActive: { color: '#FFF', fontWeight: '800' },
  indicator: { position: 'absolute', left: 0, height: 38, borderRadius: 19, overflow: 'hidden', zIndex: 1, ...C.shadow.glow },
  menuSection: { paddingHorizontal: 16, paddingTop: 18 },
  catTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 12 },
  catTitle: { fontSize: 19, fontWeight: '900', color: C.text, textAlign: 'right' },
  catCountPill: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2 },
  catCountTxt: { fontSize: 12, fontWeight: '800', color: C.primary },
  noItems: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  noItemsIcon: { width: 76, height: 76, borderRadius: 26, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  noItemsTxt: { fontSize: 14, color: C.gray, fontWeight: '700' },
  sheetHeroWrap: { marginHorizontal: 16, height: 200, borderRadius: 24, overflow: 'hidden', position: 'relative', backgroundColor: C.inputBg },
  sheetHeroImg: { width: '100%', height: '100%' },
  sheetHeroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  sheetTitleBlock: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  sheetTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sheetItemName: { fontSize: 20, fontWeight: '900', color: C.text, flex: 1, textAlign: 'right' },
  sheetItemDesc: { fontSize: 13.5, color: C.gray, marginTop: 6, lineHeight: 21, textAlign: 'right', fontWeight: '500' },
  sheetItemPrice: { fontSize: 19, fontWeight: '900', color: C.primary },
  sheetItemPriceOld: { fontSize: 13, color: C.faint, textDecorationLine: 'line-through', marginTop: 1 },
  reqHint: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-end', backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  reqHintTxt: { color: C.primary, fontSize: 12, fontWeight: '800' },
  addonGroup: { paddingHorizontal: 16, paddingTop: 16 },
  addonGroupHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addonGroupTitle: { fontSize: 15.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  addonGroupSub: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: C.inputBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  addonGroupSubTxt: { fontSize: 11, color: C.gray, fontWeight: '700' },
  addonRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 16, marginBottom: 8, backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: 'transparent' },
  addonRowSelected: { backgroundColor: C.tint, borderColor: C.primary },
  addonCheck: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.border, marginLeft: 12, overflow: 'hidden', backgroundColor: C.card },
  addonName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '500', textAlign: 'right' },
  addonPrice: { fontSize: 13, color: C.primary, fontWeight: '800' },
  sheetFooter: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  qtyRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 18, padding: 4, gap: 2 },
  qtyBtn: { width: 40, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qtyValue: { minWidth: 30, textAlign: 'center', fontSize: 18, fontWeight: '900', color: C.text, fontVariant: ['tabular-nums'] },
  addBtn: { borderRadius: 18, overflow: 'hidden', ...C.shadow.float },
  addBtnGrad: { height: 54, paddingHorizontal: 16, borderRadius: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden' },
  addSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 27 },
  addBtnText: { color: '#FFF', fontSize: 15.5, fontWeight: '900' },
  addBtnPrice: { color: '#FFF', fontSize: 16, fontWeight: '900' },
});
