import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS, SHADOW } from '../theme';

// ترويسة RTL: زر الرجوع على اليمين بسهم يشير لليمين (اتجاه الرجوع في العربية)
export default function GradientHeader({ title, subtitle, right, onBack, colors, showBack = true, children }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const g = colors || GRADIENTS.sunset;
  return (
    <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.wrap, { paddingTop: insets.top + 12 }, SHADOW.float]}>
      <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
      <View style={styles.row}>
        {showBack ? (
          <TouchableOpacity onPress={onBack || (() => (nav.canGoBack() ? nav.goBack() : null))} style={styles.iconBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="رجوع">
            <Ionicons name="arrow-forward" size={22} color="#FFF" />
          </TouchableOpacity>
        ) : <View style={styles.iconSpacer} />}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.iconBtn}>{right}</View> : <View style={styles.iconSpacer} />}
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 20, paddingHorizontal: 14, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden' },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 70 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.20)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 42, height: 42 },
  title: { fontSize: 18.5, fontWeight: '900', color: '#FFF' },
  sub: { fontSize: 12, color: 'rgba(255,255,255,0.92)', marginTop: 3, fontWeight: '600' },
});
