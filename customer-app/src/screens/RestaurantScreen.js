import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Animated, Alert, Modal, Pressable, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../utils/api';
import { readCache, writeCache } from '../utils/cache';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import PressableScale from '../components/PressableScale';
import { Skeleton, GridSkeleton } from '../components/Skeleton';
import CartBar from '../components/CartBar';
import { FadeIn, Press } from '../components/Anim';
import { useTheme } from '../context/ThemeContext';

export default function RestaurantScreen() {
  const route = useRoute();
  const id = route.params?.restaurantId;
  const navigation = useNavigation();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const { user } = useAuth();
  const { addItem, count, total, clearAndAdd } = useCart();
  const groupId = route.params?.groupId;      // وضع الطلب الجماعي (إن وُجد)
  const groupCode = route.params?.groupCode;
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState({});
  const [dietFilter, setDietFilter] = useState('all');
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!id) { navigation.goBack(); return; }
    (async () => {
      const cached = await readCache('rest_' + id);
      if (cached) { setRestaurant(cached.restaurant); setMenu(cached.menu); setLoading(false); }
      fetchRestaurant();
    })();
  }, [id]);

  const fetchRestaurant = async () => {
    try {
      const data = await api.get(`/restaurants/${id}`);
      const r = data.data;
      // Transform item_options → addon_groups format
      const menu = (r.menu || []).map(cat => ({
        ...cat,
        items: (cat.items || []).map(item => ({
          ...item,
          addon_groups: (item.options || []).filter(o => o && o.id).map(o => ({
            name: o.name_ar || o.name_en || '',
            required: o.is_required,
            multi_select: (o.max_selections || 1) > 1,
            options: (o.values || []).filter(v => v && v.id).map(v => ({
              name: v.name_ar || v.name_en || '',
              price: parseFloat(v.extra_price || v.price || 0)
            }))
          }))
        }))
      }));
      setRestaurant(r);
      setMenu(menu);
      writeCache('rest_' + id, { restaurant: r, menu });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openItem = (item) => {
    if (restaurant && !restaurant.is_open) {
      Alert.alert('المطعم مغلق', 'المطعم مغلق حالياً ولا يستقبل طلبات. جرّب لاحقاً 🕐');
      return;
    }
    setSelectedItem(item); setSelectedAddons({});
  };

  const toggleAddon = (groupName, addon, multiSelect) => {
    setSelectedAddons(prev => {
      const current = prev[groupName] || [];
      if (multiSelect) {
        const exists = current.find(a => a.name === addon.name);
        return { ...prev, [groupName]: exists ? current.filter(a => a.name !== addon.name) : [...current, addon] };
      }
      return { ...prev, [groupName]: [addon] };
    });
  };

  const getAddonPrice = () => {
    let extra = 0;
    Object.values(selectedAddons).forEach(group => group.forEach(a => { extra += parseFloat(a.price || 0); }));
    return extra;
  };

  const createGroup = async () => {
    try {
      const r = await api.post('/group-orders', { restaurant_id: restaurant.id, restaurant_name: restaurant.name_ar });
      const g = r.data || r;
      navigation.navigate('GroupOrder', { code: g.code });
    } catch { Alert.alert('خطأ', 'تعذّر بدء المجموعة، حاول مرة ثانية'); }
  };

  const confirmAddItem = async () => {
    if (!selectedItem) return;
    const addonsFlat = Object.entries(selectedAddons).flatMap(([group, items]) => items.map(a => ({ group, ...a })));
    // وضع المجموعة: نضيف الصنف للمجموعة بدل السلّة المحلية
    if (groupId) {
      try {
        await api.post(`/group-orders/${groupId}/items`, {
          menu_item_id: selectedItem.id,
          name: selectedItem.name_ar,
          image: selectedItem.image,
          price: parseFloat(selectedItem.discount_price || selectedItem.price || 0),
          quantity: 1,
          options: addonsFlat,
        });
        setSelectedItem(null);
      } catch { Alert.alert('خطأ', 'تعذّر إضافة الصنف للمجموعة'); }
      return;
    }
    // نخزّن السعر الأساسي فقط؛ الإضافات تُحسب مرة واحدة في CartContext/CartScreen (تجنّب الحساب المزدوج)
    const itemWithAddons = { ...selectedItem, addons: addonsFlat };
    const result = addItem(itemWithAddons, restaurant);
    if (result?.conflict) {
      Alert.alert('مطعم مختلف', `سلتك من ${result.restaurant}. هل تبدأ من جديد؟`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'نعم', onPress: () => { clearAndAdd(itemWithAddons, restaurant); setSelectedItem(null); } }
      ]);
    } else {
      setSelectedItem(null);
    }
  };

  const toggleFavorite = async () => {
    try {
      if (isFavorite) await api.delete(`/users/favorites/${id}`);
      else await api.post(`/users/favorites/${id}`);
      setIsFavorite(!isFavorite);
    } catch {}
  };

  const headerHeight = scrollY.interpolate({ inputRange: [0, 200], outputRange: [220, 0], extrapolate: 'clamp' });
  // بارالاكس: الصورة تتكبّر لطيف عند السحب للأسفل
  const coverScale = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.35, 1], extrapolate: 'clamp' });

  if (loading && !restaurant) return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <Skeleton w={'100%'} h={220} r={0} />
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
        <Skeleton w={70} h={70} r={16} />
        <View style={{ flex: 1, gap: 8 }}><Skeleton w={'60%'} h={16} /><Skeleton w={'40%'} h={12} /></View>
      </View>
      <View style={{ paddingTop: 8 }}><GridSkeleton count={6} /></View>
    </View>
  );
  if (!restaurant) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.cover, { height: headerHeight }]}>
        {restaurant.cover_image ? (
          <Animated.Image source={{ uri: restaurant.cover_image }} style={[styles.coverImg, { transform: [{ scale: coverScale }] }]} resizeMode="cover" />
        ) : restaurant.logo ? (
          <View style={styles.logoBg}>
            <Image source={{ uri: restaurant.logo }} style={styles.coverImg} resizeMode="cover" />
            <View style={styles.logoBgOverlay} />
            <Image source={{ uri: restaurant.logo }} style={styles.logoHero} resizeMode="contain" />
          </View>
        ) : (
          <View style={[styles.logoBg, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 64 }}>🏪</Text>
          </View>
        )}
        <LinearGradient colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.45)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favBtn} onPress={toggleFavorite}>
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? '#FF3B30' : '#FFF'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareBtn} onPress={() => Share.share({ message: `جرّب ${restaurant.name_ar} على تطبيق وصلّي 🛵 — توصيل الطعام الأسرع!` })}>
          <Ionicons name="share-social-outline" size={20} color="#FFF" />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        <FadeIn>
        <View style={styles.infoCard}>
          <Image source={{ uri: restaurant.logo }} style={styles.logo} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.name}>{restaurant.name_ar}</Text>
            <Text style={styles.desc} numberOfLines={2}>{restaurant.description_ar}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}><Ionicons name="star" size={14} color="#FFD700" /><Text style={styles.statText}>{parseFloat(restaurant.rating || 0).toFixed(1)}</Text></View>
              <View style={styles.stat}><Ionicons name="time-outline" size={14} color={COLORS.gray} /><Text style={styles.statText}>{restaurant.delivery_time_min}-{restaurant.delivery_time_max} دقيقة</Text></View>
              <View style={styles.stat}><Ionicons name="bicycle-outline" size={14} color={COLORS.gray} /><Text style={styles.statText}>{restaurant.delivery_fee === 0 ? 'توصيل مجاني' : `${restaurant.delivery_fee}₪`}</Text></View>
            </View>
            <Text style={styles.minOrder}>الحد الأدنى: {restaurant.min_order}₪</Text>
          </View>
        </View>
        </FadeIn>

        {!restaurant.is_open && (
          <View style={styles.closedBanner}>
            <Ionicons name="lock-closed" size={16} color="#FF3B30" />
            <Text style={styles.closedBannerTxt}>المطعم مغلق حالياً — لا يستقبل طلبات</Text>
          </View>
        )}

        {/* 👥 الطلب الجماعي */}
        {groupId ? (
          <TouchableOpacity style={styles.groupModeBanner} onPress={() => navigation.navigate('GroupOrder', { code: groupCode })}>
            <Text style={styles.groupModeTxt}>🧑‍🤝‍🧑 أنت تضيف لمجموعة {groupCode} — اضغط للرجوع</Text>
            <Ionicons name="arrow-back" size={16} color="#FFF" />
          </TouchableOpacity>
        ) : restaurant.is_open && (
          <TouchableOpacity style={styles.groupCta} onPress={createGroup}>
            <Text style={{ fontSize: 22 }}>🧑‍🤝‍🧑</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupCtaTitle}>اطلبوا سوا — كسر الحساب</Text>
              <Text style={styles.groupCtaSub}>افتح مجموعة، وكل واحد يزيد أكله والحساب بينقسم</Text>
            </View>
            <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        {/* شريط التنقّل بالمنيو */}
        <View style={styles.menuNav}>
          <Text style={styles.menuNavLabel}>الأقسام</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection: 'row-reverse', paddingHorizontal: 16, gap: 8 }}>
            {menu.map((cat, idx) => {
              const on = activeCategory === idx;
              return (
                <TouchableOpacity key={cat.id} activeOpacity={0.85} onPress={() => setActiveCategory(idx)}>
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

        {menu[activeCategory] && (() => {
          const shown = (menu[activeCategory].items || []).filter(item => dietFilter === 'all'
            || (dietFilter === 'spicy' && item.is_spicy)
            || (dietFilter === 'veg' && item.is_vegetarian)
            || (dietFilter === 'offers' && item.discount_price));
          return (
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
          );
        })()}
        <View style={{ height: 100 }} />
      </ScrollView>

      {groupId ? (
        <TouchableOpacity style={styles.groupReturnBar} onPress={() => navigation.navigate('GroupOrder', { code: groupCode })}>
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.groupReturnTxt}>خلّصت؟ ارجع للمجموعة</Text>
        </TouchableOpacity>
      ) : count > 0 && <CartBar count={count} total={total} onPress={() => navigation.navigate('سلتي')} />}

      <Modal visible={!!selectedItem} animationType="slide" transparent onRequestClose={() => setSelectedItem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedItem(null)} />
        <View style={styles.sheet}>
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
                <Text style={styles.sheetItemPrice}>{parseFloat(selectedItem?.price || 0).toFixed(2)}₪</Text>
              </View>
              {selectedItem?.description_ar ? <Text style={styles.sheetItemDesc}>{selectedItem.description_ar}</Text> : null}
            </View>

            {selectedItem?.addon_groups?.map((group, gi) => (
              <View key={gi} style={styles.addonGroup}>
                <View style={styles.addonGroupHeader}>
                  <Text style={styles.addonGroupTitle}>{group.name}</Text>
                  <Text style={styles.addonGroupSub}>{group.required ? 'مطلوب' : 'اختياري'} · {group.multi_select ? 'متعدد' : 'واحد'}</Text>
                </View>
                {group.options?.map((opt, oi) => {
                  const isSelected = !!(selectedAddons[group.name] || []).find(a => a.name === opt.name);
                  return (
                    <TouchableOpacity key={oi} style={[styles.addonRow, isSelected && styles.addonRowSelected]} onPress={() => toggleAddon(group.name, opt, group.multi_select)}>
                      <View style={[styles.addonCheck, isSelected && styles.addonCheckSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={13} color="#FFF" />}
                      </View>
                      <Text style={styles.addonName}>{opt.name}</Text>
                      {parseFloat(opt.price || 0) > 0 && <Text style={styles.addonPrice}>+{parseFloat(opt.price).toFixed(2)}₪</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {(!selectedItem?.addon_groups || selectedItem.addon_groups.length === 0) && (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: COLORS.gray, fontSize: 14 }}>لا توجد إضافات لهذه الوجبة</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <PressableScale style={styles.addBtn} onPress={confirmAddItem}>
              <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtnGrad}>
                <Text style={styles.addBtnText}>إضافة للسلة</Text>
                <Text style={styles.addBtnPrice}>{(parseFloat(selectedItem?.price || 0) + getAddonPrice()).toFixed(2)}₪</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  cover: { overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  logoBg: { width: '100%', height: '100%', backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  logoBgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  logoHero: { width: 120, height: 120, borderRadius: 16, position: 'absolute', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  backBtn: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 8 },
  favBtn: { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 8 },
  shareBtn: { position: 'absolute', top: 50, right: 62, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 8 },
  infoCard: { backgroundColor: COLORS.card, margin: 16, marginTop: 12, borderRadius: 20, padding: 16, flexDirection: 'row', elevation: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  logo: { width: 72, height: 72, borderRadius: 16, borderWidth: 2, borderColor: COLORS.card, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  desc: { fontSize: 13, color: COLORS.gray, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: COLORS.gray },
  minOrder: { fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: '600' },
  closedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF0EE', marginHorizontal: 16, marginTop: -8, marginBottom: 4, borderRadius: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#FFD5CE' },
  closedBannerTxt: { color: '#FF3B30', fontWeight: '800', fontSize: 14 },
  groupCta: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.tint, marginHorizontal: 16, marginBottom: 8, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#FFE0CC' },
  groupCtaTitle: { fontSize: 14, fontWeight: '900', color: COLORS.primary },
  groupCtaSub: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  groupModeBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, marginHorizontal: 16, marginBottom: 8, borderRadius: 14, paddingVertical: 12 },
  groupModeTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  groupReturnBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 16, paddingBottom: 24 },
  groupReturnTxt: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  menuNav: { backgroundColor: COLORS.card, paddingTop: 16, paddingBottom: 16, marginTop: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.line },
  menuNavLabel: { fontSize: 12, fontWeight: '800', color: COLORS.gray, textAlign: 'right', paddingHorizontal: 16, marginBottom: 10 },
  catTab: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, backgroundColor: COLORS.inputBg },
  catTabActive: { ...COLORS.shadow.soft, shadowColor: COLORS.primary },
  catTabText: { fontSize: 13.5, color: COLORS.sub, fontWeight: '700' },
  catTabTextActive: { color: '#FFF', fontWeight: '800' },
  menuSection: { paddingHorizontal: 16, paddingTop: 16 },
  catTitleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 14 },
  catTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  catCountPill: { backgroundColor: COLORS.tint, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2 },
  catCountTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  noItems: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  noItemsTxt: { fontSize: 14, color: COLORS.gray, fontWeight: '700' },
  dietChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 14, backgroundColor: COLORS.sec, borderWidth: 1, borderColor: COLORS.tint },
  dietChipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dietChipTxt: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingBottom: 34, overflow: 'hidden' },
  sheetHandle: { width: 44, height: 5, backgroundColor: COLORS.border, borderRadius: 3, alignSelf: 'center', marginTop: 10, marginBottom: 6, zIndex: 2 },
  sheetHeroWrap: { width: '100%', height: 190, position: 'relative' },
  sheetHeroImg: { width: '100%', height: '100%' },
  sheetHeroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  sheetTitleBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: COLORS.line },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sheetItemName: { fontSize: 19, fontWeight: '900', color: COLORS.text, flex: 1, textAlign: 'right' },
  sheetItemDesc: { fontSize: 13.5, color: COLORS.gray, marginTop: 6, lineHeight: 20, textAlign: 'right' },
  sheetItemPrice: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  addonGroup: { paddingHorizontal: 16, paddingTop: 16 },
  addonGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addonGroupTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  addonGroupSub: { fontSize: 11, color: COLORS.gray, backgroundColor: COLORS.inputBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  addonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, backgroundColor: COLORS.inputBg, borderWidth: 1.5, borderColor: COLORS.line },
  addonRowSelected: { backgroundColor: COLORS.tint, borderColor: COLORS.primary },
  addonCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  addonCheckSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  addonName: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  addonPrice: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  sheetFooter: { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.line },
  addBtn: { borderRadius: 18, overflow: 'hidden', elevation: 8, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  addBtnGrad: { padding: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  addBtnPrice: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
