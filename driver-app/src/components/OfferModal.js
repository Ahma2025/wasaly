// نافذة عرض الطلب بملء الشاشة — اهتزاز ورنّة متكرّرة حتى القبول/الرفض/انتهاء المهلة
// (المنطق والتوقيت في DriverContext — هنا العرض والحركة فقط)
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Animated, Easing, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import OrderMoney from './OrderMoney';
import { ProgressRing, RadarRings, Press, LoadingDots, FadeIn, PopIn, haptic, useReducedMotion } from './Anim';
import {
  orderTitle, orderIcon, orderNo, isPersonal, pickupPoint, pickupLabel, dropLabel,
  driverFee, tipOf, money, haversineKm, km, num, cashToCollect, TERMS,
} from '../utils/format';
import { arCount } from '../utils/plural';

const RING = 132;

// لمعة تمرّ على زر القبول لجذب الانتباه
export function Shimmer({ active }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduced) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, reduced, v]);
  if (!active || reduced) return null;
  const translateX = v.interpolate({ inputRange: [0, 1], outputRange: [-160, 420] });
  return (
    <Animated.View pointerEvents="none" style={[styles.shimmer, { transform: [{ translateX }, { skewX: '-20deg' }] }]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

export function Fact({ icon, label, value }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={16} color="#FFF" />
      <Text style={styles.factValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.factLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function OfferModal({ offer, remaining, onAccept, onReject, accepting, rejecting, coords }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visible = !!offer;
  const o = offer?.order;
  const total = offer?.totalSec || 45;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const urgent = remaining <= 10;

  // حلقة العدّ التنازلي: تتحرّك بنعومة بين تحديثات المؤقّت (كل ٥٠٠ms)
  const progress = useRef(new Animated.Value(1)).current;
  const lastId = useRef(null);
  useEffect(() => {
    if (!o) return;
    if (lastId.current !== o.id) { lastId.current = o.id; progress.setValue(pct); return; }
    if (reduced) { progress.setValue(pct); return; }
    Animated.timing(progress, { toValue: pct, duration: 520, easing: Easing.linear, useNativeDriver: true }).start();
  }, [pct, o, progress, reduced]);

  // نبضة الثواني عند الاستعجال + اهتزاز خفيف عند دخول آخر ١٠ ثوانٍ
  const beat = useRef(new Animated.Value(0)).current;
  const warned = useRef(null);
  useEffect(() => {
    if (!o || !urgent || remaining <= 0) return;
    if (warned.current !== o.id) { warned.current = o.id; haptic.warn(); }
    if (reduced) return;
    beat.setValue(1);
    Animated.spring(beat, { toValue: 0, useNativeDriver: true, damping: 10, stiffness: 240 }).start();
  }, [remaining, urgent, o, beat, reduced]);
  const beatScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  const pick = pickupPoint(o);
  const toPickup = coords ? haversineKm(coords.lat, coords.lng, pick.lat, pick.lng) : null;
  const tripKm = o?.distance_km != null && num(o.distance_km) > 0
    ? num(o.distance_km)
    : haversineKm(pick.lat, pick.lng, o?.delivery_lat, o?.delivery_lng);
  const busy = accepting || rejecting;
  const earn = o ? driverFee(o) + tipOf(o) : 0;
  const cash = o ? cashToCollect(o) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={() => {}}>
      <StatusBar barStyle="light-content" />
      {o ? (
        <View style={styles.root}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
            <View style={styles.orbA} />
            <View style={styles.orbB} />
            <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />

            <View style={[RTL.row, styles.topRow]}>
              <View style={styles.newChip}>
                <Ionicons name={orderIcon(o)} size={14} color={COLORS.primary} />
                <Text style={styles.newChipText}>{isPersonal(o) ? 'طلب توصيل جديد' : 'طلب جديد'}</Text>
              </View>
              <Text style={styles.orderNo} numberOfLines={1}>{orderTitle(o)} · #{orderNo(o)}</Text>
            </View>

            {/* العدّاد الدائري */}
            <PopIn style={{ alignItems: 'center' }}>
              <RadarRings size={RING + 30} color={urgent ? 'rgba(255,225,77,0.5)' : 'rgba(255,255,255,0.4)'} active={remaining > 0} duration={urgent ? 1400 : 2400}>
                <ProgressRing progress={progress} size={RING} stroke={9} color={urgent ? '#FFE14D' : '#FFF'} track="rgba(255,255,255,0.22)">
                  <View style={styles.ringInner}>
                    <Animated.Text style={[styles.secs, urgent && { color: '#FFE14D' }, { transform: [{ scale: beatScale }] }]}
                      accessibilityLabel={`متبقي ${arCount(remaining, 'second')}`}>
                      {Math.max(0, remaining)}
                    </Animated.Text>
                    <Text style={styles.secsLabel}>{remaining > 0 ? 'ثانية' : 'انتهت'}</Text>
                  </View>
                </ProgressRing>
              </RadarRings>
            </PopIn>

            {/* المال */}
            <FadeIn delay={120} from={10} style={{ alignItems: 'center' }}>
              <Text style={styles.earnLabel}>أرباحك من هذا الطلب</Text>
              <Text style={styles.earnValue} numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`أرباحك ${money(earn)}`}>{money(earn)}</Text>
              {tipOf(o) > 0 && (
                <View style={styles.tipChip}>
                  <Ionicons name="heart" size={12} color="#FFF" />
                  <Text style={styles.tipText}>يشمل {TERMS.tip} {money(tipOf(o))}</Text>
                </View>
              )}
            </FadeIn>

            <FadeIn delay={200} from={10}>
              <View style={[RTL.row, styles.facts]}>
                <Fact icon="navigate" label="إلى الاستلام" value={toPickup != null ? km(toPickup) : '—'} />
                <View style={styles.factSep} />
                <Fact icon="git-commit-outline" label="مسافة الرحلة" value={tripKm != null ? km(tripKm) : '—'} />
                <View style={styles.factSep} />
                <Fact icon={cash > 0 ? 'cash-outline' : 'shield-checkmark-outline'} label={cash > 0 ? 'تحصيل نقدي' : 'مدفوع'} value={cash > 0 ? money(cash) : 'لا تحصيل'} />
              </View>
            </FadeIn>
          </LinearGradient>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* المسار */}
            <FadeIn delay={260}>
              <View style={[styles.card, SHADOW.card]}>
                <View style={[styles.routeRow, { alignItems: 'stretch' }]}>
                  <View style={styles.markerCol}>
                    <View style={[styles.marker, { backgroundColor: COLORS.green }]}><Ionicons name={isPersonal(o) ? 'flag' : 'restaurant'} size={13} color="#FFF" /></View>
                    <View style={styles.routeLine}>
                      {[0, 1, 2, 3].map(i => <View key={i} style={styles.routeDash} />)}
                    </View>
                  </View>
                  <View style={{ flex: 1, paddingBottom: 16 }}>
                    <Text style={[styles.routeLabel, RTL.text]}>{pickupLabel(o)}{toPickup != null ? ` · ${km(toPickup)} منك` : ''}</Text>
                    <Text style={[styles.routeValue, RTL.text]} numberOfLines={2}>
                      {isPersonal(o) ? (o.pickup_address || 'محدّدة على الخريطة') : (o.restaurant_name || 'المطعم')}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeRow}>
                  <View style={styles.markerCol}>
                    <View style={[styles.marker, { backgroundColor: COLORS.red }]}><Ionicons name="location" size={13} color="#FFF" /></View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeLabel, RTL.text]}>{dropLabel(o)}{tripKm != null ? ` · ${km(tripKm)} رحلة` : ''}</Text>
                    <Text style={[styles.routeValue, RTL.text]} numberOfLines={2}>{o.delivery_address || 'محدّد على الخريطة'}</Text>
                  </View>
                </View>
                {isPersonal(o) && o.service_type === 'ride' && (
                  <View style={[RTL.row, styles.extra]}>
                    <Ionicons name="people" size={16} color={COLORS.sub} />
                    <Text style={[styles.extraText, RTL.text]}>عدد الركاب: {o.passengers || 1}</Text>
                  </View>
                )}
                {isPersonal(o) && o.service_type !== 'ride' && !!o.parcel_desc && (
                  <View style={[RTL.row, styles.extra]}>
                    <Ionicons name="cube" size={16} color={COLORS.sub} />
                    <Text style={[styles.extraText, RTL.text]}>{o.parcel_desc}</Text>
                  </View>
                )}
              </View>
            </FadeIn>

            <FadeIn delay={320}>
              <OrderMoney order={o} maxItems={4} />
            </FadeIn>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <Press onPress={() => { haptic.warn(); onReject && onReject(); }} hapticStyle={null} disabled={busy}
              style={[styles.rejectBtn, busy && !rejecting && { opacity: 0.5 }]} accessibilityLabel="رفض الطلب">
              {rejecting ? <LoadingDots color={COLORS.red} /> : (
                <>
                  <Ionicons name="close" size={22} color={COLORS.red} />
                  <Text style={styles.rejectText}>رفض</Text>
                </>
              )}
            </Press>
            <Press onPress={onAccept} hapticStyle="heavy" disabled={busy} scaleTo={0.97}
              style={[styles.acceptWrap, SHADOW.green, busy && !accepting && { opacity: 0.6 }]} accessibilityLabel={`قبول الطلب، أرباحك ${money(earn)}`}>
              <LinearGradient colors={GRADIENTS.green} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={styles.acceptBtn}>
                <Shimmer active={!busy && remaining > 0} />
                {accepting ? <LoadingDots /> : (
                  <>
                    <View style={styles.acceptIcon}><Ionicons name="checkmark" size={22} color={COLORS.green} /></View>
                    <Text style={styles.acceptText}>قبول الطلب</Text>
                  </>
                )}
              </LinearGradient>
            </Press>
          </View>
        </View>
      ) : <View style={styles.root} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  hero: { alignItems: 'stretch', paddingBottom: 18, paddingHorizontal: 18, borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#FF5E3A', ...SHADOW.float },
  orbA: { position: 'absolute', top: -90, left: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbB: { position: 'absolute', bottom: -70, right: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.07)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  topRow: { justifyContent: 'space-between', gap: 10 },
  newChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 },
  newChipText: { color: COLORS.primary, fontWeight: '900', fontSize: 13 },
  orderNo: { flex: 1, color: 'rgba(255,255,255,0.92)', fontWeight: '700', fontSize: 13, textAlign: 'left' },
  ringInner: { alignItems: 'center', justifyContent: 'center' },
  secs: { color: '#FFF', fontSize: 46, fontWeight: '900', lineHeight: 54 },
  secsLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', marginTop: -4 },
  earnLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13.5, marginTop: 2 },
  earnValue: { color: '#FFF', fontWeight: '900', fontSize: 42, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10 },
  tipChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  tipText: { color: '#FFF', fontWeight: '700', fontSize: 11.5 },
  facts: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', paddingVertical: 10 },
  fact: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  factSep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)' },
  factValue: { color: '#FFF', fontWeight: '900', fontSize: 15 },
  factLabel: { color: 'rgba(255,255,255,0.85)', fontWeight: '500', fontSize: 11 },
  body: { padding: 16, paddingBottom: 24 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 16, marginBottom: 12 },
  routeRow: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  markerCol: { width: 28, alignItems: 'center' },
  marker: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF', ...SHADOW.soft },
  routeLine: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 4, minHeight: 26 },
  routeDash: { width: 2.5, height: 5, borderRadius: 2, backgroundColor: COLORS.line },
  routeLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '700' },
  routeValue: { fontSize: 15.5, color: COLORS.text, fontWeight: '800', marginTop: 2, lineHeight: 22 },
  extra: { gap: 8, marginTop: 12, backgroundColor: COLORS.inputBg, borderRadius: RADIUS.sm, padding: 10 },
  extraText: { flex: 1, fontSize: 13.5, color: COLORS.sub, fontWeight: '700' },
  footer: { flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  acceptWrap: { flex: 2.2, borderRadius: RADIUS.md + 2, backgroundColor: COLORS.green },
  acceptBtn: { height: 64, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: RADIUS.md + 2, overflow: 'hidden' },
  acceptIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: '#FFF', fontWeight: '900', fontSize: 19 },
  shimmer: { position: 'absolute', top: -10, bottom: -10, left: 0, width: 90 },
  rejectBtn: { flex: 1, height: 64, borderRadius: RADIUS.md + 2, backgroundColor: COLORS.redSoft, borderWidth: 1.5, borderColor: '#FBC9C4', alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 6 },
  rejectText: { color: COLORS.red, fontWeight: '900', fontSize: 17 },
});
