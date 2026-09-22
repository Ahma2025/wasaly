import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet, StatusBar, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function SplashScreen({ onFinish }) {
  const barAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoRise = useRef(new Animated.Value(20)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, speed: 8, bounciness: 12, useNativeDriver: true }),
      Animated.timing(logoRise, { toValue: 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    Animated.loop(Animated.sequence([
      Animated.timing(ringPulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(ringPulse, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])).start();

    Animated.timing(barAnim, { toValue: 1, duration: 1800, delay: 300, useNativeDriver: false })
      .start(() => setTimeout(() => onFinish && onFinish(), 300));
  }, []);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: [0, width * 0.6] });
  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#FF7A1A" barStyle="light-content" />
      <LinearGradient colors={['#FF8A00', '#FF5E3A', '#F53B57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* دوائر ضوء زخرفية */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
        {/* شعار بحلقة نبض */}
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
          <Animated.View style={[styles.logoBadge, { transform: [{ scale: logoScale }, { translateY: logoRise }] }]}>
            <Text style={styles.logoEmoji}>🛵</Text>
          </Animated.View>
        </View>

        <Animated.Text style={[styles.name, { transform: [{ translateY: logoRise }] }]}>وصلّي</Animated.Text>
        <Text style={styles.tag}>طلبك وصلنا 🚀</Text>

        <View style={styles.barTrack}>
          <Animated.View style={{ width: barWidth, height: '100%' }}>
            <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0.85)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.barFill} />
          </Animated.View>
        </View>

        <Text style={styles.bottom}>WSSELY DELIVERY</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5E3A' },
  glowTop: { position: 'absolute', top: -width * 0.4, right: -width * 0.3, width: width * 1.1, height: width * 1.1, borderRadius: width, backgroundColor: 'rgba(255,255,255,0.10)' },
  glowBottom: { position: 'absolute', bottom: -width * 0.35, left: -width * 0.25, width: width * 0.9, height: width * 0.9, borderRadius: width, backgroundColor: 'rgba(255,255,255,0.08)' },
  inner: { alignItems: 'center', width: '100%' },
  logoWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  ring: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.35)' },
  logoBadge: { width: 104, height: 104, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 54 },
  name: { fontSize: 60, fontWeight: '900', color: '#FFFFFF', marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 },
  tag: { fontSize: 18, color: 'rgba(255,255,255,0.92)', fontWeight: '600', marginBottom: 56 },
  barTrack: { width: width * 0.6, height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  bottom: { fontSize: 11, color: 'rgba(255,255,255,0.55)', letterSpacing: 4, position: 'absolute', bottom: -120, fontWeight: '700' },
});
