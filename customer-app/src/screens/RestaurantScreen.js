import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Animated, Alert, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import api from '../utils/api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import ItemCard from '../components/ItemCard';
import CartBar from '../components/CartBar';

const COLORS = { primary: '#FF6B00', bg: '#F8F9FA', card: '#FFF', text: '#1A1A2E', gray: '#8E8E93' };

export default function RestaurantScreen() {
  const route = useRoute();
  const id = route.params?.restaurantId;
  const navigation = useNavigation();
  const { user } = useAuth();
  const { addItem, count, total, clearAndAdd } = useCart();
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedAddons, setSelectedAddons] = useState({});
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => { fetchRestaurant(); }, [id]);

  const fetchRestaurant = async () => {
    try {
      const data = await api.get(`/restaurants/${id}`);
      setRestaurant(data.data);
      setMenu(data.data.menu || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const openItem = (item) => { setSelectedItem(item); setSelectedAddons({}); };

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

  const confirmAddItem = () => {
    if (!selectedItem) return;
    const addonsFlat = Object.entries(selectedAddons).flatMap(([group, items]) => items.map(a => ({ group, ...a })));
    const itemWithAddons = { ...selectedItem, addons: addonsFlat, price: parseFloat(selectedItem.price) + getAddonPrice() };
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

  if (loading) return <View style={styles.loading}><Text>جاري التحميل...</Text></View>;
  if (!restaurant) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.cover, { height: headerHeight }]}>
        {restaurant.cover_image ? (
          <Image source={{ uri: restaurant.cover_image }} style={styles.coverImg} />
        ) : (
          <View style={styles.logoBg}>
            {restaurant.logo
              ? <Image source={{ uri: restaurant.logo }} style={styles.logoHero} resizeMode="contain" />
              : <Text style={{ fontSize: 48 }}>🏪</Text>}
          </View>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favBtn} onPress={toggleFavorite}>
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? '#FF3B30' : '#FFF'} />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryTabs}>
          {menu.map((cat, idx) => (
            <TouchableOpacity key={cat.id} style={[styles.catTab, activeCategory === idx && styles.catTabActive]} onPress={() => setActiveCategory(idx)}>
              <Text style={[styles.catTabText, activeCategory === idx && styles.catTabTextActive]}>{cat.name_ar}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {menu[activeCategory] && (
          <View style={styles.menuSection}>
            <Text style={styles.catTitle}>{menu[activeCategory].name_ar}</Text>
            {menu[activeCategory].items?.map(item => (
              <ItemCard key={item.id} item={item} onAdd={() => openItem(item)} onPress={() => openItem(item)} />
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {count > 0 && <CartBar count={count} total={total} onPress={() => navigation.navigate('سلتي')} />}

      <Modal visible={!!selectedItem} animationType="slide" transparent onRequestClose={() => setSelectedItem(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedItem(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <View style={styles.sheetItemHeader}>
              {selectedItem?.image && <Image source={{ uri: selectedItem.image }} style={styles.sheetItemImg} />}
              <View style={{ flex: 1, marginLeft: selectedItem?.image ? 12 : 0 }}>
                <Text style={styles.sheetItemName}>{selectedItem?.name_ar}</Text>
                {selectedItem?.description_ar ? <Text style={styles.sheetItemDesc}>{selectedItem.description_ar}</Text> : null}
                <Text style={styles.sheetItemPrice}>{parseFloat(selectedItem?.price || 0).toFixed(2)}₪</Text>
              </View>
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
            <TouchableOpacity style={styles.addBtn} onPress={confirmAddItem}>
              <Text style={styles.addBtnText}>إضافة للسلة</Text>
              <Text style={styles.addBtnPrice}>{(parseFloat(selectedItem?.price || 0) + getAddonPrice()).toFixed(2)}₪</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cover: { overflow: 'hidden' },
  coverImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  logoBg: { width: '100%', height: '100%', backgroundColor: '#FFF5EE', alignItems: 'center', justifyContent: 'center' },
  logoHero: { width: 140, height: 140, borderRadius: 20 },
  backBtn: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 8 },
  favBtn: { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 8 },
  infoCard: { backgroundColor: '#FFF', margin: 16, borderRadius: 16, padding: 16, flexDirection: 'row', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  logo: { width: 70, height: 70, borderRadius: 12 },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  desc: { fontSize: 13, color: COLORS.gray, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: COLORS.gray },
  minOrder: { fontSize: 11, color: COLORS.primary, marginTop: 4, fontWeight: '600' },
  categoryTabs: { paddingHorizontal: 16, marginBottom: 8 },
  catTab: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E5EA' },
  catTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catTabText: { fontSize: 13, color: COLORS.text },
  catTabTextActive: { color: '#FFF', fontWeight: '700' },
  menuSection: { paddingHorizontal: 16 },
  catTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', paddingBottom: 34 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#E5E5EA', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetItemHeader: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center' },
  sheetItemImg: { width: 90, height: 90, borderRadius: 12 },
  sheetItemName: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  sheetItemDesc: { fontSize: 13, color: COLORS.gray, marginTop: 4 },
  sheetItemPrice: { fontSize: 16, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  addonGroup: { paddingHorizontal: 16, paddingTop: 16 },
  addonGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addonGroupTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  addonGroupSub: { fontSize: 11, color: COLORS.gray, backgroundColor: '#F5F5F5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  addonRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 6, backgroundColor: '#F9F9F9', borderWidth: 1.5, borderColor: '#F0F0F0' },
  addonRowSelected: { backgroundColor: '#FFF5EE', borderColor: COLORS.primary },
  addonCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#D1D1D6', marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  addonCheckSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  addonName: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  addonPrice: { fontSize: 13, color: COLORS.primary, fontWeight: '700' },
  sheetFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  addBtnPrice: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
