import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useTabBarInset } from './FloatingTabBar';
import { SUPPORT_PHONE } from '../config';

// زر دعم عائم: يفتح "تشات" أو "اتصل بوصلي" — يجلس فوق شريط التبويبات بدون تداخل
export default function SupportButton({ bottom }) {
  const nav = useNavigation();
  const { colors: C } = useTheme();
  const tabInset = useTabBarInset();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.wrap, { bottom: bottom ?? tabInset + 14 }]} pointerEvents="box-none">
      {open && (
        <>
          <TouchableOpacity style={[styles.action, { backgroundColor: C.card, borderColor: C.border }]}
            accessibilityRole="button" accessibilityLabel="تشات مع الدعم"
            onPress={() => { setOpen(false); nav.navigate('SupportChat'); }}>
            <Text style={[styles.actionTxt, { color: C.text }]}>تشات مع الدعم</Text>
            <View style={[styles.actionIcon, { backgroundColor: '#25D366' }]}><Ionicons name="chatbubble-ellipses" size={16} color="#FFF" /></View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.action, { backgroundColor: C.card, borderColor: C.border }]}
            accessibilityRole="button" accessibilityLabel="اتصل بوصلّي"
            onPress={() => { setOpen(false); Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}); }}>
            <Text style={[styles.actionTxt, { color: C.text }]}>اتصل بوصلّي</Text>
            <View style={[styles.actionIcon, { backgroundColor: C.green }]}><Ionicons name="call" size={16} color="#FFF" /></View>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity onPress={() => setOpen(o => !o)} activeOpacity={0.9}
        accessibilityRole="button" accessibilityLabel={open ? 'إغلاق قائمة الدعم' : 'الدعم والمساعدة'}>
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fab, C.shadow.float]}>
          <Ionicons name={open ? 'close' : 'headset'} size={24} color="#FFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, alignItems: 'flex-start', zIndex: 999 },
  fab: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 6, paddingVertical: 6, borderRadius: 24, marginBottom: 10, borderWidth: 1, elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  actionIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { fontWeight: '800', fontSize: 13 },
});
