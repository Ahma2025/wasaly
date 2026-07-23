import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const ADMIN_PHONE = '0599039704';

// زر دعم عائم: يفتح "تشات" أو "اتصل بوصلي"
export default function SupportButton({ bottom = 82 }) {
  const nav = useNavigation();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      {open && (
        <>
          <TouchableOpacity style={[styles.action, { backgroundColor: '#25D366' }]}
            onPress={() => { setOpen(false); nav.navigate('SupportChat'); }}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
            <Text style={styles.actionTxt}>تشات مع الإدارة</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.action, { backgroundColor: '#2E7D32' }]}
            onPress={() => { setOpen(false); Linking.openURL(`tel:${ADMIN_PHONE}`); }}>
            <Ionicons name="call" size={18} color="#FFF" />
            <Text style={styles.actionTxt}>اتصل بوصلي</Text>
          </TouchableOpacity>
        </>
      )}
      <TouchableOpacity style={styles.fab} onPress={() => setOpen(o => !o)} activeOpacity={0.9}>
        <Ionicons name={open ? 'close' : 'headset'} size={26} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, alignItems: 'flex-end', zIndex: 999 },
  fab: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FF6B00', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#FF6B00', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 24, marginBottom: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  actionTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});
