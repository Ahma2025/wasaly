import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../context/ThemeContext';

const ICONS = {
  'حسابي':    ['person', 'person-outline'],
  'طلباتي':   ['receipt', 'receipt-outline'],
  'ماركت':    ['cart', 'cart-outline'],
  'سلتي':     ['bag', 'bag-outline'],
  'بحث':      ['search', 'search-outline'],
  'الرئيسية': ['home', 'home-outline'],
};

function TabButton({ focused, label, onPress, colors: C }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.9)).current;
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1 : 0.9, useNativeDriver: true, speed: 20, bounciness: 12 }),
      Animated.timing(lift, { toValue: focused ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [focused]);

  const [on, off] = ICONS[label] || ['ellipse', 'ellipse-outline'];
  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });

  return (
    <Pressable style={styles.item} onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}>
      <Animated.View style={{ transform: [{ scale }, { translateY }], alignItems: 'center' }}>
        {focused ? (
          <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activePill}>
            <Ionicons name={on} size={22} color="#FFF" />
          </LinearGradient>
        ) : (
          <View style={styles.inactive}>
            <Ionicons name={off} size={22} color={C.faint} />
          </View>
        )}
        <Text style={[styles.label, { color: focused ? C.primary : C.faint, fontWeight: focused ? '800' : '600' }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function FloatingTabBar({ state, navigation }) {
  const { colors: C } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: C.card, borderColor: C.border, ...C.shadow.card }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return <TabButton key={route.key} focused={focused} label={route.name} onPress={onPress} colors={C} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 14, right: 14, bottom: Platform.OS === 'ios' ? 26 : 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    height: 68, borderRadius: 26, borderWidth: 1, paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  activePill: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  inactive: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10.5, marginTop: 2 },
});
