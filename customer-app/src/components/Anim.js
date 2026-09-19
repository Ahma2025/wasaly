import React, { useRef, useEffect } from 'react';
import { Animated, Pressable, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

/* دخول ناعم: تلاشٍ + انزلاق للأعلى — مع تأخير للتتابع (stagger) */
export function FadeIn({ children, delay = 0, from = 16, duration = 420, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/* دخول بتكبير خفيف (scale + fade) — للبطاقات المميزة */
export function PopIn({ children, delay = 0, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 12, bounciness: 8 }).start();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  return <Animated.View style={[style, { opacity: v, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/* ضغطة بموشن (scale down + haptic) */
export function Press({ children, onPress, style, scaleTo = 0.96, haptic = true }) {
  const scale = useRef(new Animated.Value(1)).current;
  const down = () => Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50 }).start();
  const up = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  return (
    <Pressable onPressIn={down} onPressOut={up} onPress={() => { if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress && onPress(); }}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/* زر أساسي بتدرّج لوني فخم + موشن ضغط */
export function GradientButton({ title, onPress, icon, style, textStyle, colors, height = 54, disabled }) {
  const { colors: C } = useTheme();
  const g = colors || C.gradients.sunset;
  return (
    <Press onPress={disabled ? undefined : onPress} style={[{ borderRadius: 18, overflow: 'hidden', opacity: disabled ? 0.6 : 1 }, style]}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ height, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...C.shadow.float }}>
        {icon}
        <Animated.Text style={[{ color: '#FFF', fontWeight: '900', fontSize: 16 }, textStyle]}>{title}</Animated.Text>
      </LinearGradient>
    </Press>
  );
}

/* نبض مستمر خفيف — للعناصر اللافتة */
export function Pulse({ children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
