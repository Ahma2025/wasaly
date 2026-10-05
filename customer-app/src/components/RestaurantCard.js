import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Press } from './Anim';
import { useTheme } from '../context/ThemeContext';

export default function RestaurantCard({ restaurant: r, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const rating = Number(r.rating) || 0;
  const reviews = Number(r.rating_count || r.total_reviews) || 0;
  return (
    <Press style={styles.card} onPress={onPress} scaleTo={0.97} haptic={false}>
      <View accessible accessibilityRole="button" accessibilityLabel={`${r.name_ar || ''}${r.is_open ? '' : '، مغلق'}`}>
        <View style={styles.imgBox}>
          {(r.cover_image || r.logo)
            ? <Image source={{ uri: r.cover_image || r.logo }} style={styles.image} />
            : <View style={[styles.image, styles.imgFallback]}><Text style={{ fontSize: 44 }}>🍽️</Text></View>}
          <LinearGradient colors={['transparent', 'rgba(10,10,20,0.5)']} style={styles.scrim} />
          {rating > 0 && (
            <View style={styles.ratePill}>
              <Ionicons name="star" size={12} color="#FFD700" />
              <Text style={styles.ratePillText}>{rating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        {!r.is_open && <View style={styles.closedOverlay}><Text style={styles.closedText}>مغلق</Text></View>}
        {!!r.is_featured && (
          <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featuredBadge}>
            <Text style={styles.featuredText}>⭐ مميز</Text>
          </LinearGradient>
        )}

        <View style={styles.info}>
          <View style={styles.row}>
            {r.logo ? <Image source={{ uri: r.logo }} style={styles.logo} /> : null}
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.name} numberOfLines={1}>{r.name_ar}</Text>
              {!!r.category_name && <Text style={styles.category} numberOfLines={1}>{r.category_name}</Text>}
            </View>
            {!!r.discount_available && <View style={styles.discountBadge}><Text style={styles.discountText}>خصم</Text></View>}
          </View>

          <View style={styles.stats}>
            <View style={styles.stat}><Ionicons name="star" size={13} color="#FFD700" /><Text style={styles.statText}>{rating.toFixed(1)}{reviews ? ` (${reviews})` : ''}</Text></View>
            <Text style={styles.dot}>•</Text>
            <View style={styles.stat}><Ionicons name="time-outline" size={13} color={COLORS.gray} /><Text style={styles.statText}>{r.delivery_time_min || 20}-{r.delivery_time_max || 40} د</Text></View>
            <Text style={styles.dot}>•</Text>
            {/* رسوم التوصيل الفعلية تُحسب حسب المسافة لعنوانك */}
            <View style={styles.stat}><Ionicons name="bicycle-outline" size={13} color={COLORS.gray} /><Text style={styles.statText}>التوصيل حسب المسافة</Text></View>
            {!!r.distance_km && (
              <>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.statText}>{r.distance_km} كم</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Press>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 22, marginBottom: 18, overflow: 'hidden', ...COLORS.shadow.card },
  imgBox: { width: '100%', height: 158, position: 'relative' },
  image: { width: '100%', height: 158, resizeMode: 'cover' },
  imgFallback: { backgroundColor: COLORS.tint, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },
  closedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(20,20,35,0.55)', height: 158, justifyContent: 'center', alignItems: 'center' },
  closedText: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  featuredBadge: { position: 'absolute', top: 12, left: 12, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, ...COLORS.shadow.float },
  ratePill: { position: 'absolute', top: 12, right: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: 'rgba(10,10,20,0.6)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  ratePillText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  featuredText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  info: { padding: 14 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  logo: { width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: COLORS.card, backgroundColor: COLORS.inputBg },
  name: { fontSize: 16, fontWeight: '800', color: COLORS.text, textAlign: 'right' },
  category: { fontSize: 12, color: COLORS.gray, marginTop: 1, textAlign: 'right' },
  discountBadge: { backgroundColor: COLORS.tint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  discountText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  stat: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3 },
  statText: { fontSize: 12, color: COLORS.gray, fontWeight: '600' },
  dot: { color: COLORS.border, fontSize: 12 },
});
