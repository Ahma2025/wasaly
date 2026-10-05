import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PopIn } from '../components/Anim';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { setToken, clearToken, ONLINE_KEY } from '../utils/storage';
import { COLORS, GRADIENTS, SHADOW, RTL, KAV_BEHAVIOR } from '../theme';

// موقع سريع للدخول (مهلة + آخر موقع معروف) — بدون إرسال إحداثيات فارغة أبداً
async function quickFix() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
      new Promise(r => setTimeout(() => r(null), 7000)),
    ]);
    const c = fix?.coords || (await Location.getLastKnownPositionAsync().catch(() => null))?.coords;
    if (c && Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) return { lat: c.latitude, lng: c.longitude };
  } catch {}
  return null;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const passRef = useRef(null);
  const { login } = useAuth();

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  const handleLogin = async () => {
    if (loading) return;
    if (!phone.trim() || !password) return Alert.alert('بيانات ناقصة', 'أدخل رقم الهاتف وكلمة المرور');
    setLoading(true);
    setStage('جاري الدخول...');
    try {
      const res = await api.post('/auth/login-password', { phone: normalizePhone(phone), password });
      if (!res?.token || !res?.user) throw { message: 'استجابة غير متوقعة من السيرفر' };
      if (res.user.role !== 'driver') {
        Alert.alert('خطأ', 'هذا الحساب ليس حساب مندوب');
        return;
      }
      // نخزّن التوكن أولاً حتى تعمل الطلبات، ثم نصبح "متصل" مع الموقع، ثم ندخل للرئيسية (بلا سباق)
      await setToken(res.token);
      setStage('تحديد موقعك...');
      const fix = await quickFix();
      setStage('تفعيل الاتصال...');
      try {
        await api.patch('/drivers/status', fix ? { is_online: true, lat: fix.lat, lng: fix.lng } : { is_online: true });
        await AsyncStorage.setItem(ONLINE_KEY, '1').catch(() => {});
      } catch { await AsyncStorage.setItem(ONLINE_KEY, '0').catch(() => {}); }
      await login(res.token, res.user);
    } catch (e) {
      await clearToken();
      Alert.alert('تعذّر الدخول', e?.message || 'رقم الهاتف أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
      setStage('');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KAV_BEHAVIOR}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 56 }]}>
          <View style={styles.heroGlow} />
          <PopIn>
            <View style={styles.emoji}><Text style={{ fontSize: 52 }}>🛵</Text></View>
          </PopIn>
          <Text style={styles.title}>وصلّي</Text>
          <Text style={styles.subtitle}>تطبيق المندوبين</Text>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, RTL.text]}>تسجيل الدخول</Text>
          <Text style={[styles.label, RTL.text]}>رقم الهاتف</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={20} color={COLORS.gray} />
            <TextInput style={styles.input} placeholder="05XXXXXXXX" placeholderTextColor={COLORS.faint} keyboardType="phone-pad"
              value={phone} onChangeText={setPhone} textAlign="right" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} editable={!loading} />
          </View>

          <Text style={[styles.label, RTL.text]}>كلمة المرور</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.gray} />
            <TextInput ref={passRef} style={styles.input} placeholder="••••••" placeholderTextColor={COLORS.faint} secureTextEntry={!showPass}
              value={password} onChangeText={setPassword} textAlign="right" returnKeyType="done" onSubmitEditing={handleLogin} editable={!loading} />
            <TouchableOpacity onPress={() => setShowPass(s => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={handleLogin} disabled={loading} style={[styles.btn, loading && { opacity: 0.8 }]}>
            <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnGrad}>
              {loading && <ActivityIndicator color="#FFF" />}
              <Text style={styles.btnText}>{loading ? stage : 'دخول'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.note}>يتم إنشاء حسابات المندوبين عبر لوحة الإدارة</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  hero: { alignItems: 'center', paddingBottom: 70, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden', ...SHADOW.float },
  heroGlow: { position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.10)' },
  emoji: { width: 100, height: 100, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  title: { fontSize: 40, fontWeight: '900', textAlign: 'center', color: '#FFF', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', color: 'rgba(255,255,255,0.92)', marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, marginHorizontal: 20, marginTop: -40, borderRadius: 26, padding: 22, ...SHADOW.card },
  cardTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 16, paddingHorizontal: 14, backgroundColor: COLORS.inputBg, marginBottom: 16 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: COLORS.text },
  btn: { borderRadius: 18, overflow: 'hidden', marginTop: 8, ...SHADOW.float },
  btnGrad: { flexDirection: 'row-reverse', gap: 10, padding: 17, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  btnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  note: { textAlign: 'center', color: COLORS.gray, marginTop: 24, fontSize: 13 },
});
