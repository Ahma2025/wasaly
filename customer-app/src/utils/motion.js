import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';

/*
  أدوات الحركة الموحّدة:
  - تقليل الحركة (Reduce Motion) يُقرأ مرة ويُبث لكل المكوّنات
  - منحنيات وتوقيتات DESIGN.md
  - اهتزازات آمنة (ما ترمي أخطاء على أجهزة بدون محرك اهتزاز)
*/

let reduced = false;
const subs = new Set();
try {
  AccessibilityInfo.isReduceMotionEnabled().then(v => { reduced = !!v; subs.forEach(f => f(reduced)); }).catch(() => {});
  AccessibilityInfo.addEventListener && AccessibilityInfo.addEventListener('reduceMotionChanged', v => { reduced = !!v; subs.forEach(f => f(reduced)); });
} catch {}

export const isReducedMotion = () => reduced;

export function useReducedMotion() {
  const [r, setR] = useState(reduced);
  useEffect(() => { subs.add(setR); setR(reduced); return () => { subs.delete(setR); }; }, []);
  return r;
}

export const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
export const DUR = { micro: 150, standard: 250, emphasis: 400 };
export const SPRING = { damping: 16, stiffness: 200, mass: 1, useNativeDriver: true };
export const SPRING_POP = { damping: 12, stiffness: 220, mass: 0.9, useNativeDriver: true };

// تأخير التتابع: 50ms لكل عنصر، أقصى 8 عناصر متحرّكة
export const stagger = (i, step = 50, base = 0) => base + Math.min(Math.max(i, 0), 8) * step;

export const haptic = {
  light: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  medium: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); },
  heavy: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); },
  select: () => { Haptics.selectionAsync().catch(() => {}); },
  success: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warning: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
  error: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
};
