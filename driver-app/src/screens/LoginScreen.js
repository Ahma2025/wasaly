import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PopIn } from '../components/Anim';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { COLORS, GRADIENTS, SHADOW } from '../theme';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  const handleLogin = async () => {
    if (!phone || !password) return Alert.alert('خطأ', 'أدخل رقم الهاتف وكلمة المرور');
    setLoading(true);
    try {
      const res = await api.post('/auth/login-password', { phone: normalizePhone(phone), password });
      if (res.user.role !== 'driver') return Alert.alert('خطأ', 'هذا الحساب ليس حساب مندوب');
      await login(res.token, res.user);
      // Set driver online automatically after login
      try { await api.patch('/drivers/status', { is_online: true }); } catch {}
    } catch (e) {
      Alert.alert('خطأ', e.message || 'رقم الهاتف أو كلمة المرور غير صحيحة');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <PopIn>
            <View style={styles.emoji}><Text style={{ fontSize: 52 }}>🏍️</Text></View>
          </PopIn>
          <Text style={styles.title}>وصلّي</Text>
          <Text style={styles.subtitle}>تطبيق السائقين</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput style={styles.input} placeholder="05XXXXXXXX" placeholderTextColor={COLORS.gray} keyboardType="phone-pad"
            value={phone} onChangeText={setPhone} textAlign="right" />

          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput style={styles.input} placeholder="••••••" placeholderTextColor={COLORS.gray} secureTextEntry
            value={password} onChangeText={setPassword} textAlign="right" />

          <TouchableOpacity activeOpacity={0.9} onPress={handleLogin} disabled={loading} style={[styles.btn, loading && { opacity: 0.7 }]}>
            <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGrad}>
              <Text style={styles.btnText}>{loading ? 'جاري الدخول...' : 'دخول'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.note}>يتم إنشاء حسابات السائقين عبر لوحة الإدارة</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  hero: { alignItems: 'center', paddingTop: 90, paddingBottom: 70, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, ...SHADOW.float },
  emoji: { width: 100, height: 100, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  title: { fontSize: 40, fontWeight: '900', textAlign: 'center', color: '#FFF', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', color: 'rgba(255,255,255,0.92)', marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, marginHorizontal: 20, marginTop: -40, borderRadius: 26, padding: 22, ...SHADOW.card },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 16, padding: 15, fontSize: 16, backgroundColor: COLORS.inputBg, marginBottom: 16, color: COLORS.text },
  btn: { borderRadius: 18, overflow: 'hidden', marginTop: 8, ...SHADOW.float },
  btnGrad: { padding: 17, alignItems: 'center', borderRadius: 18 },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  note: { textAlign: 'center', color: COLORS.gray, marginTop: 24, fontSize: 13 },
});
