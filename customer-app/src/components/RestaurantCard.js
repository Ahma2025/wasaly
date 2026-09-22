import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Press } from './Anim';
import { useTheme } from '../context/ThemeContext';

export default function RestaurantCard({ restaurant: r, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <Press style={styles.card} onPress={onPress} scaleTo={0.97} haptic={false}>
      <View style={styles.imgBox}>
        <Image source={{ uri: r.cover_image || r.logo }} style={styles.image} />
        <LinearGradient colors={['transparent', 'rgba(10,10,20,0.5)']} style={styles.scrim} />
      </View>
      {!r.is_open && <View style={styles.closedOverlay}><Text style={styles.closedText}>مغلق</Text></View>}
      {!!r.is_featured && (
        <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featuredBadge}>
          <Text style={styles.featuredText}>⭐ مميز</Text>
        </LinearGradient>
      )}

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
    </Press>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 22, marginBottom: 18, overflow: 'hidden', ...COLORS.shadow.card },
  imgBox: { width: '100%', height: 158, position: 'relative' },
  image: { width: '100%', height: 158, resizeMode: 'cover' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },
  closedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(20,20,35,0.55)', height: 158, justifyContent: 'center', alignItems: 'center' },
  closedText: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  featuredBadge: { position: 'absolute', top: 12, left: 12, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, ...COLORS.shadow.float },
  featuredText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  info: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: COLORS.card, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  name: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  category: { fontSize: 12, color: COLORS.gray, marginTop: 1 },
  discountBadge: { backgroundColor: COLORS.tint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  discountText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  dot: { color: COLORS.border, fontSize: 12 }
});
