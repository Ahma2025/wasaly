// مكتبة الحركة والعناصر الأساسية — Animated الأساسي فقط (useNativeDriver) + احترام "تقليل الحركة"
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Animated, Easing, View, Text, Pressable, AccessibilityInfo, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, GRADIENTS, SHADOW, RADIUS, MOTION } from '../theme';

// ───────── تقليل الحركة ─────────
let _reduced = false;
const _subs = new Set();
try {
  AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { _reduced = !!v; _subs.forEach(f => f(_reduced)); }).catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { _reduced = !!v; _subs.forEach(f => f(_reduced)); });
} catch {}
export const isReducedMotion = () => _reduced;
export function useReducedMotion() {
  const [r, setR] = useState(_reduced);
  useEffect(() => { _subs.add(setR); setR(_reduced); return () => { _subs.delete(setR); }; }, []);
  return r;
}

const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);

// ───────── اهتزاز ─────────
export const haptic = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  select: () => Haptics.selectionAsync().catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warn: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

// ───────── دخول ─────────
export function FadeIn({ children, delay = 0, from = 14, duration = 380, style }) {
  const v = useRef(new Animated.Value(_reduced ? 1 : 0)).current;
  useEffect(() => {
    if (_reduced) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration, delay, easing: EASE_OUT, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// دخول متتابع لعناصر القوائم (حد أقصى ٨ عناصر متحركة)
export function Stagger({ index = 0, children, style, step = MOTION.stagger }) {
  return <FadeIn delay={Math.min(index, MOTION.maxStagger) * step} style={style}>{children}</FadeIn>;
}

export function PopIn({ children, delay = 0, style, from = 0.9 }) {
  const v = useRef(new Animated.Value(_reduced ? 1 : 0)).current;
  useEffect(() => {
    if (_reduced) { v.setValue(1); return; }
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, ...MOTION.spring }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] });
  return <Animated.View style={[style, { opacity: v, transform: [{ scale }] }]}>{children}</Animated.View>;
}

export function Pulse({ children, style, active = true, to = 1.07, duration = 800 }) {
  const v = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!active || reduced) { v.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, reduced, v, duration]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, to] });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

// حلقات رادار تنتشر من المركز (حالة "متصل"، انتظار الطلبات، العرض الجديد)
export function RadarRings({ size = 120, color = 'rgba(255,255,255,0.55)', rings = 3, duration = 2400, active = true, style, children }) {
  const reduced = useReducedMotion();
  const vals = useRef(Array.from({ length: rings }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (!active || reduced) { vals.forEach(v => v.setValue(0)); return undefined; }
    const loops = vals.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay((duration / rings) * i),
      Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [active, reduced, vals, duration, rings]);
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]} pointerEvents="box-none">
      {active && !reduced && vals.map((v, i) => (
        <Animated.View key={i} pointerEvents="none" style={{
          position: 'absolute', width: size * 0.62, height: size * 0.62, borderRadius: size, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.65] }) }],
        }} />
      ))}
      {children}
    </View>
  );
}

// ───────── ضغط ─────────
// كل عنصر قابل للضغط: تصغير 0.96 بزنبرك + اهتزاز خفيف
// خصائص التموضع تذهب للغلاف الخارجي (Pressable) حتى يعمل flex/margin داخل الصفوف
const OUTER_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex'];
function splitStyle(style) {
  const flat = StyleSheet.flatten(style) || {};
  const outer = {}; const inner = {};
  Object.keys(flat).forEach(k => { (OUTER_KEYS.includes(k) ? outer : inner)[k] = flat[k]; });
  if (outer.flex != null || outer.flexGrow != null) inner.flexGrow = 1;
  return [outer, inner];
}

export function Press({ children, onPress, onLongPress, disabled, style, scaleTo = 0.96, hapticStyle = 'light', hitSlop, accessibilityLabel, accessibilityRole = 'button', accessibilityState, accessibilityHint, testID }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(s, { toValue: v, useNativeDriver: true, damping: 15, stiffness: 260, mass: 0.7 }).start();
  const [outer, inner] = splitStyle(style);
  return (
    <Pressable
      style={outer}
      onPress={(e) => { if (hapticStyle && haptic[hapticStyle]) haptic[hapticStyle](); onPress && onPress(e); }}
      onLongPress={onLongPress}
      onPressIn={() => { if (!_reduced) to(scaleTo); }}
      onPressOut={() => to(1)}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...(accessibilityState || {}) }}
      testID={testID}>
      <Animated.View style={[inner, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ───────── مؤشر تحميل بنقاط (بدل الـ spinner) ─────────
export function LoadingDots({ color = '#FFF', size = 7, style }) {
  const reduced = useReducedMotion();
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduced) { vals.forEach(v => v.setValue(0.5)); return undefined; }
    const loop = Animated.loop(Animated.stagger(140, vals.map(v => Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]))));
    loop.start();
    return () => loop.stop();
  }, [reduced, vals]);
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: size * 0.7, height: size * 2.6 }, style]} accessibilityLabel="جاري التحميل" accessibilityRole="progressbar">
      {vals.map((v, i) => (
        <Animated.View key={i} style={{
          width: size, height: size, borderRadius: size, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.6] }) }],
        }} />
      ))}
    </View>
  );
}

