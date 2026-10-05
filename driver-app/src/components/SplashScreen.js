import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet, StatusBar, Easing, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GRADIENTS } from '../theme';

const { width } = Dimensions.get('window');
const BAR_W = Math.min(width * 0.5, 220);

// شاشة البداية (JS) — تُعرض بعد تحميل الخطوط، ثم يُخفى السبلاش الأصلي بلا وميض
export default function SplashScreen({ onFinish, onReady }) {
  const enter = useRef(new Animated.Value(0)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const orbit = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loops = [];
    let done = false;
    const finish = () => { if (!done) { done = true; setTimeout(() => onFinish && onFinish(), 120); } };
    const safety = setTimeout(finish, 2600); // احتياط: لا نعلق على السبلاش أبداً
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduced) => {
      if (reduced) {
        enter.setValue(1); logo.setValue(1); word.setValue(1); bar.setValue(1);
        setTimeout(finish, 500);
        return;
      }
      Animated.sequence([
        Animated.parallel([
          Animated.timing(enter, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.spring(logo, { toValue: 1, damping: 11, stiffness: 160, useNativeDriver: true }),
        ]),
        Animated.timing(word, { toValue: 1, duration: 360, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
      ]).start();
      loops = [
        Animated.loop(Animated.sequence([
          Animated.timing(ring, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])),
        Animated.loop(Animated.timing(orbit, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })),
      ];
      loops.forEach(l => l.start());
      Animated.timing(bar, { toValue: 1, duration: 1000, delay: 200, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true }).start(finish);
    });
    return () => { clearTimeout(safety); loops.forEach(l => l.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoScale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const logoRot = logo.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] });
  const wordY = word.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const orbitRot = orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // الشريط يمتلئ من اليمين (RTL) عبر scaleX من نقطة يمينية
  const barX = bar.interpolate({ inputRange: [0, 1], outputRange: [BAR_W, 0] });

  return (
    <View style={styles.container} onLayout={onReady}>
      <StatusBar backgroundColor="transparent" translucent barStyle="light-content" />
      <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <Animated.View style={[styles.inner, { opacity: enter }]}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
          <Animated.View style={[styles.orbit, { transform: [{ rotate: orbitRot }] }]}>
            <View style={styles.orbitDot} />
          </Animated.View>
          <Animated.View style={[styles.logoBadge, { transform: [{ scale: logoScale }, { rotate: logoRot }] }]}>
            <LinearGradient colors={GRADIENTS.glass} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <MaterialCommunityIcons name="moped" size={58} color="#FFF" />
          </Animated.View>
        </View>

        <Animated.Text style={[styles.name, { opacity: word, transform: [{ translateY: wordY }] }]}>وصلّي</Animated.Text>
        <Animated.View style={[styles.tagPill, { opacity: word }]}>
          <View style={styles.tagDot} />
          <Text style={styles.tag}>كابتن التوصيل</Text>
        </Animated.View>

        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { transform: [{ translateX: barX }] }]}>
            <LinearGradient colors={['rgba(255,255,255,0.75)', '#FFFFFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </Animated.View>

      <Text style={styles.bottom}>وصلّي · تطبيق المندوبين</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B00' },
  glowTop: { position: 'absolute', top: -width * 0.4, right: -width * 0.3, width: width * 1.1, height: width * 1.1, borderRadius: width, backgroundColor: 'rgba(255,255,255,0.10)' },
  glowBottom: { position: 'absolute', bottom: -width * 0.35, left: -width * 0.25, width: width * 0.9, height: width * 0.9, borderRadius: width, backgroundColor: 'rgba(255,255,255,0.07)' },
  inner: { alignItems: 'center', width: '100%' },
  logoWrap: { width: 170, height: 170, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  ring: { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.32)' },
  orbit: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderStyle: 'dashed' },
  orbitDot: { position: 'absolute', top: -5, left: 75, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF' },
  logoBadge: { width: 112, height: 112, borderRadius: 36, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 60, fontWeight: '900', color: '#FFFFFF', marginBottom: 10, textShadowColor: 'rgba(0,0,0,0.16)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 12 },
  tagPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', marginBottom: 48 },
  tagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3BDB7E' },
  tag: { fontSize: 15, color: '#FFF', fontWeight: '700' },
  barTrack: { width: BAR_W, height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  barFill: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BAR_W, borderRadius: 3, overflow: 'hidden' },
  bottom: { position: 'absolute', bottom: 48, fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
});
