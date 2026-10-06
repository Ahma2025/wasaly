import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Platform, I18nManager, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';
import { useBump } from './Anim';
import { SPRING, haptic, isReducedMotion } from '../utils/motion';
import { plural } from '../utils/plural';

export const TAB_BAR_HEIGHT = 68;
const BASE_GAP = Platform.OS === 'ios' ? 6 : 12;
const PILL_W = 46;
const PILL_H = 40;

// المسافة اللي يحجزها شريط التبويبات العائم من أسفل الشاشة (للأزرار الثابتة وحشوة المحتوى)
export const useTabBarInset = () => {
  const insets = useSafeAreaInsets();
  return insets.bottom + BASE_GAP + TAB_BAR_HEIGHT;
};

const ICONS = {
  'حسابي':    ['person', 'person-outline'],
  'طلباتي':   ['receipt', 'receipt-outline'],
  'ماركت':    ['storefront', 'storefront-outline'],
  'سلتي':     ['bag-handle', 'bag-handle-outline'],
  'بحث':      ['search', 'search-outline'],
  'الرئيسية': ['home', 'home-outline'],
};

function CartBadge({ count, C }) {
  const bump = useBump(count, 1.35);
  if (!count) return null;
  return (
    <Animated.View style={[styles.badge, { borderColor: C.card }, bump]}>
      <Text style={styles.badgeTxt}>{count > 99 ? '99+' : count}</Text>
    </Animated.View>
  );
}

function TabButton({ focused, label, onPress, onLongPress, colors: C, badge }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, ...SPRING }).start();
  }, [focused]);

  const [on, off] = ICONS[label] || ['ellipse', 'ellipse-outline'];
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.04] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, 0] });
  const a11y = badge ? `${label}، ${plural(badge, 'item')}` : label;

  return (
    <Pressable style={styles.item} onPress={() => { haptic.select(); onPress(); }} onLongPress={onLongPress}
      accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={a11y}>
      <Animated.View style={{ transform: [{ scale }, { translateY }], alignItems: 'center' }}>
        <View style={styles.iconBox}>
          <Animated.View pointerEvents="none" style={[styles.pill, C.shadow.glow, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }]}>
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pillGrad}>
              <LinearGradient colors={C.gradients.sheen} style={styles.pillSheen} />
            </LinearGradient>
          </Animated.View>
          <Ionicons name={focused ? on : off} size={21} color={focused ? '#FFF' : C.faint} />
          {label === 'سلتي' && <CartBadge count={badge} C={C} />}
        </View>
        <Text style={[styles.label, { color: focused ? C.primary : C.faint, fontWeight: focused ? '800' : '500' }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// إظهار/إخفاء الشريط مع الكيبورد (tabBarHideOnKeyboard ما بيشتغل مع tabBar مخصّص)
export function useKeyboardVisible() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEv, () => setShown(true));
    const b = Keyboard.addListener(hideEv, () => setShown(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return shown;
}

export default function FloatingTabBar({ state, navigation, descriptors }) {
  const { colors: C, isDark } = useTheme();
  const { count } = useCart();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardVisible();
  const focusedOpts = descriptors?.[state.routes[state.index]?.key]?.options || {};
  const hideOnKb = focusedOpts.tabBarHideOnKeyboard !== false;

  if (kb && hideOnKb) return null;

  return (
    <View accessibilityRole="tablist"
      style={[styles.wrap, { flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', bottom: insets.bottom + BASE_GAP, backgroundColor: isDark ? C.elev : C.card, borderColor: C.border, ...C.shadow.card }]}>
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
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4,
    height: TAB_BAR_HEIGHT, borderRadius: 30, borderWidth: 1,
  },
  pill: { position: 'absolute', top: -1, width: PILL_W, height: PILL_H, borderRadius: 15 },
  pillGrad: { flex: 1, borderRadius: 15, overflow: 'hidden' },
  pillSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: PILL_H / 2 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  iconBox: { width: PILL_W, height: 38, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10.5, marginTop: 3, lineHeight: 14 },
  badge: { position: 'absolute', top: -2, right: 0, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: '#F04438', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  badgeTxt: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