// ───────── زر متدرّج رئيسي ─────────
export function GradientButton({ label, icon, onPress, disabled, loading, loadingLabel, colors = GRADIENTS.sunset, style, height = 58, textStyle, shadow = SHADOW.float, hapticStyle = 'medium', accessibilityLabel }) {
  return (
    <Press onPress={onPress} disabled={disabled || loading} hapticStyle={hapticStyle} style={[{ borderRadius: RADIUS.md, backgroundColor: colors[colors.length - 1] }, shadow, (disabled && !loading) && { opacity: 0.55 }, style]} accessibilityLabel={accessibilityLabel || label} accessibilityState={{ busy: !!loading }}>
      <LinearGradient colors={colors} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.gBtn, { height }]}>
        <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.gSheen} pointerEvents="none" />
        {loading ? (
          <>
            <LoadingDots />
            {loadingLabel ? <Text style={[styles.gText, textStyle]} numberOfLines={1}>{loadingLabel}</Text> : null}
          </>
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={22} color="#FFF" /> : null}
            <Text style={[styles.gText, textStyle]} numberOfLines={1}>{label}</Text>
          </>
        )}
      </LinearGradient>
    </Press>
  );
}

// ───────── هياكل التحميل (لمعان) ─────────
const SCREEN_W = Dimensions.get('window').width;
export function Skeleton({ width = '100%', height = 16, radius = 10, style, tone = 'light' }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, reduced]);
  const onDark = tone === 'dark';
  const base = onDark ? 'rgba(255,255,255,0.22)' : COLORS.skeleton;
  const hi = onDark ? 'rgba(255,255,255,0.38)' : COLORS.skeletonHi;
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-SCREEN_W * 0.6, SCREEN_W] });
  return (
    <View style={[{ width, height, borderRadius: radius, backgroundColor: base, overflow: 'hidden' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!reduced && (
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: SCREEN_W * 0.5, transform: [{ translateX }] }}>
          <LinearGradient colors={['rgba(255,255,255,0)', hi, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}

export function SkeletonCard({ lines = 3, style, avatar = true }) {
  return (
    <View style={[styles.skCard, style]}>
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
        {avatar && <Skeleton width={44} height={44} radius={14} />}
        <View style={{ flex: 1, gap: 8, alignItems: 'flex-end' }}>
          <Skeleton width="60%" height={15} />
          <Skeleton width="38%" height={11} />
        </View>
      </View>
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Skeleton key={i} width={`${88 - i * 18}%`} height={11} style={{ alignSelf: 'flex-end' }} />
      ))}
    </View>
  );
}

// ───────── عدّاد أرقام متحرّك ─────────
export function CountUp({ value, format = (n) => String(Math.round(n)), duration = 900, style, numberOfLines = 1, adjustsFontSizeToFit, accessibilityLabel }) {
  const target = Number.isFinite(Number(value)) ? Number(value) : 0;
  const anim = useRef(new Animated.Value(0)).current;
  const last = useRef(0);
  const [shown, setShown] = useState(_reduced ? target : 0);
  useEffect(() => {
    if (_reduced) { last.current = target; setShown(target); return undefined; }
    anim.setValue(last.current);
    const id = anim.addListener(({ value: v }) => setShown(v));
    Animated.timing(anim, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false })
      .start(() => { last.current = target; setShown(target); });
    return () => { anim.removeListener(id); anim.stopAnimation((v) => { last.current = v; }); };
  }, [target, duration, anim]);
  return (
    <Text style={style} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit} accessibilityLabel={accessibilityLabel || format(target)}>
      {format(shown)}
    </Text>
  );
}

// ───────── حالة فارغة ─────────
export function EmptyState({ icon = 'sparkles', title, text, actionLabel, onAction, actionIcon, tone = 'brand', style }) {
  const toneMap = {
    brand: { g: ['#FFE4CF', '#FFF3EA'], c: COLORS.primary },
    green: { g: ['#C9F3D8', '#EAFBF0'], c: COLORS.greenDeep },
    gray: { g: ['#E6E8F0', '#F4F5F9'], c: COLORS.gray },
    red: { g: ['#FFD7D3', '#FEECEB'], c: COLORS.red },
    gold: { g: ['#FFE7A8', '#FFF6E0'], c: COLORS.amberDeep },
  };
  const t = toneMap[tone] || toneMap.brand;
  return (
    <FadeIn style={[styles.empty, style]}>
      <View style={styles.emptyArt}>
        <LinearGradient colors={t.g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.emptyBlob} />
        <View style={[styles.emptyBlobSm, { backgroundColor: t.g[0] }]} />
        <Ionicons name={icon} size={46} color={t.c} />
      </View>
      {!!title && <Text style={styles.emptyTitle}>{title}</Text>}
      {!!text && <Text style={styles.emptyText}>{text}</Text>}
      {!!actionLabel && (
        <GradientButton label={actionLabel} icon={actionIcon} onPress={onAction} height={50} style={{ marginTop: 18, minWidth: 180 }} />
      )}
    </FadeIn>
  );
}

