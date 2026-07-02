import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

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
      <View style={styles.inner}>
        <Text style={styles.emoji}>🏍️</Text>
        <Text style={styles.title}>وصلّي</Text>
        <Text style={styles.subtitle}>تطبيق المناديب</Text>

        <Text style={styles.label}>رقم الهاتف</Text>
        <TextInput style={styles.input} placeholder="05XXXXXXXX" keyboardType="phone-pad"
          value={phone} onChangeText={setPhone} textAlign="right" />

        <Text style={styles.label}>كلمة المرور</Text>
        <TextInput style={styles.input} placeholder="••••••" secureTextEntry
          value={password} onChangeText={setPassword} textAlign="right" />

        <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'جاري الدخول...' : 'دخول'}</Text>
        </TouchableOpacity>

        <Text style={styles.note}>يتم إنشاء حسابات المناديب عبر لوحة الإدارة</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  emoji: { fontSize: 64, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '900', textAlign: 'center', color: COLORS.primary },
  subtitle: { fontSize: 16, textAlign: 'center', color: COLORS.gray, marginBottom: 40 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: '#E5E5EA', borderRadius: 14, padding: 14, fontSize: 16, backgroundColor: '#FFF', marginBottom: 16 },
  btn: { backgroundColor: COLORS.primary, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  note: { textAlign: 'center', color: COLORS.gray, marginTop: 24, fontSize: 13 },
});
