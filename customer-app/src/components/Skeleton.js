import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../utils/motion';

/*
  لمعان (shimmer) موحّد: ساعة واحدة مشتركة لكل الهياكل في الشاشة
  حتى تمشي اللمعة متزامنة عبر كل البطاقات (إحساس أنظف وأقل استهلاكاً)
*/
const clock = new Animated.Value(0);
let running = 0;
let loop = null;
function useShimmerClock(reduce) {
  useEffect(() => {
    if (reduce) return;
    running += 1;
    if (running === 1) {
      clock.setValue(0);
      loop = Animated.loop(Animated.timing(clock, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
      loop.start();
    }
    return () => { running -= 1; if (running === 0 && loop) { loop.stop(); loop = null; } };
  }, [reduce]);
  return clock;
}

// عنصر هيكل (placeholder) بلمعة تمرّ عليه — بديل دائرة التحميل
export function Skeleton({ w = '100%', h = 14, r = 8, style }) {
  const { colors: C, isDark } = useTheme();
  const reduce = useReducedMotion();
  const t = useShimmerClock(reduce);
  const [width, setWidth] = useState(0);
  const translateX = t.interpolate({ inputRange: [0, 1], outputRange: [width, -width] }); // RTL: اللمعة من اليمين لليسار
  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={[{ width: w, height: h, borderRadius: r, backgroundColor: C.skeleton, overflow: 'hidden' }, style]}>
      {!reduce && width > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={[C.skeleton, isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)', C.skeleton]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

// اسم بديل أوضح
export const Shimmer = Skeleton;

// هيكل بطاقة مطعم أفقية
export function CardRowSkeleton() {
  const { colors: C } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: C.card, borderColor: C.border }]}>
      <Skeleton w={66} h={66} r={18} />
      <View style={{ flex: 1, marginHorizontal: 12, gap: 8, alignItems: 'flex-end' }}>
        <Skeleton w={'70%'} h={14} />
        <Skeleton w={'45%'} h={11} />
        <Skeleton w={'30%'} h={11} />
      </View>
    </View>
  );
}

// بطاقة مطعم كبيرة (صورة + سطور)
export function HeroCardSkeleton() {
  const { colors: C } = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: C.card, borderColor: C.border }]}>
      <Skeleton w={'100%'} h={156} r={0} />
      <View style={{ padding: 14, gap: 8, alignItems: 'flex-end' }}>
        <Skeleton w={'55%'} h={15} />
        <Skeleton w={'80%'} h={11} />
      </View>
    </View>
  );
}

// شبكة بطاقات (grid)
export function GridSkeleton({ count = 6 }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.gridCard}>
          <Skeleton w={'100%'} h={110} r={18} />
          <Skeleton w={'80%'} h={12} style={{ marginTop: 10, alignSelf: 'flex-end' }} />
          <Skeleton w={'50%'} h={10} style={{ marginTop: 6, alignSelf: 'flex-end' }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', padding: 12, marginBottom: 10, marginHorizontal: 0, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  hero: { borderRadius: 22, overflow: 'hidden', marginBottom: 16, borderWidth: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  gridCard: { width: '46%' },
});

export default Skeleton;
