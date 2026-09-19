import React, { useRef, useEffect } from 'react';
import { Animated, Pressable, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';

export function FadeIn({ children, delay = 0, from = 16, duration = 420, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export function PopIn({ children, delay = 0, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 12, bounciness: 8 }).start();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });
  return <Animated.View style={[style, { opacity: v, transform: [{ scale }] }]}>{children}</Animated.View>;
}

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

export function Pulse({ children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
