import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, RefreshControl, Dimensions, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import BannerSlider from '../components/BannerSlider';

const { width } = Dimensions.get('window');
const C = { primary: '#FF6B00', bg: '#F2F2F7', white: '#FFF', text: '#1A1A2E', gray: '#8E8E93', light: '#F8F8F8' };

const QUICK_CATS = [
  { id: 1, label: 'برجر', icon: '🍔' },
  { id: 2, label: 'بيتزا', icon: '🍕' },
  { id: 3, label: 'شاورما', icon: '🌯' },
  { id: 4, label: 'سوشي', icon: '🍱' },
  { id: 5, label: 'حلويات', icon: '🍰' },
  { id: 6, label: 'فطور', icon: '🍳' },
];

function RestaurantCard2({ r, onPress }) {
  const discount = r.discount_percent || r.discount;
  return (
    <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.92}>
      <View style={card.imgWrap}>
        <Image source={{ uri: r.cover_image || r.logo }} style={card.img} resizeMode="cover" />
        {discount > 0 && (
          <View style={card.badge}>
            <Text style={card.badgeText}>خصم {discount}%</Text>
          </View>
        )}
        {!r.is_open && (
          <View style={card.closed}>
            <Text style={card.closedText}>مغلق</Text>
          </View>
        )}
        <View style={card.logoWrap}>
          <Image source={{ uri: r.logo }} style={card.logo} resizeMode="cover" />
        </View>
      </View>
      <View style={card.info}>
        <Text style={card.name} numberOfLines={1}>{r.name_ar}</Text>
        <Text style={card.address} numberOfLines={1}>{r.address || r.city || ''}</Text>
        <View style={card.row}>
          <Ionicons name="star" size={12} color="#FFB800" />
          <Text style={card.rating}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
          <Text style={card.dot}>·</Text>
          <Text style={card.time}>{r.delivery_time_min}-{r.delivery_time_max} د</Text>
          {r.delivery_fee === 0 && <><Text style={card.dot}>·</Text><Text style={card.free}>توصيل مجاني</Text></>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function HorizCard({ r, onPress }) {
  return (
    <TouchableOpacity style={hc.wrap} onPress={onPress} activeOpacity={0.92}>
      <Image source={{ uri: r.logo || r.cover_image }} style={hc.logo} resizeMode="cover" />
      <Text style={hc.name} numberOfLines={2}>{r.name_ar}</Text>
      <View style={hc.row}>
        <Ionicons name="star" size={11} color="#FFB800" />
        <Text style={hc.rating}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
      </View>
      {!r.is_open && <View style={hc.closed}><Text style={hc.closedTxt}>مغلق</Text></View>}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allRestaurants, setAllRestaurants] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState(null);
  const [expandedCats, setExpandedCats] = useState({});

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const [r, c, b] = await Promise.all([
        api.get('/restaurants?limit=50'),
        api.get('/categories'),
        api.get('/banners'),
      ]);
      setAllRestaurants(r.data || []);
      setCategories(c.data || []);
      setBanners(b.data || []);
      setFeatured((r.data || []).slice(0, 6));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = useCallback(() => { setRefreshing(true); fetchAll(); }, []);

  const goRestaurant = (id) => navigation.navigate('Restaurant', { restaurantId: id });

  const getByCategory = (catId) => allRestaurants.filter(r => r.category_id === catId);

  const toggleExpand = (id) => setExpandedCats(p => ({ ...p, [id]: !p[id] }));

  const nearest = [...allRestaurants].sort((a, b) => (a.distance || 99) - (b.distance || 99)).slice(0, 6);
  const topRated = [...allRestaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.navigate('بحث')} style={s.searchIcon}>
          <Ionicons name="search-outline" size={22} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.locationBtn} onPress={() => navigation.navigate('AddAddress')}>
          <Ionicons name="location-outline" size={16} color={C.primary} />
          <Text style={s.locationText} numberOfLines={1}>حدد موقعك</Text>
          <Ionicons name="chevron-down" size={14} color={C.gray} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={s.notifBtn}>
          <Ionicons name="notifications-outline" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* Banner */}
        <BannerSlider banners={banners} />

        {/* Quick categories */}
        <View style={s.section}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 16 }}>
            {(categories.length > 0 ? categories : QUICK_CATS).map(cat => (
              <TouchableOpacity key={cat.id} style={s.quickCat} onPress={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}>
                <View style={[s.quickIcon, selectedCat === cat.id && { backgroundColor: C.primary }]}>
                  <Text style={{ fontSize: 26 }}>{cat.icon || '🍽️'}</Text>
                </View>
                <Text style={[s.quickLabel, selectedCat === cat.id && { color: C.primary, fontWeight: '700' }]}>{cat.name_ar || cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* If category selected — show filtered */}
        {selectedCat && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{categories.find(c => c.id === selectedCat)?.name_ar || ''}</Text>
              <TouchableOpacity><Text style={s.seeAll}>عرض الكل</Text></TouchableOpacity>
            </View>
            <View style={s.grid}>
              {getByCategory(selectedCat).slice(0, 4).map(r => (
                <RestaurantCard2 key={r.id} r={r} onPress={() => goRestaurant(r.id)} />
              ))}
            </View>
          </View>
        )}

        {/* مطاعم مقترحة — horizontal */}
        {featured.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <View style={[s.sectionHeader, { paddingHorizontal: 16 }]}>
              <Text style={s.sectionTitle}>🌟 مطاعم مقترحة</Text>
              <Text style={s.powered}>ممول</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {featured.map(r => (
                <HorizCard key={r.id} r={r} onPress={() => goRestaurant(r.id)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* قريب منك */}
        {nearest.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>📍 قريب منك</Text>
              <Text style={s.powered}>ممول</Text>
            </View>
            <View style={s.grid}>
              {nearest.slice(0, expandedCats['nearest'] ? nearest.length : 4).map(r => (
                <RestaurantCard2 key={r.id} r={r} onPress={() => goRestaurant(r.id)} />
              ))}
            </View>
            {nearest.length > 4 && (
              <TouchableOpacity style={s.showMore} onPress={() => toggleExpand('nearest')}>
                <Text style={s.showMoreText}>{expandedCats['nearest'] ? 'عرض أقل ▲' : 'اعرض المزيد ▼'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* الأعلى تقييماً */}
        {topRated.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>⭐ الأعلى تقييماً</Text>
            </View>
            <View style={s.grid}>
              {topRated.slice(0, expandedCats['top'] ? topRated.length : 4).map(r => (
                <RestaurantCard2 key={r.id} r={r} onPress={() => goRestaurant(r.id)} />
              ))}
            </View>
            {topRated.length > 4 && (
              <TouchableOpacity style={s.showMore} onPress={() => toggleExpand('top')}>
                <Text style={s.showMoreText}>{expandedCats['top'] ? 'عرض أقل ▲' : 'اعرض المزيد ▼'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Category sections */}
        {categories.map(cat => {
          const list = getByCategory(cat.id);
          if (list.length === 0) return null;
          const isExpanded = expandedCats[cat.id];
          const shown = isExpanded ? list : list.slice(0, 4);
          return (
            <View key={cat.id} style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{cat.icon || '🍽️'} {cat.name_ar}</Text>
                <TouchableOpacity><Text style={s.seeAll}>عرض الكل</Text></TouchableOpacity>
              </View>
              <View style={s.grid}>
                {shown.map(r => (
                  <RestaurantCard2 key={r.id} r={r} onPress={() => goRestaurant(r.id)} />
                ))}
              </View>
              {list.length > 4 && (
                <TouchableOpacity style={s.showMore} onPress={() => toggleExpand(cat.id)}>
                  <Text style={s.showMoreText}>{isExpanded ? 'عرض أقل ▲' : 'اعرض المزيد ▼'}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {!loading && allRestaurants.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 48 }}>🍽️</Text>
            <Text style={{ color: C.gray, marginTop: 12, fontSize: 16 }}>لا توجد مطاعم متاحة</Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const CARD_W = (width - 48) / 2;

const card = StyleSheet.create({
  wrap: { width: CARD_W, backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6 },
  imgWrap: { width: '100%', height: 110, position: 'relative' },
  img: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 8, left: 8, backgroundColor: C.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  closed: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  closedText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  logoWrap: { position: 'absolute', bottom: -16, right: 10, width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#FFF', overflow: 'hidden', backgroundColor: '#FFF', elevation: 3 },
  logo: { width: '100%', height: '100%' },
  info: { paddingHorizontal: 10, paddingTop: 20, paddingBottom: 10 },
  name: { fontSize: 13, fontWeight: '800', color: '#1A1A2E' },
  address: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 3 },
  rating: { fontSize: 11, color: '#1A1A2E', fontWeight: '600' },
  dot: { color: '#8E8E93', fontSize: 11 },
  time: { fontSize: 11, color: '#8E8E93' },
  free: { fontSize: 11, color: '#FF6B00', fontWeight: '600' },
});

const hc = StyleSheet.create({
  wrap: { width: 110, alignItems: 'center' },
  logo: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F0F0' },
  name: { fontSize: 12, fontWeight: '700', color: '#1A1A2E', textAlign: 'center', marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rating: { fontSize: 11, color: '#1A1A2E' },
  closed: { position: 'absolute', top: 0, left: 15, right: 15, bottom: 30, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  closedTxt: { color: '#FFF', fontSize: 10, fontWeight: '700' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  searchIcon: { padding: 4 },
  locationBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  locationText: { fontSize: 14, fontWeight: '700', color: C.text, maxWidth: 180 },
  notifBtn: { padding: 4 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  seeAll: { fontSize: 13, color: C.primary, fontWeight: '700' },
  powered: { fontSize: 11, color: C.gray, backgroundColor: '#F0F0F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  quickCat: { alignItems: 'center', gap: 6 },
  quickIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6 },
  quickLabel: { fontSize: 12, color: C.text, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  showMore: { marginTop: 10, borderWidth: 1.5, borderColor: '#FF6B00', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  showMoreText: { color: '#FF6B00', fontWeight: '700', fontSize: 14 },
});
