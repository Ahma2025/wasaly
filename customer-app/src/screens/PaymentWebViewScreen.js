import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, BackHandler, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { initCardPayment } from '../utils/payments';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { GradientButton, Ripple, PopIn } from '../components/Anim';

export default function PaymentWebViewScreen({ route, navigation }) {
  const { orderId } = route.params || {};
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const [session, setSession] = useState({ url: route.params?.authorizationUrl, reference: route.params?.reference, key: 0 });
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const handledRef = useRef(false);

  // الرجوع لشاشة التتبع: لو جايين منها نرجع لها، وإلا نستبدل صفحة الدفع بها
  const toTracking = useCallback(() => {
    const st = navigation.getState?.();
    const prev = st?.routes?.[st.index - 1];
    if (prev?.name === 'OrderTracking' && String(prev.params?.orderId) === String(orderId)) navigation.goBack();
    else navigation.replace('OrderTracking', { orderId, fromCheckout: true });
  }, [navigation, orderId]);

  const retry = async () => {
    setVerifying(true);
    try {
      const init = await initCardPayment(orderId);
      handledRef.current = false;
      setLoadError(false);
      setSession(s => ({ url: init.authorization_url, reference: init.reference, key: s.key + 1 }));
    } catch (e) {
      Alert.alert('تعذّر بدء الدفع', e?.message || 'حاول لاحقاً', [
        { text: 'الدفع كاش عند الاستلام', onPress: toTracking },
        { text: 'حاول مرة ثانية', onPress: retry },
      ]);
    } finally { setVerifying(false); }
  };

  const failed = (title, msg) => Alert.alert(title, msg, [
    { text: 'الدفع كاش عند الاستلام', onPress: toTracking },
    { text: 'ادفع مرة ثانية', onPress: retry },
  ], { cancelable: false });

  // نتحقّق من الدفع بعد ما ترجع Lahza لصفحة الـ callback
  const finish = async () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setVerifying(true);
    try {
      const res = await api.get(`/payments/lahza/verify/${session.reference}`);
      if (res.paid) {
        Alert.alert('تم الدفع ✅', 'تم تأكيد الدفع بنجاح، طلبك بالطريق للمطعم.', [{ text: 'تتبّع الطلب', onPress: toTracking }], { cancelable: false });
      } else {
        failed('لم يكتمل الدفع', 'ما تم تأكيد الدفع. طلبك محفوظ — تقدر تحاول مرة ثانية أو تدفع كاش عند الاستلام.');
      }
    } catch (e) {
      failed('تعذّر التحقّق من الدفع', 'طلبك محفوظ. تقدر تحاول الدفع مرة ثانية أو تدفع كاش عند الاستلام.');
    } finally {
      setVerifying(false);
    }
  };

  const onNav = (state) => {
    if (state.url && state.url.includes('/payments/lahza/callback')) finish();
  };

  const cancel = () => {
    Alert.alert('إلغاء الدفع', 'بدك توقف الدفع بالبطاقة؟ طلبك محفوظ وتقدر تدفع كاش عند الاستلام.', [
      { text: 'متابعة الدفع', style: 'cancel' },
      { text: 'إيقاف الدفع', style: 'destructive', onPress: toTracking },
    ]);
    return true;
  };

  // زر الرجوع بأندرويد = نفس زر الإغلاق (بدل الخروج من التطبيق)
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', cancel);
    return () => sub.remove();
  }, [toTracking]));

  return (
    <View style={styles.container}>
      <StatusBar barStyle={C.mode === 'dark' ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.accent, { top: 0 }]} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={cancel} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="إغلاق الدفع">
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.titleWrap}>
            <View style={styles.lockPill}><Ionicons name="lock-closed" size={12} color="#FFF" /></View>
            <Text style={styles.title}>دفع آمن</Text>
          </View>
          <Text style={styles.subtitle}>اتصال مشفّر · بياناتك ما بتنحفظ عنا</Text>
        </View>
        <View style={[styles.iconBtn, { backgroundColor: 'transparent' }]} />
      </View>

      {session.url && !loadError ? (
        <WebView
          key={session.key}
          source={{ uri: session.url }}
          onNavigationStateChange={onNav}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setLoadError(true); }}
          onHttpError={(e) => { if (e?.nativeEvent?.statusCode >= 500) { setLoading(false); setLoadError(true); } }}
          style={{ backgroundColor: C.bg }}
          startInLoadingState
          renderLoading={() => <View />}
        />
      ) : (
        <View style={styles.center}>
          <PopIn>
            <LinearGradient colors={C.gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.errIcon}>
              <Ionicons name="card" size={38} color="#FFF" />
            </LinearGradient>
          </PopIn>
          <Text style={styles.errTitle}>{session.url ? 'تعذّر فتح صفحة الدفع' : 'رابط الدفع غير متوفر'}</Text>
          <Text style={styles.errSub}>تأكد من الإنترنت وحاول مرة ثانية، أو ادفع كاش عند الاستلام.</Text>
          <GradientButton title="ادفع مرة ثانية" onPress={retry} loading={verifying} style={{ alignSelf: 'stretch', marginTop: 10 }} icon={<Ionicons name="refresh" size={18} color="#FFF" />} />
          <TouchableOpacity style={styles.secondaryBtn} onPress={toTracking} accessibilityRole="button"><Text style={styles.secondaryTxt}>الدفع كاش عند الاستلام</Text></TouchableOpacity>
        </View>
      )}

      {(loading || verifying) && !loadError && (
        <View style={[styles.overlay, { top: insets.top + 70 }]}>
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 90, height: 90 }}>
            <Ripple size={70} color={C.primary} />
            <LinearGradient colors={C.gradients.sunset} style={styles.overlayIcon}>
              <Ionicons name={verifying ? 'shield-checkmark' : 'lock-closed'} size={26} color="#FFF" />
            </LinearGradient>
          </View>
          <Text style={styles.overlayText}>{verifying ? 'جاري تأكيد الدفع…' : 'جاري التحميل…'}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: C.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, ...C.shadow.soft, zIndex: 2 },
  accent: { position: 'absolute', left: 0, right: 0, height: 3, zIndex: 3 },
  lockPill: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 11, color: C.faint, fontWeight: '500', marginTop: 2 },
  errIcon: { width: 84, height: 84, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  overlayIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.inputBg },
  titleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontWeight: '800', color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errTitle: { fontSize: 18, fontWeight: '900', color: C.text },
  errSub: { fontSize: 13.5, color: C.sub, textAlign: 'center', lineHeight: 21 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', marginTop: 10 },
  primaryTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  secondaryBtn: { borderRadius: 18, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center', backgroundColor: C.inputBg },
  secondaryTxt: { color: C.text, fontWeight: '800', fontSize: 15 },
  overlay: { ...StyleSheet.absoluteFillObject, top: 90, backgroundColor: C.mode === 'dark' ? 'rgba(11,11,18,0.92)' : 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { color: C.text, fontWeight: '700', fontSize: 15 },
});
