import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Keyboard, BackHandler,
  Platform, Animated, Easing, Dimensions, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PopIn, FadeIn, GradientButton, Press, Pulse } from '../components/Anim';
import FloatingField from '../components/FloatingField';
import { HeroDecor } from '../components/GradientHeader';
import { Chip, BottomSheet, Burst } from '../components/UI';
import api from '../utils/api';
import { SUPPORT_PHONE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPRING, EASE_OUT, haptic, useReducedMotion } from '../utils/motion';
import { canonicalPhone, isMobilePhone, toLatinDigits, ltr } from '../utils/format';
import { isNetworkError } from '../utils/api';
import { KB_TOOLBAR_H } from '../config';

/*
  شاشة الدخول / إنشاء الحساب — Luxe
  - الدخول: رقم + كلمة سر (خطوة واحدة)
  - التسجيل: 3 خطوات قصيرة (الاسم → الرقم والمدينة → كلمة السر) مع تحقّق كامل قبل أي إرسال
  - حماية من الإرسال المزدوج (قفل ref + زر معطّل أثناء الإرسال)
  - "الرقم مسجّل مسبقاً" بعد محاولة انقطعت؟ نجرّب الدخول بنفس البيانات تلقائياً (الحساب غالباً أُنشئ)
  - أخطاء الشبكة: رسالة ودودة + زر إعادة المحاولة، والبيانات تبقى كما هي
  الربط مع السيرفر كما هو: POST /auth/login-password {phone,password} و POST /auth/register {name,phone,password,city,referred_by}
*/

const AUTH_TIMEOUT = 30000; // مهلة أطول للشبكات الضعيفة — يمنع "فشل" وهمي بعد نجاح فعلي
const { width: SW } = Dimensions.get('window');
const PRIVACY_URL = 'https://ahma2025.github.io/wasaly/privacy.html';
const LAST_PHONE_KEY = 'last_login_phone';
const CITIES = ['رام الله', 'نابلس', 'الخليل', 'جنين', 'طولكرم', 'بيت لحم', 'قلقيلية', 'أريحا'];
const SUPPORT_INTL = SUPPORT_PHONE.startsWith('0') ? '970' + SUPPORT_PHONE.slice(1) : SUPPORT_PHONE;
const FIELD_STEP = { name: 0, phone: 1, city: 1, password: 2, referral: 2 };
const STEPS = [
  { title: 'شو اسمك؟ 👋', sub: 'عشان يعرفك المطعم والسائق' },
  { title: 'وين نوصّلك؟ 📍', sub: 'رقمك للتواصل وقت التوصيل' },
  { title: 'آخر خطوة 🔒', sub: 'اختر كلمة سر سهلة عليك وصعبة على غيرك' },
];

// ── أرقام ─────────────────────────────────────────────
// أرقام عربية-هندية (٠-٩) وفارسية (۰-۹) → لاتينية، ثم إزالة أي رمز غير رقمي (نفس تطبيع السيرفر)
const normalizePhone = (p) => toLatinDigits(p).replace(/\D/g, '');

/*
  تنسيق حيّ بشكل موحّد: 00970/+970/972… تتحوّل لـ 05X مباشرة (قبل القص، فما بينقص رقم)
  → «059 903 9704». أرقام أجنبية/قديمة طويلة تضل كما هي
*/
function formatPhone(raw) {
  const d = canonicalPhone(raw, { partial: true }).slice(0, 15);
  if (d.startsWith('0')) {
    const x = d.slice(0, 10);
    return [x.slice(0, 3), x.slice(3, 6), x.slice(6)].filter(Boolean).join(' ');
  }
  return d;
}

// strict = للتسجيل (رقم جوال 05XXXXXXXX فقط). الدخول يقبل أي رقم ≥ 9 مثل السيرفر (حسابات قديمة)
function phoneError(np, strict) {
  if (!np) return 'أدخل رقم جوالك';
  if (strict && !isMobilePhone(np)) return np.length < 10 ? 'رقم الجوال 10 أرقام — مثل 059 123 4567' : 'رقم الجوال لازم يبدأ بـ 05 — مثل 059 123 4567';
  if (np.length < 9) return 'رقم الجوال غير مكتمل';
  return null;
}

// قوة كلمة السر: 0 فارغة · 1 قصيرة · 2 مقبولة · 3 جيدة · 4 قوية
function pwStrength(pw) {
  if (!pw) return 0;
  if (pw.length < 6) return 1;
  const mixed = /\d/.test(pw) && /\D/.test(pw);
  const symbol = /[^A-Za-z0-9؀-ۿ]/.test(pw);
  let s = 2;
  if (pw.length >= 8 && mixed) s++;
  if ((pw.length >= 10 && mixed) || (symbol && pw.length >= 8)) s++;
  return Math.min(s, 4);
}
const STRENGTH_LABEL = ['', 'قصيرة — 6 أحرف على الأقل', 'مقبولة', 'جيدة', 'قوية جداً 💪'];

