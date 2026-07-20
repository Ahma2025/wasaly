import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Animated } from 'react-native';

export default function CartBar({ count, total, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(count);

  // اهتزاز خفيف عند تغيّر عدد الأصناف
  useEffect(() => {
    if (count !== prevCount.current) {
      prevCount.current = count;
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, useNativeDriver: true, speed: 50 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }),
      ]).start();
    }
  }, [count]);

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale }] }]}>
      <TouchableOpacity style={styles.bar} onPress={onPress} activeOpacity={0.9}>
        <View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>
        <Text style={styles.text}>عرض السلة</Text>
        <Text style={styles.total}>{total.toFixed(2)}₪</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 20, left: 16, right: 16 },
  bar: { backgroundColor: '#FF6B00', borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, elevation: 8, shadowColor: '#FF6B00', shadowOpacity: 0.4, shadowRadius: 10 },
  badge: { backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  text: { flex: 1, color: '#FFF', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  total: { color: '#FFF', fontWeight: '800', fontSize: 15 }
});
