import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, ScrollView, Pressable, Keyboard, Dimensions, Linking, Modal, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PopIn, FadeIn, RadarRings, GradientButton, Press, haptic, isReducedMotion } from '../components/Anim';
import FloatingField from '../components/FloatingField';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { setToken, clearToken, ONLINE_KEY } from '../utils/storage';
import { ADMIN_PHONE, ADMIN_WHATSAPP } from '../config';
import { formatPhone, toLatinDigits } from '../utils/format';
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

const digitsOf = (p) => toLatinDigits(p).replace(/\D/g, '');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ورقة "نسيت كلمة السر؟" — التواصل مع الإدارة (واتساب / اتصال)
function ForgotSheet({ visible, onClose, insets }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: isReducedMotion() ? 0 : 280, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true }).start();
    }
  }, [visible, v]);
  const openWhatsApp = () => {
    onClose();
    const msg = encodeURIComponent('مرحباً، أنا مندوب في وصلّي ونسيت كلمة المرور. أرجو المساعدة في إعادة تعيينها.');
    Linking.openURL(`whatsapp://send?phone=${ADMIN_WHATSAPP}&text=${msg}`)
      .catch(() => Linking.openURL(`https://wa.me/${ADMIN_WHATSAPP}?text=${msg}`).catch(() => {}));
  };
  const call = () => { onClose(); Linking.openURL(`tel:${ADMIN_PHONE}`).catch(() => {}); };
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: v }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY }] }]}>
        <View style={styles.handle} />
        <View style={styles.sheetIcon}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Ionicons name="key" size={26} color="#FFF" />
        </View>
        <Text style={styles.sheetTitle}>نسيت كلمة السر؟</Text>
        <Text style={styles.sheetText}>حسابات الكباتن تُدار من الإدارة. تواصل معنا وسنعيد تعيين كلمة المرور لك بسرعة.</Text>
        <Press onPress={openWhatsApp} style={[styles.sheetBtn, { backgroundColor: COLORS.greenSoft, borderColor: COLORS.greenLine }]} accessibilityLabel="مراسلة الإدارة على واتساب">
          <View style={[styles.sheetBtnIcon, { backgroundColor: '#25D366' }]}><Ionicons name="logo-whatsapp" size={20} color="#FFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetBtnTitle, RTL.text]}>واتساب الإدارة</Text>
            <Text style={[styles.sheetBtnSub, RTL.text]}>الأسرع — رسالة جاهزة</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
        </Press>
        <Press onPress={call} style={[styles.sheetBtn, { backgroundColor: COLORS.brandSoft, borderColor: COLORS.tintLine }]} accessibilityLabel={`اتصال بالإدارة ${ADMIN_PHONE}`}>
          <View style={[styles.sheetBtnIcon, { backgroundColor: COLORS.primary }]}><Ionicons name="call" size={19} color="#FFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetBtnTitle, RTL.text]}>اتصال مباشر</Text>
            <Text style={[styles.sheetBtnSub, RTL.text]}>{formatPhone(ADMIN_PHONE)}</Text>
          </View>
          <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
        </Press>
        <Pressable onPress={onClose} style={styles.sheetCancel} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sheetCancelTxt}>إلغاء</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

