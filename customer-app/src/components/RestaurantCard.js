import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93' };

export default function RestaurantCard({ restaurant: r, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <Image source={{ uri: r.cover_image || r.logo }} style={styles.image} />
      {!r.is_open && <View style={styles.closedOverlay}><Text style={styles.closedText}>مغلق</Text></View>}
      {!!r.is_featured && <View style={styles.featuredBadge}><Text style={styles.featuredText}>⭐ مميز</Text></View>}

      <View style={styles.info}>
        <View style={styles.row}>
          <Image source={{ uri: r.logo }} style={styles.logo} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.name}>{r.name_ar}</Text>
            <Text style={styles.category}>{r.category_name}</Text>
          </View>
          {!!r.discount_available && <View style={styles.discountBadge}><Text style={styles.discountText}>خصم</Text></View>}
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}><Ionicons name="star" size={13} color="#FFD700" /><Text style={styles.statText}>{r.rating ? r.rating.toFixed(1) : '0.0'}{r.rating_count ? ` (${r.rating_count})` : ''}</Text></View>
          <Text style={styles.dot}>•</Text>
          <View style={styles.stat}><Ionicons name="time-outline" size={13} color={COLORS.gray} /><Text style={styles.statText}>{r.delivery_time_min || 20}-{r.delivery_time_max || 40} د</Text></View>
          <Text style={styles.dot}>•</Text>
          <View style={styles.stat}>
            <Ionicons name="bicycle-outline" size={13} color={COLORS.gray} />
            <Text style={styles.statText}>{r.delivery_fee === 0 ? 'مجاني' : `${r.delivery_fee || 0}₪`}</Text>
          </View>
          {!!r.distance_km && (
            <>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.statText}>{r.distance_km} كم</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 },
  image: { width: '100%', height: 140, resizeMode: 'cover' },
  closedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', height: 140, justifyContent: 'center', alignItems: 'center' },
  closedText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  featuredBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  featuredText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  info: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  logo: { width: 40, height: 40, borderRadius: 8 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  category: { fontSize: 12, color: COLORS.gray },
  discountBadge: { backgroundColor: '#FFE5D9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  discountText: { color: COLORS.primary, fontSize: 11, fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12, color: COLORS.gray },
  dot: { color: COLORS.gray, fontSize: 12 }
});
