import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93', bg: '#F8F9FA' };

export default function LoginScreen() {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [vehicleType, setVehicleType] = useState('دراجة');
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const { login } = useAuth();

  const sendOtp = async () => {
    if (phone.length < 10) return Alert.alert('خطأ', 'أدخل رقم هاتف صحيح');
    setLoading(true);
    try {
      await api.post('/auth/otp/send', { phone });
      setStep('otp');
    } catch { Alert.alert('خطأ', 'تعذر إرسال الرمز'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (otp.length < 4) return Alert.alert('خطأ', 'أدخل رمز التحقق');
    setLoading(true);
    try {
      const data = await api.post('/auth/otp/verify', { phone, otp, role: 'driver' });
      if (data.isNew) { setIsNew(true); setStep('info'); }
      else { login(data.token, data.user); }
    } catch { Alert.alert('خطأ', 'رمز خاطئ'); }
    finally { setLoading(false); }
  };

  const register = async () => {
    if (!name) return Alert.alert('خطأ', 'أدخل اسمك');
    setLoading(true);
    try {
      const data = await api.post('/auth/register', { phone, otp, name, role: 'driver', vehicle_type: vehicleType });
      login(data.token, data.user);
    } catch { Alert.alert('خطأ', 'حاول مرة أخرى'); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <Text style={styles.emoji}>🏍️</Text>
        <Text style={styles.title}>وصلّي</Text>
        <Text style={styles.subtitle}>تطبيق المناديب</Text>

        {step === 'phone' && (
          <>
            <Text style={styles.label}>رقم الهاتف</Text>
            <TextInput style={styles.input} placeholder="+970..." keyboardType="phone-pad" value={phone} onChangeText={setPhone} textAlign="right" />
            <TouchableOpacity style={styles.btn} onPress={sendOtp} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'otp' && (
          <>
            <Text style={styles.label}>رمز التحقق</Text>
            <TextInput style={[styles.input, { letterSpacing: 8, textAlign: 'center', fontSize: 24 }]} placeholder="• • • •" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} />
            <TouchableOpacity style={styles.btn} onPress={verifyOtp} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'جاري التحقق...' : 'تحقق'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('phone')}><Text style={styles.back}>← تغيير الرقم</Text></TouchableOpacity>
          </>
        )}

        {step === 'info' && (
          <>
            <Text style={styles.label}>الاسم الكامل</Text>
            <TextInput style={styles.input} placeholder="اسمك الكامل" value={name} onChangeText={setName} textAlign="right" />
            <Text style={styles.label}>نوع المركبة</Text>
            <View style={styles.vehicleRow}>
              {['دراجة', 'سيارة', 'دراجة هوائية'].map(v => (
                <TouchableOpacity key={v} style={[styles.vehicleBtn, vehicleType === v && styles.vehicleBtnActive]} onPress={() => setVehicleType(v)}>
                  <Text style={[styles.vehicleBtnText, vehicleType === v && { color: '#FFF' }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.btn} onPress={register} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'جاري التسجيل...' : 'ابدأ التوصيل'}</Text>
            </TouchableOpacity>
          </>
        )}
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
  back: { textAlign: 'center', color: COLORS.gray, marginTop: 16, fontWeight: '600' },
  vehicleRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  vehicleBtn: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E5EA', alignItems: 'center', backgroundColor: '#FFF' },
  vehicleBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  vehicleBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.text },
});
