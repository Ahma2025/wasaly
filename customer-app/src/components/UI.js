import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Modal, Pressable, PanResponder, Dimensions, TouchableOpacity, Platform, Easing, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Press } from './Anim';
import { isReducedMotion, EASE_OUT, SPRING, SPRING_POP, haptic } from '../utils/motion';

/* ═══════════ Wasaly Luxe — primitives مشتركة ═══════════ */

const SCREEN_H = Dimensions.get('window').height;

/* شريحة اختيار (Chip) — حالة مختارة بتدرّج + ارتداد خفيف */
export function Chip({ label, icon, emoji, selected, onPress, size = 'md', style, accessibilityLabel, tone }) {
  const { colors: C } = useTheme();
  const pad = size === 'sm' ? { paddingHorizontal: 12, height: 34 } : { paddingHorizontal: 16, height: 40 };
  const fg = selected ? '#FFF' : (tone || C.text);
  return (
    <Press onPress={() => { haptic.select(); onPress && onPress(); }} haptic={false} scaleTo={0.94}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ selected: !!selected }}
      style={[{ borderRadius: 999 }, selected && C.shadow.glow, style]}>
      <View style={[styles.chip, pad, { backgroundColor: C.card, borderColor: selected ? 'transparent' : C.border }]}>
        {selected && <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />}
        {!!emoji && <Text style={{ fontSize: size === 'sm' ? 13 : 15 }}>{emoji}</Text>}
        {!!icon && <Ionicons name={icon} size={size === 'sm' ? 14 : 16} color={selected ? '#FFF' : (tone || C.primary)} />}
        <Text style={[styles.chipTxt, { color: fg, fontSize: size === 'sm' ? 12.5 : 13.5 }]} numberOfLines={1}>{label}</Text>
      </View>
    </Press>
  );
}

