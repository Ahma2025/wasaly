import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, Animated, Easing, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PopIn, FadeIn, GradientButton } from '../components/Anim';
import FloatingField from '../components/FloatingField';
import { HeroDecor } from '../components/GradientHeader';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPRING, EASE_OUT, haptic, useReducedMotion } from '../utils/motion';

const AUTH_TIMEOUT = 30000; // مهلة أطول للشبكات الضعيفة — يمنع "فشل" وهمي بعد نجاح فعلي
const { width: SW } = Dimensions.get('window');

// أيقونات طافية خلف الشعار (زينة حركية خفيفة)
const FLOATERS = [
  { icon: 'pizza', x: 0.12, y: 0.32, size: 22, d: 0 },
  { icon: 'cafe', x: 0.82, y: 0.26, size: 20, d: 400 },
  { icon: 'fast-food', x: 0.86, y: 0.62, size: 24, d: 800 },
  { icon: 'ice-cream', x: 0.1, y: 0.68, size: 20, d: 1200 },
];

function Floater({ icon, x, y, size, d, reduce }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const l = Animated.loop(Animated.sequence([
      Animated.delay(d),
      Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [reduce]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });
  return (
    <Animated.View pointerEvents="none" style={[styles0.floater, { left: SW * x, top: `${y * 100}%`, transform: [{ translateY: ty }, { rotate: rot }] }]}>
      <Ionicons name={icon} size={size} color="rgba(255,255,255,0.55)" />
    </Animated.View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const [tab, setTab] = useState('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});   // {field: msg}
  const [banner, setBanner] = useState(null);  // {type:'error'|'info', msg, action?}

  // مؤشر التبويب المنزلق + انتقال النموذج
  const [tabsW, setTabsW] = useState(0);
  const tabX = useRef(new Animated.Value(0)).current;
  const formV = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!tabsW) return;
    const half = (tabsW - 10) / 2;
    // RTL: "تسجيل الدخول" على اليمين
    Animated.spring(tabX, { toValue: tab === 'login' ? half : 0, ...SPRING }).start();
    if (!reduce) {
      formV.setValue(0);
      Animated.timing(formV, { toValue: 1, duration: 320, easing: EASE_OUT, useNativeDriver: true }).start();
    }
  }, [tab, tabsW]);
  useEffect(() => { if (tabsW) tabX.setValue(tab === 'login' ? (tabsW - 10) / 2 : 0); }, [tabsW]);

  const normalizePhone = (p) => (p || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

  const switchTab = (t) => { if (t !== tab) haptic.select(); setTab(t); setErrors({}); setBanner(null); };

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
    if (!validate()) { haptic.warning(); return; }
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
      haptic.error();
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

  const clearErr = (field) => () => setErrors(e => ({ ...e, [field]: undefined }));
  const np = normalizePhone(phone);
  const formY = formV.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 48 }]}>
          <HeroDecor />
          {FLOATERS.map((f, i) => <Floater key={i} {...f} reduce={reduce} />)}
          <PopIn>
            <View style={styles.logo}>
              <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)']} style={StyleSheet.absoluteFill} />
              <Ionicons name="bicycle" size={50} color="#FFF" />
            </View>
          </PopIn>
          <FadeIn delay={120}><Text style={styles.appName}>وصلّي</Text></FadeIn>
          <FadeIn delay={200}><Text style={styles.tagline}>أشهى المطاعم والمتاجر… لباب بيتك</Text></FadeIn>
        </LinearGradient>

        <FadeIn delay={160} from={30} style={styles.card}>
          <Text style={styles.welcome}>{tab === 'login' ? 'أهلاً فيك من جديد 👋' : 'خلّينا نبلّش 🎉'}</Text>
          <Text style={styles.welcomeSub}>{tab === 'login' ? 'سجّل دخولك وكمّل من وين وقفت' : 'حساب جديد بأقل من دقيقة'}</Text>

          <View style={styles.tabs} onLayout={e => setTabsW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
            {tabsW > 0 && (
              <Animated.View style={[styles.tabIndicator, { width: (tabsW - 10) / 2, transform: [{ translateX: tabX }] }]}>
                <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            )}
            {[['login', 'تسجيل الدخول'], ['register', 'حساب جديد']].map(([k, l]) => (
              <TouchableOpacity key={k} style={styles.tab} onPress={() => switchTab(k)} activeOpacity={0.85}
                accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
                <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {banner && (
            <PopIn from={0.95}>
              <View style={[styles.banner, banner.type === 'info' ? styles.bannerInfo : styles.bannerErr]} accessibilityLiveRegion="polite">
                <Ionicons name={banner.type === 'info' ? 'information-circle' : 'alert-circle'} size={20} color={banner.type === 'info' ? C.primary : C.red} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bannerText, { color: banner.type === 'info' ? C.text : C.red }]}>{banner.msg}</Text>
                  {banner.action && (
                    <TouchableOpacity onPress={banner.action.run} style={{ marginTop: 6 }} accessibilityRole="button">
                      <Text style={styles.bannerAction}>{banner.action.label} ‹</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </PopIn>
          )}

          <Animated.View style={[styles.form, { opacity: formV, transform: [{ translateY: formY }] }]}>
            {tab === 'register' && (
              <>
                <FloatingField icon="person-outline" label="الاسم الكامل" value={name} onChangeText={setName}
                  error={errors.name} valid={name.trim().length > 1} onFocus={clearErr('name')} autoComplete="name" textContentType="name" />
                <FloatingField icon="location-outline" label="المدينة" value={city} onChangeText={setCity}
                  error={errors.city} valid={city.trim().length > 1} onFocus={clearErr('city')} />
              </>
            )}
            <FloatingField icon="call-outline" label="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              error={errors.phone} valid={np.length >= 9} onFocus={clearErr('phone')} autoComplete="tel" textContentType="telephoneNumber" />
            <FloatingField icon="lock-closed-outline" label="كلمة المرور" value={password} onChangeText={setPassword} secure
              error={errors.password} onFocus={clearErr('password')} autoComplete="password" textContentType="password" />

            {tab === 'register' && (
              <FloatingField icon="gift-outline" label="كود دعوة (اختياري) — 10₪ هدية" value={referralCode} onChangeText={setReferralCode}
                autoCapitalize="characters" error={errors.referral} onFocus={clearErr('referral')} />
            )}

            <GradientButton title={tab === 'login' ? 'دخول' : 'إنشاء الحساب'} onPress={handleSubmit} loading={loading} height={56}
              icon={!loading ? <Ionicons name={tab === 'login' ? 'log-in-outline' : 'sparkles'} size={20} color="#FFF" /> : null}
              style={{ marginTop: 6 }} textStyle={{ fontSize: 17 }} />

            <Text style={styles.switchHint}>
              {tab === 'login' ? 'ما عندك حساب؟ ' : 'عندك حساب؟ '}
              <Text style={styles.switchLink} onPress={() => switchTab(tab === 'login' ? 'register' : 'login')}>
                {tab === 'login' ? 'أنشئ حساب جديد' : 'سجّل الدخول'}
              </Text>
            </Text>
          </Animated.View>
        </FadeIn>

        <View style={styles.trust}>
          {[['shield-checkmark', 'بياناتك بأمان'], ['flash', 'توصيل سريع'], ['headset', 'دعم مباشر']].map(([ic, t]) => (
            <View key={t} style={styles.trustItem}>
              <View style={[styles.trustIcon, { backgroundColor: C.tint }]}><Ionicons name={ic} size={16} color={C.primary} /></View>
              <Text style={styles.trustTxt}>{t}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles0 = StyleSheet.create({
  floater: { position: 'absolute' },
});

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, paddingBottom: 20 },
  hero: { alignItems: 'center', paddingBottom: 70, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflow: 'hidden' },
  logo: { width: 100, height: 100, borderRadius: 34, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  appName: { fontSize: 40, fontWeight: '900', color: '#FFF', marginTop: 14, textAlign: 'center' },
  tagline: { fontSize: 14.5, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '500', textAlign: 'center' },
  card: { backgroundColor: C.card, marginHorizontal: 18, marginTop: -44, borderRadius: 30, padding: 20, paddingTop: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  welcome: { fontSize: 21, fontWeight: '900', color: C.text, textAlign: 'right' },
  welcomeSub: { fontSize: 13.5, fontWeight: '500', color: C.gray, textAlign: 'right', marginTop: 3, marginBottom: 16 },
  tabs: { flexDirection: 'row-reverse', backgroundColor: C.inputBg, borderRadius: 18, padding: 5, marginBottom: 16 },
  tabIndicator: { position: 'absolute', top: 5, bottom: 5, left: 5, borderRadius: 14, overflow: 'hidden', ...C.shadow.glow },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14 },
  tabText: { fontWeight: '800', color: C.gray, fontSize: 14 },
  tabTextActive: { color: '#FFF' },
  form: { gap: 12 },
  banner: { flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start', padding: 13, borderRadius: 16, marginBottom: 14 },
  bannerInfo: { backgroundColor: C.sec, borderWidth: 1, borderColor: C.tintBorder },
  bannerErr: { backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.dangerBorder },
  bannerText: { fontSize: 13.5, fontWeight: '500', lineHeight: 21, textAlign: 'right' },
  bannerAction: { color: C.primary, fontWeight: '900', fontSize: 14, textAlign: 'right' },
  switchHint: { textAlign: 'center', color: C.sub, fontSize: 13.5, marginTop: 6, fontWeight: '500' },
  switchLink: { color: C.primary, fontWeight: '900' },
  trust: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 22, marginTop: 22 },
  trustItem: { alignItems: 'center', gap: 6 },
  trustIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trustTxt: { fontSize: 11.5, fontWeight: '700', color: C.gray },
});
