import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

const COLORS = { primary: '#FF6B00', bg: '#FFF', text: '#1A1A2E', gray: '#8E8E93', border: '#E5E5EA' };

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useAuth();
  const [tab, setTab] = useState('login'); // login | register
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) return Alert.alert('خطأ', 'أدخل رقم الهاتف وكلمة المرور');
    setLoading(true);
    try {
      const res = await api.post('/auth/login-password', { phone, password, role: 'customer' });
      await login(res.token, res.user);
    } catch (e) {
      Alert.alert('خطأ', e.message || 'بيانات غير صحيحة');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim() || !phone || !password || !city.trim())
      return Alert.alert('خطأ', 'أدخل جميع البيانات');
    if (password.length < 6) return Alert.alert('خطأ', 'كلمة المرور 6 أحرف على الأقل');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { name, phone, password, city });
      await login(res.token, res.user);
    } catch (e) {
      Alert.alert('خطأ', e.message || 'حدث خطأ، حاول مجدداً');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoArea}>
          <Text style={styles.logo}>🍕</Text>
          <Text style={styles.appName}>وصلّي</Text>
          <Text style={styles.tagline}>توصيل سريع لأشهى المطاعم</Text>
        </View>

        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'login' && styles.tabActive]} onPress={() => setTab('login')}>
            <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>تسجيل الدخول</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'register' && styles.tabActive]} onPress={() => setTab('register')}>
            <Text style={[styles.tabText, tab === 'register' && styles.tabTextActive]}>حساب جديد</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {tab === 'register' && (
            <>
              <TextInput style={styles.input} placeholder="الاسم الكامل" value={name} onChangeText={setName} />
              <TextInput style={styles.input} placeholder="المدينة" value={city} onChangeText={setCity} />
            </>
          )}
          <TextInput style={styles.input} placeholder="رقم الهاتف" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TextInput style={styles.input} placeholder="كلمة المرور" secureTextEntry value={password} onChangeText={setPassword} />

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]}
            onPress={tab === 'login' ? handleLogin : handleRegister} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'جاري التحميل...' : tab === 'login' ? 'دخول' : 'إنشاء الحساب'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center', paddingVertical: 40 },
  logoArea: { alignItems: 'center', marginBottom: 36 },
  logo: { fontSize: 60 },
  appName: { fontSize: 36, fontWeight: '900', color: COLORS.primary, marginTop: 8 },
  tagline: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  tabs: { flexDirection: 'row', backgroundColor: '#F3F3F3', borderRadius: 12, padding: 4, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontWeight: '600', color: COLORS.gray },
  tabTextActive: { color: '#FFF' },
  form: { gap: 14 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 14, fontSize: 16, color: COLORS.text },
  btn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
