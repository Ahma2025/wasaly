import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { COLORS, GRADIENTS, SHADOW, RADIUS } from '../theme';
import { ADMIN_PHONE } from '../config';
import { useTabBarOffset } from './FloatingTabBar';
import { Press, haptic, isReducedMotion } from './Anim';

// زر دعم عائم (الرئيسية فقط) — فوق شريط التبويب، على الجهة اليسرى (نهاية السطر في RTL)
export default function SupportButton() {
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const { bottom, height } = useTabBarOffset();
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isReducedMotion()) { v.setValue(open ? 1 : 0); return; }
    Animated.spring(v, { toValue: open ? 1 : 0, useNativeDriver: true, damping: 15, stiffness: 220 }).start();
  }, [open, v]);

  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
  const actionStyle = (i) => ({
    opacity: v,
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16 + i * 10, 0] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
    ],
  });

  const actions = [
    { icon: 'chatbubble-ellipses', label: 'تشات مع الإدارة', colors: GRADIENTS.green, onPress: () => { setOpen(false); nav.navigate('SupportChat'); } },
    { icon: 'call', label: 'اتصل بوصلّي', colors: GRADIENTS.dark, onPress: () => { setOpen(false); Linking.openURL(`tel:${ADMIN_PHONE}`).catch(() => {}); } },
  ];

  return (
    <>
      {open && <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="إغلاق قائمة الدعم" />}
      <View style={[styles.wrap, { bottom: bottom + height + 14 }]} pointerEvents="box-none">
        {open && actions.map((a, i) => (
          <Animated.View key={a.label} style={[{ marginBottom: 10 }, actionStyle(actions.length - i)]}>
            <Press onPress={a.onPress} style={[styles.action, SHADOW.card]} accessibilityLabel={a.label}>
              <LinearGradient colors={a.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionIcon}>
                <Ionicons name={a.icon} size={17} color="#FFF" />
              </LinearGradient>
              <Text style={styles.actionTxt}>{a.label}</Text>
            </Press>
          </Animated.View>
        ))}
        <Press onPress={() => { haptic.light(); setOpen(o => !o); }} hapticStyle={null} style={[styles.fab, SHADOW.float]}
          accessibilityLabel={open ? 'إغلاق الدعم' : 'الدعم'} accessibilityState={{ expanded: open }}>
          <LinearGradient colors={open ? GRADIENTS.dark : GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGrad}>
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Ionicons name={open ? 'close' : 'headset'} size={25} color="#FFF" />
            </Animated.View>
          </LinearGradient>
        </Press>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 18, alignItems: 'flex-start', zIndex: 50 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.primary },
  fabGrad: { flex: 1, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  action: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, height: 50, borderRadius: RADIUS.pill, backgroundColor: COLORS.card },
  actionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
});