// شريط تنبيه داخل البطاقة (بدل Alert) — مع زر إعادة المحاولة لأخطاء الشبكة
function Banner({ banner, onRetry }) {
  if (!banner) return null;
  const net = banner.type === 'network';
  return (
    <FadeIn from={-6} duration={240}>
      <View style={[styles.banner, net ? styles.bannerNet : styles.bannerErr]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Ionicons name={net ? 'cloud-offline-outline' : 'alert-circle'} size={20} color={net ? COLORS.amberDeep : COLORS.redDeep} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, RTL.text, { color: net ? COLORS.amberDeep : COLORS.redDeep }]}>{banner.title}</Text>
          {!!banner.msg && <Text style={[styles.bannerMsg, RTL.text]}>{banner.msg}</Text>}
        </View>
        {net && (
          <Press onPress={onRetry} style={styles.retry} accessibilityLabel="إعادة المحاولة">
            <Ionicons name="refresh" size={15} color="#FFF" />
            <Text style={styles.retryTxt}>إعادة</Text>
          </Press>
        )}
      </View>
    </FadeIn>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [stage, setStage] = useState('');
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [forgot, setForgot] = useState(false);
  const passRef = useRef(null);
  const scrollRef = useRef(null);
  const busy = useRef(false);           // حارس ضد الإرسال المزدوج (أسرع من state)
  const layout = useRef({ wrapY: 0, cardY: 0, btnBottom: 0, svH: 0, kbH: 0, scrollY: 0 });
  const { login } = useAuth();

  const normalizePhone = (p) => p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s|-/g, '');

  // إبقاء زر الدخول ظاهراً فوق الكيبورد دائماً
  const ensureButtonVisible = useCallback(() => {
    const L = layout.current;
    if (!L.kbH || !scrollRef.current) return;
    const visible = Math.min(L.svH || Dimensions.get('window').height, Dimensions.get('window').height - L.kbH);
    const target = L.wrapY + L.cardY + L.btnBottom + 16 - visible;
    if (target > L.scrollY) scrollRef.current.scrollTo({ y: target, animated: true });
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      layout.current.kbH = e?.endCoordinates?.height || 0;
      setTimeout(ensureButtonVisible, 60);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { layout.current.kbH = 0; });
    return () => { show.remove(); hide.remove(); };
  }, [ensureButtonVisible]);

  const phoneDigits = digitsOf(phone);
  const phoneValid = /^05\d{8}$/.test(phoneDigits) || (phone.startsWith('+') && phoneDigits.length >= 11);

  const handleLogin = async () => {
    if (busy.current || loading || done) return;
    const errs = {};
    if (!phone.trim()) errs.phone = 'أدخل رقم الهاتف';
    else if (phoneDigits.length < 9) errs.phone = 'رقم الهاتف غير مكتمل';
    if (!password) errs.password = 'أدخل كلمة المرور';
    setErrors(errs);
    if (Object.keys(errs).length) {
      haptic.warn();
      if (!errs.phone && errs.password) passRef.current?.focus();
      return;
    }
    busy.current = true;
    Keyboard.dismiss();
    setBanner(null);
    setLoading(true);
    setStage('جاري الدخول...');
    try {
      const res = await api.post('/auth/login-password', { phone: normalizePhone(phone), password });
      if (!res?.token || !res?.user) throw { message: 'استجابة غير متوقعة من السيرفر' };
      if (res.user.role !== 'driver') {
        haptic.warn();
        setBanner({ type: 'error', title: 'هذا الحساب ليس حساب مندوب', msg: 'استخدم تطبيق وصلّي المناسب لهذا الحساب، أو تواصل مع الإدارة.' });
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
      // لحظة نجاح قصيرة (زر أخضر + علامة صح) قبل الانتقال
      setLoading(false);
      setDone(true);
      if (!isReducedMotion()) await wait(550);
      await login(res.token, res.user);
    } catch (e) {
      await clearToken();
      haptic.warn();
      setDone(false);
      const NET = ['تعذّر الاتصال بالإنترنت', 'انتهت مهلة الاتصال'];
      if (!e?.status && NET.includes(e?.message)) {
        // شبكة / مهلة — المدخلات تبقى كما هي، وزر إعادة المحاولة
        setBanner({ type: 'network', title: e?.message || 'تعذّر الاتصال بالإنترنت', msg: 'تأكد من اتصالك ثم أعد المحاولة.' });
      } else {
        setBanner({ type: 'error', title: 'تعذّر الدخول', msg: e?.message || 'رقم الهاتف أو كلمة المرور غير صحيحة' });
      }
    } finally {
      busy.current = false;
      setLoading(false);
      setStage('');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={KAV_BEHAVIOR}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        onLayout={(e) => { layout.current.svH = e.nativeEvent.layout.height; }}
        onScroll={(e) => { layout.current.scrollY = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}>
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
            <Text style={styles.title} accessibilityRole="header">وصلّي</Text>
            <View style={styles.tagPill}>
              <View style={styles.tagDot} />
              <Text style={styles.subtitle}>تطبيق كباتن التوصيل</Text>
            </View>
          </FadeIn>
        </LinearGradient>

        <View onLayout={(e) => { layout.current.wrapY = e.nativeEvent.layout.y; }}>
        <FadeIn delay={200} from={24}>
          <View style={styles.card} onLayout={(e) => { layout.current.cardY = e.nativeEvent.layout.y; }}>
            <Text style={[styles.cardTitle, RTL.text]}>أهلاً بعودتك 👋</Text>
            <Text style={[styles.cardSub, RTL.text]}>سجّل دخولك لبدء استقبال الطلبات</Text>

            <Banner banner={banner} onRetry={handleLogin} />

            <FloatingField
              icon="call-outline" label="رقم الهاتف" placeholder="05X XXX XXXX"
              value={phone} error={errors.phone} valid={phoneValid}
              onChangeText={(t) => {
                setPhone(formatPhone(t));
                if (errors.phone) setErrors(e => ({ ...e, phone: null }));
                if (banner) setBanner(null);
              }}
              keyboardType="phone-pad" autoComplete="tel" textContentType="username" importantForAutofill="yes"
              autoCorrect={false} maxLength={16}
              returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => passRef.current?.focus()}
              onFocus={() => setTimeout(ensureButtonVisible, 60)}
              editable={!loading && !done} style={{ marginBottom: 14 }} />

            <FloatingField
              ref={passRef} secure icon="lock-closed-outline" label="كلمة المرور"
              value={password} error={errors.password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) setErrors(e => ({ ...e, password: null }));
                if (banner) setBanner(null);
              }}
              autoComplete="password" textContentType="password" importantForAutofill="yes" autoCapitalize="none" autoCorrect={false}
              returnKeyType="go" onSubmitEditing={handleLogin}
              onFocus={() => setTimeout(ensureButtonVisible, 60)}
              editable={!loading && !done} />

            <Pressable onPress={() => { haptic.light(); Keyboard.dismiss(); setForgot(true); }} hitSlop={10} style={styles.forgot}
              accessibilityRole="button" accessibilityLabel="نسيت كلمة السر؟ تواصل مع الإدارة">
              {({ pressed }) => <Text style={[styles.forgotTxt, pressed && { opacity: 0.55 }]}>نسيت كلمة السر؟</Text>}
            </Pressable>

            <View onLayout={(e) => { const l = e.nativeEvent.layout; layout.current.btnBottom = l.y + l.height; }}>
              <GradientButton
                label={done ? 'تم الدخول' : 'دخول'} icon={done ? 'checkmark-circle' : 'arrow-back'}
                colors={done ? GRADIENTS.green : GRADIENTS.sunset} shadow={done ? SHADOW.green : SHADOW.float}
                onPress={handleLogin} loading={loading} loadingLabel={stage} />
            </View>

            <View style={[RTL.row, styles.noteRow]}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.gray} />
              <Text style={styles.note}>يتم إنشاء حسابات المندوبين عبر لوحة الإدارة</Text>
            </View>
          </View>
        </FadeIn>
        </View>

        <FadeIn delay={320}>
          <View style={[RTL.row, styles.trust]}>
            {[{ i: 'shield-checkmark-outline', t: 'دخول آمن' }, { i: 'flash-outline', t: 'طلبات فورية' }, { i: 'wallet-outline', t: 'أرباح يومية' }].map(x => (
              <View key={x.t} style={styles.trustItem}>
                <View style={styles.trustIcon}><Ionicons name={x.i} size={18} color={COLORS.primary} /></View>
                <Text style={styles.trustText}>{x.t}</Text>
              </View>
            ))}
          </View>
        </FadeIn>
      </ScrollView>
      <ForgotSheet visible={forgot} onClose={() => setForgot(false)} insets={insets} />
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
  cardTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 13.5, color: COLORS.gray, marginTop: 4, marginBottom: 20, fontWeight: '500' },
  forgot: { alignSelf: 'flex-start', paddingVertical: 12, marginBottom: 6, minHeight: 44, justifyContent: 'center' },
  forgotTxt: { color: COLORS.primary, fontSize: 13.5, fontWeight: '800' },
  banner: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: RADIUS.sm, borderWidth: 1, padding: 12, marginBottom: 14 },
  bannerErr: { backgroundColor: COLORS.redSoft, borderColor: '#FBCFCB' },
  bannerNet: { backgroundColor: COLORS.amberSoft, borderColor: '#FBE3A6' },
  bannerTitle: { fontSize: 13.5, fontWeight: '800' },
  bannerMsg: { fontSize: 12.5, color: COLORS.sub, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  retry: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: COLORS.amberDeep, borderRadius: RADIUS.pill, paddingHorizontal: 12, height: 36 },
  retryTxt: { color: '#FFF', fontWeight: '800', fontSize: 12.5 },
  noteRow: { justifyContent: 'center', gap: 6, marginTop: 20 },
  note: { textAlign: 'center', color: COLORS.gray, fontSize: 12.5, fontWeight: '500' },
  trust: { justifyContent: 'center', gap: 10, marginTop: 20, marginHorizontal: 20 },
  trustItem: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: RADIUS.md, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.line },
  trustIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.brandSoft, alignItems: 'center', justifyContent: 'center' },
  trustText: { fontSize: 12, fontWeight: '700', color: COLORS.sub },
  backdrop: { backgroundColor: 'rgba(20,20,43,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingHorizontal: 20, paddingTop: 10, ...SHADOW.dark },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: COLORS.line, marginBottom: 18 },
  sheetIcon: { alignSelf: 'center', width: 60, height: 60, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...SHADOW.float },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  sheetText: { fontSize: 13.5, color: COLORS.gray, textAlign: 'center', fontWeight: '500', lineHeight: 21, marginTop: 6, marginBottom: 18, paddingHorizontal: 8 },
  sheetBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, borderRadius: RADIUS.md, borderWidth: 1, padding: 12, marginBottom: 10, minHeight: 64 },
  sheetBtnIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetBtnTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  sheetBtnSub: { fontSize: 12.5, color: COLORS.gray, fontWeight: '600', marginTop: 2 },
  sheetCancel: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 24, marginTop: 2, minHeight: 44 },
  sheetCancelTxt: { color: COLORS.sub, fontWeight: '700', fontSize: 14 },
});
