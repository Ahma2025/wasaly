import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { statusInfo } from '../utils/format';

export default function StatusBadge({ status, label, onDark = false, style }) {
  const s = statusInfo(status);
  return (
    <View style={[styles.badge, { backgroundColor: onDark ? 'rgba(255,255,255,0.24)' : s.bg }, style]}>
      <View style={[styles.dot, { backgroundColor: onDark ? '#FFF' : s.color }]} />
      <Text style={[styles.text, { color: onDark ? '#FFF' : s.color }]}>{label || s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: '800' },
});
