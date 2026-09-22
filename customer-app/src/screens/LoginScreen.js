import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { PopIn, GradientButton } from '../components/Anim';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useAuth();
  const { colors: COLORS } = useTheme();
  const styles = React.useMemo(() => makeStyles(COLORS), [COLORS]);
  const [tab, setTab] = useState('login'); // login | register
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  const handleLogin = async () => {
    if (!phone || !password) return Alert.alert('خطأ', 'أدخل رقم الهاتف وكلمة المرور');
    const normalizedPhone = normalizePhone(phone);
    setLoading(true);
    try {
      const res = await api.post('/auth/login-password', { phone: normalizedPhone, password });
      await login(res.token, res.user);
    } catch (e) {
      Alert.alert('خطأ تسجيل الدخول', 'رقم الهاتف أو كلمة المرور غير صحيحة. حاول مرة أخرى.');
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim() || !phone || !password || !city.trim())
      return Alert.alert('خطأ', 'أدخل جميع البيانات');
    if (password.length < 6) return Alert.alert('خطأ', 'كلمة المرور 6 أحرف على الأقل');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { name, phone: normalizePhone(phone), password, city, referred_by: referralCode.trim() || undefined });
      await login(res.token, res.user);
    } catch (e) {
      Alert.alert('خطأ', e.message || 'حدث خطأ، حاول مجدداً');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        {/* Hero متدرّج */}
        <LinearGradient colors={COLORS.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <PopIn>
            <View style={styles.logo}><Text style={{ fontSize: 52 }}>🍕</Text></View>
          </PopIn>
          <Text style={styles.appName}>وصلّي</Text>
          <Text style={styles.tagline}>توصيل سريع لأشهى المطاعم</Text>
        </LinearGradient>

        {/* بطاقة النموذج */}
        <View style={styles.card}>
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
                <TextInput style={styles.input} placeholder="الاسم الكامل" placeholderTextColor={COLORS.gray} value={name} onChangeText={setName} />
                <TextInput style={styles.input} placeholder="المدينة" placeholderTextColor={COLORS.gray} value={city} onChangeText={setCity} />
                <TextInput style={styles.input} placeholder="كود دعوة (اختياري) — 10₪ هدية 🎁" placeholderTextColor={COLORS.gray} value={referralCode} onChangeText={setReferralCode} autoCapitalize="characters" />
              </>
            )}
            <TextInput style={styles.input} placeholder="رقم الهاتف" placeholderTextColor={COLORS.gray} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            <TextInput style={styles.input} placeholder="كلمة المرور" placeholderTextColor={COLORS.gray} secureTextEntry value={password} onChangeText={setPassword} />

            <GradientButton
              title={loading ? 'جاري التحميل...' : tab === 'login' ? 'دخول' : 'إنشاء الحساب'}
              onPress={tab === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              height={54}
              style={{ marginTop: 6 }}
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 90, paddingBottom: 70, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, ...COLORS.shadow.float },
  logo: { width: 100, height: 100, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  appName: { fontSize: 40, fontWeight: '900', color: '#FFF', marginTop: 16 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, marginHorizontal: 20, marginTop: -40, borderRadius: 26, padding: 20, ...COLORS.shadow.card },
  tabs: { flexDirection: 'row', backgroundColor: COLORS.inputBg, borderRadius: 16, padding: 5, marginBottom: 22 },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: COLORS.primary, ...COLORS.shadow.soft },
  tabText: { fontWeight: '700', color: COLORS.gray },
  tabTextActive: { color: '#FFF' },
  form: { gap: 14 },
  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, padding: 15, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.inputBg },
});
