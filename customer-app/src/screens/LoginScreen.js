import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const COLORS = { primary: '#FF6B00', bg: '#FFF', text: '#1A1A2E', gray: '#8E8E93', border: '#E5E5EA' };

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState('phone'); // phone | otp | name
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const sendOtp = async () => {
    if (!phone || phone.length < 10) return Alert.alert('خطأ', 'أدخل رقم هاتف صحيح');
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { phone });
      setStep('otp');
    } catch (e) {
      Alert.alert('خطأ', e.message);
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otp || otp.length < 4) return Alert.alert('خطأ', 'أدخل رمز التحقق');
    setLoading(true);
    try {
      const data = await api.post('/auth/verify-otp', { phone, code: otp, name });
      if (data.isNew && !name) { setIsNewUser(true); setStep('name'); setLoading(false); return; }
      await login(data.token, data.user);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('خطأ', e.message || 'رمز التحقق غير صحيح');
    } finally { setLoading(false); }
  };

  const completeName = async () => {
    if (!name.trim()) return Alert.alert('خطأ', 'أدخل اسمك');
    setLoading(true);
    try {
      const data = await api.post('/auth/verify-otp', { phone, code: otp, name });
      await login(data.token, data.user);
      router.replace('/(tabs)');
    } catch (e) { Alert.alert('خطأ', e.message); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoArea}>
          <Text style={styles.logo}>🍕</Text>
          <Text style={styles.appName}>وصلي</Text>
          <Text style={styles.tagline}>توصيل سريع لأشهى المطاعم</Text>
        </View>

        {step === 'phone' && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>أدخل رقم هاتفك</Text>
            <View style={styles.inputRow}>
              <Text style={styles.flag}>🇵🇸 +970</Text>
              <TextInput style={styles.phoneInput} placeholder="5XXXXXXXX" keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={10} />
            </View>
            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={sendOtp} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'}</Text>
            </TouchableOpacity>
            <Text style={styles.terms}>بالمتابعة أنت توافق على <Text style={{ color: COLORS.primary }}>شروط الاستخدام</Text> و<Text style={{ color: COLORS.primary }}>سياسة الخصوصية</Text></Text>
          </View>
        )}

        {step === 'otp' && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>رمز التحقق</Text>
            <Text style={styles.formSub}>أرسلنا رمزاً إلى {phone}</Text>
            <TextInput style={styles.otpInput} placeholder="------" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} textAlign="center" />
            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={verifyOtp} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'جاري التحقق...' : 'تأكيد'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('phone')} style={styles.backLink}>
              <Text style={{ color: COLORS.primary }}>تغيير رقم الهاتف</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'name' && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>مرحباً بك! 👋</Text>
            <Text style={styles.formSub}>أدخل اسمك لإكمال التسجيل</Text>
            <TextInput style={styles.nameInput} placeholder="الاسم الكامل" value={name} onChangeText={setName} />
            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={completeName} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'جاري التسجيل...' : 'إنشاء الحساب'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  logoArea: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 60 },
  appName: { fontSize: 36, fontWeight: '900', color: COLORS.primary, marginTop: 8 },
  tagline: { fontSize: 14, color: COLORS.gray, marginTop: 4 },
  form: { gap: 16 },
  formTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  formSub: { fontSize: 14, color: COLORS.gray },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, overflow: 'hidden' },
  flag: { paddingHorizontal: 12, paddingVertical: 14, backgroundColor: '#F8F9FA', fontSize: 14, color: COLORS.text },
  phoneInput: { flex: 1, padding: 14, fontSize: 16, color: COLORS.text },
  otpInput: { borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 14, padding: 16, fontSize: 24, letterSpacing: 8, color: COLORS.text },
  nameInput: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, padding: 14, fontSize: 16 },
  btn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  terms: { fontSize: 12, color: COLORS.gray, textAlign: 'center', lineHeight: 18 },
  backLink: { alignItems: 'center' }
});
