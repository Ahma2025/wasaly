import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { IconButton } from './UI';
import { FadeIn } from './Anim';

// مسافة علوية آمنة موحّدة (نوتش / فتحة كاميرا / شريط الحالة)
export const useHeaderTop = (extra = 10) => {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, 20) + extra;
};

/* زخرفة الهيدر المتدرّج: لمعة زجاجية + دوائر ضوئية ناعمة (مشتركة مع هيرو الرئيسية) */
export function HeroDecor() {
  const { colors: C } = useTheme();
  return (
    <>
      <LinearGradient colors={C.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
      <View pointerEvents="none" style={styles.orbA} />
      <View pointerEvents="none" style={styles.orbB} />
    </>
  );
}

/* هيدر فخم بتدرّج لوني — موحّد عبر كل الشاشات الفرعية (RTL: زر الرجوع على اليمين) */
/*
  right: عنصر حر (للتوافق) — أو الأفضل rightIcon + onRight + rightLabel → زر دائري 42px بهدف لمس كامل
*/
export default function GradientHeader({ title, subtitle, right, rightIcon, onRight, rightLabel, rightBadge, onBack, colors, hideBack, children }) {
  const nav = useNavigation();
  const { colors: C } = useTheme();
  const top = useHeaderTop(10);
  const g = colors || C.gradients.sunset;
  const goBack = onBack || (() => { if (nav.canGoBack()) nav.goBack(); else nav.navigate('Main', { screen: 'الرئيسية' }); });
  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.wrap, { paddingTop: top }]}>
      <HeroDecor />
      <View style={styles.row}>
        {hideBack ? <View style={styles.iconSpacer} /> : (
          <IconButton icon="arrow-forward" onPress={goBack} label="رجوع" onGradient />
        )}
        <FadeIn from={6} duration={300} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </FadeIn>
        {rightIcon ? (
          <IconButton icon={rightIcon} onPress={onRight} label={rightLabel || title} onGradient badge={rightBadge} />
        ) : (
          <View style={right ? styles.iconBtn : styles.iconSpacer}>{right || null}</View>
        )}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 20, paddingHorizontal: 14,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden',
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  orbA: { position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -90, left: -50, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbB: { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -60, right: -20, backgroundColor: 'rgba(255,255,255,0.07)' },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  iconSpacer: { width: 42, height: 42 },
  title: { fontSize: 19, fontWeight: '900', color: '#FFF' },
  sub: { fontSize: 12.5, color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '500' },
});
