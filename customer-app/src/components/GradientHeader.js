import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

/* هيدر فخم بتدرّج لوني — موحّد عبر كل الشاشات الفرعية */
export default function GradientHeader({ title, subtitle, right, onBack, colors }) {
  const nav = useNavigation();
  const { colors: C } = useTheme();
  const g = colors || C.gradients.sunset;
  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.wrap, { ...C.shadow.float }]}>
      <TouchableOpacity onPress={onBack || (() => nav.goBack())} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="arrow-back" size={22} color="#FFF" />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.iconBtn}>{right || null}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 54, paddingBottom: 18, paddingHorizontal: 14,
    borderBottomLeftRadius: 26, borderBottomRightRadius: 26,
  },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 2, fontWeight: '600' },
});