const isPhoneExists = (err) => err?.code === 'PHONE_EXISTS' || (err?.status === 409) || String(err?.message || '').includes('مسجل');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// أيقونات طافية خلف الشعار (زينة حركية خفيفة)
const FLOATERS = [
  { icon: 'pizza', x: 0.1, y: 0.3, size: 22, d: 0 },
  { icon: 'cafe', x: 0.82, y: 0.22, size: 20, d: 400 },
  { icon: 'fast-food', x: 0.86, y: 0.6, size: 24, d: 800 },
  { icon: 'ice-cream', x: 0.08, y: 0.66, size: 20, d: 1200 },
  { icon: 'restaurant', x: 0.26, y: 0.12, size: 16, d: 600 },
  { icon: 'basket', x: 0.68, y: 0.8, size: 17, d: 1000 },
];

function Floater({ icon, x, y, size, d, reduce }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(0); return; }
    const l = Animated.loop(Animated.sequence([
      Animated.delay(d),
      Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    l.start();
    return () => l.stop();
  }, [reduce]);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });
  return (
    <Animated.View pointerEvents="none" style={[styles0.floater, { left: SW * x, top: `${y * 100}%`, transform: [{ translateY: ty }, { rotate: rot }] }]}>
      <Ionicons name={icon} size={size} color="rgba(255,255,255,0.5)" />
    </Animated.View>
  );
}

