import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function CategoryPill({ item, selected, onPress }) {
  return (
    <TouchableOpacity style={[styles.pill, selected && styles.pillActive]} onPress={onPress}>
      <Text style={styles.icon}>{item.icon}</Text>
      <Text style={[styles.label, selected && styles.labelActive]}>{item.name_ar}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E5EA' },
  pillActive: { backgroundColor: '#FF6B00', borderColor: '#FF6B00' },
  icon: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#1A1A2E' },
  labelActive: { color: '#FFF' }
});
