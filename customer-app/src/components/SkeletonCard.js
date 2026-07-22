import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function SkeletonCard() {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.3, duration: 800, useNativeDriver: true })
    ])).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: anim }]}>
      <View style={styles.image} />
      <View style={styles.info}>
        <View style={styles.line} />
        <View style={[styles.line, { width: '60%' }]} />
        <View style={[styles.line, { width: '40%' }]} />
      </View>
    </Animated.View>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  image: { width: '100%', height: 140, backgroundColor: COLORS.border },
  info: { padding: 12, gap: 8 },
  line: { height: 12, backgroundColor: COLORS.border, borderRadius: 6, width: '80%' }
});
