// نافذة عرض الطلب بملء الشاشة — اهتزاز ورنّة متكرّرة حتى القبول/الرفض/انتهاء المهلة
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, ActivityIndicator, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS, SHADOW, RTL } from '../theme';
import OrderMoney from './OrderMoney';
import {
  orderTitle, orderIcon, orderNo, isPersonal, pickupPoint, pickupLabel, dropLabel,
  driverFee, tipOf, money, haversineKm, km, num,
} from '../utils/format';

function PulseRing({ children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulse, { transform: [{ scale }], opacity }]} />
      {children}
    </View>
  );
}

export default function OfferModal({ offer, remaining, onAccept, onReject, accepting, rejecting, coords }) {
  const insets = useSafeAreaInsets();
  const visible = !!offer;
  const o = offer?.order;
  const total = offer?.totalSec || 45;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const urgent = remaining <= 10;

  const pick = pickupPoint(o);
  const toPickup = coords ? haversineKm(coords.lat, coords.lng, pick.lat, pick.lng) : null;
  const tripKm = o?.distance_km != null && num(o.distance_km) > 0
    ? num(o.distance_km)
    : haversineKm(pick.lat, pick.lng, o?.delivery_lat, o?.delivery_lng);
  const busy = accepting || rejecting;
  const earn = o ? driverFee(o) + tipOf(o) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={() => {}}>
      <StatusBar barStyle="light-content" />
      {o ? (
        <View style={styles.root}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 18 }]}>
            <View style={styles.glow} />
            <PulseRing>
              <View style={styles.bell}><Ionicons name={orderIcon(o)} size={34} color={COLORS.primary} /></View>
            </PulseRing>
            <Text style={styles.heroTitle}>{isPersonal(o) ? 'طلب توصيل جديد!' : 'طلب جديد!'}</Text>
            <Text style={styles.heroSub}>{orderTitle(o)} · #{orderNo(o)}</Text>
            <View style={styles.earnPill}>
              <Text style={styles.earnLabel}>أرباحك</Text>
              <Text style={styles.earnValue}>{money(earn)}</Text>
            </View>
            <View style={styles.timerTrack}>
              <View style={[styles.timerFill, { width: `${pct * 100}%`, backgroundColor: urgent ? '#FFE14D' : '#FFF' }]} />
            </View>
            <Text style={styles.timerText}>{remaining > 0 ? `ينتهي العرض خلال ${remaining} ثانية` : 'انتهت المهلة'}</Text>
          </LinearGradient>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* المسار */}
            <View style={[styles.card, SHADOW.soft]}>
              <View style={styles.routeRow}>
                <View style={[styles.dot, { backgroundColor: COLORS.green }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routeLabel, RTL.text]}>{pickupLabel(o)}{toPickup != null ? ` · ${km(toPickup)} منك` : ''}</Text>
                  <Text style={[styles.routeValue, RTL.text]} numberOfLines={2}>
                    {isPersonal(o) ? (o.pickup_address || 'محدّدة على الخريطة') : (o.restaurant_name || 'المطعم')}
                  </Text>
                </View>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routeRow}>
                <View style={[styles.dot, { backgroundColor: COLORS.red }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routeLabel, RTL.text]}>{dropLabel(o)}{tripKm != null ? ` · ${km(tripKm)} رحلة` : ''}</Text>
                  <Text style={[styles.routeValue, RTL.text]} numberOfLines={2}>{o.delivery_address || 'محدّد على الخريطة'}</Text>
                </View>
              </View>
              {isPersonal(o) && o.service_type === 'ride' && (
                <Text style={[styles.extra, RTL.text]}>👥 عدد الركاب: {o.passengers || 1}</Text>
              )}
              {isPersonal(o) && o.service_type !== 'ride' && !!o.parcel_desc && (
                <Text style={[styles.extra, RTL.text]}>📦 {o.parcel_desc}</Text>
              )}
            </View>

            <OrderMoney order={o} maxItems={4} />
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <TouchableOpacity style={[styles.rejectBtn, busy && { opacity: 0.6 }]} onPress={onReject} disabled={busy} activeOpacity={0.85}>
              {rejecting ? <ActivityIndicator color={COLORS.red} /> : <Text style={styles.rejectText}>رفض</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.acceptWrap, busy && { opacity: 0.75 }]} onPress={onAccept} disabled={busy} activeOpacity={0.9}>
              <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.acceptBtn}>
                {accepting ? <ActivityIndicator color="#FFF" /> : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                    <Text style={styles.acceptText}>قبول الطلب</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      ) : <View style={styles.root} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  hero: { alignItems: 'center', paddingBottom: 22, paddingHorizontal: 20, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden', ...SHADOW.float },
  glow: { position: 'absolute', top: -80, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(255,255,255,0.10)' },
  pulseWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  pulse: { position: 'absolute', width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.6)' },
  bell: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  heroTitle: { color: '#FFF', fontSize: 28, fontWeight: '900' },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  earnPill: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8, marginTop: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  earnLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 },
  earnValue: { color: '#FFF', fontWeight: '900', fontSize: 24 },
  timerTrack: { width: '100%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 16, overflow: 'hidden', flexDirection: 'row-reverse' },
  timerFill: { height: '100%', borderRadius: 4 },
  timerText: { color: '#FFF', fontWeight: '800', fontSize: 13, marginTop: 8 },
  body: { padding: 16, paddingBottom: 24 },
  card: { backgroundColor: COLORS.card, borderRadius: 20, padding: 16, marginBottom: 12 },
  routeRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, borderWidth: 2, borderColor: '#FFF', ...SHADOW.soft },
  routeLine: { width: 2, height: 18, backgroundColor: COLORS.line, marginRight: 5, marginVertical: 3, alignSelf: 'flex-end' },
  routeLabel: { fontSize: 11.5, color: COLORS.gray, fontWeight: '700' },
  routeValue: { fontSize: 14.5, color: COLORS.text, fontWeight: '800', marginTop: 2 },
  extra: { marginTop: 10, fontSize: 13, color: COLORS.sub, fontWeight: '700' },
  footer: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  acceptWrap: { flex: 2, borderRadius: 18, overflow: 'hidden', ...SHADOW.green },
  acceptBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18, borderRadius: 18 },
  acceptText: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  rejectBtn: { flex: 1, borderRadius: 18, backgroundColor: COLORS.redSoft, alignItems: 'center', justifyContent: 'center', paddingVertical: 18 },
  rejectText: { color: COLORS.red, fontWeight: '900', fontSize: 16 },
});
