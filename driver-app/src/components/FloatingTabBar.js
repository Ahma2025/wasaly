import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS, SHADOW, TAB_BAR_HEIGHT } from '../theme';

const ICONS = {
  'الرئيسية': ['home', 'home-outline'],
  'الأرباح':  ['wallet', 'wallet-outline'],
  'الطلبات':  ['list', 'list-outline'],
  'حسابي':    ['person', 'person-outline'],
};

// المسافة من أسفل الشاشة لشريط التبويب (تُستخدم لحساب مسافات المحتوى والزر العائم)
export function useTabBarOffset() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10) + 8;
  return { bottom, height: TAB_BAR_HEIGHT, contentPadding: bottom + TAB_BAR_HEIGHT + 20 };
}

function TabButton({ focused, label, onPress }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.9)).current;
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1 : 0.9, useNativeDriver: true, speed: 20, bounciness: 12 }),
      Animated.timing(lift, { toValue: focused ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [focused, scale, lift]);
  const [on, off] = ICONS[label] || ['ellipse', 'ellipse-outline'];
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });
  return (
    <Pressable style={styles.item} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}>
      <Animated.View style={{ transform: [{ scale }, { translateY }], alignItems: 'center' }}>
        {focused ? (
          <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.pill, SHADOW.glow]}>
            <Ionicons name={on} size={22} color="#FFF" />
          </LinearGradient>
        ) : (
          <View style={styles.pill}><Ionicons name={off} size={22} color={COLORS.faint} /></View>
        )}
        <Text style={[styles.label, { color: focused ? COLORS.primary : COLORS.faint, fontWeight: focused ? '800' : '600' }]} numberOfLines={1}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function FloatingTabBar({ state, navigation }) {
  const { bottom } = useTabBarOffset();
  return (
    <View style={[styles.wrap, { bottom }, SHADOW.card]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return <TabButton key={route.key} focused={focused} label={route.name} onPress={onPress} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 14, right: 14,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-around',
    height: TAB_BAR_HEIGHT, borderRadius: 30, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  pill: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10.5, marginTop: 2 },
});
