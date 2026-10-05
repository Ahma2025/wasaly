import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS, SHADOW, TAB_BAR_HEIGHT, RADIUS } from '../theme';
import { haptic, isReducedMotion } from './Anim';

const ICONS = {
  'الرئيسية': ['home', 'home-outline'],
  'الأرباح':  ['wallet', 'wallet-outline'],
  'الطلبات':  ['receipt', 'receipt-outline'],
  'حسابي':    ['person', 'person-outline'],
};

const PAD = 6;
// المسافة من أسفل الشاشة لشريط التبويب (تُستخدم لحساب مسافات المحتوى والزر العائم)
export function useTabBarOffset() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10) + 8;
  return { bottom, height: TAB_BAR_HEIGHT, contentPadding: bottom + TAB_BAR_HEIGHT + 20 };
}

function TabButton({ focused, label, onPress, onLongPress }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (isReducedMotion()) { v.setValue(focused ? 1 : 0); return; }
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, damping: 16, stiffness: 220 }).start();
  }, [focused, v]);
  const [on, off] = ICONS[label] || ['ellipse', 'ellipse-outline'];
  const pillScale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <Pressable style={styles.item} onPress={onPress} onLongPress={onLongPress}
      accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}>
      <Animated.View pointerEvents="none" style={[styles.pillWrap, { opacity: v, transform: [{ scale: pillScale }] }]}>
        <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.pill, SHADOW.glow]}>
          <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.pillSheen} />
        </LinearGradient>
      </Animated.View>
      <Ionicons name={focused ? on : off} size={22} color={focused ? '#FFF' : COLORS.gray} />
      <Text style={[styles.label, { color: focused ? '#FFF' : COLORS.gray, fontWeight: focused ? '800' : '500' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function FloatingTabBar({ state, navigation }) {
  const { bottom } = useTabBarOffset();
  return (
    <View style={[styles.wrap, { bottom, flexDirection: I18nManager.isRTL ? 'row' : 'row-reverse' }, SHADOW.card]} accessibilityRole="tablist">
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) { haptic.select(); navigation.navigate(route.name); }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
        return <TabButton key={route.key} focused={focused} label={route.name} onPress={onPress} onLongPress={onLongPress} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 14, right: 14,
    flexDirection: 'row-reverse', alignItems: 'center',
    height: TAB_BAR_HEIGHT, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: PAD,
  },
  pillWrap: { position: 'absolute', top: 6, bottom: 6, left: 2, right: 2 },
  pill: { flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: COLORS.primary },
  pillSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  label: { fontSize: 11, marginTop: 3 },
});
