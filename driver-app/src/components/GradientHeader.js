import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS, SHADOW, RADIUS } from '../theme';
import { Press, FadeIn } from './Anim';

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ترويسة RTL: زر الرجوع على اليمين بسهم يشير لليمين (اتجاه الرجوع في العربية)
// right: عنصر مخصّص · rightIcon + onRightPress: زر أيقونة جاهز
export default function GradientHeader({ title, subtitle, right, rightIcon, onRightPress, rightLabel, onBack, colors, showBack = true, children, large = false }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const g = colors || GRADIENTS.sunset;
  const back = onBack || (() => (nav.canGoBack() ? nav.goBack() : null));

  const rightNode = right
    ? <View style={styles.iconBtn}>{right}</View>
    : rightIcon
      ? (
        <Press onPress={onRightPress} style={styles.iconBtn} hitSlop={HIT} accessibilityLabel={rightLabel || 'إجراء'}>
          <Ionicons name={rightIcon} size={21} color="#FFF" />
        </Press>
      )
      : <View style={styles.iconSpacer} />;

  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.wrap, { paddingTop: insets.top + 10 }, large && { paddingBottom: 26 }, SHADOW.float]}>
      <View style={styles.orbA} pointerEvents="none" />
      <View style={styles.orbB} pointerEvents="none" />
      <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
      {large ? (
        <FadeIn from={8}>
          <View style={styles.row}>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.titleLg} numberOfLines={1} accessibilityRole="header">{title}</Text>
              {subtitle ? <Text style={styles.subLg} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            {(right || rightIcon) ? rightNode : null}
          </View>
        </FadeIn>
      ) : (
        <View style={styles.row}>
          {showBack ? (
            <Press onPress={back} style={styles.iconBtn} hitSlop={HIT} accessibilityLabel="رجوع">
              <Ionicons name="arrow-forward" size={22} color="#FFF" />
            </Press>
          ) : <View style={styles.iconSpacer} />}
          <FadeIn from={6} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
            {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
          </FadeIn>
          {rightNode}
        </View>
      )}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 18, paddingHorizontal: 16, borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#FF5E3A' },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  orbA: { position: 'absolute', top: -70, left: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbB: { position: 'absolute', bottom: -60, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.07)' },
  iconBtn: { width: 46, height: 46, borderRadius: RADIUS.sm + 2, backgroundColor: 'rgba(255,255,255,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)', alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 46, height: 46 },
  title: { fontSize: 18.5, fontWeight: '900', color: '#FFF' },
  sub: { fontSize: 12.5, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '500' },
  titleLg: { fontSize: 26, fontWeight: '900', color: '#FFF', textAlign: 'right' },
  subLg: { fontSize: 13.5, color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '500', textAlign: 'right' },
});
