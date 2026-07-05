import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, FlatList, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import RestaurantCard from '../components/RestaurantCard';
import CategoryPill from '../components/CategoryPill';
import BannerSlider from '../components/BannerSlider';
import SkeletonCard from '../components/SkeletonCard';

const COLORS = { primary: '#FF6B00', bg: '#F8F9FA', card: '#FFF', text: '#1A1A2E', gray: '#8E8E93', border: '#E5E5EA' };

export default function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [restaurants, setRestaurants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [sortBy, setSortBy] = useState('rating');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [address, setAddress] = useState(null);

  useEffect(() => { fetchData(); }, [selectedCategory, sortBy]);

  const fetchData = async () => {
    try {
      const [r, c, b] = await Promise.all([
        api.get(`/restaurants?category_id=${selectedCategory || ''}&sort=${sortBy}&limit=20`),
        api.get('/categories'),
        api.get('/banners')
      ]);
      setRestaurants(r.data || []);
      setCategories(c.data || []);
      setBanners(b.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, []);

  const sortOptions = [
    { label: 'الأعلى تقييماً', value: 'rating' },
    { label: 'الأسرع', value: 'fastest' },
    { label: 'الأقرب', value: 'nearest' },
    { label: 'الأحدث', value: 'newest' }
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('AddAddress')} style={styles.locationRow}>
          <Ionicons name="location" size={20} color={COLORS.primary} />
          <View style={{ marginLeft: 6, flex: 1 }}>
            <Text style={styles.locationLabel}>التوصيل إلى</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {address?.title || 'حدد موقعك'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={COLORS.gray} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.notifBtn}>
          <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}>
        {/* Search Bar */}
        <TouchableOpacity style={styles.searchBar} onPress={() => navigation.navigate('بحث')}>
          <Ionicons name="search" size={20} color={COLORS.gray} />
          <Text style={styles.searchPlaceholder}>ابحث عن مطعم أو صنف...</Text>
        </TouchableOpacity>

        {/* Banners */}
        <BannerSlider banners={banners} />

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>التصنيفات</Text>
          <FlatList
            data={[{ id: null, name_ar: 'الكل', icon: '🍽️' }, ...categories]}
            horizontal showsHorizontalScrollIndicator={false}
            keyExtractor={i => String(i.id)}
            renderItem={({ item }) => (
              <CategoryPill
                item={item}
                selected={selectedCategory === item.id}
                onPress={() => setSelectedCategory(item.id)}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          />
        </View>

        {/* Sort Options */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
          {sortOptions.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.sortChip, sortBy === opt.value && styles.sortChipActive]}
              onPress={() => setSortBy(opt.value)}
            >
              <Text style={[styles.sortChipText, sortBy === opt.value && styles.sortChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Restaurants */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>المطاعم</Text>
          {loading ? (
            [1,2,3].map(i => <SkeletonCard key={i} />)
          ) : (
            restaurants.map(r => (
              <RestaurantCard key={r.id} restaurant={r} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} />
            ))
          )}
          {!loading && restaurants.length === 0 && (
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🍽️</Text>
              <Text style={styles.emptyText}>لا توجد مطاعم متاحة</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  locationRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  locationLabel: { fontSize: 11, color: COLORS.gray },
  locationText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  notifBtn: { padding: 8 },
  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.border, gap: 8 },
  searchPlaceholder: { color: COLORS.gray, fontSize: 14 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  sortChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border },
  sortChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortChipText: { fontSize: 13, color: COLORS.text },
  sortChipTextActive: { color: '#FFF', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: COLORS.gray, marginTop: 8 }
});
