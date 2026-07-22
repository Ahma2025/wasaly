import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function ItemCard({ item, onAdd, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.info}>
        <View style={styles.badges}>
          {(!!item.is_popular || !!item.is_bestseller) && <View style={[styles.badge, styles.badgeHot]}><Text style={styles.badgeHotText}>🔥 الأكثر طلباً</Text></View>}
          {!!item.is_new && <View style={styles.badge}><Text style={styles.badgeText}>✨ جديد</Text></View>}
          {!!item.is_spicy && <Text>🌶️</Text>}
          {!!item.is_vegetarian && <Text>🌿</Text>}
        </View>
        <Text style={styles.name}>{item.name_ar}</Text>
        {!!item.description_ar && <Text style={styles.desc} numberOfLines={2}>{item.description_ar}</Text>}
        {!!item.calories && <Text style={styles.calories}>{item.calories} سعرة</Text>}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{parseFloat(item.discount_price || item.price || 0).toFixed(2)}₪</Text>
          {!!item.discount_price && <Text style={styles.originalPrice}>{parseFloat(item.price || 0).toFixed(2)}₪</Text>}
        </View>
      </View>
      <View style={styles.imageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: COLORS.inputBg, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 30 }}>🍽️</Text>
          </View>
        )}
        {!!item.discount_price && parseFloat(item.price) > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{Math.round((1 - parseFloat(item.discount_price) / parseFloat(item.price)) * 100)}%</Text>
          </View>
        )}
        <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 16, marginBottom: 12, padding: 12, borderWidth: 1, borderColor: COLORS.line, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  info: { flex: 1, paddingRight: 12 },
  badges: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  badge: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '800' },
  badgeHot: { backgroundColor: '#FFF0E8' },
  badgeHotText: { fontSize: 10, color: '#FF6B00', fontWeight: '800' },
  discountBadge: { position: 'absolute', top: -4, left: -4, backgroundColor: '#FF3B30', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, elevation: 3, shadowColor: '#FF3B30', shadowOpacity: 0.4, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  discountText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  desc: { fontSize: 12, color: COLORS.gray, lineHeight: 18, marginBottom: 6 },
  calories: { fontSize: 11, color: COLORS.gray, marginBottom: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  originalPrice: { fontSize: 12, color: COLORS.gray, textDecorationLine: 'line-through' },
  imageWrap: { position: 'relative' },
  image: { width: 92, height: 92, borderRadius: 14 },
  addBtn: { position: 'absolute', bottom: -8, right: -8, backgroundColor: COLORS.primary, borderRadius: 16, width: 32, height: 32, justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: COLORS.primary, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, borderWidth: 2, borderColor: COLORS.card }
});
