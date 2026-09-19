import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// عنصر هيكل (placeholder) بلمعان ناعم — بديل دائرة التحميل
export function Skeleton({ w = '100%', h = 14, r = 8, style }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.4, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: colors.mode === 'dark' ? '#2A2A32' : '#E6E6EB', opacity: anim }, style]} />;
}

// هيكل بطاقة مطعم أفقية
export function CardRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton w={64} h={64} r={16} />
      <View style={{ flex: 1, marginHorizontal: 12, gap: 8 }}>
        <Skeleton w={'70%'} h={14} />
        <Skeleton w={'45%'} h={11} />
        <Skeleton w={'30%'} h={11} />
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
          <Skeleton w={'100%'} h={110} r={16} />
          <Skeleton w={'80%'} h={12} style={{ marginTop: 8 }} />
          <Skeleton w={'50%'} h={10} style={{ marginTop: 6 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', padding: 12, marginBottom: 6 },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16 },
  gridCard: { width: '46%' },
});

export default Skeleton;
