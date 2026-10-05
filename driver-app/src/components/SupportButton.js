import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SHADOW } from '../theme';
import { ADMIN_PHONE } from '../config';
import { useTabBarOffset } from './FloatingTabBar';

// زر دعم عائم (الرئيسية فقط) — فوق شريط التبويب، على الجهة اليسرى (نهاية السطر في RTL)
export default function SupportButton() {
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const { bottom, height } = useTabBarOffset();

  return (
    <View style={[styles.wrap, { bottom: bottom + height + 14 }]} pointerEvents="box-none">
      {open && (
        <>
          <TouchableOpacity style={[styles.action, { backgroundColor: COLORS.green }]}
            onPress={() => { setOpen(false); nav.navigate('SupportChat'); }}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
            <Text style={styles.actionTxt}>تشات مع الإدارة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.action, { backgroundColor: COLORS.greenDeep }]}
            onPress={() => { setOpen(false); Linking.openURL(`tel:${ADMIN_PHONE}`).catch(() => {}); }}>
            <Ionicons name="call" size={18} color="#FFF" />
            <Text style={styles.actionTxt}>اتصل بوصلّي</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(o => !o)} activeOpacity={0.9} accessibilityLabel="الدعم">
        <Ionicons name={open ? 'close' : 'headset'} size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 18, alignItems: 'flex-start', zIndex: 50 },
  fab: { width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', ...SHADOW.float },
  action: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 24, marginBottom: 10, ...SHADOW.soft },
  actionTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});
