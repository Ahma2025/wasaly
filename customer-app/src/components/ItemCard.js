import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93' };

export default function ItemCard({ item, onAdd, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.info}>
        <View style={styles.badges}>
          {item.is_new && <View style={styles.badge}><Text style={styles.badgeText}>جديد</Text></View>}
          {item.is_spicy && <Text>🌶️</Text>}
          {item.is_vegetarian && <Text>🌿</Text>}
        </View>
        <Text style={styles.name}>{item.name_ar}</Text>
        {item.description_ar && <Text style={styles.desc} numberOfLines={2}>{item.description_ar}</Text>}
        {item.calories && <Text style={styles.calories}>{item.calories} سعرة</Text>}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{(item.discount_price || item.price).toFixed(2)}₪</Text>
          {item.discount_price && <Text style={styles.originalPrice}>{item.price.toFixed(2)}₪</Text>}
        </View>
      </View>
      <View style={styles.imageWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.image} />
        ) : (
          <View style={[styles.image, { backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 30 }}>🍽️</Text>
          </View>
        )}
        <TouchableOpacity style={styles.addBtn} onPress={onAdd}>
          <Ionicons name="add" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, marginBottom: 12, padding: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  info: { flex: 1, paddingRight: 12 },
  badges: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  badge: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10, color: '#2E7D32', fontWeight: '700' },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  desc: { fontSize: 12, color: COLORS.gray, lineHeight: 18, marginBottom: 6 },
  calories: { fontSize: 11, color: COLORS.gray, marginBottom: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 15, fontWeight: '800', color: COLORS.primary },
  originalPrice: { fontSize: 12, color: COLORS.gray, textDecorationLine: 'line-through' },
  imageWrap: { position: 'relative' },
  image: { width: 90, height: 90, borderRadius: 10 },
  addBtn: { position: 'absolute', bottom: -6, right: -6, backgroundColor: COLORS.primary, borderRadius: 14, width: 28, height: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 }
});
