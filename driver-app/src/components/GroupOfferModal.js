// 🧺 نافذة عرض "طلب مجمّع" (عدة مطاعم — سائق واحد) بملء الشاشة
// نفس لغة نافذة العرض العادية: عدّاد دائري، أرباح كبيرة، مسار المحطات بالترتيب المقترح، قبول/رفض
// (المنطق والتوقيت في DriverContext — يُحدَّث العرض في مكانه إن أُعيد إرساله لنفس المجموعة)
import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Animated, Easing, StatusBar, I18nManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS, SHADOW, RTL, RADIUS } from '../theme';
import { ProgressRing, RadarRings, Press, LoadingDots, FadeIn, PopIn, haptic, useReducedMotion } from './Anim';
import { Shimmer, Fact } from './OfferModal';
import { money, km, num, TERMS } from '../utils/format';
import { arCount } from '../utils/plural';
import { groupNo, groupEarning, routeLegs, routeOrder } from '../utils/group';

const RING = 120;
// التخطيط الأصلي مثبّت LTR (App.js) فنقلب الصفوف صراحةً؛ إن فُعّل RTL الأصلي يوماً يبقى الاتجاه صحيحاً
const ROW = I18nManager.isRTL ? 'row' : 'row-reverse';

export default function GroupOfferModal({ offer, remaining, onAccept, onReject, accepting, rejecting, coords }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const visible = !!offer;
  const g = offer?.order;
  const total = offer?.totalSec || 45;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const urgent = remaining <= 10;

  const progress = useRef(new Animated.Value(1)).current;
  const lastId = useRef(null);
  useEffect(() => {
    if (!g) return;
    if (lastId.current !== g.id) { lastId.current = g.id; progress.setValue(pct); return; }
    if (reduced) { progress.setValue(pct); return; }
    Animated.timing(progress, { toValue: pct, duration: 520, easing: Easing.linear, useNativeDriver: true }).start();
  }, [pct, g, progress, reduced]);

  const beat = useRef(new Animated.Value(0)).current;
  const warned = useRef(null);
  useEffect(() => {
    if (!g || !urgent || remaining <= 0) return;
    if (warned.current !== g.id) { warned.current = g.id; haptic.warn(); }
    if (reduced) return;
    beat.setValue(1);
    Animated.spring(beat, { toValue: 0, useNativeDriver: true, damping: 10, stiffness: 240 }).start();
  }, [remaining, urgent, g, beat, reduced]);
  const beatScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });

  // ومضة "تم تحديث العرض" عند إعادة الإرسال/تحديث المجموعة
  const flash = useRef(new Animated.Value(0)).current;
  const updatedAt = offer?.updatedAt;
  useEffect(() => {
    if (!updatedAt) return;
    haptic.medium && haptic.medium();
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 2600, delay: 900, useNativeDriver: true }).start();
  }, [updatedAt, flash]);

  // D-18: نفس ترتيب المسار الذي سيحسبه السيرفر عند القبول (أقرب جار من موقعك)
  const stops = routeOrder(g?.stops || [], coords);
  const n = stops.length || g?.stops_total || 0;
  const { legs, toDrop, total: tripKm } = routeLegs(g ? { ...g, stops } : g, coords);
  const busy = accepting || rejecting;
  const earn = groupEarning(g);
  const cash = num(g?.cash_to_collect);
  const tip = num(g?.tip);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={() => {}}>
      <StatusBar barStyle="light-content" />
      {g ? (
        <View style={styles.root}>
          <LinearGradient colors={GRADIENTS.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 12 }]}>
            <View style={styles.orbA} />
            <View style={styles.orbB} />
            <LinearGradient colors={GRADIENTS.sheen} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.sheen} pointerEvents="none" />

            <View style={[styles.row, styles.topRow]}>
              <View style={[styles.row, styles.newChip]}>
                <Ionicons name="layers" size={14} color={COLORS.primary} />
                <Text style={styles.newChipText}>طلب مجمّع • {arCount(n, 'restaurant')}</Text>
              </View>
              <Text style={styles.orderNo} numberOfLines={1}>#{groupNo(g)}</Text>
            </View>

            <PopIn style={{ alignItems: 'center' }}>
              <RadarRings size={RING + 28} color={urgent ? 'rgba(255,225,77,0.5)' : 'rgba(255,255,255,0.4)'} active={remaining > 0} duration={urgent ? 1400 : 2400}>
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

            <FadeIn delay={120} from={10} style={{ alignItems: 'center' }}>
              <Text style={styles.earnLabel}>أرباحك من هذا الطلب المجمّع</Text>
              <Text style={styles.earnValue} numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`أرباحك ${money(earn)}`}>{money(earn)}</Text>
              {tip > 0 && (
                <View style={[styles.row, styles.tipChip]}>
                  <Ionicons name="heart" size={12} color="#FFF" />
                  <Text style={styles.tipText}>يشمل {TERMS.tip} {money(tip)}</Text>
                </View>
              )}
            </FadeIn>

            <FadeIn delay={200} from={10}>
              <View style={[styles.row, styles.facts]}>
                <Fact icon="storefront" label="محطات الاستلام" value={String(n)} />
                <View style={styles.factSep} />
                <Fact icon="git-commit-outline" label="مسافة المسار" value={tripKm != null ? km(tripKm) : '—'} />
                <View style={styles.factSep} />
                <Fact icon={cash > 0 ? 'cash-outline' : 'shield-checkmark-outline'} label={cash > 0 ? 'تحصيل نقدي' : 'مدفوع'} value={cash > 0 ? money(cash) : 'لا تحصيل'} />
              </View>
            </FadeIn>
          </LinearGradient>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {!!updatedAt && (
              <Animated.View style={[styles.row, styles.updated, { opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }) }]}>
                <Ionicons name="refresh-circle" size={18} color={COLORS.blue} />
                <Text style={[styles.updatedText, RTL.text]}>{offer?.updatedNote || 'تم تحديث تفاصيل العرض'}</Text>
              </Animated.View>
            )}

            {/* المسار المقترح */}
            <FadeIn delay={260}>
              <View style={[styles.card, SHADOW.card]}>
                <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
                  <Text style={styles.cardTitle}>المسار المقترح</Text>
                  <View style={[styles.row, styles.oneDriver]}>
                    <Ionicons name="bicycle" size={13} color={COLORS.primary} />
                    <Text style={styles.oneDriverText}>سائق واحد</Text>
                  </View>
                </View>
                {stops.map((s, i) => (
                  <View key={String(s.order_id)} style={[styles.row, styles.routeRow]}>
                    <View style={styles.markerCol}>
                      <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.marker}>
                        <Text style={styles.markerNum}>{i + 1}</Text>
                      </LinearGradient>
                      <View style={styles.routeLine}>
                        {[0, 1, 2].map(k => <View key={k} style={styles.routeDash} />)}
                      </View>
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <Text style={[styles.routeLabel, RTL.text]}>
                        {i === 0 ? 'أول محطة' : `المحطة ${i + 1}`}
                        {legs[i] != null ? ` · ${km(legs[i])} ${i === 0 ? 'منك' : 'من السابقة'}` : ''}
                      </Text>
                      <Text style={[styles.routeValue, RTL.text]} numberOfLines={1}>{s.name || 'المطعم'}</Text>
                    </View>
                  </View>
                ))}
                <View style={[styles.row, styles.routeRow]}>
                  <View style={styles.markerCol}>
                    <View style={[styles.marker, { backgroundColor: COLORS.red }]}><Ionicons name="location" size={14} color="#FFF" /></View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeLabel, RTL.text]}>التسليم للزبون{toDrop != null ? ` · ${km(toDrop)} من آخر مطعم` : ''}</Text>
                    <Text style={[styles.routeValue, RTL.text]} numberOfLines={2}>{g.dropoff?.address || 'محدّد على الخريطة'}</Text>
                  </View>
                </View>
              </View>
            </FadeIn>

            {/* المال */}
            <FadeIn delay={320}>
              <View style={[styles.card, SHADOW.soft]}>
                <MoneyRow icon="bicycle-outline" label={`أجرة التوصيل (${arCount(n, 'stop')})`} value={money(g.driver_fee)} />
                {tip > 0 && <MoneyRow icon="heart-outline" label={TERMS.tip} value={money(tip)} color={COLORS.brandDeep} />}
                <MoneyRow icon="wallet-outline" label="أرباحك" value={money(earn)} color={COLORS.greenDeep} strong last={cash <= 0} />
                {cash > 0 && <MoneyRow icon="cash-outline" label="تحصّله من الزبون (إجمالي الطلب)" value={money(cash)} color={COLORS.amberDeep} strong last />}
              </View>
            </FadeIn>

            <FadeIn delay={380}>
              <View style={[styles.row, styles.note]}>
                <Ionicons name="information-circle" size={18} color={COLORS.sub} />
                <Text style={[styles.noteText, RTL.text]}>تستلم من كل مطعم طلبه (أي ترتيب حسب الجاهزية)، ثم تسلّم الكل للزبون دفعة واحدة.</Text>
              </View>
            </FadeIn>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <Press onPress={() => { haptic.warn(); onReject && onReject(); }} hapticStyle={null} disabled={busy}
              style={[styles.rejectBtn, busy && !rejecting && { opacity: 0.5 }]} accessibilityLabel="رفض الطلب المجمّع">
              {rejecting ? <LoadingDots color={COLORS.red} /> : (
                <>
                  <Ionicons name="close" size={22} color={COLORS.red} />
                  <Text style={styles.rejectText}>رفض</Text>
                </>
              )}
            </Press>
            <Press onPress={onAccept} hapticStyle="heavy" disabled={busy} scaleTo={0.97}
              style={[styles.acceptWrap, SHADOW.green, busy && !accepting && { opacity: 0.6 }]} accessibilityLabel={`قبول الطلب المجمّع، أرباحك ${money(earn)}`}>
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

