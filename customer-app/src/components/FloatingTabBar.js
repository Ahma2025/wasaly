import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';

export const TAB_BAR_HEIGHT = 68;
const BASE_GAP = Platform.OS === 'ios' ? 6 : 12;

// المسافة اللي يحجزها شريط التبويبات العائم من أسفل الشاشة (للأزرار الثابتة وحشوة المحتوى)
export const useTabBarInset = () => {
  const insets = useSafeAreaInsets();
  return insets.bottom + BASE_GAP + TAB_BAR_HEIGHT;
};

const ICONS = {
  'حسابي':    ['person', 'person-outline'],
  'طلباتي':   ['receipt', 'receipt-outline'],
  'ماركت':    ['storefront', 'storefront-outline'],
  'سلتي':     ['bag', 'bag-outline'],
  'بحث':      ['search', 'search-outline'],
  'الرئيسية': ['home', 'home-outline'],
};

function TabButton({ focused, label, onPress, onLongPress, colors: C, badge }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.9)).current;
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1 : 0.9, useNativeDriver: true, speed: 20, bounciness: 12 }),
      Animated.timing(lift, { toValue: focused ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [focused]);

  const [on, off] = ICONS[label] || ['ellipse', 'ellipse-outline'];
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const a11y = badge ? `${label}، ${badge} صنف` : label;

  return (
    <Pressable style={styles.item} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} onLongPress={onLongPress}
      accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={a11y}>
      <Animated.View style={{ transform: [{ scale }, { translateY }], alignItems: 'center' }}>
        <View>
          {focused ? (
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.activePill, C.shadow.glow]}>
              <Ionicons name={on} size={21} color="#FFF" />
            </LinearGradient>
          ) : (
            <View style={styles.inactive}>
              <Ionicons name={off} size={21} color={C.faint} />
            </View>
          )}
          {!!badge && (
            <View style={[styles.badge, { borderColor: C.card }]}>
              <Text style={styles.badgeTxt}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color: focused ? C.primary : C.faint, fontWeight: focused ? '800' : '600' }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function FloatingTabBar({ state, navigation }) {
  const { colors: C } = useTheme();
  const { count } = useCart();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[styles.wrap, { bottom: insets.bottom + BASE_GAP, backgroundColor: C.card, borderColor: C.border, ...C.shadow.card }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
        return (
          <TabButton key={route.key} focused={focused} label={route.name} onPress={onPress} onLongPress={onLongPress}
            colors={C} badge={route.name === 'سلتي' && count > 0 ? count : 0} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    height: TAB_BAR_HEIGHT, borderRadius: 28, borderWidth: 1, paddingHorizontal: 4,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  activePill: { width: 42, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  inactive: { width: 42, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, marginTop: 2 },
  badge: { position: 'absolute', top: -5, right: -7, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  badgeTxt: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
