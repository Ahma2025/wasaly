import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PopIn } from '../components/Anim';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AUTH_TIMEOUT = 30000; // مهلة أطول للشبكات الضعيفة — يمنع "فشل" وهمي بعد نجاح فعلي

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});   // {field: msg}
  const [banner, setBanner] = useState(null);  // {type:'error'|'info', msg, action?}

  const normalizePhone = (p) => (p || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

  const switchTab = (t) => { setTab(t); setErrors({}); setBanner(null); };

  const validate = () => {
    const e = {};
    const np = normalizePhone(phone);
    if (tab === 'register') {
      if (!name.trim()) e.name = 'أدخل الاسم الكامل';
      if (!city.trim()) e.city = 'أدخل المدينة';
    }
    if (!np) e.phone = 'أدخل رقم الهاتف';
    else if (np.length < 9) e.phone = 'رقم الهاتف غير صحيح';
    if (!password) e.password = 'أدخل كلمة المرور';
    else if (password.length < 6) e.password = 'كلمة المرور 6 أحرف على الأقل';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    setBanner(null);
    if (!validate()) return;
    const np = normalizePhone(phone);
    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await api.post('/auth/login-password', { phone: np, password }, { timeout: AUTH_TIMEOUT });
        await login(res.token, res.user);
      } else {
        const res = await api.post('/auth/register',
          { name: name.trim(), phone: np, password, city: city.trim(), referred_by: referralCode.trim() || undefined },
          { timeout: AUTH_TIMEOUT });
        await login(res.token, res.user);
      }
    } catch (err) {
      handleError(err, np);
    } finally {
      setLoading(false);
    }
  };

  const handleError = (err, np) => {
    const msg = err?.message || '';
    // رقم مسجّل مسبقاً → وجّه للدخول بدل ما يحتار
    if (err?.code === 'PHONE_EXISTS' || msg.includes('مسجل')) {
      setBanner({
        type: 'info',
        msg: 'هذا الرقم لديه حساب بالفعل. سجّل الدخول به.',
        action: { label: 'تسجيل الدخول بهذا الرقم', run: () => { setTab('login'); setErrors({}); setBanner(null); } },
      });
      return;
    }
    // حقل محدّد من السيرفر
    if (err?.field) { setErrors(e => ({ ...e, [err.field]: msg })); return; }
    // خطأ شبكة/مهلة → قد يكون الحساب أُنشئ فعلاً
    if (msg === 'Network error' || msg.toLowerCase?.().includes('timeout')) {
      setBanner({
        type: 'error',
        msg: tab === 'register'
          ? 'تعذّر الاتصال. تأكد من الإنترنت ثم أعد المحاولة. إذا تكرّر، جرّب تسجيل الدخول — ربما أُنشئ حسابك.'
          : 'تعذّر الاتصال بالخادم. تأكد من الإنترنت وحاول مجدداً.',
      });
      return;
    }
    // دخول خاطئ أو غيره
    setBanner({ type: 'error', msg: msg || 'حدث خطأ، حاول مجدداً.' });
  };

  // دالة (مش مكوّن) — تمنع إعادة التركيب وفقدان تركيز الكيبورد مع كل حرف
  const renderField = ({ icon, field, ...props }) => (
    <View key={field}>
      <View style={[styles.inputWrap, errors[field] && styles.inputErr]}>
        <Ionicons name={icon} size={20} color={errors[field] ? C.red : C.faint} style={{ marginHorizontal: 4 }} />
        <TextInput
          style={styles.input}
          placeholderTextColor={C.faint}
          onFocus={() => setErrors(e => ({ ...e, [field]: undefined }))}
          {...props}
        />
      </View>
      {errors[field] ? <Text style={styles.errText}>⚠ {errors[field]}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 56 }]}>
          <LinearGradient colors={C.gradients.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.heroSheen} pointerEvents="none" />
          <PopIn><View style={styles.logo}><Text style={{ fontSize: 48 }}>🛵</Text></View></PopIn>
          <Text style={styles.appName}>وصلّي</Text>
          <Text style={styles.tagline}>توصيل سريع لأشهى المطاعم</Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.tabs}>
            {[['login', 'تسجيل الدخول'], ['register', 'حساب جديد']].map(([k, l]) => (
              <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => switchTab(k)} activeOpacity={0.85}>
                <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {banner && (
            <View style={[styles.banner, banner.type === 'info' ? styles.bannerInfo : styles.bannerErr]}>
              <Ionicons name={banner.type === 'info' ? 'information-circle' : 'alert-circle'} size={20} color={banner.type === 'info' ? C.primary : C.red} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.bannerText, { color: banner.type === 'info' ? C.text : C.red }]}>{banner.msg}</Text>
                {banner.action && (
                  <TouchableOpacity onPress={banner.action.run} style={{ marginTop: 6 }}>
                    <Text style={styles.bannerAction}>{banner.action.label} ‹</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View style={styles.form}>
            {tab === 'register' && (
              <>
                {renderField({ icon: 'person-outline', field: 'name', placeholder: 'الاسم الكامل', value: name, onChangeText: setName, textAlign: 'right' })}
                {renderField({ icon: 'location-outline', field: 'city', placeholder: 'المدينة', value: city, onChangeText: setCity, textAlign: 'right' })}
              </>
            )}
            {renderField({ icon: 'call-outline', field: 'phone', placeholder: 'رقم الهاتف', keyboardType: 'phone-pad', value: phone, onChangeText: setPhone, textAlign: 'right' })}
            <View>
              <View style={[styles.inputWrap, errors.password && styles.inputErr]}>
                <Ionicons name="lock-closed-outline" size={20} color={errors.password ? C.red : C.faint} style={{ marginHorizontal: 4 }} />
                <TextInput
                  style={styles.input} placeholder="كلمة المرور" placeholderTextColor={C.faint}
                  secureTextEntry={!showPw} value={password} onChangeText={setPassword} textAlign="right"
                  onFocus={() => setErrors(e => ({ ...e, password: undefined }))}
                />
                <TouchableOpacity onPress={() => setShowPw(s => !s)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.faint} />
                </TouchableOpacity>
              </View>
              {errors.password ? <Text style={styles.errText}>⚠ {errors.password}</Text> : null}
            </View>

            {tab === 'register' && renderField({ icon: 'gift-outline', field: 'referral', placeholder: 'كود دعوة (اختياري) — 10₪ هدية 🎁', value: referralCode, onChangeText: setReferralCode, autoCapitalize: 'characters', textAlign: 'right' })}

            <TouchableOpacity activeOpacity={0.9} onPress={handleSubmit} disabled={loading}>
              <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.submit, loading && { opacity: 0.7 }]}>
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.submitText}>{tab === 'login' ? 'دخول' : 'إنشاء الحساب'}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.switchHint}>
              {tab === 'login' ? 'ما عندك حساب؟ ' : 'عندك حساب؟ '}
              <Text style={styles.switchLink} onPress={() => switchTab(tab === 'login' ? 'register' : 'login')}>
                {tab === 'login' ? 'أنشئ حساب جديد' : 'سجّل الدخول'}
              </Text>
            </Text>
          </View>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingBottom: 64, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden', ...C.shadow.float },
  heroSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 90 },
  logo: { width: 96, height: 96, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  appName: { fontSize: 38, fontWeight: '900', color: '#FFF', marginTop: 14 },
  tagline: { fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: C.card, marginHorizontal: 18, marginTop: -38, borderRadius: 28, padding: 20, ...C.shadow.card },
  tabs: { flexDirection: 'row-reverse', backgroundColor: C.inputBg, borderRadius: 16, padding: 5, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  tabActive: { backgroundColor: C.primary, ...C.shadow.soft },
  tabText: { fontWeight: '800', color: C.gray, fontSize: 14 },
  tabTextActive: { color: '#FFF' },
  form: { gap: 13 },
  inputWrap: { flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1.5, borderColor: C.border, borderRadius: 16, paddingHorizontal: 12, backgroundColor: C.inputBg },
  inputErr: { borderColor: C.red, backgroundColor: C.dangerBg },
  input: { flex: 1, paddingVertical: 15, fontSize: 16, color: C.text },
  errText: { color: C.red, fontSize: 12, fontWeight: '700', marginTop: 5, marginRight: 4, textAlign: 'right' },
  banner: { flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start', padding: 13, borderRadius: 14, marginBottom: 16 },
  bannerInfo: { backgroundColor: C.sec, borderWidth: 1, borderColor: C.tint },
  bannerErr: { backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.dangerBorder },
  bannerText: { fontSize: 13.5, fontWeight: '600', lineHeight: 21, textAlign: 'right' },
  bannerAction: { color: C.primary, fontWeight: '900', fontSize: 14, textAlign: 'right' },
  submit: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 4, ...C.shadow.float },
  submitText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  switchHint: { textAlign: 'center', color: C.sub, fontSize: 13.5, marginTop: 6, fontWeight: '600' },
  switchLink: { color: C.primary, fontWeight: '900' },
});
