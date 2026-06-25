import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function CartBar({ count, total, onPress }) {
  return (
    <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>
      <Text style={styles.text}>عرض السلة</Text>
      <Text style={styles.total}>{total.toFixed(2)}₪</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', bottom: 20, left: 16, right: 16, backgroundColor: '#FF6B00', borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, elevation: 8, shadowColor: '#FF6B00', shadowOpacity: 0.4, shadowRadius: 10 },
  badge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  text: { flex: 1, color: '#FFF', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  total: { color: '#FFF', fontWeight: '800', fontSize: 15 }
});
