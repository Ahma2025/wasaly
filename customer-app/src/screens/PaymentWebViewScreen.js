import React, { useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert, BackHandler, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../utils/api';
import { initCardPayment } from '../utils/payments';
import { useTheme } from '../context/ThemeContext';

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
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={cancel} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="إغلاق الدفع">
          <Ionicons name="close" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>دفع آمن</Text>
          <Ionicons name="lock-closed" size={14} color={C.green} />
        </View>
        <View style={styles.iconBtn} />
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
          <Text style={{ fontSize: 46 }}>💳</Text>
          <Text style={styles.errTitle}>{session.url ? 'تعذّر فتح صفحة الدفع' : 'رابط الدفع غير متوفر'}</Text>
          <Text style={styles.errSub}>تأكد من الإنترنت وحاول مرة ثانية، أو ادفع كاش عند الاستلام.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={retry}><Text style={styles.primaryTxt}>ادفع مرة ثانية</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={toTracking}><Text style={styles.secondaryTxt}>الدفع كاش عند الاستلام</Text></TouchableOpacity>
        </View>
      )}

      {(loading || verifying) && !loadError && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.overlayText}>{verifying ? 'جاري تأكيد الدفع…' : 'جاري التحميل…'}</Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontWeight: '800', color: C.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errTitle: { fontSize: 18, fontWeight: '900', color: C.text },
  errSub: { fontSize: 13.5, color: C.sub, textAlign: 'center', lineHeight: 21 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', marginTop: 10 },
  primaryTxt: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center', backgroundColor: C.inputBg },
  secondaryTxt: { color: C.text, fontWeight: '800', fontSize: 15 },
  overlay: { ...StyleSheet.absoluteFillObject, top: 90, backgroundColor: C.mode === 'dark' ? 'rgba(11,11,18,0.92)' : 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { color: C.text, fontWeight: '700', fontSize: 15 },
});
