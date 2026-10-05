import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Alert, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PopIn, FadeIn, RadarRings, GradientButton, haptic } from '../components/Anim';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { setToken, clearToken, ONLINE_KEY } from '../utils/storage';
import { COLORS, GRADIENTS, SHADOW, RTL, KAV_BEHAVIOR, RADIUS } from '../theme';

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

// حقل إدخال بعنوان فوقه + حالة تركيز + خطأ داخلي
function Field({ label, icon, error, focused, children, right }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, RTL.text]}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocus, !!error && styles.inputError]}>
        <Ionicons name={icon} size={20} color={error ? COLORS.red : focused ? COLORS.primary : COLORS.gray} />
        {children}
        {right}
      </View>
      {!!error && (
        <View style={[RTL.row, { gap: 4, marginTop: 6 }]}>
          <Ionicons name="alert-circle" size={14} color={COLORS.red} />
          <Text style={[styles.errText, RTL.text]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [focus, setFocus] = useState(null);
  const [errors, setErrors] = useState({});
  const passRef = useRef(null);
  const { login } = useAuth();

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  const handleLogin = async () => {
    if (loading) return;
    const errs = {};
    if (!phone.trim()) errs.phone = 'أدخل رقم الهاتف';
    if (!password) errs.password = 'أدخل كلمة المرور';
    setErrors(errs);
    if (Object.keys(errs).length) { haptic.warn(); return; }
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
      haptic.success();
      await login(res.token, res.user);
    } catch (e) {
      await clearToken();
      haptic.warn();
      Alert.alert('تعذّر الدخول', e?.message || 'رقم الهاتف أو كلمة المرور غير صحيحة');
    } finally {
      setLoading(false);
      setStage('');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KAV_BEHAVIOR}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 36 }]}>
          <View style={styles.orbA} />
          <View style={styles.orbB} />
          <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />
          <PopIn>
            <RadarRings size={150} color="rgba(255,255,255,0.35)" duration={2800}>
              <View style={styles.logo}>
                <LinearGradient colors={GRADIENTS.glass} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <MaterialCommunityIcons name="moped" size={50} color="#FFF" />
              </View>
            </RadarRings>
          </PopIn>
          <FadeIn delay={120} from={10} style={{ alignItems: 'center' }}>
            <Text style={styles.title}>وصلّي</Text>
            <View style={styles.tagPill}>
              <View style={styles.tagDot} />
              <Text style={styles.subtitle}>تطبيق كباتن التوصيل</Text>
            </View>
          </FadeIn>
        </LinearGradient>

        <FadeIn delay={200} from={24}>
          <View style={styles.card}>
            <Text style={[styles.cardTitle, RTL.text]}>أهلاً بعودتك</Text>
            <Text style={[styles.cardSub, RTL.text]}>سجّل دخولك لبدء استقبال الطلبات</Text>

            <Field label="رقم الهاتف" icon="call-outline" error={errors.phone} focused={focus === 'phone'}>
              <TextInput style={styles.input} placeholder="05XXXXXXXX" placeholderTextColor={COLORS.faint} keyboardType="phone-pad"
                autoComplete="tel" textContentType="telephoneNumber" accessibilityLabel="رقم الهاتف"
                value={phone} onChangeText={(t) => { setPhone(t); if (errors.phone) setErrors(e => ({ ...e, phone: null })); }}
                onFocus={() => setFocus('phone')} onBlur={() => setFocus(null)}
                textAlign="right" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} editable={!loading} />
            </Field>

            <Field label="كلمة المرور" icon="lock-closed-outline" error={errors.password} focused={focus === 'pass'}
              right={(
                <Pressable onPress={() => setShowPass(s => !s)} hitSlop={12} accessibilityLabel={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} style={styles.eye}>
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray} />
                </Pressable>
              )}>
              <TextInput ref={passRef} style={styles.input} placeholder="••••••" placeholderTextColor={COLORS.faint} secureTextEntry={!showPass}
                autoComplete="password" textContentType="password" accessibilityLabel="كلمة المرور"
                value={password} onChangeText={(t) => { setPassword(t); if (errors.password) setErrors(e => ({ ...e, password: null })); }}
                onFocus={() => setFocus('pass')} onBlur={() => setFocus(null)}
                textAlign="right" returnKeyType="done" onSubmitEditing={handleLogin} editable={!loading} />
            </Field>

            <GradientButton label="دخول" icon="arrow-back" onPress={handleLogin} loading={loading} loadingLabel={stage} style={{ marginTop: 8 }} />

            <View style={[RTL.row, styles.noteRow]}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.gray} />
              <Text style={styles.note}>يتم إنشاء حسابات المندوبين عبر لوحة الإدارة</Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={320}>
          <View style={[RTL.row, styles.trust]}>
            {[{ i: 'shield-checkmark-outline', t: 'دخول آمن' }, { i: 'flash-outline', t: 'طلبات فورية' }, { i: 'wallet-outline', t: 'أرباح يومية' }].map(x => (
              <View key={x.t} style={styles.trustItem}>
                <Ionicons name={x.i} size={18} color={COLORS.primary} />
                <Text style={styles.trustText}>{x.t}</Text>
              </View>
            ))}
          </View>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  hero: { alignItems: 'center', paddingBottom: 70, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden', backgroundColor: '#FF5E3A', ...SHADOW.float },
  orbA: { position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbB: { position: 'absolute', bottom: -60, left: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.07)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  logo: { width: 96, height: 96, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  title: { fontSize: 44, fontWeight: '900', textAlign: 'center', color: '#FFF', marginTop: 4 },
  tagPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', marginTop: 6 },
  tagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3BDB7E' },
  subtitle: { fontSize: 14, color: '#FFF', fontWeight: '700' },
  card: { backgroundColor: COLORS.card, marginHorizontal: 20, marginTop: -44, borderRadius: RADIUS.lg + 2, padding: 22, ...SHADOW.card },
  cardTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  cardSub: { fontSize: 13.5, color: COLORS.gray, marginTop: 4, marginBottom: 18, fontWeight: '500' },
  label: { fontSize: 13.5, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, height: 56, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: RADIUS.md - 2, paddingHorizontal: 14, backgroundColor: COLORS.inputBg },
  inputFocus: { borderColor: COLORS.primary, backgroundColor: COLORS.card, shadowColor: COLORS.primary, shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  inputError: { borderColor: COLORS.red, backgroundColor: COLORS.redSoft },
  input: { flex: 1, height: '100%', fontSize: 16.5, color: COLORS.text },
  eye: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  errText: { color: COLORS.red, fontSize: 12.5, fontWeight: '700' },
  noteRow: { justifyContent: 'center', gap: 6, marginTop: 20 },
  note: { textAlign: 'center', color: COLORS.gray, fontSize: 12.5, fontWeight: '500' },
  trust: { justifyContent: 'center', gap: 10, marginTop: 20, marginHorizontal: 20 },
  trustItem: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: COLORS.card, borderRadius: RADIUS.md, paddingVertical: 12, borderWidth: 1, borderColor: COLORS.line },
  trustText: { fontSize: 12, fontWeight: '700', color: COLORS.sub },
});