function MoneyRow({ icon, label, value, color, strong, last }) {
  return (
    <View style={[styles.row, styles.mRow, !last && styles.mLine]}>
      <View style={[styles.row, { gap: 10, flex: 1 }]}>
        <View style={styles.mIcon}><Ionicons name={icon} size={15} color={color || COLORS.sub} /></View>
        <Text style={[styles.mLabel, RTL.text]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.mValue, color && { color }, strong && { fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: ROW, alignItems: 'center' },
  root: { flex: 1, backgroundColor: COLORS.bg },
  hero: { alignItems: 'stretch', paddingBottom: 18, paddingHorizontal: 18, borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#FF5E3A', ...SHADOW.float },
  orbA: { position: 'absolute', top: -90, left: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbB: { position: 'absolute', bottom: -70, right: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.07)' },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  topRow: { justifyContent: 'space-between', gap: 10 },
  newChip: { gap: 6, backgroundColor: '#FFF', borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 },
  newChipText: { color: COLORS.primary, fontWeight: '900', fontSize: 13 },
  orderNo: { flex: 1, color: 'rgba(255,255,255,0.92)', fontWeight: '700', fontSize: 13, textAlign: 'left' },
  ringInner: { alignItems: 'center', justifyContent: 'center' },
  secs: { color: '#FFF', fontSize: 42, fontWeight: '900', lineHeight: 50 },
  secsLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700', marginTop: -4 },
  earnLabel: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13.5, marginTop: 2 },
  earnValue: { color: '#FFF', fontWeight: '900', fontSize: 40, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.12)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 10 },
  tipChip: { gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  tipText: { color: '#FFF', fontWeight: '700', fontSize: 11.5 },
  facts: { marginTop: 14, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', paddingVertical: 10 },
  factSep: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.25)' },
  body: { padding: 16, paddingBottom: 24 },
  updated: { gap: 8, backgroundColor: COLORS.blueSoft, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, borderWidth: 1, borderColor: '#CFE3FF' },
  updatedText: { flex: 1, color: COLORS.text, fontWeight: '800', fontSize: 13 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg - 4, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  oneDriver: { gap: 4, backgroundColor: COLORS.sec, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  oneDriverText: { color: COLORS.primary, fontWeight: '800', fontSize: 11.5 },
  routeRow: { alignItems: 'stretch', gap: 12 },
  markerCol: { width: 30, alignItems: 'center' },
  marker: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF', ...SHADOW.soft },
  markerNum: { color: '#FFF', fontWeight: '900', fontSize: 14 },
  routeLine: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 3, minHeight: 18 },
  routeDash: { width: 2.5, height: 5, borderRadius: 2, backgroundColor: COLORS.line },
  routeLabel: { fontSize: 12, color: COLORS.gray, fontWeight: '700', marginTop: 2 },
  routeValue: { fontSize: 15.5, color: COLORS.text, fontWeight: '800', marginTop: 2, lineHeight: 22 },
  mRow: { justifyContent: 'space-between', paddingVertical: 10, gap: 10 },
  mLine: { borderBottomWidth: 1, borderBottomColor: COLORS.line },
  mIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center' },
  mLabel: { flex: 1, fontSize: 13.5, color: COLORS.sub, fontWeight: '700' },
  mValue: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  note: { gap: 8, backgroundColor: COLORS.inputBg, borderRadius: RADIUS.sm, padding: 12, borderWidth: 1, borderColor: COLORS.line },
  noteText: { flex: 1, color: COLORS.sub, fontWeight: '700', fontSize: 12.5, lineHeight: 19 },
  footer: { flexDirection: ROW, gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.line },
  acceptWrap: { flex: 2.2, borderRadius: RADIUS.md + 2, backgroundColor: COLORS.green },
  acceptBtn: { height: 64, flexDirection: ROW, alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: RADIUS.md + 2, overflow: 'hidden' },
  acceptIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: '#FFF', fontWeight: '900', fontSize: 19 },
  rejectBtn: { flex: 1, height: 64, borderRadius: RADIUS.md + 2, backgroundColor: COLORS.redSoft, borderWidth: 1.5, borderColor: '#FBC9C4', alignItems: 'center', justifyContent: 'center', flexDirection: ROW, gap: 6 },
  rejectText: { color: COLORS.red, fontWeight: '900', fontSize: 17 },
});
