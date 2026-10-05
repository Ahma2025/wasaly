import React, { useRef, useEffect } from 'react';
import { Animated, Pressable, Easing, View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion, isReducedMotion, EASE_OUT, SPRING, SPRING_POP, haptic, stagger } from '../utils/motion';

/* دخول ناعم: تلاشٍ + انزلاق للأعلى — مع تأخير للتتابع (stagger) */
export function FadeIn({ children, delay = 0, from = 16, duration = 380, style, index }) {
  const v = useRef(new Animated.Value(isReducedMotion() ? 1 : 0)).current;
  const d = index != null ? stagger(index) + delay : delay;
  useEffect(() => {
    if (isReducedMotion()) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration, delay: d, easing: EASE_OUT, useNativeDriver: true }).start();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/* تتابع جاهز: يلفّ كل ابن بـ FadeIn بتأخير متزايد (أول 8 فقط تتحرك) */
export function Stagger({ children, step = 50, from = 14, style }) {
  const arr = React.Children.toArray(children);
  return (
    <View style={style}>
      {arr.map((c, i) => (i < 8
        ? <FadeIn key={c.key || i} delay={i * step} from={from}>{c}</FadeIn>
        : <React.Fragment key={c.key || i}>{c}</React.Fragment>))}
    </View>
  );
}

/* دخول بتكبير خفيف (scale + fade) — للبطاقات المميزة */
export function PopIn({ children, delay = 0, style, from = 0.88 }) {
  const v = useRef(new Animated.Value(isReducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion()) { v.setValue(1); return; }
    Animated.spring(v, { toValue: 1, delay, ...SPRING_POP }).start();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] });
  const opacity = v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] });
  return <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/* ضغطة بموشن (scale .96 + haptic) */
export function Press({ children, onPress, onLongPress, style, scaleTo = 0.96, haptic: withHaptic = true, disabled, accessibilityLabel, accessibilityRole, hitSlop }) {
  const scale = useRef(new Animated.Value(1)).current;
  const down = () => Animated.spring(scale, { toValue: scaleTo, ...SPRING, stiffness: 320 }).start();
  const up = () => Animated.spring(scale, { toValue: 1, ...SPRING_POP }).start();
  return (
    <Pressable onPressIn={down} onPressOut={up} disabled={disabled} hitSlop={hitSlop} onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel} accessibilityRole={accessibilityRole}
      onPress={() => { if (withHaptic) haptic.light(); onPress && onPress(); }}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/*
  زر أساسي بتدرّج — حالات: عادي / معطّل / تحميل (يحافظ على العرض) / نجاح (يتحوّل لعلامة صح)
  الواجهة القديمة (title, onPress, icon, style, textStyle, colors, height, disabled) باقية كما هي.
*/
export function GradientButton({ title, onPress, icon, style, textStyle, colors, height = 54, disabled, loading, success, accessibilityLabel }) {
  const { colors: C } = useTheme();
  const g = colors || C.gradients.sunset;
  const morph = useRef(new Animated.Value(success ? 1 : 0)).current;
  useEffect(() => {
    if (success) haptic.success();
    Animated.spring(morph, { toValue: success ? 1 : 0, ...SPRING_POP }).start();
  }, [!!success]);
  const labelOpacity = morph.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const checkScale = morph.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const inactive = disabled || loading;
  return (
    <Press onPress={inactive ? undefined : onPress} disabled={inactive} haptic={!inactive}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel || title}
      style={[{ borderRadius: 18, opacity: disabled && !loading ? 0.55 : 1, ...(disabled ? {} : C.shadow.float) }, style]}>
      <LinearGradient colors={success ? C.gradients.success : g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ height, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <LinearGradient colors={C.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height / 2 }} pointerEvents="none" />
        <Animated.View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0 : labelOpacity }}>
          {icon}
          <Animated.Text style={[{ color: '#FFF', fontWeight: '900', fontSize: 16 }, textStyle]} numberOfLines={1}>{title}</Animated.Text>
        </Animated.View>
        {loading && <View style={{ position: 'absolute' }}><ActivityIndicator color="#FFF" /></View>}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: morph, transform: [{ scale: checkScale }] }}>
          <Ionicons name="checkmark-circle" size={28} color="#FFF" />
        </Animated.View>
      </LinearGradient>
    </Press>
  );
}

/* نبض مستمر خفيف — للعناصر اللافتة */
export function Pulse({ children, style, to = 1.06, duration = 900 }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { v.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, to] });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/* موجة متّسعة (radar) — للحالات الحيّة (سائق بالطريق، بحث عن سائق) */
export function Ripple({ size = 60, color = '#FF6B00', style, count = 2 }) {
  const reduce = useReducedMotion();
  const vals = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduce) return;
    const loops = vals.map((v, i) => {
      const l = Animated.loop(Animated.sequence([
        Animated.delay(i * 700),
        Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
      l.start();
      return l;
    });
    return () => loops.forEach(l => l.stop());
  }, [reduce]);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }],
        }} />
      ))}
    </View>
  );
}

/* اهتزاز أفقي (للأخطاء) — استدعِ shake() من ref */
export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const shake = () => {
    if (isReducedMotion()) return;
    haptic.error();
    Animated.sequence([
      Animated.timing(x, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };
  return [{ transform: [{ translateX: x }] }, shake];
}

/* ارتداد عند تغيّر قيمة (عدّاد السلة، الشارات) */
export function useBump(value, to = 1.18) {
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (isReducedMotion()) return;
    Animated.sequence([
      Animated.spring(s, { toValue: to, ...SPRING_POP, stiffness: 400 }),
      Animated.spring(s, { toValue: 1, ...SPRING_POP }),
    ]).start();
  }, [value]);
  return { transform: [{ scale: s }] };
}
