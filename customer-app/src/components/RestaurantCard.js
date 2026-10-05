import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Press } from './Anim';
import { useTheme } from '../context/ThemeContext';

// بطاقة مطعم تعتمد على الصورة: شارة تقييم على الصورة + شرائح الوقت والتوصيل
export default function RestaurantCard({ restaurant: r, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const rating = Number(r.rating) || 0;
  const reviews = Number(r.rating_count || r.total_reviews) || 0;
  return (
    <Press style={styles.card} onPress={onPress} scaleTo={0.97} haptic={false}>
      <View accessible accessibilityRole="button" accessibilityLabel={`${r.name_ar || ''}${rating ? `، تقييم ${rating.toFixed(1)}` : ''}${r.is_open ? '' : '، مغلق'}`}>
        <View style={styles.imgBox}>
          {(r.cover_image || r.logo)
            ? <Image source={{ uri: r.cover_image || r.logo }} style={styles.image} />
            : <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.image, styles.imgFallback]}>
                <Ionicons name="restaurant" size={46} color="rgba(255,255,255,0.85)" />
              </LinearGradient>}
          <LinearGradient colors={COLORS.gradients.scrim} style={styles.scrim} pointerEvents="none" />
          {rating > 0 && (
            <View style={styles.ratePill}>
              <Ionicons name="star" size={12} color="#FFB020" />
              <Text style={styles.ratePillText}>{rating.toFixed(1)}</Text>
              {!!reviews && <Text style={styles.ratePillSub}>({reviews > 999 ? '999+' : reviews})</Text>}
            </View>
          )}
          {!!r.is_featured && (
            <LinearGradient colors={COLORS.gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.featuredBadge}>
              <Ionicons name="sparkles" size={11} color="#FFF" />
              <Text style={styles.featuredText}>مميز</Text>
            </LinearGradient>
          )}
          {/* شرائح الوقت على الصورة */}
          <View style={styles.timeChip}>
            <Ionicons name="time" size={12} color={COLORS.primary} />
            <Text style={[styles.timeChipTxt, { color: COLORS.text }]}>{r.delivery_time_min || 20}-{r.delivery_time_max || 40} د</Text>
          </View>
          {!r.is_open && (
            <View style={styles.closedOverlay}>
              <View style={styles.closedPill}><Ionicons name="moon" size={13} color="#FFF" /><Text style={styles.closedText}>مغلق حالياً</Text></View>
            </View>
          )}
        </View>

        <View style={styles.info}>
          <View style={styles.row}>
            {r.logo ? <Image source={{ uri: r.logo }} style={styles.logo} /> : null}
            <View style={{ flex: 1, marginRight: r.logo ? 10 : 0 }}>
              <Text style={styles.name} numberOfLines={1}>{r.name_ar}</Text>
              {!!r.category_name && <Text style={styles.category} numberOfLines={1}>{r.category_name}</Text>}
            </View>
            {!!r.discount_available && (
              <View style={styles.discountBadge}><Ionicons name="pricetag" size={11} color={COLORS.primary} /><Text style={styles.discountText}>خصم</Text></View>
            )}
          </View>

          <View style={styles.stats}>
            {/* رسوم التوصيل الفعلية تُحسب حسب المسافة لعنوانك */}
            <View style={styles.chip}><Ionicons name="bicycle" size={13} color={COLORS.primary} /><Text style={styles.statText}>التوصيل حسب المسافة</Text></View>
            {!!r.distance_km && (
              <View style={styles.chip}><Ionicons name="navigate" size={12} color={COLORS.primary} /><Text style={styles.statText}>{r.distance_km} كم</Text></View>
            )}
          </View>
        </View>
      </View>
    </Press>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 24, marginBottom: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, ...COLORS.shadow.card },
  imgBox: { width: '100%', height: 168, position: 'relative' },
  image: { width: '100%', height: 168, resizeMode: 'cover', backgroundColor: COLORS.inputBg },
  imgFallback: { alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  closedOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,11,18,0.55)', justifyContent: 'center', alignItems: 'center' },
  closedPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  closedText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  featuredBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  featuredText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  ratePill: { position: 'absolute', top: 12, right: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: 'rgba(11,11,18,0.62)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  ratePillText: { color: '#FFF', fontSize: 12.5, fontWeight: '800' },
  ratePillSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '500' },
  timeChip: { position: 'absolute', bottom: 10, left: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: COLORS.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, ...COLORS.shadow.soft },
  timeChipTxt: { fontSize: 12, fontWeight: '800' },
  info: { padding: 14, paddingTop: 12 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  logo: { width: 46, height: 46, borderRadius: 14, borderWidth: 2, borderColor: COLORS.card, backgroundColor: COLORS.inputBg, marginTop: -30, ...COLORS.shadow.soft },
  name: { fontSize: 16.5, fontWeight: '800', color: COLORS.text, textAlign: 'right' },
  category: { fontSize: 12.5, color: COLORS.gray, marginTop: 2, textAlign: 'right', fontWeight: '500' },
  discountBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, backgroundColor: COLORS.tint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  discountText: { color: COLORS.primary, fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: COLORS.inputBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statText: { fontSize: 12, color: COLORS.sub, fontWeight: '500' },
});