/* مؤشر قوة كلمة السر — 4 أشرطة تتلوّن بنعومة */
function StrengthMeter({ level, C }) {
  const v = useRef(new Animated.Value(level)).current;
  const reduce = useReducedMotion();
  useEffect(() => {
    Animated.timing(v, { toValue: level, duration: reduce ? 0 : 260, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [level]);
  const col = [C.border, C.red, C.warning, C.info, C.green][level];
  if (!level) return null;
  return (
    <View style={styles0.meterWrap} accessible accessibilityLabel={`قوة كلمة السر: ${STRENGTH_LABEL[level]}`}>
      <View style={styles0.meterRow}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[styles0.meterBar, { backgroundColor: C.border }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: col, borderRadius: 3, opacity: v.interpolate({ inputRange: [i, i + 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]} />
          </View>
        ))}
      </View>
      <Text style={[styles0.meterTxt, { color: level === 1 ? C.red : C.faint }]}>
        كلمة السر: <Text style={{ color: col, fontWeight: '800' }}>{STRENGTH_LABEL[level]}</Text>
      </Text>
    </View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors: C } = useTheme();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();

  const [tab, setTab] = useState('login');
  const [step, setStep] = useState(0);            // خطوة التسجيل 0..2
  const [phone, setPhone] = useState('');         // منسّق للعرض — يُطبَّع قبل الإرسال
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showReferral, setShowReferral] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});       // {field: msg}
  const [nudge, setNudge] = useState(0);          // يعيد هزّ الحقول الخاطئة عند كل محاولة
  const [banner, setBanner] = useState(null);     // {type:'error'|'info'|'success', msg, actions?}
  const [forgotOpen, setForgotOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);

  const busy = useRef(false);                     // قفل متزامن ضد الضغط المزدوج
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // refs للحقول (تسلسل زر "التالي")
  const refs = { name: useRef(null), phone: useRef(null), city: useRef(null), password: useRef(null), referral: useRef(null) };
  const focusField = (k, delay = 0) => setTimeout(() => { refs[k]?.current?.focus?.(); }, delay);

  // آخر رقم دخل فيه على هذا الجهاز → تعبئة تلقائية
  useEffect(() => {
    AsyncStorage.getItem(LAST_PHONE_KEY).then(v => { if (v && mounted.current) setPhone(p => p || formatPhone(v)); }).catch(() => {});
  }, []);

  // ── تمرير ذكي مع الكيبورد: لا يختفي الحقل النشط ولا زر المتابعة ──
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const viewportH = useRef(0);
  const L = useRef({ card: 0, form: 0, f: {} }).current;
  const focusedKey = useRef(null);
  const kbRef = useRef(false);
  const ensureVisible = useCallback(() => {
    const vh = viewportH.current;
    if (!vh || !kbRef.current || !scrollRef.current) return;
    const base = L.card + L.form;
    const btn = L.f.submit;
    const f = focusedKey.current && L.f[focusedKey.current];
    // (iOS: KeyboardAvoidingView بيحجز كمان مساحة شريط "تم" — keyboardVerticalOffset)
    const pad = 18;
    let target = btn ? base + btn.y + btn.h - vh + pad : 0;
    if (f) {
      target = Math.max(target, base + f.y + f.h - vh + pad); // أسفل الحقل ظاهر
      target = Math.min(target, base + f.y - 14);            // وأعلاه ما ينقص فوق الشاشة
    }
    target = Math.max(0, target);
    const s = scrollRef.current.scrollTo ? scrollRef.current : scrollRef.current.getNode?.();
    s && s.scrollTo({ y: target, animated: !reduce });
  }, [reduce]);
  useEffect(() => {
    const showEv = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEv = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEv, () => { kbRef.current = true; setKbOpen(true); setTimeout(ensureVisible, Platform.OS === 'ios' ? 260 : 80); });
    const b = Keyboard.addListener(hideEv, () => { kbRef.current = false; setKbOpen(false); });
    return () => { a.remove(); b.remove(); };
  }, [ensureVisible]);
  const lay = (k) => (e) => { const { y, height } = e.nativeEvent.layout; L.f[k] = { y, h: height }; };
  const onFieldFocus = (k) => () => { focusedKey.current = k; if (kbRef.current) setTimeout(ensureVisible, 60); };



  // ── انتقال النموذج (تبويب/خطوة): انزلاق باتجاه الحركة ──
  const formV = useRef(new Animated.Value(1)).current;
  const dir = useRef(1);
  React.useLayoutEffect(() => {
    if (reduce) { formV.setValue(1); return; }
    formV.setValue(0);
    Animated.timing(formV, { toValue: 1, duration: 300, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [tab, step]);
  const formX = formV.interpolate({ inputRange: [0, 1], outputRange: [dir.current * -28, 0] });

  // شريط تقدّم التسجيل
  const progV = useRef(new Animated.Value(1 / 3)).current;
  useEffect(() => {
    Animated.timing(progV, { toValue: (step + 1) / 3, duration: reduce ? 0 : 360, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [step]);

  const isReg = tab === 'register';
  // رقم موحّد للإرسال (00970 / +972 / 5XXXXXXXX → 05XXXXXXXX) — نفس الشخص = نفس الحساب
  const np = canonicalPhone(phone);
  const rawNp = normalizePhone(phone);
  const strength = pwStrength(password);

  const switchTab = (t) => {
    if (t === tab || busy.current) return;
    haptic.select();
    dir.current = t === 'register' ? 1 : -1;
    setTab(t); setErrors({}); setBanner(null);
  };

  const setStepTo = (s, focusKey) => {
    dir.current = s > step ? 1 : -1;
    setStep(s);
    if (focusKey) focusField(focusKey, reduce ? 30 : 140);
  };

  // زر الرجوع بأندرويد يرجع خطوة بالتسجيل بدل ما يطلع من التطبيق
  useEffect(() => {
    if (!isReg || step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy.current) setStepTo(step - 1); return true; });
    return () => sub.remove();
  }, [isReg, step]);

  // ── التحقّق ──
  const stepErrors = (s) => {
    const e = {};
    if (s === 0) {
      if (!name.trim()) e.name = 'أدخل اسمك';
      else if (name.trim().length < 2) e.name = 'الاسم قصير جداً';
    }
    if (s === 1) {
      const pe = phoneError(np, true); if (pe) e.phone = pe;
      if (!city.trim()) e.city = 'اختر مدينتك أو اكتبها';
    }
    if (s === 2) {
      if (!password) e.password = 'اختر كلمة سر';
      else if (password.length < 6) e.password = 'كلمة السر 6 أحرف على الأقل';
    }
    return e;
  };
  const loginErrors = () => {
    const e = {};
    const pe = phoneError(np, false); if (pe) e.phone = pe;
    if (!password) e.password = 'أدخل كلمة السر';
    else if (password.length < 6) e.password = 'كلمة السر 6 أحرف على الأقل';
    return e;
  };
  const failValidation = (e) => {
    setErrors(e); setNudge(n => n + 1); haptic.warning();
  };

  const goNext = () => {
    if (busy.current) return;
    const e = stepErrors(step);
    if (Object.keys(e).length) { failValidation(e); focusField(Object.keys(e)[0]); return; }
    haptic.light();
    setErrors({});
    setStepTo(step + 1, step === 0 ? 'phone' : 'password');
  };

  // ── الإرسال ──
  const finishAuth = async (res, recovered) => {
    if (!res?.token) throw { message: 'حدث خطأ، حاول مرة أخرى', status: 500 };
    AsyncStorage.setItem(LAST_PHONE_KEY, np).catch(() => {});
    if (!mounted.current) return;
    Keyboard.dismiss();
    setSuccess(true);
    if (recovered) setBanner({ type: 'success', msg: 'رقمك مسجّل عندنا من قبل — دخّلناك على حسابك ✨' });
    await wait(reduce ? 200 : (recovered ? 1300 : 750));
    await login(res.token, res.user);
  };

  const submit = async () => {
    if (busy.current) return;            // ضغطة ثانية أثناء الطلب = تجاهل
    setBanner(null);
    // تحقّق كامل قبل أي اتصال — ولا نرسل حساب ناقص أبداً
    if (isReg) {
      for (let s = 0; s < 3; s++) {
        const e = stepErrors(s);
        if (Object.keys(e).length) {
          failValidation(e);
          if (s !== step) setStepTo(s, Object.keys(e)[0]); else focusField(Object.keys(e)[0]);
          return;
        }
      }
    } else {
      const e = loginErrors();
      if (Object.keys(e).length) { failValidation(e); focusField(Object.keys(e)[0]); return; }
    }

    busy.current = true;
    setLoading(true);
    setErrors({});
    let ok = false;
    try {
      let res; let recovered = false;
      if (!isReg) {
        try {
          res = await api.post('/auth/login-password', { phone: np, password }, { timeout: AUTH_TIMEOUT });
        } catch (err) {
          // حسابات قديمة انسجّلت بصيغة ثانية (970… أو 5…) والسيرفر لسا ما بيوحّد — نجرّب الرقم كما كُتب مرة وحدة
          if (err?.status !== 401 || rawNp === np || rawNp.length < 9) throw err;
          res = await api.post('/auth/login-password', { phone: rawNp, password }, { timeout: AUTH_TIMEOUT });
        }
      } else {
        try {
          res = await api.post('/auth/register',
            { name: name.trim(), phone: np, password, city: city.trim(), referred_by: referralCode.trim() || undefined },
            { timeout: AUTH_TIMEOUT });
        } catch (err) {
          if (!isPhoneExists(err)) throw err;
          // الرقم مسجّل — غالباً محاولة سابقة نجحت بالسيرفر وانقطع الرد. نجرب الدخول بنفس البيانات
          try {
            res = await api.post('/auth/login-password', { phone: np, password }, { timeout: AUTH_TIMEOUT });
            recovered = true;
          } catch { throw err; }
        }
      }
      ok = true;
      await finishAuth(res, recovered);
    } catch (err) {
      ok = false;
      if (mounted.current) { haptic.error(); handleError(err); }
    } finally {
      busy.current = false;
      if (mounted.current && !ok) { setLoading(false); setSuccess(false); }
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const retry = { label: 'إعادة المحاولة', icon: 'refresh', run: () => submitRef.current() };
  const forgotAction = { label: 'نسيت كلمة السر؟', icon: 'help-circle-outline', run: () => setForgotOpen(true) };

  const handleError = (err) => {
    if (err?.canceled) return;
    const msg = err?.message || '';
    const st = err?.status;

    // رقم مسجّل وكلمة السر مختلفة → وجّهه للدخول بنفس الرقم
    if (isReg && isPhoneExists(err)) {
      setBanner({
        type: 'info',
        msg: 'هذا الرقم عنده حساب بوصلّي من قبل. سجّل الدخول بكلمة السر الخاصة فيه.',
        actions: [
          { label: 'الدخول بهذا الرقم', icon: 'log-in-outline', run: () => { dir.current = -1; setTab('login'); setErrors({}); setBanner(null); setPassword(''); focusField('password', 300); } },
          forgotAction,
        ],
      });
      return;
    }
    // حقل محدّد من السيرفر → نعرضه تحت الحقل ونرجع لخطوته
    if (err?.field && FIELD_STEP[err.field] != null) {
      const f = err.field === 'referral' && !isReg ? null : err.field;
      if (f) {
        setErrors({ [f]: msg }); setNudge(n => n + 1);
        if (isReg && FIELD_STEP[f] !== step) setStepTo(FIELD_STEP[f], f);
        if (f === 'referral') setShowReferral(true);
        return;
      }
    }
    // شبكة / مهلة — بدون رد من السيرفر
    if (!st || isNetworkError(err) || String(msg).toLowerCase().includes('timeout')) {
      setBanner({ type: 'error', icon: 'cloud-offline-outline', msg: 'تعذّر الاتصال — تأكد من الإنترنت. بياناتك محفوظة، جرّب مرة ثانية.', actions: [retry] });
      return;
    }
    if (st === 401) {
      // نص موحّد (رقم الجوال / كلمة السر) بدل خليط رسائل السيرفر
      setBanner({ type: 'error', msg: 'رقم الجوال أو كلمة السر غير صحيحة', actions: [forgotAction] });
      return;
    }
    if (st === 429) { setBanner({ type: 'error', icon: 'time-outline', msg }); return; }
    if (st === 403) {
      setBanner({ type: 'error', icon: 'lock-closed-outline', msg: msg || 'الحساب موقوف', actions: [{ label: 'تواصل مع الدعم', icon: 'logo-whatsapp', run: openWhatsApp }] });
      return;
    }
    if (st >= 500) {
      setBanner({ type: 'error', msg: 'الخادم مشغول لحظياً. بياناتك محفوظة — جرّب بعد ثوانٍ.', actions: [retry] });
      return;
    }
    setBanner({ type: 'error', msg: msg || 'حدث خطأ، حاول مجدداً.', actions: [retry] });
  };

  // ── تعديل الحقول (يمسح خطأ الحقل فور التعديل) ──
  const clear = (k) => setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));
  const onPhone = (t) => { setPhone(formatPhone(t)); clear('phone'); };
  const onName = (t) => { setName(t); clear('name'); };
  const onCity = (t) => { setCity(t); clear('city'); };
  const onPassword = (t) => { setPassword(t); clear('password'); };
  const onReferral = (t) => { setReferralCode(toLatinDigits(t).toUpperCase()); clear('referral'); };

  const openWhatsApp = () => {
    const text = encodeURIComponent('مرحباً وصلّي، بحتاج مساعدة بالدخول لحسابي (نسيت كلمة السر).');
    Linking.openURL(`https://wa.me/${SUPPORT_INTL}?text=${text}`).catch(() => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}));
  };
  const openPrivacy = () => Linking.openURL(PRIVACY_URL).catch(() => {});

  // ── بارالاكس الهيرو ──
  const heroY = scrollY.interpolate({ inputRange: [-120, 0, 260], outputRange: [-30, 0, 110], extrapolate: 'clamp' });
  const heroO = scrollY.interpolate({ inputRange: [0, 200], outputRange: [1, 0.15], extrapolate: 'clamp' });
  const heroS = scrollY.interpolate({ inputRange: [-120, 0], outputRange: [1.12, 1], extrapolate: 'clamp' });
  const floatY = scrollY.interpolate({ inputRange: [-120, 0, 260], outputRange: [-50, 0, 170], extrapolate: 'clamp' });

  const head = isReg ? STEPS[step] : { title: 'أهلاً فيك من جديد 👋', sub: 'سجّل دخولك وكمّل من وين ما وقفت' };
  const bannerTone = banner?.type === 'info' ? { bg: C.sec, bd: C.tintBorder, fg: C.text, ic: C.primary, icon: 'information-circle' }
    : banner?.type === 'success' ? { bg: C.successBg, bd: C.successBorder, fg: C.successText, ic: C.green, icon: 'checkmark-circle' }
    : { bg: C.dangerBg, bd: C.dangerBorder, fg: C.red, ic: C.red, icon: 'alert-circle' };

  // ── أجزاء النموذج ──
  const phoneField = (strict, nextKey, onDone) => (
    <View onLayout={lay('phone')}>
      <FloatingField ref={refs.phone} icon="call-outline" label="رقم الجوال" value={phone} onChangeText={onPhone}
        keyboardType="phone-pad" maxLength={17} autoComplete="tel" textContentType="telephoneNumber" importantForAutofill="yes"
        error={errors.phone} nudge={nudge} valid={!phoneError(np, strict)} onFocus={onFieldFocus('phone')}
        hint={strict ? `الصيغة: ${ltr('05X XXX XXXX')}` : undefined} placeholder="059 123 4567"
        returnKeyType="next" blurOnSubmit={false}
        onSubmitEditing={() => (nextKey ? focusField(nextKey) : onDone && onDone())}
        inputStyle={{ writingDirection: 'ltr' }} />
    </View>
  );

  const renderLogin = () => (
    <>
      {phoneField(false, 'password')}
      <View onLayout={lay('password')}>
        <FloatingField ref={refs.password} icon="lock-closed-outline" label="كلمة السر" value={password} onChangeText={onPassword} secure
          error={errors.password} nudge={nudge} onFocus={onFieldFocus('password')}
          autoComplete="password" textContentType="password" autoCapitalize="none" autoCorrect={false}
          returnKeyType="go" onSubmitEditing={() => submitRef.current()} />
      </View>
      <TouchableOpacity onPress={() => { haptic.light(); setForgotOpen(true); }} style={styles.forgot} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button" accessibilityLabel="نسيت كلمة السر؟">
        <Text style={styles.forgotTxt}>نسيت كلمة السر؟</Text>
      </TouchableOpacity>
    </>
  );

  const renderStep = () => {
    if (step === 0) return (
      <View onLayout={lay('name')}>
        <FloatingField ref={refs.name} icon="person-outline" label="الاسم الكامل" value={name} onChangeText={onName}
          error={errors.name} nudge={nudge} valid={name.trim().length > 1} onFocus={onFieldFocus('name')}
          autoComplete="name" textContentType="name" autoCapitalize="words" maxLength={60}
          hint="مثال: أحمد محمد" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={goNext} />
      </View>
    );
    if (step === 1) return (
      <>
        {phoneField(true, 'city')}
        <View onLayout={lay('city')}>
          <FloatingField ref={refs.city} icon="location-outline" label="المدينة" value={city} onChangeText={onCity}
            error={errors.city} nudge={nudge} valid={city.trim().length > 1} onFocus={onFieldFocus('city')}
            autoComplete="postal-address-locality" textContentType="addressCity" maxLength={40}
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={goNext} />
          <View style={styles.chips} accessibilityLabel="مدن مقترحة">
            {CITIES.map(c => (
              <Chip key={c} label={c} size="sm" selected={city.trim() === c}
                onPress={() => { onCity(c); }} accessibilityLabel={`اختيار مدينة ${c}`} />
            ))}
          </View>
        </View>
      </>
    );
    return (
      <>
        <Press onPress={() => setStepTo(0, 'name')} scaleTo={0.98} accessibilityRole="button" accessibilityLabel="تعديل الاسم والرقم والمدينة"
          style={styles.summary}>
          <View style={[styles.summaryIcon, { backgroundColor: C.tint }]}><Ionicons name="person" size={15} color={C.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryName} numberOfLines={1}>{name.trim()}</Text>
            <Text style={styles.summarySub} numberOfLines={1}>{ltr(phone)} · {city.trim()}</Text>
          </View>
          <Text style={styles.summaryEdit}>تعديل</Text>
        </Press>
        <View onLayout={lay('password')}>
          <FloatingField ref={refs.password} icon="lock-closed-outline" label="كلمة السر" value={password} onChangeText={onPassword} secure
            error={errors.password} nudge={nudge} onFocus={onFieldFocus('password')}
            autoComplete="password-new" textContentType="newPassword" autoCapitalize="none" autoCorrect={false}
            returnKeyType={showReferral ? 'next' : 'done'} blurOnSubmit={!showReferral}
            onSubmitEditing={() => (showReferral ? focusField('referral') : submitRef.current())} />
          {!errors.password && <StrengthMeter level={strength} C={C} />}
        </View>
        {!showReferral ? (
          <TouchableOpacity onPress={() => { haptic.select(); setShowReferral(true); focusField('referral', 120); }} style={styles.refToggle}
            accessibilityRole="button" accessibilityLabel="عندك كود دعوة؟ أضفه واربح 10 شيكل">
            <Ionicons name="gift-outline" size={17} color={C.primary} />
            <Text style={styles.refToggleTxt}>عندك كود دعوة؟ <Text style={{ color: C.faint, fontWeight: '500' }}>— 10₪ هدية</Text></Text>
          </TouchableOpacity>
        ) : (
          <View onLayout={lay('referral')}>
            <FadeIn from={-6} duration={240}>
              <FloatingField ref={refs.referral} icon="gift-outline" label="كود الدعوة (اختياري)" value={referralCode} onChangeText={onReferral}
                autoCapitalize="characters" autoCorrect={false} maxLength={16} error={errors.referral} onFocus={onFieldFocus('referral')}
                hint="تنضاف 10₪ لمحفظتك بعد أول طلب يوصلك" returnKeyType="done" onSubmitEditing={() => submitRef.current()} />
            </FadeIn>
          </View>
        )}
      </>
    );
  };

  const primaryTitle = !isReg ? 'دخول' : step < 2 ? 'التالي' : 'إنشاء الحساب';
  const primaryIcon = !isReg ? 'log-in-outline' : step < 2 ? 'arrow-back' : 'sparkles';
  const onPrimary = !isReg || step === 2 ? submit : goNext;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? KB_TOOLBAR_H : 0}>
      <Animated.ScrollView ref={scrollRef} contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false} scrollEventThrottle={16}
        onLayout={(e) => { viewportH.current = e.nativeEvent.layout.height; if (kbRef.current) setTimeout(ensureVisible, 30); }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>

        {/* ── الهيرو ── */}
        <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 40 }]}>
          <HeroDecor />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ translateY: floatY }] }]}>
            {FLOATERS.map((f, i) => <Floater key={i} {...f} reduce={reduce} />)}
          </Animated.View>
          <Animated.View style={{ alignItems: 'center', opacity: heroO, transform: [{ translateY: heroY }, { scale: heroS }] }}>
            <PopIn>
              <Pulse to={reduce ? 1 : 1.035} duration={1600}>
                <View style={styles.logo} accessible accessibilityRole="image" accessibilityLabel="شعار وصلّي">
                  <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0.06)']} style={StyleSheet.absoluteFill} />
                  <Ionicons name="bicycle" size={48} color="#FFF" />
                </View>
              </Pulse>
            </PopIn>
            <FadeIn delay={120}><Text style={styles.appName} accessibilityRole="header">وصلّي</Text></FadeIn>
            <FadeIn delay={200}><Text style={styles.tagline}>أشهى المطاعم والمتاجر… لباب بيتك</Text></FadeIn>
          </Animated.View>
        </LinearGradient>

        {/* ── البطاقة ── */}
        <View onLayout={(e) => { L.card = e.nativeEvent.layout.y; }}>
          <FadeIn delay={160} from={30} style={styles.card}>
            <View style={styles.headRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.welcome} accessibilityRole="header">{head.title}</Text>
                <Text style={styles.welcomeSub}>{head.sub}</Text>
              </View>
              {isReg && (
                <View style={styles.stepPill} accessibilityLabel={`الخطوة ${step + 1} من 3`}>
                  <Text style={styles.stepPillTxt}>{step + 1}/3</Text>
                </View>
              )}
            </View>

            <View style={styles.tabs} accessibilityRole="tablist">
              {[['login', 'تسجيل الدخول'], ['register', 'حساب جديد']].map(([k, l]) => (
                <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => switchTab(k)} activeOpacity={0.85} disabled={loading}
                  accessibilityRole="tab" accessibilityState={{ selected: tab === k, disabled: loading }} accessibilityLabel={l}>
                  {tab === k && <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />}
                  <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {isReg && (
              <View style={[styles.progTrack, { backgroundColor: C.inputBg }]} accessibilityRole="progressbar"
                accessibilityValue={{ min: 1, max: 3, now: step + 1 }}>
                <Animated.View style={[styles.progFill, { width: progV.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
                  <LinearGradient colors={C.gradients.sunset} start={{ x: 1, y: 0 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
                </Animated.View>
              </View>
            )}

            {banner && (
              <PopIn from={0.95} key={banner.msg}>
                <View style={[styles.banner, { backgroundColor: bannerTone.bg, borderColor: bannerTone.bd }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
                  <Ionicons name={banner.icon || bannerTone.icon} size={20} color={bannerTone.ic} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.bannerText, { color: bannerTone.fg }]}>{banner.msg}</Text>
                    {!!banner.actions?.length && (
                      <View style={styles.bannerActions}>
                        {banner.actions.map(a => (
                          <TouchableOpacity key={a.label} onPress={() => { haptic.light(); a.run(); }} disabled={loading}
                            style={[styles.bannerBtn, { backgroundColor: C.card, borderColor: bannerTone.bd }]} accessibilityRole="button" accessibilityLabel={a.label}>
                            {!!a.icon && <Ionicons name={a.icon} size={14} color={C.primary} />}
                            <Text style={styles.bannerAction}>{a.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </PopIn>
            )}

            <Animated.View key={`${tab}-${isReg ? step : 0}`} onLayout={(e) => { L.form = e.nativeEvent.layout.y; }}
              style={[styles.form, { opacity: formV, transform: [{ translateX: formX }] }]}>
              {isReg ? renderStep() : renderLogin()}

              <View style={styles.actions} onLayout={lay('submit')}>
                {isReg && step > 0 && (
                  <Press onPress={() => { if (!busy.current) setStepTo(step - 1); }} disabled={loading} scaleTo={0.92}
                    accessibilityRole="button" accessibilityLabel="الخطوة السابقة"
                    style={[styles.backBtn, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                    <Ionicons name="arrow-forward" size={22} color={C.text} />
                  </Press>
                )}
                <View style={{ flex: 1 }}>
                  <GradientButton title={primaryTitle} onPress={onPrimary} loading={loading} success={success} height={56}
                    accessibilityLabel={loading ? 'جارٍ الإرسال' : primaryTitle}
                    icon={<Ionicons name={primaryIcon} size={20} color="#FFF" />} textStyle={{ fontSize: 17 }} />
                  {success && <Burst run count={18} radius={110} style={{ left: '50%', top: 28 }} />}
                </View>
              </View>

              {(!isReg || step === 2) && (
                <Text style={styles.legal}>
                  {isReg ? 'بإنشاء حسابك أنت توافق على ' : 'بالمتابعة أنت توافق على '}
                  <Text style={styles.legalLink} onPress={openPrivacy} accessibilityRole="link">سياسة الخصوصية وشروط الاستخدام</Text>
                </Text>
              )}

              <Text style={styles.switchHint}>
                {!isReg ? 'ما عندك حساب؟ ' : 'عندك حساب؟ '}
                <Text style={styles.switchLink} onPress={() => switchTab(!isReg ? 'register' : 'login')} accessibilityRole="link">
                  {!isReg ? 'أنشئ حساب جديد' : 'سجّل الدخول'}
                </Text>
              </Text>
            </Animated.View>
          </FadeIn>
        </View>

        {!kbOpen && (
          <FadeIn delay={260} style={styles.trust}>
            {[['shield-checkmark', 'بياناتك بأمان'], ['flash', 'توصيل سريع'], ['headset', 'دعم مباشر']].map(([ic, t]) => (
              <View key={t} style={styles.trustItem}>
                <View style={[styles.trustIcon, { backgroundColor: C.tint }]}><Ionicons name={ic} size={16} color={C.primary} /></View>
                <Text style={styles.trustTxt}>{t}</Text>
              </View>
            ))}
          </FadeIn>
        )}
        <View style={{ height: insets.bottom + (kbOpen ? 12 : 24) }} />
      </Animated.ScrollView>

      {/* ── نسيت كلمة السر ── */}
      <BottomSheet visible={forgotOpen} onClose={() => setForgotOpen(false)} title="نسيت كلمة السر؟">
        <View style={styles.sheetBody}>
          <View style={styles.sheetArt}>
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sheetIcon}>
              <Ionicons name="key" size={30} color="#FFF" />
            </LinearGradient>
          </View>
          <Text style={styles.sheetTxt}>
            لحماية حسابك، استرجاع كلمة السر بيتم عن طريق فريق دعم وصلّي. راسلنا من رقمك المسجّل وبنساعدك خلال دقائق.
          </Text>
          <Press onPress={() => { setForgotOpen(false); openWhatsApp(); }} accessibilityRole="button" accessibilityLabel="مراسلة الدعم عبر واتساب"
            style={[styles.sheetBtn, { backgroundColor: '#25D366' }]}>
            <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
            <Text style={styles.sheetBtnTxt}>راسلنا على واتساب</Text>
          </Press>
          <Press onPress={() => { setForgotOpen(false); Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}); }}
            accessibilityRole="button" accessibilityLabel={`اتصال بالدعم ${SUPPORT_PHONE}`}
            style={[styles.sheetBtn, { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border }]}>
            <Ionicons name="call" size={18} color={C.primary} />
            <Text style={[styles.sheetBtnTxt, { color: C.text }]}>اتصل بالدعم · {ltr(formatPhone(SUPPORT_PHONE))}</Text>
          </Press>
        </View>
      </BottomSheet>
    </KeyboardAvoidingView>
  );
}

const styles0 = StyleSheet.create({
  floater: { position: 'absolute' },
  meterWrap: { marginTop: 8, marginHorizontal: 4 },
  meterRow: { flexDirection: 'row-reverse', gap: 5 },
  meterBar: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  meterTxt: { fontSize: 12, fontWeight: '500', textAlign: 'right', marginTop: 5 },
});

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { flexGrow: 1, paddingBottom: 8 },
  hero: { alignItems: 'center', paddingBottom: 70, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflow: 'hidden' },
  logo: { width: 96, height: 96, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  appName: { fontSize: 38, fontWeight: '900', color: '#FFF', marginTop: 12, textAlign: 'center' },
  tagline: { fontSize: 14.5, color: 'rgba(255,255,255,0.92)', marginTop: 2, fontWeight: '500', textAlign: 'center' },
  card: { backgroundColor: C.card, marginHorizontal: 16, marginTop: -44, borderRadius: 30, padding: 20, paddingTop: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border, ...C.shadow.card },
  headRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, marginBottom: 16 },
  welcome: { fontSize: 21, fontWeight: '900', color: C.text, textAlign: 'right' },
  welcomeSub: { fontSize: 13.5, fontWeight: '500', color: C.gray, textAlign: 'right', marginTop: 3 },
  stepPill: { backgroundColor: C.tint, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, borderWidth: 1, borderColor: C.tintBorder },
  stepPillTxt: { color: C.primary, fontWeight: '900', fontSize: 12.5 },
  tabs: { flexDirection: 'row-reverse', backgroundColor: C.inputBg, borderRadius: 18, padding: 5, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14, minHeight: 44, justifyContent: 'center', overflow: 'hidden' },
  tabActive: { ...C.shadow.glow },
  tabText: { fontWeight: '800', color: C.gray, fontSize: 14 },
  tabTextActive: { color: '#FFF' },
  progTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 16, flexDirection: 'row-reverse' },
  progFill: { height: 5, borderRadius: 3, overflow: 'hidden' },
  form: { gap: 12 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  forgot: { alignSelf: 'flex-start', paddingVertical: 2, marginTop: -2 },
  forgotTxt: { color: C.primary, fontWeight: '800', fontSize: 13 },
  summary: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  summaryIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryName: { color: C.text, fontWeight: '800', fontSize: 14, textAlign: 'right' },
  summarySub: { color: C.faint, fontWeight: '500', fontSize: 12, textAlign: 'right', marginTop: 1 },
  summaryEdit: { color: C.primary, fontWeight: '800', fontSize: 12.5 },
  refToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingVertical: 4, minHeight: 32 },
  refToggleTxt: { color: C.primary, fontWeight: '800', fontSize: 13.5 },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginTop: 4 },
  backBtn: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  banner: { flexDirection: 'row-reverse', gap: 10, alignItems: 'flex-start', padding: 13, borderRadius: 16, marginBottom: 14, borderWidth: 1 },
  bannerText: { fontSize: 13.5, fontWeight: '500', lineHeight: 21, textAlign: 'right' },
  bannerActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  bannerBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, minHeight: 34 },
  bannerAction: { color: C.primary, fontWeight: '900', fontSize: 13 },
  legal: { textAlign: 'center', color: C.faint, fontSize: 12, lineHeight: 19, fontWeight: '500', marginTop: 2 },
  legalLink: { color: C.sub, fontWeight: '800', textDecorationLine: 'underline' },
  switchHint: { textAlign: 'center', color: C.sub, fontSize: 13.5, marginTop: 2, fontWeight: '500' },
  switchLink: { color: C.primary, fontWeight: '900' },
  trust: { flexDirection: 'row-reverse', justifyContent: 'center', gap: 22, marginTop: 22 },
  trustItem: { alignItems: 'center', gap: 6 },
  trustIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trustTxt: { fontSize: 11.5, fontWeight: '700', color: C.gray },
  sheetBody: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8, gap: 12 },
  sheetArt: { alignItems: 'center', marginBottom: 2 },
  sheetIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetTxt: { color: C.sub, fontSize: 14.5, lineHeight: 24, fontWeight: '500', textAlign: 'center', marginBottom: 4 },
  sheetBtn: { height: 54, borderRadius: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetBtnTxt: { color: '#FFF', fontWeight: '900', fontSize: 15.5 },
});
