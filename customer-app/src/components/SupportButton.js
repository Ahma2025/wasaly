import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useTabBarInset } from './FloatingTabBar';
import { Press } from './Anim';
import { SUPPORT_PHONE } from '../config';
import { SPRING_POP, isReducedMotion } from '../utils/motion';

// زر دعم عائم: يفتح "تشات" أو "اتصل بوصلي" — يجلس فوق شريط التبويبات بدون تداخل
export default function SupportButton({ bottom }) {
  const nav = useNavigation();
  const { colors: C } = useTheme();
  const tabInset = useTabBarInset();
  const [open, setOpen] = useState(false);
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isReducedMotion()) { v.setValue(open ? 1 : 0); return; }
    Animated.spring(v, { toValue: open ? 1 : 0, ...SPRING_POP }).start();
  }, [open]);

  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '135deg'] });
  const item = (i) => ({
    opacity: v,
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [20 + i * 14, 0] }) },
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
    ],
  });

  return (
    <View style={[styles.wrap, { bottom: bottom ?? tabInset + 14 }]} pointerEvents="box-none">
      <View pointerEvents={open ? 'auto' : 'none'}>
        <Animated.View style={item(1)}>
          <Pressable style={[styles.action, { backgroundColor: C.card, borderColor: C.border }, C.shadow.card]}
            accessibilityRole="button" accessibilityLabel="تشات مع الدعم"
            onPress={() => { setOpen(false); nav.navigate('SupportChat'); }}>
            <Text style={[styles.actionTxt, { color: C.text }]}>تشات مع الدعم</Text>
            <View style={[styles.actionIcon, { backgroundColor: '#25D366' }]}><Ionicons name="chatbubble-ellipses" size={16} color="#FFF" /></View>
          </Pressable>
        </Animated.View>
        <Animated.View style={item(0)}>
          <Pressable style={[styles.action, { backgroundColor: C.card, borderColor: C.border }, C.shadow.card]}
            accessibilityRole="button" accessibilityLabel="اتصل بوصلّي"
            onPress={() => { setOpen(false); Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}); }}>
            <Text style={[styles.actionTxt, { color: C.text }]}>اتصل بوصلّي</Text>
            <View style={[styles.actionIcon, { backgroundColor: C.green }]}><Ionicons name="call" size={16} color="#FFF" /></View>
          </Pressable>
        </Animated.View>
      </View>
      <Press onPress={() => setOpen(o => !o)} scaleTo={0.9}
        accessibilityRole="button" accessibilityLabel={open ? 'إغلاق قائمة الدعم' : 'الدعم والمساعدة'}>
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fab, C.shadow.float]}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name={open ? 'add' : 'headset'} size={open ? 28 : 24} color="#FFF" />
          </Animated.View>
        </LinearGradient>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, alignItems: 'flex-start', zIndex: 999 },
  fab: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, borderRadius: 24, marginBottom: 10, borderWidth: 1 },
  actionIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { fontWeight: '800', fontSize: 13 },
});
