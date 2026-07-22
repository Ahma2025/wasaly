import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function CategoryPill({ item, selected, onPress }) {
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  return (
    <TouchableOpacity style={[styles.pill, selected && styles.pillActive]} onPress={onPress}>
      <Text style={styles.icon}>{item.icon}</Text>
      <Text style={[styles.label, selected && styles.labelActive]}>{item.name_ar}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 22, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.border },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, elevation: 4, shadowColor: COLORS.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  icon: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  labelActive: { color: '#FFF' }
});
