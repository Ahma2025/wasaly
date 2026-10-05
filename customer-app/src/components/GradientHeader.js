import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

// مسافة علوية آمنة موحّدة (نوتش / فتحة كاميرا / شريط الحالة)
export const useHeaderTop = (extra = 10) => {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top, 20) + extra;
};

/* هيدر فخم بتدرّج لوني — موحّد عبر كل الشاشات الفرعية (RTL: زر الرجوع على اليمين) */
export default function GradientHeader({ title, subtitle, right, onBack, colors, hideBack, children }) {
  const nav = useNavigation();
  const { colors: C } = useTheme();
  const top = useHeaderTop(10);
  const g = colors || C.gradients.sunset;
  const goBack = onBack || (() => { if (nav.canGoBack()) nav.goBack(); else nav.navigate('Main', { screen: 'الرئيسية' }); });
  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.wrap, { paddingTop: top, ...C.shadow.float }]}>
      {/* لمعة زجاجية علوية للإحساس الفخم */}
      <LinearGradient colors={C.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
      <View style={styles.row}>
        {hideBack ? <View style={styles.iconSpacer} /> : (
          <TouchableOpacity onPress={goBack} style={styles.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button" accessibilityLabel="رجوع">
            <Ionicons name="arrow-forward" size={22} color="#FFF" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={right ? styles.iconBtn : styles.iconSpacer}>{right || null}</View>
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 20, paddingHorizontal: 14,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden',
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 70 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center',
  },
  iconSpacer: { width: 42, height: 42 },
  title: { fontSize: 18.5, fontWeight: '900', color: '#FFF' },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '600' },
});
