import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Press } from './Anim';
import { useTheme } from '../context/ThemeContext';

export default function ItemCard({ item, onAdd, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const price = parseFloat(item.price || 0);
  const disc = parseFloat(item.discount_price || 0);
  const hasDiscount = disc > 0 && disc < price;
  const shown = hasDiscount ? disc : price;
  return (
    <Press style={styles.card} onPress={onPress} scaleTo={0.97} haptic={false}>
      <View style={styles.row} accessible accessibilityRole="button" accessibilityLabel={`${item.name_ar}، ${shown.toFixed(2)} شيكل`}>
        <View style={styles.imageWrap}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.image} />
          ) : (
            <View style={[styles.image, { backgroundColor: COLORS.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
              <Text style={{ fontSize: 30 }}>🍽️</Text>
            </View>
          )}
          {hasDiscount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{Math.round((1 - disc / price) * 100)}%</Text>
            </View>
          )}
          <TouchableOpacity style={styles.addBtn} onPress={onAdd} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`أضف ${item.name_ar}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtnGrad}>
              <Ionicons name="add" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <View style={styles.info}>
          <View style={styles.badges}>
            {(!!item.is_popular || !!item.is_bestseller) && <View style={[styles.badge, styles.badgeHot]}><Text style={styles.badgeHotText}>🔥 الأكثر طلباً</Text></View>}
            {!!item.is_new && <View style={[styles.badge, styles.badgeNew]}><Text style={styles.badgeText}>✨ جديد</Text></View>}
            {!!item.is_spicy && <Text>🌶️</Text>}
            {!!item.is_vegetarian && <Text>🌿</Text>}
          </View>
          <Text style={styles.name}>{item.name_ar}</Text>
          {!!item.description_ar && <Text style={styles.desc} numberOfLines={2}>{item.description_ar}</Text>}
          {!!item.calories && <Text style={styles.calories}>{item.calories} سعرة</Text>}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{shown.toFixed(2)}₪</Text>
            {hasDiscount && <Text style={styles.originalPrice}>{price.toFixed(2)}₪</Text>}
          </View>
        </View>
      </View>
    </Press>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 20, marginBottom: 12, padding: 12, ...COLORS.shadow.soft },
  row: { flexDirection: 'row-reverse' },
  info: { flex: 1, paddingLeft: 12 },
  badges: { flexDirection: 'row-reverse', gap: 4, marginBottom: 4, flexWrap: 'wrap' },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeNew: { backgroundColor: COLORS.successBg },
  badgeText: { fontSize: 10, color: COLORS.successText, fontWeight: '800' },
  badgeHot: { backgroundColor: COLORS.tint },
  badgeHotText: { fontSize: 10, color: COLORS.primary, fontWeight: '800' },
  discountBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#FF3B30', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, elevation: 3 },
  discountText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 4, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.gray, lineHeight: 18, marginBottom: 6, textAlign: 'right' },
  calories: { fontSize: 11, color: COLORS.gray, marginBottom: 6, textAlign: 'right' },
  priceRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  price: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  originalPrice: { fontSize: 12, color: COLORS.gray, textDecorationLine: 'line-through' },
  imageWrap: { position: 'relative' },
  image: { width: 94, height: 94, borderRadius: 16 },
  addBtn: { position: 'absolute', bottom: -8, left: -8, borderRadius: 17, borderWidth: 2, borderColor: COLORS.card, ...COLORS.shadow.float },
  addBtnGrad: { width: 34, height: 34, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
});
