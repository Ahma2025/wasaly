import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useBump } from './Anim';
import { AnimatedNumber } from './UI';
import { SPRING, SPRING_POP, haptic, isReducedMotion } from '../utils/motion';

// شريط السلة العائم: يدخل بانزلاق، يرتد عند تغيّر العدد، والمجموع يعدّ بحركة
export default function CartBar({ count, total, onPress, hint }) {
  const { colors: COLORS } = useTheme();
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(isReducedMotion() ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const bump = useBump(count, 1.06);
  const badgeBump = useBump(count, 1.4);

  useEffect(() => { Animated.spring(enter, { toValue: 1, ...SPRING }).start(); }, []);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [120, 0] });

  return (
    <Animated.View style={[styles.wrap, { bottom: insets.bottom + 16, opacity: enter, transform: [{ translateY }] }]}>
      <Animated.View style={bump}>
        <Pressable onPress={() => { haptic.medium(); onPress && onPress(); }}
          onPressIn={() => Animated.spring(press, { toValue: 0.97, ...SPRING, stiffness: 320 }).start()}
          onPressOut={() => Animated.spring(press, { toValue: 1, ...SPRING_POP }).start()}
          accessibilityRole="button" accessibilityLabel={`عرض السلة، ${count} صنف، ${Number(total || 0).toFixed(2)} شيكل`}>
          <Animated.View style={[styles.shadow, COLORS.shadow.float, { transform: [{ scale: press }] }]}>
            <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bar}>
              <LinearGradient colors={COLORS.gradients.sheen} style={styles.sheen} pointerEvents="none" />
              <View style={styles.bagWrap}>
                <Ionicons name="bag-handle" size={20} color="#FFF" />
                <Animated.View style={[styles.badge, badgeBump]}><Text style={[styles.badgeText, { color: COLORS.primary }]}>{count}</Text></Animated.View>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 12 }}>
                <Text style={styles.text}>عرض السلة</Text>
                <Text style={styles.hint} numberOfLines={1}>{hint || 'اضغط لإتمام الطلب'}</Text>
              </View>
              <View style={styles.totalPill}>
                <AnimatedNumber value={total} suffix="₪" style={styles.total} />
                <Ionicons name="chevron-back" size={16} color="#FFF" />
              </View>
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  shadow: { borderRadius: 22 },
  bar: { borderRadius: 22, flexDirection: 'row-reverse', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 30 },
  bagWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, left: -5, backgroundColor: '#FFF', borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center' },
  badgeText: { fontWeight: '900', fontSize: 11 },
  text: { color: '#FFF', fontWeight: '900', fontSize: 15.5 },
  hint: { color: 'rgba(255,255,255,0.85)', fontWeight: '500', fontSize: 11.5, marginTop: 1 },
  totalPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.14)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  total: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