/* شارة صغيرة ملوّنة (حالة، خصم، جديد) */
export function Badge({ label, icon, color, bg, solid, style, textStyle }) {
  const { colors: C } = useTheme();
  const col = color || C.primary;
  return (
    <View style={[styles.badge, { backgroundColor: solid ? col : (bg || col + '1F') }, style]}>
      {!!icon && <Ionicons name={icon} size={11} color={solid ? '#FFF' : col} />}
      <Text style={[styles.badgeTxt, { color: solid ? '#FFF' : col }, textStyle]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/* عنوان قسم: عنوان + وصف اختياري + "عرض الكل" */
export function SectionHeader({ title, subtitle, icon, action, onAction, style }) {
  const { colors: C } = useTheme();
  return (
    <View style={[styles.sh, style]}>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          {!!icon && (
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shIcon}>
              <Ionicons name={icon} size={13} color="#FFF" />
            </LinearGradient>
          )}
          <Text style={[styles.shTitle, { color: C.text }]} accessibilityRole="header">{title}</Text>
        </View>
        {!!subtitle && <Text style={[styles.shSub, { color: C.faint }]}>{subtitle}</Text>}
      </View>
      {!!action && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={action}
          style={[styles.shAction, { backgroundColor: C.tint }]}>
          <Text style={{ color: C.primary, fontWeight: '800', fontSize: 12.5 }}>{action}</Text>
          <Ionicons name="chevron-back" size={13} color={C.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/* بطاقة زجاجية (على الخلفيات المتدرّجة) */
export function GlassCard({ children, style, strong }) {
  return (
    <View style={[styles.glass, strong && { backgroundColor: 'rgba(255,255,255,0.24)' }, style]}>
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );
}

/* بطاقة سطح عادية بظل موحّد */
export function Card({ children, style, elevated = 'soft', padded = true }) {
  const { colors: C } = useTheme();
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: C.radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border }, padded && { padding: 16 }, C.shadow[elevated], style]}>
      {children}
    </View>
  );
}

/* زر أيقونة دائري (على متدرّج: glass، على سطح: tint) */
export function IconButton({ icon, onPress, label, onGradient, size = 42, color, badge, style }) {
  const { colors: C } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.9} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        onGradient ? { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' } : { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, ...C.shadow.soft }, style]}>
      <Ionicons name={icon} size={size * 0.5} color={color || (onGradient ? '#FFF' : C.text)} />
      {!!badge && (
        <View style={[styles.dotBadge, { borderColor: onGradient ? 'transparent' : C.card }]}>
          <Text style={styles.dotBadgeTxt}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Press>
  );
}

/* عدّاد رقمي متحرّك (الأسعار والإجماليات) */
export function AnimatedNumber({ value, decimals = 2, suffix = '', prefix = '', duration = 500, style, accessibilityLabel }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const v = useRef(new Animated.Value(target)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(target);
  useEffect(() => {
    const id = v.addListener(({ value: x }) => setShown(x));
    return () => v.removeListener(id);
  }, []);
  useEffect(() => {
    if (prev.current === target) return;
    const up = target > prev.current;
    prev.current = target;
    if (isReducedMotion()) { v.setValue(target); setShown(target); return; }
    Animated.timing(v, { toValue: target, duration, easing: EASE_OUT, useNativeDriver: false }).start();
    Animated.sequence([
      Animated.timing(pop, { toValue: up ? 1.08 : 0.94, duration: 120, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, ...SPRING_POP }),
    ]).start();
  }, [target]);
  return (
    <Animated.Text style={[style, { transform: [{ scale: pop }] }]} accessibilityLabel={accessibilityLabel || `${prefix}${target.toFixed(decimals)}${suffix}`}>
      {prefix}{(Number(shown) || 0).toFixed(decimals)}{suffix}
    </Animated.Text>
  );
}

/* فاصل */
export function Divider({ style, dashed }) {
  const { colors: C } = useTheme();
  return <View style={[{ height: dashed ? 0 : StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 10 }, dashed && { borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.border }, style]} />;
}

/*
  شيت سفلي (Bottom Sheet) — Modal شفاف + انزلاق بنابض + سحب للإغلاق من المقبض
  props: visible, onClose, children, title, maxHeight(نسبة من الشاشة), footer
*/
export function BottomSheet({ visible, onClose, children, title, footer, maxHeight = 0.88, scrollable = false }) {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(SCREEN_H)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // الكيبورد ما يغطي حقول الشيت (مثل "سبب آخر" بنافذة الإلغاء) — نرفع الشيت بارتفاعه
  const [kbH, setKbH] = useState(0);
  const kbRef = useRef(0);
  const sheetRef = useRef(null);
  useEffect(() => {
    if (!mounted) return undefined;
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const apply = (v) => { kbRef.current = v; setKbH(v); };
    const a = Keyboard.addListener(showEv, (e) => {
      const kbTop = e?.endCoordinates?.screenY;
      const kbHeight = e?.endCoordinates?.height || 0;
      // iOS: شريط "تم" فوق الكيبورد (KeyboardToolbar) ارتفاعه 44
      const extra = Platform.OS === 'ios' ? 44 : 0;
      const node = sheetRef.current;
      if (node && node.measureInWindow && Number.isFinite(kbTop)) {
        // نقيس فعلياً: لو النافذة انضغطت لحالها (adjustResize) ما منضيف شي
        node.measureInWindow((x, y, w, h) => {
          const bottom = y + h - kbRef.current;
          const overlap = bottom - kbTop;
          apply(Number.isFinite(overlap) ? Math.max(0, overlap) + (overlap > 0 ? extra : 0) : kbHeight + extra);
        });
      } else apply(kbHeight + extra);
    });
    const b = Keyboard.addListener(hideEv, () => apply(0));
    return () => { a.remove(); b.remove(); };
  }, [mounted]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.setValue(0);
      if (isReducedMotion()) { y.setValue(0); fade.setValue(1); return; }
      Animated.parallel([
        Animated.spring(y, { toValue: 0, damping: 20, stiffness: 210, mass: 0.9, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(y, { toValue: SCREEN_H, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) drag.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120 || g.vy > 1.1) { haptic.light(); onCloseRef.current && onCloseRef.current(); }
      else Animated.spring(drag, { toValue: 0, ...SPRING }).start();
    },
  })).current;
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: C.overlay, opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق" />
      </Animated.View>
      <Animated.View ref={sheetRef} style={[styles.sheet, { backgroundColor: C.card, maxHeight: SCREEN_H * maxHeight - kbH, paddingBottom: (footer ? 0 : Math.max(insets.bottom, 16)) + kbH, transform: [{ translateY: Animated.add(y, drag) }] }]}>
        <View {...pan.panHandlers} style={styles.handleArea}>
          <View style={[styles.handle, { backgroundColor: C.border }]} />
          {!!title && (
            <View style={styles.sheetHead}>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.sheetClose, { backgroundColor: C.inputBg }]}>
                <Ionicons name="close" size={18} color={C.text} />
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
            </View>
          )}
        </View>
        <View style={scrollable ? { flexShrink: 1 } : null}>{children}</View>
        {!!footer && <View style={[styles.sheetFooter, { borderTopColor: C.border, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>{footer}</View>}
      </Animated.View>
    </Modal>
  );
}

/* انفجار احتفالي خفيف (confetti-like) بـ Animated فقط */
const BURST_COLORS = ['#FF8A00', '#FF5E3A', '#F53B57', '#FFB020', '#1DB954', '#2E90FA'];
export function Burst({ run = true, count = 16, radius = 120, style }) {
  const parts = useRef(Array.from({ length: count }, (_, i) => ({
    v: new Animated.Value(0),
    angle: (i / count) * Math.PI * 2 + Math.random() * 0.4,
    dist: radius * (0.6 + Math.random() * 0.5),
    color: BURST_COLORS[i % BURST_COLORS.length],
    size: 6 + Math.round(Math.random() * 6),
    round: Math.random() > 0.5,
  }))).current;
  useEffect(() => {
    if (!run || isReducedMotion()) return;
    Animated.stagger(12, parts.map(p => Animated.timing(p.v, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }))).start();
  }, [run]);
  if (isReducedMotion()) return null;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }, style]}>
      {parts.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: p.size, height: p.round ? p.size : p.size * 1.8, borderRadius: p.round ? p.size : 2, backgroundColor: p.color,
          opacity: p.v.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] }) },
            { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * p.dist + 30] }) },
            { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 260}deg`] }) },
          ],
        }} />
      ))}
    </View>
  );
}

/* حلقة تقدّم دائرية بدون SVG (نصفان دوّارة) — للـ ETA */
export function ProgressRing({ progress = 0, size = 64, stroke = 6, color = '#FFF', track = 'rgba(255,255,255,0.25)', children }) {
  const v = useRef(new Animated.Value(Math.min(Math.max(progress, 0), 1))).current;
  useEffect(() => {
    Animated.timing(v, { toValue: Math.min(Math.max(progress, 0), 1), duration: isReducedMotion() ? 0 : 600, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [progress]);
  const half = size / 2;
  const rightRot = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '180deg', '180deg'] });
  const leftRot = v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0deg', '180deg'] });
  const ringStyle = { width: size, height: size, borderRadius: half, borderWidth: stroke, position: 'absolute' };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[ringStyle, { borderColor: track }]} />
      {/* النصف الأيمن */}
      <View style={{ position: 'absolute', width: half, height: size, left: half, overflow: 'hidden' }}>
        <Animated.View style={{ width: size, height: size, marginLeft: -half, transform: [{ rotate: rightRot }] }}>
          <View style={{ width: half, height: size, overflow: 'hidden' }}>
            <View style={[ringStyle, { borderColor: color }]} />
          </View>
        </Animated.View>
      </View>
      {/* النصف الأيسر */}
      <View style={{ position: 'absolute', width: half, height: size, left: 0, overflow: 'hidden' }}>
        <Animated.View style={{ width: size, height: size, transform: [{ rotate: leftRot }] }}>
          <View style={{ width: half, height: size, marginLeft: half, overflow: 'hidden' }}>
            <View style={[ringStyle, { borderColor: color, marginLeft: -half }]} />
          </View>
        </Animated.View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, overflow: 'hidden' },
  chipTxt: { fontWeight: '800' },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-end' },
  badgeTxt: { fontSize: 10.5, fontWeight: '800' },
  sh: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 16, marginTop: 22, marginBottom: 12, gap: 10 },
  shIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  shTitle: { fontSize: 18, fontWeight: '900', textAlign: 'right' },
  shSub: { fontSize: 12.5, fontWeight: '500', textAlign: 'right', marginTop: 2 },
  shAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  glass: { backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', borderRadius: 20, overflow: 'hidden' },
  dotBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#F04438', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  dotBadgeTxt: { color: '#FFF', fontSize: 9.5, fontWeight: '900' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', ...Platform.select({ android: { elevation: 24 }, default: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -6 } } }) },
  handleArea: { paddingTop: 10, paddingBottom: 6 },
  handle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6, gap: 10 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '900', textAlign: 'right' },
  sheetClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sheetFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
