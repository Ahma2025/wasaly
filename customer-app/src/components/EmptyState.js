import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PopIn, FadeIn, GradientButton } from './Anim';
import { useTheme } from '../context/ThemeContext';
import { useReducedMotion } from '../utils/motion';

// الإيموجي القديم → أيقونة Ionicons متّسقة (الإيموجي يبقى زينة صغيرة فقط)
const ICON_FOR = {
  '🧾': 'receipt-outline', '💔': 'heart-dislike-outline', '📍': 'location-outline', '📡': 'cloud-offline-outline',
  '🔍': 'search-outline', '🔎': 'search-outline', '😕': 'alert-circle-outline', '🍽️': 'restaurant-outline',
  '🔔': 'notifications-outline', '🏪': 'storefront-outline', '🛒': 'bag-handle-outline', '❤️': 'heart-outline',
};
const ERROR_EMOJI = new Set(['📡', '😕']);

/*
  حالة فارغة بأسلوب "رسم توضيحي": كتلة متدرّجة + دوائر طافية + أيقونة كبيرة + عنوان + وصف + زر
  props القديمة باقية: emoji, title, subtitle, ctaLabel, onCta — وأضفنا icon و tone اختياريين
*/
export default function EmptyState({ emoji = '🍽️', icon, title, subtitle, ctaLabel, onCta, tone }) {
  const { colors: C } = useTheme();
  const reduce = useReducedMotion();
  const float = useRef(new Animated.Value(0)).current;
  const isError = tone === 'error' || ERROR_EMOJI.has(emoji);
  const name = icon || ICON_FOR[emoji] || 'sparkles-outline';
  const grad = isError ? ['#FFB4A8', '#F04438'] : C.gradients.sunset;

  useEffect(() => {
    if (reduce) return;
    const l = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [reduce]);
  const ty = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const ty2 = float.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });

  return (
    <View style={styles.wrap}>
      <PopIn>
        <View style={styles.art}>
          <View style={[styles.blob, { backgroundColor: C.tint }]} />
          <Animated.View style={[styles.orb1, { backgroundColor: isError ? C.dangerBg : C.tintBorder, transform: [{ translateY: ty2 }] }]} />
          <Animated.View style={[styles.orb2, { backgroundColor: C.primary + '33', transform: [{ translateY: ty }] }]} />
          <Animated.View style={{ transform: [{ translateY: ty }] }}>
            <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.iconTile, C.shadow.float]}>
              <LinearGradient colors={C.gradients.sheen} style={styles.tileSheen} pointerEvents="none" />
              <Ionicons name={name} size={46} color="#FFF" />
            </LinearGradient>
          </Animated.View>
          {!!emoji && !icon && <Text style={styles.emojiAccent}>{emoji}</Text>}
        </View>
      </PopIn>
      <FadeIn delay={120}>
        {!!title && <Text style={[styles.title, { color: C.text }]} accessibilityRole="header">{title}</Text>}
        {!!subtitle && <Text style={[styles.sub, { color: C.gray }]}>{subtitle}</Text>}
      </FadeIn>
      {!!ctaLabel && (
        <FadeIn delay={220} style={{ marginTop: 6 }}>
          <GradientButton title={ctaLabel} onPress={onCta} height={50} style={{ minWidth: 190 }} textStyle={{ fontSize: 15 }} />
        </FadeIn>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30 },
  art: { width: 180, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  blob: { position: 'absolute', width: 150, height: 140, borderRadius: 70, transform: [{ rotate: '-12deg' }, { scaleX: 1.15 }] },
  orb1: { position: 'absolute', width: 26, height: 26, borderRadius: 13, top: 12, right: 18 },
  orb2: { position: 'absolute', width: 16, height: 16, borderRadius: 8, bottom: 22, left: 22 },
  iconTile: { width: 96, height: 96, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 48 },
  emojiAccent: { position: 'absolute', bottom: 10, right: 26, fontSize: 26 },
  title: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  sub: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 22, marginTop: 4, paddingHorizontal: 16 },
});
