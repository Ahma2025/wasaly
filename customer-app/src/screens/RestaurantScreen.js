import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Animated, Alert, Modal, Pressable, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useCart, MAX_QTY } from '../context/CartContext';
import ItemCard from '../components/ItemCard';
import PressableScale from '../components/PressableScale';
import { Skeleton, GridSkeleton } from '../components/Skeleton';
import CartBar from '../components/CartBar';
import EmptyState from '../components/EmptyState';
import { FadeIn } from '../components/Anim';
import { useTheme } from '../context/ThemeContext';

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
  const [selectedAddons, setSelectedAddons] = useState({});
  const [qty, setQty] = useState(1);
  const [dietFilter, setDietFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const TOP_BAR = insets.top + 56;
  const COVER_H = 230 + insets.top * 0.4;

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
      Alert.alert('المطعم مغلق', 'المطعم مغلق حالياً ولا يستقبل طلبات. جرّب لاحقاً 🕐');
      return;
    }
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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
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
        { text: 'نعم، ابدأ من جديد', style: 'destructive', onPress: () => { clearAndAdd(itemWithAddons, restaurant, qty); setSelectedItem(null); } },
      ]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSelectedItem(null);
    }
  };

  const toggleFavorite = async () => {
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      if (next) await api.post(`/users/favorites/${id}`);
      else await api.delete(`/users/favorites/${id}`);
    } catch { setIsFavorite(!next); }
  };

  const share = () => Share.share({ message: `جرّب ${restaurant?.name_ar || ''} على تطبيق وصلّي 🛵` }).catch(() => {});
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main', { screen: 'الرئيسية' }));

  const coverHeight = scrollY.interpolate({ inputRange: [0, COVER_H - TOP_BAR], outputRange: [COVER_H, TOP_BAR], extrapolate: 'clamp' });
  const coverScale = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.35, 1], extrapolate: 'clamp' });
  const barOpacity = scrollY.interpolate({ inputRange: [COVER_H - TOP_BAR - 50, COVER_H - TOP_BAR], outputRange: [0, 1], extrapolate: 'clamp' });

  const TopButtons = (
    <View style={[styles.topBar, { paddingTop: insets.top + 6, height: TOP_BAR }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: barOpacity }]} pointerEvents="none">
        <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <TouchableOpacity style={styles.roundBtn} onPress={goBack} accessibilityRole="button" accessibilityLabel="رجوع">
        <Ionicons name="arrow-forward" size={21} color="#FFF" />
      </TouchableOpacity>
      <Animated.Text style={[styles.topTitle, { opacity: barOpacity }]} numberOfLines={1}>{restaurant?.name_ar || ''}</Animated.Text>
      {restaurant ? (
        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <TouchableOpacity style={styles.roundBtn} onPress={share} accessibilityRole="button" accessibilityLabel="مشاركة المطعم">
            <Ionicons name="share-social-outline" size={19} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.roundBtn} onPress={toggleFavorite} accessibilityRole="button" accessibilityLabel={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}>
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={isFavorite ? '#FF3B30' : '#FFF'} />
          </TouchableOpacity>
        </View>
      ) : <View style={{ width: 40 }} />}
    </View>
  );

  if (loading && !restaurant) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Skeleton w={'100%'} h={COVER_H} r={0} />
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', padding: 16, gap: 12 }}>
        <Skeleton w={70} h={70} r={16} />
        <View style={{ flex: 1, gap: 8, alignItems: 'flex-end' }}><Skeleton w={'60%'} h={16} /><Skeleton w={'40%'} h={12} /></View>
      </View>
      <View style={{ paddingTop: 8 }}><GridSkeleton count={4} /></View>
      {TopButtons}
    </View>
  );

  if (!restaurant) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <LinearGradient colors={COLORS.gradients.sunset} style={{ height: TOP_BAR }} />
      <EmptyState emoji="😕" title="تعذّر فتح المطعم" subtitle={error || 'حاول مرة ثانية بعد شوي'}
        ctaLabel="إعادة المحاولة" onCta={() => { setLoading(true); fetchRestaurant(); }} />
      <TouchableOpacity onPress={goBack} style={{ alignSelf: 'center', marginBottom: insets.bottom + 30 }}>
        <Text style={{ color: COLORS.gray, fontWeight: '700', fontSize: 14 }}>رجوع</Text>
      </TouchableOpacity>
      {TopButtons}
    </View>
  );

  const shown = menu[activeCategory]
    ? (menu[activeCategory].items || []).filter(item => dietFilter === 'all'
      || (dietFilter === 'spicy' && item.is_spicy)
      || (dietFilter === 'veg' && item.is_vegetarian)
      || (dietFilter === 'offers' && parseFloat(item.discount_price) > 0))
    : [];

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.cover, { height: coverHeight }]}>
        {restaurant.cover_image ? (
          <Animated.Image source={{ uri: restaurant.cover_image }} style={[styles.coverImg, { transform: [{ scale: coverScale }] }]} resizeMode="cover" />
        ) : restaurant.logo ? (
          <View style={styles.logoBg}>
            <Image source={{ uri: restaurant.logo }} style={styles.coverImg} resizeMode="cover" blurRadius={8} />
            <View style={styles.logoBgOverlay} />
            <Image source={{ uri: restaurant.logo }} style={styles.logoHero} resizeMode="contain" />
          </View>
        ) : (
          <LinearGradient colors={COLORS.gradients.sunset} style={[styles.logoBg, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 64 }}>🏪</Text>
          </LinearGradient>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.35)']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
      >
        <FadeIn>
          <View style={styles.infoCard}>
            {restaurant.logo ? <Image source={{ uri: restaurant.logo }} style={styles.logo} /> : null}
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.name}>{restaurant.name_ar}</Text>
              {!!restaurant.description_ar && <Text style={styles.desc} numberOfLines={2}>{restaurant.description_ar}</Text>}
              <View style={styles.statsRow}>
                <View style={styles.stat}><Ionicons name="star" size={14} color="#FFD700" /><Text style={styles.statText}>{(Number(restaurant.rating) || 0).toFixed(1)}</Text></View>
                <View style={styles.stat}><Ionicons name="time-outline" size={14} color={COLORS.gray} /><Text style={styles.statText}>{restaurant.delivery_time_min || 20}-{restaurant.delivery_time_max || 45} دقيقة</Text></View>
                <View style={styles.stat}><Ionicons name="bicycle-outline" size={14} color={COLORS.gray} /><Text style={styles.statText}>التوصيل حسب المسافة</Text></View>
              </View>
              {parseFloat(restaurant.min_order) > 0 && <Text style={styles.minOrder}>الحد الأدنى للطلب: {parseFloat(restaurant.min_order).toFixed(0)}₪ · توصيل مجاني فوق 50₪</Text>}
            </View>
          </View>
        </FadeIn>

        {!!error && (
          <TouchableOpacity style={[styles.notice, { backgroundColor: COLORS.warnBg, borderColor: COLORS.warnBorder }]} onPress={fetchRestaurant}>
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
          <TouchableOpacity style={styles.groupModeBanner} onPress={() => navigation.navigate('GroupOrder', { code: groupCode })}>
            <Ionicons name="people" size={16} color="#FFF" />
            <Text style={styles.groupModeTxt}>أنت تضيف لمجموعة {groupCode} — اضغط للرجوع</Text>
          </TouchableOpacity>
        ) : restaurant.is_open ? (
          <TouchableOpacity style={styles.groupCta} onPress={createGroup}>
            <Text style={{ fontSize: 22 }}>🧑‍🤝‍🧑</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupCtaTitle}>اطلبوا سوا — كل واحد يشوف حسابه</Text>
              <Text style={styles.groupCtaSub}>افتح مجموعة، وكل واحد يزيد أكله من موبايله</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}

        {/* شريط التنقّل بالمنيو */}
        <View style={styles.menuNav}>
          <Text style={styles.menuNavLabel}>الأقسام</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8 }}>
            {menu.map((cat, idx) => {
              const on = activeCategory === idx;
              return (
                <TouchableOpacity key={cat.id ?? idx} activeOpacity={0.85} onPress={() => setActiveCategory(idx)}
                  accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  {on ? (
                    <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.catTab, styles.catTabActive]}>
                      <Text style={[styles.catTabText, styles.catTabTextActive]}>{cat.name_ar}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.catTab}><Text style={styles.catTabText}>{cat.name_ar}</Text></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8, marginTop: 12 }}>
            {[
              { k: 'all', l: 'الكل' },
              { k: 'spicy', l: '🌶️ حار' },
              { k: 'veg', l: '🌿 نباتي' },
              { k: 'offers', l: '🏷️ عروض' },
            ].map(f => (
              <TouchableOpacity key={f.k} activeOpacity={0.8} onPress={() => setDietFilter(f.k)}
                style={[styles.dietChip, dietFilter === f.k && styles.dietChipOn]}>
                <Text style={[styles.dietChipTxt, dietFilter === f.k && { color: '#FFF' }]}>{f.l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {menu.length === 0 ? (
          <View style={styles.noItems}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={styles.noItemsTxt}>المنيو قيد التجهيز — رجّع بعد شوي</Text>
          </View>
        ) : menu[activeCategory] && (
          <View style={styles.menuSection}>
            <View style={styles.catTitleRow}>
              <Text style={styles.catTitle}>{menu[activeCategory].name_ar}</Text>
              <View style={styles.catCountPill}><Text style={styles.catCountTxt}>{shown.length}</Text></View>
            </View>
            {shown.length === 0 ? (
              <View style={styles.noItems}>
                <Text style={{ fontSize: 40 }}>🍽️</Text>
                <Text style={styles.noItemsTxt}>ما في أصناف بهالفلتر</Text>
              </View>
            ) : shown.map((item, i) => (
              <FadeIn key={item.id} delay={Math.min(i, 8) * 50}>
                <ItemCard item={item} onAdd={() => openItem(item)} onPress={() => openItem(item)} />
              </FadeIn>
            ))}
          </View>
        )}
      </Animated.ScrollView>

      {TopButtons}

      {groupId ? (
        <TouchableOpacity style={[styles.groupReturnBar, { paddingBottom: insets.bottom + 16 }]} onPress={() => navigation.navigate('GroupOrder', { code: groupCode })}>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.groupReturnTxt}>خلّصت؟ ارجع للمجموعة</Text>
        </TouchableOpacity>
      ) : count > 0 && <CartBar count={count} total={total} onPress={() => navigation.navigate('Main', { screen: 'سلتي' })} />}

      <Modal visible={!!selectedItem} animationType="slide" transparent onRequestClose={() => setSelectedItem(null)} statusBarTranslucent>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedItem(null)} accessibilityLabel="إغلاق" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {selectedItem?.image ? (
              <View style={styles.sheetHeroWrap}>
                <Image source={{ uri: selectedItem.image }} style={styles.sheetHeroImg} />
                <LinearGradient colors={['transparent', 'rgba(10,10,20,0.35)']} style={styles.sheetHeroScrim} />
              </View>
            ) : null}
            <View style={styles.sheetTitleBlock}>
              <View style={styles.sheetTitleRow}>
                <Text style={styles.sheetItemName}>{selectedItem?.name_ar}</Text>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={styles.sheetItemPrice}>{itemBasePrice(selectedItem).toFixed(2)}₪</Text>
                  {selectedItem?.discount_price && parseFloat(selectedItem.discount_price) < parseFloat(selectedItem.price) ? (
                    <Text style={styles.sheetItemPriceOld}>{parseFloat(selectedItem.price).toFixed(2)}₪</Text>
                  ) : null}
                </View>
              </View>
              {selectedItem?.description_ar ? <Text style={styles.sheetItemDesc}>{selectedItem.description_ar}</Text> : null}
            </View>

            {selectedItem?.addon_groups?.map((group) => {
              const picked = (selectedAddons[group.key] || []).length;
              return (
                <View key={group.key} style={styles.addonGroup}>
                  <View style={styles.addonGroupHeader}>
                    <Text style={styles.addonGroupTitle}>{group.name}</Text>
                    <Text style={[styles.addonGroupSub, group.required && picked === 0 && { color: COLORS.primary, backgroundColor: COLORS.tint }]}>
                      {group.required ? 'مطلوب' : 'اختياري'} · {group.multi_select ? `حتى ${group.max} (${picked}/${group.max})` : 'اختيار واحد'}
                    </Text>
                  </View>
                  {group.options?.map((opt) => {
                    const isSelected = !!(selectedAddons[group.key] || []).find(a => a.id === opt.id);
                    return (
                      <TouchableOpacity key={opt.id} style={[styles.addonRow, isSelected && styles.addonRowSelected]} onPress={() => toggleAddon(group, opt)}
                        accessibilityRole={group.multi_select ? 'checkbox' : 'radio'} accessibilityState={{ checked: isSelected }}>
                        <View style={[styles.addonCheck, !group.multi_select && { borderRadius: 11 }, isSelected && styles.addonCheckSelected]}>
                          {isSelected && <Ionicons name="checkmark" size={13} color="#FFF" />}
                        </View>
                        <Text style={styles.addonName}>{opt.name}</Text>
                        {parseFloat(opt.price || 0) > 0 && <Text style={styles.addonPrice}>+{parseFloat(opt.price).toFixed(2)}₪</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

            {(!selectedItem?.addon_groups || selectedItem.addon_groups.length === 0) && (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: COLORS.gray, fontSize: 14 }}>لا توجد إضافات لهذه الوجبة</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <View style={styles.qtyRow}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => Math.min(MAX_QTY, q + 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="زيادة الكمية">
                <Ionicons name="add" size={22} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{qty}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => Math.max(1, q - 1))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="إنقاص الكمية">
                <Ionicons name="remove" size={22} color={qty <= 1 ? COLORS.faint : COLORS.primary} />
              </TouchableOpacity>
            </View>
            <PressableScale style={[styles.addBtn, { flex: 1 }, adding && { opacity: 0.7 }]} onPress={confirmAddItem} disabled={adding}>
              <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtnGrad}>
                <Text style={styles.addBtnText}>{groupId ? 'أضف للمجموعة' : 'إضافة للسلة'}</Text>
                <Text style={styles.addBtnPrice}>{((itemBasePrice(selectedItem) + getAddonPrice()) * qty).toFixed(2)}₪</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  cover: { overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  logoBg: { width: '100%', height: '100%', backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  logoBgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  logoHero: { width: 110, height: 110, borderRadius: 24, position: 'absolute', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10, zIndex: 20, overflow: 'hidden' },
  topTitle: { flex: 1, color: '#FFF', fontSize: 16.5, fontWeight: '900', textAlign: 'center' },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.32)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  infoCard: { backgroundColor: C.card, margin: 16, marginTop: 14, borderRadius: 20, padding: 16, flexDirection: 'row-reverse', ...C.shadow.card },
  logo: { width: 72, height: 72, borderRadius: 16, borderWidth: 2, borderColor: C.card, backgroundColor: C.inputBg },
  name: { fontSize: 18.5, fontWeight: '900', color: C.text, textAlign: 'right' },
  desc: { fontSize: 13, color: C.gray, marginTop: 2, textAlign: 'right' },
  statsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  stat: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: C.gray, fontWeight: '600' },
  minOrder: { fontSize: 11.5, color: C.primary, marginTop: 6, fontWeight: '700', textAlign: 'right' },
  notice: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: -4, marginBottom: 10, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1 },
  noticeTxt: { fontWeight: '800', fontSize: 13.5 },
  groupCta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: C.tint, marginHorizontal: 16, marginBottom: 8, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.tintBorder },
  groupCtaTitle: { fontSize: 14, fontWeight: '900', color: C.primary, textAlign: 'right' },
  groupCtaSub: { fontSize: 11.5, color: C.gray, marginTop: 2, textAlign: 'right' },
  groupModeBanner: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, paddingVertical: 12 },
  groupModeTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  groupReturnBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, paddingTop: 16 },
  groupReturnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  menuNav: { backgroundColor: C.card, paddingTop: 16, paddingBottom: 16, marginTop: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  menuNavLabel: { fontSize: 12, fontWeight: '800', color: C.gray, textAlign: 'right', paddingHorizontal: 16, marginBottom: 10 },
  catTab: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, backgroundColor: C.inputBg },
  catTabActive: { ...C.shadow.soft, shadowColor: C.primary },
  catTabText: { fontSize: 13.5, color: C.sub, fontWeight: '700' },
  catTabTextActive: { color: '#FFF', fontWeight: '800' },
  menuSection: { paddingHorizontal: 16, paddingTop: 16 },
  catTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 14 },
  catTitle: { fontSize: 18, fontWeight: '900', color: C.text },
  catCountPill: { backgroundColor: C.tint, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2 },
  catCountTxt: { fontSize: 12, fontWeight: '800', color: C.primary },
  noItems: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  noItemsTxt: { fontSize: 14, color: C.gray, fontWeight: '700' },
  dietChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 14, backgroundColor: C.sec, borderWidth: 1, borderColor: C.tint },
  dietChipOn: { backgroundColor: C.primary, borderColor: C.primary },
  dietChipTxt: { fontSize: 13, fontWeight: '800', color: C.primary },
  modalOverlay: { flex: 1, backgroundColor: C.overlay },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', overflow: 'hidden' },
  sheetHandle: { width: 44, height: 5, backgroundColor: C.border, borderRadius: 3, alignSelf: 'center', marginTop: 10, marginBottom: 6, zIndex: 2 },
  sheetHeroWrap: { width: '100%', height: 190, position: 'relative' },
  sheetHeroImg: { width: '100%', height: '100%' },
  sheetHeroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  sheetTitleBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  sheetTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sheetItemName: { fontSize: 19, fontWeight: '900', color: C.text, flex: 1, textAlign: 'right' },
  sheetItemDesc: { fontSize: 13.5, color: C.gray, marginTop: 6, lineHeight: 20, textAlign: 'right' },
  sheetItemPrice: { fontSize: 18, fontWeight: '900', color: C.primary },
  sheetItemPriceOld: { fontSize: 13, color: C.faint, textDecorationLine: 'line-through', marginTop: 1 },
  addonGroup: { paddingHorizontal: 16, paddingTop: 16 },
  addonGroupHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addonGroupTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  addonGroupSub: { fontSize: 11, color: C.gray, backgroundColor: C.inputBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden', fontWeight: '700' },
  addonRow: { flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, backgroundColor: C.inputBg, borderWidth: 1.5, borderColor: C.line },
  addonRowSelected: { backgroundColor: C.tint, borderColor: C.primary },
  addonCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, marginLeft: 12, alignItems: 'center', justifyContent: 'center' },
  addonCheckSelected: { backgroundColor: C.primary, borderColor: C.primary },
  addonName: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600', textAlign: 'right' },
  addonPrice: { fontSize: 13, color: C.primary, fontWeight: '700' },
  sheetFooter: { padding: 16, paddingBottom: 6, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  qtyRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 6 },
  qtyBtn: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center' },
  qtyValue: { minWidth: 26, textAlign: 'center', fontSize: 17, fontWeight: '900', color: C.text, fontVariant: ['tabular-nums'] },
  addBtn: { borderRadius: 18, overflow: 'hidden', elevation: 8, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  addBtnGrad: { padding: 16, borderRadius: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  addBtnPrice: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
