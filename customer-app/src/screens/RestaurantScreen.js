import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, FlatList, Animated, Alert } from 'react-native';
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
  const { addItem, count, total, restaurantId, clearAndAdd } = useCart();
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
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

  const handleAddItem = (item) => {
    const result = addItem(item, restaurant);
    if (result?.conflict) {
      Alert.alert('مطعم مختلف', `سلتك تحتوي على طلب من ${result.restaurant}. هل تريد إفراغها والبدء من جديد؟`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'نعم', onPress: () => clearAndAdd(item, restaurant) }
      ]);
    }
  };

  const toggleFavorite = async () => {
    try {
      if (isFavorite) await api.delete(`/users/favorites/${id}`);
      else await api.post(`/users/favorites/${id}`);
      setIsFavorite(!isFavorite);
    } catch {}
  };

  const headerHeight = scrollY.interpolate({ inputRange: [0, 200], outputRange: [200, 0], extrapolate: 'clamp' });

  if (loading) return <View style={styles.loading}><Text>جاري التحميل...</Text></View>;
  if (!restaurant) return null;

  return (
    <View style={styles.container}>
      {/* Cover */}
      <Animated.View style={[styles.cover, { height: headerHeight }]}>
        <Image source={{ uri: restaurant.cover_image }} style={styles.coverImg} />
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favBtn} onPress={toggleFavorite}>
          <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={isFavorite ? '#FF3B30' : '#FFF'} />
        </TouchableOpacity>
      </Animated.View>

      <ScrollView onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })} scrollEventThrottle={16}>
        {/* Info */}
        <View style={styles.infoCard}>
          <Image source={{ uri: restaurant.logo }} style={styles.logo} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.name}>{restaurant.name_ar}</Text>
            <Text style={styles.desc} numberOfLines={2}>{restaurant.description_ar}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}><Ionicons name="star" size={14} color="#FFD700" /><Text style={styles.statText}>{restaurant.rating?.toFixed(1)}</Text></View>
              <View style={styles.stat}><Ionicons name="time-outline" size={14} color={COLORS.gray} /><Text style={styles.statText}>{restaurant.delivery_time_min}-{restaurant.delivery_time_max} دقيقة</Text></View>
              <View style={styles.stat}><Ionicons name="bicycle-outline" size={14} color={COLORS.gray} /><Text style={styles.statText}>{restaurant.delivery_fee === 0 ? 'توصيل مجاني' : `${restaurant.delivery_fee}₪`}</Text></View>
            </View>
            <Text style={styles.minOrder}>الحد الأدنى: {restaurant.min_order}₪</Text>
          </View>
        </View>

        {/* Menu Categories Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryTabs}>
          {menu.map((cat, idx) => (
            <TouchableOpacity key={cat.id} style={[styles.catTab, activeCategory === idx && styles.catTabActive]} onPress={() => setActiveCategory(idx)}>
              <Text style={[styles.catTabText, activeCategory === idx && styles.catTabTextActive]}>{cat.name_ar}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Menu Items */}
        {menu[activeCategory] && (
          <View style={styles.menuSection}>
            <Text style={styles.catTitle}>{menu[activeCategory].name_ar}</Text>
            {menu[activeCategory].items?.map(item => (
              <ItemCard key={item.id} item={item} onAdd={() => handleAddItem(item)} onPress={() => handleAddItem(item)} />
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {count > 0 && <CartBar count={count} total={total} onPress={() => navigation.navigate('سلتي')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cover: { overflow: 'hidden', position: 'relative' },
  coverImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  backBtn: { position: 'absolute', top: 50, left: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 8 },
  favBtn: { position: 'absolute', top: 50, right: 16, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, padding: 8 },
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
  catTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 }
});
