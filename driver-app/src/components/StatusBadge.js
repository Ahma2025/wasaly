import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { statusInfo } from '../utils/format';
import { RADIUS } from '../theme';

// شارة حالة بلون + أيقونة من الجدول الموحّد (utils/format STATUS) — اللون ليس الإشارة الوحيدة
export default function StatusBadge({ status, label, onDark = false, size = 'md', style }) {
  const s = statusInfo(status);
  const color = onDark ? '#FFF' : (s.fg || s.color);
  const lg = size === 'lg';
  return (
    <View style={[styles.badge, lg && styles.badgeLg, { backgroundColor: onDark ? 'rgba(255,255,255,0.22)' : s.bg }, onDark && styles.onDark, style]}
      accessibilityLabel={`الحالة: ${label || s.label}`}>
      <Ionicons name={s.icon || 'ellipse'} size={lg ? 14 : 12} color={onDark ? '#FFF' : s.color} />
      <Text style={[styles.text, lg && { fontSize: 12.5 }, { color }]} numberOfLines={1}>{label || s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', flexShrink: 1 },
  badgeLg: { paddingHorizontal: 12, paddingVertical: 6, gap: 5 },
  onDark: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  text: { fontSize: 11.5, fontWeight: '800', flexShrink: 1 },
});
