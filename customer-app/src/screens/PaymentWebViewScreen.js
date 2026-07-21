import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

const COLORS = { primary: '#FF6B00', text: '#1A1A2E', gray: '#8E8E93' };

export default function PaymentWebViewScreen({ route, navigation }) {
  const { authorizationUrl, reference, orderId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const handledRef = useRef(false);

  // نتحقّق من الدفع بعد ما ترجع Lahza لصفحة الـ callback
  const finish = async () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setVerifying(true);
    try {
      const res = await api.get(`/payments/lahza/verify/${reference}`);
      if (res.paid) {
        navigation.replace('OrderTracking', { orderId });
      } else {
        Alert.alert('لم يكتمل الدفع', 'لم يتم تأكيد الدفع. طلبك محفوظ ويمكنك الدفع عند الاستلام.', [
          { text: 'حسناً', onPress: () => navigation.replace('OrderTracking', { orderId }) },
        ]);
      }
    } catch (e) {
      Alert.alert('تعذّر التحقّق', 'طلبك محفوظ. يمكنك المتابعة والدفع عند الاستلام.', [
        { text: 'حسناً', onPress: () => navigation.replace('OrderTracking', { orderId }) },
      ]);
    } finally {
      setVerifying(false);
    }
  };

  const onNav = (state) => {
    if (state.url && state.url.includes('/payments/lahza/callback')) {
      finish();
    }
  };

  const cancel = () => {
    Alert.alert('إلغاء الدفع', 'هل تريد إلغاء الدفع بالبطاقة؟', [
      { text: 'متابعة الدفع', style: 'cancel' },
      { text: 'إلغاء', style: 'destructive', onPress: () => navigation.replace('OrderTracking', { orderId }) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={cancel} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Ionicons name="lock-closed" size={14} color="#34C759" />
          <Text style={styles.title}>دفع آمن</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      {authorizationUrl ? (
        <WebView
          source={{ uri: authorizationUrl }}
          onNavigationStateChange={onNav}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          startInLoadingState
        />
      ) : (
        <View style={styles.center}><Text style={{ color: COLORS.gray }}>رابط الدفع غير متوفر</Text></View>
      )}

      {(loading || verifying) && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.overlayText}>{verifying ? 'جاري تأكيد الدفع…' : 'جاري التحميل…'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F3' },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  overlayText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
});
