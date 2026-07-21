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
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 22, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#EDEDF0' },
  pillActive: { backgroundColor: '#FF6B00', borderColor: '#FF6B00', elevation: 4, shadowColor: '#FF6B00', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  icon: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#1A1A2E' },
  labelActive: { color: '#FFF' }
});
