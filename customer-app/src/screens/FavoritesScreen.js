import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

export default function FavoritesScreen() {
  const navigation = useNavigation();
  const [favs, setFavs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFavs = async () => {
    try {
      const data = await api.get('/users/favorites');
      setFavs(data.data || data || []);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  };

  useFocusEffect(useCallback(() => { fetchFavs(); }, []));

  const removeFav = async (id) => {
    setFavs(prev => prev.filter(r => r.id !== id));
    try { await api.delete(`/users/favorites/${id}`); } catch {}
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.headerTitle}>مطاعمي المفضلة ❤️</Text>
        <View style={{ width: 24 }} />
      </View>

      {favs.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 52 }}>💔</Text>
          <Text style={styles.emptyText}>لا يوجد مطاعم مفضلة بعد</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => navigation.navigate('Main', { screen: 'الرئيسية' })}>
            <Text style={styles.browseText}>تصفّح المطاعم</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFavs(); }} tintColor={COLORS.primary} />}>
          {favs.map(r => (
            <TouchableOpacity key={r.id} style={styles.card} onPress={() => navigation.navigate('Restaurant', { restaurantId: r.id })} activeOpacity={0.85}>
              <Image source={{ uri: r.logo || r.cover_image }} style={styles.logo} />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={styles.name}>{r.name_ar}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="star" size={12} color="#FFB800" />
                  <Text style={styles.meta}>{parseFloat(r.rating || 0).toFixed(1)}</Text>
                  <Text style={styles.sep}>·</Text>
                  <Text style={styles.meta}>{r.delivery_time_min}-{r.delivery_time_max} د</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => removeFav(r.id)} style={{ padding: 6 }}>
                <Ionicons name="heart" size={22} color="#FF3B30" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 14, paddingHorizontal: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  emptyText: { fontSize: 15, color: COLORS.gray, fontWeight: '600' },
  browseBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 14 },
  browseText: { color: '#FFF', fontWeight: '800' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 12, marginBottom: 10, elevation: 2 },
  logo: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#EEE' },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  sep: { color: COLORS.gray },
});