// ───────── احتفال (قصاصات ملوّنة خفيفة) ─────────
const BURST_COLORS = ['#FF8A00', '#FF5E3A', '#F53B57', '#FFB020', '#1DB954', '#2E90FA', '#7B61FF'];
export function Burst({ play, count = 22, style }) {
  const reduced = useReducedMotion();
  const parts = useRef(Array.from({ length: count }, (_, i) => {
    const a = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const d = 90 + Math.random() * 90;
    return { v: new Animated.Value(0), dx: Math.cos(a) * d, dy: Math.sin(a) * d - 30, rot: `${Math.round(Math.random() * 540 - 270)}deg`, c: BURST_COLORS[i % BURST_COLORS.length], w: 6 + Math.random() * 6, round: i % 3 === 0 };
  })).current;
  useEffect(() => {
    if (!play || reduced) return;
    parts.forEach(p => p.v.setValue(0));
    Animated.stagger(8, parts.map(p => Animated.timing(p.v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: true }))).start();
  }, [play, reduced, parts]);
  if (!play || reduced) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, style]}>
      {parts.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: p.w, height: p.round ? p.w : p.w * 1.8, borderRadius: p.round ? p.w : 2, backgroundColor: p.c,
          opacity: p.v.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
            { translateY: p.v.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy, p.dy + 60] }) },
            { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.rot] }) },
          ],
        }} />
      ))}
    </View>
  );
}

// ───────── حلقة تقدّم دائرية بدون SVG (نصفان مقصوصان يدوران) ─────────
// progress: Animated.Value بين 0 و1 (يُرسم باتجاه عقارب الساعة من الأعلى)
export function ProgressRing({ progress, size = 120, stroke = 10, color = '#FFF', track = 'rgba(255,255,255,0.25)', children }) {
  const half = size / 2;
  const rotA = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '180deg', '180deg'], extrapolate: 'clamp' });
  const rotB = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '0deg', '180deg'], extrapolate: 'clamp' });
  const halfRing = (side) => ({
    position: 'absolute', top: 0, width: half, height: size, borderColor: color, borderWidth: stroke,
    ...(side === 'left'
      ? { left: 0, borderRightWidth: 0, borderTopLeftRadius: half, borderBottomLeftRadius: half }
      : { right: 0, borderLeftWidth: 0, borderTopRightRadius: half, borderBottomRightRadius: half }),
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: track }} />
      {/* النصف الأيمن (0 → 50%) */}
      <View style={{ position: 'absolute', top: 0, left: half, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: -half, width: size, height: size, transform: [{ rotate: rotA }] }}>
          <View style={halfRing('left')} />
        </Animated.View>
      </View>
      {/* النصف الأيسر (50% → 100%) */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate: rotB }] }}>
          <View style={halfRing('right')} />
        </Animated.View>
      </View>
      {children}
    </View>
  );
}

// شريط تقدّم أفقي متحرّك (يملأ من اليمين — RTL)
export function AnimatedBar({ pct = 0, color = COLORS.primary, track = COLORS.inputBg, height = 8, delay = 0, colors }) {
  const v = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    const p = Math.max(0, Math.min(1, pct));
    if (_reduced) { v.setValue(p); return; }
    Animated.timing(v, { toValue: p, duration: 700, delay, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [pct, v, delay]);
  const onLayout = useCallback((e) => setW(e.nativeEvent.layout.width), []);
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [w, 0] });
  return (
    <View onLayout={onLayout} style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: w, borderRadius: height, transform: [{ translateX }], overflow: 'hidden', backgroundColor: colors ? undefined : color }}>
        {colors ? <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  gBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, borderRadius: RADIUS.md, overflow: 'hidden' },
  gSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%' },
  gText: { color: '#FFF', fontWeight: '900', fontSize: 16.5 },
  skCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md + 2, padding: 16, gap: 10, ...SHADOW.soft },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyArt: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyBlob: { position: 'absolute', width: 120, height: 120, borderRadius: 60, transform: [{ rotate: '18deg' }] },
  emptyBlobSm: { position: 'absolute', width: 30, height: 30, borderRadius: 15, top: 6, right: 8, opacity: 0.9 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  emptyText: { fontSize: 13.5, color: COLORS.gray, textAlign: 'center', marginTop: 6, lineHeight: 21, fontWeight: '500' },
});
