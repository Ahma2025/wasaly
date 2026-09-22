import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PopIn } from './Anim';
import { useTheme } from '../context/ThemeContext';

// حالة فارغة فخمة موحّدة: أيقونة بدائرة متدرّجة الخلفية + عنوان + وصف + زر اختياري
export default function EmptyState({ emoji = '🍽️', title, subtitle, ctaLabel, onCta }) {
  const { colors: C } = useTheme();
  return (
    <View style={styles.wrap}>
      <PopIn>
        <View style={[styles.iconWrap, { backgroundColor: C.tint }]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      </PopIn>
      {!!title && <Text style={[styles.title, { color: C.text }]}>{title}</Text>}
      {!!subtitle && <Text style={[styles.sub, { color: C.gray }]}>{subtitle}</Text>}
      {!!ctaLabel && (
        <TouchableOpacity activeOpacity={0.9} onPress={onCta} style={[styles.cta, C.shadow.float]}>
          <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaGrad}>
            <Text style={styles.ctaTxt}>{ctaLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 30 },
  iconWrap: { width: 128, height: 128, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emoji: { fontSize: 60 },
  title: { fontSize: 21, fontWeight: '900', textAlign: 'center' },
  sub: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 21, marginTop: -4, paddingHorizontal: 20 },
  cta: { borderRadius: 18, overflow: 'hidden', marginTop: 8 },
  ctaGrad: { paddingHorizontal: 30, paddingVertical: 15, borderRadius: 18 },
  ctaTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});
