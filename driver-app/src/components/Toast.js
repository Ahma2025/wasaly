// تنبيه علوي خفيف (Toast) — بلا مكتبات: showToast(text, { tone, icon }) من أي مكان
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOW, RTL } from '../theme';
import { useReducedMotion } from './Anim';

let host = null;
const queue = [];

export function showToast(text, opts = {}) {
  if (!text) return;
  const item = { id: Date.now() + Math.random(), text: String(text), tone: opts.tone || 'info', icon: opts.icon, ms: opts.ms || 4200 };
  if (host) host(item); else queue.push(item);
}

const TONE = {
  info: { bg: COLORS.ink, icon: 'information-circle', iconColor: '#FFF' },
  warn: { bg: '#3A2A00', icon: 'alert-circle', iconColor: COLORS.amber },
  success: { bg: COLORS.greenDeep, icon: 'checkmark-circle', iconColor: '#FFF' },
  danger: { bg: COLORS.redDeep, icon: 'close-circle', iconColor: '#FFF' },
};

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [item, setItem] = useState(null);
  const v = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const hide = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.timing(v, { toValue: 0, duration: reduced ? 0 : 200, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => setItem(null));
  };

  useEffect(() => {
    host = (it) => {
      if (timer.current) clearTimeout(timer.current);
      setItem(it);
      v.setValue(0);
      Animated.spring(v, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 200 }).start();
      timer.current = setTimeout(hide, it.ms);
    };
    if (queue.length) host(queue.splice(0).pop());
    return () => { host = null; if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!item) return null;
  const t = TONE[item.tone] || TONE.info;
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 10, opacity: v, transform: [{ translateY }] }]}>
      <Pressable onPress={hide} accessibilityRole="alert" accessibilityLabel={item.text}>
        <View style={[styles.toast, { backgroundColor: t.bg }]}>
          <Ionicons name={item.icon || t.icon} size={20} color={t.iconColor} />
          <Text style={[styles.text, RTL.text]} numberOfLines={3}>{item.text}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, zIndex: 999, elevation: 30 },
  toast: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, ...SHADOW.dark },
  text: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '800', lineHeight: 20 },
});
