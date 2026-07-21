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
  wrap: { position: 'absolute', bottom: 22, left: 16, right: 16 },
  bar: { backgroundColor: '#FF6B00', borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 18, elevation: 10, shadowColor: '#FF6B00', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  badge: { backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 13, minWidth: 26, height: 26, paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  text: { flex: 1, color: '#FFF', fontWeight: '800', fontSize: 15, textAlign: 'center', letterSpacing: 0.3 },
  total: { color: '#FFF', fontWeight: '900', fontSize: 16 }
});
