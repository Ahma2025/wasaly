import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Dimensions, StyleSheet, StatusBar, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { isReducedMotion } from '../utils/motion';

const { width } = Dimensions.get('window');

// شاشة البداية: شعار يرتد + موجتان متّسعتان + اسم يصعد + شريط تقدّم بلمعة
export default function SplashScreen({ onFinish, onReady }) {
  const bar = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const orbs = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const reduce = isReducedMotion();
    if (reduce) {
      fade.setValue(1); logo.setValue(1); word.setValue(1); bar.setValue(1);
      const t = setTimeout(() => onFinish && onFinish(), 500);
      return () => clearTimeout(t);
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(logo, { toValue: 1, damping: 11, stiffness: 160, mass: 0.9, useNativeDriver: true }),
      Animated.timing(word, { toValue: 1, duration: 560, delay: 180, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }),
      Animated.timing(orbs, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ring, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();

    Animated.timing(bar, { toValue: 1, duration: 1000, delay: 200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true })
      .start(() => {
        Animated.timing(exit, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onFinish && onFinish());
      });
    return () => loop.stop();
  }, []);

  const trackW = width * 0.5;
  const barX = bar.interpolate({ inputRange: [0, 1], outputRange: [-trackW, 0] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const logoScale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const logoRot = logo.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] });
  const wordY = word.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const orbY = orbs.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const exitScale = exit.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] });

  return (
    <View style={styles.container} onLayout={onReady}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <LinearGradient colors={['#FF8A00', '#FF5E3A', '#F53B57']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.glowTop, { opacity: orbs, transform: [{ translateY: Animated.multiply(orbY, -1) }] }]} />
      <Animated.View style={[styles.glowBottom, { opacity: orbs, transform: [{ translateY: orbY }] }]} />

      <Animated.View style={[styles.inner, { opacity: Animated.multiply(fade, exit), transform: [{ scale: exitScale }] }]}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]} />
          <Animated.View style={[styles.logoBadge, { transform: [{ scale: logoScale }, { rotate: logoRot }] }]}>
            <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.08)']} style={StyleSheet.absoluteFill} />
            <Ionicons name="bicycle" size={56} color="#FFF" />
          </Animated.View>
        </View>

        <Animated.Text style={[styles.name, { opacity: word, transform: [{ translateY: wordY }] }]}>وصلّي</Animated.Text>
        <Animated.Text style={[styles.tag, { opacity: word }]}>كل اللي بدك ياه… بيوصلك</Animated.Text>

        <View style={[styles.barTrack, { width: trackW }]}>
          <Animated.View style={{ width: trackW, height: '100%', transform: [{ translateX: barX }] }}>
            <LinearGradient colors={['rgba(255,255,255,0.7)', '#FFFFFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.barFill} />
          </Animated.View>
        </View>
      </Animated.View>
      <Text style={styles.bottom}>Wasaly</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF5E3A' },
  glowTop: { position: 'absolute', top: -width * 0.4, right: -width * 0.3, width: width * 1.1, height: width * 1.1, borderRadius: width, backgroundColor: 'rgba(255,255,255,0.10)' },
  glowBottom: { position: 'absolute', bottom: -width * 0.35, left: -width * 0.25, width: width * 0.9, height: width * 0.9, borderRadius: width, backgroundColor: 'rgba(255,255,255,0.08)' },
  inner: { alignItems: 'center', width: '100%' },
  logoWrap: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  ring: { position: 'absolute', width: 104, height: 104, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.35)' },
  logoBadge: { width: 108, height: 108, borderRadius: 36, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 58, fontWeight: '900', color: '#FFFFFF', marginBottom: 6, textShadowColor: 'rgba(0,0,0,0.16)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 14 },
  tag: { fontSize: 16, color: 'rgba(255,255,255,0.92)', fontWeight: '500', marginBottom: 52 },
  barTrack: { height: 5, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  barFill: { flex: 1, borderRadius: 3 },
  bottom: { position: 'absolute', bottom: 46, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 3, fontWeight: '700' },
});
